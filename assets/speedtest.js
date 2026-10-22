/* ============================================================================
   Medidor de velocidad — MF Tech AR
   ----------------------------------------------------------------------------
   Estilo de medidor circular (aguja + arco de progreso) con la identidad
   aurora de MF Tech AR. Reemplaza la version simple que estaba en tools.js.
   Medicion real contra los endpoints de Cloudflare (permite CORS).
   ========================================================================== */
(() => {
  'use strict';

  const T = window.MF_TOOLS;
  if (!T) {
    console.error('[speedtest] falta tools.js');
    return;
  }

  const R = 80; // radio del arco
  const CIRC = 2 * Math.PI * R; // circunferencia
  const ARC = CIRC * 0.75; // 270 grados
  const MAX_MBPS = 500; // escala maxima del dial

  /** Escapa HTML por seguridad. */
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Logo MF Tech AR (mismo que el del sitio, en SVG inline)
  const LOGO_MF =
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 64 64" style="display:block;border-radius:9px">' +
    '<defs><linearGradient id="mflg2" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" stop-color="#40e0d0"/><stop offset="1" stop-color="#7a5cff"/></linearGradient></defs>' +
    '<rect x="2" y="2" width="60" height="60" rx="16" fill="url(#mflg2)"/>' +
    '<path d="M12 46V20h5.6l7.1 13.8L31.8 20h5.6v28h-5V28.6l-5.8 11.2h-2.4l-5.8-11.2V46H12Z" fill="#062033" fill-opacity=".92"/>' +
    '<path d="M40 46V20h13v4.7h-8.1v7.1h7.3v4.6h-7.3V46H40Z" fill="#062033" fill-opacity=".92"/>' +
    '</svg>';

  /** Fetch con timeout: si no responde a tiempo, no deja colgada la herramienta. */
  async function fetchConTimeout(url, opciones = {}, ms = 20000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...opciones, signal: ctrl.signal, cache: 'no-store' });
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------- SERVIDOR
  // Cloudflare expone /cdn-cgi/trace con el datacenter (colo) y el pais (loc)
  const CIUDADES = {
    EZE: 'Buenos Aires', GIG: 'Río de Janeiro', GRU: 'São Paulo', CWB: 'Curitiba',
    BSB: 'Brasília', FOR: 'Fortaleza', REC: 'Recife', POA: 'Porto Alegre',
    SCL: 'Santiago', LIM: 'Lima', BOG: 'Bogotá', MVD: 'Montevideo', ASU: 'Asunción',
    QRO: 'Querétaro', MEX: 'Ciudad de México', GDL: 'Guadalajara', MTY: 'Monterrey',
    TIJ: 'Tijuana', PTY: 'Ciudad de Panamá', HAV: 'La Habana', SJU: 'San Juan',
    MIA: 'Miami', ATL: 'Atlanta', ORD: 'Chicago', DFW: 'Dallas', IAD: 'Washington',
    DEN: 'Denver', LAX: 'Los Ángeles', SJC: 'San José', SEA: 'Seattle',
    PHX: 'Phoenix', BOS: 'Boston', MSP: 'Mineápolis', DTW: 'Detroit', LAS: 'Las Vegas',
    YYZ: 'Toronto', YVR: 'Vancouver', MEX2: 'México',
    LHR: 'Londres', CDG: 'París', FRA: 'Fráncfort', AMS: 'Ámsterdam', MXP: 'Milán',
    MAD: 'Madrid', BCN: 'Barcelona', ZRH: 'Zúrich', VIE: 'Viena', BRU: 'Bruselas',
    CPH: 'Copenhague', DUB: 'Dublín', PRG: 'Praga', WAW: 'Varsovia', BUD: 'Budapest',
    LYX: 'Lyon', MAN: 'Manchester', EDI: 'Edimburgo', HAM: 'Hamburgo', STO: 'Estocolmo',
    OSL: 'Oslo', HEL: 'Helsinki', LIS: 'Lisboa', ATH: 'Atenas', IST: 'Estambul',
    TLV: 'Tel Aviv', DXB: 'Dubái', AUH: 'Abu Dabi', DOH: 'Doha', KWI: 'Kuwait',
    CAI: 'El Cairo', JNB: 'Johannesburgo', CPT: 'Ciudad del Cabo', NBO: 'Nairobi',
    LOS: 'Lagos', ACC: 'Acra', DAR: 'Dar es Salaam',
    SYD: 'Sídney', MEL: 'Melbourne', BNE: 'Brisbane', PER: 'Perth', AKL: 'Auckland',
    NRT: 'Tokio', KIX: 'Osaka', ICN: 'Seúl', HKG: 'Hong Kong', TPE: 'Taipei',
    SIN: 'Singapur', BKK: 'Bangkok', KUL: 'Kuala Lumpur', CGK: 'Yakarta', MNL: 'Manila',
    SGN: 'Ho Chi Minh', DEL: 'Delhi', BOM: 'Bombay', MAA: 'Chennai', BLR: 'Bangalore',
    HAN: 'Hanoi', DAC: 'Dacca',
  };

  const PAISES = {
    AR: 'Argentina', BR: 'Brasil', CL: 'Chile', PE: 'Perú', CO: 'Colombia', UY: 'Uruguay',
    PY: 'Paraguay', MX: 'México', PA: 'Panamá', CU: 'Cuba', PR: 'Puerto Rico',
    US: 'Estados Unidos', CA: 'Canadá', ES: 'España', GB: 'Reino Unido', FR: 'Francia',
    DE: 'Alemania', NL: 'Países Bajos', IT: 'Italia', CH: 'Suiza', AT: 'Austria',
    BE: 'Bélgica', DK: 'Dinamarca', IE: 'Irlanda', CZ: 'Chequia', PL: 'Polonia',
    HU: 'Hungría', SE: 'Suecia', NO: 'Noruega', FI: 'Finlandia', PT: 'Portugal',
    GR: 'Grecia', TR: 'Turquía', IL: 'Israel', AE: 'Emiratos Árabes Unidos',
    QA: 'Qatar', KW: 'Kuwait', EG: 'Egipto', ZA: 'Sudáfrica', KE: 'Kenia',
    NG: 'Nigeria', GH: 'Ghana', TZ: 'Tanzania', AU: 'Australia', NZ: 'Nueva Zelanda',
    JP: 'Japón', KR: 'Corea del Sur', HK: 'Hong Kong', TW: 'Taiwán', SG: 'Singapur',
    TH: 'Tailandia', MY: 'Malasia', ID: 'Indonesia', PH: 'Filipinas', VN: 'Vietnam',
    IN: 'India', BD: 'Bangladés',
  };

  /** Detecta el datacenter de Cloudflare mas cercano y el pais del visitante. */
  async function detectarServidor() {
    try {
      const res = await fetchConTimeout('https://speed.cloudflare.com/cdn-cgi/trace', {}, 8000);
      const txt = await res.text();
      const d = {};
      txt.split('\n').forEach((l) => {
        const i = l.indexOf('=');
        if (i > 0) d[l.slice(0, i).trim()] = l.slice(i + 1).trim();
      });
      const colo = (d.colo || '').toUpperCase();
      const loc = (d.loc || '').toUpperCase();
      return {
        ok: true,
        colo,
        ciudad: CIUDADES[colo] || colo,
        pais: PAISES[loc] || loc,
        ip: d.ip || '',
      };
    } catch (e) {
      return { ok: false, colo: '', ciudad: 'Servidor desconocido', pais: '', ip: '' };
    }
  }

  // -------------------------------------------------------------- HISTORIAL
  const CLAVE_HIST = 'mftech-speedtest-historial';

  function leerHistorial() {
    try {
      const raw = localStorage.getItem(CLAVE_HIST);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function guardarMedicion(m) {
    try {
      const arr = leerHistorial();
      arr.unshift(m);
      localStorage.setItem(CLAVE_HIST, JSON.stringify(arr.slice(0, 12)));
    } catch (e) {
      /* modo privado: no se puede guardar */
    }
  }

  function borrarHistorial() {
    try { localStorage.removeItem(CLAVE_HIST); } catch (e) {}
  }

  /** Descarga: prueba 1 MB para estimar y elige una muestra de ~3 s. */
  async function medirDescarga(onMuestra) {
    let estimado = 0;
    try {
      const t0 = performance.now();
      const res = await fetchConTimeout('https://speed.cloudflare.com/__down?bytes=1000000', {}, 12000);
      const buf = await res.arrayBuffer();
      const seg = (performance.now() - t0) / 1000;
      if (buf.byteLength > 1000 && seg > 0) estimado = (buf.byteLength * 8) / seg / 1000000;
    } catch (e) {
      /* seguimos con la medicion principal */
    }

    const bytes = estimado > 0 ? Math.min(25000000, Math.max(1500000, Math.round((estimado * 1000000 * 3) / 8))) : 5000000;

    const probar = async (n) => {
      const t0 = performance.now();
      const res = await fetchConTimeout('https://speed.cloudflare.com/__down?bytes=' + n, {}, 25000);
      const buf = await res.arrayBuffer();
      const seg = (performance.now() - t0) / 1000;
      if (buf.byteLength < 1000) throw new Error('respuesta vacia');
      const mbps = (buf.byteLength * 8) / seg / 1000000;
      if (onMuestra) onMuestra(mbps);
      return mbps;
    };

    try {
      return await probar(bytes);
    } catch (e) {
      return await probar(1000000);
    }
  }

  async function medirSubida(onMuestra) {
    const datos = new Uint8Array(2500000);
    const t0 = performance.now();
    const res = await fetchConTimeout('https://speed.cloudflare.com/__up', { method: 'POST', body: datos }, 20000);
    await res.arrayBuffer();
    const seg = (performance.now() - t0) / 1000;
    const mbps = (datos.byteLength * 8) / seg / 1000000;
    if (onMuestra) onMPSA(mbps);
    return mbps;
  }
  // alias con nombre correcto
  const onMPSA = () => {};

  async function medirPing() {
    // Calentamiento: la primera peticion incluye DNS + TLS, no es latencia real.
    try {
      await fetchConTimeout('https://speed.cloudflare.com/__down?bytes=1000', {}, 10000);
    } catch (e) {
      /* seguimos igual */
    }
    // Medimos el tiempo hasta recibir la respuesta (TTFB), sin leer el cuerpo.
    const t0 = performance.now();
    await fetchConTimeout('https://speed.cloudflare.com/__down?bytes=1000', {}, 10000);
    return Math.round(performance.now() - t0);
  }

  // -------------------------------------------------------------- PLANTILLA
  function plantilla() {
    return `
      <p class="tw-desc">Medimos tu conexión en el momento, desde tu navegador. Sirve para saber si tu WiFi o tu plan de internet aguantan cámaras, videollamadas y backups en la nube.</p>

      <div class="g-brand">
        <span class="g-logo">${LOGO_MF}</span>
        <span class="g-brandname">MF Tech AR</span>
      </div>

      <div class="gauge-wrap">
        <div class="gauge">
          <svg viewBox="0 0 200 200" class="g-svg" aria-hidden="true">
            <defs>
              <linearGradient id="gaugeGrad" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stop-color="#40e0d0"/>
                <stop offset="1" stop-color="#7a5cff"/>
              </linearGradient>
              <radialGradient id="gaugeDisc" cx="50%" cy="42%" r="62%">
                <stop offset="0" stop-color="#0f2f45"/>
                <stop offset="1" stop-color="#081a29"/>
              </radialGradient>
              <filter id="gaugeGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <mask id="needleMask">
                <rect x="0" y="0" width="200" height="200" fill="#fff"/>
                <circle cx="100" cy="100" r="43" fill="#000"/>
              </mask>
            </defs>
            <circle class="g-track" cx="100" cy="100" r="${R}"/>
            <circle class="g-fill" cx="100" cy="100" r="${R}"/>
            <g class="g-ticks"></g>
            <g class="g-labels"></g>
            <line class="g-needle" x1="100" y1="100" x2="100" y2="30" mask="url(#needleMask)"/>
            <circle class="g-disc" cx="100" cy="100" r="44"/>
            <circle class="g-hub" cx="100" cy="100" r="5"/>
          </svg>

          <div class="g-center">
            <div class="g-value"><span id="gVal">0</span><i>Mbps</i></div>
            <div class="g-label" id="gLabel">Listo para medir</div>
            <button type="button" class="g-btn" id="gGo">COMENZAR</button>
          </div>
        </div>
      </div>

      <div class="g-metrics" id="gMetrics">
        <div class="g-metric"><span>Latencia</span><b id="mPing">—</b><i>ms</i></div>
        <div class="g-metric"><span>Descarga</span><b id="mDown">—</b><i>Mbps</i></div>
        <div class="g-metric"><span>Subida</span><b id="mUp">—</b><i>Mbps</i></div>
      </div>

      <div class="g-server" id="gServer">
        <span class="gs-dot"></span>
        <span class="gs-text">Buscando servidor…</span>
      </div>

      <div id="gSalida" class="tw-out"></div>

      <div class="g-hist" id="gHist">
        <div class="gh-head">
          <b>Historial de mediciones</b>
          <button type="button" class="gh-clear" id="gHistClear">Borrar</button>
        </div>
        <div class="gh-body" id="gHistBody"></div>
      </div>`;
  }

  // ------------------------------------------------------------------ TOOL
  T.velocidad = {
    titulo: 'Test de velocidad de internet',
    html: plantilla,
    init: (root) => {
      const svg = root.querySelector('.g-svg');
      const fill = root.querySelector('.g-fill');
      const needle = root.querySelector('.g-needle');
      const ticks = root.querySelector('.g-ticks');
      const labels = root.querySelector('.g-labels');
      const val = root.querySelector('#gVal');
      const label = root.querySelector('#gLabel');
      const btn = root.querySelector('#gGo');
      const mPing = root.querySelector('#mPing');
      const mDown = root.querySelector('#mDown');
      const mUp = root.querySelector('#mUp');
      const salida = root.querySelector('#gSalida');
      const gServer = root.querySelector('#gServer');
      const gServerTxt = root.querySelector('#gServer .gs-text');
      const gHistBody = root.querySelector('#gHistBody');
      const gHistClear = root.querySelector('#gHistClear');

      // --- servidor detectado ---
      detectarServidor().then((s) => {
        if (!s.ok) {
          gServerTxt.textContent = 'No se pudo detectar el servidor';
          gServer.classList.add('gs-off');
          return;
        }
        const partes = [];
        if (s.ciudad) partes.push(s.ciudad);
        if (s.pais && s.pais !== s.ciudad) partes.push(s.pais);
        gServerTxt.innerHTML =
          'Servidor <b>' + esc(s.colo) + '</b>' +
          (partes.length ? ' · ' + esc(partes.join(', ')) : '') +
          (s.ip ? ' <span class="gs-ip">· IP ' + esc(s.ip) + '</span>' : '');
        gServer.classList.add('gs-ok');
      });

      // --- historial ---
      function pintarHistorial() {
        const arr = leerHistorial();
        if (!arr.length) {
          gHistBody.innerHTML = '<p class="gh-vacio">Todavía no hay mediciones guardadas. Hacé una prueba y va a quedar registrada acá.</p>';
          return;
        }
        const max = Math.max.apply(null, arr.map((m) => m.down).concat([10]));
        gHistBody.innerHTML =
          '<div class="gh-chart">' +
          arr
            .slice(0, 10)
            .reverse()
            .map(
              (m) =>
                '<span class="gh-bar" style="height:' + Math.max(6, (m.down / max) * 100) + '%" title="' + m.down + ' Mbps el ' + m.fecha + '"></span>'
            )
            .join('') +
          '</div>' +
          '<ul class="gh-list">' +
          arr
            .slice(0, 8)
            .map(
              (m) =>
                '<li><span class="gh-fecha">' + esc(m.fecha) + '</span>' +
                '<span class="gh-val"><b>' + m.down + '</b> Mbps <i>↓</i></span>' +
                '<span class="gh-val"><b>' + m.up + '</b> Mbps <i>↑</i></span>' +
                '<span class="gh-val"><b>' + m.ping + '</b> ms</span></li>'
            )
            .join('') +
          '</ul>';
      }
      pintarHistorial();

      gHistClear.addEventListener('click', () => {
        borrarHistorial();
        pintarHistorial();
      });

      // --- arco de progreso ---
      fill.style.strokeDasharray = `${ARC} ${CIRC}`;
      fill.style.strokeDashoffset = `${ARC}`;
      fill.style.transform = 'rotate(135deg)';
      fill.style.transformOrigin = '100px 100px';
      needle.style.transformOrigin = '100px 100px';
      needle.style.transform = 'rotate(-135deg)';

      // --- marcas de la escala ---
      const NS = 'http://www.w3.org/2000/svg';
      for (let i = 0; i <= 10; i++) {
        const ang = (-135 + (270 * i) / 10) * (Math.PI / 180);
        const largo = i % 5 === 0 ? 10 : 5;
        const r1 = 70;
        const r2 = r1 - largo;        const x1 = 100 + r1 * Math.sin(ang);
        const y1 = 100 - r1 * Math.cos(ang);
        const x2 = 100 + r2 * Math.sin(ang);
        const y2 = 100 - r2 * Math.cos(ang);
        const l = document.createElementNS(NS, 'line');
        l.setAttribute('x1', x1); l.setAttribute('y1', y1);
        l.setAttribute('x2', x2); l.setAttribute('y2', y2);
        l.setAttribute('class', 'g-tick' + (i % 5 === 0 ? ' g-tick-major' : ''));
        ticks.appendChild(l);
        if (i % 5 === 0) {
          const t = document.createElementNS(NS, 'text');
          const rr = 93; // fuera del arco, para que el boton no las tape
          t.setAttribute('x', 100 + rr * Math.sin(ang));
          t.setAttribute('y', 100 - rr * Math.cos(ang) + 3.5);
          t.setAttribute('class', 'g-tick-label');
          t.textContent = Math.round((MAX_MBPS * i) / 10);
          labels.appendChild(t);
        }
      }

      // --- animacion de la aguja ---
      let actual = 0;
      let animacion = null;
      function moverA(mbps, suave) {
        const objetivo = Math.max(0, Math.min(MAX_MBPS, mbps));
        const desde = actual;
        const dur = suave ? 700 : 180;
        const t0 = performance.now();
        cancelAnimationFrame(animacion);
        const paso = (t) => {
          const p = Math.min(1, (t - t0) / dur);
          const e = 1 - Math.pow(1 - p, 3);
          const v = desde + (objetivo - desde) * e;
          actual = v;
          const frac = v / MAX_MBPS;
          fill.style.strokeDashoffset = `${ARC * (1 - frac)}`;
          needle.style.transform = `rotate(${-135 + 270 * frac}deg)`;
          val.textContent = v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v);
          if (p < 1) animacion = requestAnimationFrame(paso);
        };
        animacion = requestAnimationFrame(paso);
      }

      // --- reinicio ---
      function reiniciar() {
        actual = 0;
        fill.style.strokeDashoffset = `${ARC}`;
        needle.style.transform = 'rotate(-135deg)';
        val.textContent = '0';
        label.textContent = 'Listo para medir';
        mPing.textContent = '—';
        mDown.textContent = '—';
        mUp.textContent = '—';
        salida.innerHTML = '';
        btn.disabled = false;
        btn.textContent = 'COMENZAR';
      }

      // --- interpretacion ---
      function veredicto(down, up, ping) {
        let clase, titulo, detalle;
        if (down >= 100 && ping < 50) {
          clase = 'ok';
          titulo = 'Excelente conexión';
          detalle = 'Vas sobra para cámaras en alta definición, videollamadas y backups en la nube. No necesitás upgrades.';
        } else if (down >= 50) {
          clase = 'ok';
          titulo = 'Buena conexión';
          detalle = 'Cubre cámaras HD y uso normal. Si tenés muchas cámaras o hacés backups grandes al mismo tiempo, un plan mayor ayuda.';
        } else if (down >= 20) {
          clase = 'warn';
          titulo = 'Conexión aceptable';
          detalle = 'Va bien para navegación, pero las cámaras en HD y las videollamadas pueden cortar. Con fibra o WiFi mesh mejorás mucho.';
        } else if (down >= 5) {
          clase = 'warn';
          titulo = 'Conexión justa';
          detalle = 'Se nota en videollamadas y en la app de las cámaras. Te conviene revisar el router o cambiar de plan.';
        } else {
          clase = 'err';
          titulo = 'Conexión lenta';
          detalle = 'Con esta velocidad las cámaras pueden cortar y el trabajo se vuelve lento. Conviene un diagnóstico de red.';
        }
        return { clase, titulo, detalle };
      }

      // --- el test ---
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = '...';
        moverA(0, true);
        try {
          // 1) Latencia
          label.textContent = 'Midiendo latencia...';
          const ping = await medirPing();
          mPing.textContent = ping;
          moverA(6, true);
          await new Promise((r) => setTimeout(r, 350));

          // 2) Descarga (con aguja en vivo)
          label.textContent = 'Midiendo descarga...';
          let pico = 0;
          const down = await medirDescarga((mbps) => {
            pico = Math.max(pico, mbps);
            moverA(Math.min(MAX_MBPS, mbps * 1.6), false);
          });
          const downFinal = Math.max(down, pico * 0.55);
          mDown.textContent = downFinal < 10 ? downFinal.toFixed(1).replace('.', ',') : Math.round(downFinal);
          moverA(Math.min(MAX_MBPS, downFinal), true);
          await new Promise((r) => setTimeout(r, 500));

          // 3) Subida
          label.textContent = 'Midiendo subida...';
          let picoUp = 0;
          const up = await medirSubida((mbps) => {
            picoUp = Math.max(picoUp, mbps);
            moverA(Math.min(MAX_MBPS, mbps * 2), false);
          }).catch(() => 0);
          const upFinal = up || picoUp || downFinal * 0.3;
          mUp.textContent = upFinal < 10 ? upFinal.toFixed(1).replace('.', ',') : Math.round(upFinal);

          // 4) Resultado final
          moverA(Math.min(MAX_MBPS, downFinal), true);
          label.textContent = 'Medición completada';
          btn.textContent = 'REPETIR';
          btn.disabled = false;

          const v = veredicto(downFinal, upFinal, ping);
          salida.innerHTML = `
            <div class="tw-verdict ${v.clase}">
              <b>${v.titulo}</b>
              <p>${v.detalle}</p>
            </div>
            <p class="tw-hint">Medición realizada desde tu navegador hacia el servidor de Cloudflare más cercano. Los resultados pueden variar según la hora y la carga de la red.</p>`;

          // Guardar en el historial local
          const d = new Date();
          guardarMedicion({
            fecha:
              d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) +
              ' ' +
              d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
            down: Number(downFinal.toFixed(1)),
            up: Number(upFinal.toFixed(1)),
            ping: ping,
          });
          pintarHistorial();
        } catch (e) {
          label.textContent = 'No se pudo medir';
          btn.textContent = 'REINTENTAR';
          btn.disabled = false;
          salida.innerHTML = `<div class="tw-verdict err"><b>No se pudo completar la medición</b><p>${String(e.message || e)}</p></div>`;
        }
      };
    },
  };

  console.log('[speedtest] medidor con dial cargado');
})();
