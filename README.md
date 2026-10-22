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
├─ sitemap.xml              # incluye el home, /blog/ y los 10 artículos
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
├─ server-local.js          # servidor de previsualización local
└─ README.md
```

## Ver el sitio

```bash
node server-local.js     # http://localhost:8123
```

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
