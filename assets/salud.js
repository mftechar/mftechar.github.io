/* ============================================================================
   Salud — Calculadora de vacunación (MF Tech AR)
   ----------------------------------------------------------------------------
   Integra el proyecto "Salud" (función Vacunacion) en la web mftechar.com.
   Calcula fechas y días de aplicación de vacunas según el Calendario Nacional
   de Vacunación de Argentina (por etapas de la vida).
   Fuente: https://www.argentina.gob.ar/sites/default/files/2026-03-10_infografia_calendario_vacunas_50x70_digital.pdf
   ========================================================================== */
(() => {
  'use strict';

  // ------------------------- Utilidades de fecha -------------------------
  function parseFecha(input) {
    if (input instanceof Date) {
      if (isNaN(input.getTime())) throw new Error('Fecha inválida');
      return new Date(input.getTime());
    }
    if (typeof input === 'number') {
      const d = new Date(input);
      if (isNaN(d.getTime())) throw new Error('Fecha inválida');
      return d;
    }
    if (typeof input === 'string') {
      const s = input.trim();
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        if (isNaN(d.getTime())) throw new Error('Fecha inválida: ' + s);
        return d;
      }
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        if (isNaN(d.getTime())) throw new Error('Fecha inválida: ' + s);
        return d;
      }
      const d = new Date(s);
      if (isNaN(d.getTime())) throw new Error('Fecha inválida: ' + s);
      return d;
    }
    throw new Error('Tipo de fecha no soportado');
  }

  function formatoISO(date) {
    const d = parseFecha(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatoFecha(date) {
    const d = parseFecha(date);
    const day = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    return `${day}/${m}/${y}`;
  }

  function sumarDias(fecha, dias) {
    const d = parseFecha(fecha);
    d.setDate(d.getDate() + dias);
    return d;
  }
  function sumarSemanas(fecha, semanas) { return sumarDias(fecha, semanas * 7); }
  function sumarMeses(fecha, meses) {
    const d = parseFecha(fecha);
    const diaOriginal = d.getDate();
    d.setMonth(d.getMonth() + meses);
    if (d.getDate() !== diaOriginal) d.setDate(0);
    return d;
  }
  function sumarHoras(fecha, horas) {
    const d = parseFecha(fecha);
    d.setTime(d.getTime() + horas * 60 * 60 * 1000);
    return d;
  }
  function diasEntre(a, b) {
    const da = parseFecha(a);
    const db = parseFecha(b);
    return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
  }
  function edadEnMeses(nacimiento, referencia) {
    const n = parseFecha(nacimiento);
    const r = parseFecha(referencia || new Date());
    let meses = (r.getFullYear() - n.getFullYear()) * 12 + (r.getMonth() - n.getMonth());
    if (r.getDate() < n.getDate()) meses -= 1;
    return meses;
  }
  function edadEnAnios(nacimiento, referencia) {
    const n = parseFecha(nacimiento);
    const r = parseFecha(referencia || new Date());
    let anios = r.getFullYear() - n.getFullYear();
    const m = r.getMonth() - n.getMonth();
    if (m < 0 || (m === 0 && r.getDate() < n.getDate())) anios -= 1;
    return anios;
  }
  function etapaDeVida(nacimiento, referencia) {
    const meses = edadEnMeses(nacimiento, referencia);
    if (meses < 1) return 'Recién nacido/a';
    if (meses < 12) return 'Lactante (menor de 1 año)';
    if (meses < 24) return 'Niño/a (1 a 2 años)';
    const anios = edadEnAnios(nacimiento, referencia);
    if (anios < 5) return 'Niño/a (2 a 5 años)';
    if (anios < 11) return 'Niño/a (5 a 11 años)';
    if (anios < 18) return 'Adolescente';
    if (anios < 65) return 'Adulto/a (18 a 64 años)';
    return 'Adulto/a mayor (65 años o más)';
  }

  function normalizarZonas(zonas) {
    const z = zonas || {};
    return { fiebreAmarilla: !!z.fiebreAmarilla, fiebreHemorragica: !!z.fiebreHemorragica, riesgo: !!z.riesgo };
  }

  function normalizarEntrada(entrada, opciones) {
    const opts = opciones || {};
    const ctx = {
      nacimiento: null,
      fum: null,
      fechaRef: parseFecha(opts.fechaReferencia || new Date()),
      zonasRiesgo: normalizarZonas(opts.zonasRiesgo),
      dosisAplicadas: new Set(opts.dosisAplicadas || []),
      gestacionSemanas: opts.gestacionSemanas || null
    };
    if (entrada && typeof entrada === 'object' && !(entrada instanceof Date)) {
      if (entrada.nacimiento) ctx.nacimiento = parseFecha(entrada.nacimiento);
      if (entrada.fechaNacimiento) ctx.nacimiento = parseFecha(entrada.fechaNacimiento);
      if (entrada.fum) ctx.fum = parseFecha(entrada.fum);
      if (entrada.fechaUltimaMenstruacion) ctx.fum = parseFecha(entrada.fechaUltimaMenstruacion);
      if (entrada.embarazo) {
        if (entrada.embarazo.fum) ctx.fum = parseFecha(entrada.embarazo.fum);
        if (entrada.embarazo.semanas) ctx.gestacionSemanas = entrada.embarazo.semanas;
      }
      if (entrada.gestacionSemanas) ctx.gestacionSemanas = entrada.gestacionSemanas;
    } else if (entrada != null) {
      ctx.nacimiento = parseFecha(entrada);
    }
    if (ctx.gestacionSemanas && !ctx.fum) {
      ctx.fum = sumarDias(ctx.fechaRef, -ctx.gestacionSemanas * 7);
    }
    return ctx;
  }

  // ------------------------- Reglas por etapa de vida -------------------------
  const REGLAS_VIDA = [
    { vacuna: 'Hepatitis B', dosis: 'Dosis neonatal', valor: 12, unidad: 'horas', condicion: () => true, notas: 'Dentro de las primeras 12 horas de vida.' },
    { vacuna: 'BCG (Tuberculosis)', dosis: 'Única dosis', valor: 0, unidad: 'dias', condicion: () => true, notas: 'Antes de egresar de la maternidad.' },
    { vacuna: 'Neumococo conjugada', dosis: '1ra dosis', valor: 2, unidad: 'meses', condicion: () => true, notas: 'Esquema 2, 4 y 12 meses.' },
    { vacuna: 'IPV (Poliomielitis)', dosis: '1ra dosis', valor: 2, unidad: 'meses', condicion: () => true, notas: 'Esquema 2, 4 y 6 meses.' },
    { vacuna: 'Quíntuple (Pentavalente)', dosis: '1ra dosis', valor: 2, unidad: 'meses', condicion: () => true, notas: 'Esquema 2, 4 y 6 meses.' },
    { vacuna: 'Rotavirus', dosis: '1ra dosis', valor: 2, unidad: 'meses', condicion: () => true, notas: 'Ventana cerrada: 1ra dosis antes de las 14 semanas y 6 días.' },
    { vacuna: 'Meningococo ACYW', dosis: '1ra dosis', valor: 3, unidad: 'meses', condicion: () => true, notas: 'Esquema 3 y 5 meses.' },
    { vacuna: 'Neumococo conjugada', dosis: '2da dosis', valor: 4, unidad: 'meses', condicion: () => true, notas: '' },
    { vacuna: 'IPV (Poliomielitis)', dosis: '2da dosis', valor: 4, unidad: 'meses', condicion: () => true, notas: '' },
    { vacuna: 'Quíntuple (Pentavalente)', dosis: '2da dosis', valor: 4, unidad: 'meses', condicion: () => true, notas: '' },
    { vacuna: 'Rotavirus', dosis: '2da dosis', valor: 4, unidad: 'meses', condicion: () => true, notas: 'Última dosis antes de las 24 semanas.' },
    { vacuna: 'Meningococo ACYW', dosis: '2da dosis', valor: 5, unidad: 'meses', condicion: () => true, notas: '' },
    { vacuna: 'IPV (Poliomielitis)', dosis: '3ra dosis', valor: 6, unidad: 'meses', condicion: () => true, notas: '' },
    { vacuna: 'Quíntuple (Pentavalente)', dosis: '3ra dosis', valor: 6, unidad: 'meses', condicion: () => true, notas: '' },
    { vacuna: 'Antigripal', dosis: '1ra dosis (primovacunación)', valor: 6, unidad: 'meses', condicion: () => true, notas: 'Entre 6 y 24 meses: 2 dosis separadas ≥4 semanas.' },
    { vacuna: 'Antigripal', dosis: '2da dosis (primovacunación)', valor: 6, unidad: 'meses', condicion: () => true, notas: '4 semanas después de la 1ra dosis.', offsetDias: 28 },
    { vacuna: 'Neumococo conjugada', dosis: 'Refuerzo', valor: 12, unidad: 'meses', condicion: () => true, notas: '' },
    { vacuna: 'Hepatitis A', dosis: 'Única dosis', valor: 12, unidad: 'meses', condicion: () => true, notas: '' },
    { vacuna: 'Triple viral (SRP)', dosis: '1ra dosis', valor: 12, unidad: 'meses', condicion: () => true, notas: 'Primera dosis a los 12 meses.' },
    { vacuna: 'Meningococo ACYW', dosis: 'Refuerzo', valor: 15, unidad: 'meses', condicion: () => true, notas: '' },
    { vacuna: 'Varicela', dosis: '1ra dosis', valor: 15, unidad: 'meses', condicion: () => true, notas: '' },
    { vacuna: 'Triple viral (SRP)', dosis: '2da dosis', valor: 15, unidad: 'meses', condicion: (ctx, nac) => parseFecha(nac) >= new Date(2024, 6, 1), notas: 'Nacidos a partir del 01/07/2024: segunda dosis entre los 15 y 18 meses.' },
    { vacuna: 'Quíntuple (Pentavalente)', dosis: 'Refuerzo (15-18 meses)', valor: 15, unidad: 'meses', condicion: () => true, notas: '' },
    { vacuna: 'Fiebre amarilla', dosis: '1ra dosis', valor: 18, unidad: 'meses', condicion: (ctx) => ctx.zonasRiesgo.fiebreAmarilla, notas: 'Solo residentes en zonas de riesgo.' },
    { vacuna: 'IPV (Poliomielitis)', dosis: 'Refuerzo', valor: 5, unidad: 'anios', condicion: () => true, notas: 'Año en que cumple 5 años.' },
    { vacuna: 'Triple bacteriana celular (DTP)', dosis: '2do refuerzo', valor: 5, unidad: 'anios', condicion: () => true, notas: 'Año en que cumple 5 años.' },
    { vacuna: 'Varicela', dosis: '2da dosis', valor: 5, unidad: 'anios', condicion: (ctx, nac) => parseFecha(nac) >= new Date(2013, 9, 1), notas: 'Nacidos a partir del 01/10/2013.' },
    { vacuna: 'Triple viral (SRP)', dosis: '2da dosis', valor: 5, unidad: 'anios', condicion: (ctx, nac) => { const f = parseFecha(nac); return f >= new Date(2021, 0, 1) && f <= new Date(2024, 5, 30); }, notas: 'Cohortes nacidas 2021-2024 (hasta 30/06/2024).' },
    { vacuna: 'VPH (Virus del Papiloma Humano)', dosis: 'Única dosis', valor: 11, unidad: 'anios', condicion: () => true, notas: 'Desde 2024 esquema de dosis única.' },
    { vacuna: 'Meningococo ACYW', dosis: 'Única dosis', valor: 11, unidad: 'anios', condicion: () => true, notas: '' },
    { vacuna: 'Triple bacteriana acelular (dTpa)', dosis: 'Refuerzo', valor: 11, unidad: 'anios', condicion: () => true, notas: '' },
    { vacuna: 'Fiebre amarilla', dosis: 'Refuerzo', valor: 11, unidad: 'anios', condicion: (ctx) => ctx.zonasRiesgo.fiebreAmarilla, notas: 'Solo residentes en zonas de riesgo.' },
    { vacuna: 'Triple viral (SRP)', dosis: 'Iniciar/completar esquema (2 dosis)', valor: 11, unidad: 'anios', condicion: () => true, notas: 'Completar 2 dosis si no se recibieron.' },
    { vacuna: 'Hepatitis B', dosis: 'Iniciar/completar esquema (3 dosis)', valor: 11, unidad: 'anios', condicion: () => true, notas: 'Completar esquema de 3 dosis si está incompleto.' },
    { vacuna: 'Fiebre hemorrágica argentina', dosis: 'Única dosis', valor: 15, unidad: 'anios', condicion: (ctx) => ctx.zonasRiesgo.fiebreHemorragica, notas: 'A partir de los 15 años, residentes en zonas de riesgo.' },
  ];

  function fechaPorRegla(nacimiento, regla) {
    const n = parseFecha(nacimiento);
    if (regla.unidad === 'horas') return sumarHoras(n, regla.valor);
    if (regla.unidad === 'dias') return sumarDias(n, regla.valor);
    if (regla.unidad === 'meses') {
      let f = sumarMeses(n, regla.valor);
      if (regla.offsetDias) f = sumarDias(f, regla.offsetDias);
      return f;
    }
    if (regla.unidad === 'anios') return sumarMeses(n, regla.valor * 12);
    throw new Error('Unidad desconocida: ' + regla.unidad);
  }

  function Vacunacion(entrada, opciones) {
    const ctx = normalizarEntrada(entrada, opciones);
    const vacunas = [];
    if (ctx.fum) {
      const fum = ctx.fum;
      const fpp = sumarDias(fum, 280);
      vacunas.push({ vacuna: 'Antigripal', dosis: '1 dosis', fecha: sumarDias(fum, 30), notas: 'En cualquier trimestre de la gestación (o hasta 10 días postparto).', fechaProbableParto: formatoISO(fpp) });
      vacunas.push({ vacuna: 'Triple bacteriana acelular (dTpa)', dosis: '1 dosis', fecha: sumarDias(fum, 20 * 7), notas: 'A partir de la semana 20 de gestación.', fechaProbableParto: formatoISO(fpp) });
      const ini = sumarDias(fum, 32 * 7);
      const fin = sumarDias(fum, Math.round(36.6 * 7));
      vacunas.push({ vacuna: 'Virus sincicial respiratorio (VSR)', dosis: '1 dosis', fecha: ini, fechaFin: fin, notas: 'Entre las semanas 32 y 36.6 de gestación.', fechaProbableParto: formatoISO(fpp) });
    } else if (ctx.nacimiento) {
      const nac = ctx.nacimiento;
      for (const regla of REGLAS_VIDA) {
        if (typeof regla.condicion === 'function' && !regla.condicion(ctx, nac)) continue;
        const clave = `${regla.vacuna}|${regla.dosis}|${regla.valor}${regla.unidad}`;
        if (ctx.dosisAplicadas.has(clave)) continue;
        vacunas.push({ vacuna: regla.vacuna, dosis: regla.dosis, fecha: fechaPorRegla(nac, regla), notas: regla.notas || '' });
      }
      for (let anio = 15; anio <= 75; anio += 10) {
        vacunas.push({ vacuna: 'Doble bacteriana (dT)', dosis: `Refuerzo a los ${anio} años`, fecha: sumarMeses(nac, anio * 12), notas: 'Refuerzo cada 10 años (15 a 64 años).' });
      }
      for (let anio = 65; anio <= 80; anio += 1) {
        vacunas.push({ vacuna: 'Antigripal', dosis: `Dosis anual (${anio} años)`, fecha: sumarMeses(nac, anio * 12), notas: 'Anual a partir de los 65 años.' });
      }
      vacunas.push({ vacuna: 'Neumococo conjugada', dosis: 'Dosis única (65 años)', fecha: sumarMeses(nac, 65 * 12), notas: 'VCN20 dosis única a partir de los 65 años (con dosis previas, verificar esquema).' });
    } else {
      throw new Error('Vacunacion: debe indicar fecha de nacimiento o datos de embarazo (FUM).');
    }

    vacunas.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    for (const v of vacunas) {
      v.fechaISO = formatoISO(v.fecha);
      v.fechaFinISO = v.fechaFin ? formatoISO(v.fechaFin) : null;
      v.diasDesdeNacimiento = ctx.nacimiento ? diasEntre(ctx.nacimiento, v.fecha) : null;
      v.diasDesdeReferencia = diasEntre(ctx.fechaRef, v.fecha);
      v.estado = v.fecha.getTime() < ctx.fechaRef.getTime() ? 'Vencida' : (v.fecha.getTime() === ctx.fechaRef.getTime() ? 'Hoy' : 'Pendiente');
    }
    const etapa = ctx.fum ? 'Embarazo' : etapaDeVida(ctx.nacimiento, ctx.fechaRef);
    return {
      etapa,
      fechaReferencia: formatoISO(ctx.fechaRef),
      nacimiento: ctx.nacimiento ? formatoISO(ctx.nacimiento) : null,
      fum: ctx.fum ? formatoISO(ctx.fum) : null,
      fechaProbableParto: ctx.fum ? formatoISO(sumarDias(ctx.fum, 280)) : null,
      zonasRiesgo: ctx.zonasRiesgo,
      vacunas,
      resumen: {
        total: vacunas.length,
        pendientes: vacunas.filter(v => v.fecha.getTime() >= ctx.fechaRef.getTime()).length,
        vencidas: vacunas.filter(v => v.fecha.getTime() < ctx.fechaRef.getTime()).length
      }
    };
  }

  // ------------------------- Renderizado -------------------------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function renderResultado(r) {
    const rows = r.vacunas.map(v => `
      <tr>
        <td>${esc(formatoFecha(v.fecha))}${v.fechaFin ? ' a ' + esc(formatoFecha(v.fechaFin)) : ''}</td>
        <td>${esc(v.vacuna)}</td>
        <td>${esc(v.dosis)}</td>
        <td>${esc(v.estado)}</td>
        <td>${v.diasDesdeReferencia >= 0 ? '+' : ''}${v.diasDesdeReferencia} d</td>
      </tr>`).join('');
    return `
      <div class="tw-metrics" style="margin:12px 0">
        <div class="tw-metric"><b>${r.resumen.total}</b><span>vacunas en el esquema</span></div>
        <div class="tw-metric"><b>${r.resumen.pendientes}</b><span>pendientes</span></div>
        <div class="tw-metric"><b>${r.resumen.vencidas}</b><span>vencidas</span></div>
      </div>
      <div class="tw-verdict ok">
        <b>Etapa: ${esc(r.etapa)}</b>
        ${r.fechaProbableParto ? `<p>Fecha probable de parto: ${esc(formatoFecha(r.fechaProbableParto))}</p>` : ''}
        ${r.nacimiento ? `<p>Fecha de nacimiento: ${esc(formatoFecha(r.nacimiento))}</p>` : ''}
        <p>Las fechas son orientativas según el Calendario Nacional de Vacunación de Argentina. Consultar siempre con un vacunatorio o profesional de salud.</p>
      </div>
      <div class="tw-table-wrap" style="margin-top:12px;max-height:420px;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#0b2437;color:#fff">
            <th style="padding:8px;text-align:left">Fecha</th>
            <th style="padding:8px;text-align:left">Vacuna</th>
            <th style="padding:8px;text-align:left">Dosis</th>
            <th style="padding:8px;text-align:left">Estado</th>
            <th style="padding:8px;text-align:left">Días</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function formHTML(prefijo) {
    const p = prefijo;
    return `
      <p class="tw-desc">Calculá las fechas y los días para aplicar las vacunas según el Calendario Nacional de Vacunación de Argentina (por etapas de la vida).</p>
      <div class="tw-form">
        <label>Modo de cálculo
          <select id="${p}Modo">
            <option value="nac">Por fecha de nacimiento</option>
            <option value="emb">Embarazo (fecha de última menstruación)</option>
          </select>
        </label>
        <label id="${p}LblFecha">Fecha de nacimiento
          <input type="date" id="${p}Fecha" />
        </label>
        <label>Zonas de riesgo
          <select id="${p}FiebreAmarilla"><option value="0">Fiebre amarilla: no aplica</option><option value="1">Fiebre amarilla: sí (zona de riesgo)</option></select>
        </label>
        <label>
          <select id="${p}FiebreHem"><option value="0">Fiebre hemorrágica argentina: no aplica</option><option value="1">Fiebre hemorrágica argentina: sí (zona de riesgo)</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="${p}Ir">Calcular vacunas</button>
      <div id="${p}Salida" class="tw-out"></div>`;
  }

  function wire(root, prefijo) {
    const p = prefijo;
    const modo = root.querySelector(`#${p}Modo`);
    const lbl = root.querySelector(`#${p}LblFecha`);
    const fecha = root.querySelector(`#${p}Fecha`);
    modo.addEventListener('change', () => {
      lbl.firstChild.textContent = modo.value === 'emb' ? 'Fecha de última menstruación (FUM)' : 'Fecha de nacimiento';
    });
    root.querySelector(`#${p}Ir`).addEventListener('click', () => {
      try {
        const f = fecha.value;
        if (!f) { root.querySelector(`#${p}Salida`).innerHTML = '<p style="color:#b91c1c">Ingresá una fecha.</p>'; return; }
        const zonas = {
          fiebreAmarilla: root.querySelector(`#${p}FiebreAmarilla`).value === '1',
          fiebreHemorragica: root.querySelector(`#${p}FiebreHem`).value === '1'
        };
        const entrada = modo.value === 'emb' ? { fum: f } : f;
        const r = Vacunacion(entrada, { zonasRiesgo: zonas });
        root.querySelector(`#${p}Salida`).innerHTML = renderResultado(r);
      } catch (e) {
        root.querySelector(`#${p}Salida`).innerHTML = `<p style="color:#b91c1c">Error: ${esc(e.message)}</p>`;
      }
    });
  }

  // ------------------------- Registro como herramienta modal -------------------------
  const T = window.MF_TOOLS;
  if (T) {
    T.vacunacion = {
      titulo: 'Calendario de vacunación (Salud)',
      html: () => formHTML('v'),
      init: (root) => wire(root, 'v')
    };
  }

  // ------------------------- Montaje en página dedicada -------------------------
  function montarPagina() {
    const app = document.getElementById('saludApp');
    if (!app) return;
    app.innerHTML = formHTML('s');
    wire(app, 's');
  }

  // Exponer API
  window.mfSalud = { Vacunacion, parseFecha, formatoISO, sumarDias, sumarMeses, diasEntre, etapaDeVida };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montarPagina);
  } else {
    montarPagina();
  }
})();
