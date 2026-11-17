/* ============================================================================
   Corrección de fechas vacunatorias — MF Tech AR
   ----------------------------------------------------------------------------
   Si una vacuna no se aplicó en la fecha programada, calcula los días de
   atraso y la fecha en que se corre la próxima dosis.
   ========================================================================== */
(() => {
  'use strict';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  const intervalos = [
    { nombre: 'Neumococo conjugada', meses: 2 },
    { nombre: 'IPV (Poliomielitis)', meses: 2 },
    { nombre: 'Quíntuple (Pentavalente)', meses: 2 },
    { nombre: 'Rotavirus', meses: 2 },
    { nombre: 'Meningococo ACYW', meses: 2 },
    { nombre: 'Triple viral (SRP)', meses: 3 },
    { nombre: 'Varicela', meses: 0 },
    { nombre: 'Hepatitis A', meses: 0 },
    { nombre: 'Antigripal', meses: 12 },
    { nombre: 'Fiebre amarilla', meses: 0 },
    { nombre: 'Doble bacteriana (dT)', meses: 120 },
    { nombre: 'Otro (personalizado)', meses: null },
  ];

  function parseFecha(s) {
    if (window.mfFecha) return window.mfFecha.parseFecha(s);
    if (s instanceof Date) return new Date(s.getTime());
    const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(s);
  }
  function formatoFecha(d) {
    if (window.mfFecha) return window.mfFecha.formatoFecha(d);
    const day = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    return `${day}/${m}/${y}`;
  }
  function sumarMeses(fecha, meses) {
    if (window.mfFecha) return window.mfFecha.sumarMeses(fecha, meses);
    const d = parseFecha(fecha);
    const diaOriginal = d.getDate();
    d.setMonth(d.getMonth() + meses);
    if (d.getDate() !== diaOriginal) d.setDate(0);
    return d;
  }
  function diasEntre(a, b) {
    if (window.mfFecha) return window.mfFecha.diasEntre(a, b);
    const da = parseFecha(a); const db = parseFecha(b);
    return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
  }

  function formHTML(p) {
    const opts = intervalos.map((v, i) => `<option value="${i}">${esc(v.nombre)}${v.meses ? ' (cada ' + v.meses + ' mes/es)' : ''}</option>`).join('');
    return `
      <div class="tw-form">
        <label>Vacuna
          <select id="${p}_vacuna">${opts}</select>
        </label>
        <label id="${p}_lblIntervalo" style="display:none">Intervalo personalizado (meses)
          <input type="number" id="${p}_intervalo" min="0" value="1" />
        </label>
        <label>Fecha programada (cuándo debía aplicarse)
          <input type="text" id="${p}_programada" placeholder="DD/MM/AAAA" inputmode="numeric" autocomplete="off" />
        </label>
        <label>Fecha de aplicación real (o prevista)
          <input type="text" id="${p}_real" placeholder="DD/MM/AAAA" inputmode="numeric" autocomplete="off" />
        </label>
      </div>
      <button class="btn btn-primary" id="${p}_ir">Calcular corrimiento</button>
      <div id="${p}_salida" class="tw-out"></div>`;
  }

  function wire(root, p) {
    const sel = root.querySelector(`#${p}_vacuna`);
    const lblInt = root.querySelector(`#${p}_lblIntervalo`);
    sel.addEventListener('change', () => {
      const v = intervalos[Number(sel.value)];
      lblInt.style.display = (v.meses === null) ? 'block' : 'none';
    });
    // default fecha real = hoy (DD/MM/AAAA)
    const hoy = formatoFecha(new Date());
    root.querySelector(`#${p}_real`).value = hoy;
    root.querySelector(`#${p}_ir`).addEventListener('click', () => {
      const idx = Number(sel.value);
      const v = intervalos[idx];
      const programada = root.querySelector(`#${p}_programada`).value;
      const real = root.querySelector(`#${p}_real`).value;
      if (!programada || !real) {
        root.querySelector(`#${p}_salida`).innerHTML = '<p style="color:#b91c1c">Ingresá ambas fechas.</p>';
        return;
      }
      let meses = v.meses;
      if (meses === null) meses = Number(root.querySelector(`#${p}_intervalo`).value) || 0;
      const atraso = diasEntre(programada, real);
      const proxima = meses > 0 ? sumarMeses(real, meses) : null;
      let html = `
        <div class="tw-metrics">
          <div class="tw-metric"><b>${atraso >= 0 ? atraso : 0}</b><span>días de atraso</span></div>
          <div class="tw-metric"><b>${formatoFecha(real)}</b><span>fecha de aplicación</span></div>
          ${proxima ? `<div class="tw-metric"><b>${formatoFecha(proxima)}</b><span>próxima dosis (corrida)</span></div>` : ''}
        </div>`;
      if (atraso < 0) {
        html += `<div class="tw-verdict warn"><b>Aún no llegó la fecha programada</b><p>La fecha de aplicación es anterior a la programada. Verificá las fechas.</p></div>`;
      } else if (atraso === 0) {
        html += `<div class="tw-verdict ok"><b>En fecha</b><p>Se aplica en el día programado.</p></div>`;
      } else {
        html += `<div class="tw-verdict warn"><b>Retraso de ${atraso} días</b><p>La próxima dosis se corre al ${proxima ? formatoFecha(proxima) : '—'} (no se acorta el intervalo).</p></div>`;
      }
      if (meses === 0) {
        html += `<p class="tw-hint">Esta vacuna es de dosis única; no hay próxima dosis por intervalo.</p>`;
      } else {
        const diasProx = diasEntre(real, proxima);
        html += `<p class="tw-hint">Intervalo aplicado: ${meses} mes/es (${diasProx} días) a partir de la fecha de aplicación real.</p>`;
      }
      root.querySelector(`#${p}_salida`).innerHTML = html;
    });
  }

  // Montaje en página de vacunación
  function montar() {
    const app = document.getElementById('corrimientoApp');
    if (!app) return;
    app.innerHTML = formHTML('c');
    wire(app, 'c');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montar);
  } else {
    montar();
  }
})();
