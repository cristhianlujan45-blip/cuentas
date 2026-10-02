# Vento 1.20: app para Android (APK) que encuentra todos los TV del wifi

## Qué es

Una app de Android que abre la misma Vento (se actualiza sola) y le agrega:

- **«Transmitir al TV» con TODOS los TV del wifi**, igual que la app de YouTube: LG webOS, Samsung, TV Box, Android TV / Google TV, Fire TV y Chromecast, en una sola lista. Un navegador no deja hacer esa búsqueda; una app instalada sí.
- **Conecta sola al tocar el TV:**
  - abre YouTube en el TV con un código de vinculación (protocolo público DIAL);
  - Vento se vincula con ese código, que es el mismo sistema de «Vincular con código de TV», pero sin escribir nada;
  - desde ahí, la cola de las mesas suena allá sola, en orden, y las nuevas entran al final.
- **Micrófono, voz de Laya, cámara de facturas, descargas y botón Atrás** funcionando dentro de la app.

## Descarga

https://github.com/cristhianlujan45-blip/cuentas/releases/latest/download/vento.apk

GitHub la compila y la publica sola.

## Pruebas

- **Buscador nativo (el código Java de la app) contra un TV LG simulado en la red local:**
  - lo encontró con su nombre «[LG] webOS TV LM6300PDB», fabricante y modelo;
  - le abrió YouTube con el código de vinculación: el TV respondió 201 (abierto).
- **Vento dentro de la app (puente nativo simulado): 11/11.**
  - lista con el LG y el TV Box;
  - tocar el LG abre YouTube, se vincula solo y la cola llega;
  - «Conectado a [LG] webOS TV»;
  - voz con resultados parciales y finales;
  - descargas;
  - botón Atrás.
- **El código Java compila sin errores** contra Android 14.
- **Además:** todas las pruebas de música, TV, pedidos y negocios.

## Lo que falta probar de verdad

- **La prueba con el TV real del negocio:** desde aquí no hay un TV LG real.
- **Si el TV no acepta la vinculación automática:** queda el código del TV, igual que antes.
- **Google (YouTube Music):** se conecta una vez desde Chrome con la misma cuenta de Vento Nube, porque Google no deja iniciar sesión dentro de una app así. La app usa esa conexión.
