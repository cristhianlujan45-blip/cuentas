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

## `tv.html` — la música en el TV

Se abre en el **navegador del TV** (LG webOS, Samsung, Android TV o TV Box) con
el link de **Música → Pantalla del TV**. El TV reproduce la cola de canciones
en orden y en vivo: el celular (con Mesora abierta) le manda cada canción que
piden las mesas, sin Google y sin transmitir. Solo se envían versiones que ya
se comprobó que se dejan reproducir fuera de YouTube; si alguna igual falla, el
TV avisa y el celular busca otra versión.

## `puente/youtube-tv-worker.js` — canciones solas en el YouTube del TV

Con **Música → YouTube del TV: canciones solas**, Mesora se conecta a la app de
YouTube del televisor con el código «Vincular con código de TV» y le agrega
cada canción que piden las mesas a su cola, en vivo. Usa el mismo sistema que
los celulares al vincular un TV (no es una API pública de Google; YouTube
podría cambiarlo). Como el navegador no deja hablar directo con youtube.com
desde otra página, las llamadas pasan por este pequeño puente, que se publica
gratis como Cloudflare Worker (los pasos están dentro de la app).

## `mesero.html` — la app de los meseros

Cada mesero la abre en su propio celular con el link de **Ajustes → Pedidos,
QR y caja → App de meseros**. Ve las mesas y lo que lleva cada una, anota
pedidos tocando los productos o dictando (los mismos comandos de la voz
clásica), pide la misma ronda y crea mesas con nombre. Los pedidos llegan
directo al celular principal (con Mesora abierta) por un canal privado que
los clientes no conocen. En el mismo equipo del negocio, un usuario con rol
**Mesero** entra en modo mesero: solo mesas, cocina y música.

## `licencias.html` — códigos para sedes adicionales

La sede principal va incluida; cada sede adicional se activa con un código
que crea el dueño de Mesora en `licencias.html` con su llave privada (que
**no** está en este repositorio). El cliente lo abre como link
(`index.html#licencia=…`) y la app comprueba la firma con la llave pública.

## Links (GitHub Pages)

Con GitHub Pages activado en este repositorio (`cuentas`):

- App del negocio: https://cristhianlujan45-blip.github.io/cuentas/
- Pedidos del cliente (QR): https://cristhianlujan45-blip.github.io/cuentas/pedido.html
- App de meseros: https://cristhianlujan45-blip.github.io/cuentas/mesero.html
- Música en el TV: https://cristhianlujan45-blip.github.io/cuentas/tv.html

GitHub Pages publica la rama elegida en Settings → Pages; cada cambio que
se sube a esa rama se publica solo en 1–2 minutos. `version.txt` debe llevar
el mismo texto que `MESORA_VERSION` en `index.html` (así la app avisa cuando
hay una versión nueva sin volver a bajar los 14 MB).

## QR impresos (Netlify)

Los QR que ya están pegados en las mesas abren
`https://joyful-basbousa-0bc49b.netlify.app/?mesa=…&c=…&v=…`. **No hay que
cambiarlos:** ese sitio de Netlify solo tiene la carpeta `netlify-qr`, que
reenvía al `pedido.html` de GitHub Pages con los mismos datos del QR (mesa,
canal y código). Así cada cambio subido a GitHub le llega solo al cliente.

- Si el sitio de Netlify está conectado a este repositorio, `netlify.toml` ya
  publica solo `netlify-qr` y no vuelve a publicar con cada cambio de la app
  (para no gastar los créditos gratis de Netlify).
- Si no está conectado, se sube una vez la carpeta `netlify-qr` (o su .zip)
  en Netlify → el sitio → Deploys.

En la app, **Ajustes → QR de las mesas → 📌 Fijar mis QR impresos** (con la
foto de un QR de una mesa) deja la app usando el mismo canal de los QR
pegados; los QR que se vuelvan a imprimir salen idénticos.

## Uso

Subí los archivos (`index.html`, `pedido.html`, `mesero.html`, `tv.html` y `licencias.html`) a cualquier hosting estático (o abrí `index.html`
directo en el navegador del celular o la compu para llevar solo las cuentas,
sin la parte de pedidos por QR). No hace falta backend ni base de datos.
