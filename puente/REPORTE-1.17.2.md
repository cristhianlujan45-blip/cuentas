# Vento 1.17.2: Música en el TV — más resistente a fallas

La versión 1.17.1 corrigió que no siguiera con la siguiente canción y que se borraran. Esta versión refuerza las mismas funciones contra lo que pasa en un negocio real: internet que se cae, puente lento, TV que se queda mudo.

## YouTube del TV (código / Chromecast)

- **Tiempo límite de 15 s por llamada.** Antes, si una llamada al puente se quedaba colgada (internet lento), la conexión con el TV quedaba «ocupada» para siempre: no se mandaba ni se revisaba nada más y la música se paraba.
- **Seguro de 90 s:** si un trabajo con el TV se queda pegado por cualquier razón, se suelta solo.
- **Espera progresiva:** si el puente o el internet fallan, ya no se insiste cada 4 s. Se espera 5 s, 10 s, 20 s… hasta 2 min. Al primer éxito vuelve al ritmo normal.
- **Revisión inmediata** al volver el internet o al volver a abrir Vento.

## Pantalla del TV (tv.html)

- **Internet caído en el TV:** un error del reproductor ya no se toma como «versión mala». Antes, Vento descartaba versiones buenas hasta borrar la canción. Ahora avisa «se cayó la conexión» y reintenta **la misma canción** cuando vuelve la red.
- **Video que se queda cargando** más de 45 s: se vuelve a cargar desde donde iba.
- **Conexión muda:** algunos navegadores de TV dejan la conexión abierta pero sin recibir nada. Si en 7 min no llega nada del celular, se reconecta sola. También se reconecta al volver el internet.
- **El reproductor de YouTube** se vuelve a cargar si no cargó al prender el TV.

## En el celular (modo pantalla del TV)

- Si la cola no se pudo mandar al TV, se reintenta a los 6 s, sin esperar al siguiente ciclo.
- El canal por el que el TV avisa qué suena y cuándo terminó se reabre solo si el navegador lo cerró, al volver el internet o al volver a Vento.

## Pruebas

- **Pantalla del TV:** 17/17. Incluye internet caído y vuelto (la misma canción suena) y conexión muda (se reconecta).
- **YouTube del TV:** 19/19. Incluye:
  - puente colgado: se suelta a los 15 s y la siguiente canción llega;
  - puente caído: pocos reintentos y se recupera solo al volver.
- **Pruebas anteriores:** e2e, todos los negocios, pedidos, música, app y Google.

Lo que NO se tocó: enlaces y QR de YouTube Music, integración con Google, QR físicos y datos guardados.
