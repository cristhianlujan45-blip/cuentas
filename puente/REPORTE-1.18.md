# Vento 1.18: TV vinculado con código suena de nuevo + micrófono flotante suave

## 1. Al poner el código del TV no sonaba nada

**Qué pasaba.** Vento lleva un «reloj» de la música que suena en el TV (desde la 1.17.9). Al vincular otra vez con el código, o con otro Chromecast, ese reloj seguía con la sesión anterior. Vento creía que el TV ya estaba sonando y solo le «agregaba» canciones a una cola que en el TV nuevo no existía. Al TV solo le llegaba «play», sin ninguna canción. La prueba con la versión 1.17.9 lo reproduce.

**Arreglo:**
- **TV nuevo = reloj en cero.** Pasa al poner el código, con otro Chromecast o al desconectar:
  - las canciones que esperaban vuelven a la cola y se mandan a ESTE TV, empezando una cola nueva;
  - la que «sonaba» en el TV viejo pasa al historial.
- **▶ tocado a mano siempre arranca la música en el TV**, aunque el reloj diga que suena: la persona está viendo que no suena. La reconexión automática sigue sin cortar lo que suena (1.17.9).

**Sobre «que aparezca la cuenta en el TV».** El TV muestra la cuenta de Google con la que inició sesión en su propia app de YouTube. Vento se conecta como control remoto «Vento», con el mismo sistema de «vincular con código de TV». Ese sistema no inicia sesión de una cuenta en el TV, y no hay una forma pública de hacerlo, así que Vento no lo inventa. Para que las canciones suenen no hace falta la cuenta en el TV. Si se quiere ver la cuenta, se inicia sesión una vez en la app de YouTube del TV.

## 2. Botón flotante del micrófono

- **Mientras se arrastra**, se mueve con `transform` (lo dibuja la tarjeta gráfica): sigue al dedo sin temblar ni ir a saltos.
- **No se sale de la pantalla** ni se mete debajo de la barra de abajo.
- **Al soltar**, se pega al borde más cercano con una animación corta, desde donde quedó (sin brincos).
- **Ya no se desliza solo** cuando la barra del navegador aparece o desaparece al hacer scroll, o cuando sale el teclado. Solo se acomoda al girar el celular o si quedara por fuera.
- **Arrastrar no prende el micrófono.** Tocarlo sí, como siempre.

## Pruebas

- **Vincular con código + ▶ + micrófono:** 8/8. Con la versión 1.17.9 fallan 4: al poner el código no sonaba nada, ▶ no arrancaba y el arrastre iba a saltos.
- **Además:** TV que informa (24/24), TV que no informa (11/11), pantalla del TV (17/17), e2e, todos los negocios, pedidos y música.
