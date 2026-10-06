# Vento: cuentas, pedidos por QR, inventario y música para negocios (con Laya IA)

Son páginas HTML independientes, sin backend ni instalación. Cada una corre entera en el navegador.

- **Datos del negocio:** quedan en el propio equipo (`localStorage`, con respaldo en IndexedDB) y viajan en las copias de seguridad.
- **Comunicación en vivo:** la app del local, la página de pedidos, la pantalla de preparación, el TV y la app de meseros se comunican por canales de [ntfy.sh](https://ntfy.sh).
- **Si se cae la conexión:** ntfy guarda los mensajes hasta 12 horas, así que un pedido no se pierde aunque la app del local esté cerrada o sin señal un rato.

## Arquitectura y flujos

```
QR impreso (Netlify) ──► netlify-qr/index.html ──► GitHub Pages /pedido.html?mesa=N&c=CANAL&v=CÓDIGO
                                                     │  pedido JSON {id único, mesa, items, total}
                                                     ▼
                               ntfy.sh/CANAL  ──►  index.html (app del local)
                                                     │  1 sola vez por ID · mesa correcta (si no existe se crea)
                                                     │  suma a la cuenta · descuenta inventario
                                                     ├─► ntfy.sh/CANAL+'e' ──► pedido.html muestra «Recibido / En preparación / Listo»
                                                     └─► ntfy.sh/CANAL+'p'+código ──► preparacion.html (cocina / barra / despacho…)
                                                                                         └─► cambios de estado de vuelta a la app
Canción por QR ──► ntfy.sh/CANAL ──► cola de música (sin duplicados) ──► reproductor automático (celular o tv.html)
```

| Archivo | Para qué es |
|---|---|
| `index.html` | App del negocio: mesas o cuentas, productos e inventario, facturas, contabilidad, música, Laya IA y ajustes. |
| `pedido.html` | La página que ve el cliente al escanear el QR: carta, pedido, canción, "mi cuenta" y pago. |
| `preparacion.html` | Pantalla de preparación en una tablet o TV. Su nombre es configurable (Cocina, Barra, Despacho…). |
| `tv.html` | El TV reproduce la cola de canciones sola y muestra el tiempo real, la mesa y la siguiente canción. |
| `mesero.html` | App de los meseros en su celular, por un canal privado. |
| `licencias.html` | Códigos para sedes adicionales, firmados con una llave privada que no está en el repositorio. |
| `netlify-qr/` | Redirección estable para los QR ya impresos (ver más abajo). |
| `puente/laya-worker.js` | Puente seguro (Cloudflare Worker) hacia el motor de decisiones Laya. |
| `puente/youtube-tv-worker.js` | Puente para la opción "YouTube del TV" (vincular con código de TV). |
| `icons/` | Ícono y logo de Vento. |

## Laya IA: la única IA de la app

Laya es el asistente: la carita de "IA" arriba a la derecha. También responde por voz si en el micrófono se dice "Laya, …".

**Qué responde.** Contesta con los datos reales del negocio, al instante y también sin internet:
- **Facturas e IVA:** IVA pagado, costo por unidad con y sin IVA, último precio, compras por proveedor, productos que subieron de precio y los que más cuestan.
- **Inventario:** agotados, bajo stock y productos duplicados.
- **Pedidos y mesas:** qué pidió una mesa, pedidos pendientes y recientes.
- **Preparación y música:** qué hay en la pantalla de preparación (con el nombre que use el local) y estado de la música.
- **Informes:** inventario, facturas, compras, IVA, costos, productos nuevos, agotados, cambios de precio, proveedores, pedidos, preparación, música y uno general.

**Qué hace.**
- Abre la cámara para leer una factura y la aplica al inventario.
- Une productos duplicados.
- Marca pedidos como listos o entregados y los cancela.
- Salta o quita canciones.
- Para lo destructivo o importante, siempre pide confirmación.

**Avisos.** Avisa sola, sin repetir ni saturar:
- stock bajo o agotado y productos duplicados;
- cambios de precio y facturas guardadas con avisos;
- pedidos esperando y canciones que no se pudieron reproducir;
- problemas de conexión.

**De dónde salen las respuestas.**
- **Motor local de Laya:** todo lo anterior, que sale de los datos del equipo y nunca se inventa.
- **Preguntas libres y lectura de fotos:** usan el modelo de lenguaje y visión que el dueño conecte en ⚙️ Configurar IA (por ejemplo Gemini, con su propia clave). Sin conexión, las facturas se leen con el lector incluido (Tesseract.js y pdf.js). Desde la 1.9.1 sus motores pesados están en `lib/` (`vento-ocr.js`, `vento-pdf.js`, `vento-pdf-worker.js`) y se cargan solo al leer una factura; la app pasó de 14 MB a 2 MB y Android ya no la recarga al volver de la cámara u otra app.
- **Motor de decisiones Laya** ([NandhaKishorM/laya](https://github.com/NandhaKishorM/laya), opcional): desempata los renglones de factura que se parecen a varios productos. Se conecta en Ajustes → Laya IA a través de `puente/laya-worker.js`. Variables: `LAYA_URL`, `LAYA_API_KEY` (como secreto) y `ALLOWED_ORIGINS`.

## Unidades de atención: mesas, sillas, cabinas, habitaciones…

**Nombre de la unidad.**
- **Una sola fuente:** toda la terminología sale de `espacio()`, que también se pide como `getServiceUnitName()`, `getServiceUnitNamePlural()` y `serviceUnitLabel(id)`.
- **Valor por defecto:** el tipo de negocio. Restaurante → Mesas, Barbería → Sillas, Spa → Cabinas, Hotel → Habitaciones, Karaoke → Salas, Bolera → Pistas, Lavandería → Órdenes.
- **Nombre libre:** en Ajustes → Cuenta y negocio → «¿Cómo se llaman tus unidades de atención?» se elige otro o se escribe uno propio (ej. «Puesto VIP»).
- **Dónde se ve:** en el menú, las cuentas, los avisos, el QR, la preparación, Laya y la voz.

**Combinar** (botón 🔗 dentro de la cuenta, o «Laya, combina la mesa 4 con la 5»):
- Se arma un grupo con una unidad principal y sus vinculadas, que se muestra como «Mesa 4 + 5 + 6».
- No se mueve nada: cada unidad conserva sus productos, pedidos y origen, y el total del grupo es la suma real.
- Separar no pierde ni duplica nada.
- «Cobrar el grupo» junta la cuenta en la principal, con el origen de cada producto, y se cobra con el flujo normal.
- El inventario no se toca.

**Reiniciar** (botón «♻️ Reiniciar [unidades]» en la pantalla principal, o «Laya, reinicia la mesa 5»):
- Se puede reiniciar una unidad, varias o todas. Hay confirmación y una segunda advertencia si quedan saldos, abonos, pedidos activos o preparación pendiente.
- Solo puede hacerlo un administrador.
- Borra solo el estado operativo de esas unidades.
- Nunca toca inventario, productos, facturas, proveedores, historial, configuración, usuarios ni QR.
- No crea ventas, cobros ni devoluciones. Lo descartado queda en `data.auditoria`.

**Trazabilidad.** `data.auditoria` registra combinar, separar, cobrar grupo, reiniciar y los intentos sin permiso. `data.layaLog` registra lo que Laya consultó, sugirió y ejecutó. Ambos se ven en Ajustes → Laya IA → Actividad.

## Facturas

Foto o PDF → (IA con internet, o el lector sin internet) → **cuadre aritmético de cada renglón** (`fiCuadrar`) → coincidencia con el inventario → revisión → inventario.

**Qué calcula el cuadre en cada renglón:**
- **Unidades reales:** cajas × unidades por caja. Ejemplo: 5 cajas × 24 = 120 unidades. Reconoce caja, paquete, docena, display y bolsa.
- **Costos por unidad:** sin IVA, IVA por unidad y con IVA, junto con el subtotal, el IVA y el total del renglón.
- **Errores que corrige:**
  - el total del renglón tomado como precio de una unidad;
  - el precio por caja;
  - el precio sin IVA;
  - el IVA sumado dos veces.

**Antes de guardar** se valida que cantidad × precio, el subtotal más el IVA menos los descuentos y el total general cuadren. Si algo no cuadra, se muestra la lista y la persona decide: nunca se guarda en silencio.

**Qué queda guardado.** En el producto, en el movimiento de inventario y en el historial de la factura quedan:
- cantidad, unidad, presentación, cajas y unidades por caja;
- costo por unidad sin IVA, IVA por unidad y costo con IVA;
- subtotal, IVA total y total;
- proveedor, número de factura, fecha y la foto original.

## Pedidos por QR

**Cómo viaja el pedido.** El cliente manda un JSON con un ID único. La app del local:
- lo suma una sola vez, aunque el cliente reintente, recargue o toque dos veces;
- lo pone en la mesa correcta (si la mesa no existe, la crea);
- busca el producto por su nombre exacto en la carta;
- descuenta el inventario;
- le devuelve el estado al cliente.

**Sin conexión en el celular del cliente.** El pedido queda guardado en su bandeja y se envía solo cuando vuelve la señal. Ya no se manda al cliente a otra aplicación.

**Lista de pedidos.**
- Todos los pedidos (QR, meseros y WhatsApp) quedan en `data.pedidos`.
- Estados: nuevo · recibido · en preparación · listo · entregado · cancelado.
- Cada pedido guarda: ID, mesa, productos, cantidades, precios, total, fecha y hora, estado, origen e identificador del local (el canal).

**Configuración.** En Ajustes → Pedidos, QR y caja se elige si los pedidos del QR se suman solos a la cuenta (por defecto sí) o quedan "Por aceptar".

## Pantalla de preparación

En Ajustes → Pedidos, QR y caja se puede:
- activarla o desactivarla;
- elegir su nombre: Cocina, Barra, Bar, Preparación, Despacho, Producción, Cafetería, Comandas, Pedidos, Servicio, Área de preparación u otro nombre personalizado;
- copiar el link de `preparacion.html` para usarla en otra pantalla.

El nombre elegido aparece en el menú, los títulos, los avisos y en Laya. La configuración es de cada local, porque va dentro de los datos del negocio. Si está desactivada, los pedidos igual llegan a las cuentas.

## Música automática

**Funcionamiento.** Recibe → encola → reproduce → detecta el final → pone la siguiente, sin tocar Play:
- Si no hay nada sonando, la canción pedida suena de una vez.
- Si ya hay música, la nueva se agrega a la cola sin interrumpir.
- Con la cola vacía, queda esperando la próxima canción.

**Estados de cada canción:** pendiente · en cola · reproduciendo · reproducida · saltada · error · cancelada. Cada canción guarda el ID, el título, el artista, la mesa, la fecha y hora, y la posición. No hay duplicados por doble toque, recarga o reintento.

**Dónde suena:**
- **En el celular:** en Música se toca "Música automática" una vez. Los navegadores exigen un toque inicial para permitir sonido; después todo es automático.
- **En el TV:** se abre `tv.html` y se toca "Empezar música" una vez. El TV muestra el tiempo real ("01:32 / 03:42"), la mesa y la siguiente canción.
- **En la app de YouTube Music:**
  - En Android se abre con el intent oficial y, si la app no está instalada, cae a YouTube web.
  - En iPhone se intenta abrir la app y, si no abre, se usa la web.
  - En esta modalidad el tiempo es aproximado, porque esa app no informa el avance.

## Suscripciones (beta: pago manual por Nequi y DaviPlata)

Con el negocio en **Vento Nube**, la suscripción es de la cuenta + el negocio (no del celular) y la decide el servidor
(`supabase/functions/vento-suscripciones`): planes Gratis y PRO, prueba gratis, pago por Nequi/DaviPlata con foto del
comprobante, aprobación desde **Vento Admin → 💳 Suscripciones**, vencimiento y renovación. Las funciones de cada
plan (voz, lectura de facturas, estadísticas, equipo…) llegan a la app en un token firmado por el servidor.
Sin Vento Nube sigue el sistema anterior (prueba local + código de activación).

- Cómo cobrar, aprobar, renovar, cancelar y cambiar planes: [BETA_BILLING.md](BETA_BILLING.md)
- Qué queda listo para Google Play Billing: [FUTURE_GOOGLE_PLAY.md](FUTURE_GOOGLE_PLAY.md)

## Todo corre en GitHub (y qué queda de Netlify)

La app, la página de pedidos, la preparación, el TV, los meseros y los QR nuevos salen de **GitHub Pages**. La app no tiene ninguna referencia a Netlify.

**Lo único que queda.** Los QR que ya están pegados en las mesas tienen impresa la dirección `joyful-basbousa-0bc49b.netlify.app`. Ese dominio solo se puede atender desde Netlify. Por eso se mantiene, únicamente, una redirección de dos archivos:
- `netlify-qr/index.html` y `_redirects`: reenvían a `pedido.html` de GitHub con los mismos datos del QR;
- `netlify.toml`: impide que Netlify vuelva a publicar con cada cambio.

Así el QR físico sigue funcionando sin reimprimirlo.

**Para quitar Netlify por completo:**
1. Imprime QR nuevos. La app ya los genera con la dirección de GitHub: Ajustes → QR de las mesas → Generar.
2. Después de reemplazarlos, borra el sitio en Netlify y la carpeta `netlify-qr/` con `netlify.toml`.

**Si pierdes la configuración.** En la app, Ajustes → QR de las mesas → 📌 «Fijar mis QR impresos» (con la foto de un QR) hace que la app vuelva a escuchar el canal de los QR pegados.

## Links (GitHub Pages)

| Página | Link |
|---|---|
| App del negocio | https://cristhianlujan45-blip.github.io/cuentas/ |
| Pedidos del cliente | https://cristhianlujan45-blip.github.io/cuentas/pedido.html |
| Preparación | https://cristhianlujan45-blip.github.io/cuentas/preparacion.html#CANAL.CÓDIGO (el link completo sale en la app) |
| Meseros | https://cristhianlujan45-blip.github.io/cuentas/mesero.html |
| TV | https://cristhianlujan45-blip.github.io/cuentas/tv.html |

`version.txt` debe llevar el mismo texto que `MESORA_VERSION` en `index.html`; así la app avisa cuando hay una versión nueva.

## Seguridad

- No hay claves privadas en el frontend. La clave de Laya vive como secreto del Worker.
- La llave que firma el APK **no** está en el repositorio: sale de los secretos `VENTO_KEYSTORE_B64` y `VENTO_KS_PASS` (ver `android/LEEME.md` → Firma).
- La base de datos de producción solo se despliega desde la rama principal (`.github/workflows/servidor-vento.yml`).
- La clave de navegador de YouTube Data API que trae la app debe estar restringida por referente HTTP a `cristhianlujan45-blip.github.io` en Google Cloud.
- Los archivos subidos se validan por tipo (imagen o PDF), tamaño (15 MB) y cantidad (10). Los textos se muestran escapados.
- `puente/youtube-tv-worker.js` usa el sistema de "Vincular con código de TV" de YouTube. No es una API pública documentada, así que puede dejar de funcionar si YouTube lo cambia. Las demás opciones de música (`tv.html` y el reproductor de la app) usan solo la YouTube IFrame Player API oficial.
