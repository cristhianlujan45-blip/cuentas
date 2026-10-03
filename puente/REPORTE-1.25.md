# Vento 1.25 — TV Box (onn / Google TV), avisos con la app cerrada (APK 1.0.9)

## TV Box onn (Google TV) y aparatos que «no salían»
- Algunos Google TV / TV Box solo dan su dirección IPv6, o no dejan abrir YouTube desde el wifi: antes
  Vento los **botaba** de la lista. Ahora salen igual (por su nombre, con «▶ Reproduciendo YouTube» si lo
  dicen) y se conectan con el código del TV. Si después llega su dirección completa, se reemplaza (no se
  repite).
- En la lista hay siempre **«🔗 Vincular con código de TV»** (como en YouTube): sirve para cualquier TV o TV
  Box, esté o no en el mismo wifi (también los que YouTube muestra por la cuenta de Google: «YouTube on TV»).
- Vincular con código un TV que **ya está sonando** ya no corta su música: las canciones de las mesas entran
  detrás.

## Todo tipo de aparatos (TV Box genéricos / «onn» no original)
- Búsqueda SSDP también de **reproductores** (MediaRenderer / DLNA) y de todo lo que conteste: los TV y TV Box
  sin forma de abrir YouTube desde el wifi salen igual (routers, impresoras y discos de red no).
- mDNS: además de Chromecast y Android TV, Fire TV (`_amzn-wplay`), Android TV remoto viejo y AirPlay.
- Barrido de todo el wifi por **11 puertos a la vez** (~3–4 s): Chromecast/Android TV, LG, Samsung, Roku,
  Philips, control remoto de Android TV (6466), **depuración de TV Box Android genéricos (5555)**, AirPlay,
  Cast seguro. El nombre sale del router (p. ej. «onn-4k») o «TV Box Android (dirección)».
- Esos aparatos se conectan con «Vincular con código de TV» (en la misma lista).
- Prueba Java: caja genérica que solo se anuncia como reproductor → sale; caja con solo el puerto 5555 → sale.

## Avisos con la app cerrada (Android)
- **Aviso del celular con sonido y vibración** cuando la app está cerrada, en segundo plano o con la pantalla
  apagada: pedido nuevo (QR / meseros), domicilio, «pide la cuenta» / «ya pagué», canción pedida y avisos de
  Laya (si están prendidos). Canales: «Pedidos y cuentas» y «Canciones pedidas» (importancia alta), «Avisos
  de Laya». Tocar el aviso abre Vento.
- **🚀 Permitir que Vento arranque sola**: abre el permiso de inicio automático de cada marca (Xiaomi, Huawei,
  Oppo, Vivo, Samsung…), que es lo que esas marcas usan para cerrar apps de fondo.
- **🔔 Probar el aviso con sonido**.
- Sigue: servicio de fondo con aviso fijo, latido cada 5 s, recepción de pedidos despierta.

## Pruebas
- `avisos.js` 9/9, Java compila, regresión completa.
