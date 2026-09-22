# Cuentas de mesa + Márgenes de precios (100% offline)

App de una sola página (`index.html`) para llevar mesas, pedidos por QR y el
inventario de un negocio tipo bar/tienda ("Cuentas de mesa"), con una
calculadora de **costo, margen y precio de venta por unidad** que funciona
completamente **sin internet**.

## Qué hace la parte de márgenes

En la pestaña **Inventario → 💰 Costos y márgenes** aparece, para cada
producto con costo cargado, una tabla con:

- **Costo por unidad**
- **Margen %** (editable por producto; 30% por defecto)
- **Precio sugerido** para lograr ese margen (redondeado a $100)
- **Precio de venta actual** y el margen real que deja
- **Utilidad por unidad**
- Un botón **Usar** para aplicar el precio sugerido, y otro para aplicarlo a
  todos los productos con costo de una vez.

Los totales de "costo en inventario" y "utilidad potencial" también se
calculan solos a partir del stock cargado.

## Cómo se carga el costo, sin internet

Dos botones en Inventario dejan tomar una foto (factura de un proveedor, o
la etiqueta de precio de un producto) y **reconocen el texto en el propio
celular**, sin mandar nada a internet:

- **🧾 Escanear factura de proveedor (sin internet)**: separa cada renglón en
  producto, cantidad y costo por unidad (si detecta que se compró por caja o
  paquete —p. ej. "x12", "x24 uds"— calcula el costo de la unidad individual,
  no de la caja), lo compara contra el catálogo existente y sugiere un precio
  de venta.
- **🏷️ Escanear precio y margen (sin internet)**: identifica el producto y el
  precio visible en una foto de una etiqueta o del propio producto.

Siempre se abre una pantalla de revisión donde se puede corregir cualquier
dato (o agregar un producto a mano con **+ Agregar producto**) antes de
guardar — el reconocimiento es una ayuda, no reemplaza la revisión.

Si el texto no alcanza a separarse solo y hay una API key de IA (Gemini u
OpenAI) configurada en ⚙️ Configurar IA, la app intenta un segundo paso en
línea como respaldo — pero **nunca es necesario** para que la función sirva.

## Cómo funciona el reconocimiento offline

El motor de OCR ([Tesseract.js](https://github.com/naptha/tesseract.js), con
el idioma español) y el lector de PDF ([pdf.js](https://mozilla.github.io/pdf.js/))
vienen embebidos en `lib/`:

- `lib/tesseract.min.js` / `lib/ocr-offline-data.js` — motor de lectura de
  texto y datos del idioma español, empaquetados como un solo bloque para que
  funcionen incluso abriendo `index.html` directo desde el disco (`file://`).
- `lib/pdf.min.js` / `lib/pdf-worker-data.js` — lectura de PDFs.

No hace falta conexión para usarlos: una vez que tengas estos archivos en tu
celular o computador, la app entera funciona sin internet (el resto de
funciones que sí lo necesitan —IA opcional, QR en vivo, música— siguen
disponibles solo cuando hay conexión, pero no son necesarias para el cálculo
de costos y márgenes).

## Uso

Abre `index.html` en el navegador (o publícalo en cualquier hosting
estático). Todos los datos (productos, mesas, historial) se guardan en el
propio dispositivo (`localStorage`).
