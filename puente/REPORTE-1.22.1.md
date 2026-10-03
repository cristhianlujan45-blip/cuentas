# Vento 1.22.1 — Dispositivos como en YouTube

## Qué pidió el negocio
En YouTube Music salen «YouTube on TV · Reproduciendo YouTube», «[LG] webOS TV LM6300PDB» y
«TV_BA82 · Reproduciendo YouTube» (el TV de afuera). En Vento no salía el que ya está sonando.

## Qué cambió
- **Lista «📺 Dispositivos»** en Música → Música en el TV, con:
  - el TV conectado a Vento («✓ Conectado a Vento · Reproduciendo YouTube / En pausa»);
  - los TV que se vincularon antes con su código («YouTube on TV»), para volver a ellos con un toque;
  - en la app de Android, los TV del wifi (se buscan solos al abrir Música, máx. 1 vez por minuto, y
    con «🔄 Buscar TV en el wifi»), con **«▶ Reproduciendo YouTube»** cuando tienen YouTube abierto.
- **Tocar un TV pasa la música de las mesas a ese TV.** Si ese TV ya está sonando, Vento se vincula
  con el `screenId` que el TV dice por DIAL (sin volver a abrir YouTube) y las canciones de las mesas
  se agregan **al final** de lo que suena: no corta la música.
- App Android (BuscadorTV): lee el estado de la app YouTube en cada TV (DIAL `<state>running</state>`,
  `<additionalData><screenId>`) y el «rs» de los Chromecast («YouTube» = Reproduciendo YouTube).
- El panel «En vivo» deja abajo solo los controles conectados a ese TV (el celular con YouTube Music).

## Límites (sin inventar)
- Desde el navegador no se pueden buscar los TV del wifi: eso solo lo hace la app de Android.
- La cuenta de Google del TV (p. ej. Modesta Isabel Carrillo) no importa para conectarse: Vento entra
  como control remoto, igual que YouTube.

## Pruebas
- `dispos.js` 10/10 (los tres dispositivos de la captura, cambio a TV_BA82 sin cortar).
- Java: TV falso por SSDP/DIAL con YouTube abierto → `youtube:true, screenId` detectados.
- Regresión: vivo, lng, lng2, lng3, tv2, apk, flujo, puentevis, probar, cast2, v119.
