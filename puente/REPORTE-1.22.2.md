# Vento 1.22.2 — Pedidos y canciones de los QR que no llegaban

## Qué pasaba
Cada celular guardaba el canal de pedidos (ntfy) SOLO en su memoria. Si esa memoria se borraba, o en
un celular nuevo, o en la **app de Android** (que no comparte memoria con Chrome), Vento creaba un
canal nuevo sin avisar. Los QR pegados en las mesas siguen mandando al canal viejo, así que los pedidos
y las canciones no llegaban (el cliente veía «enviado», pero nadie lo escuchaba).
Además, con la app de Android en segundo plano, la recepción podía quedarse dormida.

## Qué cambió
- **Todos los canales del negocio quedan en sus datos** (`data.qrCanales`, viajan con Vento Nube y los
  respaldos) y Vento **escucha todos a la vez**. Llegue por el canal que llegue, el pedido entra
  (sin duplicados: cada pedido y canción tiene su ID).
- Un celular o app nueva **ya no inventa canal** si el negocio ya tiene uno: usa ese.
- La confirmación al cliente («recibido», «en preparación»…) sale por **el mismo canal** por el que
  llegó su pedido.
- App de Android: el latido de fondo también despierta la recepción de pedidos cada 15 s.
- **🩺 Probar pedidos** (Ajustes → Pedidos, QR y caja): manda un pedido de prueba por el canal de los QR
  y dice si llegó, cuántos canales escucha y si ntfy rechazó el envío (cupo agotado).

## Si los QR se imprimieron en otro celular sin Vento Nube
Toca «📌 Fijar mis QR impresos» y escanea (o fotografía) el QR de una mesa: este celular queda
escuchando ese canal. No se cambia ningún QR físico.

## Pruebas
- `canales.js` 9/9: QR con canal viejo + celular con canal distinto → el pedido y la canción llegan, la
  respuesta va por el canal viejo, un celular nuevo usa el canal del negocio, «Probar pedidos» ✅.
- Regresión de pedidos (pedtest, e2e, todos) y de música/TV.
