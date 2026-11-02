/* MF Tech Store — catálogo dinámico
 * Lee store/data/products.json y dibuja las tarjetas del catálogo.
 * Para agregar un producto, editá ese JSON (no hace falta tocar este archivo).
 */
(() => {
  'use strict';

  const DATA_URL = 'data/products.json';
  const WA_DEFAULT = '5492325406322';
  const CURRENCY_DEFAULT = 'ARS';

  /* ---------- Utilidades ---------- */

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
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
    if (currency === 'ARS') return `$${number}`;
    return `${number} ${currency}`;
  };

  const waLink = (phone, message) =>
    `https://wa.me/${String(phone || WA_DEFAULT).replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;

  /* ---------- Menú y año ---------- */

  const menuBtn = document.getElementById('menuBtn');
  const mainNav = document.getElementById('mainNav');

  if (menuBtn && mainNav) {
    menuBtn.addEventListener('click', () => {
      const open = mainNav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });

    mainNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* ---------- Reveal (progresivo, no bloquea si no hay soporte) ---------- */

  let observer = null;
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
  }

  const observeReveals = (root) => {
    const targets = (root || document).querySelectorAll('.reveal:not(.reveal-in)');
    if (!observer) {
      targets.forEach((el) => el.classList.add('reveal-in'));
      return;
    }
    targets.forEach((el) => observer.observe(el));
  };

  observeReveals(document);

  /* ---------- Render de una tarjeta ---------- */

  function renderCard(product, config) {
    const titulo = product.titulo || 'Producto sin título';
    const categorias = (Array.isArray(product.categorias) ? product.categorias : [])
      .filter(Boolean);
    const categorySlugs = categorias.map(slugify).filter(Boolean);
    const currency = product.moneda || config.moneda || CURRENCY_DEFAULT;
    const disponible = product.disponible !== false;
    const priceText = formatPrice(product.precio, currency);

    const badgeText = product.badge || (disponible ? '' : 'Sin stock');
    const badge = badgeText
      ? `<div class="product-badge">${esc(badgeText)}</div>`
      : '';

    const features =
      Array.isArray(product.caracteristicas) && product.caracteristicas.length
        ? `<div class="product-features">
             <h4>Características principales</h4>
             <ul>${product.caracteristicas.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
           </div>`
        : '';

    const galleryItems = Array.isArray(product.galeria) ? product.galeria : [];
    const gallery = galleryItems.length
      ? `<div class="product-media-gallery">
           <h4>Capturas y demostración</h4>
           <div class="gallery-grid">
             ${galleryItems
               .map((item) => {
                 const src = esc(item.src);
                 if (item.tipo === 'video') {
                   const poster = item.poster ? ` poster="${esc(item.poster)}"` : '';
                   return `<video class="gallery-video" controls preload="metadata"${poster}>
                             <source src="${src}" type="video/mp4">
                             Tu navegador no soporta video HTML5.
                           </video>`;
                 }
                 return `<img class="gallery-img" src="${src}" alt="${esc(item.alt || titulo)}" loading="lazy" />`;
               })
               .join('')}
           </div>
           ${product.galeriaNota ? `<p class="gallery-note">${esc(product.galeriaNota)}</p>` : ''}
         </div>`
      : '';

    const message =
      product.mensajeWhatsapp ||
      `Hola Martín! Quisiera consultar por ${titulo}${priceText ? ` (${priceText} ${currency})` : ''}.`;

    const priceBlock = priceText
      ? `<div class="product-price">
           <span class="price-label">Precio</span>
           <span class="price-amount">${esc(priceText)} <span class="price-currency">${esc(currency)}</span></span>
         </div>`
      : `<div class="product-price">
           <span class="price-label">Precio</span>
           <span class="price-amount">Consultar</span>
         </div>`;

    const buttonLabel = disponible ? 'Consultar por WhatsApp' : 'Consultar disponibilidad';

    const details = features || gallery
      ? `<details class="product-more">
           <summary>Ver detalles</summary>
           ${features}
           ${gallery}
         </details>`
      : '';

    return `<article class="product-card reveal" id="producto-${esc(product.id || slugify(titulo))}" data-category="${esc(categorySlugs.join(' '))}">
      <div class="product-media">
        ${badge}
        <img src="${esc(product.imagen || 'img/logo.jpg')}" alt="${esc(product.imagenAlt || titulo)}" class="product-img" loading="lazy" />
      </div>
      <div class="product-body">
        <div class="product-meta">
          <span class="product-category">${esc(categorias.join(' · '))}</span>
        </div>
        <h3 class="product-title" title="${esc(titulo)}">${esc(titulo)}</h3>
        <p class="product-desc">${esc(product.descripcion || '')}</p>
        ${details}
        <div class="product-footer">
          ${priceBlock}
          <a class="btn btn-primary btn-block" href="${esc(waLink(config.whatsapp, message))}" target="_blank" rel="noopener">
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.6-1.2A9 9 0 1 0 12 3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.8 8.6c.3-.7.6-.7 1-.7h.5c.2 0 .4.1.5.5l.6 1.4c.1.3 0 .5-.2.7l-.5.6c-.1.2-.2.4 0 .7.4.7 1.1 1.5 2.1 2 .3.2.5.1.7 0l.6-.6c.2-.3.4-.3.7-.2l1.4.6c.4.2.5.3.5.5 0 .9-.5 2-1.6 2.3-.7.2-1.6.2-2.9-.4a9 9 0 0 1-3.8-3.6c-.6-1.1-.7-2-.5-2.7Z" fill="currentColor"/></svg>
            ${esc(buttonLabel)}
          </a>
        </div>
      </div>
    </article>`;
  }

  /* ---------- Filtros ---------- */

  function renderFilters(products, filtersEl) {
    const categories = new Map();
    products.forEach((product) => {
      (Array.isArray(product.categorias) ? product.categorias : [])
        .filter(Boolean)
        .forEach((label) => categories.set(slugify(label), label));
    });

    if (!categories.size) {
      filtersEl.hidden = true;
      return;
    }

    filtersEl.innerHTML =
      '<button class="filter-btn active" data-filter="all">Todos</button>' +
      [...categories]
        .map(([slug, label]) => `<button class="filter-btn" data-filter="${esc(slug)}">${esc(label)}</button>`)
        .join('');
  }

  function bindFilters(grid, filtersEl) {
    if (!filtersEl) return;

    filtersEl.addEventListener('click', (event) => {
      const btn = event.target.closest('.filter-btn');
      if (!btn) return;

      filtersEl.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;
      grid.querySelectorAll('.product-card').forEach((card) => {
        const slugs = (card.dataset.category || '').split(' ').filter(Boolean);
        const visible = filter === 'all' || slugs.includes(filter);
        card.style.display = visible ? '' : 'none';
        if (visible) card.classList.add('reveal-in');
      });
    });
  }

  /* ---------- JSON-LD del catálogo (SEO) ---------- */

  function syncProductSchema(product) {
    const script = document.getElementById('ld-product');
    if (!script || !product) return;

    try {
      const data = JSON.parse(script.textContent);
      const price = Number(product.precio);

      data.name = product.titulo || data.name;
      data.description = product.descripcion || data.description;
      if (product.imagen) {
        data.image = new URL(product.imagen, window.location.href).href;
      }
      data.category = (product.categorias || []).join(' · ') || data.category;
      data.offers = data.offers || { '@type': 'Offer' };
      if (Number.isFinite(price)) {
        data.offers.price = String(price);
        data.offers.priceCurrency = product.moneda || CURRENCY_DEFAULT;
      }
      data.offers.availability = product.disponible === false
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock';

      script.textContent = JSON.stringify(data);
    } catch (error) {
      console.warn('[MF Tech Store] No se pudo actualizar el JSON-LD:', error);
    }
  }

  function injectItemList(products) {
    if (products.length < 2) return;

    const data = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Product',
          name: product.titulo,
          description: product.descripcion,
          image: product.imagen ? new URL(product.imagen, window.location.href).href : undefined,
          brand: { '@type': 'Brand', name: 'MF Tech AR' },
          offers: Number.isFinite(Number(product.precio))
            ? {
                '@type': 'Offer',
                price: String(product.precio),
                priceCurrency: product.moneda || CURRENCY_DEFAULT,
                availability: product.disponible === false
                  ? 'https://schema.org/OutOfStock'
                  : 'https://schema.org/InStock',
                url: window.location.href,
                seller: { '@type': 'Organization', name: 'MF Tech AR' },
              }
            : undefined,
        },
      })),
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  /* ---------- Arranque ---------- */

  async function init() {
    const grid = document.getElementById('productsGrid');
    const filtersEl = document.getElementById('filters');
    if (!grid) return;

    try {
      const response = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const config = data.config || {};
      const products = Array.isArray(data.productos) ? data.productos : [];

      if (!products.length) {
        grid.innerHTML = '<p class="products-empty">Todavía no hay productos cargados.</p>';
        return;
      }

      grid.innerHTML = products.map((product) => renderCard(product, config)).join('');
      renderFilters(products, filtersEl);
      bindFilters(grid, filtersEl);
      observeReveals(grid);
      syncProductSchema(products[0]);
      injectItemList(products);
    } catch (error) {
      console.error('[MF Tech Store] No se pudo cargar el catálogo:', error);
      grid.innerHTML =
        '<p class="products-empty">No se pudo cargar el catálogo. ' +
        'Si estás abriendo el archivo directamente, probá con <code>node server-local.js</code> ' +
        'o escribinos por WhatsApp.</p>';
    }
  }

  init();
})();
