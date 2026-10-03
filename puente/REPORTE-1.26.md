# Vento 1.26 — TV al que ya transmites, buscador de ajustes y notificaciones del celular (APK 1.0.10)

## El TV al que ya estás transmitiendo
- La lista de «TV conectados» de YouTube sale de la cuenta de Google (privada de Google): Vento no la puede leer.
- Lo que SÍ se puede (API pública de Android): con el permiso **«Acceso a notificaciones»** (Ajustes del celular,
  lo pide Vento con un toque), Vento ve la música que ya suena desde el celular — YouTube Music, YouTube,
  Spotify… — y **en qué aparato** suena («YouTube on TV», un Chromecast…), tal como lo muestra la app en su aviso.
- Sale en «📺 Dispositivos» y arriba en la lista de TV: «📡 YouTube on TV · ▶ Depende · Jarabe De Palo — desde
  YouTube Music», con **⏸/▶ y ⏭** que controlan ese reproductor (lo que suena en el TV).
- Para mandarle las canciones de las mesas a ese TV: «🔗 Mandarle las canciones…» → vincular una vez con su
  código (no se corta lo que suena).
- Vento solo mira los reproductores de música; no lee ni guarda mensajes de otras apps.

## 🔎 Buscador en Ajustes
Arriba de las categorías: busca en títulos, opciones, botones y explicaciones (con sinónimos: notificación →
avisos, clave → contraseña, QR, IVA, música, TV, correo…). Tocar un resultado abre la categoría y resalta la opción.

## 🔔 Notificaciones del celular (Ajustes → primera categoría)
- Estado real: si «Mostrar notificaciones» está apagado, o si «Pedidos y cuentas» / «Canciones pedidas» no salen
  flotantes, en la pantalla de bloqueo o sin sonido.
- **Activar las notificaciones** (pide el permiso o abre la pantalla de notificaciones de Vento), **abrir las
  notificaciones de Vento**, guía de qué prender (Mostrar, flotantes, pantalla de bloqueo, sonido, vibración),
  probar el aviso, inicio automático y batería.
- Si están apagadas, al abrir la app sale una barra roja «🔕 … [Activar]».

## Pruebas
- `ajustes2.js` 14/14, Java compila, regresión completa.
