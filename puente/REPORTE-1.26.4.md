# Vento 1.26.4 — Vuelve el sistema de conexión con el TV de la 1.22 (el que funcionaba)

## Qué pasaba
Desde la 1.23 la app de Android abría un «canal en vivo» con el YouTube del TV. Ese canal nunca se pudo probar
contra el YouTube real (solo contra uno simulado). Si YouTube lo rechaza, Vento entraba en un **ciclo**: soltaba la
sesión y se volvía a conectar cada ~2 s, sin fin. Así el TV «se conectaba y desconectaba», no se podía conectar bien
y las canciones pedidas por el QR no alcanzaban a llegar al TV. Todo coincide con lo reportado desde la 1.23.

## Qué cambió
- El canal en vivo queda **apagado**: Vento vuelve a saludar y revisar el TV cada pocos segundos, como en la 1.22.
- Si algún día se prende y YouTube lo rechaza, se deja de usar **sin tumbar la conexión** (antes soltaba la sesión).
- Se mantiene lo bueno de después: la lista de aparatos, conectar primero abriendo YouTube con código (como la 1.22),
  segundo intento, saludo con reintentos y aviso real, voz a la primera, notificaciones, etc.

## Prueba de punta a punta (`qrtv.js`)
App de Android sin canal en vivo: se toca el LG → conectado → 3 clientes piden canciones por el QR → las tres
llegan a Vento y al TV en orden (la 1.ª arranca, las otras entran detrás sin cortar) → 40 s sin ciclo de reconexión
→ sigue conectado. Regresión completa.
