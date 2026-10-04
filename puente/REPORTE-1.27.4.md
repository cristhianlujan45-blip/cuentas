# Vento 1.27.4 — Cuentas con Google, pago de suscripciones como los grandes y guía de la empresa

Basado en cómo trabajan los POS por suscripción (Alegra POS, Loyverse, Siigo POS, Square): planes por
niveles, prueba gratis, cuenta en la nube por negocio, pago mensual o licencia, soporte y datos aparte.

## Cuentas: correo y Google
- «Continuar con Google» en la pantalla de entrada y en Vento Nube (aparece solo cuando el servidor lo tiene
  activado). Al volver de Google se abre la sesión, se limpia la dirección y sigue con los negocios de esa
  cuenta (crear, unirse con código, elegir). Correo y contraseña siguen igual.
- Para activarlo (una vez): Google Cloud → credencial OAuth «Aplicación web» con regreso autorizado
  `https://<proyecto>.supabase.co/auth/v1/callback` → secretos de GitHub `GOOGLE_OAUTH_CLIENT_ID` y
  `GOOGLE_OAUTH_CLIENT_SECRET` → el flujo «Servidor Vento» lo activa en Supabase.
- Prueba `googletest.js` 7/7.

## Pago de suscripciones
- Vento Admin → 📦 Planes: precio, qué incluye y **link de pago** (Wompi, Mercado Pago, PayU: tarjeta, PSE,
  Nequi). ⚙️ Configurar la app: **cómo te pagan** (Nequi/Daviplata, llave Bre-B, cuenta bancaria, titular).
- En la app, «💳 Planes y pagos»: tarjetas de planes con su botón de pago, datos para transferir con
  «Copiar» y «✅ Ya pagué: enviar comprobante por WhatsApp» (con plan y código del negocio).
- Prueba `admintest.js` 22/22.

## Vento Admin → 📘 Cómo funciona
Guía de la empresa: roles (tú, tu equipo, tus clientes), embudo de venta, cobro, base de datos, seguridad,
checklist legal en Colombia (Habeas Data, facturación DIAN, marca) y rutina semanal.

## Mesa
- Se quitó el «Dividir cuenta» repetido: queda solo el de la tarjeta de pago (− ÷ N +).
