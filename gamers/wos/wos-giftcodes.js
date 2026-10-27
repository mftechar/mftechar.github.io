/* MF Tech AR — WoS Gift Codes
   Perfil de líder de alianza + canje de códigos para hasta 100 IDs.
   El perfil y la clave se quedan en este navegador (PBKDF2-SHA256).
   El canje real se hace a través de un puente propio (local o Cloudflare Worker). */

(() => {
  'use strict';

  const root = document.getElementById('giftApp');
  if (!root) return;

  /* ---------------- constantes y utilidades ---------------- */

  const PREFIX = 'mftech-wos:gift:';
  const KEY_PROFILE = PREFIX + 'profile';
  const KEY_HISTORY = PREFIX + 'history';
  const KEY_CFG = PREFIX + 'cfg';
  const UNLOCK_KEY = PREFIX + 'unlocked';
  const MAX_IDS = 100;
  const MAX_HISTORY = 12;
  const PBKDF2_ITER = 210000;
  const DEFAULT_BRIDGE = '/api/giftcode';
  // Puente compartido del sitio: se completa con la URL del Worker cuando esté
  // desplegado. Mientras esté vacío, la página usa el puente local (/api/giftcode).
  const SITE_BRIDGE = '';
  const IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname);

  const $ = (sel, ctx = root) => ctx.querySelector(sel);
  const $$ = (sel, ctx = root) => Array.from(ctx.querySelectorAll(sel));

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const LS = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    del(key) {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const newId = () =>
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const stamp = () => new Date().toISOString();
  const fmtDate = (iso) => {
    try {
      return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '';
    }
  };
  const today = () => new Date().toISOString().slice(0, 10);
  const initials = (name) =>
    String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || '')
      .join('')
      .toUpperCase() || '?';
  const digits = (v) => String(v ?? '').replace(/\D/g, '');

  let toastTimer;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function downloadCSV(filename, header, rows) {
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = [header, ...rows].map((r) => r.map(q).join(';')).join('\r\n');
    downloadFile(filename, '\ufeff' + csv, 'text/csv;charset=utf-8;');
    toast('Archivo exportado');
  }

  function setMsg(el, type, text) {
    if (!el) return;
    el.className = 'gift-inline-msg' + (type ? ' is-' + type : '');
    el.textContent = text || '';
  }

  /* ---------------- estado ---------------- */

  let profile = LS.get(KEY_PROFILE, null);
  let history = LS.get(KEY_HISTORY, []);
  let cfg = Object.assign(
    { bridge: '', delay: 1200, autoCheck: true, autoRedeem: true },
    LS.get(KEY_CFG, {})
  );
  if (!Array.isArray(history)) history = [];
  if (!Array.isArray(profile?.ids)) {
    if (profile) profile.ids = [];
  }

  const unlocked = () => {
    try {
      return sessionStorage.getItem(UNLOCK_KEY) === '1';
    } catch {
      return false;
    }
  };
  const setUnlocked = (on) => {
    try {
      if (on) sessionStorage.setItem(UNLOCK_KEY, '1');
      else sessionStorage.removeItem(UNLOCK_KEY);
    } catch {}
  };

  let mode = !profile ? 'create' : unlocked() ? 'dashboard' : 'locked';
  let avatarDraft = profile?.avatar || null;
  let run = null;
  let abortRun = false;
  let armed = false;
  let armedCode = '';
  let armTimer = 0;
  let lockAttempts = 0;
  let blockedUntil = 0;
  let deleteArmed = false;
  let deleteTimer = 0;
  let bridgeState = { checked: false, ok: false, message: 'Verificando conexión…' };
  let bridgeCheckSeq = 0;

  /* códigos activos de la comunidad */
  const KEY_SEEN = PREFIX + 'seen';
  const CODES_INTERVAL_MS = 4 * 60 * 60 * 1000; // revisa cada 4 h: hasta 6 veces al día
  let codes = LS.get(PREFIX + 'codes', []);
  if (!Array.isArray(codes)) codes = [];
  let lastCodesCheck = Number(LS.get(PREFIX + 'codesAt', 0)) || 0;
  let codesLoading = false;

  /* ---------------- clave ---------------- */

  const b64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function hashPassword(pass, saltB64, iter) {
    if (!window.crypto?.subtle) {
      throw new Error('Este navegador necesita HTTPS para proteger la clave. Probá desde https:// o localhost.');
    }
    const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: iter || PBKDF2_ITER, hash: 'SHA-256' },
      key,
      256
    );
    return { salt: b64(salt), hash: b64(bits), iter: iter || PBKDF2_ITER };
  }

  function sameHash(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  async function verifyPassword(pass, record) {
    if (!record?.salt || !record?.hash) return false;
    const derived = await hashPassword(pass, record.salt, record.iter);
    return sameHash(derived.hash, record.hash);
  }

  function passScore(pass) {
    let score = 0;
    if (pass.length >= 8) score++;
    if (pass.length >= 12) score++;
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score++;
    if (/\d/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return Math.min(4, score);
  }

  const PASS_LABELS = ['Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'];

  /* ---------------- avatar ---------------- */

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer la imagen.'));
      };
      img.src = url;
    });
  }

  async function processAvatar(file) {
    if (!file) return null;
    if (!/^image\//.test(file.type)) throw new Error('Elegí un archivo de imagen (JPG, PNG o WebP).');
    if (file.size > 8 * 1024 * 1024) throw new Error('La imagen no puede superar 8 MB.');

    let source;
    try {
      source = await createImageBitmap(file);
    } catch {
      source = await loadImage(file);
    }

    const width = source.width || source.naturalWidth;
    const height = source.height || source.naturalHeight;
    const side = Math.min(width, height);
    let sx = 0;
    let sy = 0;
    if (width > side) sx = (width - side) / 2;
    if (height > side) sy = (height - side) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, side, side, 0, 0, 256, 256);
    if (source.close) source.close();

    let data = canvas.toDataURL('image/jpeg', 0.85);
    if (data.length > 220000) data = canvas.toDataURL('image/jpeg', 0.7);
    return data;
  }

  const avatarHtml = (src, name, opts = {}) => {
    const size = opts.size === 'big' ? ' gift-avatar--big' : '';
    const badge = opts.badge === false ? '' : '<span class="gift-leader-badge">Líder</span>';
    return (
      `<div class="gift-avatar${size}">` +
      (src ? `<img src="${esc(src)}" alt="Avatar del líder" loading="lazy">` : `<span>${esc(initials(name))}</span>`) +
      badge +
      '</div>'
    );
  };

  // Actualiza la vista previa sin volver a pintar el formulario (no pierde lo escrito).
  function paintAvatarPreview() {
    const preview = $('#avatarPreview');
    if (!preview) return;
    const name = $('#gift-username')?.value || profile?.username || '';
    preview.innerHTML =
      (avatarDraft ? `<img src="${esc(avatarDraft)}" alt="Vista previa del avatar">` : `<span>${esc(initials(name))}</span>`) +
      '<span class="gift-leader-badge">Líder</span>';
    const remove = $('#removeAvatar');
    if (remove) remove.hidden = !avatarDraft;
  }

  /* ---------------- validaciones ---------------- */

  const validUser = (v) => /^[\p{L}\p{N} ._-]{3,24}$/u.test(v);
  const validAlliance = (v) => v.length >= 2 && v.length <= 40;
  const validTag = (v) => /^[A-Za-z0-9]{1,6}$/.test(v);
  const validRegion = (v) => /^\d{1,6}$/.test(v) && Number(v) > 0;
  const validPlayerId = (v) => /^\d{6,12}$/.test(v);
  const validCode = (v) => /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(v);

  function passwordProblem(pass) {
    if (pass.length < 8) return 'La clave necesita al menos 8 caracteres.';
    if (!/[A-Za-z]/.test(pass)) return 'Agregá al menos una letra.';
    if (!/\d/.test(pass)) return 'Agregá al menos un número.';
    return '';
  }

  /* ---------------- puente ---------------- */

  function bridgeBase() {
    let saved = String(cfg.bridge || '').trim();
    // Versiones anteriores guardaban /api/giftcode como si fuera una elección.
    if (saved === DEFAULT_BRIDGE && !IS_LOCAL) saved = '';
    let base = saved || SITE_BRIDGE || (IS_LOCAL ? DEFAULT_BRIDGE : '');
    base = base.replace(/\/+$/, '');
    base = base.replace(/\/(redeem|health|codes)$/i, '');
    return base;
  }

  function setBridgeStatus(ok, text) {
    bridgeState = { checked: true, ok, message: text };
    paintBridge();
  }

  function paintBridge() {
    const pill = $('#bridgePill');
    if (pill) {
      pill.className = 'gift-bridge ' + (bridgeState.ok ? 'is-ok' : bridgeState.checked ? 'is-off' : 'is-checking');
      pill.innerHTML =
        '<i class="dot" aria-hidden="true"></i>' +
        `<span>${esc(bridgeState.message)}</span>` +
        '<button type="button" class="mini-btn" data-act="test-bridge">Probar</button>';
    }

    const status = $('#bridgeStatus');
    if (status) {
      status.className = 'gift-bridge-status ' + (bridgeState.ok ? 'is-ok' : bridgeState.checked ? 'is-off' : 'is-checking');
      status.innerHTML =
        `<b>${esc(bridgeState.message)}</b>` +
        `<span>${esc(bridgeBase())}</span>`;
    }

    const warn = $('#bridgeWarning');
    if (warn) warn.hidden = bridgeState.ok;

    const autoToggle = $('#autoToggle');
    if (autoToggle) {
      autoToggle.disabled = !bridgeState.ok;
      autoToggle.title = bridgeState.ok
        ? ''
        : 'El canje automático desde la página necesita el puente. Con GitHub Actions podés canjear sin puente.';
      autoToggle.closest('.gift-auto-toggle')?.classList.toggle('is-disabled', !bridgeState.ok);
    }

    paintRedeemBtn();
    redemptionHint();
  }

  async function checkBridge(announce = false) {
    const seq = ++bridgeCheckSeq;
    bridgeState = { checked: false, ok: false, message: 'Verificando conexión…' };
    paintBridge();

    const base = bridgeBase();
    if (!base) {
      setBridgeStatus(false, 'Canje en vivo no disponible todavía');
      if (announce) toast('El canje en vivo todavía no está activado en el sitio.');
      return false;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(base + '/health', {
        method: 'GET',
        cache: 'no-store',
        signal: ctrl.signal,
        headers: { Accept: 'application/json' }
      });
      const data = await res.json().catch(() => null);
      if (seq !== bridgeCheckSeq) return false;
      if (res.ok && data && data.ok) {
        setBridgeStatus(true, 'Canje conectado');
        if (announce) toast('Conexión OK: el canje real está disponible');
        return true;
      }
      setBridgeStatus(
        false,
        res.status === 404 ? 'Sin puente en esta dirección' : 'El puente respondió con un error'
      );
      if (announce) toast('No se pudo conectar con el puente');
      return false;
    } catch {
      if (seq !== bridgeCheckSeq) return false;
      setBridgeStatus(false, 'Sin conexión con el puente');
      if (announce) toast('No se pudo conectar. Revisá la URL del puente.');
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function apiRedeem(id, code, region) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(bridgeBase() + '/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id, code, region: String(region) }),
        signal: ctrl.signal
      });
      const data = await res.json().catch(() => null);
      if (!data) {
        return { status: 'error', message: `El puente respondió ${res.status} sin datos.` };
      }
      if (!res.ok && data.ok !== false) {
        return { status: 'error', message: data.message || `El puente respondió ${res.status}.` };
      }
      return {
        status: data.status || 'error',
        message: data.message || '',
        nickname: data.nickname || ''
      };
    } catch (e) {
      if (e?.name === 'AbortError') {
        return { status: 'timeout', message: 'El puente tardó demasiado en responder.' };
      }
      return { status: 'offline', message: 'No se pudo conectar con el puente.' };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------------- miembros ---------------- */

  function saveProfile() {
    const ok = LS.set(KEY_PROFILE, profile);
    if (!ok) toast('No se pudo guardar. Revisá el espacio del navegador o usá un avatar más liviano.');
    return ok;
  }

  function saveHistory() {
    LS.set(KEY_HISTORY, history.slice(0, MAX_HISTORY));
  }

  function addMember(raw) {
    const id = String(raw ?? '').trim();
    if (!validPlayerId(id)) return { ok: false, reason: 'invalid' };
    if (profile.ids.some((m) => m.id === id)) return { ok: false, reason: 'dup' };
    if (profile.ids.length >= MAX_IDS) return { ok: false, reason: 'limit' };
    profile.ids.push({ id, addedAt: stamp() });
    saveProfile();
    return { ok: true, id };
  }

  function removeMember(id) {
    profile.ids = profile.ids.filter((m) => m.id !== id);
    saveProfile();
  }

  function membersHtml() {
    if (!profile.ids.length) {
      return (
        '<div class="empty">Todavía no cargaste IDs. Agregá el primero arriba o pegá una lista completa.</div>'
      );
    }
    const rows = profile.ids
      .map(
        (m, i) =>
          `<tr data-member="${esc(m.id)}">` +
          `<td>${i + 1}</td>` +
          `<td class="gift-id">${esc(m.id)}</td>` +
          `<td class="gift-muted">${esc(fmtDate(m.addedAt))}</td>` +
          `<td class="gift-row-actions"><button type="button" class="mini-btn danger" data-act="remove-id" data-id="${esc(
            m.id
          )}" aria-label="Quitar ID ${esc(m.id)}">Quitar</button></td>` +
          '</tr>'
      )
      .join('');
    return (
      '<div class="table-wrap gift-members-wrap"><table class="data-table gift-members-table">' +
      '<thead><tr><th>#</th><th>ID de jugador</th><th>Agregado</th><th></th></tr></thead>' +
      `<tbody>${rows}</tbody></table></div>`
    );
  }

  function paintMembers() {
    const body = $('#membersBody');
    if (!body) return;
    body.innerHTML = membersHtml();
    const count = profile.ids.length;
    const countEl = $('#memberCount');
    if (countEl) countEl.textContent = `${count} / ${MAX_IDS}`;
    const bar = $('#memberBar');
    if (bar) {
      bar.style.width = Math.min(100, (count / MAX_IDS) * 100) + '%';
      bar.classList.toggle('is-full', count >= MAX_IDS);
    }
    const hero = $('#heroIdCount');
    if (hero) hero.textContent = `${count}/${MAX_IDS} IDs`;
    paintRedeemBtn();
  }

  /* ---------------- canje ---------------- */

  const STATUS = {
    pending: ['Pendiente', 'is-pending'],
    running: ['Canjeando…', 'is-running'],
    ok: ['Canjeado', 'is-ok'],
    already: ['Ya canjeado', 'is-already'],
    expired: ['Código vencido', 'is-error'],
    invalid: ['Código inválido', 'is-error'],
    notfound: ['ID o región incorrectos', 'is-error'],
    rate: ['Demasiadas solicitudes', 'is-error'],
    timeout: ['Sin respuesta', 'is-error'],
    offline: ['Sin conexión', 'is-error'],
    error: ['Error', 'is-error'],
    canceled: ['Cancelado', 'is-pending']
  };

  const statusOf = (s) => STATUS[s] || [s || '—', 'is-error'];

  function countsOf(r) {
    const c = { ok: 0, already: 0, error: 0, pending: 0, canceled: 0 };
    for (const item of r?.results || []) {
      if (item.status === 'ok') c.ok++;
      else if (item.status === 'already') c.already++;
      else if (item.status === 'pending' || item.status === 'running') c.pending++;
      else if (item.status === 'canceled') c.canceled++;
      else c.error++;
    }
    return c;
  }

  function paintRedeemBtn() {
    const btn = $('#redeemBtn');
    if (!btn) return;
    const n = profile?.ids?.length || 0;
    btn.classList.toggle('is-armed', armed);
    if (run && run.status === 'running') {
      btn.disabled = true;
      btn.textContent = 'Canjeando…';
      return;
    }
    btn.disabled = !n;
    if (!n) btn.textContent = 'Agregá IDs para canjear';
    else if (armed) btn.textContent = `Confirmar canje para ${n} ID${n === 1 ? '' : 's'}`;
    else btn.textContent = `Canjear para ${n} ID${n === 1 ? '' : 's'}`;
  }

  function redemptionHint() {
    const el = $('#redeemHint');
    if (!el) return;
    const n = profile?.ids?.length || 0;
    const region = profile?.alliance?.region || '';
    if (armed) {
      el.className = 'gift-redeem-hint is-warn';
      el.textContent = `Vas a canjear el código en ${n} ID${n === 1 ? '' : 's'} del estado #${region}. Tocá de nuevo para confirmar.`;
    } else if (!bridgeState.ok) {
      el.className = 'gift-redeem-hint is-off';
      el.textContent = 'El canje en vivo no está disponible en este momento. Los códigos se siguen actualizando.';
    } else {
      el.className = 'gift-redeem-hint';
      el.textContent = `Se envía de a un ID, con una pausa de ${(cfg.delay / 1000).toFixed(1)} s. No cierres la pestaña durante el lote.`;
    }
  }

  function disarm() {
    armed = false;
    armedCode = '';
    clearTimeout(armTimer);
    paintRedeemBtn();
    redemptionHint();
  }

  function arm(code) {
    armed = true;
    armedCode = code;
    clearTimeout(armTimer);
    paintRedeemBtn();
    redemptionHint();
    armTimer = setTimeout(() => {
      if (armed) {
        disarm();
        toast('Confirmación cancelada');
      }
    }, 7000);
  }

  async function startRun(ids, code, source = 'manual') {
    if (!ids.length) return;
    if (profile.ids.length > MAX_IDS) ids = ids.slice(0, MAX_IDS);
    const region = profile.alliance.region;

    const online = await checkBridge(false);
    if (!online) {
      toast('Conectá el puente antes de canjear');
      $('#bridgeStatus')?.closest('.panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    abortRun = false;
    run = {
      id: newId(),
      code,
      region,
      source,
      at: stamp(),
      status: 'running',
      total: ids.length,
      results: ids.map((id) => ({ id, status: 'pending', message: '', at: '' }))
    };
    renderRunArea();
    paintRedeemBtn();

    let consecutiveNotFound = 0;
    let blocked = '';

    for (let i = 0; i < run.results.length; i++) {
      if (abortRun) break;
      const item = run.results[i];
      item.status = 'running';
      renderRunArea();

      const res = await apiRedeem(item.id, code, region);
      item.status = res.status;
      item.message = res.message || '';
      item.at = stamp();
      renderRunArea();

      if (res.status === 'notfound') consecutiveNotFound++;
      else consecutiveNotFound = 0;

      if (i === 0 && ['offline', 'rate', 'invalid', 'expired'].includes(res.status)) {
        blocked =
          res.status === 'offline'
            ? 'Se perdió la conexión con el puente.'
            : res.status === 'rate'
              ? 'El servidor del juego está limitando las solicitudes.'
              : res.status === 'invalid'
                ? 'El código no es válido. Se detuvo el lote.'
                : 'El código está vencido o no disponible. Se detuvo el lote.';
      }
      if (!blocked && consecutiveNotFound >= 3) {
        blocked = 'Tres IDs seguidos dieron “ID o región incorrectos”. Revisá el estado de la alianza.';
      }
      if (blocked) {
        for (let j = i + 1; j < run.results.length; j++) {
          run.results[j].status = 'canceled';
          run.results[j].message = 'No se envió: ' + blocked;
          run.results[j].at = stamp();
        }
        break;
      }

      if (i < run.results.length - 1 && !abortRun) await sleep(Math.max(300, Number(cfg.delay) || 1200));
    }

    if (abortRun) {
      for (const item of run.results) {
        if (item.status === 'pending' || item.status === 'running') {
          item.status = 'canceled';
          item.message = 'Detenido por el usuario.';
          item.at = stamp();
        }
      }
    }

    run.status = blocked ? 'stopped' : abortRun ? 'stopped' : 'done';
    run.note = blocked || (abortRun ? 'Detenido por el usuario.' : '');
    run.finishedAt = stamp();

    const c = countsOf(run);
    history = [run, ...history.filter((h) => h.id !== run.id)].slice(0, MAX_HISTORY);
    saveHistory();
    renderRunArea();
    paintHistory();
    paintRedeemBtn();
    markSeen(run.code);
    paintCodes();

    if (blocked) toast(blocked);
    else toast(`Lote terminado: ${c.ok} canjeados, ${c.already} ya tenían el código, ${c.error} con error.`);
  }

  function runAreaHtml() {
    if (!run) return '';
    const c = countsOf(run);
    const done = run.results.filter((r) => r.status !== 'pending' && r.status !== 'running').length;
    const pct = run.total ? Math.round((done / run.total) * 100) : 0;
    const running = run.status === 'running';

    const summary =
      !running
        ? `<div class="gift-run-summary">` +
          `<span class="gift-kpi is-ok"><b>${c.ok}</b> canjeados</span>` +
          `<span class="gift-kpi is-already"><b>${c.already}</b> ya canjeados</span>` +
          `<span class="gift-kpi is-error"><b>${c.error}</b> con error</span>` +
          (c.canceled ? `<span class="gift-kpi"><b>${c.canceled}</b> no enviados</span>` : '') +
          '</div>'
        : '';

    const note = !running && run.note ? `<div class="notice warn">${esc(run.note)}</div>` : '';

    const actions = running
      ? `<button type="button" class="btn btn-ghost btn-small" data-act="stop-run">Detener</button>`
      : `<div class="gift-run-actions">` +
        (c.error ? `<button type="button" class="btn btn-ghost btn-small" data-act="retry-run">Reintentar fallidos</button>` : '') +
        `<button type="button" class="btn btn-ghost btn-small" data-act="export-run">Exportar CSV</button>` +
        `<button type="button" class="btn btn-ghost btn-small" data-act="copy-run">Copiar resumen</button>` +
        '</div>';

    const rows = run.results
      .map((r, i) => {
        const st = statusOf(r.status);
        return (
          `<tr data-row="${esc(r.id)}">` +
          `<td>${i + 1}</td>` +
          `<td class="gift-id">${esc(r.id)}</td>` +
          `<td><span class="gift-st ${st[1]}">${esc(st[0])}</span></td>` +
          `<td class="gift-msg">${esc(r.message || '')}</td>` +
          '</tr>'
        );
      })
      .join('');

    return (
      '<div class="gift-run" aria-live="polite">' +
      `<div class="gift-run-head"><div><span class="gift-run-label">${running ? 'Canjeando' : 'Resultado del lote'}</span><b>${esc(
        run.code
      )}</b></div><span class="gift-run-count">${done} / ${run.total}</span></div>` +
      `<div class="gift-progress"><i style="width:${pct}%"></i></div>` +
      summary +
      note +
      actions +
      '<div class="table-wrap gift-results-wrap"><table class="data-table gift-results-table">' +
      '<thead><tr><th>#</th><th>ID</th><th>Estado</th><th>Detalle</th></tr></thead>' +
      `<tbody>${rows}</tbody></table></div>` +
      '</div>'
    );
  }

  function renderRunArea() {
    const area = $('#runArea');
    if (!area) return;
    area.innerHTML = runAreaHtml();
  }

  function paintHistory() {
    const list = $('#historyList');
    if (!list) return;
    if (!history.length) {
      list.innerHTML = '<div class="empty">Todavía no canjeaste ningún código.</div>';
      return;
    }
    list.innerHTML = history
      .slice(0, 6)
      .map((h) => {
        const c = countsOf(h);
        return (
          `<button type="button" class="gift-history-item" data-act="view-run" data-run="${esc(h.id)}">` +
          `<span class="gift-history-code">${esc(h.code)}</span>` +
          `<span class="gift-history-meta">${esc(fmtDate(h.at))} · #${esc(h.region)}</span>` +
          `<span class="gift-history-counts">${c.ok} OK · ${c.already} ya · ${c.error} error</span>` +
          '</button>'
        );
      })
      .join('');
  }

  /* ---------------- códigos de la comunidad ---------------- */

  const seenCodes = () => {
    const arr = LS.get(KEY_SEEN, []);
    return Array.isArray(arr) ? arr : [];
  };

  const markSeen = (code) => {
    const list = seenCodes();
    if (!list.includes(code)) {
      list.unshift(code);
      LS.set(KEY_SEEN, list.slice(0, 60));
    }
  };

  const historyCodes = () => new Set(history.map((h) => String(h.code || '').toUpperCase()));

  function newCodes() {
    const seen = new Set(seenCodes());
    const done = historyCodes();
    return codes.filter((c) => !seen.has(c.code) && !done.has(c.code));
  }

  let codesSource = LS.get(PREFIX + 'codesSource', '') || '';

  async function fetchCodesFromSite() {
    try {
      const res = await fetch('./data/giftcodes.json', {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !Array.isArray(data.codes) || !data.codes.length) return null;
      return data;
    } catch {
      return null;
    }
  }

  async function checkCodes(announce = false, force = false) {
    if (codesLoading) return false;
    if (!force && lastCodesCheck && Date.now() - lastCodesCheck < CODES_INTERVAL_MS) {
      paintCodes();
      return true;
    }
    codesLoading = true;
    paintCodes();
    try {
      // 1) Lista publicada por GitHub Actions (no necesita servidor)
      const site = await fetchCodesFromSite();
      if (site) {
        codes = site.codes.map((c) => ({ code: String(c.code).toUpperCase(), publishedAt: c.publishedAt || '' }));
        codesSource = 'GitHub Actions';
        LS.set(PREFIX + 'codesSource', codesSource);
        lastCodesCheck = Date.now();
        LS.set(PREFIX + 'codes', codes);
        LS.set(PREFIX + 'codesAt', String(lastCodesCheck));
        paintCodes();
        if (announce) toast(`Revisión completa: ${codes.length} códigos activos`);
        maybeAutoRedeem();
        return true;
      }

      // 2) Puente (sirve en local o con Worker desplegado)
      const res = await fetch(bridgeBase() + '/codes', {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const data = await res.json().catch(() => null);
      if (data?.ok && Array.isArray(data.codes)) {
        codes = data.codes;
        codesSource = 'puente de canje';
        LS.set(PREFIX + 'codesSource', codesSource);
        lastCodesCheck = Date.now();
        LS.set(PREFIX + 'codes', codes);
        LS.set(PREFIX + 'codesAt', String(lastCodesCheck));
        paintCodes();
        if (announce) toast(`Revisión completa: ${codes.length} códigos activos`);
        maybeAutoRedeem();
        return true;
      }
      if (announce) toast('No se pudo traer la lista de códigos. Probá de nuevo.');
      return false;
    } catch {
      if (announce) toast('Sin conexión para revisar códigos.');
      return false;
    } finally {
      codesLoading = false;
      paintCodes();
    }
  }

  function maybeAutoRedeem() {
    if (!cfg.autoRedeem || !bridgeState.ok) return;
    if (run && run.status === 'running') return;
    const pending = newCodes();
    if (!pending.length || !profile.ids.length) return;
    autoRunQueue(pending.map((c) => c.code));
  }

  let autoQueueBusy = false;

  async function autoRunQueue(list) {
    if (autoQueueBusy) return;
    autoQueueBusy = true;
    try {
      for (const code of list) {
        if (run && run.status === 'running') break;
        if (!profile.ids.length) break;
        await startRun(profile.ids.map((m) => m.id), code, 'auto');
        markSeen(code);
      }
    } finally {
      autoQueueBusy = false;
    }
  }

  function codesListHtml() {
    if (codesLoading && !codes.length) {
      return '<div class="empty">Buscando códigos activos…</div>';
    }
    if (!codes.length) {
      return '<div class="empty">Sin datos todavía. Tocá “Revisar ahora”.</div>';
    }
    const done = historyCodes();
    const seen = new Set(seenCodes());
    const fresh = new Set(newCodes().map((c) => c.code));

    return codes
      .slice(0, 12)
      .map((c) => {
        let state = '';
        if (fresh.has(c.code)) state = '<span class="gift-st is-running">Nuevo</span>';
        else if (done.has(c.code)) state = '<span class="gift-st is-ok">Canjeado</span>';
        else if (seen.has(c.code)) state = '<span class="gift-st is-pending">Ignorado</span>';
        let d = '';
        if (c.publishedAt) {
          try {
            d = new Date(c.publishedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
          } catch {}
        }
        return (
          '<div class="gift-code-row-item">' +
          `<span class="gift-history-code">${esc(c.code)}</span>` +
          (d ? `<span class="gift-history-meta">${esc(d)}</span>` : '') +
          state +
          '<span class="gift-code-actions">' +
          `<button type="button" class="mini-btn primary" data-act="redeem-code" data-code="${esc(c.code)}" ${profile.ids.length ? '' : 'disabled'}>Canjear</button>` +
          (fresh.has(c.code) ? `<button type="button" class="mini-btn" data-act="ignore-code" data-code="${esc(c.code)}">Ignorar</button>` : '') +
          '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  async function checkGithubConfig() {
    const box = $('#ghStatus');
    if (!box) return;
    try {
      const res = await fetch('./giftcodes.config.json', {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      const ids = Array.isArray(data.ids) ? data.ids.filter(Boolean).length : 0;
      const region = String(data.region || '').trim();
      box.hidden = false;
      if (data.enabled && ids && region) {
        box.className = 'notice ok';
        box.innerHTML =
          '<b>Canje automático en GitHub: activo.</b> ' +
          ids +
          ' ID' +
          (ids === 1 ? '' : 's') +
          ', región ' +
          esc(region) +
          '. Corre 6 veces al día (00, 04, 08, 12, 16 y 20 UTC).';
      } else {
        box.className = 'notice warn';
        box.innerHTML =
          '<b>Canje automático en GitHub: sin configurar.</b> Descargá el config con la región y los IDs y subilo a <code>gamers/wos/giftcodes.config.json</code>. Mientras tanto solo funciona el botón «Canjear» (con puente).';
      }
    } catch {
      box.hidden = false;
      box.className = 'notice warn';
      box.textContent = 'No se pudo leer giftcodes.config.json desde el sitio.';
    }
  }

  function paintCodes() {
    const list = $('#codesList');
    if (list) list.innerHTML = codesListHtml();
    const meta = $('#codesMeta');
    if (meta) {
      const cuando = lastCodesCheck
        ? new Date(lastCodesCheck).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
        : 'nunca';
      const origen = codesSource ? ` · fuente: ${codesSource}` : ' · lista guardada';
      meta.textContent = `Última revisión: ${cuando}${origen} · Se revisa sola cada 4 horas (6 veces por día).`;
    }
    paintAutoBanner();
  }

  function paintAutoBanner() {
    const banner = $('#autoCodeBanner');
    if (!banner) return;
    const fresh = newCodes();
    if (!fresh.length || (run && run.status === 'running')) {
      banner.hidden = true;
      banner.innerHTML = '';
      return;
    }
    const first = fresh[0];
    banner.hidden = false;
    banner.innerHTML =
      `<span class="gift-banner-code">Código nuevo: <b>${esc(first.code)}</b></span>` +
      `<button type="button" class="btn btn-primary btn-small" data-act="redeem-code" data-code="${esc(first.code)}" ${profile.ids.length ? '' : 'disabled'}>Canjear ahora</button>` +
      `<button type="button" class="mini-btn" data-act="ignore-code" data-code="${esc(first.code)}">Ignorar</button>`;
  }

  function exportBackup() {
    if (!profile) return;
    const data = {
      app: 'mftech-wos-giftcodes',
      version: 1,
      exportedAt: stamp(),
      profile,
      history
    };
    downloadFile(
      `wos-gift-codes-respaldo-${today()}.json`,
      JSON.stringify(data, null, 2),
      'application/json;charset=utf-8;'
    );
    toast('Respaldo exportado');
  }

  async function importBackup(file) {
    if (!file) return;
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      toast('El archivo no es un respaldo válido.');
      return;
    }
    const p = data.profile;
    if (
      data.app !== 'mftech-wos-giftcodes' ||
      !p ||
      !p.username ||
      !p.pass?.hash ||
      !p.pass?.salt ||
      !Number(p.pass?.iter) ||
      !validRegion(String(p.alliance?.region))
    ) {
      toast('El respaldo no tiene un perfil válido.');
      return;
    }
    if (!confirm('Esto reemplaza el perfil y el historial actuales. ¿Continuar?')) return;

    profile = {
      v: 1,
      username: String(p.username),
      pass: p.pass,
      alliance: {
        name: String(p.alliance.name || ''),
        tag: String(p.alliance.tag || ''),
        region: String(p.alliance.region)
      },
      avatar: typeof p.avatar === 'string' ? p.avatar : null,
      ids: Array.isArray(p.ids)
        ? p.ids
            .filter((m) => m && validPlayerId(String(m.id)))
            .slice(0, MAX_IDS)
            .map((m) => ({ id: String(m.id), addedAt: m.addedAt || stamp() }))
        : [],
      createdAt: p.createdAt || stamp(),
      updatedAt: stamp()
    };
    history = Array.isArray(data.history) ? data.history.slice(0, MAX_HISTORY) : [];
    LS.set(KEY_PROFILE, profile);
    saveHistory();
    avatarDraft = profile.avatar;
    setUnlocked(false);
    mode = 'locked';
    run = null;
    render();
    toast('Respaldo importado');
  }

  /* ---------------- vistas ---------------- */

  function avatarFieldHtml() {
    return (
      '<div class="gift-avatar-field">' +
      `<div class="gift-avatar gift-avatar--preview" id="avatarPreview">` +
      (avatarDraft
        ? `<img src="${esc(avatarDraft)}" alt="Vista previa del avatar">`
        : '<span>?</span>') +
      '<span class="gift-leader-badge">Líder</span>' +
      '</div>' +
      '<div class="gift-avatar-copy">' +
      '<span class="gift-field-label">Foto del líder</span>' +
      '<div class="gift-avatar-actions">' +
      '<label class="mini-btn primary gift-file-btn">Elegir imagen<input type="file" id="avatarFile" accept="image/*" class="sr-only"></label>' +
      '<button type="button" class="mini-btn" id="removeAvatar" data-act="remove-avatar"' +
      (avatarDraft ? '' : ' hidden') +
      '>Quitar</button>' +
      '</div>' +
      '<span class="hint">Se recorta al centro y se guarda en este navegador. Máximo 8 MB.</span>' +
      '</div>' +
      '</div>'
    );
  }

  function viewCreate() {
    return (
      '<div class="gift-auth-grid">' +
      '<section class="panel gift-auth">' +
      '<header class="gift-section-head"><div><p class="eyebrow">Paso 1</p><h2 class="panel-title">Creá el perfil del líder</h2>' +
      '<p class="panel-sub">Con este perfil administrás la alianza en este navegador. La clave no se envía a ningún servidor.</p></div></header>' +
      '<form id="createForm" novalidate>' +
      avatarFieldHtml() +
      '<div class="fields">' +
      field('username', 'Nombre de usuario', 'text', { placeholder: 'Ej. Martín', autocomplete: 'username', maxlength: 24 }) +
      field('allianceName', 'Nombre de la alianza', 'text', { placeholder: 'Ej. Lobos del Norte', maxlength: 40 }) +
      field('allianceTag', 'Tag de alianza', 'text', { placeholder: 'Ej. LDN', maxlength: 6, hint: 'Hasta 6 letras o números.' }) +
      field('region', 'Estado / Región', 'text', { placeholder: 'Ej. 1234', inputmode: 'numeric', maxlength: 6, hint: 'Número que aparece en tu avatar. La API lo pide como kid.' }) +
      field('password', 'Clave segura', 'password', { placeholder: 'Mínimo 8 caracteres', autocomplete: 'new-password', hint: 'Al menos una letra y un número.' }) +
      field('password2', 'Repetir clave', 'password', { placeholder: 'Otra vez', autocomplete: 'new-password' }) +
      '</div>' +
      '<div class="gift-strength" id="passMeter" aria-hidden="true"><i></i><i></i><i></i><i></i><span>Seguridad de la clave</span></div>' +
      '<div class="gift-inline-msg" id="createMsg" role="alert"></div>' +
      '<div class="form-actions"><button type="submit" class="btn btn-primary">Crear perfil</button></div>' +
      '</form>' +
      '</section>' +
      '<aside class="panel gift-side">' +
      '<h2 class="panel-title">Cómo funciona</h2>' +
      '<ol class="gift-steps">' +
      '<li><b>Perfil local.</b> El avatar, la alianza y los IDs quedan en <code>localStorage</code>.</li>' +
      '<li><b>Clave protegida.</b> Se guarda un hash PBKDF2-SHA256 con sal. No se puede recuperar.</li>' +
      '<li><b>Hasta 100 IDs.</b> Todos comparten el estado de la alianza.</li>' +
      '<li><b>Canje real.</b> Con el puente conectado, cada ID se envía a la API oficial del juego.</li>' +
      '</ol>' +
      '<div class="notice">El canje automático no es una simulación: usa la misma API que la web oficial. Necesita un puente propio (se incluye el código y los pasos).</div>' +
      '</aside>' +
      '</div>'
    );
  }

  function viewLocked() {
    return (
      '<div class="gift-lock-wrap">' +
      '<section class="panel gift-lock">' +
      '<div class="gift-lock-head">' +
      avatarHtml(profile.avatar, profile.username, { size: 'big' }) +
      '<div><p class="eyebrow">Alianza</p><h2 class="panel-title">' +
      esc(`[${profile.alliance.tag}] ${profile.alliance.name}`) +
      '</h2><p class="panel-sub">@' +
      esc(profile.username) +
      ' · Estado #' +
      esc(profile.alliance.region) +
      ' · ' +
      profile.ids.length +
      '/100 IDs</p></div>' +
      '</div>' +
      '<form id="unlockForm" novalidate>' +
      '<div class="field"><label for="unlockPass">Clave del perfil</label>' +
      '<input id="unlockPass" name="password" type="password" autocomplete="current-password" placeholder="Tu clave" autofocus></div>' +
      '<div class="gift-inline-msg" id="lockMsg" role="alert"></div>' +
      '<div class="form-actions"><button type="submit" class="btn btn-primary">Entrar</button>' +
      '<button type="button" class="btn btn-ghost btn-small" data-act="export-backup">Exportar respaldo</button></div>' +
      '</form>' +
      '<p class="gift-fineprint">La clave protege el acceso en este equipo. Si la olvidaste, no se puede recuperar: podés borrar el perfil desde un respaldo o empezar de nuevo.</p>' +
      '<div class="gift-lock-foot"><button type="button" class="mini-btn danger" data-act="delete-profile">Borrar perfil y empezar de nuevo</button></div>' +
      '</section>' +
      '</div>'
    );
  }

  function viewDashboard() {
    const count = profile.ids.length;
    return (
      '<section class="panel gift-profile">' +
      avatarHtml(profile.avatar, profile.username) +
      '<div class="gift-profile-main">' +
      '<p class="eyebrow">Perfil de líder</p>' +
      `<h2>[${esc(profile.alliance.tag)}] ${esc(profile.alliance.name)}</h2>` +
      `<p class="gift-meta">@${esc(profile.username)} · Estado / Región <b>#${esc(
        profile.alliance.region
      )}</b> · <span id="heroIdCount">${count}/${MAX_IDS} IDs</span></p>` +
      '</div>' +
      '<div class="gift-profile-actions">' +
      '<button type="button" class="mini-btn" data-act="edit">Editar perfil</button>' +
      '<button type="button" class="mini-btn" data-act="lock">Bloquear</button>' +
      '</div>' +
      '</section>' +

      '<div class="gift-grid">' +
      '<div class="gift-col">' +

      '<section class="panel gift-redeem">' +
      '<div class="gift-redeem-head"><div><h2 class="panel-title">Canjear gift code</h2>' +
      '<p class="panel-sub">Un código para todos los IDs registrados en la alianza.</p></div>' +
      '<div id="bridgePill" class="gift-bridge is-checking"><i class="dot"></i><span>Verificando conexión…</span><button type="button" class="mini-btn" data-act="test-bridge">Probar</button></div></div>' +
      '<div class="notice warn" id="bridgeWarning" hidden>El canje en vivo no está disponible en este momento. Podés seguir viendo y copiando los códigos.</div>' +
      '<form id="redeemForm" novalidate>' +
      '<label class="gift-code-label" for="giftCode">Código de regalo</label>' +
      '<div class="gift-code-row">' +
      '<input id="giftCode" name="code" class="gift-code-input" placeholder="EJ. WOS2026" maxlength="32" autocomplete="off" spellcheck="false" autocapitalize="characters">' +
      '<button type="submit" class="btn btn-primary gift-redeem-btn" id="redeemBtn" disabled>Agregá IDs para canjear</button>' +
      '</div>' +
      '<div class="gift-redeem-hint" id="redeemHint"></div>' +
      '</form>' +
      '<div class="gift-auto-banner" id="autoCodeBanner" hidden></div>' +
      '<div id="runArea"></div>' +
      '</section>' +

      '<section class="panel gift-members">' +
      '<div class="gift-members-head"><div><h2 class="panel-title">Miembros de la alianza</h2>' +
      '<p class="panel-sub">Hasta 100 IDs. Se usan únicamente al canjear.</p></div>' +
      '<button type="button" class="mini-btn" data-act="export-members">Exportar CSV</button></div>' +
      '<div class="gift-add-row">' +
      '<input id="memberId" inputmode="numeric" maxlength="12" placeholder="ID de jugador (6 a 12 dígitos)" autocomplete="off">' +
      '<button type="button" class="btn btn-primary btn-small" data-act="add-id">Agregar</button>' +
      '</div>' +
      '<div class="gift-limit"><div class="limit-track"><i class="limit-fill" id="memberBar" style="width:' +
      Math.min(100, (count / MAX_IDS) * 100) +
      '%"></i></div><span id="memberCount">' +
      count +
      ' / ' +
      MAX_IDS +
      '</span></div>' +
      '<div class="gift-inline-msg" id="memberMsg" role="alert"></div>' +
      '<details class="gift-bulk"><summary>Agregar varios IDs de una vez</summary>' +
      '<p class="hint">Pegá un ID por línea, separados por coma o espacio. Se ignoran los repetidos.</p>' +
      '<textarea id="bulkIds" rows="5" placeholder="123456789&#10;987654321"></textarea>' +
      '<div class="form-actions"><button type="button" class="btn btn-ghost btn-small" data-act="bulk-add">Agregar IDs</button></div>' +
      '</details>' +
      '<div id="membersBody">' +
      membersHtml() +
      '</div>' +
      '</section>' +

      '</div>' +

      '<aside class="gift-col gift-col--side">' +

      '<section class="panel gift-codes-panel">' +
      '<div class="gift-members-head"><div><h2 class="panel-title">Códigos activos</h2>' +
      '<p class="panel-sub">Detectados en wosgiftcodes.com. Reviso cada 4 horas si hay un código nuevo.</p></div>' +
      '<button type="button" class="mini-btn" data-act="check-codes">Revisar ahora</button></div>' +
      '<span class="hint" id="codesMeta"></span>' +
      '<div id="codesList" class="gift-codes-list"></div>' +
      '<label class="gift-auto-toggle"><input type="checkbox" id="autoToggle"' +
      (cfg.autoRedeem ? ' checked' : '') +
      '><span><b>Canje automático</b>: si aparece un código nuevo, se canjea solo para todos los IDs de tu alianza mientras la página esté abierta.</span></label>' +
      '</section>' +

      '<section class="panel">' +
      '<div class="gift-members-head"><h2 class="panel-title">Historial</h2>' +
      '<span class="hint">Últimos ' +
      MAX_HISTORY +
      '</span></div>' +
      '<div id="historyList" class="gift-history">' +
      (history.length ? '' : '<div class="empty">Todavía no canjeaste ningún código.</div>') +
      '</div>' +
      '</section>' +

      '<details class="gift-advanced"><summary>Opciones avanzadas</summary>' +
      '<section class="panel" id="bridgePanel">' +
      '<h2 class="panel-title">Canje en vivo</h2>' +
      '<p class="panel-sub">La página hace el canje a través de un puente propio, porque el navegador no puede llamar a la API del juego directamente. Con el puente del sitio configurado no tenés que hacer nada.</p>' +
      '<div class="notice" id="ghStatus" hidden></div>' +
      (SITE_BRIDGE
        ? ''
        : '<div class="field"><label for="bridgeUrl">URL del puente</label>' +
          '<input id="bridgeUrl" name="bridgeUrl" type="text" value="' +
          esc(cfg.bridge) +
          '" placeholder="/api/giftcode" autocomplete="off" spellcheck="false">' +
          '<span class="hint">En tu PC: /api/giftcode. Publicado: la URL del Worker del sitio.</span></div>') +
      '<div class="form-actions"><button type="button" class="btn btn-primary btn-small" data-act="save-bridge">Guardar</button>' +
      '<button type="button" class="btn btn-ghost btn-small" data-act="test-bridge">Probar conexión</button></div>' +
      '<div id="bridgeStatus" class="gift-bridge-status is-checking"><b>Verificando conexión…</b><span>' +
      esc(bridgeBase()) +
      '</span></div>' +
      '<div class="field gift-delay"><label for="delaySel">Pausa entre IDs</label>' +
      '<select id="delaySel"><option value="800"' +
      (Number(cfg.delay) === 800 ? ' selected' : '') +
      '>0,8 s (rápido)</option><option value="1200"' +
      (Number(cfg.delay) === 1200 ? ' selected' : '') +
      '>1,2 s (recomendado)</option><option value="2000"' +
      (Number(cfg.delay) === 2000 ? ' selected' : '') +
      '>2 s (conservador)</option></select>' +
      '<span class="hint">100 IDs tardan entre 2 y 5 minutos, aproximadamente.</span></div>' +
      '<details class="gift-setup"><summary>Canje automático sin abrir la página (solo dueño del sitio)</summary>' +
      '<p class="hint">Esto no lo necesitan los visitantes: usa el repositorio del sitio. Descargá el config y subilo a <code>gamers/wos/giftcodes.config.json</code>; GitHub Actions canjea esos IDs 6 veces al día aunque nadie abra la página.</p>' +
      '<div class="form-actions gift-config-actions">' +
      '<button type="button" class="btn btn-ghost btn-small" data-act="download-config">Descargar config para GitHub</button>' +
      '</div>' +
      '<p class="hint">Para probar en tu PC: <code>node server-local.js</code> y usá <code>/api/giftcode</code>.</p>' +
      '</details>' +
      '</section>' +
      '</details>' +

      '</aside>' +
      '</div>'
    );
  }

  function viewEdit() {
    return (
      '<div class="tool-head"><div><p class="eyebrow">Perfil</p><h2>Editar perfil y seguridad</h2>' +
      '<p>Cambiá los datos de la alianza, el avatar o la clave. Los IDs no se tocan desde acá.</p></div>' +
      '<button type="button" class="btn btn-ghost btn-small" data-act="cancel-edit">← Volver</button></div>' +
      '<div class="gift-auth-grid">' +
      '<section class="panel">' +
      '<h2 class="panel-title">Datos del líder y la alianza</h2>' +
      '<p class="panel-sub">El estado / región se usa como <code>kid</code> en cada canje.</p>' +
      '<form id="editForm" novalidate>' +
      avatarFieldHtml() +
      '<div class="fields">' +
      field('username', 'Nombre de usuario', 'text', { value: profile.username, maxlength: 24, autocomplete: 'username' }) +
      field('allianceName', 'Nombre de la alianza', 'text', { value: profile.alliance.name, maxlength: 40 }) +
      field('allianceTag', 'Tag de alianza', 'text', { value: profile.alliance.tag, maxlength: 6 }) +
      field('region', 'Estado / Región', 'text', { value: profile.alliance.region, inputmode: 'numeric', maxlength: 6, hint: 'Si lo cambiás, los canjes usan el nuevo estado.' }) +
      '</div>' +
      '<div class="gift-inline-msg" id="editMsg" role="alert"></div>' +
      '<div class="form-actions"><button type="submit" class="btn btn-primary">Guardar cambios</button>' +
      '<button type="button" class="btn btn-ghost btn-small" data-act="cancel-edit">Cancelar</button></div>' +
      '</form>' +
      '</section>' +

      '<div class="gift-col">' +
      '<section class="panel">' +
      '<h2 class="panel-title">Cambiar clave</h2>' +
      '<form id="passForm" novalidate>' +
      '<div class="fields">' +
      field('current', 'Clave actual', 'password', { autocomplete: 'current-password' }) +
      field('next', 'Clave nueva', 'password', { autocomplete: 'new-password', hint: 'Mínimo 8, con letra y número.' }) +
      field('next2', 'Repetir clave nueva', 'password', { autocomplete: 'new-password' }) +
      '</div>' +
      '<div class="gift-inline-msg" id="passMsg" role="alert"></div>' +
      '<div class="form-actions"><button type="submit" class="btn btn-primary btn-small">Actualizar clave</button></div>' +
      '</form>' +
      '</section>' +
      '<section class="panel">' +
      '<h2 class="panel-title">Respaldo</h2>' +
      '<p class="panel-sub">El perfil y el historial viven en este navegador. Exportá un JSON para no perderlos.</p>' +
      '<div class="form-actions" style="margin-top:0">' +
      '<button type="button" class="btn btn-ghost btn-small" data-act="export-backup">Exportar respaldo</button>' +
      '<label class="btn btn-ghost btn-small gift-file-btn">Importar respaldo<input type="file" id="importFile" accept="application/json,.json" class="sr-only"></label>' +
      '</div>' +
      '</section>' +
      '<section class="panel gift-danger">' +
      '<h2 class="panel-title">Zona peligrosa</h2>' +
      '<p class="panel-sub">Borra el perfil, los IDs, el avatar y el historial de este navegador. No se puede deshacer.</p>' +
      '<button type="button" class="btn btn-ghost btn-small gift-delete-btn" data-act="delete-profile">Borrar perfil y todos los datos</button>' +
      '</section>' +
      '</div>' +
      '</div>'
    );
  }

  function field(name, label, type, opts = {}) {
    const id = 'gift-' + name;
    const value = opts.value ?? '';
    return (
      '<div class="field' +
      (opts.full ? ' full' : '') +
      '"><label for="' +
      id +
      '">' +
      esc(label) +
      '</label>' +
      `<input id="${id}" name="${name}" type="${type}" value="${esc(value)}"` +
      (opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : '') +
      (opts.autocomplete ? ` autocomplete="${esc(opts.autocomplete)}"` : '') +
      (opts.inputmode ? ` inputmode="${esc(opts.inputmode)}"` : '') +
      (opts.maxlength ? ` maxlength="${opts.maxlength}"` : '') +
      '>' +
      (opts.hint ? `<span class="hint">${esc(opts.hint)}</span>` : '') +
      '</div>'
    );
  }

  function render() {
    if (mode === 'create') root.innerHTML = viewCreate();
    else if (mode === 'locked') root.innerHTML = viewLocked();
    else if (mode === 'edit') root.innerHTML = viewEdit();
    else root.innerHTML = viewDashboard();

    paintAvatarPreview();
    paintBridge();
    paintHistory();
    paintMembers();
    paintRedeemBtn();
    redemptionHint();
    paintCodes();

    if (mode === 'dashboard') {
      checkBridge(false).then(() => {
        if (cfg.autoCheck && Date.now() - lastCodesCheck >= CODES_INTERVAL_MS) {
          checkCodes(false);
        }
      });
      checkGithubConfig();
    }
  }

  /* ---------------- acciones ---------------- */

  async function onCreate(form) {
    const msg = $('#createMsg');
    const fd = new FormData(form);
    const get = (n) => String(fd.get(n) || '').trim();

    const username = get('username');
    const allianceName = get('allianceName');
    const allianceTag = get('allianceTag').toUpperCase();
    const region = get('region');
    const pass = String(fd.get('password') || '');
    const pass2 = String(fd.get('password2') || '');

    if (!validUser(username)) return setMsg(msg, 'error', 'El usuario debe tener entre 3 y 24 caracteres (letras, números, espacios, punto, guion o guion bajo).');
    if (!validAlliance(allianceName)) return setMsg(msg, 'error', 'El nombre de la alianza debe tener entre 2 y 40 caracteres.');
    if (!validTag(allianceTag)) return setMsg(msg, 'error', 'El tag debe tener hasta 6 letras o números, sin espacios.');
    if (!validRegion(region)) return setMsg(msg, 'error', 'Ingresá el estado / región como número (por ejemplo 1234).');
    const passProblem = passwordProblem(pass);
    if (passProblem) return setMsg(msg, 'error', passProblem);
    if (pass !== pass2) return setMsg(msg, 'error', 'Las claves no coinciden.');

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Creando…';
    try {
      const hashed = await hashPassword(pass);
      profile = {
        v: 1,
        username,
        pass: hashed,
        alliance: { name: allianceName, tag: allianceTag, region },
        avatar: avatarDraft,
        ids: [],
        createdAt: stamp(),
        updatedAt: stamp()
      };
      if (!saveProfile()) throw new Error('No se pudo guardar el perfil en este navegador.');
      setUnlocked(true);
      mode = 'dashboard';
      run = null;
      render();
      toast('Perfil creado. Ya podés agregar IDs.');
    } catch (e) {
      setMsg(msg, 'error', e.message || 'No se pudo crear el perfil.');
      btn.disabled = false;
      btn.textContent = 'Crear perfil';
    }
  }

  async function onUnlock(form) {
    const msg = $('#lockMsg');
    const now = Date.now();
    if (now < blockedUntil) {
      setMsg(msg, 'error', `Demasiados intentos. Esperá ${Math.ceil((blockedUntil - now) / 1000)} s.`);
      return;
    }
    const pass = String(new FormData(form).get('password') || '');
    if (!pass) return setMsg(msg, 'error', 'Ingresá tu clave.');

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Verificando…';
    try {
      const ok = await verifyPassword(pass, profile.pass);
      if (!ok) {
        lockAttempts++;
        if (lockAttempts >= 5) {
          blockedUntil = Date.now() + 30000;
          lockAttempts = 0;
          setMsg(msg, 'error', 'Cinco intentos fallidos. Esperá 30 segundos.');
        } else {
          setMsg(msg, 'error', `Clave incorrecta. Te quedan ${5 - lockAttempts} intentos.`);
        }
        form.querySelector('input')?.select();
        return;
      }
      lockAttempts = 0;
      setUnlocked(true);
      mode = 'dashboard';
      render();
      toast('Perfil desbloqueado');
    } catch (e) {
      setMsg(msg, 'error', e.message || 'No se pudo verificar la clave.');
    } finally {
      if (mode === 'locked') {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
    }
  }

  async function onEdit(form) {
    const msg = $('#editMsg');
    const fd = new FormData(form);
    const get = (n) => String(fd.get(n) || '').trim();
    const username = get('username');
    const allianceName = get('allianceName');
    const allianceTag = get('allianceTag').toUpperCase();
    const region = get('region');

    if (!validUser(username)) return setMsg(msg, 'error', 'El usuario debe tener entre 3 y 24 caracteres válidos.');
    if (!validAlliance(allianceName)) return setMsg(msg, 'error', 'El nombre de la alianza debe tener entre 2 y 40 caracteres.');
    if (!validTag(allianceTag)) return setMsg(msg, 'error', 'El tag debe tener hasta 6 letras o números.');
    if (!validRegion(region)) return setMsg(msg, 'error', 'Ingresá un estado / región numérico válido.');
    if (String(region) !== String(profile.alliance.region) && !confirm('Cambiar el estado / región afecta a todos los canjes. ¿Confirmás?')) {
      return;
    }

    profile.username = username;
    profile.alliance = { name: allianceName, tag: allianceTag, region };
    profile.avatar = avatarDraft;
    profile.updatedAt = stamp();
    if (!saveProfile()) return setMsg(msg, 'error', 'No se pudo guardar. Revisá el espacio del navegador.');
    mode = 'dashboard';
    render();
    toast('Perfil actualizado');
  }

  async function onChangePass(form) {
    const msg = $('#passMsg');
    const fd = new FormData(form);
    const current = String(fd.get('current') || '');
    const next = String(fd.get('next') || '');
    const next2 = String(fd.get('next2') || '');

    if (!current) return setMsg(msg, 'error', 'Ingresá la clave actual.');
    const problem = passwordProblem(next);
    if (problem) return setMsg(msg, 'error', problem);
    if (next !== next2) return setMsg(msg, 'error', 'Las claves nuevas no coinciden.');

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      const ok = await verifyPassword(current, profile.pass);
      if (!ok) {
        setMsg(msg, 'error', 'La clave actual no es correcta.');
        return;
      }
      profile.pass = await hashPassword(next);
      profile.updatedAt = stamp();
      if (!saveProfile()) throw new Error('No se pudo guardar la clave nueva.');
      form.reset();
      setMsg(msg, 'ok', 'Clave actualizada.');
      toast('Clave actualizada');
    } catch (e) {
      setMsg(msg, 'error', e.message || 'No se pudo cambiar la clave.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Actualizar clave';
    }
  }

  function deleteProfile() {
    if (!confirm('Se borran el perfil, la clave, los IDs, el avatar y el historial de este navegador. ¿Continuar?')) return;
    LS.del(KEY_PROFILE);
    LS.del(KEY_HISTORY);
    LS.del(KEY_CFG);
    setUnlocked(false);
    profile = null;
    history = [];
    run = null;
    avatarDraft = null;
    mode = 'create';
    render();
    toast('Perfil eliminado');
  }

  function saveBridgeFromForm() {
    const input = $('#bridgeUrl');
    const raw = String(input?.value || '').trim();
    if (raw && !/^https?:\/\//i.test(raw) && !raw.startsWith('/')) {
      toast('La URL debe empezar con https:// o ser una ruta como /api/giftcode.');
      return;
    }
    cfg.bridge = raw;
    LS.set(KEY_CFG, cfg);
    toast(raw ? 'Conexión guardada' : 'Usando el puente del sitio');
    checkBridge(true);
  }

  function onRedeem(e) {
    e.preventDefault();
    const input = $('#giftCode');
    const code = String(input?.value || '').trim().toUpperCase();
    if (input) input.value = code;
    if (!profile.ids.length) return toast('Agregá al menos un ID.');
    if (!validCode(code)) return toast('Ingresá un código válido (letras, números, guion o guion bajo).');
    if (!bridgeState.ok) {
      toast('El canje en vivo no está disponible en este momento');
      const panel = $('#bridgePanel');
      const adv = panel?.closest('details');
      if (adv) adv.open = true;
      panel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!armed || armedCode !== code) {
      arm(code);
      return;
    }
    disarm();
    if (input) input.disabled = true;
    startRun(
      profile.ids.map((m) => m.id),
      code
    ).finally(() => {
      if (input) input.disabled = false;
    });
  }

  /* ---------------- eventos ---------------- */

  root.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    e.preventDefault();
    if (form.id === 'createForm') onCreate(form);
    else if (form.id === 'unlockForm') onUnlock(form);
    else if (form.id === 'editForm') onEdit(form);
    else if (form.id === 'passForm') onChangePass(form);
    else if (form.id === 'redeemForm') onRedeem(e);
  });

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const busy = run && run.status === 'running';

    if (act === 'test-bridge') {
      checkBridge(true);
      return;
    }
    if (act === 'check-codes') {
      checkCodes(true, true);
      return;
    }
    if (act === 'redeem-code') {
      const code = String(btn.dataset.code || '').trim().toUpperCase();
      if (busy) return toast('Esperá a que termine el lote o detenelo.');
      if (!code || !validCode(code)) return toast('Código inválido.');
      if (!profile.ids.length) return toast('Agregá IDs a la alianza primero.');
      await startRun(
        profile.ids.map((m) => m.id),
        code
      );
      return;
    }
    if (act === 'ignore-code') {
      const code = String(btn.dataset.code || '').trim().toUpperCase();
      if (code) {
        markSeen(code);
        paintCodes();
        toast(`Código ${code} ignorado`);
      }
      return;
    }
    if (act === 'download-config') {
      if (!profile) return;
      if (!profile.ids.length) return toast('Agregá IDs a la alianza primero.');
      const data = {
        enabled: true,
        region: String(profile.alliance.region),
        ids: profile.ids.map((m) => m.id),
        delayMs: Math.max(600, Number(cfg.delay) || 1500)
      };
      downloadFile('giftcodes.config.json', JSON.stringify(data, null, 2) + '\n', 'application/json;charset=utf-8;');
      toast('Config descargada. Subila a gamers/wos/giftcodes.config.json');
      return;
    }
    if (act === 'save-bridge') {
      saveBridgeFromForm();
      return;
    }
    if (act === 'lock') {
      if (busy) return toast('Esperá a que termine el lote o detenelo.');
      setUnlocked(false);
      disarm();
      mode = 'locked';
      render();
      return;
    }
    if (act === 'edit') {
      if (busy) return toast('Esperá a que termine el lote o detenelo.');
      avatarDraft = profile.avatar;
      mode = 'edit';
      render();
      return;
    }
    if (act === 'cancel-edit') {
      avatarDraft = profile.avatar;
      mode = 'dashboard';
      render();
      return;
    }
    if (act === 'remove-avatar') {
      avatarDraft = null;
      paintAvatarPreview();
      return;
    }
    if (act === 'add-id') {
      if (busy) return toast('Esperá a que termine el lote.');
      const input = $('#memberId');
      const value = String(input?.value || '').trim();
      const res = addMember(value);
      const msg = $('#memberMsg');
      if (!res.ok) {
        if (res.reason === 'invalid') setMsg(msg, 'error', 'El ID debe tener entre 6 y 12 dígitos.');
        else if (res.reason === 'dup') setMsg(msg, 'error', 'Ese ID ya está en la lista.');
        else setMsg(msg, 'error', 'Llegaste al límite de 100 IDs.');
        return;
      }
      setMsg(msg, 'ok', `ID ${value} agregado.`);
      if (input) input.value = '';
      paintMembers();
      input?.focus();
      return;
    }
    if (act === 'bulk-add') {
      if (busy) return toast('Esperá a que termine el lote.');
      const text = String($('#bulkIds')?.value || '');
      const tokens = text.split(/[\s,;]+/).filter(Boolean);
      const msg = $('#memberMsg');
      if (!tokens.length) return setMsg(msg, 'error', 'Pegá al menos un ID.');
      let added = 0;
      let dup = 0;
      let invalid = 0;
      let limit = 0;
      for (const token of tokens) {
        const clean = token.replace(/^#/, '');
        if (!validPlayerId(clean)) {
          invalid++;
          continue;
        }
        const res = addMember(clean);
        if (res.ok) added++;
        else if (res.reason === 'dup') dup++;
        else if (res.reason === 'limit') limit++;
        else invalid++;
      }
      paintMembers();
      const parts = [];
      if (added) parts.push(`${added} agregados`);
      if (dup) parts.push(`${dup} repetidos`);
      if (invalid) parts.push(`${invalid} inválidos`);
      if (limit) parts.push(`${limit} quedaron afuera por el límite`);
      setMsg(msg, added ? 'ok' : 'error', parts.join(' · ') || 'No se agregó ningún ID.');
      if (added) {
        const ta = $('#bulkIds');
        if (ta) ta.value = '';
        toast(`${added} ID${added === 1 ? '' : 's'} agregado${added === 1 ? '' : 's'}`);
      }
      return;
    }
    if (act === 'remove-id') {
      if (busy) return toast('Esperá a que termine el lote.');
      const id = btn.dataset.id;
      if (!id) return;
      if (!confirm(`¿Quitar el ID ${id} de la alianza?`)) return;
      removeMember(id);
      paintMembers();
      setMsg($('#memberMsg'), 'ok', `ID ${id} quitado.`);
      return;
    }
    if (act === 'export-members') {
      if (!profile.ids.length) return toast('No hay IDs para exportar.');
      downloadCSV(
        `wos-ids-${profile.alliance.tag || 'alianza'}-${today()}.csv`,
        ['ID', 'Agregado'],
        profile.ids.map((m) => [m.id, fmtDate(m.addedAt)])
      );
      return;
    }
    if (act === 'stop-run') {
      abortRun = true;
      btn.disabled = true;
      btn.textContent = 'Deteniendo…';
      return;
    }
    if (act === 'retry-run') {
      if (!run) return;
      const failed = run.results.filter((r) => ['error', 'timeout', 'offline', 'rate'].includes(r.status)).map((r) => r.id);
      if (!failed.length) return toast('No hay IDs para reintentar.');
      if (run.status === 'running') return toast('El lote todavía está en curso.');
      startRun(failed, run.code);
      return;
    }
    if (act === 'export-run') {
      if (!run) return;
      downloadCSV(
        `wos-gift-${run.code}-${today()}.csv`,
        ['ID', 'Estado', 'Detalle', 'Fecha'],
        run.results.map((r) => [r.id, statusOf(r.status)[0], r.message, fmtDate(r.at || run.at)])
      );
      return;
    }
    if (act === 'copy-run') {
      if (!run) return;
      const c = countsOf(run);
      const text =
        `Gift code ${run.code} — alianza [${profile.alliance.tag}] ${profile.alliance.name} (#${run.region})\n` +
        `Canjeados: ${c.ok} · Ya canjeados: ${c.already} · Errores: ${c.error} · No enviados: ${c.canceled}\n` +
        `Fecha: ${fmtDate(run.at)}`;
      try {
        await navigator.clipboard.writeText(text);
        toast('Resumen copiado');
      } catch {
        toast('No se pudo copiar. Exportá el CSV.');
      }
      return;
    }
    if (act === 'view-run') {
      const id = btn.dataset.run;
      const found = history.find((h) => h.id === id);
      if (!found) return;
      run = found;
      renderRunArea();
      $('#runArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (act === 'export-backup') {
      exportBackup();
      return;
    }
    if (act === 'delete-profile') {
      if (!deleteArmed) {
        deleteArmed = true;
        btn.textContent = 'Confirmar borrado definitivo';
        btn.classList.add('is-armed');
        clearTimeout(deleteTimer);
        deleteTimer = setTimeout(() => {
          deleteArmed = false;
          btn.textContent = 'Borrar perfil y todos los datos';
          btn.classList.remove('is-armed');
        }, 6000);
        toast('Tocá de nuevo para confirmar el borrado');
        return;
      }
      deleteArmed = false;
      clearTimeout(deleteTimer);
      deleteProfile();
      return;
    }
  });

  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'giftCode') {
      const pos = t.selectionStart;
      t.value = t.value.toUpperCase().replace(/\s+/g, '');
      try {
        t.setSelectionRange(pos, pos);
      } catch {}
      if (armed && t.value.trim() !== armedCode) disarm();
    }
    if (t.id === 'gift-password') {
      const meter = $('#passMeter');
      if (!meter) return;
      const score = passScore(t.value);
      meter.dataset.score = String(score);
      meter.querySelector('span').textContent = t.value ? PASS_LABELS[score] : 'Seguridad de la clave';
    }
    if (t.id === 'gift-username') paintAvatarPreview();
  });

  root.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'avatarFile') {
      const file = t.files && t.files[0];
      if (!file) return;
      try {
        avatarDraft = await processAvatar(file);
        paintAvatarPreview();
        toast('Avatar listo');
      } catch (err) {
        toast(err.message || 'No se pudo procesar la imagen.');
      } finally {
        t.value = '';
      }
      return;
    }
    if (t.id === 'importFile') {
      const file = t.files && t.files[0];
      if (file) await importBackup(file);
      t.value = '';
      return;
    }
    if (t.id === 'delaySel') {
      cfg.delay = Number(t.value) || 1200;
      LS.set(KEY_CFG, cfg);
      redemptionHint();
      toast(`Pausa entre IDs: ${(cfg.delay / 1000).toFixed(1)} s`);
    }
    if (t.id === 'autoToggle') {
      cfg.autoRedeem = Boolean(t.checked);
      LS.set(KEY_CFG, cfg);
      if (cfg.autoRedeem) {
        toast('Canje automático activado');
        maybeAutoRedeem();
      } else {
        toast('Canje automático desactivado');
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && armed) disarm();
  });

  document.addEventListener('visibilitychange', () => {
    if (
      document.visibilityState === 'visible' &&
      mode === 'dashboard' &&
      cfg.autoCheck &&
      bridgeState.ok &&
      Date.now() - lastCodesCheck >= CODES_INTERVAL_MS
    ) {
      checkCodes(false);
    }
  });

  setInterval(() => {
    if (mode === 'dashboard' && cfg.autoCheck && bridgeState.ok && !document.hidden) {
      checkCodes(false);
    }
  }, CODES_INTERVAL_MS);

  /* ---------------- arranque ---------------- */

  if (profile) {
    if (!profile.alliance) profile.alliance = { name: '', tag: '', region: '' };
    if (!Array.isArray(profile.ids)) profile.ids = [];
  }
  render();
})();
