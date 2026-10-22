/* ============================================================================
   Herramientas gratuitas — MF Tech AR
   ----------------------------------------------------------------------------
   1. Test de velocidad de internet   (mide download / upload / ping reales)
   2. Calculadora de cámaras          (cuántas cámaras necesita tu local)
   3. Diagnóstico de seguridad        (10 preguntas → puntaje + qué arreglar)
   4. Calculadora de backup           (cuánta capacidad necesita tu negocio)
   5. Generador de contraseñas        (contraseña fuerte y aleatoria)
   6. Calculadora de ahorro           (cuánto te cuesta tiempo's tiempo caído)
   Todo 100% local: no se envía ningún dato a ningún servidor.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- MODAL
  const modal = $('toolModal');
  const modalBody = $('toolModalBody');
  const modalTitle = $('toolModalTitle');
  let lastFocus = null;

  function abrir(id) {
    const def = TOOLS[id];
    if (!def || !modal) return;
    lastFocus = document.activeElement;
    modalTitle.textContent = def.titulo;
    modalBody.innerHTML = def.html();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    if (def.init) def.init(modalBody);
    const foco = modalBody.querySelector('input, select, button');
    if (foco) foco.focus();
  }

  function cerrar() {
    if (!modal) return;
    modal.hidden = true;
    modalBody.innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-cerrar]')) cerrar();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.hidden) cerrar();
    });
  }

  // Botones que abren herramientas
  document.querySelectorAll('[data-tool]').forEach((b) => {
    b.addEventListener('click', () => abrir(b.dataset.tool));
  });

  // ================================================================ HERRAMIENTAS
  const TOOLS = {};

  // ---------------------------------------------------- 1. Test de velocidad
  // Definido en assets/speedtest.js (dial circular con aguja, marca MF Tech AR).

  // ---------------------------------------------------- 2. Calculadora de cámaras
  TOOLS.camaras = {
    titulo: '¿Cuántas cámaras necesito?',
    html: () => `
      <p class="tw-desc">Contános cómo es tu local y te decimos cuántas cámaras conviene instalar y a qué altura van.</p>
      <div class="tw-form">
        <label>Tipo de lugar
          <select id="cTipo">
            <option value="local">Local / comercio Chico (hasta 40 m²)</option>
            <option value="mediano">Local mediano (40 a 120 m²)</option>
            <option value="grande">Local grande o depósito (más de 120 m²)</option>
            <option value="casa">Casa o departamento</option>
            <option value="oficina">Oficina</option>
          </select>
        </label>
        <label>¿Necesitás reconocimiento de personas o vehículos (IA)?
          <select id="cIA"><option value="1">Sí, con inteligencia artificial</option><option value="0">No, alcanza con grabar</option></select>
        </label>
        <label>¿Cuántos ingresos tiene el lugar?
          <select id="cAccesos">
            <option value="1">1 acceso</option>
            <option value="2">2 accesos</option>
            <option value="3">3 o más accesos</option>
          </select>
        </label>
        <label>¿Guardás cosas de valor en el local?
          <select id="cValor"><option value="1">Sí, mercadería o equipos</option><option value="0">No, es un local de servicios</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="cIr">Calcular</button>
      <div id="cSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#cIr').addEventListener('click', () => {
        const tipo = root.querySelector('#cTipo').value;
        const ia = root.querySelector('#cIA').value === '1';
        const acc = Number(root.querySelector('#cAccesos').value);
        const valor = root.querySelector('#cValor').value === '1';

        let base = { local: 2, mediano: 4, grande: 7, casa: 3, oficina: 4 }[tipo] || 3;
        if (acc === 2) base += 1;
        if (acc === 3) base += 2;
        if (valor) base += 1;
        const total = Math.min(base, 16);

        const altura = total <= 4 ? '2,40 a 2,60 m (a la altura de la vista)' : '2,60 a 3 m (cubriendo más superficie por cámara)';
        const resolucion = ia
          ? 'Cámaras con IA: detectan personas, vehículos y eventos, y avisan al celular.'
          : 'Cámaras Full HD con visión nocturna: grabar y revisar cuando quieras.';

        root.querySelector('#cSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${total}</b><span>cámaras recomendadas</span></div>
            <div class="tw-metric"><b>${altura.split(' ')[0]}</b><span>altura de montaje</span></div>
          </div>
          <div class="tw-verdict ok">
            <b>${resolucion}</b>
            <p>Montá las cámaras en los ángulos de paso, con buena luz de fondo y sin reflejos. Para el estándar te lo confirmamos con una visita o videollamada.</p>
          </div>
          <p class="tw-hint">${total > 6 ? 'Para más de 6 cámaras conviene un grabador (NVR/DVR) y PoE, así no dependés del WiFi.' : 'Un grabador externo (NVR) es opcional: también podés ver todo desde la app del celular.'}</p>`;
      });
    },
  };

  // ---------------------------------------------------- 3. Diagnóstico de seguridad
  TOOLS.seguridad = {
    titulo: 'Diagnóstico de seguridad de tu negocio',
    html: () => `
      <p class="tw-desc">10 preguntas rápidas. Al final te decimos qué está bien, qué está en riesgo y qué conviene arreglar primero.</p>
      <div class="tw-form" id="sForm">
        ${[
          ['¿Tenés respaldos automáticos de los datos importantes?', 'backup'],
          ['¿Usás contraseñas distintas para cada servicio?', 'pass'],
          ['¿Tenés un antivirus o protección activa en las компus?', 'av'],
          ['¿El WiFi del local tiene clave WPA2 o WPA3?', 'wifi'],
          ['¿Alguien del equipo fue objeto de una estafa por WhatsApp?', 'estafa'],
          ['¿Tenés cámaras o un control de acceso en el local?', 'cam'],
          ['¿Actualizás el sistema y las apps con regularidad?', 'act'],
          ['¿Guardás las contraseñas en un gestor o las anotás en un lugar seguro?', 'gestor'],
          ['¿Tenés seguro el local cerrado y con buen sistema de encendido?', 'local'],
          ['¿Sabés qué datos tenés guardados y dónde?', 'datos'],
        ]
          .map(
            ([t, id], i) => `
          <label class="tw-q"><input type="checkbox" data-q="${id}"> <span>${t}</span></label>`
          )
          .join('')}
      </div>
      <button class="btn btn-primary" id="sIr">Ver diagnóstico</button>
      <div id="sSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#sIr').addEventListener('click', () => {
        const marcadas = [...root.querySelectorAll('#sForm input:checked')].map((i) => i.dataset.q);
        const n = marcadas.length;
        const pct = Math.round((n / 10) * 100);

        const advice = {
          backup: 'Configurá un backup automático (local + nube). Es lo que más te protege si se rompe un disco o te hackean.',
          pass: 'Usá un gestor de contraseñas y una clave distinta para cada cosa. Es el cambio más barato y más efectivo.',
          av: 'Activá Windows Defender (o equivalente) y dejalo actualizado. No requiere instalar nada extra.',
          wifi: 'Cambiá la clave del router a WPA2/WPA3 y apagá el acceso por WPS. La clave por defecto es un agujero.',
          estafa: 'Mostrá al equipo la señales de una estafa: apuro, premio, link raro y pedido de datos. El phishing va a seguir llegando.',
          cam: 'Con 2 o 3 cámaras bien ubicado ya cubrís ingresos, personas y los puntos ciegos.',
          act: 'Activá las actualizaciones automáticas. La mayoría de losinale se previene actualizando.',
          gestor: 'Centralizá las claves en un gestor (Bitwarden, KeePass). Si no, quedan pegadas en un papel.',
          local: 'Revisá cerraduras, luz exterior y alarma. La seguridad física sigue siendo la base.',
          datos: 'Hacé un inventario de qué datos tenés y dónde. Sin eso no podés respaldar lo importante.',
        };

        let clase, titulo, detalle;
        if (pct >= 80) {
          clase = 'ok';
          titulo = 'Buen nivel de seguridad';
          detalle = 'Tenés lo más importante cubierto. Conviene revisar de vez en cuando y sostener los respaldos.';
        } else if (pct >= 50) {
          clase = 'warn';
          titulo = 'Hay algunos puntos débiles';
          detalle = 'La base está, pero hay que reforzar algunas cosas. Arreglá primero los respaldos y las contraseñas: son los que más evitan pérdidas.';
        } else {
          clase = 'err';
          titulo = 'Riesgo alto';
          detalle = 'Hoy un problema de red, un virus o una falla electrica te puede parar el negocio. Empezá por los respaldos y las contraseñas.';
        }

        const faltantes = Object.keys(advice).filter((k) => !marcadas.includes(k));

        root.querySelector('#sSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${pct}%</b><span>de controles superados</span></div>
            <div class="tw-metric"><b>${n}/10</b><span>controles OK</span></div>
          </div>
          <div class="tw-verdict ${clase}">
            <b>${titulo}</b>
            <p>${detalle}</p>
          </div>
          ${
            faltantes.length
              ? `<h4 class="tw-h4">Para reforzar</h4><ul class="tw-list">${faltantes.map((k) => `<li>${advice[k]}</li>`).join('')}</ul>`
              : '<p class="tw-hint">Todo lo esencial está cubierto. Buen trabajo.</p>'
          }`;
      });
    },
  };

  // ---------------------------------------------------- 4. Calculadora de backup
  TOOLS.backup = {
    titulo: '¿Cuánta capacidad necesita tu backup?',
    html: () => `
      <p class="tw-desc">Estimamos cuánto disco necesitás para respaldar tu negocio y cuánto te sale Guardarlo en la nube.</p>
      <div class="tw-form">
        <label>¿Cuántas personas trabajan en el negocio?
          <select id="bGente"><option value="1">1</option><option value="3">2 a 5</option><option value="8">6 a 10</option><option value="15">más de 10</option></select>
        </label>
        <label>¿Qué guardás día a día?
          <select id="bDatos">
            <option value="20">Solo ofimática y documentos (unos 20 GB por persona)</option>
            <option value="60">Documentos + fotos y videos de productos (60 GB por persona)</option>
            <option value="200">Todo, incluyendo diseño y video (200 GB por persona)</option>
          </select>
        </label>
        <label>¿Cuánto querés guardar cada versión?
          <select id="bHist"><option value="1">Solo la última (1 copia)</option><option value="7">La última semana (7 copias)</option><option value="30">El último mes (30 copias)</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="bIr">Calcular</button>
      <div id="bSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#bIr').addEventListener('click', () => {
        const gente = Number(root.querySelector('#bGente').value);
        const porPersona = Number(root.querySelector('#bDatos').value);
        const hist = Number(root.querySelector('#bHist').value);
        const gb = gente * porPersona * hist;
        const tb = gb / 1000;

        root.querySelector('#bSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${gb >= 1000 ? tb.toFixed(1) + ' TB' : gb + ' GB'}</b><span>espacio total</span></div>
            <div class="tw-metric"><b>${Math.max(gb / hist, 1).toFixed(0)} GB</b><span>por copia</span></div>
          </div>
          <div class="tw-verdict ok">
            <b>Plan recomendado</b>
            <p>Un disco externo de <b>${sugerirDisco(gb)}</b> para la copia local, más la nube como segunda copia. Con 2 copias ya estás cubierto contra la mayoría de los accidentes.</p>
          </div>
          <p class="tw-hint">La nube sola no alcanza: si te entran a la cuenta te borran también las copias. La regla de oro es <b>3-2-1</b>: 3 copias, 2 medios distintos, 1 fuera del local.</p>`;
      });
    },
  };

  function sugerirDisco(gb) {
    const opciones = [
      [500, '500 GB'],
      [1000, '1 TB'],
      [2000, '2 TB'],
      [4000, '4 TB'],
      [8000, '8 TB'],
      [16000, '16 TB'],
    ];
    for (const [max, txt] of opciones) if (gb <= max) return txt;
    return 'varios discos o un NAS';
  }

  // ---------------------------------------------------- 5. Generador de contraseñas
  TOOLS.password = {
    titulo: 'Generador de contraseñas seguras',
    html: () => `
      <p class="tw-desc">Genera una contraseña aleatoria en tu navegador. No se envía a ningún lado.</p>
      <div class="tw-form">
        <label>Largo: <b id="pLargoVal">20</b> caracteres
          <input type="range" id="pLargo" min="8" max="64" value="20" />
        </label>
        <label class="tw-q"><input type="checkbox" id="pNum" checked> Incluir números</label>
        <label class="tw-q"><input type="checkbox" id="pSim" checked> Incluir símbolos (!#$%&amp;)</label>
        <label class="tw-q"><input type="checkbox" id="pMay" checked> Incluir mayúsculas</label>
      </div>
      <div class="tw-pass"><code id="pSalida">—</code><button class="btn btn-ghost btn-small" id="pCopiar">Copiar</button></div>
      <button class="btn btn-primary" id="pIr">Generar</button>
      <div id="pFuerza" class="tw-out"></div>`,
    init: (root) => {
      const largo = root.querySelector('#pLargo');
      const salida = root.querySelector('#pSalida');
      const fuerza = root.querySelector('#pFuerza');

      const generar = () => {
        const n = Number(largo.value);
        root.querySelector('#pLargoVal').textContent = n;
        let chars = 'abcdefghijklmnopqrstuvwxyz';
        if (root.querySelector('#pMay').checked) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (root.querySelector('#pNum').checked) chars += '0123456789';
        if (root.querySelector('#pSim').checked) chars += '!#$%&*+-=?@';
        const buf = new Uint32Array(n);
        crypto.getRandomValues(buf);
        let pass = '';
        for (let i = 0; i < n; i++) pass += chars[buf[i] % chars.length];
        salida.textContent = pass;

        const bits = n * Math.log2(chars.length);
        let clase, txt;
        if (bits < 40) { clase = 'err'; txt = 'Débil: no la uses para nada importante.'; }
        else if (bits < 60) { clase = 'warn'; txt = 'Aceptable para cuentas sin valor.'; }
        else if (bits < 90) { clase = 'ok'; txt = 'Buena. Sirve para correo, banco y redes.'; }
        else { clase = 'ok'; txt = 'Excelente. Ideal para cuentas administrativas.'; }
        fuerza.innerHTML = `<div class="tw-verdict ${clase}"><b>Seguridad: ${bits.toFixed(0)} bits</b><p>${txt}</p></div>`;
      };

      largo.addEventListener('input', generar);
      ['pNum', 'pSim', 'pMay'].forEach((id) => root.querySelector('#' + id).addEventListener('change', generar));
      root.querySelector('#pIr').addEventListener('click', generar);
      root.querySelector('#pCopiar').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(salida.textContent);
          root.querySelector('#pCopiar').textContent = '¡Copiada!';
          setTimeout(() => (root.querySelector('#pCopiar').textContent = 'Copiar'), 1500);
        } catch {
          /* clipboard bloqueado: el usuario copia a mano */
        }
      });
      generar();
    },
  };

  // ---------------------------------------------------- 6. Costo del tiempo caído
  TOOLS.downs = {
    titulo: '¿Cuánto te cuesta la informática caída?',
    html: () => `
      <p class="tw-desc">Una hora sin sistema, sin WiFi o sin cámaras tiene un costo. Mirá cuánto perde tu negocio por mes.</p>
      <div class="tw-form">
        <label>Facturación promedio mensual
          <select id="dVentas">
            <option value="500000">$500.000</option>
            <option value="1500000" selected>$1.500.000</option>
            <option value="4000000">$4.000.000</option>
            <option value="10000000">$10.000.000</option>
          </select>
        </label>
        <label>¿Cuántas personas usan el sistema?
          <select id="dGente"><option value="1">1</option><option value="3" selected>3</option><option value="8">8</option><option value="15">15</option></select>
        </label>
        <label>¿Cuántas horas por mes se pierden por problemas técnicos?
          <select id="dHoras"><option value="2">2 horas</option><option value="5" selected>5 horas</option><option value="10">10 horas</option><option value="20">20 horas</option></select>
        </label>
        <label>Valor promedio de la hora de trabajo
          <select id="dCosto"><option value="3000">$3.000</option><option value="8000" selected>$8.000</option><option value="15000">$15.000</option><option value="30000">$30.000</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="dIr">Calcular</button>
      <div id="dSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#dIr').addEventListener('click', () => {
        const ventas = Number(root.querySelector('#dVentas').value);
        const gente = Number(root.querySelector('#dGente').value);
        const horas = Number(root.querySelector('#dHoras').value);
        const costoHora = Number(root.querySelector('#dCosto').value);
        const costoHoras = horas * costoHora * gente;
        const pct = (costoHoras / ventas) * 100;

        root.querySelector('#dSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${formatoPesos(costoHoras)}</b><span>por mes en tiempo caído</span></div>
            <div class="tw-metric"><b>${pct.toFixed(1).replace('.', ',')}%</b><span>de tu facturación</span></div>
          </div>
          <div class="tw-verdict ${pct > 4 ? 'err' : pct > 2 ? 'warn' : 'ok'}">
            <b>${pct > 4 ? 'Estás perdiendo plata' : pct > 2 ? 'Hay margen de mejora' : 'Controlado'}</b>
            <p>${pct > 4 ? 'Ese costo es mayor al 4% de tu facturación. Con mantenimiento preventivo y backups, una parte importante de eso se evita.' : pct > 2 ? 'Un 2 a 4% ya es noticeable. Un plan de mantenimiento preventivo suele recuperar buena parte.' : 'Vas bien, pero sigue conviene tener respaldos automáticos y cámaras funcionando.'}</p>
          </div>
          <p class="tw-hint">Cálculo orientativo: horas perdidas × costo de la hora × personas. La facturación se usa como referencia del tamaño del negocio.</p>`;
      });
    },
  };

  function formatoPesos(n) {
    return '$' + n.toLocaleString('es-AR');
  }

  // Registro global: permite que tools-extra.js agregue más herramientas.
  window.MF_TOOLS = TOOLS;
})();
