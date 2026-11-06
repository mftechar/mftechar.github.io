/* MF Tech AR — Chatbot de ayuda en la página
   Guía a los visitantes por el sitio, responde preguntas frecuentes
   y los conecta con WhatsApp para consultas personalizadas. */
(function () {
  'use strict';

  // Base de conocimiento del bot
  const KB = [
    {
      test: /venta|equipos|servidores|pc|notebooks|tablets|celulares|imprim/i,
      respuesta: 'En MF Tech vendemos servidores, PCs, notebooks, tablets, celulares y equipos de seguridad. Todos con garantía. ¿Te interesa algún equipo en particular?',
      quick: ['Ver tienda', 'Consultar por WhatsApp']
    },
    {
      test: /c[aá]maras|vigilancia|seguridad|monitoreo|ocultas|anti-espionaje|antiespionaje/i,
      respuesta: 'Instalamos cámaras de seguridad con IA, cámaras ocultas y equipos anti-espionaje (detectores de lentes y detectores RF) para hogares y empresas. ¿Querés un presupuesto?',
      quick: ['Ver servicios', 'Consultar por WhatsApp']
    },
    {
      test: /asistencia remota|soporte|ayuda|remoto|online/i,
      respuesta: 'La asistencia remota te permite resolver problemas sin que un técnico vaya a tu domicilio. Conectamos tu PC en minutos y solucionamos lo que necesites.',
      quick: ['Ver asistencia remota', 'Consultar por WhatsApp']
    },
    {
      test: /servidores|windows server|linux|cloud|aws|azure|configuraci[oó]n/i,
      respuesta: 'Configuramos servidores Windows Server y Linux, tanto on-premise como en la nube (AWS, Azure, Google Cloud). Incluye seguridad, backups y monitoreo.',
      quick: ['Ver configuración de servidores', 'Consultar por WhatsApp']
    },
    {
      test: /redes|wifi|routers|switch|cableado|access point/i,
      respuesta: 'Instalamos y configuramos redes cableadas e inalámbricas. Cobertura estable sin zonas muertas, con equipos de calidad.',
      quick: ['Ver redes y WiFi', 'Consultar por WhatsApp']
    },
    {
      test: /backup|copias|recuperaci[oó]n|datos|backup 3-2-1/i,
      respuesta: 'Implementamos la regla 3-2-1 de backups: 3 copias, 2 medios diferentes, 1 fuera del sitio. Tus datos siempre protegidos.',
      quick: ['Ver backups', 'Consultar por WhatsApp']
    },
    {
      test: /software|programa|sistema|aplicaci[oó]n|desarrollo|a medida/i,
      respuesta: 'Desarrollamos software a medida: aplicaciones web, sistemas de gestión y automatizaciones. También vendemos licencias de software.',
      quick: ['Ver creación de software', 'Consultar por WhatsApp']
    },
    {
      test: /precio|costo|presupuesto|cu[aá]nto|tarifa/i,
      respuesta: 'Los precios dependen de tu necesidad. Te pasamos un presupuesto sin cargo y sin compromiso. ¿Cuál es tu necesidad?',
      quick: ['Pedir presupuesto por WhatsApp']
    },
    {
      test: /contacto|whatsapp|tel[eé]fono|email|correo|escribir/i,
      respuesta: 'Podés contactarnos por WhatsApp al +54 9 2325 406322, por email a contacto@mftechar.com o desde acá mismo. ¿Qué necesitás?',
      quick: ['Escribir por WhatsApp']
    },
    {
      test: /servicios|qu[eé] hac[eé]is|qué hacés|opciones/i,
      respuesta: 'Ofrecemos: asistencia remota, instalación de software, cambio de hardware, configuración de servidores, análisis de seguridad de redes, análisis de información, asesoramiento tecnológico, venta de equipos, cámaras ocultas, equipos anti-espionaje, creación de software y venta de licencias. ¿Sobre cuál querés saber más?',
      quick: ['Ver servicios', 'Consultar por WhatsApp']
    },
    {
      test: /garant[ií]a|post|soporte/i,
      respuesta: 'Todos nuestros servicios incluyen garantía. El hardware tiene garantía del fabricante y la mano de obra tiene garantía de 30 días.',
      quick: ['Ver servicios', 'Consultar por WhatsApp']
    },
    {
      test: /horario|atienden|atienden?|atenci[oó]n/i,
      respuesta: 'Atendemos de lunes a sábado, de 08:00 a 18:00. También respondemos por WhatsApp fuera de horario.',
      quick: ['Escribir por WhatsApp']
    },
    {
      test: /donde|ubicaci[oó]n|donde est[aá]n|lujan|zona/i,
      respuesta: 'Tenemos base en Luján (Buenos Aires) y atendemos toda Argentina. Los servicios remotos llegan a cualquier lugar del país.',
      quick: ['Ver contacto']
    },
    {
      test: /tienda|comprar|precio|productos|equipos/i,
      respuesta: 'Visitá nuestra tienda online para ver los productos disponibles y consultas por WhatsApp.',
      quick: ['Ver tienda', 'Consultar por WhatsApp']
    }
  ];

  const DEFAULT_RESPONSE = 'Gracias por tu consulta. Para darte una respuesta precisa, escribinos por WhatsApp y un técnico te asesora sin cargo.';
  const WA_MESSAGE = 'Hola Martín! Te escribo desde la página y necesito ayuda.';

  // Crear el widget
  const floatBtn = document.createElement('button');
  floatBtn.id = 'chatbotFloat';
  floatBtn.setAttribute('aria-label', 'Abrir chat de ayuda');
  floatBtn.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.6-1.2A9 9 0 1 0 12 3Z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.8 8.6c.3-.7.6-.7 1-.7h.5c.2 0 .4.1.5.5l.6 1.4c.1.3 0 .5-.2.7l-.5.6c-.1.2-.2.4 0 .7.4.7 1.1 1.5 2.1 2 .3.2.5.1.7 0l.6-.6c.2-.3.4-.3.7-.2l1.4.6c.4.2.5.3.5.5 0 .9-.5 2-1.6 2.3-.7.2-1.6.2-2.9-.4a9 9 0 0 1-3.8-3.6c-.6-1.1-.7-2-.5-2.7Z" fill="#fff"/></svg>';

  const panel = document.createElement('div');
  panel.id = 'chatbotPanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Chat de ayuda');
  panel.innerHTML = `
    <div class="chatbot-header">
      <div class="chatbot-avatar">MF</div>
      <div>
        <div class="chatbot-title">MF Tech AR — Asistente</div>
        <div class="chatbot-status"><span class="dot"></span> En línea</div>
      </div>
      <button class="chatbot-close" aria-label="Cerrar chat">×</button>
    </div>
    <div class="chatbot-messages" id="chatbotMessages" aria-live="polite"></div>
    <div class="chatbot-quick" id="chatbotQuick"></div>
    <form class="chatbot-input" id="chatbotForm">
      <input type="text" id="chatbotInput" placeholder="Escribí tu pregunta..." autocomplete="off" aria-label="Escribí tu mensaje" />
      <button type="submit" aria-label="Enviar"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 12 21 3l-4 9 4 9L3 12Z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg></button>
    </form>
    <a class="chatbot-wa" href="https://wa.me/5492325406322?text=${encodeURIComponent(WA_MESSAGE)}" target="_blank" rel="noopener">Hablar con un humano por WhatsApp</a>
  `;

  document.body.appendChild(floatBtn);
  document.body.appendChild(panel);

  const style = document.createElement('style');
  style.textContent = `
    #chatbotFloat {
      position: fixed; bottom: 24px; right: 24px; z-index: 1000;
      width: 60px; height: 60px; border-radius: 50%;
      background: #25d366; border: none; cursor: pointer;
      box-shadow: 0 8px 24px rgba(37, 211, 102, .5);
      display: flex; align-items: center; justify-content: center;
      transition: transform .2s ease;
    }
    #chatbotFloat:hover { transform: scale(1.1); }
    #chatbotPanel {
      position: fixed; bottom: 100px; right: 24px; z-index: 1000;
      width: 360px; max-width: calc(100vw - 48px); height: 520px; max-height: calc(100vh - 140px);
      background: #fff; border-radius: 16px; overflow: hidden;
      box-shadow: 0 16px 48px rgba(0,0,0,.35);
      display: none; flex-direction: column;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      animation: chatIn .25s ease;
    }
    @keyframes chatIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    #chatbotPanel.open { display: flex; }
    .chatbot-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px; background: #0b2437; color: #fff;
    }
    .chatbot-avatar {
      width: 40px; height: 40px; border-radius: 50%;
      background: #25d366; color: #0b2437; font-weight: 800;
      display: flex; align-items: center; justify-content: center; font-size: 16px;
    }
    .chatbot-title { font-size: 14px; font-weight: 700; }
    .chatbot-status { font-size: 11px; color: #8ef0a8; margin-top: 2px; display: flex; align-items: center; gap: 4px; }
    .chatbot-status .dot { width: 7px; height: 7px; border-radius: 50%; background: #25d366; display: inline-block; }
    .chatbot-close {
      margin-left: auto; background: transparent; border: none; color: #fff;
      font-size: 28px; cursor: pointer; line-height: 1;
    }
    .chatbot-messages {
      flex: 1; overflow-y: auto; padding: 14px 14px 8px;
      background: #f4f6f8; display: flex; flex-direction: column; gap: 10px;
    }
    .chatbot-msg {
      max-width: 80%; padding: 9px 12px; border-radius: 14px;
      font-size: 13.5px; line-height: 1.45;
    }
    .chatbot-msg.user {
      align-self: flex-end; background: #0b2437; color: #fff;
      border-bottom-right-radius: 4px;
    }
    .chatbot-msg.bot {
      align-self: flex-start; background: #fff; color: #1e293b;
      border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,.08);
    }
    .chatbot-quick {
      display: flex; gap: 6px; flex-wrap: wrap;
      padding: 8px 12px; background: #f4f6f8; border-top: 1px solid #e2e8f0;
    }
    .chatbot-quick button {
      font-size: 11px; padding: 5px 10px; border-radius: 12px;
      border: 1px solid #0b2437; background: transparent; color: #0b2437;
      cursor: pointer; white-space: nowrap;
    }
    .chatbot-quick button:hover { background: #0b2437; color: #fff; }
    .chatbot-input {
      display: flex; gap: 8px; padding: 10px 12px;
      border-top: 1px solid #e2e8f0; background: #fff;
    }
    .chatbot-input input {
      flex: 1; border: 1px solid #e2e8f0; border-radius: 22px;
      padding: 10px 14px; font-size: 13px; outline: none;
    }
    .chatbot-input input:focus { border-color: #25d366; }
    .chatbot-input button {
      width: 42px; height: 42px; border-radius: 50%; border: none;
      background: #25d366; cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .chatbot-wa {
      display: block; text-align: center; padding: 8px;
      background: #25d366; color: #0b2437; font-size: 12px; font-weight: 700;
      text-decoration: none;
    }
    @media (max-width: 480px) {
      #chatbotPanel { width: calc(100vw - 24px); right: 12px; bottom: 88px; height: 70vh; }
      #chatbotFloat { bottom: 16px; right: 16px; }
    }
  `;
  document.head.appendChild(style);

  const messages = document.getElementById('chatbotMessages');
  const quick = document.getElementById('chatbotQuick');
  const input = document.getElementById('chatbotInput');
  const form = document.getElementById('chatbotForm');

  function addMessage(text, sender) {
    const div = document.createElement('div');
    div.className = 'chatbot-msg ' + sender;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function addQuick(items) {
    quick.innerHTML = '';
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item;
      btn.onclick = () => {
        if (item === 'Ver tienda') { location.href = 'store/index.html'; }
        else if (item === 'Ver servicios') { location.href = '#servicios'; }
        else if (item === 'Ver tienda') { location.href = 'store/index.html'; }
        else if (item === 'Ver contacto') { location.href = '#contacto'; }
        else if (item.startsWith('Ver ')) {
          location.href = '#servicios';
        }
        else if (item === 'Consultar por WhatsApp' || item === 'Escribir por WhatsApp' || item === 'Pedir presupuesto por WhatsApp') {
          window.open('https://wa.me/5492325406322?text=' + encodeURIComponent(WA_MESSAGE), '_blank', 'noopener');
        }
        else { handleQuery(item); }
      };
      quick.appendChild(btn);
    });
  }

  function handleQuery(text) {
    addMessage(text, 'user');
    const match = KB.find((k) => k.test.test(text));
    if (match) {
      addMessage(match.respuesta, 'bot');
      addQuick(match.quick);
    } else {
      addMessage(DEFAULT_RESPONSE, 'bot');
      addQuick(['Ver servicios', 'Consultar por WhatsApp']);
    }
  }

  floatBtn.onclick = () => {
    panel.classList.add('open');
    floatBtn.style.display = 'none';
    if (messages.children.length === 0) {
      addMessage('¡Hola! 👋 Soy el asistente de MF Tech. Puedo ayudarte con información sobre nuestros servicios, productos y contacto. ¿Qué necesitás?', 'bot');
      addQuick(['Ver servicios', 'Ver tienda', 'Contacto']);
    }
    input.focus();
  };

  panel.querySelector('.chatbot-close').onclick = () => {
    panel.classList.remove('open');
    floatBtn.style.display = 'flex';
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    handleQuery(text);
  };
})();
