# Vento 1.26.2 — El TV vuelve a conectarse al tocarlo (APK 1.0.11)

## Qué pasaba (error introducido en 1.25)
En 1.25 la búsqueda empezó a preguntar también por «todos los aparatos» y «reproductores». El TV LG contesta
**varias veces**: como «reproductor» (sin la forma de abrir YouTube) y como «TV que abre YouTube». Ganaba la
primera respuesta que llegaba: si era la de «reproductor», el LG quedaba como «se conecta con su código» y al
tocarlo **Vento ya no le abría YouTube** → no salía en el TV el aviso de «conectado».
Se comprobó con un LG simulado que contesta igual: la versión anterior lo dejaba en «solo código».

## Qué cambió
- Cuando el mismo aparato contesta varias veces, **gana la ficha más completa** (la que abre YouTube; luego la
  que tiene screenId; luego «reproduciendo YouTube»), conservando el mejor nombre. En la app (Java) y en la lista
  (el botón se reemplaza, no se duplica) y en «Dispositivos».
- El barrido no salta una dirección que solo tiene ficha de «solo código»: la sigue describiendo por si abre YouTube.

## Pruebas (repetidas)
- Java: LG que contesta doble, 3 veces seguidas → siempre queda «abre YouTube». Versión anterior → «solo código».
- `conectar.js`, 5 corridas de punta a punta: un solo LG en la lista → se abre YouTube en el TV → se vincula →
  saluda (aviso en el TV) → manda la cola → abre el canal en vivo → «Conectado». 5/5.
- Java: TV LG normal, búsquedas a la vez, Chromecast por barrido, caja genérica. Regresión completa.
