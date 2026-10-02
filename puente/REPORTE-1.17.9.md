# Vento 1.17.9: YouTube del TV — la canción que suena ya no se corta

## Qué pasaba

Las canciones ya entraban al TV, pero cuando llegaba una nueva **cortaba la que estaba sonando**.

El TV del negocio no informa su estado. Por eso, al llegar una canción, Vento a veces la mandaba como cola nueva (`setPlaylist`), que reemplaza lo que suena. Pasaba en dos casos:
- cuando el TV se reconectaba solo (Chromecast), que pedía «arrancar ya»;
- cuando el cálculo de cuánto le quedaba a la música no incluía la canción que estaba sonando.

## Arreglo

- **Vento lleva el tiempo de la canción que suena**, con la duración real del video. También suma las que esperan en la cola del TV (más unos segundos por la carga de cada una).
- **Mientras ese reloj diga que suena música de Vento, las nuevas SOLO se agregan al final (`addVideo`).** Nunca se manda una cola nueva que corte la que suena, aunque el TV se reconecte solo o se toque ▶. Hay 30 s de margen.
- **Solo cuando ya terminó todo** se arranca una cola nueva.
- **«Sonando»** muestra el tiempo que lleva la canción en el TV. Antes se quedaba en 0:00.

## Pruebas (TV simulado que no informa su estado)

- **Versión nueva: 11/11.** La canción de 5 minutos sigue sonando, la nueva entra al final y «Sonando» muestra el tiempo real.
- **Versión 1.17.8 con la misma prueba: 9/11.** Ahí se ve el error que reportó el dueño: `setPlaylist(vidNueva)` cortaba la canción larga.
- **Además:** TV que informa (24/24), pantalla del TV (17/17), e2e y música.
