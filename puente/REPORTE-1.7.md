# Vento 1.7: reporte de cambios

Este reporte cubre facturas inteligentes, Laya IA, música por QR, comandos de voz y la opción Mesas o Cuentas.

## 1. Archivos modificados y creados

| Archivo | Estado | Qué cambió |
|---|---|---|
| `index.html` | modificado | Lector de facturas (imagen, OCR, encabezado, renglones, presentaciones, coincidencias, validación), Laya IA, historial de facturas, movimientos de inventario, música con estados, voz y Mesas/Cuentas |
| `tv.html` | modificado | Barra de progreso "01:32 / 03:42", mesa que pidió, siguiente canción, reporte de progreso y de fin, orden "saltar" y mensaje de error |
| `puente/laya-worker.js` | nuevo | Puente seguro (Cloudflare Worker) entre Vento y Laya IA. La clave queda en el servidor, nunca en el navegador |
| `puente/REPORTE-1.7.md` | nuevo | Este reporte |
| `version.txt` | modificado | `2026-10-01 · v1.7` |

## 2. Funciones agregadas

**Facturas: texto y datos**
- `fiAscii`, `fiLev`, `fiCorregirOCR`: corrigen errores típicos del OCR.
- `fiPresentacion`: separa la presentación (24X594G, (18BS/40/10g), DPX8UNDSX15GR, X12 UNID) de la cantidad.
- `fiNormalizar` y `fiNombreSugerido`: aplican abreviaturas y marcas y proponen un nombre limpio.
- `fiDineroTok` y `fiParsearRenglones`: leen renglones de distribuidores reales. Detalles en la sección 3.
- `fiEncabezado`: número, fechas, NIT, CUFE, subtotal, IVA, total y proveedor.
- `FI_PROVEEDORES`: distribuidores colombianos que se reconocen aunque el OCR escriba mal el nombre.
- `fiValidar`: avisos de total, datos faltantes, coincidencia dudosa, cantidad o precio raros, IVA fuera de tarifa y renglones que no cuadran.

**Facturas: inventario**
- `fiCoincidir`: busca el producto por código del proveedor, código de barras, equivalencia aprendida, nombre, marca y tamaño. Da una confianza de 0 a 100 y la lista "Posibles productos encontrados".
- `fiAprender` y `fiKeyEq`: guardan equivalencias aprendidas (proveedor + descripción → producto).
- `LayaIA` y `fiDesempatarConIA`: consultan a Laya solo cuando hay duda.

**Facturas: fotos y lectura**
- `fiMejorarFoto`, `fiEsquinasPapel`, `fiHomografia`, `fiOtsu`: recortan, enderezan y emparejan la luz de la foto.
- `fiRevisarFoto`: muestra la foto para revisarla antes de leerla.
- `fiValidarArchivos`: acepta solo fotos o PDF, de 15 MB máximo y 10 archivos máximo.
- `fiGuardarOriginal`: guarda la foto original.
- `rotarCanvas` y `puntajeLectura` (motor sin internet): si la lectura sale pobre, reintenta con la foto original y girada 90°, 270° o 180°, y se queda con la mejor.

**Facturas: pantallas**
- Historial de facturas, con búsqueda, detalle y la foto original.
- Movimientos de inventario (`data.inventarioMov`).
- Tarjeta de Laya en Ajustes → Jimmy N AI.

**Música**
- `mzLimpiarPedido`: limpia lo que escribe el cliente ("ponme la de…", "Artista - Canción").
- Estados del pedido: `mzCambiar`, `mzEmpezo`, `mzProgreso`, `mzTermino` y `mzActual`. Los estados son pending, approved, playing, played, skipped y cancelled.
- Pantalla: `mzPintarSonando` muestra la barra con mm:ss / mm:ss.
- Historial: `mzAlHistorial`, `mzHist` y `mzVerHistorial`.
- Respaldo: `mzRespaldo` y `mzRecuperar` guardan la cola y el historial también en IndexedDB.
- `mzSaltar`: salta la canción en el TV, en la app o en YouTube Music.

**Voz**
- `isRepeatLastOrderVoiceCommand`: atiende "repetir pedido anterior".
- "deshacer pedido" ahora se entiende.
- Diccionario de cervezas: poquer → Poker, "águila lait" → Águila Light, costeñita, club colombia y pony malta.

**Mesas o Cuentas**
- `puedeElegirMesas` y `pintarAtencion`, más el selector "Atender por: Mesas / Cuentas".

## 3. Errores corregidos

**Lectura de tus 7 facturas reales**
- Antes, el lector sin internet tomaba datos del cliente y del vendedor como productos.
- Ahora lee el código inicial, la columna de unidad (UN, UND, BS, PP, PL, LAT, DI) y números como 18,196.00, 2.742.00 o 1.00.
- También lee el % de IVA, los descuentos y la descripción partida en dos renglones de las tirillas POS.

**Cuadre con el total**

| Factura | Total impreso | Suma de renglones |
|---|---|---|
| Distrimarcas | 32.621 | 32.621 |
| Colombina | 106.146 | 106.146 |
| Super Ricas | 43.042,30 | 43.043 |

**Cantidad y costo**
- La cantidad se comprueba con el total del renglón (ej. Lechera: 10.968 ÷ 2.742 = 4).
- El costo por unidad sale con IVA incluido.
- Si el OCR dañó un número, el renglón queda marcado para revisar.

**Fotos y encabezado**
- Las fotos de lado (CCESTAN 2/2) y la foto curvada (CCESTAN 1/2) ahora se leen, gracias a los reintentos con la foto original y con giros.
- En el encabezado ahora se leen "VENTA No FE857899", "NOTA PEDIDO", "43-06236588", "Creación/venc.", "VALOR NETO A PAGAR", "TOTAL IMPUESTOS" y "Base".
- El número de pedido ya no se toma como número de factura.

**Otros arreglos**
- El nombre sugerido ya no deja códigos como "18bs/40/" ni "Dpx8undsx15gr", y "RICO" ya no se cambia a "RICA".
- Al saltar una canción, la mesa que ya tuvo turno no vuelve a adelantarse.
- Los links de YouTube Music en iPhone usan el enlace oficial https. En Android, si la app no está instalada, se abre la canción en YouTube.

## 4. APIs y servicios que usa cada función

| Función | Servicio |
|---|---|
| Lectura de facturas con internet | La IA ya configurada en Vento (Gemini, con la clave que el dueño pone en Ajustes) |
| Lectura sin internet | Tesseract.js, que va dentro del archivo, y pdf.js para PDF |
| Desempate de productos | Laya IA (`POST /v1/systemone`, formato oficial de github.com/NandhaKishorM/laya), a través de `puente/laya-worker.js` |
| Música: búsqueda | YouTube Data API v3 (search, videos) |
| Música: reproducción en la app y en el TV | YouTube IFrame Player API (getCurrentTime y getDuration dan el tiempo real) |
| Música: abrir en YouTube Music | Intent oficial de Android y enlace universal https |
| Tiempo real celular ↔ TV y QR de mesas | ntfy.sh |

## 5. Variables de entorno (solo en el puente, nunca en el navegador)

| Variable | Obligatoria | Qué es |
|---|---|---|
| `LAYA_URL` | sí | Dirección del servidor de Laya |
| `LAYA_API_KEY` | si tu servidor de Laya la pide | Clave de Laya, guardada como "Secret" |
| `ALLOWED_ORIGINS` | recomendada | `https://cristhianlujan45-blip.github.io` |

## 6. Configuración de Laya

1. Monta Laya con su Docker (`laya-serve`), siguiendo el repositorio oficial.
2. Crea un Worker gratis en Cloudflare con el contenido de `puente/laya-worker.js` y ponle las variables de la sección 5.
3. En Vento, ve a Ajustes → Jimmy N AI → Laya IA, pega la dirección del Worker y toca "Probar conexión".

## 7. Cómo probar

**Facturas**
1. Ve a Inventario → Leer factura y toma o elige la foto.
2. Revisa la foto ya arreglada y lee la factura.
3. En la revisión, mira la confianza, los avisos y el encabezado, corrige lo necesario y aplica.
4. Ve a "📚 Facturas anteriores" y a "Movimientos" para ver el registro.

**Música**
1. Pide canciones desde el QR de dos mesas distintas.
2. En Música verás la cola con su estado, "▶ Siguiente canción", "⏭ Saltar la que suena" y "📜 Historial de música".
3. En el TV, abre `tv.html#código`: muestra la barra de tiempo, la mesa y la siguiente canción.

**Voz**
- Prueba: "mesa dos, cuatro Poker", "agrégame cinco Águilas a la mesa 1", "total de la mesa dos", "total de todas las mesas", "deshacer pedido" y "repetir pedido anterior".

**Mesas o Cuentas**
- En Mesas (o Cuentas), toca "Número de…" → "Atender por". Solo aparece en negocios de comida y bebida.

## 8. Limitaciones de servicios externos

- **YouTube Music en la app externa:** no informa el progreso. El tiempo mostrado es el transcurrido desde que se abrió (aproximado y marcado así). En el TV y en el reproductor de la app el tiempo es real.
- **Laya IA:** el servidor no trae CORS, por eso se necesita el puente. El servicio hospedado laya-ai.pro no se pudo verificar desde aquí.
- **OCR sin internet:**
  - En fotos muy arrugadas o con poca luz algunos números salen dañados. Esos renglones quedan marcados para revisar; nunca se inventan valores.
  - La IA en línea lee mejor cuando hay internet.
- **Enderezado de la foto:** necesita ver las cuatro esquinas del papel. Si no se ven, se usa la foto sin enderezar, y el lector también prueba con la original.

## 9. Seguridad

- No hay claves de Laya en el navegador.
- En `index.html` sigue la clave de navegador de YouTube Data API (`yCfg`), que ya estaba antes. Se recomienda restringirla por referente HTTP en Google Cloud Console a `cristhianlujan45-blip.github.io`.
- La búsqueda de respaldo por servicios libres (Piped/Invidious) ya existía. Son servicios de terceros, no de YouTube; se pueden quitar si se prefiere usar solo la API oficial.
- YouTube Music en iPhone ya no usa el esquema no documentado `youtubemusic://`: todos los enlaces son el enlace universal https oficial.
- Los archivos se validan por tipo y tamaño. Los textos se muestran escapados.

## 10. Errores de consola

Ninguno en las pruebas: 7 facturas reales, voz, música, Mesas/Cuentas y la batería de regresión.

## 11. Duplicados

- Hay una sola cola de música (`vito_cola`) y un solo lector de renglones (`fiParsearRenglones`, que reemplazó al anterior).
- No hay funciones repetidas en el mismo alcance.

## 12. Funciones existentes

Siguen funcionando: QR físicos sin cambios, mesas, cobro, fiados, inventario, contabilidad, voz y TV.
