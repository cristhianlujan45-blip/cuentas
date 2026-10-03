# Vento 1.20.1 (app Android 1.0.2): puente incluido y todo tipo de aparatos

## Puente incluido en la app

Dentro de la app de Android ya no hay que crear ni configurar el puente de Cloudflare. La app le habla directo a YouTube (`www.youtube.com/api/lounge/…`), igual que el puente: una app instalada no tiene el bloqueo del navegador. En la página web, el puente de siempre sigue funcionando igual.

## Más aparatos en la lista

La app busca por dos caminos a la vez:

| Camino | Aparatos |
|---|---|
| SSDP / DIAL | Smart TV LG webOS, Samsung, TV Box, Fire TV, Roku y muchos Android TV |
| mDNS `_googlecast._tcp` | Chromecast, Google TV y TV Box / TV con Chromecast integrado |
| mDNS `_androidtvremote2._tcp` | Android TV (Sony, TCL, Xiaomi…) |

- Si un aparato sale por los dos caminos, aparece una sola vez.
- A los Chromecast y Android TV se les abre YouTube por su servidor DIAL (puerto 8008), como lo hace la app de YouTube.
- Si un aparato no deja abrirlo así, sale igual en la lista con la nota «Se conecta con su código de TV», y al tocarlo Vento lleva al campo del código.

## Pruebas

- **Vento dentro de la app, sin puente configurado: 12/12.**
  - la lista muestra el LG webOS, el TV Box, el Chromecast y el Android TV;
  - tocar el LG abre YouTube y se vincula solo;
  - la cola llega con el puente incluido;
  - voz, descargas y botón Atrás funcionan.
- **Buscador nativo contra el TV LG simulado:** lo encuentra y le abre YouTube (201).
- **Código Java:** compila sin errores.
- **Además:** todas las pruebas de música, TV, pedidos y negocios.

## No se pudo probar aquí

- La búsqueda por mDNS (Chromecast / Android TV): necesita un celular Android de verdad en el mismo wifi.
- Un TV real.
