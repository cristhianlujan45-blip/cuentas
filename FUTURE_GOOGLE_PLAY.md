# Migrar las suscripciones de Vento a Google Play Billing (futuro)

Hoy (beta) Vento cobra **manualmente** por Nequi y DaviPlata ([BETA_BILLING.md](BETA_BILLING.md)).
El sistema se construyó para que pasar a Google Play **no obligue a rehacer** suscripciones, planes ni permisos:
solo se agrega un medio de pago nuevo detrás de la misma interfaz.

```
                       ┌─ ManualPaymentProvider ──── Nequi / DaviPlata + comprobante + admin aprueba   (HOY)
App ─ /pago ─ PaymentProvider ┤
                       └─ GooglePlayPaymentProvider ─ purchaseToken verificado con Google          (FUTURO)
                                     │
                                     ▼
                     núcleo único: srv_sub_activar()  →  subscriptions (1 por negocio)
                                     │
                                     ▼
                  plans + plan_entitlements → entitlements → token firmado → la app
```

## Lo que ya está listo (no cambia al migrar)

| Pieza | Dónde | Por qué sirve igual con Google Play |
|---|---|---|
| Suscripción por **negocio** (no por celular) | tabla `subscriptions`, `business_id` único | Una compra de Play se asocia al negocio de la cuenta que compra. |
| Planes y precios centralizados | `plans` (ya tiene la columna `google_play_product_id`) | Cada plan se enlaza con su producto de suscripción en Play Console. |
| Entitlements | `entitlements` + `plan_entitlements`, `negocio_tiene()` | Las funciones dependen del **plan**, no de cómo se pagó. |
| Activación única | `srv_sub_activar(negocio, plan, desde, hasta, source, external, actor, payment)` | Ya acepta `source = 'google_play'` y `external_id` (el purchaseToken). |
| Registro de pagos | `payment_records` (`provider` admite `'google_play'`, `method` admite `'GOOGLE_PLAY'`) | Cada renovación de Play queda como un pago, con idempotencia por `purchaseToken`. |
| Historial | `payment_events` | Los mismos eventos: `subscription_activated`, `subscription_renewed`, `subscription_expired`, `subscription_canceled`. |
| Vencimiento en el servidor | `srv_sub_vencer()` + cron `/vencer` | Igual para cualquier medio. |
| Estado firmado para la app | `POST /estado` → token ECDSA | La app no cambia: sigue leyendo plan y funciones del token. |
| Interfaz de medios de pago (servidor) | `supabase/functions/vento-suscripciones/proveedores/tipos.ts` | `PaymentProvider { disponible, registrarPago, verificar, procesarNotificacion }`. |
| Medio Google Play (esqueleto) | `proveedores/google_play.ts` | Documenta los pasos; hoy responde 501 `no_implementado`. |
| Elección del medio | `proveedores/index.ts` | `beta_mode = true` → solo manual; `false` → los que estén disponibles. |
| Interfaz de medios de pago (app) | `nube/vento-suscripcion.js` → `ventoSuscripcion.proveedores` | `ManualPaymentProvider` y `GooglePlayPaymentProvider` (esqueleto, solo se ofrece si la APK lo anuncia y el servidor lo lista). |
| Ruta de notificaciones | `POST /google-play/rtdn` | Ya existe; hoy responde 501. |
| Modo beta | `billing_config.beta_mode` | Se cambia desde Vento Admin → Configuración. |

## Pasos para activarlo

1. **Play Console:** crear un producto de suscripción por plan (ej. `vento_pro_mensual`) con su precio, y poner ese
   id en `plans.google_play_product_id`.
2. **Cuenta de servicio de Google Cloud** con acceso a la *Google Play Android Developer API*; guardar en Supabase
   los secretos `GOOGLE_PLAY_PACKAGE` (ej. `co.vento.app`) y `GOOGLE_PLAY_SERVICE_ACCOUNT` (JSON). Con eso,
   `GooglePlayPaymentProvider.disponible()` devuelve `true` cuando `beta_mode = false`.
3. **APK** (`android/app`): agregar la *Play Billing Library*, comprar con `launchBillingFlow` el producto del plan y,
   con la compra, llamar a `POST /pago {negocio, plan, proveedor: 'google_play', purchaseToken}`. Exponer en el puente
   `window.VentoAndroid.billingDisponible = true` para que la app muestre el botón de Google Play.
4. **Servidor** (`proveedores/google_play.ts`):
   - `verificar(token)`: `GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{paquete}/purchases/subscriptionsv2/tokens/{token}`
     con un token OAuth de la cuenta de servicio; aceptar `SUBSCRIPTION_STATE_ACTIVE` / `IN_GRACE_PERIOD`; leer
     `lineItems[].expiryTime` y el producto.
   - `registrarPago`: crear `payment_records` (`provider 'google_play'`, `method 'GOOGLE_PLAY'`,
     `idempotency_key = purchaseToken`, `status 'approved'`) y llamar a `srv_sub_activar(..., 'google_play', purchaseToken, ...)`
     con `hasta = expiryTime`. Después hacer **acknowledge** de la compra (si no, Google la reembolsa a los 3 días).
   - `procesarNotificacion` (RTDN por Pub/Sub push a `/google-play/rtdn`): validar el token OIDC de Pub/Sub, volver a
     verificar el purchaseToken con la API y renovar / vencer / cancelar con las mismas funciones `srv_*`.
5. **Pub/Sub:** crear el tema de notificaciones en Play Console → Monetización → Notificaciones en tiempo real, con una
   suscripción push a `https://<proyecto>.supabase.co/functions/v1/vento-suscripciones/google-play/rtdn`.
6. Poner `beta_mode = false` en Vento Admin → Configuración. Los negocios con suscripción manual vigente la conservan
   hasta su vencimiento; después renuevan con el medio que esté disponible.

## Lo que NO hay que tocar

- Las tablas `subscriptions`, `plans`, `entitlements`, `plan_entitlements` y la lógica de acceso de la app.
- `srv_sub_estado`, `srv_sub_vencer`, el token firmado y el bloqueo de funciones en la app.
- El panel de administración: los pagos de Google aparecen en `payment_records` como cualquier otro (ya aprobados).

## Política de Google Play

Si la app se publica en Play Store y vende funciones digitales dentro de la app, Google exige usar Play Billing para
esas compras. Mientras la beta se distribuya como APK fuera de la tienda (o se cobre fuera de la app), el pago manual
es válido. Revisar la política vigente de pagos de Google Play antes de publicar en la tienda.
