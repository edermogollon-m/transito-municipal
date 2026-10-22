# Tránsito Municipal

Sistema de Tránsito y Movilidad Municipal. HTML/CSS/JS puro (sin build) con
Supabase como backend, publicado en Vercel. Roles: **Director (admin)**,
**Supervisor** y **Operador (oficial)**.

## Páginas

- `login.html` — acceso del personal.
- `index.html` + `js/*.js` — panel (un archivo por módulo, ver `js/README.md`): dashboard, infracciones, permisos de
  circulación, pagos/caja (corte de caja), padrón vehicular, grúa/corralón,
  accidentes viales, calendario, mapa de infracciones, rendimiento de
  oficiales, reportes (Excel), oficiales/bitácora de turno, bitácora de
  auditoría, configuración y usuarios. Búsqueda global con ⌘K y avisos en
  tiempo real.
- `consulta.html` — portal ciudadano: consulta de infracciones por placa o
  folio exactos, sin iniciar sesión.
- `verificar.html` — página pública a la que apunta el QR de boletas, tickets,
  recibos, constancias y credenciales del personal: confirma que el documento es auténtico y muestra su estado actual.
- `offline.html` — se muestra si la app se abre sin internet (PWA).

## Configuración

`config.js` tiene la URL y la llave pública (anon) del proyecto de Supabase
`transito-municipal`. Si la app muestra la franja roja "No hay conexión con
la base de datos" o el login dice "No se pudo conectar con el servidor",
revisa primero en el panel de Supabase que el proyecto no esté **pausado**
(el workflow `supabase-keepalive.yml` lo consulta cada 3 días para evitarlo)
(en el plan gratis Supabase pausa los proyectos inactivos y solo permite 2
proyectos activos a la vez).

## Base de datos

- `schema.sql` — esquema completo (tablas, folios automáticos, vencimiento,
  tiempo real y políticas). Sirve para recrear la base en un proyecto nuevo.
- `security_auth.sql` — login con Supabase Auth y permisos por rol (RLS).
  Crea una cuenta de Auth por cada usuario (`<usuario>@transito.local`) con
  su misma contraseña, elimina las contraseñas en texto plano y reemplaza las
  políticas abiertas. Correr **después** de `schema.sql`. Es idempotente.
  Ya está aplicado en el proyecto `transito-municipal`.
- `auditoria.sql` — bitácora: triggers que registran cada alta, cambio o baja
  (quién, cuándo, campo por campo) en `auditoria`. Solo admin y supervisor la
  leen; nadie puede editarla. La app ya no la muestra (se quitó la pantalla
  Bitácora); se consulta directo en la base si hace falta.
- `evidencias_storage.sql` — bucket privado `evidencias` en Supabase Storage.
  Las fotos ya no se guardan dentro de la base: la columna `fotos` guarda las
  rutas y la app muestra enlaces firmados de 1 hora.
- `verificacion.sql` — token aleatorio por infracción y por pago, y la función
  pública `verificar_documento(token)` que usa `verificar.html`.
- `cobros.sql` — `registrar_pago()`: cobra y marca la infracción como pagada
  en una sola operación, con descuento y cajero decididos por el servidor; un
  solo pago por infracción. Reglas de estado (pagada solo con cobro, cancelar
  solo mandos y con motivo). Infracciones y pagos ya no se borran.
  Vencimiento diario con pg_cron según los días límite de Configuración, y
  `parametros_pago()` para el portal ciudadano.

- `articulos.sql` — fundamento legal: catálogo con las 224 infracciones del
  tabulador del Reglamento de Movilidad, Tránsito y Seguridad Vial de San
  Pedro Garza García (POE 27-dic-2021, última reforma POE 11-feb-2026):
  texto, artículo, fracción, inciso, sanción en cuotas UMA y si es grave
  (art. 192, sin descuento). Cada infracción guarda el fundamento impreso y su
  monto debe caer en el rango del tabulador (cuotas × UMA de Configuración).

- `veracruz.sql` — **reglamento vigente**: Reglamento de la Ley Número 561 de
  Tránsito y Seguridad Vial para el Estado de Veracruz (municipio de
  Misantla). 357 infracciones del tabulador 2026 de la Dirección General de
  Tránsito (artículos, clasificación leve/grave/muy grave, UMA y UMA con
  agravante) y el texto de los 383 artículos del Reglamento (compilación
  CNDH, última reforma 1-may-2020). Descuentos del art. 330: 75% en 5 días,
  50% del 6.º al 10.º; sin descuento al conducir en estado de ebriedad. El
  catálogo de San Pedro (`articulos.sql`) queda inactivo como historial.

- `boleta.sql` — boleta conforme a los arts. 327, 328 y 331 del Reglamento
  de Veracruz: domicilio, correo y tipo de licencia del infractor (o la
  constancia de que no los proporcionó), número de placa y adscripción del
  policía vial, varias infracciones del mismo conductor en una sola boleta
  (con la de mayor cuantía), circunstancias agravantes y atenuantes (con
  agravante se cobra la UMA "con agravante" del tabulador; el monto lo
  calcula el servidor) y la leyenda del recurso de revocación.
- `limpieza.sql` — opcional, a mano: borra permisos y funciones que quedaron
  sin uso.

- `roles.sql` — roles y separación de funciones: Director (todo), Supervisor
  (operación, estados, cancelaciones, impugnaciones, permisos, bitácora; no
  cobra), Policía vial (levanta infracciones, grúa, accidentes y padrón; no
  cobra ni cambia estados) y Caja · Tesorería (cobra, corte de caja y
  liberación del corralón; no levanta infracciones). Quien levanta la multa
  no la cobra. Siempre queda al menos un administrador activo.

- `tramites.sql` — retención de documentos (arts. 343-344) con devolución
  firmada; recurso de revocación con expediente, plazo de 15 días hábiles y
  resolución escrita; avisos automáticos al ciudadano por correo y WhatsApp
  (función `avisos`, cada 15 minutos); pago en línea con Mercado Pago
  (función `pago-mp`); firmas del infractor y del policía vial en la boleta.
  Funciones en `supabase/functions/`. Secretos: `RESEND_API_KEY`,
  `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_PLANTILLA`,
  `MP_ACCESS_TOKEN` y, opcional, `MP_WEBHOOK_SECRET`. Se activan en
  Configuración.

- `institucional.sql` — credencial del oficial con foto y QR verificable
  (`/verificar?o=…`, función pública `verificar_oficial`; "Reponer
  credencial" invalida el QR anterior), placas reportadas
  (`vehiculos_reportados`: robo, orden de retención, búsqueda) que alertan al
  oficial a pantalla completa y avisan a los mandos en tiempo real
  (`alertas_placa`), e imagen institucional en Configuración (escudo, logo,
  nombre y color del Ayuntamiento en documentos impresos y en el portal).
  Correr después de `mejoras2.sql`.

- `repuve.sql` — botón "Consultar en REPUVE" en la boleta: copia la placa y
  abre la consulta pública (`configuracion.repuve_url`, editable en
  Configuración). Si sale con reporte de robo, el oficial la registra con un
  toque (`reportar_robo_repuve`) y queda como placa reportada para todos,
  con su alerta y aviso a los mandos. No hay conexión automática: REPUVE no
  tiene servicio público y su consulta pide captcha. Correr después de
  `institucional.sql`.

Orden para una base nueva: `schema.sql` → `security_auth.sql` →
`auditoria.sql` → `evidencias_storage.sql` → `verificacion.sql` →
`cobros.sql` → `articulos.sql` → `veracruz.sql` → `boleta.sql` → `inmutable.sql` → `roles.sql`. Todos son idempotentes y ya están aplicados en
`transito-municipal`.

## Seguridad

- **Login:** Supabase Auth. En pantalla se escribe solo el usuario (`admin`);
  por dentro es `admin@transito.local`. Las contraseñas solo existen como hash
  bcrypt en `auth.users`.
- **Permisos (RLS):** sin sesión no se puede leer ni escribir nada. El personal
  activo opera infracciones, permisos, padrón, grúa, accidentes, turnos y
  pagos. Borrar registros: admin y supervisor. Configuración, gestión de
  usuarios (`admin_guardar_usuario`) y corrección de pagos: solo admin. Un
  usuario desactivado pierde el acceso aunque tenga la sesión abierta.
- **Portal ciudadano:** solo puede llamar a `consulta_ciudadana(placa o folio)`;
  no tiene acceso directo a ninguna tabla.
- El rol que guarda el navegador (`tm_session`) solo decide qué se muestra;
  quien aplica los permisos es la base de datos.
- Recomendado: en Supabase → Authentication desactivar "Allow new users to
  sign up" y activar la protección de contraseñas filtradas.

## Pruebas

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` revisa la sintaxis de los scripts y abre la app real en Chromium
con un Supabase simulado: inicia sesión, abre cada módulo del panel, busca en
el portal ciudadano y comprueba los avisos cuando no hay servidor. Falla ante
cualquier error de JavaScript. `test/db/run.sh` aplica `schema.sql` y
los demás archivos SQL en un Postgres limpio y prueba folios, migración de
contraseñas, permisos por rol, bitácora, Storage y verificación.
Ambos corren en cada PR (`.github/workflows/ci.yml`).
