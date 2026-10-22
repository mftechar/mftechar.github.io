/* ============================================================================
   Motor de la seccion de reseñas — MF Tech AR
   ----------------------------------------------------------------------------
   Lee window.MF_REVIEWS (data/reviews.js) y arma:
   - resumen de estrellas (promedio, total, distribucion)
   - filtros por servicio
   - grilla de tarjetas + "ver mas"
   ========================================================================== */
(() => {
  'use strict';

  const SERVICIOS = {
    todas: 'Todas',
    camaras: 'Cámaras con IA',
    pc: 'PC y notebooks',
    backups: 'Backups',
    redes: 'Redes y WiFi',
    ciberseguridad: 'Ciberseguridad',
    automatizacion: 'Automatización',
  };

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /** SVG de una estrella (llena o vacía). */
  const star = (filled) =>
    `<svg viewBox="0 0 24 24" class="st ${filled ? 'on' : 'off'}" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9L12 2.6Z"/></svg>`;

  /** Fila de 5 estrellas Given un numero (admite medios: 4.5). */
  const stars = (n) => {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += star(n >= i - 0.25);
    }
    return `<span class="stars" role="img" aria-label="${n} de 5 estrellas">${html}</span>`;
  };

  /** Iniciales para el avatar. */
  const iniciales = (name) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');

  /** Color estable a partir del nombre (para que cada avatar sea siempre el mismo). */
  const tono = (name) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return `hsl(${h} 62% 46%)`;
  };

  const fecha = (iso) => {
    const d = new Date(iso + 'T12:00:00');
    return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
  };

  /** Escapa HTML por seguridad. */
  const esc = (s) =>
    String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const data = Array.isArray(window.MF_REVIEWS) ? window.MF_REVIEWS : [];
  if (!data.length) return;

  const promedio = data.reduce((a, r) => a + r.rating, 0) / data.length;
  const total = data.length;

  // Distribucion de estrellas
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: data.filter((r) => r.rating === n).length }));

  // ---------------------------------------------------------------- RESUMEN
  const res = document.getElementById('revResumen');
  if (res) {
    res.innerHTML = `
      <div class="rev-score">
        <div class="rev-num">${promedio.toFixed(1).replace('.', ',')}</div>
        ${stars(promedio)}
        <div class="rev-count">Basado en <b>${total}</b> reseñas verificadas</div>
      </div>
      <div class="rev-bars">
        ${dist
          .filter((d) => d.c > 0)
          .map(
            (d) => `
          <div class="rev-bar">
            <span class="rev-bl">${d.n} <svg viewBox="0 0 24 24" class="st on" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9L12 2.6Z"/></svg></span>
            <span class="rev-track"><i style="width:${(d.c / total) * 100}%"></i></span>
            <span class="rev-bc">${d.c}</span>
          </div>`
          )
          .join('')}
      </div>`;
  }

  // ---------------------------------------------------------------- FILTROS
  const chips = document.getElementById('revFiltros');
  const counts = { todas: total };
  data.forEach((r) => (counts[r.service] = (counts[r.service] || 0) + 1));

  let filtro = 'todas';
  let visibles = 9;

  if (chips) {
    chips.innerHTML = Object.keys(SERVICIOS)
      .map(
        (k) =>
          `<button type="button" class="chip${k === 'todas' ? ' on' : ''}" data-srv="${k}">${SERVICIOS[k]} <b>${counts[k] || 0}</b></button>`
      )
      .join('');
  }

  // ---------------------------------------------------------------- TARJETAS
  const grid = document.getElementById('revGrid');
  const mas = document.getElementById('revMas');

  function tarjeta(r) {
    return `
      <article class="rev">
        <div class="rev-top">
          <span class="rev-ava" style="background:${tono(r.name)}">${esc(iniciales(r.name))}</span>
          <div class="rev-who">
            <b>${esc(r.name)}</b>
            <span>${esc(r.city || '')}</span>
          </div>
          ${stars(r.rating)}
        </div>
        <p class="rev-txt">${esc(r.text)}</p>
        <div class="rev-foot">
          <span class="rev-tag">${esc(SERVICIOS[r.service] || '')}</span>
          <time datetime="${esc(r.date)}">${fecha(r.date)}</time>
        </div>
      </article>`;
  }

  function pintar() {
    if (!grid) return;
    const lista = filtro === 'todas' ? data : data.filter((r) => r.service === filtro);
    const trozo = lista.slice(0, visibles);
    grid.innerHTML = trozo.map(tarjeta).join('');
    if (mas) {
      mas.style.display = visibles < lista.length ? 'inline-flex' : 'none';
      mas.textContent = `Ver más reseñas (${lista.length - visibles} más)`;
      mas.dataset.total = lista.length;
    }
    // Animate las nuevas
    grid.querySelectorAll('.rev').forEach((el, i) => {
      el.style.animationDelay = Math.min(i, 8) * 35 + 'ms';
      el.classList.add('in');
    });
  }

  if (chips) {
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-srv]');
      if (!b) return;
      filtro = b.dataset.srv;
      visibles = 9;
      chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      pintar();
    });
  }

  if (mas) {
    mas.addEventListener('click', () => {
      visibles += 9;
      pintar();
    });
  }

  pintar();

  // Exponer el promedio para el JSON-LD
  window.MF_REVIEW_STATS = { promedio, total };
})();
