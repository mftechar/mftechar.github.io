/* ============================================================================
   Historia Clínica Electrónica — MF Tech AR
   ----------------------------------------------------------------------------
   Herramienta para armar una historia clínica electrónica con las secciones
   exigidas: consentimientos informados, indicaciones médicas, planillas de
   enfermería, protocolos quirúrgicos, prescripciones dietarias, certificados
   de vacunación y estudios/prácticas realizadas, rechazadas o abandonadas.
   ========================================================================== */
(() => {
  'use strict';

function fmtFecha(s) {
  if (!s) return '—';
  if (window.mfFecha) return window.mfFecha.formatoFecha(s);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

  const secciones = [
    { id: 'consentimientos', titulo: 'Consentimientos informados', placeholder: 'Consentimientos informados firmados por el paciente o su representante legal...' },
    { id: 'indicaciones', titulo: 'Hojas de indicaciones médicas o profesionales', placeholder: 'Indicaciones médicas, prescripciones y órdenes profesionales...' },
    { id: 'enfermeria', titulo: 'Planillas de enfermería', placeholder: 'Registros de enfermería: controles, medicación administrada, observaciones...' },
    { id: 'quirurgicos', titulo: 'Protocolos quirúrgicos', placeholder: 'Protocolos operatorios y quirúrgicos realizados...' },
    { id: 'dietarias', titulo: 'Prescripciones dietarias', placeholder: 'Prescripciones dietéticas y nutricionales...' },
    { id: 'vacunacion', titulo: 'Certificados de vacunación', placeholder: 'Certificados de vacunación del paciente...' },
    { id: 'estudios', titulo: 'Estudios y prácticas realizadas, rechazadas o abandonadas', placeholder: 'Estudios y prácticas realizadas, rechazadas o abandonadas...' },
  ];

  function formHTML(p) {
    const inputs = secciones.map(s => `
      <label style="display:block;margin:10px 0">
        <span style="font-weight:600;display:block;margin-bottom:4px">${esc(s.titulo)}</span>
        <textarea id="${p}_${s.id}" rows="4" placeholder="${esc(s.placeholder)}" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-family:inherit"></textarea>
      </label>`).join('');
    return `
      <div style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:10px;border-radius:8px;margin-bottom:12px">
        ⚠️ <strong>Aviso:</strong> los datos no guardados en tu PC o en la nube se borran al cerrar esta página. Guardá tu trabajo periódicamente. Se realiza un respaldo automático cada 30 segundos en este navegador.
      </div>
      <p class="tw-desc">Completá los datos del paciente y las secciones de la historia clínica electrónica. Al generar, se arma un documento imprimible.</p>
      <div class="tw-form">
        <label>Paciente (nombre y apellido)
          <input type="text" id="${p}_paciente" placeholder="Nombre y apellido" />
        </label>
        <label>DNI
          <input type="text" id="${p}_dni" placeholder="DNI" />
        </label>
        <label>Fecha de nacimiento
          <input type="date" id="${p}_nacimiento" />
        </label>
        <label>Sexo
          <select id="${p}_sexo">
            <option value="">—</option>
            <option value="Femenino">Femenino</option>
            <option value="Masculino">Masculino</option>
            <option value="Otro">Otro</option>
          </select>
        </label>
        <label>Fecha de atención
          <input type="date" id="${p}_fecha" />
        </label>
        <label>Profesional responsable
          <input type="text" id="${p}_profesional" placeholder="Nombre del profesional" />
        </label>
      </div>
      ${inputs}
      <button class="btn btn-primary" id="${p}_ir">Generar historia clínica</button>
      <button class="btn btn-ghost" id="${p}_imprimir" style="margin-left:8px;display:none">Imprimir / Guardar PDF</button>
      <button class="btn btn-ghost" id="${p}_guardarLocal" style="margin-left:8px;display:none">Guardar en mi PC (cifrado)</button>
      <button class="btn btn-ghost" id="${p}_guardarDrive" style="margin-left:8px;display:none">Guardar en Google Drive</button>
      <button class="btn btn-ghost" id="${p}_recuperarBorrador" style="margin-left:8px">Restaurar borrador automático</button>
      <button class="btn btn-ghost" id="${p}_recuperarHistoria" style="margin-left:8px">Recuperar historia guardada</button>
      <div id="${p}_guardado" class="tw-out" style="margin-top:8px"></div>
      <div id="${p}_recuperarLista" class="tw-out" style="margin-top:8px"></div>
      <div id="${p}_salida" class="tw-out"></div>`;
  }

  function wire(root, p) {
    root.querySelector(`#${p}_ir`).addEventListener('click', () => {
      const paciente = root.querySelector(`#${p}_paciente`).value.trim();
      const dni = root.querySelector(`#${p}_dni`).value.trim();
      const nac = root.querySelector(`#${p}_nacimiento`).value;
      const sexo = root.querySelector(`#${p}_sexo`).value;
      const fecha = root.querySelector(`#${p}_fecha`).value;
      const profesional = root.querySelector(`#${p}_profesional`).value.trim();

      const secc = secciones.map(s => {
        const val = root.querySelector(`#${p}_${s.id}`).value.trim();
        return `<h4 style="margin:12px 0 4px">${esc(s.titulo)}</h4><p style="white-space:pre-wrap;margin:0">${esc(val || '—')}</p>`;
      }).join('');

      const html = `
        <div id="${p}_doc" style="background:#fff;color:#0f172a;padding:16px;border:1px solid #e2e8f0;border-radius:8px">
          <h3 style="margin:0 0 8px">Historia Clínica Electrónica</h3>
          <p style="margin:0 0 12px;font-size:13px;color:#475569">Documento generado el ${new Date().toLocaleDateString('es-AR')}</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px">
            <tr><td style="padding:4px;font-weight:600">Paciente</td><td style="padding:4px">${esc(paciente || '—')}</td></tr>
            <tr><td style="padding:4px;font-weight:600">DNI</td><td style="padding:4px">${esc(dni || '—')}</td></tr>
            <tr><td style="padding:4px;font-weight:600">Fecha de nacimiento</td><td style="padding:4px">${esc(fmtFecha(nac))}</td></tr>
            <tr><td style="padding:4px;font-weight:600">Sexo</td><td style="padding:4px">${esc(sexo || '—')}</td></tr>
            <tr><td style="padding:4px;font-weight:600">Fecha de atención</td><td style="padding:4px">${esc(fmtFecha(fecha))}</td></tr>
            <tr><td style="padding:4px;font-weight:600">Profesional</td><td style="padding:4px">${esc(profesional || '—')}</td></tr>
          </table>
          ${secc}
        </div>`;
      root.querySelector(`#${p}_salida`).innerHTML = html;
      const btn = root.querySelector(`#${p}_imprimir`);
      btn.style.display = 'inline-block';
      btn.onclick = () => {
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Historia Clínica</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}h3{margin:0 0 8px}h4{margin:12px 0 4px}p{white-space:pre-wrap;margin:0}table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px}td{padding:4px;border-bottom:1px solid #e2e8f0}</style></head><body>');
        w.document.write(root.querySelector(`#${p}_doc`).outerHTML);
        w.document.write('</body></html>');
        w.document.close();
        w.focus();
        w.print();
      };
      const btnLocal = root.querySelector(`#${p}_guardarLocal`);
      const btnDrive = root.querySelector(`#${p}_guardarDrive`);
      btnLocal.style.display = 'inline-block';
      btnDrive.style.display = 'inline-block';
      const docHTML = root.querySelector(`#${p}_doc`).outerHTML;
      const fechaDoc = fecha || new Date().toISOString().slice(0, 10);
      btnLocal.onclick = () => guardarLocal(root, p, paciente || 'paciente', fechaDoc, docHTML);
      btnDrive.onclick = () => guardarDrive(root, p, paciente || 'paciente', fechaDoc, docHTML);
      iniciarAutoSave(root, p);
      const btnRest = root.querySelector(`#${p}_recuperarBorrador`);
      const btnRec = root.querySelector(`#${p}_recuperarHistoria`);
      if (btnRest) btnRest.addEventListener('click', () => restaurarBorrador(root, p));
      if (btnRec) btnRec.addEventListener('click', () => mostrarRecuperar(root, p));
    });
  }

  // ------------------------- Cifrado (Web Crypto AES-GCM) -------------------------
  async function obtenerClave() {
    let keyB64 = localStorage.getItem('mfSaludKey');
    if (!keyB64) {
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      const raw = await crypto.subtle.exportKey('raw', key);
      keyB64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
      localStorage.setItem('mfSaludKey', keyB64);
    }
    const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  async function cifrar(texto) {
    const key = await obtenerClave();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(texto));
    const buf = new Uint8Array(iv.length + enc.byteLength);
    buf.set(iv); buf.set(new Uint8Array(enc), iv.length);
    return btoa(String.fromCharCode(...buf));
  }
  async function descifrar(b64) {
    const key = await obtenerClave();
    const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const iv = buf.slice(0, 12);
    const data = buf.slice(12);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(dec);
  }

  function recogerValores(root, p) {
    const v = {};
    v.paciente = root.querySelector(`#${p}_paciente`).value;
    v.dni = root.querySelector(`#${p}_dni`).value;
    v.nacimiento = root.querySelector(`#${p}_nacimiento`).value;
    v.sexo = root.querySelector(`#${p}_sexo`).value;
    v.fecha = root.querySelector(`#${p}_fecha`).value;
    v.profesional = root.querySelector(`#${p}_profesional`).value;
    v.secciones = {};
    secciones.forEach(s => { v.secciones[s.id] = root.querySelector(`#${p}_${s.id}`).value; });
    return v;
  }
  function cargarValores(root, p, v) {
    if (!v) return;
    root.querySelector(`#${p}_paciente`).value = v.paciente || '';
    root.querySelector(`#${p}_dni`).value = v.dni || '';
    root.querySelector(`#${p}_nacimiento`).value = v.nacimiento || '';
    root.querySelector(`#${p}_sexo`).value = v.sexo || '';
    root.querySelector(`#${p}_fecha`).value = v.fecha || '';
    root.querySelector(`#${p}_profesional`).value = v.profesional || '';
    secciones.forEach(s => { root.querySelector(`#${p}_${s.id}`).value = (v.secciones && v.secciones[s.id]) || ''; });
  }

  // ------------------------- Guardado local y Google Drive -------------------------
  const GOOGLE_CLIENT_ID = ''; // Configurar en Google Cloud Console si se desea guardar en Drive

  function sanitizar(s) { return String(s || 'paciente').replace(/[\\/:*?"<>|]/g, '_').trim() || 'paciente'; }

  function htmlCompleto(bodyHTML) {
    return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>Historia Clínica</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}h3{margin:0 0 8px}h4{margin:12px 0 4px}p{white-space:pre-wrap;margin:0}table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px}td{padding:4px;border-bottom:1px solid #e2e8f0}</style></head><body>${bodyHTML}</body></html>`;
  }

  function descargarArchivo(contenido, nombre) {
    const blob = new Blob([contenido], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.click();
    URL.revokeObjectURL(url);
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('mfSaludDB', 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore('handles'); } catch (e) {} };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function getDirHandle() {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readonly');
        const store = tx.objectStore('handles');
        const req = store.get('rootDir');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return null; }
  }
  async function setDirHandle(handle) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        const store = tx.objectStore('handles');
        const req = store.put(handle, 'rootDir');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {}
  }

  async function guardarLocal(root, p, paciente, fecha, docHTML) {
    const status = root.querySelector(`#${p}_guardado`);
    status.innerHTML = 'Guardando en tu PC (cifrado)...';
    const nombreCarpeta = sanitizar(paciente);
    const fechaArchivo = (window.mfFecha && window.mfFecha.formatoArchivo) ? window.mfFecha.formatoArchivo(fecha) : fecha;
    const nombreArchivo = `historia_${sanitizar(paciente)}_${fechaArchivo}.enc`;
    const valores = recogerValores(root, p);
    const contenido = await cifrar(JSON.stringify(valores));
    try {
      let dirHandle = await getDirHandle();
      if (dirHandle) {
        try {
          const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
          if (perm !== 'granted') dirHandle = null;
        } catch (e) { dirHandle = null; }
      }
      if (!dirHandle) {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await setDirHandle(dirHandle);
      }
      const carpeta = await dirHandle.getDirectoryHandle('historias clinicas', { create: true });
      const sub = await carpeta.getDirectoryHandle(nombreCarpeta, { create: true });
      const fileHandle = await sub.getFileHandle(nombreArchivo, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(contenido);
      await writable.close();
      status.innerHTML = `<span style="color:#16a34a">Guardado (cifrado) en: historias clinicas/${esc(nombreCarpeta)}/${esc(nombreArchivo)}</span>`;
    } catch (e) {
      if (e && e.name === 'AbortError') { status.innerHTML = 'Cancelado.'; return; }
      descargarArchivo(contenido, nombreArchivo);
      status.innerHTML = `<span style="color:#b45309">No se pudo acceder a la carpeta. Se descargó el archivo cifrado: ${esc(nombreArchivo)}. ${esc(e.message || '')}</span>`;
    }
  }

  function cargarScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function guardarDrive(root, p, paciente, fecha, docHTML) {
    const status = root.querySelector(`#${p}_guardado`);
    if (!GOOGLE_CLIENT_ID) {
      status.innerHTML = `<span style="color:#b45309">Para guardar en Google Drive, configurá un Client ID de Google Cloud en <code>assets/historia.js</code> (constante <code>GOOGLE_CLIENT_ID</code>). Pasos: console.cloud.google.com → APIs & Services → Credentials → Create OAuth 2.0 Client ID (tipo Web) → habilitá la Google Drive API → copiá el Client ID. Sin esto, usá "Guardar en mi PC".</span>`;
      return;
    }
    status.innerHTML = 'Conectando con Google Drive...';
    try {
      if (!window.google || !window.google.accounts) {
        await cargarScript('https://accounts.google.com/gsi/client');
      }
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: async (resp) => {
          if (resp.error) { status.innerHTML = `<span style="color:#b91c1c">Error OAuth: ${esc(resp.error)}</span>`; return; }
          try { await subirADrive(status, paciente, fecha, docHTML, resp.access_token); }
          catch (e) { status.innerHTML = `<span style="color:#b91c1c">Error al subir: ${esc(e.message)}</span>`; }
        }
      });
      tokenClient.requestAccessToken();
    } catch (e) {
      status.innerHTML = `<span style="color:#b91c1c">Error: ${esc(e.message)}</span>`;
    }
  }

  async function subirADrive(status, paciente, fecha, docHTML, token) {
    status.innerHTML = 'Buscando/creando carpeta en Drive...';
    const q = encodeURIComponent("name='historias clinicas' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    let res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, { headers: { Authorization: 'Bearer ' + token } });
    let data = await res.json();
    let carpetaId = (data.files && data.files[0]) ? data.files[0].id : null;
    if (!carpetaId) {
      const r = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'historias clinicas', mimeType: 'application/vnd.google-apps.folder' })
      });
      carpetaId = (await r.json()).id;
    }
    const nombreCarpeta = sanitizar(paciente);
    const q2 = encodeURIComponent(`name='${nombreCarpeta}' and mimeType='application/vnd.google-apps.folder' and '${carpetaId}' in parents and trashed=false`);
    res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q2}&fields=files(id,name)`, { headers: { Authorization: 'Bearer ' + token } });
    data = await res.json();
    let subId = (data.files && data.files[0]) ? data.files[0].id : null;
    if (!subId) {
      const r = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombreCarpeta, mimeType: 'application/vnd.google-apps.folder', parents: [carpetaId] })
      });
      subId = (await r.json()).id;
    }
    status.innerHTML = 'Subiendo archivo (cifrado)...';
    const fechaArchivo = (window.mfFecha && window.mfFecha.formatoArchivo) ? window.mfFecha.formatoArchivo(fecha) : fecha;
    const nombreArchivo = `historia_${sanitizar(paciente)}_${fechaArchivo}.enc`;
    const valores = recogerValores(root, p);
    const contenido = await cifrar(JSON.stringify(valores));
    const metadata = { name: nombreArchivo, parents: [subId] };
    const boundary = '-------314159265358979323846';
    const delimiter = '\r\n--' + boundary + '\r\n';
    const closeDelim = '\r\n--' + boundary + '--';
    const body = delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + delimiter +
      'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
      contenido + closeDelim;
    const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: body
    });
    const upj = await up.json();
    if (upj.id) {
      status.innerHTML = `<span style="color:#16a34a">Guardado en Google Drive: historias clinicas/${esc(nombreCarpeta)}/${esc(nombreArchivo)}</span>`;
    } else {
      status.innerHTML = `<span style="color:#b91c1c">Error al subir: ${esc(upj.error ? upj.error.message : 'desconocido')}</span>`;
    }
  }

  // ------------------------- Auto-save, restaurar y recuperar -------------------------

  function iniciarAutoSave(root, p) {
    const key = `mfHistoriaBorrador_${p}`;
    const save = () => { try { localStorage.setItem(key, JSON.stringify(recogerValores(root, p))); } catch (e) {} };
    setInterval(save, 30000);
    root.querySelectorAll('input, textarea, select').forEach(el => {
      el.addEventListener('input', () => { clearTimeout(window['_t_' + p]); window['_t_' + p] = setTimeout(save, 1000); });
    });
  }
  function restaurarBorrador(root, p) {
    const key = `mfHistoriaBorrador_${p}`;
    const status = root.querySelector(`#${p}_guardado`);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) { status.innerHTML = 'No hay borrador automático.'; return; }
      cargarValores(root, p, JSON.parse(raw));
      status.innerHTML = '<span style="color:#16a34a">Borrador automático restaurado.</span>';
    } catch (e) { status.innerHTML = `<span style="color:#b91c1c">Error: ${esc(e.message)}</span>`; }
  }
  function mostrarRecuperar(root, p) {
    const lista = root.querySelector(`#${p}_recuperarLista`);
    lista.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
        <button class="btn btn-ghost" id="${p}_recLocal">Recuperar desde mi PC</button>
        <button class="btn btn-ghost" id="${p}_recDrive">Recuperar desde Google Drive</button>
      </div>`;
    lista.querySelector(`#${p}_recLocal`).addEventListener('click', () => recuperarLocal(root, p));
    lista.querySelector(`#${p}_recDrive`).addEventListener('click', () => recuperarDrive(root, p));
  }
  async function recuperarLocal(root, p) {
    const status = root.querySelector(`#${p}_guardado`);
    const lista = root.querySelector(`#${p}_recuperarLista`);
    status.innerHTML = 'Buscando historias guardadas...';
    try {
      let dirHandle = await getDirHandle();
      if (!dirHandle) {
        dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        await setDirHandle(dirHandle);
      }
      const carpeta = await dirHandle.getDirectoryHandle('historias clinicas');
      const items = [];
      for await (const [name, handle] of carpeta.entries()) {
        if (handle.kind === 'directory') {
          for await (const [fname, fhandle] of handle.entries()) {
            if (fhandle.kind === 'file' && fname.endsWith('.enc')) items.push({ paciente: name, archivo: fname, handle: fhandle });
          }
        } else if (handle.kind === 'file' && name.endsWith('.enc')) {
          items.push({ paciente: '', archivo: name, handle });
        }
      }
      if (items.length === 0) { status.innerHTML = 'No se encontraron historias guardadas.'; lista.innerHTML = ''; return; }
      window._recItems = items;
      lista.innerHTML = '<strong>Historias encontradas:</strong><ul style="margin:8px 0;padding-left:18px">' +
        items.map((it, i) => `<li><a href="#" data-idx="${i}">${esc(it.paciente ? it.paciente + ' — ' : '')}${esc(it.archivo)}</a></li>`).join('') + '</ul>';
      lista.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', async (e) => {
          e.preventDefault();
          const idx = Number(a.dataset.idx);
          const item = window._recItems[idx];
          try {
            const file = await item.handle.getFile();
            const texto = await file.text();
            const json = await descifrar(texto);
            cargarValores(root, p, JSON.parse(json));
            status.innerHTML = `<span style="color:#16a34a">Historia recuperada: ${esc(item.archivo)}</span>`;
            lista.innerHTML = '';
          } catch (err) {
            status.innerHTML = `<span style="color:#b91c1c">Error al recuperar: ${esc(err.message)}</span>`;
          }
        });
      });
      status.innerHTML = '';
    } catch (e) {
      if (e && e.name === 'AbortError') { status.innerHTML = 'Cancelado.'; return; }
      status.innerHTML = `<span style="color:#b91c1c">Error: ${esc(e.message)}</span>`;
    }
  }
  async function recuperarDrive(root, p) {
    const status = root.querySelector(`#${p}_guardado`);
    const lista = root.querySelector(`#${p}_recuperarLista`);
    if (!GOOGLE_CLIENT_ID) { status.innerHTML = 'Configurá GOOGLE_CLIENT_ID para usar Drive.'; return; }
    status.innerHTML = 'Conectando con Google Drive...';
    try {
      if (!window.google || !window.google.accounts) await cargarScript('https://accounts.google.com/gsi/client');
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: async (resp) => {
          if (resp.error) { status.innerHTML = `<span style="color:#b91c1c">Error OAuth: ${esc(resp.error)}</span>`; return; }
          try { await listarDrive(root, p, resp.access_token); }
          catch (e) { status.innerHTML = `<span style="color:#b91c1c">Error: ${esc(e.message)}</span>`; }
        }
      });
      tokenClient.requestAccessToken();
    } catch (e) { status.innerHTML = `<span style="color:#b91c1c">Error: ${esc(e.message)}</span>`; }
  }
  async function listarDrive(root, p, token) {
    const status = root.querySelector(`#${p}_guardado`);
    const lista = root.querySelector(`#${p}_recuperarLista`);
    const q = encodeURIComponent("name='historias clinicas' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, { headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    const carpetaId = (data.files && data.files[0]) ? data.files[0].id : null;
    if (!carpetaId) { status.innerHTML = 'No se encontró la carpeta en Drive.'; return; }
    const q2 = encodeURIComponent(`'${carpetaId}' in parents and trashed=false`);
    const res2 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q2}&fields=files(id,name,mimeType)`, { headers: { Authorization: 'Bearer ' + token } });
    const data2 = await res2.json();
    const items = [];
    for (const f of (data2.files || [])) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        const q3 = encodeURIComponent(`'${f.id}' in parents and trashed=false`);
        const r3 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q3}&fields=files(id,name)`, { headers: { Authorization: 'Bearer ' + token } });
        const d3 = await r3.json();
        for (const ff of (d3.files || [])) {
          if (ff.name.endsWith('.enc')) items.push({ paciente: f.name, archivo: ff.name, id: ff.id });
        }
      } else if (f.name.endsWith('.enc')) {
        items.push({ paciente: '', archivo: f.name, id: f.id });
      }
    }
    if (items.length === 0) { status.innerHTML = 'No se encontraron historias en Drive.'; lista.innerHTML = ''; return; }
    window._recDriveItems = { items, token };
    lista.innerHTML = '<strong>Historias en Drive:</strong><ul style="margin:8px 0;padding-left:18px">' +
      items.map((it, i) => `<li><a href="#" data-idx="${i}">${esc(it.paciente ? it.paciente + ' — ' : '')}${esc(it.archivo)}</a></li>`).join('') + '</ul>';
    lista.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const idx = Number(a.dataset.idx);
        const it = window._recDriveItems.items[idx];
        const tk = window._recDriveItems.token;
        try {
          const rr = await fetch(`https://www.googleapis.com/drive/v3/files/${it.id}?alt=media`, { headers: { Authorization: 'Bearer ' + tk } });
          const texto = await rr.text();
          const json = await descifrar(texto);
          cargarValores(root, p, JSON.parse(json));
          status.innerHTML = `<span style="color:#16a34a">Historia recuperada de Drive: ${esc(it.archivo)}</span>`;
          lista.innerHTML = '';
        } catch (err) {
          status.innerHTML = `<span style="color:#b91c1c">Error al recuperar: ${esc(err.message)}</span>`;
        }
      });
    });
    status.innerHTML = '';
  }

  // Registro como herramienta modal
  const T = window.MF_TOOLS;
  if (T) {
    T.historia = {
      titulo: 'Historia Clínica Electrónica',
      html: () => formHTML('h'),
      init: (root) => wire(root, 'h')
    };
  }

  // Montaje en página dedicada
  function montarPagina() {
    const app = document.getElementById('historiaApp');
    if (!app) return;
    app.innerHTML = formHTML('p');
    wire(app, 'p');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montarPagina);
  } else {
    montarPagina();
  }
})();
