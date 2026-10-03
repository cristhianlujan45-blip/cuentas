# Vento 1.23.1 — «TV de tu wifi» reescrito (APK 1.0.6)

## Qué pasaba (captura del negocio)
- Vento mostraba «TV_BA82 · Conectado» aunque ese TV NO estaba en el wifi: era la vinculación por
  internet de antes, mostrada como si fuera del wifi.
- YouTube encontraba «Sala familiar» (Chromecast / Google TV) y Vento no encontraba nada.

## Qué cambió
- **Buscador de Chromecast igual al de YouTube**: la app usa el buscador de Cast de Google Play Services
  (MediaRouter + Cast, el mismo de «Elige un dispositivo» en YouTube). Salen los mismos aparatos, con su
  nombre y lo que muestran. Si el celular no tiene Play Services, siguen las demás búsquedas.
- **mDNS en Android 14**: la dirección del Chromecast puede llegar en IPv6; antes se botaba y el aparato
  no salía. Ahora se toma su dirección IPv4.
- **Barrido de respaldo más rápido**: por puerto y todas las direcciones a la vez (antes no alcanzaba a
  llegar a las direcciones altas, p. ej. .150, antes de que se acabara el tiempo).
- **El TV vinculado por internet va aparte** («🔗/🟢/📴»): si en el saludo el TV no aparece conectado, dice
  «no responde ahora (apagado o en otra red)», no «conectado». Debajo, «En este wifi:» solo los del wifi.
- Mensaje sin TV: «No encontré TV en este wifi…» (ya no «Arriba está el TV que ya tienes conectado»).

## Pruebas
- `otrared.js` 6/6: TV_BA82 fuera del wifi sale «no responde»; «Sala familiar» sale en el wifi; al
  tocarlo, YouTube se abre allá y Vento queda conectado a ese TV.
- Java: búsquedas a la vez + barrido (Chromecast sin SSDP). Regresión de música/TV.
- La compilación con Play Services se verifica en GitHub Actions.
