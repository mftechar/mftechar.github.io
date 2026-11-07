#!/usr/bin/env node
/**
 * Actualiza el snapshot local del Estado 4604 usando la API pública de WoS Atlas.
 *
 * Uso:
 *   node update-wos-data.js            -> actualiza data/estado-4604.json
 *   node update-wos-data.js --force    -> ignora el cache de 30 min
 *
 * Respeta el límite de la API (tier "robot"): espacia los pedidos y, si recibe
 * 429, espera el retry-after antes de reintentar. No se ejecuta desde el
 * navegador: el sitio publica solo el JSON cacheado.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SERVER_ID = '4604';
const OUT = path.join(__dirname, 'data', 'estado-4604.json');
const BOARDS = ['alliance.rank', 'furnace.rank', 'kill.rank', 'power.rank'];
const PACING_MS = 8000;      // separación entre pedidos
const MAX_WAIT_MS = 11 * 60 * 1000; // tope de espera ante 429
const CACHE_MS = 30 * 60 * 1000;    // no refrescar si el snapshot es reciente

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requestJson(pathname) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'wosatlas.com',
      path: pathname,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MFTechAR-WoS-Tools/1.0 (+https://www.mftechar.com/gamers/wos/estado-4604.html)',
        Referer: `https://wosatlas.com/servers/${SERVER_ID}`,
      },
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(body); } catch { /* noop */ }
        resolve({ status: res.statusCode, headers: res.headers, data, body });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

async function fetchWithRetry(pathname, attempt = 1) {
  const res = await requestJson(pathname);
  if (res.status === 200 && res.data) return res.data;

  if (res.status === 429) {
    const retryAfter = Number(res.headers['retry-after'] || 600) * 1000;
    const wait = Math.min(retryAfter + 2000, MAX_WAIT_MS);
    if (attempt > 3) throw new Error(`429 persistente en ${pathname}`);
    console.log(`  rate_limited en ${pathname}: esperando ${Math.round(wait / 1000)}s...`);
    await sleep(wait);
    return fetchWithRetry(pathname, attempt + 1);
  }

  throw new Error(`HTTP ${res.status} en ${pathname}: ${res.body.slice(0, 160)}`);
}

async function main() {
  const force = process.argv.includes('--force');

  if (!force && fs.existsSync(OUT)) {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const age = Date.now() - new Date(prev.fetchedAt || 0).getTime();
    if (age < CACHE_MS) {
      console.log(`Snapshot reciente (${Math.round(age / 60000)} min). Usá --force para actualizar.`);
      return;
    }
  }

  const snapshot = {
    source: 'WoS Atlas',
    sourceUrl: 'https://wosatlas.com',
    serverId: SERVER_ID,
    fetchedAt: new Date().toISOString(),
    boards: {},
  };

  console.log('1/3 metadata...');
  const meta = await fetchWithRetry('/api/v1/meta');
  snapshot.meta = {
    game: meta.game,
    boards: meta.boards,
    server_count: meta.server_count,
    surveyed_server_count: meta.surveyed_server_count,
    last_census_at: meta.last_census_at,
  };
  await sleep(PACING_MS);

  console.log('2/3 estado 4604...');
  const server = await fetchWithRetry(`/api/v1/servers/${SERVER_ID}`);
  snapshot.server = server;
  await sleep(PACING_MS);

  const summary = await fetchWithRetry(`/api/v1/servers/${SERVER_ID}/summary`);
  snapshot.summary = summary;
  await sleep(PACING_MS);

  console.log('3/3 tableros...');
  for (const board of BOARDS) {
    console.log(`  ${board}`);
    snapshot.boards[board] = await fetchWithRetry(
      `/api/v1/servers/${SERVER_ID}/boards/${board}?limit=100`
    );
    await sleep(PACING_MS);
  }

  console.log('  alianzas');
  snapshot.alliances = await fetchWithRetry(
    `/api/v1/servers/${SERVER_ID}/alliances?limit=200`
  );

  // Solo guardamos lo necesario para el sitio (el dataset completo pesa de más).
  if (snapshot.alliances && Array.isArray(snapshot.alliances.items)) {
    snapshot.alliances = {
      items: snapshot.alliances.items.map((a) => ({
        tag: a.tag,
        name: a.name,
        power: a.power,
        member_count: a.member_count,
        max_members: a.max_members,
        alliance_level: a.alliance_level,
        leader_name: a.leader_name,
        join_min_power: a.join_min_power,
        home_server_id: a.home_server_id,
        last_seen_at: a.last_seen_at,
      })),
    };
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 1), 'utf8');
  console.log(`\nGuardado: ${OUT}`);
  console.log(`   alianzas: ${snapshot.boards['alliance.rank']?.items?.length ?? 0}`);
  console.log(`   jefes:    ${snapshot.boards['power.rank']?.items?.length ?? 0}`);
  console.log(`   kills:    ${snapshot.boards['kill.rank']?.items?.length ?? 0}`);
  console.log(`   horno:    ${snapshot.boards['furnace.rank']?.items?.length ?? 0}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
