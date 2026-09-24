# Mesora — Cuentas de mesa, pedidos por QR y márgenes de precio (offline)

Dos páginas independientes, sin backend ni instalación: cada una es un solo
archivo HTML que corre entero en el navegador (los datos quedan en
`localStorage` del propio dispositivo).

## `index.html` — la app del negocio (dueño/mesero)

Mesas, productos, pedidos por QR, inventario, estadísticas, carta pública y
una calculadora de costo/margen/precio de venta por unidad en
**Inventario → Costos y márgenes**.

El costo de cada producto se puede cargar escaneando una **factura de
proveedor** o una **etiqueta de precio**, de dos formas:

- **Con IA** (necesita internet): identifica productos, cantidades y precios
  automáticamente, incluso en facturas con nombres abreviados o en clave.
- **Sin internet**: lee el texto de la foto o del PDF con un motor de OCR
  ([Tesseract.js](https://github.com/naptha/tesseract.js)) y un lector de PDF
  ([pdf.js](https://mozilla.github.io/pdf.js/)) embebidos en el propio
  archivo — funciona sin conexión, incluso abriendo `index.html` directo
  desde el disco.

En ambos casos siempre se abre una pantalla de revisión para corregir
cualquier dato antes de guardar.

### Novedades

- **Mesi (IA) más rápida**: las preguntas simples (ventas, mesas, deudas,
  precios, stock) se responden al instante sin IA; las demás se muestran en
  vivo mientras la IA escribe (la primera frase sale en ~1 segundo) y nunca
  se espera más de 8 segundos: si la IA no alcanza, Mesi responde con lo básico.
- **Saludo de bienvenida** cada vez que se abre Mesi, con un resumen del día.
- **Transmitir al TV con YouTube** (Música → 📺 Transmitir al TV): abre
  directamente la app de YouTube (nunca el navegador) con la lista de canciones
  pedidas. Ahí el botón de transmitir busca los TV del mismo wifi. Con Google
  conectado, las canciones nuevas se agregan solas a la lista en vivo.
- **Fotos de productos** (Productos → Editar → 📷 Agregar foto): el fondo se
  vuelve blanco automáticamente y la foto sale en la carta de `pedido.html`.
  Las fotos se guardan en el propio dispositivo (IndexedDB).
- **Autorreparación**: la app registra cada error con un código (ej. `E-1A2B`).
  Mesi lo detecta, corrige lo que se puede (datos dañados, memoria llena,
  pantallas trabadas, conexión de YouTube vencida) y explica el resto. Basta
  con decirle "arregla los errores".

## `pedido.html` — la página que ve el cliente

Se abre al escanear el QR de la mesa. Muestra la carta, deja armar el pedido
y llamar al mesero, sincronizado en vivo con `index.html`. Hay que subir
ambos archivos al mismo lugar (el mismo hosting) y configurar en
**Ajustes → Carta / QR** el link donde quedó `pedido.html`.

## Uso

Subí los dos archivos a cualquier hosting estático (o abrí `index.html`
directo en el navegador del celular o la compu para llevar solo las cuentas,
sin la parte de pedidos por QR). No hace falta backend ni base de datos.
