# Módulos de la app

`index.html` carga estos archivos **en este orden** como scripts clásicos:
comparten el mismo ámbito global, así que una función de un módulo se puede
llamar desde otro. Lo que corre al cargar (fuera de funciones) solo puede usar
lo definido en su propio archivo o en uno anterior; `arranque.js` va al final y
es el que arranca la app.

| Archivo | Contenido |
| --- | --- |
| `nucleo.js` | Sesión, permisos por rol, utilidades, navegación, fotos y geolocalización |
| `panel.js` | Panel general |
| `infracciones.js` | Infracciones: alta, boletas sin señal, catálogo del reglamento, firmas, conductor, circunstancias |
| `permisos.js` | Permisos de circulación |
| `detalle.js` | Detalle de infracciones y permisos |
| `configuracion.js` | Configuración y respaldos |
| `impresion.js` | Boleta carta, QR de verificación, parte de accidente y permiso impreso |
| `placa.js` | Vencimientos, lectura de placa e historial por placa |
| `caja.js` | Pagos / Caja, anulaciones y corte formal |
| `qr-scanner.js` | Escáner de QR |
| `usuarios.js` | Oficiales y usuarios |
| `ticket.js` | Ticket 80 mm e impresión en campo (Bluetooth / RawBT) |
| `reportes.js` | Reportes (mensual y para Cabildo) |
| `recursos.js` | Recurso de revocación y devolución de documentos |
| `utilidades.js` | Corte de caja impreso, Excel, modales, paginación, WhatsApp |
| `sesion.js` | Errores de la app, avisos, menú lateral, contraseña e inactividad |
| `padron.js` | Padrón vehicular |
| `grua.js` | Grúa / corralón |
| `mapa.js` | Mapa de infracciones y zonas conflictivas |
| `analisis.js` | Rendimiento, búsqueda global y calendario |
| `accidentes.js` | Accidentes viales |
| `turnos.js` | Bitácora de turno |
| `extras.js` | Notificaciones push |
| `institucional.js` | Imagen institucional (escudo, logo y color en documentos impresos) y credencial del oficial con QR verificable |
| `alertas.js` | Placas reportadas y alertas a pantalla completa al capturar una placa |
| `arranque.js` | Arranque de la app y guardas de permisos (va al final) |

`marca.js` (en la raíz) lo comparten el panel, el login y las páginas públicas:
pinta el escudo, el nombre y el color del Ayuntamiento.

Al agregar un módulo: súmalo a `index.html` (en orden) y a `PRECACHE` en
`service-worker.js`.
