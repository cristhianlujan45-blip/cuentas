# Vento 1.9: auditoría y transformación

## Qué se revisó antes de cambiar nada

**Unir mesas.** Ya existía `moverMesa` ("pasa / junta la mesa 3 a la 5"): mueve los productos y mezcla las líneas iguales, así que pierde de qué mesa vino cada cosa. **Se conservó tal cual** (voz y botón 🔀). Combinar es una función aparte que no mueve nada.

**Reinicios.** Ya existían:
- "Restablecer día": pasa las cuentas abiertas al historial como deuda.
- "Restablecer todo".
- "Borrar nombres".

**Se conservaron.** El reinicio nuevo es distinto: solo vacía el estado operativo, no crea deudas ni ventas, y se puede usar por unidad.

**Roles.** `authIsAdmin()` (administrador o mesero) ya existía. Se usa para las acciones críticas.

**Terminología.** Ya estaba centralizada en `espacio()` según el tipo de negocio. Se agregó:
- el nombre libre de la unidad;
- los alias `getServiceUnitName()`, `getServiceUnitNamePlural()` y `serviceUnitLabel()`.

**YouTube Music: no se tocó.** Ni enlaces, ni QR, ni reproducción, ni cola. Solo se ajustó cómo se ve el buscador cuando el teclado está abierto.

**QR físicos: no se tocaron.** Siguen funcionando igual (probado de punta a punta).

**La IA eliminada.** La búsqueda de su nombre en todo el repositorio da 0 resultados.

## Cambios

| Área | Cambio |
|---|---|
| Unidades | Nombre editable: Mesas, Sillas, Cabinas, Habitaciones, Salas, Pistas, Puestos, Consultorios, Estaciones, Cajas, Órdenes, Pedidos, Espacios, Reservas, Canchas, o uno libre ("Puesto VIP"). Karaoke usa Salas; "spa" es alias de Estética (Cabinas). |
| Combinar | `window.vitoGrupos` (`combinar`, `separar`, `cobrar`, `etiqueta`, `total`). Se muestra como "Mesa 4 + 5 + 6" en la tarjeta, la cuenta y la preparación (las dos pantallas). Separar no pierde ni duplica nada. "Cobrar el grupo" conserva el origen de cada producto (`it.origen`). |
| Reiniciar | Botón "♻️ Reiniciar [unidades]" en la pantalla principal, botón dentro de cada cuenta y orden por Laya. Permite una, varias o todas. Se explica qué se borra y qué no; hay una segunda advertencia si quedan saldos, abonos, pedidos o preparación pendiente. Solo administrador. Queda auditado y no toca datos permanentes ni inventario. |
| Auditoría | `data.auditoria`: combinar, separar, cobrar grupo, reiniciar, intentos sin permiso y pedidos nuevos que llegan a un grupo. |
| Laya | Ver la sección siguiente. |
| Facturas | Antes de guardar, avisa si la factura parece ya aplicada (mismo proveedor y número, o mismo proveedor, total y fecha), para no duplicar el inventario. El cuadre de cantidad, IVA y cajas (1.8) se mantiene. |
| Buscador de canciones | Al escribir, el campo sube a la parte visible (`visualViewport`) y las sugerencias se ajustan al espacio que deja el teclado, con su propio scroll. Se selecciona sin cerrar el teclado. |
| Notificaciones | Avisos con márgenes seguros, texto largo con scroll y posición encima del teclado. Las tarjetas de pedidos ya no se aplastan ni cortan sus botones. Dicen la unidad correcta ("Silla 3"). Los pedidos que entran solos suenan y se anuncian. Avisos de pedidos y de música siguen separados. |
| Voz | "Laya, …" en el micrófono: si es para Laya, responde. Si es un pedido ("Laya, mesa dos, cuatro Poker"), sigue como pedido normal. |

## Laya

**Unidades** (con el nombre del negocio: silla, cabina, habitación…):
- combinar unidades, ver cuáles están combinadas, el total de 4 y 5, separar;
- qué pidió originalmente la mesa 5;
- reiniciar una, varias o todas (acción crítica: pide confirmación y exige administrador).

**Centro de control** ("¿cómo va todo?"): pedidos pendientes, unidades abiertas, grupos, agotados y stock bajo, facturas del mes con su IVA, pedidos demorados y problemas encontrados.

**Auditoría** ("Laya, audita"):
- facturas y pedidos duplicados;
- cantidades o costos en cero o extraños, y facturas que no cuadraban;
- pedidos de unidades que no existen, pedidos con estado inconsistente y productos pedidos que no existen;
- grupos rotos, productos duplicados, stock negativo y ventas por debajo del costo;
- falta de conexión.

**Estimaciones y tiempos:**
- Cuánto alcanza cada producto según los últimos 14 días. Siempre se dice que es una estimación, no una certeza.
- Cuánto lleva cada pedido en cada estado, comparado con lo normal del local.

**Búsqueda externa:** "Laya, busca en internet …" o un código de barras. Consulta Open Food Facts, una base pública sin clave, y advierte que es una fuente externa.

**Acciones por chat y voz:** "Laya, agrega cinco Águilas a la mesa 2" y "repite el pedido anterior".

**Actividad y permisos:**
- `data.layaLog` registra cada consulta, sugerencia, ejecución y acción crítica. Se ve en Ajustes → Laya IA, junto con la auditoría y el centro de control.
- Las acciones críticas (reiniciar, unir productos duplicados) solo las hace un administrador.

## Netlify

Todo corre por GitHub Pages: la app no tiene ninguna referencia a Netlify y los QR nuevos usan la dirección de GitHub.

**Lo que se queda.** Los QR ya pegados en las mesas tienen impresa la dirección de Netlify (`joyful-basbousa-0bc49b.netlify.app`). Por eso se mantiene la redirección de 2 archivos (`netlify-qr/`, `netlify.toml`), solo para esos QR. Borrarla dejaría inservibles los QR físicos, y la regla es no cambiarlos.

**Para quitarla del todo:** imprimir QR nuevos desde la app (salen con la dirección de GitHub), pegarlos y luego borrar esa carpeta y el sitio de Netlify.

## Pruebas

| Prueba | Resultado |
|---|---|
| Combinar 4 + 5 y 4 + 5 + 6 | Etiqueta "Mesa 4 + 5 + 6", total = suma real (sin duplicar), inventario igual |
| Pedido QR a la 5 dentro del grupo | La preparación muestra "Mesa 4 + 5 + 6 (de Mesa 5)" |
| "Qué pidió originalmente la 5" | Lo propio de la 5 y sus pedidos |
| Separar | Cada mesa con lo suyo, sin pérdidas |
| Cobrar grupo | Productos con origen (`Águila@5`), total correcto, sin tocar el stock |
| Reinicio como mesero | Bloqueado |
| Reinicio como administrador | Unidad vacía; productos, inventario, historial y facturas idénticos; queda auditado |
| Botón y ventana del reinicio | Muestran qué se borra y qué no |
| Terminología | Restaurante → Mesa 1 · Barbería → Silla 1 · Hotel → Habitación 1 · Estética/Spa → Cabina · Karaoke → Sala · "Puesto VIP 1". Laya responde con el término; en barbería: "Sillas combinadas: Silla 1 + 2" |
| Buscador con teclado | 320×330, 390×420 y 768×500: sugerencias visibles; se elige sin cerrar el teclado |
| Avisos | 320×568, 390×844, 1280×800 y 844×390 horizontal: dentro de la pantalla; 5 tarjetas con scroll |
| Regresión de lo anterior | Facturas, pedidos de punta a punta con el QR impreso, preparación, música automática, voz, Laya, pantallas, tipos de negocio, contabilidad, libreta y pagos |

## Límites honestos

- **Numeración de habitaciones.** Si se quiere "Habitación 101", se pone ese nombre a la unidad. Por dentro las unidades siguen numeradas 1, 2, 3, porque los QR impresos usan ese número.
- **Lectura de fotos y preguntas libres.** Las hace la IA de visión y lenguaje que el negocio conecte en ⚙️ Configurar IA. Todo lo que son datos del negocio lo responde el motor local de Laya, sin internet.
- **Búsqueda externa.** Solo usa Open Food Facts: productos de consumo, sin clave. No hay un buscador web general sin exponer claves.
