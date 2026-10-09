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

- **Se instala como app de verdad** (Ajustes → 📲 Instalar Mesora): queda con su
  propio ícono en la pantalla de inicio, abre en pantalla completa (sin la barra
  del navegador) y funciona aunque no haya internet. Antes no se podía: el
  manifest iba incrustado como `data:` dentro del HTML —y Chrome nunca deja
  instalar así— y no había service worker, que es justo lo que el navegador
  exige para ofrecer «Instalar». Ahora hay `manifest.webmanifest`, iconos de
  verdad (192, 512 y uno *maskable* para Android) y `sw.js`.
  El botón explica los pasos de cada aparato: en iPhone se hace desde Safari
  (Compartir → Agregar a inicio), en Android desde el menú de Chrome, y en el
  computador desde el ícono de la barra de direcciones.
  **El service worker pide la página siempre a internet primero** y solo usa la
  copia guardada si no hay señal: así la app nunca se queda pegada en una
  versión vieja, que es lo que pasaba antes. El botón «Actualizar ahora» del
  aviso de versión nueva además borra todo lo guardado antes de recargar.

- **Una sola cuenta para todos tus equipos**: entras con el mismo correo y la
  misma contraseña en el celular, el computador del local o el de la casa, y la
  app aparece cuadrada sola (la clave de la IA, el YouTube, la música, los
  avisos, el QR, los domicilios, los meseros y la carta). Los cambios que hagas
  en uno se copian a los otros. Las mesas abiertas y el historial de ventas
  **no** viajan: eso es el trabajo de cada día en cada equipo. Se monta una vez
  con el puente gratis `puente/cuenta-worker.js` (Ajustes → Cuenta → Cuenta en
  la nube), que vive en **tu propia** cuenta de Cloudflare. Las contraseñas se
  guardan cifradas (PBKDF2, nunca en texto) y un correo = una cuenta: no se
  pueden crear dos cuentas con el mismo correo, ni escribiéndolo distinto
  (mayúsculas, puntos de más o `+etiqueta` en Gmail, que son el mismo buzón).
  Sin internet o sin puente, la app sigue funcionando igual que antes.
- **Música de fondo con tus playlists de YouTube** (Música → Música de fondo):
  elige una playlist que ya tengas guardada en tu cuenta (o pega su link o su
  código) y suena sola mientras no haya canciones pedidas. Cuando una mesa pide
  algo, se pone lo que pidieron y al terminar vuelve tu playlist. Sirve en el
  reproductor de la app, en la pantalla del TV (`tv.html`), en el YouTube del TV
  (código de TV) y al transmitir con Chromecast. Se le pasa la playlist entera a
  YouTube, así que funciona con playlists de cualquier tamaño.

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

## `puente/cuenta-worker.js` — tu cuenta y tu configuración en todos los equipos

Con **Ajustes → Cuenta → Cuenta en la nube**, Mesora guarda tu cuenta (correo,
usuario y la contraseña cifrada) y tu configuración en este puente, para que
entres con el mismo correo en cualquier equipo y aparezca todo montado. Se
publica gratis como Cloudflare Worker con una base de datos KV llamada
`CUENTAS` (los pasos están dentro de la app, y también arriba del archivo).
Queda en **tu** cuenta de Cloudflare: ni Mesora ni nadie más ve esos datos.

## `licencias.html` — códigos para sedes adicionales

La sede principal va incluida; cada sede adicional se activa con un código
que crea el dueño de Mesora en `licencias.html` con su llave privada (que
**no** está en este repositorio). El cliente lo abre como link
(`index.html#licencia=…`) y la app comprueba la firma con la llave pública.

## Uso

Subí los archivos (`index.html`, `pedido.html`, `mesero.html`, `tv.html` y `licencias.html`) a cualquier hosting estático (o abrí `index.html`
directo en el navegador del celular o la compu para llevar solo las cuentas,
sin la parte de pedidos por QR). No hace falta backend ni base de datos.
