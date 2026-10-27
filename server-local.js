// Servidor estático mínimo para previsualizar mftech-web (solo local)
// Uso: node server-local.js  ->  http://localhost:8123
//
// También expone un puente de canje para WoS Gift Codes:
//   GET  /api/giftcode/health
//   POST /api/giftcode/redeem  { id, code, region }
// El puente firma y envía la petición a la API oficial de Century Games.
// No se usa en GitHub Pages: para producción desplegá giftcode-bridge/worker.js.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = 8123;
const API_URL = 'https://wos-giftcode-api.centurygame.com/api/gift_code';
const API_ORIGIN = 'https://wos-giftcode.centurygame.com';
const SIGN_SALT = 'tB87#kPtkxqOS2';
const CODES_FEED = 'https://wosgiftcodes.com/rss.php';
const CODES_PAGE_FALLBACK = 'https://wosgiftcodes.com/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/* ---------------- puente de canje ---------------- */

const buckets = new Map();

function clientIp(req) {
  return String(req.socket?.remoteAddress || 'local');
}

function rateLimited(req) {
  const now = Date.now();
  const key = clientIp(req);
  const bucket = buckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start > 60000) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count++;
  buckets.set(key, bucket);
  return bucket.count > 140;
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  const ok =
    !origin ||
    origin === 'null' ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
    /^https:\/\/(www\.)?mftechar\.com$/i.test(origin);
  return {
    'Access-Control-Allow-Origin': ok && origin ? origin : '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
    'Cache-Control': 'no-store'
  };
}

function sendJson(req, res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...corsHeaders(req)
  });
  res.end(body);
}

function readJson(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Payload demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const valid = {
  id: (v) => /^\d{6,12}$/.test(v),
  region: (v) => /^\d{1,6}$/.test(v) && Number(v) > 0,
  code: (v) => /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(v)
};

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

/* ---------------- códigos activos de la comunidad ---------------- */
/* La API oficial no publica códigos: los códigos se anuncian en Discord y
   los trackers los agregan. Usamos el feed RSS de wosgiftcodes.com
   (con fallback al HTML de la misma web) y cacheamos 30 minutos. */

const validCodeFormat = (v) => /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(v);

let codesCache = { data: null, at: 0 };
const CODES_TTL = 30 * 60 * 1000;

async function fetchActiveCodes() {
  const reqOpts = { headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, text/html, */*' } };
  const byCode = new Map();
  let publishedAtByCode = new Map();

  // Feed RSS: when each code was published
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
          byCode.set(title.trim().toUpperCase(), true);
          if (pub && !publishedAtByCode.has(title.trim().toUpperCase())) {
            publishedAtByCode.set(title.trim().toUpperCase(), pub.trim());
          }
        }
      }
    }
  } catch {}

  // Tabla HTML: full list of active codes
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
      source: 'wosgiftcodes.com',
      fetchedAt: new Date().toISOString(),
      codes
    };
  }

  return { ok: false, source: '', fetchedAt: new Date().toISOString(), codes: [] };
}

async function getActiveCodes() {
  const now = Date.now();
  if (codesCache.data && now - codesCache.at < CODES_TTL) {
    return { ...codesCache.data, cached: true };
  }
  const fresh = await fetchActiveCodes();
  if (fresh.ok && fresh.codes.length) {
    codesCache = { data: fresh, at: now };
    return fresh;
  }
  // Si falló la búsqueda pero hay caché vieja, servimos lo último conocido.
  if (codesCache.data) {
    return { ...codesCache.data, cached: true, stale: true };
  }
  return fresh;
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
    const signSource = `cdk=${code}&fid=${id}&kid=${region}&time=${time}`;
    const sign = md5(signSource + SIGN_SALT);

    const body = new URLSearchParams({
      sign,
      fid: id,
      cdk: code,
      kid: String(region),
      time: String(time)
    }).toString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const upstream = await fetch(API_URL, {
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
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, status: 'timeout', message: lastError || 'Sin respuesta del servidor del juego.' };
}

async function handleApi(req, res, pathname) {
  const cors = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return true;
  }

  if (pathname === '/api/giftcode/health' && req.method === 'GET') {
    sendJson(req, res, 200, {
      ok: true,
      service: 'wos-giftcode-bridge',
      version: 1,
      upstream: 'centurygame',
      maxIds: 100
    });
    return true;
  }

  if (pathname === '/api/giftcode/codes' && req.method === 'GET') {
    const data = await getActiveCodes();
    sendJson(req, res, data.ok ? 200 : 502, data);
    return true;
  }

  if (pathname === '/api/giftcode/redeem' && req.method === 'POST') {
    if (rateLimited(req)) {
      sendJson(req, res, 429, {
        ok: false,
        status: 'rate',
        message: 'Demasiadas solicitudes desde este equipo. Esperá un minuto.'
      });
      return true;
    }

    let body;
    try {
      body = await readJson(req);
    } catch (e) {
      sendJson(req, res, e.status || 400, { ok: false, status: 'error', message: e.message });
      return true;
    }

    const id = String(body.id || '').trim();
    const region = String(body.region || '').trim();
    const code = String(body.code || '').trim().toUpperCase();

    if (!valid.id(id)) {
      sendJson(req, res, 400, { ok: false, status: 'invalid', message: 'ID de jugador inválido (6 a 12 dígitos).' });
      return true;
    }
    if (!valid.region(region)) {
      sendJson(req, res, 400, { ok: false, status: 'invalid', message: 'Estado / región inválido.' });
      return true;
    }
    if (!valid.code(code)) {
      sendJson(req, res, 400, { ok: false, status: 'invalid', message: 'Código de regalo inválido.' });
      return true;
    }

    try {
      const result = await callGiftCode({ id, code, region });
      sendJson(req, res, 200, result);
    } catch {
      sendJson(req, res, 502, {
        ok: false,
        status: 'error',
        message: 'El puente no pudo completar la solicitud.'
      });
    }
    return true;
  }

  if (pathname.startsWith('/api/giftcode/')) {
    sendJson(req, res, 404, { ok: false, status: 'error', message: 'Ruta del puente no encontrada.' });
    return true;
  }

  return false;
}

/* ---------------- servidor ---------------- */

http
  .createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);

    if (url.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (handled) return;
    }

    let file = path.normalize(path.join(ROOT, url));

    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('Prohibido');
      return;
    }

    // Directorio -> servir index.html de adentro
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado: ' + url);
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    console.log('Listo en http://localhost:' + PORT);
    console.log('Puente de Gift Codes: http://localhost:' + PORT + '/api/giftcode/health');
  });
