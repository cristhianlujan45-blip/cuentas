# Vento 1.12 y 1.13: Laya como cerebro, cuentas por voz y voz natural

## 1.12: Laya, el cerebro de la app

**Nuevas preguntas** (por chat o por voz, diciendo "Laya, …"):

| Pregunta | Respuesta |
|---|---|
| "¿Cuánto gané hoy / ayer / esta semana / este mes?" | Ventas, costo de lo vendido, ganancia y % de margen (avisa si hay productos sin costo) |
| "Compara con la semana pasada" | Hoy y esta semana contra hace 7 días, a la misma hora (▲ o ▼ %) |
| "¿Qué es lo más vendido…?" | Top 8 por unidades, con su valor |
| "¿A qué hora vendo más?" | Las 3 horas pico de los últimos 30 días |
| "¿Qué tengo que comprar?" / "Arma el pedido" | Lista de compras para una semana de ventas, agrupada por el último proveedor de cada producto. Se puede enviar por WhatsApp o copiar. |
| "¿Qué me recomiendas?" | Todo lo que el piloto automático ve pendiente |
| "Buenos días, Laya" / "Resumen del día" | Ventas, ganancia, ticket promedio, lo más vendido, lo que hay que comprar y lo pendiente |

**Acciones con confirmación** (solo administradores; quedan en la actividad de Laya):
- **Cambiar un precio:** "Sube el precio de la Poker a 4500". Muestra el margen que quedaría y avisa si el precio queda por debajo del costo.
- **Sumar stock:** "Llegaron 24 Águilas". Queda registrado como movimiento de inventario.

**Piloto automático:** una tarjeta "🧠 Laya" en el inicio con hasta 3 sugerencias y botones de un toque. Cada sugerencia se oculta por un día con ✕.

| Sugerencia | Botón |
|---|---|
| 🛒 Productos que se acaban | Ver la lista de compras |
| 📈 Precio para mantener el margen cuando sube el costo en una factura (ej. "Poker te cuesta 15% más; véndela a $4.700 para seguir ganando 35%") | Subir el precio (con confirmación) |
| ⏰ Mesas con más de 3 h sin movimiento y lo que deben | Abrir la mesa |
| 📒 Fiados de más de 15 días | Ver deudas |
| 💤 Productos con stock que no se venden en 30 días | Idea de promoción |
| 📊 Resumen de ayer | Ver resumen |

Cada sugerencia se puede apagar en **Ajustes → Laya IA → 🤖 Piloto automático**.

**Error corregido:** el cambio de palabras (mesa → cuenta, silla…) también modificaba el **código** de los scripts del final de la página antes de ejecutarse. Ahora nunca toca el contenido de los scripts.

## 1.13: cuentas por voz y voz más natural

**Cuentas con el micrófono**, en el botón principal, en la libreta y en el chat de Laya.

Ejemplo: "Súmame 3500 más 4000 y multiplícame 5000 por 2 o 6000 por 2" responde, en pantalla y en voz alta:
- 3.500 + 4.000 = 7.500
- 5.000 × 2 = 10.000
- 6.000 × 2 = 12.000

| Cómo funciona | Ejemplo |
|---|---|
| Varias cuentas en una sola frase, separadas por "y", "o", "luego" o "después" | El de arriba |
| El verbo da la operación: súmame, réstame, multiplícame, divídeme, cuánto es, calcula | "Divídeme 120000 entre 3" → 40.000 |
| Entienden palabras y signos: más, menos, por, x, entre, dividido, +, −, ×, ÷, / | "Calcula 7 por 6 y luego 100 entre 8" → 42 y 12,5 |
| Números dichos en palabras | "Veinte mil más quince mil más ocho mil quinientos" → 43.500 |
| Cuentas largas: primero se multiplica y divide, después se suma y resta | "3 por 4000 más 2 por 3500" → 19.000 |
| Dividir entre cero | Avisa que no se puede |

**No se confunde con pedidos:** si la frase nombra una mesa, una cuenta o un producto, sigue siendo un pedido. "Súmale 2 Águilas a la mesa 3" agrega las Águilas a la mesa.

**Voz más natural:**
- **Causa de que sonara robótica:** se bajaba el tono a 0,82 para que sonara masculina, y se usaba la primera voz que apareciera.
- **Ahora:** tono normal y se elige la voz más natural del celular (las que dicen Natural, Neural, Premium o Google), prefiriendo español de Latinoamérica.
- **En Ajustes → Voz:** elegir la voz (⭐ = las más naturales), cambiar la velocidad y "Probar la voz".
- **Si todas suenan robóticas:** el celular solo trae voces básicas. En Ajustes del celular → Texto a voz se instala o actualiza "Servicios de voz de Google" y se descarga la voz en español de alta calidad.

## Pruebas

| Prueba | Resultado |
|---|---|
| Ganancia, comparación, lo más vendido, hora pico, lista de compras, precio, stock, sugerencias y resumen, con datos de ejemplo | Correctos |
| Cambiar precio y sumar stock | Aplicados después de confirmar |
| Tarjeta del inicio y lista de compras | Se ven bien en el celular |
| 12 frases de cuentas | Todas correctas |
| Micrófono principal | Hace la cuenta y no toca los pedidos |
| Orden de voces | Natural de Colombia > Google > básica > eSpeak |
| Regresión (libreta 26/26, voz, Laya, asistente, pedidos, todos los tipos de negocio) | Sin errores |
