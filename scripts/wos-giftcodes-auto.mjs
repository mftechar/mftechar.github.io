#!/usr/bin/env node
/**
 * WoS Gift Codes — automatización para GitHub Actions
 *
 * Corre 6 veces al día (cron del workflow) y:
 *   1. Busca los códigos activos en wosgiftcodes.com (RSS + tabla).
 *   2. Actualiza gamers/wos/data/giftcodes.json (lo lee la página, sin servidor).
 *   3. Si gamers/wos/giftcodes.config.json tiene enabled + region + ids,
 *      canjea automáticamente los códigos nuevos para todos esos IDs.
 *   4. Guarda el progreso en gamers/wos/data/auto-state.json.
 *
 * No necesita claves ni secretos. Los IDs del config quedan visibles en el
 * repositorio: usá un repo privado si no querés publicarlos.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(process.cwd());
const CONFIG_PATH = path.join(ROOT, 'gamers/wos/giftcodes.config.json');
const DATA_DIR = path.join(ROOT, 'gamers/wos/data');
const CODES_PATH = path.join(DATA_DIR, 'giftcodes.json');
const STATE_PATH = path.join(DATA_DIR, 'auto-state.json');

const API_URL = 'https://wos-giftcode-api.centurygame.com/api/gift_code';
const API_ORIGIN = 'https://wos-giftcode.centurygame.com';
const SIGN_SALT = 'tB87#kPtkxqOS2';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const CODES_FEED = 'https://wosgiftcodes.com/rss.php';
const CODES_PAGE = 'https://wosgiftcodes.com/';
const MAX_IDS = 100;
const MAX_STATE_CODES = 40;

const log = (...args) => console.log('[wos-giftcodes]', ...args);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => createHash('md5').update(s).digest('hex');

async function readJson(file, fallback = null) {
  try {
    const text = (await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/* ---------------- códigos activos ---------------- */

const validCode = (v) => /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(v);

async function fetchCodes() {
  const opts = { headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, text/html, */*' } };
  const byCode = new Map();
  const dates = new Map();

  try {
    const res = await fetch(CODES_FEED, opts);
    if (res.ok) {
      const xml = await res.text();
      const re = /<item>([\s\S]*?)<\/item>/g;
      let item;
      while ((item = re.exec(xml))) {
        const block = item[1];
        const title = (block.match(/<title>([^<]+)<\/title>/) || [])[1];
        const pub = (block.match(/<pubDate>([^<]+)<\/pubDate>/) || [])[1];
        if (!title || !validCode(title.trim())) continue;
        const code = title.trim().toUpperCase();
        byCode.set(code, true);
        if (pub && !dates.has(code)) dates.set(code, pub.trim());
      }
    }
  } catch (e) {
    log('Aviso: no se pudo leer el feed RSS:', e.message);
  }

  try {
    const res = await fetch(CODES_PAGE, opts);
    if (res.ok) {
      const html = await res.text();
      const re = /<td>([A-Za-z0-9_-]{3,32})<\/td>/g;
      let m;
      while ((m = re.exec(html))) {
        const code = m[1].trim().toUpperCase();
        if (validCode(code)) byCode.set(code, true);
      }
    }
  } catch (e) {
    log('Aviso: no se pudo leer la tabla del sitio:', e.message);
  }

  const codes = [...byCode.keys()].slice(0, 20).map((code) => ({ code, publishedAt: dates.get(code) || '' }));
  return codes;
}

/* ---------------- canje ---------------- */

async function redeem(id, code, region) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const time = Math.floor(Date.now() / 1000);
    const sign = md5(`cdk=${code}&fid=${id}&kid=${region}&time=${time}${SIGN_SALT}`);
    const body = new URLSearchParams({
      sign,
      fid: id,
      cdk: code,
      kid: String(region),
      time: String(time)
    }).toString();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json, text/plain, */*',
          Origin: API_ORIGIN,
          Referer: API_ORIGIN + '/',
          'User-Agent': USER_AGENT
        },
        body,
        signal: ctrl.signal
      });
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {}

      if (!data) {
        if (res.status >= 500 && attempt === 0) {
          await sleep(1500);
          continue;
        }
        return { status: 'error', message: `HTTP ${res.status}` };
      }

      const errCode = Number(data.err_code);
      const msg = String(data.msg || '').trim();

      if (errCode === 20000) return { status: 'ok', message: msg };
      if (errCode === 40008) return { status: 'already', message: msg };
      if (errCode === 40007) return { status: 'expired', message: msg };
      if (errCode === 40020) return { status: 'notfound', message: msg };
      if (errCode === 40004) {
        if (attempt === 0) {
          await sleep(1800);
          continue;
        }
        return { status: 'timeout', message: msg };
      }
      if (/frequent|too many|limit/i.test(msg)) return { status: 'rate', message: msg };
      if (/expire|time error/i.test(msg)) return { status: 'expired', message: msg };
      if (/user info/i.test(msg)) return { status: 'notfound', message: msg };
      return { status: 'error', message: msg || `err ${errCode || 'desconocido'}` };
    } catch (e) {
      if (attempt === 0) {
        await sleep(1200);
        continue;
      }
      return {
        status: e.name === 'AbortError' ? 'timeout' : 'offline',
        message: e.name === 'AbortError' ? 'Sin respuesta del servidor del juego' : e.message
      };
    } finally {
      clearTimeout(timer);
    }
  }
  return { status: 'timeout', message: 'Sin respuesta' };
}

function cleanIds(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const id = String(raw).trim();
    if (/^\d{6,12}$/.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_IDS) break;
  }
  return out;
}

/* ---------------- principal ---------------- */

async function main() {
  const config = (await readJson(CONFIG_PATH, {})) || {};
  const codes = await fetchCodes();

  if (codes.length) {
    const previous = await readJson(CODES_PATH, null);
    const same = previous && JSON.stringify(previous.codes) === JSON.stringify(codes);
    if (!same) {
      await writeJson(CODES_PATH, {
        source: 'wosgiftcodes.com',
        note: 'Actualizado por GitHub Actions. No editar a mano.',
        codes
      });
      log(`Lista actualizada: ${codes.length} códigos activos.`);
    } else {
      log(`Sin cambios en la lista (${codes.length} códigos activos).`);
    }
  } else {
    log('No se pudo obtener la lista de códigos; se mantiene la anterior.');
  }

  if (!config.enabled) {
    log('Canje automático desactivado en giftcodes.config.json.');
    return;
  }

  const region = String(config.region || '').trim();
  const ids = cleanIds(config.ids);

  if (!/^\d{1,6}$/.test(region) || Number(region) <= 0) {
    log('Config sin "region" válida: no se canjea.');
    return;
  }
  if (!ids.length) {
    log('Config sin IDs válidos: no se canjea.');
    return;
  }
  if (!codes.length) {
    log('Sin lista de códigos: no se canjea.');
    return;
  }

  const state = (await readJson(STATE_PATH, null)) || { version: 1, redeemed: {} };
  if (!state.redeemed || typeof state.redeemed !== 'object') state.redeemed = {};

  const delay = Math.max(600, Number(config.delayMs) || 1500);
  let codeCount = 0;
  let okCount = 0;
  let alreadyCount = 0;
  let errorCount = 0;

  for (const { code } of codes) {
    const done = state.redeemed[code] || {};
    const pending = ids.filter((id) => !done[id]);
    if (!pending.length) continue;

    codeCount++;
    log(`Código ${code}: ${pending.length} ID(s) pendientes.`);
    let stopCode = false;

    for (const id of pending) {
      if (stopCode) {
        done[id] = { status: 'skipped', at: new Date().toISOString() };
        continue;
      }

      const result = await redeem(id, code, region);
      done[id] = { status: result.status, at: new Date().toISOString() };
      state.redeemed[code] = done;
      await writeJson(STATE_PATH, state);

      if (result.status === 'ok') okCount++;
      else if (result.status === 'already') alreadyCount++;
      else errorCount++;

      log(`  ${id}: ${result.status}${result.message ? ' — ' + result.message : ''}`);

      if (result.status === 'expired' || result.status === 'invalid') stopCode = true;
      if (result.status === 'rate' || result.status === 'offline') {
        await sleep(5000);
      }
      await sleep(delay);
    }

    state.redeemed[code] = done;
    await writeJson(STATE_PATH, state);
  }

  // Recortar estado viejo para que no crezca sin límite
  const keys = Object.keys(state.redeemed);
  if (keys.length > MAX_STATE_CODES) {
    for (const key of keys.slice(0, keys.length - MAX_STATE_CODES)) delete state.redeemed[key];
    await writeJson(STATE_PATH, state);
  }

  log(`Resumen: ${codeCount} código(s) procesados, ${okCount} canjeados, ${alreadyCount} ya tenían, ${errorCount} con error.`);
}

main().catch((e) => {
  console.error('[wos-giftcodes] Error inesperado:', e);
  process.exitCode = 1;
});
