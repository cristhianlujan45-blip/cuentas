# Pruebas automáticas de Vento

Cada archivo `*.test.js` abre Vento en un Chromium sin ventana, hace lo que haría una persona
(entrar, anotar pedidos, hablar, cobrar…) y revisa el resultado. No usan internet ni datos reales:
el micrófono, la APK y los servicios externos se simulan.

| Prueba | Qué revisa |
|---|---|
| `hola` | «Hola Vento» manos libres: palabra de activación, conversación seguida, apagar/prender |
| `holaapk` | Lo mismo dentro de la APK simulada + botón de permisos |
| `voz1ra` | El micrófono escucha a la primera (frases cortas que Android da como parciales) |
| `vozundo` | Deshacer / repetir pedidos por voz y preguntas de cuenta |
| `divtest` | Dividir la cuenta entre N personas |
| `suscrip` | Prueba gratis, licencias firmadas, bloqueo al vencer (con una llave de prueba temporal) |
| `suscripnube` | Suscripción con Vento Nube (servidor simulado que firma con una llave temporal): planes → Nequi/DaviPlata → comprobante (foto JPEG, idem, doble toque), pago en revisión sin premium, PRO activo, vencido (deja vender), rechazado con motivo, RENOVAR, token alterado, sin internet hasta «h», flag a mano, cambio de celular y mesero sin pagos |
| `googletest` | Entrar con Google (Vento Nube simulada) |
| `tvocupado` | Conectarse al TV aunque otro celular ya esté conectado |
| `esc` | Computador: Enter abre la mesa, Esc la cierra, ancho de pantalla grande |
| `pasos` | Tarjeta «Primeros pasos» para negocios nuevos |
| `sonidos` | Sonidos POS (`lib/vento-sonidos.js`): + suena «tún», − suena «tic», favorito, escáner (sin pitar encima), voz «mesa 1 cinco águilas» y lista de 10 productos = UN sonido, pedidos del QR sin sonido, cobrar mesa / persona / venta rápida = éxito, volumen Bajo por defecto, Ajustes → 🔊 Sonidos (apagar «al quitar», volumen, Probar), pestaña oculta y micrófono abierto sin sonido, un solo AudioContext y 3 búferes reutilizados, también en la APK con «Hola Vento» |
| `servidor` | Servidor de suscripciones con PostgreSQL 16 real (sin navegador): prueba gratis, pago Nequi/DaviPlata con comprobante, revisión y aprobación del admin (también dos a la vez), renovación, rechazo, vencimiento y cron, duplicados, token firmado, RLS y permisos. Está en `servidor/suscripciones.test.js` |
| `adminsub` | Panel de Administrador → 💳 Suscripciones (servidor y supabase-js simulados): entrar con la cuenta de Vento Nube, aviso claro si no es administradora, pagos pendientes, ver comprobante, aprobar (confirma inicio y vencimiento), rechazar con motivo obligatorio, suscripciones (filtro, dar meses, cambiar plan, cancelar), negocios con resumen y detalle, planes, configuración del cobro, textos peligrosos escapados, celular y computador |
| `adminsubreal` | El mismo panel contra el «Supabase local» REAL (PostgreSQL 16 + la función de verdad): un dueño paga con comprobante en dos negocios, otro usuario hecho administrador entra, ve los pendientes, abre el comprobante, aprueba (en la base: suscripción activa y vence +1 mes) y rechaza otro con motivo. Se omite si no hay PostgreSQL |

## Cómo correrlas

```bash
cd pruebas
npm install
npx playwright install chromium
cd ..
bash pruebas/correr.sh            # todas
bash pruebas/correr.sh hola pasos # solo algunas
```

El script levanta un servidor local en el puerto 8765 si no hay uno. Al final dice
«✅ Todas las pruebas pasaron» o cuál falló.

La prueba `servidor` necesita PostgreSQL 16 (si no está instalado se omite y lo avisa). Crea su propia base
desechable con todas las migraciones y la borra al terminar. El mismo «Supabase local» sirve para las pruebas
del navegador que usan Vento Nube: ver `servidor/LEEME.md`.

Regla del equipo: **antes de publicar un cambio, correr todas las pruebas.**
Las pruebas del panel de Administrador (`adminsub`, `adminsubreal`) no usan el código personal del proveedor: ocultan ese
bloqueo desde la prueba (solo protege la llave de las licencias); la seguridad de las suscripciones la hace el servidor.
