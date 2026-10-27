/* MF Tech AR — WoS Tools
   Herramientas para WhiteOut Survival. Todo se calcula en el navegador:
   no se envía nada a ningún servidor. Los datos se guardan en este equipo
   (localStorage) y se pueden exportar a CSV. */

(() => {
  'use strict';

  const root = document.getElementById('wosRoot');
  if (!root) return;

  /* ---------------- utilidades ---------------- */

  const $ = (sel, ctx = root) => ctx.querySelector(sel);
  const $$ = (sel, ctx = root) => Array.from(ctx.querySelectorAll(sel));

  const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
  const fmt = (v) => (Number.isFinite(v) ? nf.format(v) : '—');
  const num = (v) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const int = (v) => Math.max(0, Math.round(num(v)));
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const LS = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('mftech-wos:' + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('mftech-wos:' + key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => new Date().toISOString().slice(0, 10);

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
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function downloadCSV(filename, header, rows) {
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = [header, ...rows].map((r) => r.map(q).join(';')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Archivo exportado');
  }

  function humanTime(totalMin) {
    if (!Number.isFinite(totalMin) || totalMin <= 0) return '0 min';
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = Math.round(totalMin % 60);
    const parts = [];
    if (d) parts.push(d + ' d');
    if (h) parts.push(h + ' h');
    if (m && !d) parts.push(m + ' min');
    return parts.join(' ') || '0 min';
  }

  function field(c) {
    const id = 'f-' + c.id;
    const full = c.full ? ' full' : '';
    let control;
    if (c.options) {
      control =
        `<select id="${id}" name="${c.id}">` +
        c.options
          .map(
            (o) =>
              `<option value="${esc(o.v)}"${String(o.v) === String(c.value) ? ' selected' : ''}>${esc(o.l)}</option>`
          )
          .join('') +
        '</select>';
    } else if (c.type === 'textarea') {
      control = `<textarea id="${id}" name="${c.id}" placeholder="${esc(c.placeholder || '')}">${esc(c.value || '')}</textarea>`;
    } else if (c.type === 'date') {
      control = `<input id="${id}" name="${c.id}" type="date" value="${esc(c.value ?? today())}">`;
    } else {
      const numeric = !c.type || c.type === 'number';
      control =
        `<input id="${id}" name="${c.id}" type="${c.type || 'number'}"` +
        (numeric ? ' inputmode="decimal"' : '') +
        ` value="${esc(c.value ?? '')}"` +
        (c.min !== undefined ? ` min="${c.min}"` : '') +
        (c.max !== undefined ? ` max="${c.max}"` : '') +
        (c.step ? ` step="${c.step}"` : '') +
        ` placeholder="${esc(c.placeholder || '')}">`;
    }
    return `<div class="field${full}"><label for="${id}">${esc(c.label)}</label>${control}${
      c.hint ? `<span class="hint">${esc(c.hint)}</span>` : ''
    }</div>`;
  }

  const val = (name) => {
    const el = $('[name="' + name + '"]');
    return el ? el.value : '';
  };

  const stat = (label, value, note = '', gold = false) =>
    `<div class="stat${gold ? ' is-gold' : ''}"><span>${esc(label)}</span><b>${value}</b>${
      note ? `<small>${esc(note)}</small>` : ''
    }</div>`;

  function table(headers, rows) {
    return (
      `<div class="table-wrap"><table class="data-table"><thead><tr>` +
      headers.map((h) => `<th>${esc(h)}</th>`).join('') +
      `</tr></thead><tbody>` +
      rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') +
      `</tbody></table></div>`
    );
  }

  function exportBtn(label, cls = 'mini-btn') {
    return `<button type="button" class="${cls}" data-export>${esc(label)}</button>`;
  }

  function limitBar(container, count, max) {
    const pct = Math.min(100, (count / max) * 100);
    container.innerHTML =
      `<span>${count} de ${max} guardados</span>` +
      `<span class="limit-track"><span class="limit-fill${count >= max ? ' is-full' : ''}" style="width:${pct}%"></span></span>` +
      `<span>${max - count} disponibles</span>`;
  }

  function wireReset() {
    $$('[data-reset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('input, select, textarea').forEach((el) => {
          if (el.tagName === 'SELECT') el.selectedIndex = 0;
          else el.value = el.defaultValue ?? '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
    });
  }

  function wireTabs() {
    const tabs = $$('.tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
        $$('.tabpanel').forEach((p) => {
          p.hidden = p.id !== tab.getAttribute('aria-controls');
        });
      });
    });
  }

  /* ---------------- herramientas ---------------- */

  const TOOLS = {};

  /* --- 1. Mejoras: edificios, investigación, academia --- */
  TOOLS.upgrades = () => {
    root.innerHTML = `
      <div class="tool-grid">
        <div>
          <section class="panel">
            <h2 class="panel-title">Datos de la mejora</h2>
            <p class="panel-sub">Cargá el costo y el tiempo del próximo nivel tal como aparecen en el juego.</p>
            <div class="fields">
              ${field({
                id: 'tipo',
                label: 'Qué estás mejorando',
                options: [
                  { v: 'edificio', l: 'Edificio' },
                  { v: 'investigacion', l: 'Investigación' },
                  { v: 'academia', l: 'Academia de Guerra' }
                ]
              })}
              ${field({ id: 'desde', label: 'Nivel actual', value: 1, min: 0 })}
              ${field({ id: 'hasta', label: 'Nivel objetivo', value: 20, min: 1 })}
              ${field({ id: 'costo', label: 'Costo del próximo nivel', value: 10000, min: 0, hint: 'Recurso principal (comida, madera, hierro o plata).' })}
              ${field({ id: 'multCosto', label: 'Aumento de costo por nivel', value: 1.3, step: '0.01', min: 1, hint: '1,30 = cada nivel cuesta 30% más.' })}
              ${field({ id: 'tiempo', label: 'Tiempo del próximo nivel (min)', value: 60, min: 0 })}
              ${field({ id: 'multTiempo', label: 'Aumento de tiempo por nivel', value: 1.2, step: '0.01', min: 1 })}
            </div>
          </section>

          <section class="panel">
            <h2 class="panel-title">Tu situación</h2>
            <p class="panel-sub">Opcional, para saber cuánto falta y cuándo lo terminás.</p>
            <div class="fields">
              ${field({ id: 'bonus', label: 'Bonus de velocidad (%)', value: 0, min: 0, hint: 'Investigaciones, buffs o título de estado.' })}
              ${field({ id: 'aceleradores', label: 'Aceleradores disponibles (min)', value: 0, min: 0 })}
              ${field({ id: 'disponible', label: 'Recursos disponibles', value: 0, min: 0 })}
              ${field({ id: 'produccion', label: 'Producción por hora', value: 0, min: 0, hint: 'Recurso por hora para calcular el tiempo de farmeo.' })}
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-ghost btn-small" data-reset>Restablecer</button>
            </div>
            <div class="notice" id="aviso"></div>
          </section>
        </div>

        <aside class="panel results">
          <h2 class="panel-title">Resultado</h2>
          <p class="panel-sub">Estimación según tus datos.</p>
          <div class="stat-grid" id="out"></div>
          <div id="detalle"></div>
        </aside>
      </div>`;

    const out = $('#out');
    const update = () => {
      const desde = int(val('desde'));
      const hasta = int(val('hasta'));
      const costo = num(val('costo'));
      const mc = Math.max(1, num(val('multCosto')) || 1);
      const tiempo = num(val('tiempo'));
      const mt = Math.max(1, num(val('multTiempo')) || 1);
      const bonus = Math.max(0, num(val('bonus')));
      const accel = Math.max(0, num(val('aceleradores')));
      const disponible = Math.max(0, num(val('disponible')));
      const produccion = Math.max(0, num(val('produccion')));

      const aviso = $('#aviso');
      aviso.className = 'notice';

      if (hasta <= desde) {
        out.innerHTML = stat('Niveles', '0', 'El objetivo tiene que ser mayor que el nivel actual.');
        $('#detalle').innerHTML = '';
        aviso.textContent = 'Revisá los niveles: el objetivo debe ser mayor que el actual.';
        aviso.classList.add('warn');
        return;
      }

      const niveles = hasta - desde;
      let c = costo;
      let t = tiempo;
      let totalCosto = 0;
      let totalTiempo = 0;
      const filas = [];
      for (let i = 1; i <= niveles; i++) {
        totalCosto += c;
        totalTiempo += t;
        if (i <= 30) {
          filas.push([
            String(desde + i),
            fmt(c),
            humanTime(t)
          ]);
        }
        c *= mc;
        t *= mt;
      }

      const tiempoReal = totalTiempo / (1 + bonus / 100);
      const tiempoNeto = Math.max(0, tiempoReal - accel);
      const faltante = Math.max(0, totalCosto - disponible);
      const horasFarm = produccion > 0 && faltante > 0 ? faltante / produccion : null;

      out.innerHTML =
        stat('Niveles a subir', fmt(niveles)) +
        stat('Costo total', fmt(totalCosto), 'recurso principal', true) +
        stat('Tiempo con bonus', humanTime(tiempoReal), bonus ? `bonus de ${fmt(bonus)}%` : 'sin bonus') +
        stat('Tiempo con aceleradores', humanTime(tiempoNeto)) +
        stat('Recursos faltantes', fmt(faltante), faltante ? 'te falta juntar' : 'ya te alcanza') +
        (horasFarm !== null
          ? stat('Tiempo de farmeo', horasFarm >= 48 ? fmt(horasFarm / 24) + ' días' : fmt(horasFarm) + ' h', 'a tu producción actual')
          : '');

      $('#detalle').innerHTML =
        (niveles > 30 ? `<div class="notice">Se muestran los primeros 30 niveles de ${niveles}.</div>` : '') +
        table(['Nivel', 'Costo', 'Tiempo'], filas);

      aviso.textContent =
        'Los valores son estimativos: si el juego cambia costos o tiempos, ajustá el multiplicador hasta que coincida con tu próximo nivel.';
    };

    root.addEventListener('input', update);
    root.addEventListener('change', update);
    wireReset();
    update();
  };

  /* --- 2. Entrenamiento de tropas --- */
  TOOLS.troops = () => {
    root.innerHTML = `
      <div class="tool-grid">
        <div>
          <section class="panel">
            <h2 class="panel-title">Tropas</h2>
            <p class="panel-sub">Capacidad y tiempo por lote de tu cuartel o campo de entrenamiento.</p>
            <div class="fields">
              ${field({ id: 'objetivo', label: 'Tropas objetivo', value: 10000, min: 0 })}
              ${field({ id: 'actuales', label: 'Tropas actuales', value: 0, min: 0 })}
              ${field({ id: 'lote', label: 'Tropas por lote', value: 100, min: 1 })}
              ${field({ id: 'tiempoLote', label: 'Segundos por lote', value: 30, min: 0 })}
              ${field({ id: 'bonus', label: 'Bonus de velocidad (%)', value: 0, min: 0 })}
              ${field({ id: 'aceleradores', label: 'Aceleradores (min)', value: 0, min: 0 })}
            </div>
          </section>

          <section class="panel">
            <h2 class="panel-title">Recursos</h2>
            <p class="panel-sub">Opcional, para estimar el gasto de entrenamiento.</p>
            <div class="fields">
              ${field({ id: 'costoTropa', label: 'Costo por tropa', value: 0, min: 0 })}
              ${field({ id: 'recurso', label: 'Recurso disponible', value: 0, min: 0 })}
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-ghost btn-small" data-reset>Restablecer</button>
            </div>
          </section>
        </div>

        <aside class="panel results">
          <h2 class="panel-title">Resultado</h2>
          <p class="panel-sub">Estimación según tus datos.</p>
          <div class="stat-grid" id="out"></div>
        </aside>
      </div>`;

    const update = () => {
      const objetivo = int(val('objetivo'));
      const actuales = Math.min(int(val('actuales')), objetivo);
      const lote = Math.max(1, int(val('lote')));
      const tiempoLote = Math.max(0, num(val('tiempoLote')));
      const bonus = Math.max(0, num(val('bonus')));
      const accel = Math.max(0, num(val('aceleradores')));
      const costoTropa = Math.max(0, num(val('costoTropa')));
      const recurso = Math.max(0, num(val('recurso')));

      const faltan = Math.max(0, objetivo - actuales);
      const lotes = Math.ceil(faltan / lote);
      const segBase = lotes * tiempoLote;
      const minBase = segBase / 60;
      const minReal = minBase / (1 + bonus / 100);
      const minNeto = Math.max(0, minReal - accel);
      const costoTotal = faltan * costoTropa;
      const faltante = Math.max(0, costoTotal - recurso);

      $('#out').innerHTML =
        stat('Tropas a entrenar', fmt(faltan), actuales ? `ya tenés ${fmt(actuales)}` : '') +
        stat('Lotes necesarios', fmt(lotes), `${fmt(lote)} por lote`) +
        stat('Tiempo base', humanTime(minBase)) +
        stat('Tiempo con bonus', humanTime(minReal), bonus ? `bonus de ${fmt(bonus)}%` : 'sin bonus') +
        stat('Tiempo con aceleradores', humanTime(minNeto)) +
        (costoTropa > 0
          ? stat('Costo total', fmt(costoTotal), faltante ? `faltan ${fmt(faltante)}` : 'recurso suficiente', true)
          : '');
    };

    root.addEventListener('input', update);
    root.addEventListener('change', update);
    wireReset();
    update();
  };

  /* --- 2.b Formación de marcha --- */
  TOOLS.march = () => {
    root.innerHTML = `
      <div class="tool-grid">
        <div>
          <section class="panel">
            <h2 class="panel-title">Reparto de la marcha</h2>
            <p class="panel-sub">Definí cuántas tropas mandás y qué proporción va de cada tipo.</p>
            <div class="fields">
              ${field({ id: 'total', label: 'Tropas en la marcha', value: 100000, min: 0 })}
              ${field({ id: 'capacidad', label: 'Capacidad de marcha', value: 0, min: 0, hint: 'Opcional: si la cargás, avisa si te pasás.' })}
              ${field({ id: 'inf', label: 'Infantería (%)', value: 50, min: 0, max: 100 })}
              ${field({ id: 'cab', label: 'Caballería (%)', value: 30, min: 0, max: 100 })}
              ${field({ id: 'arq', label: 'Arqueros (%)', value: 20, min: 0, max: 100 })}
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-ghost btn-small" data-reset>Restablecer</button>
            </div>
            <div class="notice" id="aviso"></div>
          </section>
        </div>

        <aside class="panel results">
          <h2 class="panel-title">Resultado</h2>
          <p class="panel-sub">Tropas por tipo según la proporción.</p>
          <div class="stat-grid" id="out"></div>
          <div id="detalle"></div>
        </aside>
      </div>`;

    const update = () => {
      const total = Math.max(0, num(val('total')));
      const capacidad = Math.max(0, num(val('capacidad')));
      const inf = Math.max(0, num(val('inf')));
      const cab = Math.max(0, num(val('cab')));
      const arq = Math.max(0, num(val('arq')));
      const suma = inf + cab + arq;

      const aviso = $('#aviso');
      aviso.className = 'notice';
      if (suma <= 0) {
        $('#out').innerHTML = stat('Tropas', fmt(total), 'cargá al menos un porcentaje');
        $('#detalle').innerHTML = '';
        aviso.textContent = 'La suma de porcentajes tiene que ser mayor que cero.';
        aviso.classList.add('warn');
        return;
      }

      const nInf = Math.round((total * inf) / suma);
      const nCab = Math.round((total * cab) / suma);
      const nArq = Math.max(0, total - nInf - nCab);
      const exceso = capacidad > 0 ? Math.max(0, total - capacidad) : 0;
      const entran = capacidad > 0 ? Math.min(total, capacidad) : total;

      $('#out').innerHTML =
        stat('Infantería', fmt(nInf), ((nInf / total) * 100).toFixed(1) + '%') +
        stat('Caballería', fmt(nCab), ((nCab / total) * 100).toFixed(1) + '%') +
        stat('Arqueros', fmt(nArq), ((nArq / total) * 100).toFixed(1) + '%') +
        stat('Total de la marcha', fmt(total), capacidad ? (exceso ? 'te pasás por ' + fmt(exceso) : 'entra en la capacidad') : 'sin límite cargado', true) +
        (capacidad > 0 ? stat('Tropas que entran', fmt(entran), 'según capacidad') : '');

      $('#detalle').innerHTML =
        table(
          ['Tipo', 'Tropas', 'Proporción'],
          [
            ['Infantería', fmt(nInf), ((nInf / total) * 100).toFixed(1) + '%'],
            ['Caballería', fmt(nCab), ((nCab / total) * 100).toFixed(1) + '%'],
            ['Arqueros', fmt(nArq), ((nArq / total) * 100).toFixed(1) + '%']
          ]
        ) +
        (suma !== 100
          ? `<div class="notice">Los porcentajes suman ${fmt(suma)}%. Se normalizaron para repartir el total de tropas.</div>`
          : '');

      aviso.textContent =
        'El reparto es proporcional: si los porcentajes no suman 100, se ajustan automáticamente. Ajustá el total para que coincida con la capacidad de tu marcha.';
    };

    root.addEventListener('input', update);
    root.addEventListener('change', update);
    wireReset();
    update();
  };

  /* --- 3. Equipamiento y encantamientos --- */
  TOOLS.gear = () => {
    root.innerHTML = `
      <div class="tool-grid">
        <div>
          <section class="panel">
            <h2 class="panel-title">Equipamiento</h2>
            <p class="panel-sub">Sirve para gear de jefe, charms o gear de héroes: la matemática es la misma.</p>
            <div class="fields">
              ${field({
                id: 'tipo',
                label: 'Tipo',
                options: [
                  { v: 'chief', l: 'Gear del jefe' },
                  { v: 'charms', l: 'Chief charms' },
                  { v: 'heroes', l: 'Gear de héroes' }
                ]
              })}
              ${field({ id: 'piezas', label: 'Piezas a mejorar', value: 6, min: 1, max: 6 })}
              ${field({ id: 'desde', label: 'Nivel actual', value: 0, min: 0 })}
              ${field({ id: 'hasta', label: 'Nivel objetivo', value: 10, min: 1 })}
              ${field({ id: 'costo', label: 'Material por nivel', value: 100, min: 0, hint: 'Costo de subir un nivel de una pieza.' })}
              ${field({ id: 'mult', label: 'Aumento por nivel', value: 1.25, step: '0.01', min: 1 })}
              ${field({ id: 'material', label: 'Material disponible', value: 0, min: 0 })}
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-ghost btn-small" data-reset>Restablecer</button>
            </div>
            <div class="notice" id="aviso"></div>
          </section>
        </div>

        <aside class="panel results">
          <h2 class="panel-title">Resultado</h2>
          <p class="panel-sub">Material necesario para todas las piezas.</p>
          <div class="stat-grid" id="out"></div>
          <div id="detalle"></div>
        </aside>
      </div>`;

    const update = () => {
      const piezas = Math.min(6, Math.max(1, int(val('piezas'))));
      const desde = int(val('desde'));
      const hasta = int(val('hasta'));
      const costo = Math.max(0, num(val('costo')));
      const mult = Math.max(1, num(val('mult')) || 1);
      const material = Math.max(0, num(val('material')));
      const aviso = $('#aviso');
      aviso.className = 'notice';

      if (hasta <= desde) {
        $('#out').innerHTML = stat('Niveles', '0', 'El objetivo debe ser mayor al nivel actual.');
        $('#detalle').innerHTML = '';
        aviso.textContent = 'Revisá los niveles: el objetivo debe ser mayor que el actual.';
        aviso.classList.add('warn');
        return;
      }

      const niveles = hasta - desde;
      let c = costo;
      let porPieza = 0;
      const filas = [];
      for (let i = 1; i <= niveles; i++) {
        porPieza += c;
        if (i <= 25) filas.push([String(desde + i), fmt(c), fmt(c * piezas), fmt(porPieza * piezas)]);
        c *= mult;
      }
      const total = porPieza * piezas;
      const faltante = Math.max(0, total - material);

      $('#out').innerHTML =
        stat('Niveles por pieza', fmt(niveles)) +
        stat('Material por pieza', fmt(porPieza)) +
        stat('Material total', fmt(total), `${piezas} piezas`, true) +
        stat('Material faltante', fmt(faltante), faltante ? 'te falta juntar' : 'ya te alcanza');

      $('#detalle').innerHTML =
        (niveles > 25 ? `<div class="notice">Se muestran los primeros 25 niveles de ${niveles}.</div>` : '') +
        table(['Nivel', 'Por pieza', `${piezas} piezas`, 'Acumulado'], filas);

      aviso.textContent = 'Ajustá el multiplicador si el costo no crece igual en todos los niveles.';
    };

    root.addEventListener('input', update);
    root.addEventListener('change', update);
    wireReset();
    update();
  };

  /* --- 4. Mascotas y expertos --- */
  TOOLS.pets = () => {
    root.innerHTML = `
      <div class="tool-grid">
        <div>
          <section class="panel">
            <h2 class="panel-title">Mascotas y expertos</h2>
            <p class="panel-sub">Calculá cuánta experiencia y cuántos ítems necesitás para subir de nivel.</p>
            <div class="fields">
              ${field({
                id: 'tipo',
                label: 'Qué estás subiendo',
                options: [
                  { v: 'mascota', l: 'Mascota' },
                  { v: 'experto', l: 'Experto' }
                ]
              })}
              ${field({ id: 'desde', label: 'Nivel actual', value: 1, min: 0 })}
              ${field({ id: 'hasta', label: 'Nivel objetivo', value: 20, min: 1 })}
              ${field({ id: 'xpNivel', label: 'XP para el próximo nivel', value: 500, min: 0 })}
              ${field({ id: 'mult', label: 'Aumento de XP por nivel', value: 1.15, step: '0.01', min: 1 })}
              ${field({ id: 'xpItem', label: 'XP por ítem', value: 50, min: 1 })}
              ${field({ id: 'items', label: 'Ítems disponibles', value: 0, min: 0 })}
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-ghost btn-small" data-reset>Restablecer</button>
            </div>
            <div class="notice" id="aviso"></div>
          </section>
        </div>

        <aside class="panel results">
          <h2 class="panel-title">Resultado</h2>
          <p class="panel-sub">Estimación según tus datos.</p>
          <div class="stat-grid" id="out"></div>
          <div id="detalle"></div>
        </aside>
      </div>`;

    const update = () => {
      const desde = int(val('desde'));
      const hasta = int(val('hasta'));
      const xpNivel = Math.max(0, num(val('xpNivel')));
      const mult = Math.max(1, num(val('mult')) || 1);
      const xpItem = Math.max(1, num(val('xpItem')));
      const items = Math.max(0, num(val('items')));
      const aviso = $('#aviso');
      aviso.className = 'notice';

      if (hasta <= desde) {
        $('#out').innerHTML = stat('Niveles', '0', 'El objetivo debe ser mayor al nivel actual.');
        $('#detalle').innerHTML = '';
        aviso.textContent = 'Revisá los niveles: el objetivo debe ser mayor que el actual.';
        aviso.classList.add('warn');
        return;
      }

      const niveles = hasta - desde;
      let xp = xpNivel;
      let total = 0;
      const filas = [];
      for (let i = 1; i <= niveles; i++) {
        total += xp;
        if (i <= 25) filas.push([String(desde + i), fmt(xp), fmt(Math.ceil(xp / xpItem))]);
        xp *= mult;
      }
      const necesarios = Math.ceil(total / xpItem);
      const faltan = Math.max(0, necesarios - items);

      $('#out').innerHTML =
        stat('Niveles a subir', fmt(niveles)) +
        stat('XP total', fmt(total), '', true) +
        stat('Ítems necesarios', fmt(necesarios), `${fmt(xpItem)} XP por ítem`) +
        stat('Ítems faltantes', fmt(faltan), faltan ? 'te falta juntar' : 'ya te alcanza');

      $('#detalle').innerHTML =
        (niveles > 25 ? `<div class="notice">Se muestran los primeros 25 niveles de ${niveles}.</div>` : '') +
        table(['Nivel', 'XP', 'Ítems'], filas);

      aviso.textContent = 'Usá el multiplicador para reflejar cómo escala la XP en los niveles altos.';
    };

    root.addEventListener('input', update);
    root.addEventListener('change', update);
    wireReset();
    update();
  };

  /* --- 5. Formación de héroes --- */
  TOOLS.heroes = () => {
    const tipos = [
      { v: 'infanteria', l: 'Infantería' },
      { v: 'caballeria', l: 'Caballería' },
      { v: 'arquero', l: 'Arqueros' }
    ];
    const slots = Array.from({ length: 5 })
      .map(
        (_, i) => `
        <div class="fields" style="margin-bottom:12px">
          ${field({ id: 'h' + i + 'nombre', label: 'Héroe ' + (i + 1), type: 'text', placeholder: 'Nombre del héroe' })}
          ${field({ id: 'h' + i + 'poder', label: 'Poder', value: 0, min: 0 })}
          ${field({ id: 'h' + i + 'tipo', label: 'Tropa que potencia', options: tipos })}
        </div>`
      )
      .join('');

    root.innerHTML = `
      <div class="tool-grid">
        <div>
          <section class="panel">
            <h2 class="panel-title">Armá tu formación</h2>
            <p class="panel-sub">Cargá los héroes que usás y el poder de cada uno.</p>
            ${slots}
            <div class="fields">
              ${field({ id: 'nombre', label: 'Nombre de la formación', type: 'text', placeholder: 'Ej.: Rally principal', full: true })}
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-primary btn-small" id="guardar">Guardar formación</button>
              <button type="button" class="btn btn-ghost btn-small" data-reset>Restablecer</button>
            </div>
          </section>

          <section class="panel">
            <div class="limit-bar" id="limite"></div>
            <div class="item-list" id="lista"></div>
          </section>
        </div>

        <aside class="panel results">
          <h2 class="panel-title">Resumen</h2>
          <p class="panel-sub">Composición de la formación actual.</p>
          <div class="stat-grid" id="out"></div>
          <div id="detalle"></div>
        </aside>
      </div>`;

    const MAX = 10;
    let editId = null;

    const readSlots = () =>
      Array.from({ length: 5 }, (_, i) => ({
        nombre: String(val('h' + i + 'nombre')).trim(),
        poder: Math.max(0, num(val('h' + i + 'poder'))),
        tipo: val('h' + i + 'tipo') || 'infanteria'
      }));

    const setSlots = (arr) => {
      for (let i = 0; i < 5; i++) {
        const s = arr[i] || { nombre: '', poder: 0, tipo: 'infanteria' };
        $('[name="h' + i + 'nombre"]').value = s.nombre || '';
        $('[name="h' + i + 'poder"]').value = s.poder || 0;
        $('[name="h' + i + 'tipo"]').value = s.tipo || 'infanteria';
      }
      root.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const update = () => {
      const s = readSlots();
      const usados = s.filter((x) => x.nombre || x.poder > 0);
      const total = usados.reduce((a, x) => a + x.poder, 0);
      const cuenta = {
        infanteria: usados.filter((x) => x.tipo === 'infanteria').length,
        caballeria: usados.filter((x) => x.tipo === 'caballeria').length,
        arquero: usados.filter((x) => x.tipo === 'arquero').length
      };
      const tiposUsados = Object.values(cuenta).filter((n) => n > 0).length;

      $('#out').innerHTML =
        stat('Héroes cargados', fmt(usados.length) + ' / 5') +
        stat('Poder total', fmt(total), usados.length ? 'suma de la formación' : '', true) +
        stat('Poder promedio', usados.length ? fmt(total / usados.length) : '—') +
        stat('Tipos de tropa', fmt(tiposUsados), tiposUsados >= 2 ? 'formación equilibrada' : 'una sola tropa');

      $('#detalle').innerHTML = usados.length
        ? table(
            ['Héroe', 'Tropa', 'Poder'],
            usados.map((x) => [esc(x.nombre || '—'), esc((tipos.find((t) => t.v === x.tipo) || tipos[0]).l), fmt(x.poder)])
          ) + `<div class="notice">${esc(
            tiposUsados >= 3
              ? 'Tenés las tres tropas representadas: buena base para rally mixto.'
              : tiposUsados === 2
              ? 'Dos tipos de tropa. Sumá el tercero si tu rally lo necesita.'
              : 'Todos los héroes potencian la misma tropa: revisá si te conviene variar.'
          )}</div>`
        : '<div class="empty">Cargá al menos un héroe para ver el resumen.</div>';
    };

    const renderList = () => {
      const list = LS.get('formaciones', []);
      limitBar($('#limite'), list.length, MAX);
      const cont = $('#lista');
      if (!list.length) {
        cont.innerHTML = '<div class="empty">Todavía no guardaste formaciones.</div>';
        return;
      }
      cont.innerHTML = list
        .map(
          (f) => `
          <div class="item-card">
            <div class="item-main">
              <p class="item-title">${esc(f.nombre || 'Formación')}</p>
              <p class="item-meta">${fmt(f.total)} de poder · ${esc(f.fecha || '')}</p>
            </div>
            <div class="item-actions">
              <button type="button" class="mini-btn" data-load="${f.id}">Cargar</button>
              <button type="button" class="mini-btn danger" data-del="${f.id}">Borrar</button>
            </div>
          </div>`
        )
        .join('');
    };

    $('#guardar').addEventListener('click', () => {
      const list = LS.get('formaciones', []);
      const s = readSlots();
      const total = s.reduce((a, x) => a + x.poder, 0);
      if (!s.some((x) => x.nombre.trim())) {
        toast('Cargá al menos un héroe');
        return;
      }
      const nombre = String(val('nombre')).trim() || 'Formación sin nombre';
      if (editId) {
        const i = list.findIndex((f) => f.id === editId);
        if (i >= 0) list[i] = { ...list[i], nombre, slots: s, total, fecha: today() };
        editId = null;
      } else {
        if (list.length >= MAX) {
          toast('Límite de 10 formaciones alcanzado');
          return;
        }
        list.unshift({ id: uid(), nombre, slots: s, total, fecha: today() });
      }
      LS.set('formaciones', list);
      renderList();
      toast('Formación guardada');
    });

    $('#lista').addEventListener('click', (e) => {
      const load = e.target.closest('[data-load]');
      const del = e.target.closest('[data-del]');
      const list = LS.get('formaciones', []);
      if (load) {
        const f = list.find((x) => x.id === load.dataset.load);
        if (f) {
          setSlots(f.slots);
          $('[name="nombre"]').value = f.nombre;
          editId = f.id;
          toast('Formación cargada');
        }
      }
      if (del) {
        LS.set('formaciones', list.filter((x) => x.id !== del.dataset.del));
        renderList();
        toast('Formación borrada');
      }
    });

    root.addEventListener('input', update);
    root.addEventListener('change', update);
    wireReset();
    update();
    renderList();
  };

  /* --- 6. Puntos de evento --- */
  TOOLS.events = () => {
    root.innerHTML = `
      <div class="tool-grid">
        <div>
          <section class="panel">
            <h2 class="panel-title">Objetivo del evento</h2>
            <p class="panel-sub">Los puntos por acción los define cada evento: usá el valor que te muestra el juego.</p>
            <div class="fields">
              ${field({
                id: 'evento',
                label: 'Evento',
                options: [
                  { v: 'svs', l: 'SvS' },
                  { v: 'koi', l: 'KOI' },
                  { v: 'showdown', l: 'Alliance Showdown' },
                  { v: 'moon', l: 'Moon Chief' },
                  { v: 'otro', l: 'Otro' }
                ]
              })}
              ${field({ id: 'objetivo', label: 'Puntos objetivo', value: 100000, min: 0 })}
              ${field({ id: 'porAccion', label: 'Puntos por acción', value: 1000, min: 1 })}
              ${field({ id: 'accionesDia', label: 'Acciones por día', value: 10, min: 0 })}
            </div>
          </section>

          <section class="panel">
            <h2 class="panel-title">Si es de alianza</h2>
            <p class="panel-sub">Opcional: repartí el objetivo entre los miembros.</p>
            <div class="fields">
              ${field({ id: 'objetivoAlianza', label: 'Objetivo de la alianza', value: 0, min: 0 })}
              ${field({ id: 'miembros', label: 'Miembros que participan', value: 0, min: 0 })}
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-ghost btn-small" data-reset>Restablecer</button>
            </div>
          </section>
        </div>

        <aside class="panel results">
          <h2 class="panel-title">Resultado</h2>
          <p class="panel-sub">Cuánto necesitás hacer para llegar.</p>
          <div class="stat-grid" id="out"></div>
          <div id="detalle"></div>
        </aside>
      </div>`;

    const update = () => {
      const objetivo = Math.max(0, num(val('objetivo')));
      const porAccion = Math.max(1, num(val('porAccion')));
      const accionesDia = Math.max(0, num(val('accionesDia')));
      const objAlianza = Math.max(0, num(val('objetivoAlianza')));
      const miembros = Math.max(0, int(val('miembros')));

      const acciones = Math.ceil(objetivo / porAccion);
      const dias = accionesDia > 0 ? acciones / accionesDia : null;
      const porMiembro = miembros > 0 && objAlianza > 0 ? Math.ceil(objAlianza / miembros) : null;
      const accionesMiembro = porMiembro ? Math.ceil(porMiembro / porAccion) : null;

      $('#out').innerHTML =
        stat('Acciones necesarias', fmt(acciones), `${fmt(porAccion)} puntos por acción`) +
        stat('Días al ritmo actual', dias === null ? '—' : fmt(Math.ceil(dias)), accionesDia ? `${fmt(accionesDia)} acciones por día` : 'cargá acciones por día') +
        (porMiembro !== null ? stat('Aporte por miembro', fmt(porMiembro), `${miembros} miembros`, true) : '') +
        (accionesMiembro !== null ? stat('Acciones por miembro', fmt(accionesMiembro)) : '');

      $('#detalle').innerHTML =
        porMiembro !== null
          ? table(
              ['Miembro', 'Puntos', 'Acciones'],
              Array.from({ length: Math.min(miembros, 25) }, (_, i) => [
                'Miembro ' + (i + 1),
                fmt(porMiembro),
                fmt(accionesMiembro)
              ])
            )
          : '<div class="empty">Completá el objetivo de alianza y los miembros para ver el reparto.</div>';
    };

    root.addEventListener('input', update);
    root.addEventListener('change', update);
    wireReset();
    update();
  };

  /* --- 7. Tienda, packs y VIP --- */
  TOOLS.shops = () => {
    root.innerHTML = `
      <div class="tool-grid wide">
        <div>
          <div class="tabs" role="tablist" aria-label="Calculadoras de tienda">
            <button class="tab" role="tab" id="tab-shop" aria-controls="p-shop" aria-selected="true">Tienda de evento</button>
            <button class="tab" role="tab" id="tab-pack" aria-controls="p-pack" aria-selected="false">Valor de pack</button>
            <button class="tab" role="tab" id="tab-vip" aria-controls="p-vip" aria-selected="false">VIP</button>
          </div>

          <section class="panel tabpanel" id="p-shop" role="tabpanel" aria-labelledby="tab-shop">
            <h2 class="panel-title">Tienda de evento</h2>
            <p class="panel-sub">Cuántos ítems podés comprar con la moneda que tenés.</p>
            <div class="fields">
              ${field({ id: 'moneda', label: 'Moneda disponible', value: 1000, min: 0 })}
              ${field({ id: 'costoItem', label: 'Costo por ítem', value: 100, min: 1 })}
              ${field({ id: 'deseados', label: 'Ítems que querés', value: 10, min: 0 })}
            </div>
            <div class="stat-grid" id="shopOut" style="margin-top:18px"></div>
          </section>

          <section class="panel tabpanel" id="p-pack" role="tabpanel" aria-labelledby="tab-pack" hidden>
            <h2 class="panel-title">Valor de pack</h2>
            <p class="panel-sub">Compará cuánto rinde cada pack contra tu referencia habitual.</p>
            <div class="fields">
              ${field({ id: 'precio', label: 'Precio del pack (USD)', value: 5, min: 0, step: '0.01' })}
              ${field({ id: 'gemas', label: 'Gemas incluidas', value: 500, min: 0 })}
              ${field({ id: 'extras', label: 'Extras equivalentes en gemas', value: 0, min: 0, hint: 'Si el pack trae recursos, estimá su valor en gemas.' })}
              ${field({ id: 'tasa', label: 'Tu referencia: gemas por USD', value: 100, min: 0 })}
            </div>
            <div class="stat-grid" id="packOut" style="margin-top:18px"></div>
          </section>

          <section class="panel tabpanel" id="p-vip" role="tabpanel" aria-labelledby="tab-vip" hidden>
            <h2 class="panel-title">Nivel VIP</h2>
            <p class="panel-sub">Cuánto tardás en llegar al nivel que querés.</p>
            <div class="fields">
              ${field({ id: 'vipActual', label: 'Puntos actuales', value: 0, min: 0 })}
              ${field({ id: 'vipObjetivo', label: 'Puntos objetivo', value: 10000, min: 0 })}
              ${field({ id: 'vipDia', label: 'Puntos por día', value: 200, min: 0 })}
            </div>
            <div class="stat-grid" id="vipOut" style="margin-top:18px"></div>
          </section>

          <div class="form-actions">
            <button type="button" class="btn btn-ghost btn-small" data-reset>Restablecer</button>
          </div>
        </div>
      </div>`;

    const shop = () => {
      const moneda = Math.max(0, num(val('moneda')));
      const costo = Math.max(1, num(val('costoItem')));
      const deseados = Math.max(0, int(val('deseados')));
      const alcanzan = Math.floor(moneda / costo);
      const sobran = moneda - Math.min(alcanzan, deseados) * costo;
      const falta = Math.max(0, deseados * costo - moneda);
      $('#shopOut').innerHTML =
        stat('Ítems alcanzables', fmt(alcanzan), 'con la moneda actual') +
        stat('Ítems deseados', fmt(deseados)) +
        stat('Costo de lo deseado', fmt(deseados * costo), falta ? `faltan ${fmt(falta)}` : 'te alcanza', true) +
        stat('Moneda sobrante', fmt(sobran));
    };

    const pack = () => {
      const precio = Math.max(0, num(val('precio')));
      const gemas = Math.max(0, num(val('gemas')));
      const extras = Math.max(0, num(val('extras')));
      const tasa = Math.max(0, num(val('tasa')));
      const total = gemas + extras;
      const porUsd = precio > 0 ? total / precio : 0;
      const diff = tasa > 0 && porUsd > 0 ? (porUsd / tasa - 1) * 100 : null;
      $('#packOut').innerHTML =
        stat('Gemas totales', fmt(total), extras ? `incluye ${fmt(extras)} de extras` : '') +
        stat('Gemas por USD', fmt(porUsd)) +
        (diff === null
          ? ''
          : stat(
              'Contra tu referencia',
              (diff >= 0 ? '+' : '') + fmt(diff) + '%',
              diff >= 0 ? 'mejor que tu referencia' : 'peor que tu referencia',
              true
            ));
    };

    const vip = () => {
      const actual = Math.max(0, num(val('vipActual')));
      const objetivo = Math.max(0, num(val('vipObjetivo')));
      const dia = Math.max(0, num(val('vipDia')));
      const faltan = Math.max(0, objetivo - actual);
      const dias = dia > 0 ? Math.ceil(faltan / dia) : null;
      $('#vipOut').innerHTML =
        stat('Puntos faltantes', fmt(faltan)) +
        stat('Días estimados', dias === null ? '—' : fmt(dias), dia ? `${fmt(dia)} puntos por día` : 'cargá puntos por día') +
        stat('Fecha aproximada', dias === null ? '—' : new Date(Date.now() + dias * 86400000).toLocaleDateString('es-AR'), '', true);
    };

    root.addEventListener('input', () => {
      shop();
      pack();
      vip();
    });
    wireTabs();
    wireReset();
    shop();
    pack();
    vip();
  };

  /* --- 8. Simulador de tiradas --- */
  TOOLS.simulators = () => {
    const nombres = [
      "Mia's Fortune Hut",
      'Silverfrost Shop',
      'Wander Theater',
      'Treasure Hunter',
      'Frosty Fortune',
      'Journey of Light',
      'Otro evento'
    ];

    root.innerHTML = `
      <div class="tool-grid">
        <div>
          <section class="panel">
            <h2 class="panel-title">Simulador de tiradas</h2>
            <p class="panel-sub">Probabilidad de conseguir al menos un premio y cuánto cuesta en promedio.</p>
            <div class="fields">
              ${field({ id: 'eventoNombre', label: 'Evento', type: 'text', placeholder: 'Nombre del evento', full: true })}
            </div>
            <div class="chip-row" id="chips">
              ${nombres.map((n) => `<button type="button" class="chip" data-evento="${esc(n)}">${esc(n)}</button>`).join('')}
            </div>
            <div class="fields" style="margin-top:16px">
              ${field({ id: 'costo', label: 'Costo por tirada', value: 100, min: 0 })}
              ${field({ id: 'prob', label: 'Probabilidad de premio (%)', value: 2, min: 0, max: 100, step: '0.01', hint: 'El % que muestra el evento para el premio que buscás.' })}
              ${field({ id: 'tiradas', label: 'Tiradas que pensás hacer', value: 50, min: 0 })}
              ${field({ id: 'presupuesto', label: 'Presupuesto disponible', value: 5000, min: 0 })}
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-ghost btn-small" data-reset>Restablecer</button>
            </div>
            <div class="notice">Los valores de probabilidad y costo cambian entre eventos y temporadas: cargá los que muestra el juego. Esto es una estimación estadística, no una garantía.</div>
          </section>
        </div>

        <aside class="panel results">
          <h2 class="panel-title">Resultado</h2>
          <p class="panel-sub">Con las tiradas que planeás hacer.</p>
          <div class="stat-grid" id="out"></div>
          <div id="detalle"></div>
        </aside>
      </div>`;

    $('#chips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-evento]');
      if (!chip) return;
      $$('#chips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      const input = $('[name="eventoNombre"]');
      const valor = chip.dataset.evento === 'Otro evento' ? '' : chip.dataset.evento;
      input.value = valor;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const update = () => {
      const p = Math.min(1, Math.max(0, num(val('prob')) / 100));
      const costo = Math.max(0, num(val('costo')));
      const tiradas = Math.max(0, int(val('tiradas')));
      const presupuesto = Math.max(0, num(val('presupuesto')));

      const alMenosUno = p > 0 ? 1 - Math.pow(1 - p, tiradas) : 0;
      const esperadas = p > 0 ? 1 / p : null;
      const costoEsperado = esperadas === null ? null : esperadas * costo;
      const alcanzables = costo > 0 ? Math.floor(presupuesto / costo) : null;
      const probPresupuesto = p > 0 && alcanzables !== null ? 1 - Math.pow(1 - p, alcanzables) : 0;
      const nombre = String(val('eventoNombre')).trim();

      $('#out').innerHTML =
        stat('Probabilidad de al menos 1', fmt(alMenosUno * 100) + '%', `${fmt(tiradas)} tiradas`, true) +
        stat('Tiradas esperadas', esperadas === null ? '—' : fmt(Math.ceil(esperadas)), 'para 1 premio en promedio') +
        stat('Costo esperado', costoEsperado === null ? '—' : fmt(costoEsperado), 'gasto promedio por premio') +
        (alcanzables !== null ? stat('Tiradas con tu presupuesto', fmt(alcanzables), fmt(probPresupuesto * 100) + '% de probabilidad') : '');

      $('#detalle').innerHTML =
        `<div class="notice">${esc(nombre ? 'Evento: ' + nombre + '. ' : '')}` +
        `Con ${fmt(tiradas)} tiradas y ${fmt(p * 100)}% por tirada, la chance de al menos un premio es ` +
        `<b>${fmt(alMenosUno * 100)}%</b>. Con ${fmt(presupuesto)} de presupuesto podés hacer ` +
        `${alcanzables === null ? '—' : fmt(alcanzables)} tiradas (${fmt(probPresupuesto * 100)}%).</div>`;
    };

    root.addEventListener('input', update);
    root.addEventListener('change', update);
    wireReset();
    update();
  };

  /* --- 9. Perfiles de personaje --- */
  TOOLS.profiles = () => {
    root.innerHTML = `
      <div class="tool-grid">
        <div>
          <section class="panel">
            <h2 class="panel-title">Nuevo perfil</h2>
            <p class="panel-sub">Hasta 10 perfiles guardados en este equipo.</p>
            <div class="fields">
              ${field({ id: 'nombre', label: 'Nombre del personaje', type: 'text', placeholder: 'Ej.: Martín' })}
              ${field({ id: 'estado', label: 'Estado', type: 'text', placeholder: 'Ej.: #123' })}
              ${field({ id: 'ciudad', label: 'Nivel de ciudad', value: 20, min: 0 })}
              ${field({ id: 'poder', label: 'Poder total', value: 0, min: 0 })}
              ${field({ id: 'inf', label: 'Infantería', value: 0, min: 0 })}
              ${field({ id: 'cab', label: 'Caballería', value: 0, min: 0 })}
              ${field({ id: 'arq', label: 'Arqueros', value: 0, min: 0 })}
              ${field({
                id: 'rol',
                label: 'Rol',
                options: [
                  { v: 'r5', l: 'R5' },
                  { v: 'r4', l: 'R4' },
                  { v: 'r3', l: 'R3' },
                  { v: 'miembro', l: 'Miembro' }
                ]
              })}
              ${field({ id: 'notas', label: 'Notas', type: 'textarea', full: true, placeholder: 'Héroes, objetivos, recordatorios…' })}
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-primary btn-small" id="guardar">Guardar perfil</button>
              <button type="button" class="btn btn-ghost btn-small" id="cancelar" hidden>Cancelar edición</button>
              <button type="button" class="btn btn-ghost btn-small" data-reset>Limpiar</button>
            </div>
          </section>
        </div>

        <aside class="panel results">
          <h2 class="panel-title">Mis perfiles</h2>
          <div class="limit-bar" id="limite"></div>
          <div class="form-actions" style="margin:0 0 14px">
            ${exportBtn('Exportar CSV', 'mini-btn primary')}
          </div>
          <div class="profile-grid" id="lista"></div>
        </aside>
      </div>`;

    const MAX = 10;
    let editId = null;

    const read = () => ({
      nombre: String(val('nombre')).trim(),
      estado: String(val('estado')).trim(),
      ciudad: int(val('ciudad')),
      poder: Math.max(0, num(val('poder'))),
      inf: Math.max(0, num(val('inf'))),
      cab: Math.max(0, num(val('cab'))),
      arq: Math.max(0, num(val('arq'))),
      rol: val('rol'),
      notas: String(val('notas')).trim()
    });

    const write = (p) => {
      $('[name="nombre"]').value = p.nombre || '';
      $('[name="estado"]').value = p.estado || '';
      $('[name="ciudad"]').value = p.ciudad ?? '';
      $('[name="poder"]').value = p.poder ?? 0;
      $('[name="inf"]').value = p.inf ?? 0;
      $('[name="cab"]').value = p.cab ?? 0;
      $('[name="arq"]').value = p.arq ?? 0;
      $('[name="rol"]').value = p.rol || 'miembro';
      $('[name="notas"]').value = p.notas || '';
    };

    const render = () => {
      const list = LS.get('perfiles', []);
      limitBar($('#limite'), list.length, MAX);
      const cont = $('#lista');
      if (!list.length) {
        cont.innerHTML = '<div class="empty">Todavía no cargaste perfiles.</div>';
        return;
      }
      cont.innerHTML = list
        .map(
          (p) => `
          <article class="profile-card">
            <h3>${esc(p.nombre || 'Sin nombre')}</h3>
            <p class="profile-sub">${esc(p.estado ? 'Estado ' + p.estado : 'Sin estado')} · ${esc((p.rol || 'miembro').toUpperCase())}</p>
            <div class="profile-stats">
              <div><span>Ciudad</span><b>${fmt(p.ciudad)}</b></div>
              <div><span>Poder</span><b>${fmt(p.poder)}</b></div>
              <div><span>Infantería</span><b>${fmt(p.inf)}</b></div>
              <div><span>Caballería</span><b>${fmt(p.cab)}</b></div>
              <div><span>Arqueros</span><b>${fmt(p.arq)}</b></div>
              <div><span>Tropas</span><b>${fmt((p.inf || 0) + (p.cab || 0) + (p.arq || 0))}</b></div>
            </div>
            ${p.notas ? `<p class="profile-sub" style="margin:0 0 10px">${esc(p.notas)}</p>` : ''}
            <div class="item-actions">
              <button type="button" class="mini-btn" data-edit="${p.id}">Editar</button>
              <button type="button" class="mini-btn danger" data-del="${p.id}">Borrar</button>
            </div>
          </article>`
        )
        .join('');
    };

    $('#guardar').addEventListener('click', () => {
      const data = read();
      if (!data.nombre) {
        toast('Poné un nombre al perfil');
        return;
      }
      const list = LS.get('perfiles', []);
      if (editId) {
        const i = list.findIndex((p) => p.id === editId);
        if (i >= 0) list[i] = { ...list[i], ...data };
        editId = null;
        $('#cancelar').hidden = true;
      } else {
        if (list.length >= MAX) {
          toast('Límite de 10 perfiles alcanzado');
          return;
        }
        list.unshift({ id: uid(), ...data, fecha: today() });
      }
      LS.set('perfiles', list);
      render();
      $$('input, textarea', $('.panel')).forEach((el) => (el.value = el.defaultValue ?? ''));
      $('[name="rol"]').value = 'miembro';
      toast('Perfil guardado');
    });

    $('#cancelar').addEventListener('click', () => {
      editId = null;
      $('#cancelar').hidden = true;
      $('[name="nombre"]').value = '';
      $('[name="estado"]').value = '';
      $('[name="notas"]').value = '';
      toast('Edición cancelada');
    });

    $('#lista').addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit]');
      const del = e.target.closest('[data-del]');
      const list = LS.get('perfiles', []);
      if (ed) {
        const p = list.find((x) => x.id === ed.dataset.edit);
        if (p) {
          write(p);
          editId = p.id;
          $('#cancelar').hidden = false;
          $('[name="nombre"]').focus();
          toast('Editando ' + (p.nombre || 'perfil'));
        }
      }
      if (del) {
        LS.set('perfiles', list.filter((x) => x.id !== del.dataset.del));
        render();
        toast('Perfil borrado');
      }
    });

    $('[data-export]').addEventListener('click', () => {
      const list = LS.get('perfiles', []);
      if (!list.length) {
        toast('No hay perfiles para exportar');
        return;
      }
      downloadCSV(
        'perfiles-wos-' + today() + '.csv',
        ['Nombre', 'Estado', 'Nivel de ciudad', 'Poder', 'Infantería', 'Caballería', 'Arqueros', 'Rol', 'Notas'],
        list.map((p) => [p.nombre, p.estado, p.ciudad, p.poder, p.inf, p.cab, p.arq, (p.rol || '').toUpperCase(), p.notas])
      );
    });

    wireReset();
    $('[data-reset]').addEventListener('click', () => {
      editId = null;
      $('#cancelar').hidden = true;
    });
    render();
  };

  /* --- 10. Registro del Ministerio --- */
  TOOLS.ministry = () => {
    root.innerHTML = `
      <div class="tool-grid">
        <div>
          <section class="panel">
            <h2 class="panel-title">Nuevo registro</h2>
            <p class="panel-sub">Hasta 10 registros. Quedan guardados indefinidamente.</p>
            <div class="fields">
              ${field({ id: 'nombre', label: 'Nombre', type: 'text', placeholder: 'Nombre del comandante' })}
              ${field({ id: 'estado', label: 'Estado', type: 'text', placeholder: 'Ej.: #123' })}
              ${field({ id: 'alianza', label: 'Alianza', type: 'text', placeholder: 'Ej.: MFT' })}
              ${field({
                id: 'rol',
                label: 'Rol',
                options: [
                  { v: 'ministro', l: 'Ministro' },
                  { v: 'representante', l: 'Representante' },
                  { v: 'miembro', l: 'Miembro' }
                ]
              })}
              ${field({ id: 'fecha', label: 'Fecha de registro', type: 'date' })}
              ${field({ id: 'notas', label: 'Notas', type: 'textarea', full: true, placeholder: 'Acuerdos, contactos, recordatorios…' })}
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-primary btn-small" id="guardar">Guardar registro</button>
              <button type="button" class="btn btn-ghost btn-small" data-reset>Limpiar</button>
            </div>
          </section>
        </div>

        <aside class="panel results">
          <h2 class="panel-title">Registros</h2>
          <div class="limit-bar" id="limite"></div>
          <div class="form-actions" style="margin:0 0 14px">
            ${exportBtn('Exportar CSV', 'mini-btn primary')}
          </div>
          <div class="item-list" id="lista"></div>
        </aside>
      </div>`;

    const MAX = 10;

    const render = () => {
      const list = LS.get('ministerio', []);
      limitBar($('#limite'), list.length, MAX);
      const cont = $('#lista');
      if (!list.length) {
        cont.innerHTML = '<div class="empty">Sin registros todavía.</div>';
        return;
      }
      cont.innerHTML = list
        .map((m) => {
          const dias = m.fecha ? Math.max(0, Math.floor((Date.now() - new Date(m.fecha + 'T00:00:00').getTime()) / 86400000)) : null;
          return `
          <div class="item-card">
            <div class="item-main">
              <p class="item-title">${esc(m.nombre || 'Sin nombre')}</p>
              <p class="item-meta">${esc((m.rol || 'miembro').toUpperCase())} · ${esc(m.alianza || 'sin alianza')} · ${
            dias === null ? 'sin fecha' : dias === 0 ? 'hoy' : 'hace ' + dias + ' días'
          }</p>
            </div>
            <div class="item-actions">
              <button type="button" class="mini-btn danger" data-del="${m.id}">Borrar</button>
            </div>
          </div>`;
        })
        .join('');
    };

    $('#guardar').addEventListener('click', () => {
      const nombre = String(val('nombre')).trim();
      if (!nombre) {
        toast('Poné un nombre');
        return;
      }
      const list = LS.get('ministerio', []);
      if (list.length >= MAX) {
        toast('Límite de 10 registros alcanzado');
        return;
      }
      list.unshift({
        id: uid(),
        nombre,
        estado: String(val('estado')).trim(),
        alianza: String(val('alianza')).trim(),
        rol: val('rol'),
        fecha: val('fecha') || today(),
        notas: String(val('notas')).trim()
      });
      LS.set('ministerio', list);
      render();
      $$('input, textarea').forEach((el) => (el.value = el.defaultValue ?? ''));
      $('[name="fecha"]').value = today();
      $('[name="rol"]').value = 'ministro';
      toast('Registro guardado');
    });

    $('#lista').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (!del) return;
      LS.set('ministerio', LS.get('ministerio', []).filter((m) => m.id !== del.dataset.del));
      render();
      toast('Registro borrado');
    });

    $('[data-export]').addEventListener('click', () => {
      const list = LS.get('ministerio', []);
      if (!list.length) {
        toast('No hay registros para exportar');
        return;
      }
      downloadCSV(
        'ministerio-wos-' + today() + '.csv',
        ['Nombre', 'Estado', 'Alianza', 'Rol', 'Fecha', 'Notas'],
        list.map((m) => [m.nombre, m.estado, m.alianza, (m.rol || '').toUpperCase(), m.fecha, m.notas])
      );
    });

    wireReset();
    render();
  };

  /* --- 11. Territory Planner --- */
  TOOLS.territory = () => {
    const TIPOS = [
      { k: 'v', n: 'Vacío', c: 'rgba(255,255,255,0.025)' },
      { k: 'c', n: 'Ciudad', c: '#40e0d0' },
      { k: 'f', n: 'Fuerte', c: '#7a5cff' },
      { k: 'b', n: 'Bandera', c: '#f5c451' },
      { k: 'e', n: 'Enemigo', c: '#ff6b6b' },
      { k: 'r', n: 'Recurso', c: '#6ee7a8' }
    ];
    const MAX = 10;
    let grid = Array(100).fill('v');
    let brush = 'c';

    root.innerHTML = `
      <div class="planner-layout">
        <div>
          <section class="panel">
            <h2 class="panel-title">Mapa</h2>
            <p class="panel-sub">Elegí un pincel y hacé clic (o arrastrá) sobre la grilla de 10×10.</p>
            <div class="brushes" id="brushes" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));margin-bottom:14px">
              ${TIPOS.map(
                (t) =>
                  `<button type="button" class="brush" data-brush="${t.k}" aria-pressed="${t.k === brush}">
                    <span class="swatch" style="background:${t.c}"></span>${t.n}
                  </button>`
              ).join('')}
            </div>
            <div class="planner-grid" id="grid" role="grid" aria-label="Mapa de territorio 10 por 10"></div>
            <div class="form-actions">
              <button type="button" class="mini-btn" id="limpiar">Vaciar mapa</button>
            </div>
            <div class="stat-grid" id="conteo" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));margin-top:16px"></div>
          </section>
        </div>

        <aside class="panel results">
          <h2 class="panel-title">Layouts</h2>
          <p class="panel-sub">Guardá hasta 10 diseños.</p>
          <div class="limit-bar" id="limite"></div>
          <div class="fields">
            ${field({ id: 'nombreLayout', label: 'Nombre del layout', type: 'text', placeholder: 'Ej.: Rally norte' })}
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-primary btn-small" id="guardar">Guardar diseño</button>
          </div>
          <div class="item-list" id="lista"></div>
        </aside>
      </div>`;

    const gridEl = $('#grid');
    gridEl.innerHTML = Array.from({ length: 100 }, (_, i) => `<button type="button" class="cell" data-i="${i}" aria-label="Celda ${i + 1}"></button>`).join('');

    const tipo = (k) => TIPOS.find((t) => t.k === k) || TIPOS[0];

    const paint = (i) => {
      const cell = gridEl.children[i];
      const t = tipo(grid[i]);
      cell.style.background = t.c;
      cell.title = t.n;
      cell.setAttribute('aria-label', 'Celda ' + (i + 1) + ': ' + t.n);
    };

    const updateCounts = () => {
      const counts = TIPOS.map((t) => ({ ...t, count: grid.filter((k) => k === t.k).length }));
      $('#conteo').innerHTML = counts
        .filter((t) => t.k !== 'v')
        .map((t) => `<div class="stat"><span>${esc(t.n)}</span><b>${fmt(t.count)}</b></div>`)
        .join('');
    };

    const setCell = (i) => {
      grid[i] = brush;
      paint(i);
      updateCounts();
    };

    let painting = false;
    gridEl.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      painting = true;
      setCell(Number(cell.dataset.i));
      e.preventDefault();
    });
    gridEl.addEventListener('pointerover', (e) => {
      if (!painting) return;
      const cell = e.target.closest('.cell');
      if (cell) setCell(Number(cell.dataset.i));
    });
    gridEl.addEventListener('pointermove', (e) => {
      if (!painting) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el && el.closest ? el.closest('.cell') : null;
      if (cell && gridEl.contains(cell)) setCell(Number(cell.dataset.i));
    });
    gridEl.addEventListener('click', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      if (e.detail === 0) setCell(Number(cell.dataset.i));
    });
    window.addEventListener('pointerup', () => (painting = false));

    $('#brushes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-brush]');
      if (!b) return;
      brush = b.dataset.brush;
      $$('#brushes .brush').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });

    $('#limpiar').addEventListener('click', () => {
      grid = Array(100).fill('v');
      grid.forEach((_, i) => paint(i));
      updateCounts();
      toast('Mapa vaciado');
    });

    const renderList = () => {
      const list = LS.get('layouts', []);
      limitBar($('#limite'), list.length, MAX);
      const cont = $('#lista');
      if (!list.length) {
        cont.innerHTML = '<div class="empty">Sin diseños guardados.</div>';
        return;
      }
      cont.innerHTML = list
        .map(
          (l) => `
          <div class="item-card">
            <div class="item-main">
              <p class="item-title">${esc(l.nombre)}</p>
              <p class="item-meta">${esc(l.fecha || '')} · ${fmt((l.grid || []).filter((k) => k !== 'v').length)} celdas pintadas</p>
            </div>
            <div class="item-actions">
              <button type="button" class="mini-btn" data-load="${l.id}">Cargar</button>
              <button type="button" class="mini-btn danger" data-del="${l.id}">Borrar</button>
            </div>
          </div>`
        )
        .join('');
    };

    $('#guardar').addEventListener('click', () => {
      const nombre = String(val('nombreLayout')).trim() || 'Layout sin nombre';
      const list = LS.get('layouts', []);
      if (list.length >= MAX) {
        toast('Límite de 10 diseños alcanzado');
        return;
      }
      list.unshift({ id: uid(), nombre, grid: [...grid], fecha: today() });
      LS.set('layouts', list);
      $('[name="nombreLayout"]').value = '';
      renderList();
      toast('Diseño guardado');
    });

    $('#lista').addEventListener('click', (e) => {
      const load = e.target.closest('[data-load]');
      const del = e.target.closest('[data-del]');
      const list = LS.get('layouts', []);
      if (load) {
        const l = list.find((x) => x.id === load.dataset.load);
        if (l && Array.isArray(l.grid) && l.grid.length === 100) {
          grid = [...l.grid];
          grid.forEach((_, i) => paint(i));
          updateCounts();
          toast('Diseño cargado');
        }
      }
      if (del) {
        LS.set('layouts', list.filter((x) => x.id !== del.dataset.del));
        renderList();
        toast('Diseño borrado');
      }
    });

    grid.forEach((_, i) => paint(i));
    updateCounts();
    renderList();
  };

  /* ---------------- arranque ---------------- */

  const mount = TOOLS[root.dataset.tool];
  if (mount) mount();
  else root.innerHTML = '<div class="empty">Herramienta no encontrada.</div>';
})();
