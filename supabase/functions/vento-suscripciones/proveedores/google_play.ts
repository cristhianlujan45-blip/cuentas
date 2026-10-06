// Google Play Billing — STUB (todavía NO se cobra por Google Play; la beta usa el pago manual).
//
// Queda la arquitectura lista para cuando Vento salga de la beta:
//  • disponible(): solo si beta_mode = false y el servidor tiene GOOGLE_PLAY_PACKAGE (nombre del paquete de la APK)
//    y GOOGLE_PLAY_SERVICE_ACCOUNT (JSON de una cuenta de servicio con acceso a la Play Developer API).
//  • registrarPago(ctx, {plan, purchaseToken}): la APK compra con Play Billing Library (producto = plans.google_play_product_id)
//    y manda el purchaseToken; aquí se VERIFICA con la Android Publisher API
//      GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{paquete}/purchases/subscriptionsv2/tokens/{token}
//    (subscriptionState ACTIVE / IN_GRACE_PERIOD, lineItems[].expiryTime, acknowledgementState),
//    se registra un payment_records (provider 'google_play', method 'GOOGLE_PLAY', idempotency_key = purchaseToken)
//    y se activa con nucleo.activar(source 'google_play', externo = purchaseToken, hasta = expiryTime).
//    Después se hace acknowledge de la compra (si no, Google la reembolsa a los 3 días).
//  • procesarNotificacion(req): Real-time Developer Notifications (Pub/Sub push a POST /google-play/rtdn):
//    validar el token OIDC de Pub/Sub, leer subscriptionNotification.purchaseToken, volver a verificar con la API y
//    renovar / vencer / cancelar con las mismas funciones srv_*.
// Mientras tanto todo responde 501 «no_implementado».
import { type Env, ErrorVento } from "../../vento-pagos/util.ts";
import type { ConfigCobro, Ctx, EntradaPago, PaymentProvider, ResultadoPago } from "./tipos.ts";

const noImplementado = () => new ErrorVento("no_implementado", "El pago por Google Play todavía no está disponible.", 501);

export class GooglePlayPaymentProvider implements PaymentProvider {
  id = "google_play" as const;

  disponible(cfg: ConfigCobro, env: Env): boolean {
    return !cfg.beta_mode && !!env.GOOGLE_PLAY_PACKAGE && !!env.GOOGLE_PLAY_SERVICE_ACCOUNT;
  }

  async registrarPago(ctx: Ctx, e: EntradaPago): Promise<ResultadoPago> {
    await this.verificar(ctx, String(e.purchaseToken || ""));
    throw noImplementado();
  }

  verificar(_ctx: Ctx, _purchaseToken: string): Promise<unknown> {
    return Promise.reject(noImplementado());
  }

  procesarNotificacion(_req: Request, _env: Env): Promise<Response> {
    return Promise.reject(noImplementado());
  }
}
