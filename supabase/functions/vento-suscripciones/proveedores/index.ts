// Elige el medio de pago. Con beta_mode = true SOLO se ofrece el manual (Nequi / DaviPlata + comprobante).
import { type Env, ErrorVento } from "../../vento-pagos/util.ts";
import { GooglePlayPaymentProvider } from "./google_play.ts";
import { ManualPaymentProvider } from "./manual.ts";
import type { ConfigCobro, PaymentProvider } from "./tipos.ts";

export const manual = new ManualPaymentProvider();
export const googlePlay = new GooglePlayPaymentProvider();
const TODOS: PaymentProvider[] = [manual, googlePlay];

export function disponibles(cfg: ConfigCobro, env: Env): PaymentProvider[] {
  if (cfg.beta_mode) return [manual];
  return TODOS.filter((p) => p.disponible(cfg, env));
}

export function elegir(cfg: ConfigCobro, env: Env, pedido = "manual"): PaymentProvider {
  const p = disponibles(cfg, env).find((x) => x.id === pedido);
  if (!p) throw new ErrorVento("proveedor_no_disponible", "Ese medio de pago no está disponible ahora.", 400);
  return p;
}
