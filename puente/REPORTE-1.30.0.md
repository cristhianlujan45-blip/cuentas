# Vento 1.30.0 — Suscripciones beta (Nequi / DaviPlata), modo fácil de verdad, tienda sin mesas y micrófono al instante

## Qué cambió

- **Suscripciones de la beta, manejadas por el servidor.** Con el negocio en Vento Nube:
  1. El dueño elige un plan (Gratis o PRO).
  2. Paga por **Nequi** o **DaviPlata**.
  3. Envía la foto del comprobante.
  4. Un administrador de Vento lo aprueba en **Vento Admin → 💳 Suscripciones**.
  - La suscripción es de la **cuenta + el negocio**, no del celular: al cambiar de celular se recupera entrando con la cuenta.
  - Las funciones de cada plan (voz, lectura de facturas, cámara con IA, estadísticas, equipo…) llegan en un token
    **firmado por el servidor**. La app no decide sola.
  - Incluye prueba gratis (contada desde el lanzamiento para quien ya usaba Vento), vencimiento automático, renovación
    («Tu suscripción vence el …» + RENOVAR) y rechazo con motivo.
  - Ver `BETA_BILLING.md`.
  - Arquitectura lista para Google Play Billing: ver `FUTURE_GOOGLE_PLAY.md`.
  - Sin Vento Nube todo sigue como antes. Las licencias firmadas del sistema anterior siguen valiendo.
- **Panel de la mesa:**
  - Lo primero es **buscar y agregar productos**.
  - Renombrar, cambiar de mesa, combinar y reiniciar son iconos pequeños.
  - Personas y cliente quedan plegables, debajo de los productos.
- **Micrófono:** «Abriendo el micrófono…» tardaba porque «Hola Vento» tenía ocupado el reconocedor de Android. Ahora le pasa
  su sesión abierta al botón y escucha al instante. Lo mismo para el micrófono de producto por voz, el del asistente y el
  de la libreta.
- **Modo fácil nuevo:**
  - Solo tres botones grandes: **🛒 Vender**, **📊 Hoy** y **⋯ Más**.
  - Productos en baldosas, un toque = +1, TOTAL grande y **COBRAR** con 4 formas de pago.
  - Después de cobrar sale **«Deshacer»**.
  - «Hoy» muestra lo vendido en números grandes.
  - En «Más»: productos, libreta, mi plan, ayuda y «Salir del modo fácil».
- **Modos de trabajo** (Ajustes → Negocio):
  - **Restaurante:** como siempre.
  - **Tienda:** caja sin mesas, con buscador, carrito, TOTAL y COBRAR; la voz agrega a la venta.
  - **Mixto:** caja arriba y mesas abajo.
- **Sonidos de caja** cortos y discretos:
  - «tún» al agregar, «tic» al quitar y uno de éxito al cobrar.
  - Un solo sonido por comando de voz o lista.
  - Se configuran en Ajustes → 🔊 Sonidos.

## Correcciones

- **Seguridad:**
  - La llave que firma el APK ya no está en el repositorio. Sale de secretos de GitHub (ver `android/LEEME.md`, cómo rotarla).
  - La base de datos de producción solo se despliega desde la rama principal.
- Una sola prueba gratis por dueño: subir otra vez el negocio a la nube ya no regala otros 15 días.
- Los pedidos de la app de meseros entran aunque el plan no tenga «voz»; antes se perdían y al mesero le llegaba «✅ Listo».
- Vender con el lector de código de barras no es una función PRO.
- Con la ventana «¿Cómo pagó?» abierta, el botón Atrás de Android ya no deja COBRAR muerto.
- Enter con el buscador de la mesa vacío ya no agrega el primer producto.
- **Pagos de la suscripción:**
  - Un reintento ya no puede tomar un pago nuevo como uno viejo.
  - Un plan vencido con un pago en revisión ya no invita a pagar otra vez.
  - Una renovación rechazada muestra el motivo.
- Pagos en tiempo real: al caerse la conexión, la app ya no se queda en un bucle que la bloqueaba.
- Vento Nube: los avisos «✅ Listo…» ya no se borran antes de verse.
- Panel admin: la letra de las pestañas no se aplicaba (CSS inválido).
- Voz: «Club Colombia precio cinco mil» creaba «club colombi».

## Pruebas

`bash pruebas/correr.sh`: 19 pruebas en verde (677 verificaciones, más esc y vozundo sin errores).

| Prueba | Resultado |
|---|---|
| adminsub | 62 |
| adminsubreal (PostgreSQL real) | 34 |
| divtest | 6 |
| esc | ok |
| facil | 47 |
| flujocompleto (de punta a punta, PostgreSQL real) | 87 |
| googletest | 7 |
| hola | 15 |
| holaapk | 10 |
| mesa | 51 |
| modos | 55 |
| pasos | 14 |
| servidor (PostgreSQL real) | 146 |
| sonidos | 38 |
| suscrip | 20 |
| suscripnube | 67 |
| tvocupado | 11 |
| voz1ra | 7 |
| vozundo | sin errores |
