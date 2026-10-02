# Vento 1.18.2: código de TV, un solo botón de transmitir y micrófono siempre visible

## 1. Al poner el código del TV no conectaba

Se encontraron dos fallas:
- **Espera de hasta 2 minutos:** si antes hubo errores con el TV (TV viejo apagado, internet caído), Vento esperaba hasta 2 min antes de volver a intentar, aunque se acabara de poner un código nuevo. Ahora, si el TV responde o se pone un código, se olvidan los errores viejos y se manda de inmediato.
- **Conexiones cruzadas:** la conexión con el código podía cruzarse con la revisión automática del TV que corría al mismo tiempo, y la sesión quedaba dañada. Ahora la conexión con el código tiene turno propio: espera a que termine la revisión, máximo 20 s.
- **El registro dice cada paso:** «buscando el TV con el código…», «el TV respondió», y el error exacto si falla. Si falla, el registro se abre solo.

Prueba: con errores viejos y una revisión del TV en curso, al poner el código el TV recibe las canciones de inmediato (9/9). Con la versión 1.18.1, la misma prueba no le manda nada al TV.

## 2. Un solo botón para transmitir

- **«📡 Transmitir (todos los dispositivos de tu wifi)».** Una página web no puede ver los aparatos de la red, porque el navegador no lo permite. Lo que sí los muestra **todos en un solo ícono** (Smart TV, TV Box, Android TV, Chromecast, Fire TV, consolas) es la app de YouTube / YouTube Music. El botón la abre de una vez con la lista puesta, sin preguntar nada.
- **«Solo Chromecast (lista de Chrome)»** queda aparte, como botón pequeño. En Brave explica por qué no funciona allí.

## 3. Micrófono flotante que no se veía

Hay un vigilante cada 2 s que lo devuelve a la vista si:
- quedó por fuera de la pantalla o debajo de la barra de abajo;
- una ventana quedó marcada como «abierta» pero ya no se ve. Eso escondía el micrófono por completo.

Las ventanas de verdad abiertas no se tocan: ahí el micrófono se aparta, como siempre, y vuelve al cerrarlas.

Prueba: 7/7 (fuera de la pantalla, debajo de la barra, ventana fantasma, ventana real, botón único de transmitir).

## Lo que NO se puede (dicho claro)

- **Ver en Vento la lista de aparatos de la red:** el navegador no deja que una página web busque aparatos en la red local. Por eso se usa el ícono de transmitir de la app de YouTube.
- **Poner la cuenta de Google en el TV desde Vento:** el TV muestra la cuenta con la que se inició sesión en su propia app de YouTube.
