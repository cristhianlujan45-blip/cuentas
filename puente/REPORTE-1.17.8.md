# Vento 1.17.8: YouTube del TV vuelve a cargar las canciones

## Qué pasaba

El TV del negocio **nunca informa su estado**. En el registro siempre sale «el TV está no se sabe», incluso cuando está sonando.

Desde la 1.17.1, Vento tomaba ese silencio como «el TV no está sonando» y le volvía a mandar la cola. Con eso:
- reiniciaba la canción una y otra vez (en la prueba: 3 veces en 40 s), y nunca terminaba de cargar;
- las canciones se quedaban marcadas «en el TV» sin sonar.

Antes de la 1.17.1, Vento confiaba en el TV y por eso funcionaba.

## Arreglo

- **Vento aprende si el TV informa su estado.** Se recuerda la primera vez que dice que está sonando o qué video tiene puesto.
- **TV que no informa (el del negocio):** se vuelve al comportamiento de antes:
  - una sola orden para arrancar (`setPlaylist` con la primera) y las demás al final (`addVideo`);
  - un «play» por si acaso, y no se le reenvía nada más.
  - Las canciones avanzan en Vento por la **duración real** de cada video: la que toca se ve en «Sonando» y la que ya terminó pasa al historial.
  - Solo se saluda al TV una vez por minuto.
- **TV que sí informa:** se mantiene la revisión de 1.17.1–1.17.3:
  - ve qué suena;
  - repone la siguiente si se queda sin cola, con máximo 3 intentos.
- **Arreglo de datos (una vez):**
  - las canciones que quedaron atascadas «en el TV» en las últimas 3 h vuelven a la cola y se mandan bien;
  - las más viejas pasan al historial;
  - no se borra ninguna.

## Pruebas

- **TV que nunca informa (como el del negocio):** 8/8.
  - Con la versión 1.17.7 la misma prueba falla 4: reinicia la cola 3 veces y las canciones quedan atascadas.
  - Órdenes que recibe el TV ahora: `setPlaylist(1ª) → addVideo(2ª) → play → addVideo(nueva) → play`.
- **TV que sí informa:** 24/24.
- **Pantalla del TV (tv.html):** 17/17.
- **Generales:** e2e y música.
