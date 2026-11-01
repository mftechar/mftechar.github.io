/* MF Tech Store — panel de administración del catálogo
 * Lee y escribe store/data/products.json en GitHub usando la API de contenidos.
 * El token vive solo en el navegador y nunca se sube al repositorio.
 */
(() => {
  'use strict';

  const DATA_PATH = 'store/data/products.json';
  const IMG_DIR = 'store/img';
  const DEFAULT_REPO = 'mftechar/mftechar.github.io';
  const DEFAULT_BRANCH = 'main';
  const DEFAULT_WHATSAPP = '5492325406322';
  const DEFAULT_CURRENCY = 'ARS';

  /* ================= Estado ================= */

  const state = {
    token: '',
    owner: '',
    repo: '',
    branch: DEFAULT_BRANCH,
    sha: null,
    user: null,
    data: { config: { whatsapp: DEFAULT_WHATSAPP, moneda: DEFAULT_CURRENCY }, productos: [] },
    dirty: false,
    loaded: false,
    editingIndex: -1,
    localImage: '',
  };

  /* ================= Utilidades ================= */

  const $ = (id) => document.getElementById(id);

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));

  const slugify = (value) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const formatNumber = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
  };

  const formatPrice = (value, currency) => {
    const number = formatNumber(value);
    if (number === null) return null;
    return currency === 'ARS' ? `$${number}` : `${number} ${currency}`;
  };

  const bytesToBase64 = (bytes) => {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  };

  const textToBase64 = (text) => bytesToBase64(new TextEncoder().encode(text));

  const base64ToText = (base64) => {
    const binary = atob(String(base64).replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  /* ================= Almacenamiento ================= */

  const storage = {
    get(key, fallback = '') {
      try {
        return localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value, persist) {
      try {
        (persist ? localStorage : sessionStorage).setItem(key, value);
        (persist ? sessionStorage : localStorage).removeItem(key);
      } catch { /* modo privado */ }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      } catch { /* nada */ }
    },
  };

  /* ================= API de GitHub ================= */

  async function api(path, options = {}) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    const response = await fetch(`https://api.github.com${path}`, { ...options, headers });

    if (!response.ok) {
      let message = `Error ${response.status}`;
      try {
        const body = await response.json();
        if (body && body.message) message = body.message;
      } catch { /* sin cuerpo */ }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    if (response.status === 204) return null;
    return response.json();
  }

  const contentsPath = () =>
    `/repos/${state.owner}/${state.repo}/contents/${DATA_PATH}`;

  async function loadCatalog() {
    try {
      const file = await api(`${contentsPath()}?ref=${encodeURIComponent(state.branch)}`);
      state.sha = file.sha;
      const parsed = JSON.parse(base64ToText(file.content));
      state.data = normalizeData(parsed);
    } catch (error) {
      if (error.status === 404) {
        state.sha = null;
        state.data = {
          config: { whatsapp: DEFAULT_WHATSAPP, moneda: DEFAULT_CURRENCY },
          productos: [],
        };
        setLog('El archivo products.json no existe todavía. Se creará al publicar.', 'ok');
      } else {
        throw error;
      }
    }
    state.loaded = true;
  }

  async function saveCatalog(message) {
    const content = `${JSON.stringify(state.data, null, 2)}\n`;
    const body = {
      message: message || 'store: actualizar catálogo',
      content: textToBase64(content),
      branch: state.branch,
    };
    if (state.sha) body.sha = state.sha;

    const result = await api(contentsPath(), {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    state.sha = result && result.content ? result.content.sha : state.sha;
  }

  async function uploadImage(file) {
    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const base = slugify(state.data.productos[state.editingIndex]?.id || $('f-id').value || $('f-titulo').value) || 'producto';
    const name = `${base}-${Date.now().toString(36)}.${extension}`;
    const path = `${IMG_DIR}/${name}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    await api(`/repos/${state.owner}/${state.repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `store: imagen ${name}`,
        content: bytesToBase64(bytes),
        branch: state.branch,
      }),
    });

    return `img/${name}`;
  }

  /* ================= Normalización ================= */

  function normalizeData(raw) {
    const config = raw && typeof raw.config === 'object' && raw.config ? raw.config : {};
    return {
      config: {
        whatsapp: config.whatsapp || DEFAULT_WHATSAPP,
        moneda: config.moneda || DEFAULT_CURRENCY,
        ...(config.mensajeGeneral ? { mensajeGeneral: config.mensajeGeneral } : {}),
      },
      productos: Array.isArray(raw?.productos) ? raw.productos : [],
    };
  }

  /* ================= Interfaz: estado ================= */

  function setPill(text, stateName) {
    const pill = $('statusPill');
    pill.textContent = text;
    pill.dataset.state = stateName;
  }

  function setLog(text, kind) {
    const log = $('log');
    log.textContent = text || '';
    if (kind) log.dataset.state = kind;
    else delete log.dataset.state;
  }

  function refreshStatus() {
    if (state.dirty) {
      setPill('Cambios sin publicar', 'dirty');
    } else if (state.user) {
      setPill(`Conectado · @${state.user}`, 'ok');
    } else if (state.token) {
      setPill('Conectado', 'ok');
    } else if (state.loaded && state.owner && state.repo) {
      setPill('Solo lectura', 'off');
    } else {
      setPill('Sin conexión', 'off');
    }

    $('panelPublicar').hidden = !state.dirty;
    $('btnPublicar').disabled = !state.token;
    $('btnNuevo').disabled = !state.loaded;
    $('btnRecargar').disabled = !state.owner || !state.repo;
  }

  function markDirty(value = true) {
    state.dirty = value;
    refreshStatus();
  }

  /* ================= Interfaz: lista ================= */

  function renderList() {
    const products = state.data.productos;
    const list = $('productList');

    $('productCount').textContent = String(products.length);
    $('productEmpty').hidden = products.length > 0;
    $('productEmpty').textContent = state.loaded
      ? 'Todavía no hay productos. Empezá con “+ Nuevo producto”.'
      : 'Conectá GitHub para cargar el catálogo actual.';

    list.innerHTML = products
      .map((product, index) => {
        const currency = product.moneda || state.data.config.moneda || DEFAULT_CURRENCY;
        const price = formatPrice(product.precio, currency);
        const categories = (product.categorias || []).map((c) => `<span class="tag">${esc(c)}</span>`).join('');
        const stock = product.disponible === false ? '<span class="tag off">Sin stock</span>' : '';
        const badge = product.badge ? `<span class="tag">${esc(product.badge)}</span>` : '';

        return `<li class="product-item">
          <img class="product-thumb" src="${esc(product.imagen || 'img/logo.jpg')}" alt="" loading="lazy" />
          <div class="product-main">
            <p class="product-name">${esc(product.titulo || '(sin título)')}</p>
            <p class="product-meta">
              <span>${esc(price ? `${price} ${currency}` : 'Consultar')}</span>
              ${categories}${badge}${stock}
            </p>
          </div>
          <div class="item-actions">
            <button class="icon-btn" data-action="up" data-index="${index}" title="Subir" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon-btn" data-action="down" data-index="${index}" title="Bajar" ${index === products.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="icon-btn" data-action="dup" data-index="${index}" title="Duplicar">⧉</button>
            <button class="icon-btn" data-action="edit" data-index="${index}" title="Editar">✎</button>
            <button class="icon-btn danger" data-action="del" data-index="${index}" title="Eliminar">✕</button>
          </div>
        </li>`;
      })
      .join('');
  }

  /* ================= Interfaz: formulario ================= */

  function openForm(index) {
    if (!state.loaded) {
      setLog('Primero conectá el repositorio para cargar el catálogo.', 'error');
      return;
    }

    state.editingIndex = typeof index === 'number' ? index : -1;
    const product = state.editingIndex >= 0 ? state.data.productos[state.editingIndex] : null;

    $('formTitle').textContent = product ? `3 · Editar: ${product.titulo}` : '3 · Nuevo producto';
    $('panelForm').hidden = false;

    $('f-titulo').value = product?.titulo || '';
    $('f-id').value = product?.id || '';
    if (product) $('f-id').dataset.touched = '1';
    else delete $('f-id').dataset.touched;
    $('f-categorias').value = (product?.categorias || []).join(', ');
    $('f-badge').value = product?.badge || '';
    $('f-descripcion').value = product?.descripcion || '';
    $('f-caracteristicas').value = (product?.caracteristicas || []).join('\n');
    $('f-imagen').value = product?.imagen || '';
    $('f-imagenAlt').value = product?.imagenAlt || '';
    $('f-precio').value = Number.isFinite(Number(product?.precio)) ? String(product.precio) : '';
    $('f-moneda-producto').value = product?.moneda || '';
    $('f-galeriaNota').value = product?.galeriaNota || '';
    $('f-mensaje').value = product?.mensajeWhatsapp || '';
    $('f-disponible').checked = product ? product.disponible !== false : true;
    $('f-imagen-file').value = '';

    state.localImage = '';
    renderGaleria(product?.galeria || []);
    updatePreview();
    updateThumb();

    $('panelForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('f-titulo').focus({ preventScroll: true });
  }

  function closeForm() {
    $('panelForm').hidden = true;
    state.editingIndex = -1;
    state.localImage = '';
  }

  function renderGaleria(items) {
    const container = $('galeriaRows');
    container.innerHTML = '';
    (items || []).forEach((item) => addGaleriaRow(item));
  }

  function addGaleriaRow(item = {}) {
    const row = document.createElement('div');
    row.className = 'galeria-row';
    row.innerHTML = `
      <select class="g-tipo">
        <option value="video">Video</option>
        <option value="imagen">Imagen</option>
      </select>
      <input class="g-src" type="text" spellcheck="false" placeholder="media/demo.mp4 o img/foto.jpg" />
      <input class="g-extra" type="text" spellcheck="false" placeholder="poster (video) o alt (imagen)" />
      <button class="icon-btn danger" type="button" title="Quitar">✕</button>`;

    const tipo = row.querySelector('.g-tipo');
    const src = row.querySelector('.g-src');
    const extra = row.querySelector('.g-extra');

    tipo.value = item.tipo === 'imagen' ? 'imagen' : 'video';
    src.value = item.src || '';
    extra.value = item.poster || item.alt || '';

    row.querySelector('button').addEventListener('click', () => row.remove());
    src.addEventListener('input', updatePreview);

    $('galeriaRows').appendChild(row);
  }

  function readGaleria() {
    return [...$('galeriaRows').querySelectorAll('.galeria-row')]
      .map((row) => {
        const tipo = row.querySelector('.g-tipo').value;
        const src = row.querySelector('.g-src').value.trim();
        const extra = row.querySelector('.g-extra').value.trim();
        if (!src) return null;
        const item = { tipo, src };
        if (extra) item[tipo === 'video' ? 'poster' : 'alt'] = extra;
        return item;
      })
      .filter(Boolean);
  }

  function readForm() {
    const titulo = $('f-titulo').value.trim();
    const id = $('f-id').value.trim() || slugify(titulo);

    const product = { id, titulo };

    const categorias = $('f-categorias').value.split(',').map((c) => c.trim()).filter(Boolean);
    if (categorias.length) product.categorias = categorias;

    const badge = $('f-badge').value.trim();
    if (badge) product.badge = badge;

    const imagen = $('f-imagen').value.trim();
    if (imagen) product.imagen = imagen;

    const imagenAlt = $('f-imagenAlt').value.trim();
    if (imagenAlt) product.imagenAlt = imagenAlt;

    const descripcion = $('f-descripcion').value.trim();
    if (descripcion) product.descripcion = descripcion;

    const caracteristicas = $('f-caracteristicas').value
      .split('\n').map((l) => l.trim()).filter(Boolean);
    if (caracteristicas.length) product.caracteristicas = caracteristicas;

    const galeria = readGaleria();
    if (galeria.length) product.galeria = galeria;

    const galeriaNota = $('f-galeriaNota').value.trim();
    if (galeriaNota) product.galeriaNota = galeriaNota;

    const precio = $('f-precio').value.trim();
    if (precio !== '') {
      const numero = Number(precio);
      if (Number.isFinite(numero)) product.precio = numero;
    }

    const moneda = $('f-moneda-producto').value.trim().toUpperCase();
    if (moneda) product.moneda = moneda;

    const mensaje = $('f-mensaje').value.trim();
    if (mensaje) product.mensajeWhatsapp = mensaje;

    product.disponible = $('f-disponible').checked;

    return product;
  }

  /* ================= Vista previa ================= */

  function updateThumb() {
    const thumb = $('imagenPreview');
    const src = state.localImage || $('f-imagen').value.trim();
    thumb.innerHTML = src
      ? `<img src="${esc(src)}" alt="" onerror="this.parentNode.innerHTML='<span>No encontrada</span>'" />`
      : '<span>Sin imagen</span>';
  }

  function updatePreview() {
    const product = readForm();
    const currency = product.moneda || state.data.config.moneda || DEFAULT_CURRENCY;
    const price = formatPrice(product.precio, currency);
    const img = state.localImage || product.imagen || 'img/logo.jpg';

    $('previewCard').innerHTML = `
      <img src="${esc(img)}" alt="" onerror="this.style.display='none'" />
      <div class="preview-body">
        ${product.badge ? `<span class="preview-badge">${esc(product.badge)}</span>` : ''}
        <p class="preview-cats">${esc((product.categorias || []).join(' · '))}</p>
        <h3 class="preview-title">${esc(product.titulo || 'Título del producto')}</h3>
        <p class="preview-desc">${esc(product.descripcion || 'Descripción del producto.')}</p>
        <p class="preview-price">${price ? `${esc(price)} <small>${esc(currency)}</small>` : 'Consultar'}</p>
        <div class="preview-cta">Consultar por WhatsApp</div>
      </div>`;
  }

  /* ================= Conexión ================= */

  async function connect({ silent = false } = {}) {
    const token = $('f-token').value.trim();
    const repoRaw = $('f-repo').value.trim();
    const branch = $('f-branch').value.trim() || DEFAULT_BRANCH;

    const repo = repoRaw
      .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '');
    const [owner, name] = repo.split('/');

    if (!owner || !name) {
      if (!silent) setLog('Escribí el repositorio como usuario/repositorio.', 'error');
      return false;
    }

    state.token = token;
    state.owner = owner;
    state.repo = name;
    state.branch = branch;
    state.user = null;

    const persist = $('f-recordar').checked;
    storage.set('mftech.admin.repo', `${owner}/${name}`, true);
    storage.set('mftech.admin.branch', branch, true);
    if (token) storage.set('mftech.admin.token', token, persist);
    else storage.remove('mftech.admin.token');

    try {
      if (token) {
        const user = await api('/user');
        state.user = user.login;
      }
      await api(`/repos/${owner}/${name}`);
      await loadCatalog();

      fillConfig();
      renderList();
      markDirty(false);
      refreshStatus();

      if (!silent) {
        setLog(
          token
            ? `Conectado a ${owner}/${name} (${branch}).`
            : `Conectado en solo lectura a ${owner}/${name}. Agregá un token para publicar.`,
          'ok'
        );
      }
      return true;
    } catch (error) {
      state.user = null;
      refreshStatus();
      if (!silent) setLog(`No se pudo conectar: ${error.message}`, 'error');
      return false;
    }
  }

  function fillConfig() {
    $('f-whatsapp').value = state.data.config.whatsapp || DEFAULT_WHATSAPP;
    $('f-moneda').value = state.data.config.moneda || DEFAULT_CURRENCY;
  }

  /* ================= Acciones ================= */

  function applyConfig() {
    const whatsapp = $('f-whatsapp').value.trim();
    const moneda = $('f-moneda').value.trim().toUpperCase();

    state.data.config.whatsapp = whatsapp || DEFAULT_WHATSAPP;
    state.data.config.moneda = moneda || DEFAULT_CURRENCY;
    markDirty(true);
  }

  function submitProduct(publish) {
    const product = readForm();

    if (!product.titulo) {
      setLog('El título es obligatorio.', 'error');
      $('f-titulo').focus();
      return;
    }

    const duplicate = state.data.productos.findIndex(
      (p, index) => p.id === product.id && index !== state.editingIndex
    );
    if (duplicate >= 0) {
      product.id = `${product.id}-${Date.now().toString(36).slice(-4)}`;
      setLog(`Ese identificador ya existía; se usó "${product.id}".`, 'ok');
    }

    if (state.editingIndex >= 0) {
      state.data.productos[state.editingIndex] = product;
    } else {
      state.data.productos.push(product);
    }

    state.localImage = '';
    markDirty(true);
    renderList();
    closeForm();

    if (publish) {
      publishCatalog();
    } else {
      setLog('Producto guardado como borrador. Publicá cuando estés listo.', 'ok');
    }
  }

  async function publishCatalog() {
    if (!state.token) {
      downloadJson();
      setLog('Sin token: se descargó products.json para que lo subas a mano.', 'ok');
      return;
    }

    const button = $('btnPublicar');
    button.disabled = true;
    setLog('Publicando…');

    try {
      await saveCatalog($('f-commit').value.trim());
      markDirty(false);
      setLog('Publicado en GitHub. El sitio tarda entre 30 y 90 segundos en actualizarse.', 'ok');
    } catch (error) {
      if (error.status === 409 || error.status === 422) {
        setLog('El archivo cambió en GitHub. Recargá el catálogo y volvé a intentar.', 'error');
      } else if (error.status === 401) {
        setLog('El token no es válido o venció. Creá uno nuevo.', 'error');
      } else if (error.status === 403) {
        setLog('El token no tiene permiso de escritura (Contents: Read and write).', 'error');
      } else {
        setLog(`No se pudo publicar: ${error.message}`, 'error');
      }
    } finally {
      refreshStatus();
    }
  }

  function downloadJson() {
    const blob = new Blob([`${JSON.stringify(state.data, null, 2)}\n`], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'products.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function reloadCatalog({ confirmFirst = true } = {}) {
    if (confirmFirst && state.dirty && !confirm('Vas a perder los cambios sin publicar. ¿Continuar?')) {
      return;
    }
    if (!state.owner || !state.repo) {
      setLog('Primero conectá el repositorio.', 'error');
      return;
    }
    try {
      await loadCatalog();
      fillConfig();
      renderList();
      closeForm();
      markDirty(false);
      setLog('Catálogo recargado desde GitHub.', 'ok');
    } catch (error) {
      setLog(`No se pudo recargar: ${error.message}`, 'error');
    }
  }

  /* ================= Eventos ================= */

  function bindEvents() {
    $('btnToggleConexion').addEventListener('click', () => {
      const body = $('conexionBody');
      const hidden = body.hidden;
      body.hidden = !hidden;
      $('btnToggleConexion').textContent = hidden ? 'Ocultar' : 'Mostrar';
      $('btnToggleConexion').setAttribute('aria-expanded', String(hidden));
    });

    $('btnVerToken').addEventListener('click', () => {
      const input = $('f-token');
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      $('btnVerToken').textContent = isPassword ? 'Ocultar' : 'Ver';
    });

    $('btnConectar').addEventListener('click', () => connect());
    $('btnOlvidar').addEventListener('click', () => {
      storage.remove('mftech.admin.token');
      state.token = '';
      state.user = null;
      $('f-token').value = '';
      refreshStatus();
      setLog('Token olvidado en este navegador.', 'ok');
    });

    $('btnNuevo').addEventListener('click', () => openForm(-1));
    $('btnCerrarForm').addEventListener('click', closeForm);
    $('btnCancelar').addEventListener('click', closeForm);
    $('btnRecargar').addEventListener('click', () => reloadCatalog());

    $('productList').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;

      const index = Number(button.dataset.index);
      const action = button.dataset.action;
      const products = state.data.productos;

      if (action === 'edit') {
        openForm(index);
      } else if (action === 'up' && index > 0) {
        [products[index - 1], products[index]] = [products[index], products[index - 1]];
        markDirty(true);
        renderList();
      } else if (action === 'down' && index < products.length - 1) {
        [products[index + 1], products[index]] = [products[index], products[index + 1]];
        markDirty(true);
        renderList();
      } else if (action === 'dup') {
        const copy = JSON.parse(JSON.stringify(products[index]));
        copy.id = `${copy.id}-copia`;
        copy.titulo = `${copy.titulo} (copia)`;
        products.splice(index + 1, 0, copy);
        markDirty(true);
        renderList();
      } else if (action === 'del') {
        if (!confirm(`¿Eliminar "${products[index].titulo}"?`)) return;
        products.splice(index, 1);
        markDirty(true);
        renderList();
      }
    });

    $('productForm').addEventListener('submit', (event) => {
      event.preventDefault();
      submitProduct(true);
    });

    $('btnGuardarBorrador').addEventListener('click', () => submitProduct(false));

    $('f-titulo').addEventListener('input', () => {
      const idInput = $('f-id');
      if (!idInput.dataset.touched) idInput.value = slugify($('f-titulo').value);
      updatePreview();
    });
    $('f-id').addEventListener('input', (event) => {
      event.target.dataset.touched = '1';
    });

    ['f-descripcion', 'f-categorias', 'f-badge', 'f-precio', 'f-moneda-producto', 'f-imagen', 'f-galeriaNota']
      .forEach((id) => $(id).addEventListener('input', updatePreview));

    $('f-imagen').addEventListener('input', () => {
      state.localImage = '';
      updateThumb();
    });

    $('f-imagen-file').addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      try {
        state.localImage = await fileToDataUrl(file);
        updateThumb();
        updatePreview();
      } catch {
        setLog('No se pudo leer la imagen.', 'error');
        return;
      }

      if (!state.token) {
        setLog('Imagen elegida. Conectá GitHub para subirla automáticamente, o subila a mano y escribí la ruta.', 'error');
        return;
      }

      setLog('Subiendo imagen…');
      try {
        const path = await uploadImage(file);
        $('f-imagen').value = path;
        updateThumb();
        updatePreview();
        setLog(`Imagen subida: ${path}`, 'ok');
      } catch (error) {
        setLog(`No se pudo subir la imagen: ${error.message}`, 'error');
      }
    });

    $('btnAddGaleria').addEventListener('click', () => addGaleriaRow({ tipo: 'imagen' }));

    $('btnPublicar').addEventListener('click', publishCatalog);
    $('btnDescargar').addEventListener('click', downloadJson);
    $('btnDescartar').addEventListener('click', () => reloadCatalog());

    $('f-whatsapp').addEventListener('input', applyConfig);
    $('f-moneda').addEventListener('input', applyConfig);

    window.addEventListener('beforeunload', (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  /* ================= Arranque ================= */

  function hydrate() {
    const repo = storage.get('mftech.admin.repo', DEFAULT_REPO);
    $('f-repo').value = repo;
    $('f-branch').value = storage.get('mftech.admin.branch', DEFAULT_BRANCH);
    $('f-token').value = storage.get('mftech.admin.token', '');
    $('f-whatsapp').value = DEFAULT_WHATSAPP;
    $('f-moneda').value = DEFAULT_CURRENCY;

    const [owner, name] = repo.split('/');
    if (owner && name) {
      state.owner = owner;
      state.repo = name;
    }
  }

  async function init() {
    if (location.protocol === 'file:') $('fileWarning').hidden = false;

    hydrate();
    bindEvents();
    renderList();
    updatePreview();
    refreshStatus();

    if ($('f-token').value) {
      const ok = await connect({ silent: true });
      if (!ok) setLog('No se pudo reconectar automáticamente. Revisá el token.', 'error');
    }
  }

  init();
})();
