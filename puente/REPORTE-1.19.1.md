# Vento 1.19.1: «Transmitir al TV» directo + escaneo de facturas y productos más rápido

## Transmitir al TV: directo a la lista de aparatos

- Ya no aparece la ventana «Abrir en Chrome / Conectar con código».
- **En Chrome,** tocar «Transmitir al TV» abre DIRECTO la lista de aparatos del wifi (Chromecast, Google TV, Android TV, TV Box con Chromecast). Se elige uno y la música de las mesas empieza a cargar allá sola.
- **En Brave** (no deja que las páginas vean los aparatos del wifi):
  - el mismo toque abre Vento en Chrome;
  - Vento entra a Música con el botón «Transmitir al TV» resaltado, listo para tocarlo una vez.
- **Si no hay TV en el wifi,** sale un aviso corto (sin ventana) y se abre la opción del código del TV.

Prueba: 4/4. En Chrome la lista se abre directa sin ventana; en Brave el toque abre Chrome sin ventana; en Chrome llega con el botón resaltado.

## Escaneo de facturas y productos: más rápido, sin perder calidad

- **Fotos más rápidas de abrir:** se decodifican directo del archivo (`createImageBitmap`), sin pasar los varios MB de la foto a texto.
  - Foto de producto de 12 MP lista para la IA: de ~0,45–0,65 s a ~0,19–0,28 s (2 a 3 veces más rápido, celular de gama media simulado).
- **Enderezar la factura:**
  - se trabaja a la resolución que de verdad se necesita, no con los 12 MP completos;
  - se copian los píxeles de a 32 bits;
  - los píxeles ya enderezados se usan directo, sin dibujarlos y leerlos otra vez;
  - el histograma se recorre de forma directa (antes un `forEach` lento).
  - Arreglo de la foto: de ~4,0 s a ~3,6 s en la misma prueba. Es una mejora pequeña: lo demás del arreglo ya era necesario para la calidad.
- **Vista previa de la factura:** usa la misma imagen ya codificada, sin volver a codificarla.
- **La calidad no empeora:**
  - la imagen mejorada sale prácticamente igual (diferencia media 1,3 de 255);
  - la factura de prueba se lee igual que antes: los mismos 4 productos, cantidades y costos.

## Además

TV que informa / no informa, código de TV, pantalla del TV, e2e, todos los negocios, pedidos y música.
