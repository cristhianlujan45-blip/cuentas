# Vento 1.19: música en el TV sencilla + micrófono fijo

## Pantalla «Música en el TV»: un solo botón

- **«📡 Transmitir al TV».** Abre la lista de TV y TV Box del wifi que muestra Chrome: los que tienen Chromecast integrado, que incluye Google TV, Android TV y la mayoría de TV Box.
  - Al elegir uno, la app de YouTube se abre en el TV y Vento le manda la cola completa.
  - Las canciones nuevas que piden las mesas entran solas al final.
  - Se ve «📺 YouTube abierto en «TV Sala»».
- **Plegado debajo:**
  - «¿Tu TV no aparece? Conectar con el código del TV», para Smart TV LG/Samsung y TV Box sin Chromecast;
  - «Otras formas»: Pantalla del TV y lista de YouTube Music.
- **Quitados de la vista:**
  - los botones que abrían YouTube o YouTube Music afuera, en el celular;
  - el selector de varias opciones;
  - «Cargar en mi lista» y «Abrir lista» repetidos.
- **Con el TV conectado, «▶ Siguiente» y el cronómetro ya no abren YouTube Music en el celular:** la música va al TV.
- **El modo viejo «abrir YouTube y mandar al TV» se apaga**, así ya no salen avisos de «Mandar al TV».
- **Si el navegador no puede mostrar la lista** (Brave, o un navegador sin Chromecast), sale un aviso con dos salidas:
  - «Abrir Vento en Chrome»;
  - «Conectar con el código del TV».
- **Al elegir el TV en la lista, la música arranca allá sí o sí**, aunque Vento creyera que ya sonaba algo.

## Micrófono flotante: fijo en su esquina

Arrastrarlo hacía que se moviera y se deslizara solo en varios celulares. Ahora:
- queda fijo abajo a la derecha, encima de la barra;
- no se arrastra y no se mueve con el scroll ni con la barra del navegador;
- la posición vieja guardada se borra.

## Pruebas

- **Punta a punta con una lista de TV simulada: 12/12.**
  - un solo botón;
  - nada abre YouTube afuera;
  - la lista sale, se elige el TV y las 3 canciones llegan;
  - la nueva entra al final;
  - «Siguiente» no abre YouTube afuera;
  - el micrófono es fijo y no se mueve.
- **Además:** TV que informa / no informa, código de TV, pantalla del TV, e2e, todos los negocios, pedidos y música.

## Límite honesto

Una página web no puede ver por sí misma los aparatos del wifi. La lista que muestra Chrome trae los que tienen Chromecast integrado. Los Smart TV sin Chromecast (LG webOS, Samsung Tizen) no salen en ninguna lista de una página web: para esos está «Conectar con el código del TV».
