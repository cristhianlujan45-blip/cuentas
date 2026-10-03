# Vento 1.22.3 — Pedidos directo a GitHub (sin Netlify)

## Qué pasaba
Con los QR fijados («📌 Fijar mis QR impresos»), Vento dejaba guardada la dirección de Netlify como
link de la página de pedidos y nunca la cambiaba: el link de cada mesa, WhatsApp, domicilios y
ver/imprimir QR seguían saliendo por Netlify.

## Qué cambió
- Con Vento abierta desde GitHub (también la app de Android), la página de pedidos es siempre
  `https://cristhianlujan45-blip.github.io/cuentas/pedido.html`. Si estaba guardada la de Netlify,
  pasa sola a GitHub (se recuerda como `urlImpreso`, solo de referencia).
- El **canal** y el **código de cada mesa** NO cambian: los QR ya pegados siguen sirviendo.
- Al fijar QR escaneando uno con link de Netlify: se toman su canal y códigos, y el link queda en GitHub.
- Los pedidos y canciones viajan por ntfy hasta Vento, como antes (nunca pasaron por Netlify).

## Los QR físicos
Los QR ya pegados tienen impresa la dirección de Netlify; Netlify solo reenvía a GitHub (carpeta
`netlify-qr`, no se vuelve a publicar con cada cambio). Si algún día ese reenvío dejara de abrir, los
QR que se reimpriman desde Vento ya salen con el link directo de GitHub y el mismo canal y código.

## Pruebas
- `netl.js` 8/8 (Vento en GitHub con QR fijados en Netlify → links por GitHub, canal y códigos iguales,
  el pedido del QR impreso llega).
- e2e (ajustado a GitHub directo), canales, flujo, pedtest.
