# Vento 1.19.2: música de punta a punta, teclado al abrir mesa y micrófono

## Música, revisada de punta a punta (prueba con tiempos reales cortos)

Lo que se probó:
1. Las mesas piden canciones.
2. Vento busca cada una en YouTube.
3. Entran a la cola justa.
4. Se toca «Transmitir al TV» y se elige el TV.
5. Al TV le llegan todas en orden.
6. Una nueva no corta la que suena: entra al final.
7. La canción termina, pasa al historial y sigue la siguiente.

Resultado: 9/9.

**Falla real corregida:** con Google conectado, las canciones pedidas ANTES de conectar el TV se iban a la lista de YouTube y quedaban como «ya mandadas». Al conectar el TV nunca le llegaban. Ahora, al conectar un TV, las que no han sonado (últimas 3 h) pasan a la cola del TV.

**Lista de Chrome vacía:** pasa con TV sin Chromecast, como el LG webOS del negocio. Si se cierra la lista, se abre directo «Conectar con el código del TV». Si el puente ya está configurado, esa sección queda solo con el campo de los 12 números.

## Teclado al abrir una mesa

Al abrir una mesa o cuenta sin nombre, el cursor se ponía solo en «¿A nombre de quién?» y salía el teclado. Ya no: se escribe solo si se toca el campo. Prueba en bar, restaurante, taller y tienda: el teclado no sale.

## Micrófono flotante

- Se puede **mover otra vez** (arrastre suave) y al soltarlo se pega al borde.
- **Ya nada lo mueve solo:** se quitó el reacomodo automático cuando «parecía tapado», que era lo que lo hacía moverse. Solo vuelve a su esquina si queda de verdad fuera de la pantalla.

Prueba: se mueve al arrastrarlo; queda quieto 5 s después; no se mueve con la barra del navegador.

## Por qué la app de YouTube ve el TV LG y una página web no

El «[LG] webOS TV» no tiene Chromecast. La app de YouTube lo encuentra con DIAL y su propio sistema, que solo las apps instaladas pueden usar: Chrome no le da eso a ninguna página web, y ni una VPN ni un DNS lo cambian. «YouTube on TV» en esa misma lista es un TV vinculado con código.

Para ese TV, lo que funciona desde Vento es el **código del TV**: es el mismo «Vincular con código de TV» que usa YouTube. Con eso Vento le manda las canciones solo.
