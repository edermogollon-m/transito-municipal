# Tránsito Municipal

Sistema de Tránsito y Movilidad Municipal. HTML/CSS/JS puro (sin build) con
Supabase como backend, publicado en Vercel. Roles: **Director (admin)**,
**Supervisor** y **Operador (oficial)**.

## Páginas

- `login.html` — acceso del personal.
- `index.html` + `app.js` — panel: dashboard, infracciones, permisos de
  circulación, pagos/caja (corte de caja), padrón vehicular, grúa/corralón,
  accidentes viales, calendario, mapa de infracciones, rendimiento de
  oficiales, reportes (Excel), oficiales/bitácora de turno, configuración y
  usuarios. Búsqueda global con ⌘K y avisos en tiempo real.
- `consulta.html` — portal ciudadano: consulta de infracciones por placa,
  folio o nombre, sin iniciar sesión.
- `offline.html` — se muestra si la app se abre sin internet (PWA).

## Configuración

`config.js` tiene la URL y la llave pública (anon) del proyecto de Supabase
`transito-municipal`. Si la app muestra la franja roja "No hay conexión con
la base de datos" o el login dice "No se pudo conectar con el servidor",
revisa primero en el panel de Supabase que el proyecto no esté **pausado**
(en el plan gratis Supabase pausa los proyectos inactivos y solo permite 2
proyectos activos a la vez).

## Pruebas

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` revisa la sintaxis de los scripts y abre la app real en Chromium
con un Supabase simulado: inicia sesión, abre cada módulo del panel, busca en
el portal ciudadano y comprueba los avisos cuando no hay servidor. Falla ante
cualquier error de JavaScript. Corre en cada PR (`.github/workflows/ci.yml`).
