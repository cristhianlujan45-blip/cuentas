# Vento 1.17.1: Música — la transmisión al TV sigue sola y no borra canciones

## Qué fallaba

### YouTube del TV (conectado con código o con Chromecast)
- Cuando el TV estaba quieto, Vento le mandaba **una sola canción** con «setPlaylist». Eso **reemplazaba la cola del TV**: las canciones que ya estaban esperando se borraban. Además, al acabarse esa canción el TV no tenía siguiente.
- Si el TV no arrancaba, Vento probaba con «next». Si sí había algo sonando, **se saltaba la canción**.
- Al mandarla, Vento daba la canción por terminada al instante: **desaparecía de la cola** y nunca llegaba al historial. Si el TV no la tenía, nadie se enteraba y la música se detenía.
- Al reconectarse el TV solo, la siguiente canción que llegaba **cortaba la que sonaba**.

### Pantalla del TV (tv.html)
- Algunos navegadores de TV no dejan sonar solo con audio. El TV tomaba eso como «versión mala»: Vento cambiaba de versión una y otra vez y, a la quinta, **borraba la canción**.
- Cuando Vento mandaba otra versión de una canción mala, el TV ya la tenía como «tocada» y **nunca la ponía**.
- Algunos TV no avisan cuando se acaba el video, así que **no pasaba a la siguiente**.

### Lista de YouTube y Chromecast sin puente
- Las canciones agregadas a tu lista de YouTube **desaparecían** de la cola de Vento.
- Con Chromecast sin puente, las canciones no quedaban como «sonando» ni pasaban al historial.

## Arreglos

- **Cola completa:** cuando el TV está quieto, se le pone la cola entera que falta, no una sola canción. Si ya está sonando, las nuevas se agregan **al final**. Ya no se usa «next» a ciegas.
- **Vento vigila el TV:** cada 12 s, solo mientras haya canciones de Vento en el TV, mira qué tiene puesto. Con eso:
  - marca cuál suena, con su tiempo real;
  - pasa al historial la que terminó;
  - si el TV se quedó sin siguiente (se acabó su cola o se fue a un video recomendado), le pone la que falta;
  - no corta lo que alguien más haya puesto, ni algo en pausa.
- **Las mandadas siguen a la vista:** en Música aparece la sección «📺 Ya en el TV» (en la cola del TV, o en tu lista de YouTube) con el orden en que suenan.
- **Saltar** funciona también cuando suena en el YouTube del TV y en Chromecast.
- **Reconexión sola:** ya no corta la canción de Vento que está sonando.
- **tv.html:**
  - Si el TV no deja sonar solo, primero se le da «play». Si sigue quieto, se pone sin sonido y aparece «toca OK para escuchar». Ya no se toma como versión mala.
  - Las versiones malas se recuerdan por video, así que la otra versión de la misma canción sí suena.
  - Si el reproductor no avisa el final, igual detecta que terminó y pasa a la siguiente.

## Lo que NO se tocó

Se dejaron igual:
- los enlaces de YouTube Music, sus QR, la integración con Google y el orden justo de la cola;
- los QR físicos y los datos guardados.

Solo se corrigió cómo se mandan y se siguen las canciones en el TV.

## Pruebas

- **TV simulado con el protocolo del YouTube del TV:** 14/14. Con la versión anterior fallaban la cola completa, la sección «Ya en el TV» y el seguimiento.
- **Pantalla del TV con reproductor simulado:** 13/13. Con la versión anterior fallaban 6: audio bloqueado tomado como versión mala, no seguía tras el final y no ponía la otra versión.
- **Pruebas anteriores, todas bien:** e2e, todos los tipos de negocio, pedidos, música 10/10, app 22/22, Google 15/15, servidor 68/68.

## Nota honesta

El control del YouTube del TV usa el mismo sistema que los celulares al «vincular con código de TV». No es una API pública de Google, así que YouTube lo puede cambiar. Si un TV no aceptara la cola completa de una vez, Vento igual le pone la siguiente cuando ve que se quedó sin música.
