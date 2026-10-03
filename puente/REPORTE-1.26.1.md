# Vento 1.26.1 — La conexión con el TV ya no se cae sola

## Qué pasaba
Cada «saludo» de Vento al YouTube del TV abre una **sesión nueva**: el TV lo ve como «Vento se desconectó /
se conectó». En la app de Android, aunque estaba abierto el canal en vivo, algunas revisiones abrían sesiones
nuevas encima (al abrir Música, al tocar Actualizar) y cada una cortaba el canal anterior. Además, si el TV pasaba
más de 100 s sin decir nada (una canción larga sonando), Vento daba el canal por muerto y abría otra sesión.

## Qué cambió
- App de Android: **una sola sesión mientras el canal esté abierto**. El canal se da por vivo mientras esté abierto
  (si se cae de verdad, la app lo avisa y Vento lo reabre a la MISMA sesión). Ninguna revisión abre sesiones nuevas.
- «No responde» solo si el TV avisa que se desconectó (`loungeScreenDisconnected`) o no aparece; vuelve a
  «conectado» solo cuando el TV regresa. Si está sonando, cuenta como conectado.
- Navegador (sin canal en vivo): el panel en vivo pregunta cada 25 s (antes 8 s). La revisión de la cola sigue
  cada 12 s (la necesita para saber a tiempo cuándo acaba cada canción).

## Pruebas
- `estable.js` 8/8: 3 min de silencio del TV sin reabrir sesión; TV que se apaga y vuelve; navegador sin saludos
  seguidos. Regresión de música/TV.
