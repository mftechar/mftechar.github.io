/**
 * Puente de canje para WoS Gift Codes — MF Tech AR
 * Cloudflare Worker (plan gratuito).
 *
 * Qué hace:
 *   GET  /health  -> estado del puente
 *   GET  /codes   -> códigos de regalo activos (feed de wosgiftcodes.com)
 *   POST /redeem  -> { id, code, region } y llama a la API oficial de Century Games
 *   Cron          -> si configurás AUTO_REGION y AUTO_IDS, canjea solo 6 veces al día
 *
 * Cómo publicarlo:
 *   1. dash.cloudflare.com -> Workers & Pages -> Create -> Worker.
 *   2. Pegá este archivo completo y tocá Deploy.
 *   3. Copiá la URL (https://algo.workers.dev) y pegala en la herramienta
 *      Gift Codes -> Conexión de canje -> URL del puente.
 *
 * Seguridad:
 *   - Solo acepta los orígenes de ALLOWED_ORIGINS.
 *   - Límite simple de 140 solicitudes por minuto por IP.
 *   - No guarda IDs, códigos ni respuestas.
 *
 * La firma es la misma que usa la web oficial (MD5 del cuerpo + salt público).
 * Este proyecto no está afiliado a Century Games.
 */

const API_URL = 'https://wos-giftcode-api.centurygame.com/api/gift_code';
const API_ORIGIN = 'https://wos-giftcode.centurygame.com';
const SIGN_SALT = 'tB87#kPtkxqOS2';
const CODES_FEED = 'https://wosgiftcodes.com/rss.php';
const CODES_PAGE_FALLBACK = 'https://wosgiftcodes.com/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

const ALLOWED_ORIGINS = new Set([
  'https://www.mftechar.com',
  'https://mftechar.com',
  'https://mftechar.github.io',
  'http://localhost:8123',
  'http://127.0.0.1:8123'
]);

const buckets = new Map();

/* ---------------- MD5 (JavaScript puro, sin dependencias) ---------------- */

function add32(a, b) {
  return (a + b) & 0xffffffff;
}
function cmn(q, a, b, x, s, t) {
  a = add32(add32(a, q), add32(x, t));
  return add32((a << s) | (a >>> (32 - s)), b);
}
function ff(a, b, c, d, x, s, t) {
  return cmn((b & c) | (~b & d), a, b, x, s, t);
}
function gg(a, b, c, d, x, s, t) {
  return cmn((b & d) | (c & ~d), a, b, x, s, t);
}
function hh(a, b, c, d, x, s, t) {
  return cmn(b ^ c ^ d, a, b, x, s, t);
}
function ii(a, b, c, d, x, s, t) {
  return cmn(c ^ (b | ~d), a, b, x, s, t);
}

function md5cycle(x, k) {
  let a = x[0];
  let b = x[1];
  let c = x[2];
  let d = x[3];

  a = ff(a, b, c, d, k[0], 7, -680876936);
  d = ff(d, a, b, c, k[1], 12, -389564586);
  c = ff(c, d, a, b, k[2], 17, 606105819);
  b = ff(b, c, d, a, k[3], 22, -1044525330);
  a = ff(a, b, c, d, k[4], 7, -176418897);
  d = ff(d, a, b, c, k[5], 12, 1200080426);
  c = ff(c, d, a, b, k[6], 17, -1473231341);
  b = ff(b, c, d, a, k[7], 22, -45705983);
  a = ff(a, b, c, d, k[8], 7, 1770035416);
  d = ff(d, a, b, c, k[9], 12, -1958414417);
  c = ff(c, d, a, b, k[10], 17, -42063);
  b = ff(b, c, d, a, k[11], 22, -1990404162);
  a = ff(a, b, c, d, k[12], 7, 1804603682);
  d = ff(d, a, b, c, k[13], 12, -40341101);
  c = ff(c, d, a, b, k[14], 17, -1502002290);
  b = ff(b, c, d, a, k[15], 22, 1236535329);

  a = gg(a, b, c, d, k[1], 5, -165796510);
  d = gg(d, a, b, c, k[6], 9, -1069501632);
  c = gg(c, d, a, b, k[11], 14, 643717713);
  b = gg(b, c, d, a, k[0], 20, -373897302);
  a = gg(a, b, c, d, k[5], 5, -701558691);
  d = gg(d, a, b, c, k[10], 9, 38016083);
  c = gg(c, d, a, b, k[15], 14, -660478335);
  b = gg(b, c, d, a, k[4], 20, -405537848);
  a = gg(a, b, c, d, k[9], 5, 568446438);
  d = gg(d, a, b, c, k[14], 9, -1019803690);
  c = gg(c, d, a, b, k[3], 14, -187363961);
  b = gg(b, c, d, a, k[8], 20, 1163531501);
  a = gg(a, b, c, d, k[13], 5, -1444681467);
  d = gg(d, a, b, c, k[2], 9, -51403784);
  c = gg(c, d, a, b, k[7], 14, 1735328473);
  b = gg(b, c, d, a, k[12], 20, -1926607734);

  a = hh(a, b, c, d, k[5], 4, -378558);
  d = hh(d, a, b, c, k[8], 11, -2022574463);
  c = hh(c, d, a, b, k[11], 16, 1839030562);
  b = hh(b, c, d, a, k[14], 23, -35309556);
  a = hh(a, b, c, d, k[1], 4, -1530992060);
  d = hh(d, a, b, c, k[4], 11, 1272893353);
  c = hh(c, d, a, b, k[7], 16, -155497632);
  b = hh(b, c, d, a, k[10], 23, -1094730640);
  a = hh(a, b, c, d, k[13], 4, 681279174);
  d = hh(d, a, b, c, k[0], 11, -358537222);
  c = hh(c, d, a, b, k[3], 16, -722521979);
  b = hh(b, c, d, a, k[6], 23, 76029189);
  a = hh(a, b, c, d, k[9], 4, -640364487);
  d = hh(d, a, b, c, k[12], 11, -421815835);
  c = hh(c, d, a, b, k[15], 16, 530742520);
  b = hh(b, c, d, a, k[2], 23, -995338651);

  a = ii(a, b, c, d, k[0], 6, -198630844);
  d = ii(d, a, b, c, k[7], 10, 1126891415);
  c = ii(c, d, a, b, k[14], 15, -1416354905);
  b = ii(b, c, d, a, k[5], 21, -57434055);
  a = ii(a, b, c, d, k[12], 6, 1700485571);
  d = ii(d, a, b, c, k[3], 10, -1894986606);
  c = ii(c, d, a, b, k[10], 15, -1051523);
  b = ii(b, c, d, a, k[1], 21, -2054922799);
  a = ii(a, b, c, d, k[8], 6, 1873313359);
  d = ii(d, a, b, c, k[15], 10, -30611744);
  c = ii(c, d, a, b, k[6], 15, -1560198380);
  b = ii(b, c, d, a, k[13], 21, 1309151649);
  a = ii(a, b, c, d, k[4], 6, -145523070);
  d = ii(d, a, b, c, k[11], 10, -1120210379);
  c = ii(c, d, a, b, k[2], 15, 718787259);
  b = ii(b, c, d, a, k[9], 21, -343485551);

  x[0] = add32(a, x[0]);
  x[1] = add32(b, x[1]);
  x[2] = add32(c, x[2]);
  x[3] = add32(d, x[3]);
}

function md5(str) {
  const bytes = new TextEncoder().encode(str);
  const n = bytes.length;
  const words = [];

  for (let i = 0; i < n; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | (bytes[i] << ((i % 4) * 8));
  }
  words[n >> 2] = (words[n >> 2] || 0) | (0x80 << ((n % 4) * 8));

  const lenIndex = (((n + 8) >> 6) + 1) * 16;
  words[lenIndex - 2] = (n * 8) >>> 0;
  words[lenIndex - 1] = Math.floor((n * 8) / 0x100000000);
  for (let i = 0; i < lenIndex; i++) if (!words[i]) words[i] = 0;

  const state = [1732584193, -271733879, -1732584194, 271733878];
  for (let i = 0; i < words.length; i += 16) {
    md5cycle(state, words.slice(i, i + 16));
  }

  const rhex = (num) => {
    let s = '';
    for (let j = 0; j < 4; j++) {
      s +=
        ((num >> (j * 8 + 4)) & 0x0f).toString(16) +
        ((num >> (j * 8)) & 0x0f).toString(16);
    }
    return s;
  };
  return rhex(state[0]) + rhex(state[1]) + rhex(state[2]) + rhex(state[3]);
}

/* ---------------- validación y respuesta ---------------- */

const valid = {
  id: (v) => /^\d{6,12}$/.test(v),
  region: (v) => /^\d{1,6}$/.test(v) && Number(v) > 0,
  code: (v) => /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(v)
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = origin ? ALLOWED_ORIGINS.has(origin) : true;
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '600',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin'
  });
  if (origin && allowed) headers.set('Access-Control-Allow-Origin', origin);
  return { headers, allowed };
}

function json(request, status, data) {
  const { headers, allowed } = corsHeaders(request);
  if (!allowed) {
    return new Response(
      JSON.stringify({ ok: false, status: 'error', message: 'Origen no autorizado.' }),
      { status: 403, headers }
    );
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function rateLimited(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  const now = Date.now();
  const bucket = buckets.get(ip) || { start: now, count: 0 };
  if (now - bucket.start > 60000) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count++;
  buckets.set(ip, bucket);
  if (buckets.size > 5000) {
    for (const [key, value] of buckets) {
      if (now - value.start > 120000) buckets.delete(key);
    }
  }
  return bucket.count > 140;
}

function normalizeResult(data) {
  const errCode = Number(data?.err_code);
  const msg = String(data?.msg || '').trim();

  if (errCode === 20000) return { status: 'ok', message: 'Canjeado. Revisá el correo del juego.', errCode };
  if (errCode === 40008) return { status: 'already', message: 'Ya estaba canjeado para este ID.', errCode };
  if (errCode === 40007) return { status: 'expired', message: 'El código venció o no está disponible.', errCode };
  if (errCode === 40020) return { status: 'notfound', message: 'ID o región incorrectos: el juego no encontró al personaje.', errCode };
  if (errCode === 40004) return { status: 'timeout', message: 'El servidor del juego no respondió. Reintentá.', errCode };

  const lower = msg.toLowerCase();
  if (lower.includes('user info')) {
    return { status: 'notfound', message: 'ID o región incorrectos: el juego no encontró al personaje.', errCode };
  }
  if (lower.includes('expire') || lower.includes('time error')) {
    return { status: 'expired', message: 'El código venció o no está disponible.', errCode };
  }
  if (lower.includes('received') || lower.includes('already') || lower.includes('claimed')) {
    return { status: 'already', message: 'Ya estaba canjeado para este ID.', errCode };
  }
  if (lower.includes('frequent') || lower.includes('too many') || lower.includes('limit')) {
    return { status: 'rate', message: 'Demasiadas solicitudes. Esperá un momento.', errCode };
  }
  if (lower.includes('not found') || lower.includes('invalid') || lower.includes('cdk')) {
    return { status: 'invalid', message: 'El código no es válido.', errCode };
  }
  return {
    status: 'error',
    message: msg || 'El juego rechazó el canje. Probá de nuevo más tarde.',
    errCode: Number.isFinite(errCode) ? errCode : undefined
  };
}

async function callGiftCode({ id, code, region }) {
  let lastError = '';

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

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      let upstream;
      try {
        upstream = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json, text/plain, */*',
            Origin: API_ORIGIN,
            Referer: API_ORIGIN + '/',
            'User-Agent': USER_AGENT
          },
          body,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }

      const text = await upstream.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {}

      if (!upstream.ok || !data) {
        lastError = `El servidor del juego respondió ${upstream.status}.`;
        if (upstream.status >= 500 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        return { ok: false, status: 'error', message: lastError };
      }

      const result = normalizeResult(data);
      if (result.status === 'timeout' && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1800));
        continue;
      }
      return { ok: true, ...result };
    } catch (e) {
      lastError =
        e?.name === 'AbortError'
          ? 'El servidor del juego tardó demasiado en responder.'
          : 'No se pudo conectar con el servidor del juego.';
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      return { ok: false, status: 'timeout', message: lastError };
    }
  }

  return { ok: false, status: 'timeout', message: lastError || 'Sin respuesta del servidor del juego.' };
}

/* ---------------- códigos activos de la comunidad ---------------- */
/* La API oficial no publica códigos: se anuncian en Discord y los trackers
   los agregan. Leemos el feed RSS de wosgiftcodes.com (con fallback al
   HTML de esa web) y cacheamos 10 minutos. */

const validCodeFormat = (v) => /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(v);

let codesCache = { data: null, at: 0 };
const CODES_TTL = 10 * 60 * 1000;

async function fetchActiveCodes() {
  const reqOpts = { headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, text/html, */*' } };
  const byCode = new Map();
  const publishedAtByCode = new Map();

  // Feed RSS: trae la fecha de publicación
  try {
    const res = await fetch(CODES_FEED, reqOpts);
    if (res.ok) {
      const xml = await res.text();
      const re = /<item>([\s\S]*?)<\/item>/g;
      let item;
      while ((item = re.exec(xml))) {
        const block = item[1];
        const title = (block.match(/<title>([^<]+)<\/title>/) || [])[1];
        const pub = (block.match(/<pubDate>([^<]+)<\/pubDate>/) || [])[1];
        if (title && validCodeFormat(title.trim())) {
          const key = title.trim().toUpperCase();
          byCode.set(key, true);
          if (pub && !publishedAtByCode.has(key)) publishedAtByCode.set(key, pub.trim());
        }
      }
    }
  } catch {}

  // Tabla HTML: lista completa de códigos activos
  try {
    const res = await fetch(CODES_PAGE_FALLBACK, reqOpts);
    if (res.ok) {
      const html = await res.text();
      const re = /<td>([A-Za-z0-9_-]{3,32})<\/td>/g;
      let m;
      while ((m = re.exec(html))) {
        const code = m[1].trim().toUpperCase();
        if (validCodeFormat(code)) byCode.set(code, true);
      }
    }
  } catch {}

  const codes = [...byCode.keys()].slice(0, 20).map((code) => ({ code, publishedAt: publishedAtByCode.get(code) || '' }));
  if (codes.length) {
    return {
      ok: true,
      upstream: 'wosgiftcodes.com',
      fetchedAt: new Date().toISOString(),
      codes
    };
  }

  return { ok: false, upstream: '', fetchedAt: new Date().toISOString(), codes: [] };
}

async function getActiveCodes(env) {
  const now = Date.now();
  if (codesCache.data && now - codesCache.at < CODES_TTL) {
    return { ...codesCache.data, cached: true };
  }

  // Si hay un KV enlazado como CODES y el cron lo dejó fresco (< 4 h), lo usamos.
  if (env?.CODES?.get) {
    try {
      const stored = await env.CODES.get('codes', 'json');
      const storedAt = Number(stored?.fetchedAtMs || 0);
      if (stored && now - storedAt < 4 * 60 * 60 * 1000 && stored.ok && stored.codes?.length) {
        codesCache = { data: stored, at: storedAt };
        return { ...stored, cached: true };
      }
    } catch {}
  }

  const fresh = await fetchActiveCodes();
  if (fresh.ok && fresh.codes.length) {
    codesCache = { data: fresh, at: now };
    if (env?.CODES?.put) {
      try {
        await env.CODES.put('codes', JSON.stringify({ ...fresh, fetchedAtMs: now }), { expirationTtl: 4 * 60 * 60 });
      } catch {}
    }
    return fresh;
  }
  if (codesCache.data) {
    return { ...codesCache.data, cached: true, stale: true };
  }
  return fresh;
}

/* ---------------- canje automático opcional por cron ----------------
 * Sin configurar queda desactivado. Para canjear solos a diario:
 *   1. Settings -> Variables -> agregar:
 *        AUTO_REGION = 1234                  (estado / región)
 *        AUTO_IDS    = 111111111,222222222   (IDs de la alianza, hasta 100)
 *   2. En el trigger del Worker usar el cron: 0 0,4,8,12,16,20 * * *
 * círculo cada 4 h (6 veces al día): busca códigos nuevos y canjea
 * para cada ID que no lo tenga. Guarda el último canjeado en CODES.
 * Solo recomendado si los IDs son de tu propia alianza.
 */
const AUTO_ENABLED = (env) => Boolean(env?.AUTO_REGION && String(env.AUTO_IDS || '').trim());

async function autoRedeem(env) {
  if (!AUTO_ENABLED(env)) return;

  const codes = await getActiveCodes(env);
  if (!codes.ok || !codes.codes?.length) return;

  let last = '';
  try {
    last = (await env.CODES.get('lastAutoCode', 'text')) || '';
  } catch {}

  const region = String(env.AUTO_REGION).trim();
  const ids = String(env.AUTO_IDS).split(',').map((v) => v.trim()).filter((v) => /^\d{6,12}$/.test(v)).slice(0, 100);

  for (const { code } of codes.codes) {
    if (code === last) break;
    for (const id of ids) {
      const result = await callGiftCode({ id, code, region });
      if (result.status === 'expired' || result.status === 'invalid') break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    try {
      await env.CODES.put('lastAutoCode', code);
    } catch {}
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(autoRedeem(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    const { allowed } = corsHeaders(request);
    if (!allowed) {
      return json(request, 403, { ok: false, status: 'error', message: 'Origen no autorizado.' });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request).headers });
    }

    if (path.endsWith('/health') || path === '/') {
      return json(request, 200, {
        ok: true,
        service: 'wos-giftcode-bridge',
        version: 1,
        upstream: 'centurygame',
        maxIds: 100
      });
    }

    if (path.endsWith('/codes') && request.method === 'GET') {
      const data = await getActiveCodes(env);
      return json(request, data.ok ? 200 : 502, data);
    }

    if (path.endsWith('/redeem')) {
      if (request.method !== 'POST') {
        return json(request, 405, { ok: false, status: 'error', message: 'Usá POST para canjear.' });
      }
      if (rateLimited(request)) {
        return json(request, 429, {
          ok: false,
          status: 'rate',
          message: 'Demasiadas solicitudes desde esta conexión. Esperá un minuto.'
        });
      }

      let body;
      try {
        const text = await request.text();
        if (text.length > 4096) throw new Error('Payload demasiado grande');
        body = JSON.parse(text || '{}');
      } catch {
        return json(request, 400, { ok: false, status: 'error', message: 'JSON inválido.' });
      }

      const id = String(body.id || '').trim();
      const region = String(body.region || '').trim();
      const code = String(body.code || '').trim().toUpperCase();

      if (!valid.id(id)) {
        return json(request, 400, { ok: false, status: 'invalid', message: 'ID de jugador inválido (6 a 12 dígitos).' });
      }
      if (!valid.region(region)) {
        return json(request, 400, { ok: false, status: 'invalid', message: 'Estado / región inválido.' });
      }
      if (!valid.code(code)) {
        return json(request, 400, { ok: false, status: 'invalid', message: 'Código de regalo inválido.' });
      }

      try {
        const result = await callGiftCode({ id, code, region });
        return json(request, 200, result);
      } catch {
        return json(request, 502, {
          ok: false,
          status: 'error',
          message: 'El puente no pudo completar la solicitud.'
        });
      }
    }

    return json(request, 404, { ok: false, status: 'error', message: 'Ruta no encontrada.' });
  }
};
