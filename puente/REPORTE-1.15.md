# Vento 1.15: página de pedidos con ocasiones, mensajes y promociones

## Dónde se configura

En la app principal: **Ajustes → Pedidos, QR y caja → 🎉 Página de pedidos: ocasión, mensajes y promociones**.

| Opción | Qué hace en la página del cliente |
|---|---|
| **Ocasión** | Banner animado arriba, con degradado, brillo y emoji que late. Colores y adornos que caen según la ocasión. |
| **Nombre** | Va dentro del saludo, por ejemplo "¡Feliz cumpleaños, Ana!". Aparece solo en Cumpleaños, Aniversario, Día de la madre y Día del padre. |
| **Mensaje** | Texto libre de hasta 140 letras, dentro del banner. Sale aunque no se elija ocasión. |
| **Saludo animado al abrir** | Tarjeta de bienvenida con celebración de emojis y botón "Ver el menú". Sale una vez por visita y se cierra sola a los 9 s. |
| **Promociones (publicidad)** | Hasta 6, en un carrusel que pasa solo cada 5 s y se pausa al tocarlo. Cada una lleva emoji o foto del producto, título, texto, precio y fecha "hasta". Si se vincula a un producto, tiene un botón **➕ Pedir** que lo agrega al pedido. |
| **🎁 Traer mis combos** | Agrega como promociones los productos de combos o promociones. |
| **👀 Ver cómo lo ven los clientes** | Abre la página de pedidos de una mesa. |

**Ocasiones disponibles:**
- 🎄 Navidad
- 🎆 Año nuevo
- 🎂 Cumpleaños
- 💘 Amor y amistad
- 🎃 Halloween
- 💐 Día de la madre
- 👔 Día del padre
- ⚽ Partido
- 🥳 Aniversario
- 🍻 Happy hour
- 🇨🇴 Fiestas patrias
- 💑 Noche romántica

## Cómo llega al cliente

- **Canal propio de ntfy** (`topic + 'a'`): no le quita espacio a la carta.
- **Solo publica al cambiar algo,** y repasa cada 6 h. Si nunca se configura, no publica nada y no gasta cupo.
- **En vivo:** los clientes que tienen la página abierta ven el cambio sin recargar.
- **Sin señal:** queda guardado en el celular del cliente.
- **Promociones vencidas:** las que pasaron su fecha "hasta" ya no se envían.
- **Producto agotado:** si el producto vinculado está agotado en la carta, la promoción se muestra sin el botón "Pedir".

## Más animaciones en la página de pedidos

- **Entrada:** banner, promociones y tarjetas de la carta entran suaves.
- **Al tocar:** las tarjetas se encogen un poco, y "Pedir" rebota y lanza una celebración.
- **Adornos:** hay sets nuevos que caen según la ocasión (🎂🎈🎁, 🎆🥂, 💐🌷, 👔🏆…). Si hay ocasión, manda sobre el motivo de la temática.
- **Sin animaciones:** con **Letra grande** (modo fácil) o si el celular pide menos movimiento.
- **Idiomas:** los textos de la ocasión están en español, inglés y portugués.

## Probado

**Flujo completo** con ntfy simulado:
1. El dueño elige "Cumpleaños" con el nombre "Ana", escribe un mensaje y crea la promoción "2x1 en Poker" vinculada al producto.
2. Se publica en el canal.
3. El cliente ve el saludo, el banner y el carrusel.
4. "Pedir" agrega 1 Poker al pedido.
5. El saludo no se repite en la misma visita.
6. El cambio en vivo a Navidad se aplica.
7. Al quitar la ocasión desaparece el banner.

**Pantallas:** 360, 390 y 768 px, sin desbordes laterales y sin errores.

**Regresión:** pedtest, pedsize, pedcat, pedfail y e2e.

## No se tocó

- YouTube Music.
- QR físicos.
- Envío de pedidos.
- Carta.
- Datos guardados.
