# Vento 1.23 — TV del wifi, cobro de un toque, factura por captura y música en vivo (APK 1.0.5)

## 1. TV del wifi en la app (no salían / se quedaba pegado en uno)
- **Una sola búsqueda a la vez**: si se pide otra mientras busca (abrir Música y tocar «Transmitir al
  TV»), se une a la que va en curso y recibe los mismos TV. Antes eran dos búsquedas que se pisaban
  (Android resuelve los Chromecast de a uno) y la lista quedaba con uno solo o vacía.
- **Siempre por el wifi**: la búsqueda y las llamadas al TV se atan a la red wifi aunque estén
  prendidos los datos móviles o una VPN (antes podían salir por ahí y no encontrar nada).
- **Barrido de respaldo**: si el router bloquea la búsqueda «a todos» (SSDP/mDNS), se pregunta en cada
  dirección del wifi por los puertos donde los TV abren YouTube (8008 Chromecast/Android TV, 36866 LG,
  8080 Samsung, 8060 Roku). También se manda la búsqueda por broadcast.
- La lista de la app muestra de una vez los TV encontrados hace poco mientras busca.

## 2. Factura: un solo botón
En la cuenta de la mesa (y en el historial) queda solo **🖼️ Enviar captura por WhatsApp**. Se quitó
«Enviar factura por WhatsApp» (texto).

## 3. Cobrar y liberar con un botón
**💰 Cobrar todo y liberar mesa** pregunta en un paso cómo pagaron TODO el saldo:
💵 efectivo · 📲 transferencia · 📝 queda debiendo. Se registra ese pago por el saldo exacto y la mesa
queda libre — ya no hay que escribir cuánto pagó cada quien. Antes, lo no registrado quedaba como
deuda. Si ya había abonos, se cobra solo lo que falta.

## 4. Música en vivo (app de Android)
- La app deja abierto el **canal de vuelta del TV** (como la app de YouTube): Vento sabe al instante
  qué suena, si pausó, si terminó o si cambió la canción o la lista, sin volver a «saludar» al TV (antes
  abría una sesión nueva cada 8–12 s). Si la sesión se vence, saluda y vuelve a escuchar sola.
- Cuando el TV termina una canción de las mesas y pasa a otra en el mismo aviso, queda **sonada** (no
  «saltada») en el historial.
- En el navegador sigue como antes (pregunta cada pocos segundos).
- APK: más memoria para procesar fotos (`largeHeap`).

## Pruebas
- Java: dos búsquedas a la vez → ambas reciben el TV; Chromecast sin SSDP → lo encuentra el barrido
  con «Reproduciendo YouTube» y su screenId.
- `cobro.js` 7/7, `envivo.js` 10/10 y regresión completa (música/TV, pedidos, e2e, todos).
