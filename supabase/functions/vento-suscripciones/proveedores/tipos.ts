// Contrato de los medios de pago de la suscripción de Vento.
// El núcleo (../nucleo.ts) no sabe nada de Nequi, DaviPlata ni Google Play: cada medio implementa
// PaymentProvider y termina SIEMPRE en la base de datos (srv_sub_pago_crear / srv_sub_activar).
import type { Db } from "../../vento-pagos/db.ts";
import type { Env } from "../../vento-pagos/util.ts";

export type MetodoManual = { numero: string; titular: string };

export type ConfigCobro = {
  beta_mode: boolean;
  trial_days: number;
  renew_notice_days: number;
  manual_methods: Record<string, MetodoManual>;
  support_whatsapp: string | null;
};

export type PagoPublico = {
  id: string;
  plan_id: string;
  plan_name?: string;
  provider: string;
  method: string;
  amount: number;
  currency: string;
  reference: string | null;
  status: "review" | "approved" | "rejected" | "canceled";
  kind: "new" | "renewal" | "change";
  reject_reason: string | null;
  created_at: string;
  [k: string]: unknown;
};

// Lo que el medio de pago necesita para registrar un pago.
export type Ctx = {
  env: Env;
  db: Db;                                    // como servidor (llave de servicio)
  negocio: string;                           // negocios.id
  usuario: { id: string; email: string | null };
  rol: string;                               // dueno | admin
  cfg: ConfigCobro;
};

export type EntradaPago = {
  plan: string;
  metodo?: string;                           // NEQUI | DAVIPLATA
  monto?: number;
  referencia?: string | null;
  fecha?: string | null;                     // AAAA-MM-DD (día en que pagó)
  nombre?: string | null;
  telefono?: string | null;
  idem?: string | null;                      // idempotencia: el mismo envío repetido no crea otro pago
  comprobante?: { base64?: string; tipo?: string } | null;
  purchaseToken?: string | null;             // Google Play (futuro)
};

export type ResultadoPago = { payment: PagoPublico; repetido: boolean };

export interface PaymentProvider {
  id: "manual" | "google_play";
  // ¿Se puede ofrecer este medio ahora? (beta, credenciales del servidor…)
  disponible(cfg: ConfigCobro, env: Env): boolean;
  // Registra el pago. Manual: comprobante + revisión humana. Google Play: purchaseToken verificado.
  registrarPago(ctx: Ctx, entrada: EntradaPago): Promise<ResultadoPago>;
  // Verifica una compra con el proveedor (Google Play: purchases.subscriptionsv2.get).
  verificar?(ctx: Ctx, ref: string): Promise<unknown>;
  // Notificaciones del proveedor (Google Play: Real-time Developer Notifications por Pub/Sub).
  procesarNotificacion?(req: Request, env: Env): Promise<Response>;
}
