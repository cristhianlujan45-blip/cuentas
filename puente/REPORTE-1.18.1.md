# Vento 1.18.1: transmitir a todo tipo de dispositivos

## Qué pasaba

Al tocar transmitir solo salían algunos aparatos de Google.

- El botón «Chromecast» abre la lista de Chrome. Esa lista solo muestra aparatos con **Chromecast integrado**: Chromecast, Google TV y algunos Android TV o TV Box.
- Los Smart TV (LG, Samsung), los TV Box sin Chromecast, Fire TV, consolas y «YouTube on TV» nunca salen ahí. Solo los encuentra la app de YouTube o el «código de TV».
- El dueño usa **Brave**. En Android, Brave no trae la función de transmitir de Chrome, así que esa lista sale vacía o casi vacía.

## Arreglo

El botón ahora se llama **«📡 Buscar mi TV o TV Box (todos los dispositivos)»** y abre un selector con cada camino:

1. **Cualquier TV o TV Box con YouTube**, con el código del TV. Sirve para Smart TV LG/Samsung, TV Box, Fire TV, Android TV y consolas. Vento le manda las canciones solo, aunque el wifi no deje ver el TV.
2. **Todos los de mi wifi en la app de YouTube:** abre YouTube en el celular y el ícono de transmitir muestra todos los aparatos.
3. **Chromecast / Google TV:** la lista de Chrome.
4. **TV con navegador:** la Pantalla del TV.

Además:
- En Brave el selector sale de una vez y explica por qué. En Android ofrece «Abrir Vento en Chrome».
- En Chrome, si se cierra la lista sin elegir o no hay aparatos con Chromecast, aparece el selector.

## Pruebas

- **Selector:** 5/5. Cubre Brave en Android, el botón al código del TV y Chrome sin aparatos con Chromecast.
- **Además:** vincular con código (8/8) y e2e.
