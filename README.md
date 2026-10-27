# MF Tech AR — sitio web

Sitio estático (HTML + CSS + JS, sin dependencias ni build) para **MF Tech AR**.
Identidad aurora (turquesa `#40e0d0` + violeta `#7a5cff`) sobre azul profundo.

## Contenido

- **Servicios**: cámaras de seguridad con IA, mantenimiento y reparación de PC,
  backups y recuperación de datos, redes y WiFi, ciberseguridad y automatización con IA.
- **Herramientas**: 19 calculadoras y diagnósticos gratuitos que funcionan en el navegador
  (test de velocidad, calculadora de cámaras, diagnóstico de seguridad, backup 3-2-1,
  generador de contraseñas, ROI, phishing, cableado, access points, etc.).
- **Reseñas**: 70 opiniones de clientes con promedio 4,8 estrellas, filtrables por servicio.
- **Blog / Guías**: 10 artículos optimizados para SEO con JSON-LD (Article, FAQPage, Breadcrumb).
- **Cómo trabajamos**: consulta → diagnóstico/presupuesto → implementación → seguimiento.
- **Gamers**: nueva sección con herramientas para videojuegos. Arranca con
  **WhiteOut Survival — WoS Tools**: 13 herramientas gratis en el navegador (mejoras, tropas,
  formación de marcha, equipamiento y charms, mascotas y expertos, formaciones de héroes,
  puntos de evento, tienda/packs/VIP, simulador de tiradas, perfiles de personaje, Ministerio,
  Territory Planner y **Gift Codes para alianzas**), todas gratuitas y sin planes.
  Los datos se guardan en `localStorage` y se exportan a CSV. Gift Codes además canjea
  códigos de regalo a la vez para hasta 100 IDs de la alianza a través de un puente propio
  (Cloudflare Worker incluido) — no está afiliado a Century Games.
- **Nosotros**: Martín Flores, fundador.
- **Redes**: Facebook, Instagram, WhatsApp, X, YouTube, GitHub y Reddit (`@mftechar`).
- **Contacto**: WhatsApp `+54 9 2325-406322` con mensaje precargado y `tel:`.
- SEO: metadatos, Open Graph, JSON-LD `ProfessionalService` + `aggregateRating`, sitemap y robots.

## Estructura

```
mftech-web/
├─ index.html               # sitio principal
├─ CNAME                    # www.mftechar.com (para GitHub Pages)
├─ robots.txt
├─ sitemap.xml              # home, /store/, /gamers/, /blog/ y los 10 artículos
├─ store/                   # MF Tech Store (catálogo, vive dentro del mismo sitio)
│  ├─ index.html
│  ├─ assets/style.css
│  ├─ assets/app.js
│  ├─ img/logo.jpg
│  └─ media/*.mp4
├─ gamers/                  # sección Gamers
│  ├─ index.html            # hub de juegos
│  └─ wos/
│     ├─ index.html         # hub de WoS Tools
│     ├─ gift-codes.html    # Gift Codes para alianzas
│     ├─ giftcodes.config.json  # IDs/región para el canje automático en GitHub
│     ├─ data/
│     │  ├─ giftcodes.json  # códigos activos (los actualiza GitHub Actions)
│     │  └─ auto-state.json # progreso de canjes (lo genera GitHub Actions)
│     ├─ giftcode-bridge/   # puente de canje opcional (Cloudflare Worker)
│     │  └─ worker.js
│     ├─ upgrades.html      # calculadora de mejoras
│     ├─ troops.html        # entrenamiento de tropas
│     ├─ march.html         # formación de marcha
│     ├─ gear.html          # equipamiento y charms
│     ├─ pets.html          # mascotas y expertos
│     ├─ heroes.html        # formación de héroes
│     ├─ events.html        # puntos de evento
│     ├─ shops.html         # tienda, packs y VIP
│     ├─ simulators.html    # simulador de tiradas
│     ├─ profiles.html      # perfiles de personaje (10)
│     ├─ ministry.html      # registro del Ministerio (10)
│     ├─ territory.html     # Territory Planner (10 layouts)
│     ├─ wos-tools.css      # estilos de la app de herramientas
│     ├─ wos-app.js         # motor de las herramientas de cálculo
│     └─ wos-giftcodes.js   # motor de Gift Codes (perfil + canje en lote)
├─ assets/
│  ├─ style.css             # diseño base, responsive
│  ├─ tools.css             # tarjetas de herramientas y modal
│  ├─ blog.css              # estilos de guías y artículos
│  ├─ app.js                # menú móvil, scroll, reveal, botón flotante
│  ├─ tools.js              # motor de las primeras 6 herramientas
│  ├─ tools-extra.js        # las 13 herramientas restantes
│  ├─ reviews.js            # motor de la sección de reseñas
│  ├─ logo.svg              # logo / favicon
│  ├─ og-image.jpg          # portada 1200×630 para redes
│  ├─ og-image.png
│  └─ og-image.svg
├─ data/
│  └─ reviews.js            # las 70 reseñas (reemplazables por reales)
├─ blog/
│  ├─ index.html            # hub de guías
│  └─ (10 artículos .html)
├─ server-local.js          # servidor de previsualización local (+ puente de canje)
├─ scripts/
│  └─ wos-giftcodes-auto.mjs # tarea de GitHub Actions: códigos + canje diario
├─ .github/
│  └─ workflows/
│     └─ wos-giftcodes.yml  # cron 6 veces al día
└─ README.md
```

## Ver el sitio

```bash
node server-local.js     # http://localhost:8123
```

## Canje de Gift Codes (puente)

La herramienta `gamers/wos/gift-codes.html` canjea códigos de regalo para hasta
100 IDs de la alianza usando la API oficial del juego
(`wos-giftcode-api.centurygame.com`). El navegador no puede llamarla directo
(rechaza orígenes externos), así que se necesita un puente:

- **Local / prueba**: `node server-local.js` y dejar la URL del puente como
  `/api/giftcode` (valor por defecto). Endpoints: `GET /api/giftcode/health`
  y `POST /api/giftcode/redeem`.
- **Sitio publicado**: desplegar `gamers/wos/giftcode-bridge/worker.js` como
  Cloudflare Worker (pegar y Deploy) y poner `https://tu-worker.workers.dev`
  en la herramienta → Conexión de canje.

El puente firma cada solicitud (MD5 + salt público, igual que la web oficial),
valida ID/código/región, limita ~140 solicitudes por minuto y no guarda datos.
La clave del perfil del líder queda solo en el navegador (PBKDF2-SHA256).

### Códigos activos y canje automático (sin servidor)

La API oficial no expone la lista de códigos: la herramienta lee el feed
público y la tabla de `wosgiftcodes.com` (códigos anunciados en Discord y redes
oficiales).

La automatización vive en GitHub, sin Worker ni servidores:

- `.github/workflows/wos-giftcodes.yml` corre **6 veces al día**
  (`0 0,4,8,12,16,20 * * *`) y también a mano desde la pestaña Actions.
- `scripts/wos-giftcodes-auto.mjs` busca los códigos y actualiza
  `gamers/wos/data/giftcodes.json` (lo que lee la página).
- Si `gamers/wos/giftcodes.config.json` tiene `enabled`, `region` e `ids`,
  canjea los códigos nuevos para esos IDs y guarda el progreso en
  `gamers/wos/data/auto-state.json`. Los IDs se pueden descargar desde la
  propia herramienta con “Descargar config para GitHub”.

Requisitos una sola vez: *Settings → Actions → General → Workflow permissions →
Read and write permissions* (para que el bot pueda commitear el progreso).

El Worker (`giftcode-bridge/worker.js`) sigue siendo opcional: solo hace falta
si querés canjear al instante desde el botón “Canjear” del navegador o si
preferís el cron de Cloudflare en lugar del de GitHub.

## Publicar (GitHub Pages)

1. Crear el repositorio `mftechar/mftechar.github.io` y subir el contenido.
2. *Settings → Pages* → `Deploy from a branch` → `main` → `/ (root)`.
3. El archivo `CNAME` ya apunta a `www.mftechar.com`.

Para el dominio propio en IONOS, apuntar los registros DNS del dominio raíz
(`@`) a las IPs de GitHub Pages (`185.199.108-111.153` + IPv6 `2606:50c0:8000-8003::153`).
El `CNAME www → mftechar.github.io` ya está configurado.

## Notas

- Todos los enlaces externos usan `rel="noopener"`.
- El sitio funciona offline salvo los enlaces a redes y el test de velocidad.
- Las reseñas y las guías se editan en `data/reviews.js` y en los `.html` de `blog/`.
- Si cambia el número o los usuarios, actualizar `index.html` y el JSON-LD del `<head>`.
