# Vento 1.24 — Seguridad de entrada, Laya y diagnóstico de TV (APK 1.0.7)

## Seguridad para entrar
- **👁 Ver la contraseña** mientras se escribe, en TODOS los campos de contraseña (entrada, recuperar,
  usuarios, Vento Nube, bloqueo). Al entrar vuelve a quedar oculta.
- **Recuperar la contraseña por correo**: en Ajustes → Negocio → «📧 Correo de recuperación» se guarda el
  correo (se comprueba con un código antes de guardarlo). En «¿Olvidaste tu contraseña?» → «Enviarme un
  código al correo» llega un **código de 6 números** (vence en 15 min) para poner la contraseña nueva.
  Sirve igual en el navegador y en la app de Android. Los códigos de papel siguen funcionando.
  El correo lo manda el Servidor Vento (Supabase); el flujo «Servidor Vento» deja la plantilla con el código.
- **Vento Nube**: «¿Olvidaste tu contraseña? Te mando un código al correo» en su ventana de entrada.
- **🔒 Bloqueo automático** (Ajustes → Negocio): tras 5/15/30/60 min sin uso la app se tapa y pide la
  contraseña. No recarga: pedidos, música y TV siguen trabajando debajo. Con límite de intentos.
- Se mantiene: bloqueo tras varios intentos fallidos y códigos de recuperación de un solo uso.

## Laya
- **Apagar sus avisos**: Ajustes → Laya IA → Piloto automático → «🔔 Avisos de Laya en pantalla», o
  diciéndole «Laya, desactiva tus notificaciones» / «Laya, activa tus avisos». Los avisos quedan guardados
  en «Avisos recientes».
- **Más cosas**: «¿qué está sonando?», «salta la canción», «pausa la música», «sigue con la música»,
  «pon la canción …» / «agrega … a la cola», «¿cuántas canciones hay en la cola?», «busca los TV».

## TV del wifi (app de Android)
- **Informe de la búsqueda** («🔍 Detalles de la búsqueda» en la lista, con «Copiar detalles»): si hay wifi,
  si el buscador de Google respondió y qué vio, cuántos Chromecast por mDNS, respuestas SSDP, puertos
  abiertos del barrido. Con eso se sabe exactamente por qué un TV no sale.

## Pruebas
- `segur.js` 13/13, `laya2.js` 9/9, Java (diagnóstico), regresión completa.
