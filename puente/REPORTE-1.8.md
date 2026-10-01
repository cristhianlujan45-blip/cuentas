# Vento 1.8: revisión completa

Cambios: Laya como única IA, facturas con IVA y cantidades bien calculadas, pedidos por QR confiables, pantalla de preparación configurable, música automática y logo nuevo.

## Causas reales encontradas y corregidas

**1. Pedidos que "se iban a otro lugar".**
- Los pedidos del QR no entraban a la mesa: quedaban en una lista "por despachar" que solo se veía en la pantalla de Cocina. En los negocios sin Cocina (tiendas, por ejemplo) nunca aparecían.
- Si la mesa del QR no existía en la app, el pedido se botaba en silencio.
- Si fallaba el envío, se mandaba al cliente a WhatsApp.
- No había ID, así que un reintento o un doble toque podía duplicar el pedido.

**2. Facturas: el total del renglón se guardaba como precio de una unidad.**
- Lo que devolvía la IA se usaba sin comprobarlo.
- En la revisión, el "precio sin IVA por caja" se llenaba con el costo de una sola unidad, y por eso el "Total de la compra" mostraba el precio de una unidad.
- No se separaba el IVA por unidad.

**3. La IA anterior que el dueño pidió eliminar.** Era un módulo aparte con su propio panel, sus avisos, su prompt y su variable global. Se eliminó por completo y la búsqueda de su nombre en todo el repositorio da 0 resultados. El registro de mesas unificadas que ese módulo guardaba quedó en `registrarUnificacion` y se ve en Ajustes → Laya IA.

## Archivos

| Archivo | Cambio |
|---|---|
| `index.html` | modificado (todo lo de abajo) |
| `pedido.html` | modificado: pedidos y canciones como JSON con ID único, bandeja de salida con reintento, estado del pedido en vivo, sin redirigir a otra app |
| `preparacion.html` | nuevo: pantalla de preparación para una tablet o TV |
| `tv.html` | modificado: ícono |
| `mesero.html`, `licencias.html` | modificados: ícono |
| `icons/` | nuevo: ícono y logo de Vento |
| `README.md` | reescrito con la arquitectura real |
| `puente/laya-worker.js`, `puente/REPORTE-1.7.md` | sin referencias a la IA anterior |
| `version.txt` | `2026-10-01 · v1.8` |

## Funciones nuevas y reescritas

**Laya**
- `window.Laya` con `responder`, `ejecutar`, `informe`, `duplicados`, `cambiosPrecio`, `proveedores`, `resumenCompras` y `revisar` (los avisos).
- La conversación pasa primero por Laya (`asisAsk`). También se le habla por el micrófono diciendo "Laya, …".

**Facturas**
- `fiCuadrar`: calcula cajas × unidades, el costo por unidad sin IVA, el IVA por unidad y el costo con IVA, y detecta el IVA sumado dos veces.
- `fiDesgloseHtml`: muestra el desglose en cada renglón de la revisión.
- Antes de guardar, se confirma cualquier problema encontrado.

**Pedidos**
- `pedidoEntrante`, `pedidoCambiar`, `pedidoAplicar`, `pedidoPublicar` y `asegurarMesa`, expuestas como `window.vitoPedidos`.

**Pantalla de preparación**
- Activación y nombre: `prepNombre` y `prepOn`.
- Canal hacia la otra pantalla: `prepPublicar` y `procesarPrep`.
- Ajustes: `iniPrep`. La pantalla se dibuja con `renderCocina`, reescrita por estados.

**Música**
- Modo automático con un solo toque inicial: `mzAutoPintar` y `gestoUsuario`.
- Estado de error, sin duplicados (`reqId`), `window.vitoMusica` para Laya, `abrirYTMusicIOS`.

**Logo**
- Pantalla de apertura animada que se queda hasta que la app carga, ícono, manifest y nombre "Vento".

## APIs y servicios

| Servicio | Para qué |
|---|---|
| ntfy.sh | Pedidos, canciones, estados de vuelta al cliente, preparación, meseros y TV |
| YouTube IFrame Player API (oficial) | Reproducción y tiempo real |
| YouTube Data API v3 | Búsqueda de canciones |
| Intent de Android y esquema/enlace web de YouTube Music | Abrir la app con alternativa web |
| IA de lenguaje y visión que el dueño configure (Gemini) | Leer fotos de facturas y preguntas libres |
| Tesseract.js y pdf.js | Lectura sin internet |
| Motor de decisiones Laya (opcional, vía Worker) | Desempatar productos parecidos |

## Variables de entorno (solo en el Worker de Laya)

- `LAYA_URL`
- `LAYA_API_KEY` (como secreto)
- `ALLOWED_ORIGINS`

## Pruebas hechas (Playwright)

**Facturas**
- Total de $119.000 tomado como precio unitario: queda en $4.958,33 por unidad ($4.166,67 + $791,67 de IVA).
- 5 cajas × 24 = 120 unidades.
- IVA separado, IVA incluido, IVA sumado dos veces, descuento, producto único, docena y renglón que no cuadra (queda marcado).
- Factura con dos productos: subtotal $200.000 + IVA $38.000 = total $238.000.
- Fotos reales de Distrimarcas y Super Ricas.

**Pedidos**
- Recorrido: QR impreso → Netlify → GitHub → pedido.html → app principal.
- Una mesa que no existía se creó sola, el inventario se descontó y un reintento no duplicó el pedido.
- La Barra cambió los estados y el cliente vio "Listo".

**Preparación**
- Activada y desactivada; nombres Cocina, Barra y "Zona de Producción".
- El pedido llegó a la otra pantalla y Laya usó el nombre configurado.

**Música**
- Sin música, la canción pedida suena sola; con música, las nuevas esperan en cola.
- Al terminar una, pasa a la siguiente; con la cola vacía, queda esperando la próxima.
- Un doble toque no duplica la canción.

**Laya**
- 21 preguntas reales respondidas con datos (factura, IVA, agotados, duplicados, mesa 4, pendientes, precios que subieron, barra, proveedor, último precio, informes).
- Une duplicados después de pedir confirmación y marca pedidos como listos.

**Regresión**
- 33 pruebas anteriores (pantallas en celular, tableta y computador, voz, contabilidad, libreta, pagos, tipos de negocio, guía, e2e…): sin errores de consola.

## Limitaciones honestas

- **Laya no es un modelo de lenguaje.** El motor de decisiones Laya de GitHub solo elige entre opciones. Leer fotos y responder preguntas libres usa la IA de visión y lenguaje que el negocio conecte. Todo lo que es dato del negocio (IVA, costos, pedidos, inventario, música, preparación) lo responde el motor local de Laya, sin internet.
- **Laya no busca en internet.** No se agregó búsqueda externa: no hay un servicio de búsqueda configurado sin exponer claves.
- **El navegador exige un toque inicial para el sonido.** Se pide una sola vez ("Música automática" o "Empezar música" en el TV).
- **YouTube Music no informa el avance.** En la app externa el cambio de canción es por cronómetro. En el TV y en el reproductor de la app es real.
- **Sin servidor propio.** Los pedidos viajan por ntfy, que los guarda 12 horas, y cada pedido queda en los datos del negocio con sus respaldos. Para guardarlos en la nube de forma permanente haría falta un servidor propio.
- **`puente/youtube-tv-worker.js` usa un sistema no documentado de YouTube** ("Vincular con código de TV"). Se dejó como estaba porque es una función existente; se puede quitar si se quiere usar solo lo oficial.
