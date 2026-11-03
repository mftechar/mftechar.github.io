#!/usr/bin/env node
/**
 * MF Tech Store — sincronización automática del catálogo del proveedor
 *
 * Corre desde GitHub Actions (cada hora) y:
 *   1. Descarga las categorías configuradas en store/data/proveedor.config.json.
 *   2. Extrae los productos del JSON interno `btGapTag` (PrestaShop) y los
 *      enlaza con las tarjetas HTML para obtener link e imagen.
 *   3. Para los productos nuevos (o cuya ficha venció) abre el quickview y
 *      toma descripción completa, ficha técnica y stock real. El precio y las
 *      imágenes se revisan en cada corrida; la ficha, cada `detalleDias`.
 *   4. Aplica el margen y el redondeo configurados (nunca publica el costo).
 *   5. Descarga las imágenes a store/img/prov para no depender del proveedor.
 *   6. Reescribe store/data/products.json conservando TODOS los productos
 *      manuales (los que no tienen origen "proveedor").
 *
 * No necesita API key ni servidores propios.
 *
 * Uso:
 *   node scripts/proveedor-sync.mjs            # sincroniza y escribe
 *   node scripts/proveedor-sync.mjs --dry-run  # solo informa, no escribe
 *
 * Seguridad: si una categoría falla o el total queda por debajo de
 * `minimoProductos`, aborta sin tocar el catálogo (el workflow falla y avisa).
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const CONFIG_PATH = path.join(ROOT, 'store/data/proveedor.config.json');
const CATALOG_PATH = path.join(ROOT, 'store/data/products.json');
const IMG_DIR = path.join(ROOT, 'store/img/prov');
const PLACEHOLDER = 'img/logo.jpg';
const DRY = process.argv.includes('--dry-run');

const DEFAULTS = {
  base: 'https://argseguridad.com',
  margen: 0.35,
  redondeo: 1000,
  porCategoria: 500,
  minimoProductos: 50,
  descargarImagenes: true,
  categorias: [{ id: 137, slug: 'kits-de-seguridad' }],
  // Refresca descripción / stock desde el quickview. 0 = nunca (solo alta),
  // 7 = una vez por semana. El precio y las imágenes se actualizan siempre.
  detalleDias: 7,
  // Pausa entre peticiones (imágenes y fichas). Subirla reduce las chances
  // de que el proveedor bloquee, pero enlentece el primer sync.
  pausaMs: 700,
};

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

const log = (...a) => console.log('[proveedor]', ...a);
const warn = (...a) => console.warn('[proveedor]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

async function readJson(file, fallback = null) {
  try {
    const text = (await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function escribirSiCambia(file, data) {
  const nuevo = JSON.stringify(data, null, 2) + '\n';
  const actual = await fs.readFile(file, 'utf8').catch(() => null);
  if (actual === nuevo) {
    log(`Sin cambios en ${path.relative(ROOT, file)}`);
    return false;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, nuevo, 'utf8');
  log(`Actualizado ${path.relative(ROOT, file)}`);
  return true;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/* ------------------------------------------------------------------ */
/* red                                                             */
/* ------------------------------------------------------------------ */

async function fetchText(url, { intentos = 3, timeout = 90000 } = {}) {
  let ultimoError = null;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      ultimoError = e;
      if (intento < intentos) {
        warn(`Reintento ${intento}/${intentos - 1} para ${url}: ${e.message}`);
        await sleep(4000 * intento);
      }
    }
  }
  throw new Error(`No se pudo descargar ${url}: ${ultimoError?.message || 'error'}`);
}

/**
 * Extrae el objeto JSON que sigue a `var btGapTag = {...}` respetando
 * llaves dentro de strings y escapes.
 */
function extraerTagJson(html) {
  const marca = html.indexOf('var btGapTag');
  if (marca < 0) return null;
  const inicio = html.indexOf('{', marca);
  if (inicio < 0) return null;

  let profundidad = 0;
  let enString = false;
  let escape = false;

  for (let i = inicio; i < html.length; i++) {
    const c = html[i];
    if (enString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') enString = false;
      continue;
    }
    if (c === '"') enString = true;
    else if (c === '{') profundidad++;
    else if (c === '}') {
      profundidad--;
      if (profundidad === 0) return html.slice(inicio, i + 1);
    }
  }
  return null;
}

/** Devuelve un Map id -> { link, imgId, archivo } a partir de las tarjetas. */
function parsearTarjetas(html) {
  const out = new Map();
  const re = /<article[^>]*\bdata-id-product="(\d+)"[\s\S]*?<\/article>/g;
  let m;
  while ((m = re.exec(html))) {
    const bloque = m[0];
    const id = m[1];
    const link = (bloque.match(/href="(https?:\/\/[^"]+\.html)"/) || [])[1] || null;
    const img = bloque.match(
      /(?:src|data-full-size-image-url)="(https?:\/\/[^"]+\/(\d+)-(?:home|large|thickbox)_default\/([^"]+\.(?:jpg|jpeg|png|webp)))"/i,
    );
    out.set(id, {
      link,
      imgId: img ? img[2] : null,
      archivo: img ? img[3] : null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* texto y HTML                                                       */
/* ------------------------------------------------------------------ */

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&hellip;/gi, '…')
    .replace(/&times;/gi, '×')
    .replace(/&bull;/gi, '•');
}

/** Convierte fragmentos HTML en texto plano con saltos por bloque. */
function htmlATexto(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|ul|ol|tr|h[1-6])>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Convierte grouped_features del quickview en líneas "Nombre: Valor". */
function parseFeatures(qf) {
  if (!qf || typeof qf !== 'object') return [];
  return Object.values(qf)
    .sort((a, b) => Number(a?.position ?? 0) - Number(b?.position ?? 0))
    .map((f) => `${String(f?.name || '').trim()}: ${String(f?.value || '').replace(/\s+/g, ' ').trim()}`)
    .filter((l) => l.length > 3);
}

/** quickview ligero del producto: descripción, ficha técnica y stock. */
async function fetchDetalle(link, id) {
  if (!link) throw new Error('sin URL del producto');
  const url = new URL(link);
  const res = await fetch(url.href, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      // Accept: application/json es lo que dispara que PrestaShop devuelva
      // el payload JSON en vez del HTML completo del producto.
      Accept: 'application/json, */*',
      Referer: url.href,
    },
    body: new URLSearchParams({
      action: 'quickview',
      id_product: String(id),
      id_product_attribute: '0',
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.product) throw new Error('quickview sin payload.product');
  return data.product;
}

/* ------------------------------------------------------------------ */
/* categorías                                                          */
/* ------------------------------------------------------------------ */

const CATEGORIAS = {
  'kits camaras wifi': 'Cámaras WiFi',
  'kits camaras hd': 'Cámaras HD',
  'kits camaras ip': 'Cámaras IP',
  'kits camaras moviles': 'Cámaras Móviles',
  'kits alarmas inalambricas': 'Alarmas Inalámbricas',
  'kits alarmas cableadas': 'Alarmas Cableadas',
  'kits alarma vecinal': 'Alarma Vecinal',
  'kits accesos administrables': 'Accesos Administrables',
  'kits accesos autonomos': 'Accesos Autónomos',
  'kits accesos vehiculares': 'Accesos Vehiculares',
  'kits cercos electricos': 'Cercos Eléctricos',
  'kits incendio convencional': 'Incendio Convencional',
  'kits porteros analogicos': 'Porteros Analógicos',
  'kits porteros ip': 'Porteros IP',
  'kits para hotel': 'Hoteles',
  'kits para oficinas hogares': 'Oficinas y Hogares',
  'kit home automation zwave': 'Home Automation Z-Wave',
  mesh: 'Mesh',
  'enlaces 5ghz': 'Enlaces 5 GHz',
};

const PALABRAS = {
  camara: 'Cámara',
  camaras: 'Cámaras',
  inalambrica: 'Inalámbrica',
  inalambricas: 'Inalámbricas',
  electrico: 'Eléctrico',
  electricos: 'Eléctricos',
  analogico: 'Analógico',
  analogicos: 'Analógicos',
  autonomo: 'Autónomo',
  autonomos: 'Autónomos',
  movil: 'Móvil',
  moviles: 'Móviles',
  vehicular: 'Vehicular',
  vehiculares: 'Vehiculares',
  administrables: 'Administrables',
  convencional: 'Convencional',
  hogares: 'Hogares',
};

function nombreCategoria(raw) {
  if (!raw) return 'Otros';
  const clave = String(raw).trim().toLowerCase();
  if (CATEGORIAS[clave]) return CATEGORIAS[clave];

  // Quita el prefijo "Kit/Kits" y normaliza acentos palabra por palabra.
  return String(raw)
    .replace(/^\s*kits?\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((p) => PALABRAS[p.toLowerCase()] || p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

/* ------------------------------------------------------------------ */
/* precio                                                              */
/* ------------------------------------------------------------------ */

function calcularPrecio(costo, { margen, redondeo }) {
  const bruto = costo * (1 + margen);
  const paso = redondeo > 1 ? redondeo : 1;
  return Math.max(paso, Math.round(bruto / paso) * paso);
}

/* ------------------------------------------------------------------ */
/* imágenes                                                            */
/* ------------------------------------------------------------------ */

function extensionDe(archivo) {
  const ext = (archivo.match(/\.(jpg|jpeg|png|webp)$/i) || [])[1];
  return (ext || 'jpg').toLowerCase().replace('jpeg', 'jpg');
}

function esBloqueo(e) {
  const msg = String(e?.message || e);
  return /HTTP (403|429|503)/.test(msg) || /captcha|forbidden|too many/i.test(msg);
}

const CUENTA_BLOQUEO = { 403: true, 429: true, 503: true };

async function descargarImagen(cfg, id, imgId, archivo, flujo = null) {
  if (!imgId || !archivo) return null;
  if (flujo?.bloqueado) return null;

  const ext = extensionDe(archivo);
  const local = `img/prov/${id}-${imgId}.${ext}`;
  const destino = path.join(ROOT, 'store', local);

  try {
    const st = await fs.stat(destino);
    if (st.size > 1024) return local;
  } catch {
    /* no existe todavía */
  }

  if (DRY) return local; // en --dry-run no se descarga ni se escribe

  // Pausa sólo cuando hace falta pedir algo por red (no cuando ya está en disco).
  const pausaMs = Math.max(200, Number(cfg.pausaMs ?? 700));
  if (pausaMs > 0) await sleep(pausaMs);

  const base = cfg.base.replace(/\/+$/, '');
  // large_default suele existir y pesa ~90 KB (buena calidad sin inflar el repo).
  for (const tipo of ['large_default', 'home_default']) {
    if (flujo?.bloqueado) break;
    const url = `${base}/${imgId}-${tipo}/${archivo}`;
    try {
      const res = await fetch(url, {
        headers: { ...HEADERS, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8', Referer: `${base}/` },
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) {
        if (CUENTA_BLOQUEO[res.status]) {
          if (flujo) flujo.bloqueado = true;
        }
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) continue;
      await fs.mkdir(IMG_DIR, { recursive: true });
      await fs.writeFile(destino, buf);
      return local;
    } catch (e) {
      if (flujo && esBloqueo(e)) flujo.bloqueado = true;
    }
  }
  warn(`Imagen no disponible para ${id} (${archivo}); se conserva la anterior si existe.`);
  return null;
}

async function limpiarImagenes(vigentes) {
  let archivos = [];
  try {
    archivos = await fs.readdir(IMG_DIR);
  } catch {
    return 0;
  }
  let borradas = 0;
  for (const f of archivos) {
    if (vigentes.has(f)) continue;
    await fs.unlink(path.join(IMG_DIR, f)).catch(() => {});
    borradas++;
  }
  return borradas;
}

/* ------------------------------------------------------------------ */
/* principal                                                           */
/* ------------------------------------------------------------------ */

async function main() {
  const cfgLeida = await readJson(CONFIG_PATH, null);
  if (!cfgLeida) throw new Error(`Falta ${path.relative(ROOT, CONFIG_PATH)}`);
  const cfg = { ...DEFAULTS, ...cfgLeida };

  if (!Array.isArray(cfg.categorias) || cfg.categorias.length === 0)
    throw new Error('Configurá al menos una categoría en proveedor.config.json');

  const margen = Number(cfg.margen);
  if (!Number.isFinite(margen) || margen < 0 || margen > 5)
    throw new Error(`Margen inválido: ${cfg.margen}`);

  const redondeo = Number(cfg.redondeo) || 1;
  const porCategoria = Math.max(1, Number(cfg.porCategoria) || 500);
  const minimoProductos = Math.max(1, Number(cfg.minimoProductos) || 1);
  const base = String(cfg.base || DEFAULTS.base).replace(/\/+$/, '');

  log(`Margen ${(margen * 100).toFixed(0)}% · redondeo $${redondeo}`);
  log(`Categorías: ${cfg.categorias.map((c) => c.id).join(', ')}`);

  /* 1. descargar y parsear cada categoría ---------------------------- */

  const crudos = [];
  for (const cat of cfg.categorias) {
    const url = `${base}/${cat.id}-${cat.slug}?n=${porCategoria}`;
    log(`Descargando ${url}`);
    const html = await fetchText(url);

    const tagRaw = extraerTagJson(html);
    if (!tagRaw) throw new Error(`No se encontró btGapTag en ${url} (¿cambió el HTML?)`);

    let tag;
    try {
      tag = JSON.parse(tagRaw);
    } catch {
      throw new Error(`JSON de productos inválido en ${url}`);
    }

    const items = tag?.tagContent?.contents?.value;
    if (!Array.isArray(items) || items.length === 0)
      throw new Error(`La categoría ${cat.id} no devolvió productos`);

    const tarjetas = parsearTarjetas(html);
    if (tarjetas.size === 0)
      throw new Error(`No se encontraron tarjetas de producto en ${cat.id}`);

    if (items.length >= porCategoria)
      warn(`La categoría ${cat.id} devolvió ${items.length} (límite ${porCategoria}): puede haber más páginas.`);

    log(`  ${items.length} productos, ${tarjetas.size} tarjetas`);

    for (const item of items) {
      const card = tarjetas.get(String(item.item_id)) || {};
      const precio = Number(item.price);
      if (!Number.isFinite(precio) || precio <= 0) {
        warn(`Producto ${item.item_id} sin precio válido; se omite.`);
        continue;
      }
      crudos.push({ item, card, precio, categoria: nombreCategoria(item.item_category) });
    }
  }

  if (crudos.length < minimoProductos)
    throw new Error(
      `Sólo se obtuvieron ${crudos.length} productos (mínimo ${minimoProductos}). No se modifica el catálogo.`,
    );

  // Catálogo actual: se necesita antes de construir los productos para
  // reutilizar las fichas (descripción / stock) y no pedirlas todos los días.
  const actual = await readJson(CATALOG_PATH, null);
  if (!actual || !Array.isArray(actual.productos))
    throw new Error(`Catálogo inválido o inexistente: ${path.relative(ROOT, CATALOG_PATH)}`);
  const manuales = actual.productos.filter((p) => p.origen !== 'proveedor');
  const anteriores = new Map(
    actual.productos.filter((p) => p.origen === 'proveedor').map((p) => [p.id, p]),
  );

  // Refresca las fichas cada detalleDias días (0 = no refresca nunca).
  const detalleDias = Number(cfg.detalleDias ?? 7);

  /* 2. construir productos limpios ----------------------------------- */

  const vistos = new Set();
  const productos = [];

  for (const { item, card, precio, categoria } of crudos) {
    const id = `p-${item.item_id}`;
    if (vistos.has(id)) continue; // el mismo producto en dos categorías
    vistos.add(id);

    const titulo = String(item.item_name || '').replace(/\s+/g, ' ').trim();
    if (!titulo) continue;

    const marca = String(item.item_brand || '').trim();
    const base_desc = [marca, categoria].filter(Boolean).join(' · ');
    const prev = anteriores.get(id);

    const detalleViejo = prev?.detalleActualizado ? Date.parse(prev.detalleActualizado) : NaN;
    const detalleVencido =
      detalleDias > 0 &&
      (!Number.isFinite(detalleViejo) || Date.now() - detalleViejo > detalleDias * 86400000);
    const necesitaDetalle = !prev || prev.titulo !== titulo || !prev.detalle || detalleVencido;

    const fallbackDesc = `${base_desc}. Producto nuevo, con garantía y asesoramiento técnico de MF Tech.`;
    const fallbackCaract = [
      marca ? `Marca: ${marca}` : null,
      `Categoría: ${categoria}`,
      'Producto nuevo con garantía y soporte de MF Tech.',
    ].filter(Boolean);

    productos.push({
      id,
      titulo,
      categorias: [categoria],
      ...(marca ? { marca } : {}),
      imagen: PLACEHOLDER, // se completa al descargar
      imagenAlt: `${titulo} — ${categoria}`,
      descripcion: prev?.descripcion || fallbackDesc,
      ...(prev?.detalle ? { detalle: prev.detalle } : {}),
      caracteristicas: prev?.caracteristicas?.length ? prev.caracteristicas : fallbackCaract,
      precio: calcularPrecio(precio, { margen, redondeo }),
      disponible: typeof prev?.disponible === 'boolean' ? prev.disponible : true,
      ...(prev?.detalleActualizado ? { detalleActualizado: prev.detalleActualizado } : {}),
      origen: 'proveedor',
      _imgId: card.imgId || null,
      _archivo: card.archivo || null,
      _link: card.link || null,
      _necesitaDetalle: necesitaDetalle,
    });
  }

  /* 3. imágenes ------------------------------------------------------ */
  /* Primero sólo las imágenes, de a una y con pausa; si el proveedor
     empieza a rechazar (403/429/503), cortamos y no publicamos nada.   */

  const vigentes = new Set();
  let descargadas = 0;
  let fallosImagen = 0;
  const flujoImg = { bloqueado: false };

  if (cfg.descargarImagenes) {
    log(`Descargando imágenes (${productos.length}) de a una…`);
    const fallbackImagenAnterior = (p) => {
      const prev = anteriores.get(p.id);
      if (prev?.imagen?.startsWith('img/prov/')) {
        p.imagen = prev.imagen;
        vigentes.add(path.basename(prev.imagen));
        return true;
      }
      return false;
    };
    await mapLimit(productos, 1, async (p) => {
      if (flujoImg.bloqueado) {
        if (!fallbackImagenAnterior(p)) p.imagen = PLACEHOLDER;
        return;
      }
      const local = await descargarImagen(cfg, p.id, p._imgId, p._archivo, flujoImg);
      if (local) {
        p.imagen = local;
        vigentes.add(path.basename(local));
        descargadas++;
      } else if (!fallbackImagenAnterior(p)) {
        p.imagen = PLACEHOLDER;
        fallosImagen++;
      }
    });
    if (flujoImg.bloqueado) {
      warn('El proveedor limitó las descargas (403/429/503); se omiten las fichas en esta corrida.');
    }
    log(`  ${descargadas} imágenes disponibles en store/img/prov · ${fallosImagen} fallidas`);
  } else {
    for (const p of productos) {
      if (p._imgId && p._archivo) {
        p.imagen = `${base}/${p._imgId}-home_default/${p._archivo}`;
      }
    }
  }

  /* 4. fichas de producto (descripción completa + ficha técnica) -------
     Sólo si las imágenes pasaron sin bloqueo: 304 POSTs extra empujan de
     más el límite del proveedor mientras nos está diciendo que paremos. */

  const faltanDetalle = productos.filter((p) => p._necesitaDetalle);
  const flujoDetalle = { bloqueado: false };
  let fichasOk = 0;
  if (!flujoImg.bloqueado && faltanDetalle.length) {
    log(`Descargando ficha de producto de ${faltanDetalle.length} productos…`);
    await mapLimit(faltanDetalle, 1, async (p) => {
      if (flujoDetalle.bloqueado) return; // la nota de más abajo ya cubre el fallback
      const baseId = Number(String(p.id).replace(/^p-/, ''));
      try {
        const qv = await fetchDetalle(p._link, baseId);
        const corta = htmlATexto(qv.description_short);
        const larga = htmlATexto(qv.description);
        const features = parseFeatures(qv.grouped_features ?? qv.features);

        p.descripcion = corta || larga || p.descripcion;
        p.detalle = larga || corta || p.descripcion;
        if (features.length) p.caracteristicas = features;

        const quantity = Number(qv.quantity);
        if (qv.availability === 'available' || (Number.isFinite(quantity) && quantity > 0)) {
          p.disponible = true;
        } else if (qv.availability === 'unavailable' || quantity === 0) {
          p.disponible = false;
        }
        p.detalleActualizado = new Date().toISOString();
        fichasOk++;

        // Ritmo amable entre productos (ya hay cache de 500 ms).
        await sleep(Math.max(400, Number(cfg.pausaMs ?? 700)));
      } catch (e) {
        if (esBloqueo(e)) {
          flujoDetalle.bloqueado = true;
          warn('El proveedor limitó las solicitudes; se omiten las demás fichas en esta corrida.');
        } else {
          warn(`Ficha de ${p.id} no disponible: ${e.message}`);
        }
        if (!p.detalle) p.detalle = p.descripcion;
      }
    });
  } else if (faltanDetalle.length) {
    log(`  Omitidas las fichas de ${faltanDetalle.length} productos (proveedor bloqueado).`);
  }
  if (faltanDetalle.length) {
    log(
      `  Fichas actualizadas: ${fichasOk}/${faltanDetalle.length}` +
        (flujoDetalle.bloqueado || flujoImg.bloqueado ? ' (resto omitido por límite del proveedor)' : ''),
    );
  }

  /* limpiar campos internos */
  for (const p of productos) {
    if (!p.detalle) p.detalle = p.descripcion;
    delete p._imgId;
    delete p._archivo;
    delete p._link;
    delete p._necesitaDetalle;
  }

  /* 5. fusionar con el catálogo actual ------------------------------- */

  // Primera sincronización: si no baja al menos el 80% de las imágenes,
  // abortar sin publicar nada (deshacería los productos manuales con logos).
  const primeraVez = anteriores.size === 0;
  if (cfg.descargarImagenes && primeraVez && descargadas < Math.ceil(productos.length * 0.8)) {
    throw new Error(
      `Primera sincronización: sólo ${descargadas} imágenes de ${productos.length} descargadas. ` +
      'El proveedor bloquea las peticiones masivas; no se publica el catálogo. ' +
      'Reintentá más tarde o pedile a argseguridad.com un feed para revendedores.',
    );
  }

  let nuevos = 0;
  let cambiados = 0;
  for (const p of productos) {
    const prev = anteriores.get(p.id);
    if (!prev) nuevos++;
    else if (prev.precio !== p.precio || prev.imagen !== p.imagen || prev.titulo !== p.titulo)
      cambiados++;
  }
  const retirados = [...anteriores.keys()].filter((id) => !vistos.has(id)).length;

  const salida = {
    config: actual.config,
    productos: [...manuales, ...productos],
  };

  log(
    `Resultado: ${productos.length} del proveedor (+${nuevos} nuevos, ${cambiados} con cambios, ${retirados} retirados) · ${manuales.length} manuales`,
  );

  if (DRY) {
    log('Modo --dry-run: no se escribe nada.');
    return;
  }

  const cambios = await escribirSiCambia(CATALOG_PATH, salida);

  if (cfg.descargarImagenes && cambios) {
    const borradas = await limpiarImagenes(vigentes);
    if (borradas) log(`Imágenes viejas eliminadas: ${borradas}`);
  }

  if (!cambios) log('Catálogo sin novedades.');
}

main().catch((e) => {
  console.error('[proveedor] ERROR:', e.message);
  process.exitCode = 1;
});
