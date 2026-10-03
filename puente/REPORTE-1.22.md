# Vento 1.22 — Música en vivo en el TV

## Qué pidió el negocio
Que en Vento salga el aparato que está sonando (como en YouTube), que se vea la canción que suena
—aunque la haya puesto otro celular con su cuenta de Google— y lo que hay en la lista, que deje
agregar canciones y que todo se vea en vivo.

## Qué cambió
- **Panel «🔴 En vivo en el TV»** (Música → Música en el TV), visible cuando el TV está conectado:
  - **Aparatos**: el TV (con marca y modelo si el TV los dice, p. ej. «[LG] webOS TV …») con su
    estado (sonando / en pausa / conectado) y los demás conectados a él (el celular que le
    transmite desde YouTube o YouTube Music).
  - **Lo que suena**: miniatura, título, canal, quién la pidió (mesa, Caja u «otro celular»),
    estado y tiempo real que avanza cada segundo.
  - **Sigue en el TV**: la lista que el TV comparte; si no la comparte, las que Vento le mandó.
    Debajo, las que están entrando (buscando video / entrando al TV).
  - **Controles**: ⏸ Pausa / ▶ Seguir, ⏭ Siguiente, 🔄 Actualizar.
  - **➕ Agregar canción al TV**: entra a la cola de Vento a nombre de «🎧 Caja» (sin límite de
    canciones por mesa) y se manda al TV **al final** de su cola (addVideo), sin cortar lo que suena.
- En la **cola de música** sale arriba «📺 En el TV suena: …» cuando suena algo que no pidió una mesa.
- En la **lista de TV de la app Android**, el TV ya conectado sale de primero («🟢 YouTube en el TV»).
- Mientras la pantalla de Música está abierta, Vento le pregunta al TV qué pasa cada 8 s.

## De dónde salen los datos
Del mismo saludo al TV que Vento ya usaba (eventos `loungeStatus`, `nowPlaying`,
`playlistModified` del sistema «Vincular con código de TV»). Títulos: primero de las canciones de
Vento; si no, de YouTube Data API (la clave/cuenta ya configurada) o de noembed.com.
No se inventa nada: si el TV no comparte la lista completa, se muestra solo lo que Vento le mandó.

## Pruebas
- `vivo.js` 16/16 (TV de prueba con canción puesta desde otro celular, aparatos, tiempo, lista,
  agregar, pausa, siguiente, cambio de canción).
- Regresión: lng, lng2, lng3, tv2, apk, flujo, puentevis, probar, cast2, v119.
