# MF Tech AR — sitio web

Sitio estático (HTML + CSS + JS, sin dependencias ni build) para **MF Tech AR**.
Identidad aurora (turquesa `#40e0d0` + violeta `#7a5cff`) sobre azul profundo.

## Contenido

- **Servicios**: cámaras de seguridad con IA, mantenimiento y reparación de PC,
  backups y recuperación de datos, redes y WiFi, ciberseguridad y automatización con IA.
- **Cómo trabajamos**: consulta → diagnóstico/presupuesto → implementación → seguimiento.
- **Nosotros**: Martín Flores, fundador.
- **Redes**: Facebook, Instagram, WhatsApp, X, YouTube, GitHub y Reddit (`@mftechar`).
- **Contacto**: WhatsApp `+54 9 2325-406322` con mensaje precargado y `tel:`.
- SEO: metadatos, Open Graph, JSON-LD `ProfessionalService` y `sameAs` a las redes.

## Ver el sitio

Abrir `index.html` en el navegador. También se puede servir localmente:

```bash
npx serve .
```

## Archivos

```
mftech-web/
├─ index.html          # contenido y estructura
├─ robots.txt
├─ sitemap.xml
├─ assets/
│  ├─ style.css        # diseño responsive + animaciones
│  ├─ app.js           # menú móvil, scroll, año, reveal
│  ├─ logo.svg         # logo / favicon
│  ├─ og-image.svg     # fuente de la portada
│  └─ og-image.jpg     # portada para redes (1200×630, la que se comparte)
└─ README.md
```

El botón flotante de WhatsApp aparece al bajar en mobile. El resto de los CTA
(incluido el mensaje precargado) funciona en cualquier tamaño de pantalla.

## Publicar

**GitHub Pages** (gratis, con HTTPS):

1. Crear el repositorio `mftechar/mftech-web` y subir el contenido de esta carpeta.
2. En *Settings → Pages* elegir `Deploy from a branch` → `main` → `/ (root)`.
3. Para usar el dominio `mftechar.com`: agregar un archivo `CNAME` con `mftechar.com`
   y configurar en el DNS un registro `A` a las IPs de GitHub Pages
   (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`)
   y un `CNAME` para `www` apuntando a `mftechar.github.io`.

Alternativas: Netlify o Cloudflare Pages (arrastrar la carpeta, sin configuración).

## Notas

- Todos los enlaces externos usan `rel="noopener"`.
- El sitio funciona offline salvo los enlaces a redes.
- Si cambia el número o los usuarios, actualizar `index.html` y el JSON-LD del `<head>`.
