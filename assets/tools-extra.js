/* ============================================================================
   Herramientas adicionales — MF Tech AR
   ----------------------------------------------------------------------------
   Se registran en el mismo registro que tools.js (window.MF_TOOLS).
   Debe cargarse DESPUÉS de tools.js.
   ========================================================================== */
(() => {
  'use strict';

  const T = window.MF_TOOLS;
  if (!T) {
    console.error('[tools-extra] falta tools.js');
    return;
  }

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pesos = (n) => '$' + Math.round(n).toLocaleString('es-AR');

  // ================================================================== CÁMARAS
  // 1) Cobertura: cuántos m² cubre cada tipo de cámara
  T.cobertura = {
    titulo: '¿Cuánto cubre cada cámara?',
    html: () => `
      <p class="tw-desc">El área que ves depende del objetivo, el ángulo y la altura de montaje. Esto te da una referencia para calcular sin pagar de más.</p>
      <div class="tw-form">
        <label>Objetivo de la cámara
          <select id="coObj">
            <option value="35">Gran angular (ver el local entero)</option>
            <option value="90" selected>Estándar (acceso, caja, mostrador)</option>
            <option value="180">Detalle (rostros, etiquetas,-packages)</option>
          </select>
        </label>
        <label>Altura de montaje
          <select id="coAlt"><option value="2.5">2,50 m</option><option value="3" selected>3,00 m</option><option value="3.5">3,50 m o más</option></select>
        </label>
        <label>Iluminación del lugar
          <select id="coLuz"><option value="1">Buena luz</option><option value="0.6" selected>Luz media</option><option value="0.35">Poca luz o contraluz</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="coIr">Calcular cobertura</button>
      <div id="coSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#coIr').addEventListener('click', () => {
        const obj = Number(root.querySelector('#coObj').value);
        const alt = Number(root.querySelector('#coAlt').value);
        const luz = Number(root.querySelector('#coLuz').value);
        const m2 = Math.round((obj / 2) * 2 * (alt * 1.6) * luz);
        const detalle =
          obj <= 35
            ? 'Gran angular: cubrís el local entero, pero los rostros quedan chicos. Ideal para saber si entró alguien.'
            : obj >= 180
              ? 'Detalle: reconnaissanceás rostros y etiquetas de forma nítida a corta distancia.'
              : 'Estándar: el equilibrio ideal para la mayoría de los locales.';

        root.querySelector('#coSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${m2} m²</b><span>cobertura estimada</span></div>
            <div class="tw-metric"><b>${alt.toFixed(2).replace('.', ',')} m</b><span>altura usada</span></div>
          </div>
          <div class="tw-verdict ok"><b>${detalle}</b>
          <p>En la práctica la cobertura real es menor si hay estanterías, columnas o vidrieras. Conviene instalar con losödulos en las esquinas y apuntar al centro de los pasos.</p></div>
          <p class="tw-hint">Cámara con IA en movimiento: sabe de cobertura útil. La IA detecta eventos aunque la persona esté lejos.</p>`;
      });
    },
  };

  // 2) Almacenamiento del grabador
  T.nvr = {
    titulo: '¿Cuánto disco necesita el grabador?',
    html: () => `
      <p class="tw-desc">Calculamos el espacio para guardar los videos el tiempo que querés conservarlos.</p>
      <div class="tw-form">
        <label>Cantidad de cámaras
          <select id="nCam"><option value="2">2 cámaras</option><option value="4" selected>4 cámaras</option><option value="6">6 cámaras</option><option value="8">8 cámaras</option><option value="12">12 cámaras</option></select>
        </label>
        <label>Resolución de grabación
          <select id="nRes"><option value="2">Full HD (1080p)</option><option value="4" selected>2K (1440p)</option><option value="8">4K (2160p)</option></select>
        </label>
        <label>¿Cuántos días querés guardar?
          <select id="nDias"><option value="7">7 días</option><option value="15" selected>15 días</option><option value="30">30 días</option><option value="60">60 días</option></select>
        </label>
        <label>¿Grabación continua o por movimiento?
          <select id="nModo"><option value="1">Solo por movimiento (ahorra mucho)</option><option value="0" selected>Continua 24/7</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="nIr">Calcular</button>
      <div id="nSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#nIr').addEventListener('click', () => {
        const cam = Number(root.querySelector('#nCam').value);
        const res = Number(root.querySelector('#nRes').value);
        const dias = Number(root.querySelector('#nDias').value);
        const modo = root.querySelector('#nModo').value === '1';

        // ~1,5 GB/día por cámara en Full HD; x2 en 2K; x4 en 4K
        const gbDia = res * 1.5 * cam;
        const factor = modo ? 0.35 : 1;
        const total = gbDia * dias * factor;
        const tb = total / 1000;
        const disco = total <= 1000 ? '1 TB' : total <= 2000 ? '2 TB' : total <= 4000 ? '4 TB' : total <= 8000 ? '8 TB' : '16 TB';

        root.querySelector('#nSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${total >= 1000 ? tb.toFixed(1).replace('.', ',') + ' TB' : Math.round(total) + ' GB'}</b><span>espacio necesario</span></div>
            <div class="tw-metric"><b>${disco}</b><span>disco recomendado</span></div>
          </div>
          <div class="tw-verdict ok"><b>${modo ? 'Con grabación por movimiento gastás un 65% menos' : 'Grabación continua 24/7'}</b>
          <p>${modo ? 'La grabación por movimiento (VMD) guarda solo cuando algo se mueve. Es lo más recomendado para locales con horario de atención.' : 'La grabación continua no se pierde nada, pero llena el disco más rápido y es más difícil buscar un evento puntual.'}</p></div>
          <p class="tw-hint">Regla práctica: si el disco se llena antes de lo que querés, tenés dos salidas: más capacidad o bajar la resolución de un par de cámaras.</p>`;
      });
    },
  };

  // 3) Comparador de cámaras
  T.comparador = {
    titulo: 'Comparador de cámaras',
    html: () => `
      <p class="tw-desc">Cuadro comparativo con lo que realmente cambia cuando elegís una cámara u otra.</p>
      <div class="tw-table-wrap">
        <table class="tw-table">
          <thead><tr><th>Opción</th><th>Pros</th><th>Contras</th><th>Cuándo conviene</th></tr></thead>
          <tbody>
            <tr><td><b>IP / PoE (cableada)</b></td><td>Señal estable, no depende del WiFi, alimenta por el mismo cable</td><td>Requiere pasar cable</td><td>Locales con 3 cámaras o más, o donde el WiFi no llega</td></tr>
            <tr><td><b>WiFi</b></td><td>Instalación rápida, sin obra</td><td>Se corta si el WiFi falla, consume ancho de banda</td><td>1 o 2 cámaras en un lugar con buena cobertura</td></tr>
            <tr><td><b>Full HD (1080p)</b></td><td>Alcanza para identificar rasgos a 5-8 m</td><td>Se ve pixelada si la cámara está lejos</td><td>Accesos, mostradores, interior de local</td></tr>
            <tr><td><b>2K (1440p)</b></td><td>Buen equilibrio, más detalle que HD</td><td>Más disco y más ancho de banda</td><td>El punto medio ideal para la mayoría</td></tr>
            <tr><td><b>4K (2160p)</b></td><td>Reconoces caras y hasta matrícula a distancia</td><td>Requiere disco grande y buena red</td><td>Estacionamientos, ingresos de vehicle, galpones</td></tr>
            <tr><td><b>Con IA</b></td><td>Detecta personas, vehículos y eventos; te avisa al celular</td><td>Cuesta un poco más</td><td>Cuando querés saber QUÉ pasó, no solo ver que pasó</td></tr>
            <tr><td><b>Color (sin IR)</b></td><td>Se ve tal cual el color de la ropa o el auto</td><td>De noche sin luz es casi inútil</td><td>Locales iluminados,_RGB</td></tr>
            <tr><td><b>Blanco y negro (IR)</b></td><td>Ve de noche sin luz ambiente</td><td>No distingue colores</td><td>Mostrador, depósito, patio trasero</td></tr>
          </tbody>
        </table>
      </div>
      <p class="tw-hint">¿Seguís sin decidir? Usá la <a href="#herramientas" style="color:var(--turq)">calculadora de cámaras</a> para saber cuántas te hacen falta primero.</p>`,
    init: () => {},
  };

  // ================================================================== REDES
  // 4) Calculadora de WiFi / access points
  T.wifi = {
    titulo: '¿Cuántos access points necesitás?',
    html: () => `
      <p class="tw-desc">Estima cuántos puntos de acceso necesitás para cubrir el lugar sin zonas muertas.</p>
      <div class="tw-form">
        <label>Tipo de lugar
          <select id="wLug"><option value="local">Local de hasta 60 m²</option><option value="med" selected>Local de 60 a 150 m²</option><option value="gran">Local o depósito más de 150 m²</option></select>
        </label>
        <label>Materiales de las paredes
          <select id="wPared"><option value="1">Liviano (dique, madera y gypsum)</option><option value="0.7" selected>Mixto (algunos ladrillos, algún tabique)</option><option value="0.45">Pesado (ladrillo visto, hormigón)</option></select>
        </label>
        <label>Cuántas plantas tiene
          <select id="wPiso"><option value="1">1 planta</option><option value="2" selected>2 plantas</option><option value="3">3 plantas</option></select>
        </label>
        <label>¿Hay muchos equipos conectados a la vez?
          <select id="wEquipos"><option value="5">Hasta 10</option><option value="20" selected>10 a 30</option><option value="50">Más de 30</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="wIr">Calcular</button>
      <div id="wSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#wIr').addEventListener('click', () => {
        const lug = root.querySelector('#wLug').value;
        const pared = Number(root.querySelector('#wPared').value);
        const piso = Number(root.querySelector('#wPiso').value);
        const equipos = Number(root.querySelector('#wEquipos').value);

        const base = { local: 1, med: 2, gran: 3 }[lug] || 2;
        let ap = Math.ceil((base * piso) / pared);
        if (equipos > 30) ap += 1;
        ap = Math.max(1, ap);

        root.querySelector('#wSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${ap}</b><span>access points sugeridos</span></div>
            <div class="tw-metric"><b>${ap > 1 ? 'Cableado' : 'WiFi + repetidor'}</b><span>esquema</span></div>
          </div>
          <div class="tw-verdict ok"><b>Plan de cobertura</b>
          <p>${ap === 1 ? 'Con un solo access point bien ubicado (generalmente al centro y en altura) cubrís un local chico. Si te queda alguna zona sin señal, un repetidor o un par de cables alcanzan.' : 'Con ' + ap + ' access points cableados evitás las zonas muertas. Un router máspotent no resuelve el problema: la señal no es el cuello de botella, la distribución lo es.'}</p></div>
          <p class="tw-hint">Si tenés cámaras, el punto es que la señal llegue fuerte a cada cámara: una cámara con WiFi débil pierde nitidez de noche. Conviene cablearla.</p>`;
      });
    },
  };

  // 5) Calculadora de cableado
  T.cableado = {
    titulo: 'Calculadora de cableado',
    html: () => `
      <p class="tw-desc">Cuánto cable necesitás y cuánto te sale la instalación en red.</p>
      <div class="tw-form">
        <label>Distancia hasta el punto central (router o NVR)
          <select id="cMetros"><option value="15">Hasta 15 m</option><option value="30" selected>15 a 30 m</option><option value="50">30 a 50 m</option><option value="90">50 a 90 m</option></select>
        </label>
        <label>Cuántos equipos van cableados
          <select id="cEquipos"><option value="2">2 equipos</option><option value="4" selected>4 equipos</option><option value="8">8 equipos</option><option value="12">12 equipos</option></select>
        </label>
        <label>Tipo de cable
          <select id="cTipo"><option value="utp">UTP (red y datos)</option><option value="ftp" selected>FTP (con blindaje, ideal si hay강electricidad junto)</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="cIr">Calcular</button>
      <div id="cSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#cIr').addEventListener('click', () => {
        const metros = Number(root.querySelector('#cMetros').value);
        const eq = Number(root.querySelector('#cEquipos').value);
        const tipo = root.querySelector('#cTipo').value;
        const extra = eq - 1;

        // Bobinas de 305 m (caja) o metros sueltos
        const total = metros * eq + extra * 3; // 3 m de holgura por equipo
        const caja = Math.ceil(total / 305);
        const metro = tipo === 'ftp' ? 3200 : 2100; // precio estimado del metro en ARS
        const materiales = Math.round(total * metro) + caja * 45000;

        root.querySelector('#cSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${total} m</b><span>cable total (con holguras)</span></div>
            <div class="tw-metric"><b>${caja}</b><span>caja de 305 m</span></div>
          </div>
          <div class="tw-verdict ok"><b>Materiales estimados</b>
          <p>${pesos(materiales)} en cable ${tipo.toUpperCase()} y conectores, sin contar la mano de obra. Si la instalación es en un local con canalización nueva, el costo de obra suele ser mayor que el del material.</p></div>
          <p class="tw-hint">${tipo === 'ftp' ? 'El cable blindado (FTP) evita interferencias de los cables de luz y es la opción segura si comparten el mismo conducto.' : 'El UTP alcanza para la mayoría de los casos. Si pasa junto a la instalación eléctrica, conviene blindado.'}</p>`;
      });
    },
  };

  // ================================================================== PC
  // 6) ¿Qué mejora necesita tu PC?
  T.mejora = {
    titulo: '¿Qué le falta a tu PC?',
    html: () => `
      <p class="tw-desc">Respondé cómo se siente tu equipo y te decimos qué componente conviene cambiar primero (y qué no tocar todavía).</p>
      <div class="tw-form">
        <label>¿Cuánto tarda en prender?
          <select id="mPrende"><option value="1">En menos de 30 segundos</option><option value="2" selected>Entre 30 segundos y 2 minutos</option><option value="3">Más de 2 minutos</option></select>
        </label>
        <label>¿Cómo se siente al trabajar?
          <select id="mUsa"><option value="1">Va bien, no noto demoras</option><option value="2" selected>Tarda al abrir archivos y programas</option><option value="3">Se cuelga y me hace perder el trabajo</option></select>
        </label>
        <label>¿Tiene disco mecánico (HDD) o SSD?
          <select id="mDisco"><option value="0">No sé</option><option value="1" selected>Disco mecánico (lo escucho girar)</option><option value="2">SSD</option></select>
        </label>
        <label>¿Hace cuánto la tenés?
          <select id="mEdad"><option value="1">Menos de 3 años</option><option value="2" selected>Entre 3 y 7 años</option><option value="3">Más de 7 años</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="mIr">Ver diagnóstico</button>
      <div id="mSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#mIr').addEventListener('click', () => {
        const prende = Number(root.querySelector('#mPrende').value);
        const usa = Number(root.querySelector('#mUsa').value);
        const disco = Number(root.querySelector('#mDisco').value);
        const edad = Number(root.querySelector('#mEdad').value);

        const acciones = [];
        if (disco === 1) acciones.push('Cambiar el disco por un SSD: es la mejora con mayor impacto y menor costo. De golpe la PC prende en segundos.');
        if (usa >= 2) acciones.push('Revisar si le falta RAM: con 8 GB o menos y muchas pestañas abiertas, la memoria se agota.');
        if (prende === 3) acciones.push('Hacer una limpieza de arranque: demasiados programas se initiation solos y ralentizan el equipo.');
        if (edad === 3) acciones.push('Evaluar si conviene el recambio: después de 7 años, un upgrade completo puede costar lo mismo que un equipo nuevo.');

        const prioridad = disco === 1 ? 'Poner un SSD' : usa >= 2 ? 'Revisar la RAM' : prende === 3 ? 'Limpiar el arranque' : 'Hacer un mantenimiento general';

        root.querySelector('#mSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${prioridad}</b><span>primera acción</span></div>
          </div>
          <div class="tw-verdict ok"><b>Qué conviene hacer, en orden</b>
          <ul class="tw-list">${acciones.map((a) => `<li>${a}</li>`).join('')}</ul></div>
          <p class="tw-hint">En la mayoría de los casos, un SSD y una limpieza de arranque resuelven el 80% de las quejas. Antes de cambiar la placa madre o el procesador, probá eso.</p>`;
      });
    },
  };

  // ================================================================== BACKUPS
  // 7) RPO / RTO
  T.rpo = {
    titulo: 'RPO y RTO: cuánto podés perder y cuánto tardás en recuperar',
    html: () => `
      <p class="tw-desc">Dos números que definen si tu backup sirve de algo. Son la base de cualquier plan de continuidad.</p>
      <div class="tw-form">
        <label>¿Qué es lo más crítico para tu negocio?
          <select id="rCrito"><option value="1">Facturación y caja</option><option value="2" selected>Base de datos de clientes</option><option value="3">Todo lo anterior</option></select>
        </label>
        <label>¿Cada cuánto hacés copia hoy?
          <select id="rFrec"><option value="1">Todos los días</option><option value="2" selected>Una vez por semana</option><option value="3">Cada varios meses o nunca</option></select>
        </label>
        <label>¿Cuánto tardás hoy en recuperar si algo falla?
          <select id="rRec"><option value="1">Menos de 1 hora</option><option value="2" selected>Entre 1 y 4 horas</option><option value="3">Más de un día</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="rIr">Calcular</button>
      <div id="rSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#rIr').addEventListener('click', () => {
        const critico = Number(root.querySelector('#rCrito').value);
        const frec = Number(root.querySelector('#rFrec').value);
        const rec = Number(root.querySelector('#rRec').value);

        const rpoTexto = ['hasta 24 horas', 'hasta 1 semana', 'semanas o meses'][frec - 1];
        const rtoTexto = ['menos de 1 hora', '1 a 4 horas', 'más de 24 horas'][rec - 1];
        const objetivo = critico === 3 ? 'RPO 1 hora · RTO 4 horas' : critico === 2 ? 'RPO 4 horas · RTO 8 horas' : 'RPO 15 min · RTO 1 hora';

        const riesgo = frec === 3 || rec === 3 ? 'err' : frec === 2 || rec === 2 ? 'warn' : 'ok';
        const veredicto =
          riesgo === 'err'
            ? 'Hoy un problema significa perder datos o días de trabajo. Ese es el riesgo más caro que tenés.'
            : riesgo === 'warn'
              ? 'Tenés cierta cobertura, pero hay una ventana de pérdida real. Con una automatización, esa ventana se reduce a horas.'
              : 'Buen nivel: hacés copias seguido y recuperás rápido. Solo falta verificar que las copias restauren bien.';

        root.querySelector('#rSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${rpoTexto}</b><span>tu RPO actual</span></div>
            <div class="tw-metric"><b>${rtoTexto}</b><span>tu RTO actual</span></div>
          </div>
          <div class="tw-verdict ${riesgo}"><b>${veredicto}</b>
          <p>Objetivo recomendado para tu caso: <b>${objetivo}</b>. Se logra con backup automático y una copia en la nube.</p></div>
          <p class="tw-hint">Dato importante: un backup que nunca se restauró no es un backup, es unaillusion. Conviene hacer un simulacro de restauración una vez por año.</p>`;
      });
    },
  };

  // ================================================================== CIBERSEGURIDAD
  // 8) Detector de phishing
  T.phishing = {
    titulo: 'Detector de mensajes sospechosos',
    html: () => `
      <p class="tw-desc">Copiá el mensaje que te llegó (el texto del mail, SMS o WhatsApp) y te digo qué señales de alerta tiene. No se envía nada: se analiza en tu navegador.</p>
      <div class="tw-form">
        <label>Remitente o número del remitente
          <input type="text" id="phRem" placeholder="Ej: banco.argentina@micuenta-verificacion.com" />
        </label>
        <label>Texto del mensaje
          <input type="text" id="phTxt" placeholder="Ej: Hola, tu cuenta fue bloqueada, verificá tus datos haciendo clic" />
        </label>
        <label>Link del mensaje (si lo tiene)
          <input type="text" id="phLink" placeholder="Ej: http://banco-segur0.com/verificar" />
        </label>
      </div>
      <button class="btn btn-primary" id="phIr">Analizar</button>
      <div id="phSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#phIr').addEventListener('click', () => {
        const rem = (root.querySelector('#phRem').value || '').toLowerCase().trim();
        const txt = (root.querySelector('#phTxt').value || '').toLowerCase().trim();
        const link = (root.querySelector('#phLink').value || '').toLowerCase().trim();
        const todo = rem + ' ' + txt + ' ' + link;

        const senales = [];
        if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|https?:\/\/\d/.test(link)) senales.push('El link usa una dirección IP en lugar de un nombre de dominio. Casi siempre es phishing.');
        if (link && /@(?!.*\.)/.test(link)) senales.push('El link tiene un "@": después del @ se esconde el destino real.');
        if (link && !link.startsWith('https')) senales.push('El link no usa HTTPS: la conexión no está cifrada.');
        if (/(bit\.ly|tinyurl|cutt\.ly|is\.gd|t\.co|shorturl)/.test(link)) senales.push('Es un acortador de links: oculta la dirección real a la que lleva.');
        if (rem && /\d{1,3}[-.\s]?\d{3}[-.\s]?\d{3}/.test(rem)) senales.push('El remitente parece un número de teléfono, no una casilla de correo real.');
        if (rem && rem.split('@')[1] && !/(gmail|hotmail|outlook|yahoo|argentina\.gob\.ar)/.test(rem.split('@')[1])) {
          const dominio = rem.split('@')[1];
          if (dominio.split('.').slice(0, -2).join('.').match(/0|1|l|i|rn|mvvn|rnava/)) senales.push('El dominio imita uno conocido cambiando letras por números o pareciéndose ("rn" por "m").');
          else senales.push('El dominio del remitente no es de un proveedor conocido: revisá que la empresa exista.');
        }
        if (/(verific|confirm|actualiz|bloque|uspend|urgent|urgente|ultimo|último|cuenta.*(caduca|bloqueada)|premio|ganaste|transferencia|inmediato)/.test(todo)) senales.push('El texto apura o asusta: "verificá", "últimaChance", "tu cuenta fue bloqueada".');
        if (/(datos.*(banc|tarjeta|pin|cvv|contraseña)|número de tarjeta|clave bancaria|token)/.test(todo)) senales.push('Pide datos bancarios, PIN o contraseñas. Ningún banco los pide por mail o WhatsApp.');
        if (/(gratis|regalo|bonus|promo)/.test(todo) && /premio|ganaste/.test(todo)) senales.push('Te ofrece un premio o regalo: la recompensa por hacer clic en un enlace.');

        const nivel = senales.length >= 3 ? 'err' : senales.length >= 1 ? 'warn' : 'ok';
        const titulo = senales.length >= 3 ? 'Muy probablemente es phishing' : senales.length >= 1 ? ' Tiene señales de alerta' : 'No veo señales evidentes';

        root.querySelector('#phSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${senales.length}</b><span>señales detectadas</span></div>
          </div>
          <div class="tw-verdict ${nivel}"><b>${titulo}</b>
          ${
            senales.length
              ? `<ul class="tw-list">${senales.map((s) => `<li>${s}</li>`).join('')}</ul>`
              : '<p>El mensaje no muestra señales típicas. Igual, si te pide datos o dinero, verificá contactingo por el canal oficial.</p>'
          }</div>
          <p class="tw-hint">Regla de oro: si tenés dudas, no hagas clic. Entrá al banco o al servicio escribiendo vos mismo la dirección en el navegador.</p>`;
      });
    },
  };

  // 9) Tiempo de cracking de contraseñas
  T.crack = {
    titulo: '¿Cuánto tarda en crackearse una contraseña?',
    html: () => `
      <p class="tw-desc">Mirá cuánto resiste tu contraseña actual frente a un ataque automatizado.</p>
      <div class="tw-form">
        <label>Tu contraseña
          <input type="text" id="crPass" placeholder="Escribí tu contraseña" />
        </label>
        <label>Longitud
          <input type="range" id="crLen" min="4" max="32" value="8" />
          <span class="tw-hint" id="crLenVal">8 caracteres</span>
        </label>
        <label>Complejidad
          <select id="crTipo"><option value="1">Solo minúsculas</option><option value="2" selected>Minúsculas y números</option><option value="3">Con mayúsculas y símbolos</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="crIr">Calcular</button>
      <div id="crSalida" class="tw-out"></div>`,
    init: (root) => {
      const len = root.querySelector('#crLen');
      len.addEventListener('input', () => (root.querySelector('#crLenVal').textContent = len.value + ' caracteres'));

      root.querySelector('#crIr').addEventListener('click', () => {
        const pass = root.querySelector('#crPass').value;
        const n = Number(len.value);
        const tipo = Number(root.querySelector('#crTipo').value);

        let alfabeto = 26;
        if (tipo === 2) alfabeto = 36;
        if (tipo === 3) alfabeto = 94;

        // Si escribió una clave, usamos la longitud real y detectamos patrones simples
        let largo = n;
        let penal = 1;
        if (pass) {
          largo = pass.length;
          if (/^[0-9]+$/.test(pass)) penal = 0.35;
          else if (/^[a-z]+$/.test(pass)) penal = 0.5;
          else if (/(.)\1{2,}/.test(pass)) penal = 0.6;
          else if (/(19|20)\d{2}|abc|123|qwerty/i.test(pass)) penal = 0.4;
        }

        const bits = largo * Math.log2(alfabeto) * penal;
        // 100 mil millones de intentos por segundo (GPU potente)
        const intentosPorSegundo = 1e11;
        const segundos = Math.pow(2, bits) / intentosPorSegundo;

        const humanizar = (s) => {
          if (s < 1) return 'menos de 1 segundo';
          if (s < 60) return Math.round(s) + ' segundos';
          if (s < 3600) return Math.round(s / 60) + ' minutos';
          if (s < 86400) return Math.round(s / 3600) + ' horas';
          if (s < 31536000) return Math.round(s / 86400) + ' días';
          const anios = s / 31536000;
          if (anios < 1000) return Math.round(anios) + ' años';
          if (anios < 1e6) return Math.round(anios / 1000).toLocaleString('es-AR') + ' mil años';
          if (anios < 1e9) return Math.round(anios / 1e6) + ' millones de años';
          return 'prácticamente para siempre';
        };

        const nivel = bits < 40 ? 'err' : bits < 60 ? 'warn' : 'ok';
        const veredicto =
          bits < 40
            ? 'Se rompe de inmediato. No la uses para correo, banco ni administration.'
            : bits < 60
              ? 'Se rompe con un ataque automatizado en minutos u horas. Alcanza para algo que no importe mucho.'
              : 'Aguanta un ataque automatizado. Para cuentas importantes, sumá mayúsculas, números y símbolos.';

        root.querySelector('#crSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${humanizar(segundos)}</b><span>para romperla</span></div>
            <div class="tw-metric"><b>${bits.toFixed(0)} bits</b><span>de entropía</span></div>
          </div>
          <div class="tw-verdict ${nivel}"><b>${veredicto}</b>
          <p>Calculado contra un ataque automatizado moderno (100 mil millones de intentos por segundo). Una persona probando a mano sería mucho más lenta.</p></div>
          <p class="tw-hint">Si la clave es un nombre, una palabra del diccionario o una secuencia (1234, qwerty), el cálculo real es mucho peor de lo que dice acá.</p>`;
      });
    },
  };

  // ================================================================== AUTOMATIZACIÓN
  // 10) Horas ahorradas con automatización
  T.ahorro = {
    titulo: '¿Cuánto tiempo te ahorra automatizar?',
    html: () => `
      <p class="tw-desc">Contabilizá las tareas repetitivas de tu negocio y mirá cuánto tiempo te liberan.</p>
      <div class="tw-form">
        <label>¿Cuántas publicaciones hacés por semana en redes?
          <select id="aPosts"><option value="0">Ninguna</option><option value="3" selected>3</option><option value="7">7 (una por día)</option><option value="14">14 (dos por día)</option></select>
        </label>
        <label>¿Cuánto tardás en preparar cada una (incluyendo la imagen)?
          <select id="aTiempo"><option value="20">20 minutos</option><option value="45" selected>45 minutos</option><option value="90">90 minutos</option></select>
        </label>
        <label>¿Cuánto tardás en responder los mensajes repetidos?
          <select id="aMsg"><option value="10">10 minutos por día</option><option value="30" selected>30 minutos por día</option><option value="60">Una hora por día</option></select>
        </label>
        <label>¿Cuántas personas usan el negocio?
          <select id="aGente"><option value="1">Solo yo</option><option value="3" selected>2 a 5</option><option value="8">Más de 5</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="aIr">Calcular</button>
      <div id="aSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#aIr').addEventListener('click', () => {
        const posts = Number(root.querySelector('#aPosts').value);
        const tPosts = Number(root.querySelector('#aTiempo').value);
        const tMsg = Number(root.querySelector('#aMsg').value);
        const gente = Number(root.querySelector('#aGente').value);

        const horasPosts = (posts * tPosts) / 60;
        const horasMsg = (tMsg * 5) / 60; // 5 días hábiles
        const horasMes = (horasPosts + horasMsg) * 4.3;
        const horasAnio = horasMes * 12;
        const costo = Math.round(horasAnio * 8000);

        root.querySelector('#aSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${horasMes.toFixed(1).replace('.', ',')} h</b><span>por mes</span></div>
            <div class="tw-metric"><b>${horasAnio.toFixed(0)} h</b><span>por año</span></div>
          </div>
          <div class="tw-verdict ok"><b>Eso es ${horasAnio.toFixed(0)} horas al año</b>
          <p>A un valor conservador de ${pesos(8000)} por hora, equivale a <b>${pesos(costo)}</b> de trabajo no facturable. Automatizar publicación y respuestas frecuentes es de las mejores inversiones para un negocio chico.</p></div>
          <p class="tw-hint">Con ${gente} personas trabajando, el ahorro se multiplica: lo que hoy hace una persona a mano, lo puede hacer el sistema las 24 horas.</p>`;
      });
    },
  };

  // 11) Presupuesto anual de contenidos
  T.presupuesto = {
    titulo: 'Presupuesto anual de contenidos',
    html: () => `
      <p class="tw-desc">Cuánto cuesta producir contenido para redes durante un año, según la cantidad de publicaciones y el tipo de piezas.</p>
      <div class="tw-form">
        <label>Publicaciones por mes
          <select id="prPosts"><option value="4">4 (una por semana)</option><option value="12" selected>12 (tres por semana)</option><option value="20">20 (cinco por semana)</option><option value="30">30 (casi todos los días)</option></select>
        </label>
        <label>Tipo de piezas
          <select id="prTipo"><option value="1">Imágenes con plantilla (gratis)</option><option value="2" selected>Imágenes generadas con IA</option><option value="3">Videos cortos (reels)</option></select>
        </label>
        <label>¿Necesitás también copy redactado?
          <select id="prCopy"><option value="0">No, escribo yo</option><option value="1" selected>Sí, que lo redacte la IA</option></select>
        </label>
        <label>Textos de seguridad /아요 al mes
          <select id="prExtra"><option value="0">No hace falta</option><option value="4" selected>4 piezas educating</option><option value="8">8 piezas</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="prIr">Calcular</button>
      <div id="prSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#prIr').addEventListener('click', () => {
        const posts = Number(root.querySelector('#prPosts').value);
        const tipo = Number(root.querySelector('#prTipo').value);
        const copy = root.querySelector('#prCopy').value === '1';
        const extra = Number(root.querySelector('#prExtra').value);

        const costoPieza = { 1: 0, 2: 1200, 3: 4500 }[tipo];
        const costoCopy = copy ? 800 : 0;
        const mensual = posts * (costoPieza + costoCopy) + extra * (costoPieza + costoCopy);
        const anual = mensual * 12;

        root.querySelector('#prSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${pesos(mensual)}</b><span>por mes</span></div>
            <div class="tw-metric"><b>${pesos(anual)}</b><span>por año</span></div>
          </div>
          <div class="tw-verdict ok"><b>Presupuesto de contenidos</b>
          <p>Con ${posts} piezas por mes${copy ? ' (imagen + copy redactado)' : ''} el costo mensual estimado es ${pesos(mensual)}. ${tipo === 1 ? 'Con plantillas locales el costo es solo de tu tiempo.' : tipo === 2 ? 'El precio depende del volumen de imágenes con IA que se generen.' : 'Los videos son la pieza más cara por unidad.'}</p></div>
          <p class="tw-hint">Este cálculo no incluye la publicación en sí ni la estrategia de contenidos. Es solo lo que cuesta producir las piezas.</p>`;
      });
    },
  };

  // ================================================================== GENERALES
  // 12) ROI de una inversión
  T.roi = {
    titulo: 'ROI de una inversión en tecnología',
    html: () => `
      <p class="tw-desc">Cuánto te devuelve (o te ahorra) una inversión como cámaras, un sistema de backup o una red nueva.</p>
      <div class="tw-form">
        <label>Tipo de inversión
          <select id="iTipo"><option value="1">Cámaras con IA</option><option value="2" selected>Sistema de backup</option><option value="3">Red / WiFi del local</option><option value="4">Renovación de equipos</option></select>
        </label>
        <label>Monto de la inversión
          <select id="iMonto"><option value="150000">$150.000</option><option value="400000" selected>$400.000</option><option value="800000">$800.000</option><option value="1500000">$1.500.000</option></select>
        </label>
        <label>¿Qué te genera enHelpers al mes?
          <select id="iBeneficio"><option value="0">Todavía no lo sé</option><option value="1" selected>Evito pérdidas (robo,Qk</option><option value="2">Ahorro tiempo (releases)</option><option value="3">Aumenta las ventas</option></select>
        </label>
        <label>Valor estimado del beneficio mensual
          <select id="iValor"><option value="0">No lo cuantifico todavía</option><option value="50000">$50.000</option><option value="150000" selected>$150.000</option><option value="400000">$400.000</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="iIr">Calcular ROI</button>
      <div id="iSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#iIr').addEventListener('click', () => {
        const tipo = Number(root.querySelector('#iTipo').value);
        const monto = Number(root.querySelector('#iMonto').value);
        const ben = Number(root.querySelector('#iBeneficio').value);
        const valor = Number(root.querySelector('#iValor').value);

        const nombres = ['', 'cámaras con IA', 'sistema de backup', 'red del local', 'renovación de equipos'];
        const tips = [
          '',
          'Las cámaras evitan robos yadministrativooficinadan evidencia real de lo que pasó. El beneficio suele medirse en lo que no pasó.',
          'El backup no genera ingresos: evita que un incidente se convierta en semanas de pérdida.',
          'Una red estable elimina las caídas del sistema y las ventas perdidas por lentitud.',
          'Equipos más rápidos reducen el tiempo de inactividad del personal y los errores de carga.',
        ];

        if (!valor) {
          root.querySelector('#iSalida').innerHTML = `
            <div class="tw-verdict warn"><b>Quantificá el beneficio para ver el ROI</b>
            <p>Un proyecto de ${pesos(monto)} en ${nombres[tipo]} se paga solo si te ahorra o te genera ${pesos(Math.round(monto / 6))} por mes. Para empezar, pensá cuántas horas de trabajo, cuántos pedidos perdidos o cuántascopiaID.</p></div>
            <p class="tw-hint">${tips[tipo]}</p>`;
          return;
        }

        const anual = valor * 12;
        const roi = Math.round(((anual - monto) / monto) * 100);
        const payback = Math.max(1, Math.ceil(monto / valor));
        const nivel = roi >= 200 ? 'ok' : roi >= 50 ? 'ok' : roi >= 0 ? 'warn' : 'err';

        root.querySelector('#iSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${roi}%</b><span>ROI en un año</span></div>
            <div class="tw-metric"><b>${payback} ${payback === 1 ? 'mes' : 'meses'}</b><span>se paga sola</span></div>
          </div>
          <div class="tw-verdict ${nivel}"><b>${roi >= 0 ? 'La inversión se recupera' : 'No se recupera con estos números'}</b>
          <p>Con un beneficio de ${pesos(valor)} por mes, la inversión de ${pesos(monto)} en ${nombres[tipo]} se paga sola en ${payback} ${payback === 1 ? 'mes' : 'meses'}. Al año, el retorno neto es de ${pesos(anual - monto)}.</p></div>
          <p class="tw-hint">${tips[tipo]} Cuidado: el beneficio suele medirse sobre lo que no pasó, así que conviene usar un valor conservador.</p>`;
      });
    },
  };

  // 13) Horas de soporte necesarias
  T.soporte = {
    titulo: '¿Cuántas horas de soporte necesita tu negocio?',
    html: () => `
      <p class="tw-desc">Estimá el tiempo que tu equipo (o vos) le dedica a resolver problemas técnicos al mes.</p>
      <div class="tw-form">
        <label>¿Cuántas personas usanComputadoras y equipos?
          <select id="soPersonas"><option value="1">1</option><option value="3" selected>3</option><option value="8">8</option><option value="15">15</option></select>
        </label>
        <label>¿Hay un sistema de gestión (facturación, stock, cuentas)?
          <select id="soSistema"><option value="0">No, uso planillas</option><option value="1" selected>Sí, uso un sistema</option></select>
        </label>
        <label>¿Cada cuánto hacen backup hoy?
          <select id="soBackup"><option value="1">Automático</option><option value="2" selected>A mano, de vez en cuando</option><option value="3">No hay backup</option></select>
        </label>
        <label>¿Cuántas personas saben manejar la información?
          <select id="soCapacitas"><option value="1">Todos</option><option value="2" selected>Solo una o dos</option><option value="3">Ninguno en detalle</option></select>
        </label>
      </div>
      <button class="btn btn-primary" id="soIr">Calcular</button>
      <div id="soSalida" class="tw-out"></div>`,
    init: (root) => {
      root.querySelector('#soIr').addEventListener('click', () => {
        const pers = Number(root.querySelector('#soPersonas').value);
        const sis = Number(root.querySelector('#soSistema').value);
        const bak = Number(root.querySelector('#soBackup').value);
        const cap = Number(root.querySelector('#soCapacitas').value);

        let horas = pers * 0.5; // base: consultas y temas menores
        if (sis === 1) horas += 1.5;
        if (bak === 2) horas += 1.2;
        if (bak === 3) horas += 2.5;
        if (cap === 2) horas += 1.5;
        if (cap === 3) horas += 3;
        const costo = horas * 8000;

        const nivel = horas >= 8 ? 'err' : horas >= 4 ? 'warn' : 'ok';
        const veredicto =
          horas >= 8
            ? 'El soporte técnico te está comiendo una jornada entera por mes. Eso es un costo oculto grande.'
            : horas >= 4
              ? 'Son varias horas al mes. Un mantenimiento preventivo y un backup bien armado lo bajan bastante.'
              : 'Carga de soporte manejable. Conviene igual tener a quién llamar cuando algo falla.';

        root.querySelector('#soSalida').innerHTML = `
          <div class="tw-metrics">
            <div class="tw-metric"><b>${horas.toFixed(1).replace('.', ',')} h</b><span>por mes</span></div>
            <div class="tw-metric"><b>${pesos(costo)}</b><span>en horas de trabajo</span></div>
          </div>
          <div class="tw-verdict ${nivel}"><b>${veredicto}</b>
          <p>${horas >= 4 ? 'Con un plan de mantenimiento y backups automáticos, normalmente se recupera la mitad de ese tiempo.' : 'Estás bien cubierto en el día a día. El salto de calidad viene de la red y las cámaras.'}</p></div>
          <p class="tw-hint">Cálculo orientativo based en ${pers} personas, ${sis ? 'un sistema de gestión' : 'solo planillas'}, ${bak === 3 ? 'sin backups' : bak === 2 ? 'backups manuales' : 'backups automáticos'} y ${cap === 3 ? 'nadie que entienda la información a fondo' : cap === 2 ? 'algunas personas capacitadas' : 'todos capacitados'}.</p>`;
      });
    },
  };

  console.log('[tools-extra] ' + Object.keys(T).length + ' herramientas cargadas');
})();
