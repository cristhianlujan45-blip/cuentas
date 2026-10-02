# Vento para Android (APK)

La app abre la misma Vento de siempre (https://cristhianlujan45-blip.github.io/cuentas/), así que cada
mejora de Vento le llega sola, sin reinstalar. Le suma lo que un navegador no deja hacer:

| Qué | Cómo |
|---|---|
| **Todos los TV del wifi** (LG webOS, Samsung, TV Box, Android TV, Fire TV, Chromecast) | Búsqueda SSDP/DIAL en la red local, la misma que usa la app de YouTube (`BuscadorTV.java`) |
| **Conectar sin escribir códigos** | Abre YouTube en el TV por DIAL con un código de vinculación (`pairingCode`) y Vento se vincula con ese código (sistema «Vincular con código de TV») |
| Micrófono (dictado) y voz de Laya | Reconocedor de voz y lectura en voz alta de Android (puente `window.VentoAndroid`) |
| Cámara y galería (facturas) | Selector de archivos nativo con cámara |
| Respaldos y reportes | Se guardan en Descargas/Vento |
| Botón Atrás | Cierra la ventana abierta de Vento |
| Pantalla encendida | Mientras Vento está abierta |

## Descargar

https://github.com/cristhianlujan45-blip/cuentas/releases/latest/download/vento.apk

GitHub la compila solo (`.github/workflows/android.yml`) cada vez que cambia esta carpeta.

## Firma

`vento-apk.jks` es la firma para instalar fuera de la Play Store. Es la misma en todas las versiones,
así cada una se instala encima de la anterior sin borrar nada. Para publicar en la Play Store se usa
la firma de Google Play (App Signing).

## Lo que sigue pidiendo el navegador

- **Conectar Google (YouTube Music) se hace una vez desde Chrome** con la misma cuenta de Vento Nube. La app
  usa esa conexión guardada en el Servidor Vento. Google no deja iniciar sesión dentro de una app así.
- **El puente del YouTube del TV** (paso 1 de «Conectar con el código del TV») tiene que estar configurado.
  Es el mismo de antes.
