// Wompi (pasarela de pagos de Grupo Bancolombia). Métodos NEQUI y DAVIPLATA, entre otros.
// Documentación oficial: https://docs.wompi.co
//  • Ambientes: https://sandbox.wompi.co/v1  y  https://production.wompi.co/v1
//  • GET /merchants/{llave_publica}         → datos del comercio y métodos de pago aceptados
//  • GET /transactions?reference=…  (llave privada) → estado de las transacciones de una referencia
//  • GET /transactions/{id}         (llave privada) → estado de una transacción
//  • Web Checkout: https://checkout.wompi.co/p/?public-key&currency&amount-in-cents&reference&signature:integrity…
//      firma de integridad = SHA256(referencia + monto_en_centavos + moneda [+ fecha_expiración] + secreto_integridad)
//  • Eventos (webhook) «transaction.updated»: firma = SHA256(valores de signature.properties + timestamp + secreto_eventos),
//      viene en signature.checksum y en el encabezado X-Event-Checksum.
import { ErrorVento, igualesSeguro, pedir, sha256 } from "./util.ts";

export type WompiCred = { llave_publica: string; llave_privada: string; secreto_eventos: string; secreto_integridad: string };
export type Ambiente = "sandbox" | "produccion";

export const WOMPI_API = { sandbox: "https://sandbox.wompi.co/v1", produccion: "https://production.wompi.co/v1" };
export const WOMPI_CHECKOUT = "https://checkout.wompi.co/p/";

export function apiWompi(amb: Ambiente, env: Record<string, string | undefined> = {}): string {
  return (amb === "sandbox" ? env.VENTO_WOMPI_API_SANDBOX : env.VENTO_WOMPI_API) || WOMPI_API[amb];
}

// Las llaves de Wompi traen el ambiente en el prefijo (pub_test_ / pub_prod_, prv_…, test_events_ / prod_events_…).
export function revisarLlaves(c: WompiCred): { ambiente: Ambiente | null; problemas: string[] } {
  const p: string[] = [];
  const amb = (s: string, test: RegExp, prod: RegExp) => (test.test(s) ? "sandbox" : prod.test(s) ? "produccion" : null);
  const a = [
    ["llave pública", amb(c.llave_publica, /^pub_test_/, /^pub_prod_/)],
    ["llave privada", amb(c.llave_privada, /^prv_test_/, /^prv_prod_/)],
    ["secreto de eventos", amb(c.secreto_eventos, /^test_events_/, /^prod_events_/)],
    ["secreto de integridad", amb(c.secreto_integridad, /^test_integrity_/, /^prod_integrity_/)],
  ] as const;
  for (const [nombre, v] of a) if (!v) p.push("La " + nombre + " no tiene el formato de Wompi");
  const ambs = new Set(a.map((x) => x[1]).filter(Boolean));
  if (ambs.size > 1) p.push("Mezclaste llaves de pruebas (test) y de producción (prod)");
  return { ambiente: ambs.size === 1 ? ([...ambs][0] as Ambiente) : null, problemas: p };
}

export type Comercio = { id?: number | string; nombre?: string; metodos: string[] };

export async function verificarComercio(amb: Ambiente, cred: WompiCred, env: Record<string, string | undefined> = {}): Promise<Comercio> {
  const base = apiWompi(amb, env);
  const r = await pedir(base + "/merchants/" + encodeURIComponent(cred.llave_publica), { reintentos: 2 });
  if (r.status === 404 || r.status === 401 || r.status === 422) throw new ErrorVento("wompi_llave_publica", "Wompi no reconoce la llave pública", 400);
  if (!r.ok) throw new ErrorVento("wompi_http", "Wompi respondió " + r.status, 502);
  const j = await r.json();
  const d = j && j.data || {};
  // La llave privada se comprueba consultando transacciones (si la llave es mala, Wompi responde 401).
  const r2 = await pedir(base + "/transactions?reference=VENTO-VERIFICACION", { headers: { Authorization: "Bearer " + cred.llave_privada }, reintentos: 2 });
  if (r2.status === 401 || r2.status === 403) throw new ErrorVento("wompi_llave_privada", "Wompi rechazó la llave privada", 400);
  if (r2.status >= 500) throw new ErrorVento("wompi_http", "Wompi respondió " + r2.status, 502);
  const metodos = Array.isArray(d.accepted_payment_methods) ? d.accepted_payment_methods.map((x: unknown) => String(x).toUpperCase()) : [];
  return { id: d.id, nombre: d.name || d.legal_name, metodos };
}

export function firmaIntegridad(referencia: string, centavos: number, moneda: string, secreto: string, expira?: string): Promise<string> {
  return sha256(referencia + String(centavos) + moneda + (expira || "") + secreto);
}

export async function linkCheckout(o: { cred: WompiCred; referencia: string; monto: number; expira?: string; redirect?: string }): Promise<string> {
  const centavos = Math.round(o.monto * 100);
  const firma = await firmaIntegridad(o.referencia, centavos, "COP", o.cred.secreto_integridad, o.expira);
  const q = new URLSearchParams();
  q.set("public-key", o.cred.llave_publica);
  q.set("currency", "COP");
  q.set("amount-in-cents", String(centavos));
  q.set("reference", o.referencia);
  q.set("signature:integrity", firma);
  if (o.expira) q.set("expiration-time", o.expira);
  if (o.redirect) q.set("redirect-url", o.redirect);
  return WOMPI_CHECKOUT + "?" + q.toString();
}

const ESTADOS: Record<string, string> = { APPROVED: "aprobado", DECLINED: "rechazado", VOIDED: "anulado", ERROR: "error", PENDING: "pendiente" };
export const estadoVento = (s: string) => ESTADOS[String(s || "").toUpperCase()] || "pendiente";

export type TxWompi = {
  id: string; reference: string; status: string; amount_in_cents?: number; payment_method_type?: string;
  customer_email?: string; customer_data?: { full_name?: string; phone_number?: string }; status_message?: string | null; created_at?: string;
};

export function normalizarTx(tx: TxWompi) {
  return {
    id_externo: String(tx.id),
    referencia: String(tx.reference || ""),
    estado: estadoVento(tx.status),
    estado_proveedor: String(tx.status || ""),
    metodo: String(tx.payment_method_type || "OTRO").toUpperCase(),
    monto: typeof tx.amount_in_cents === "number" ? Math.round(tx.amount_in_cents / 100) : null,
    pagador: (tx.customer_data && tx.customer_data.full_name) || null,
    detalle: tx.status_message || null,
  };
}

export async function consultarReferencia(amb: Ambiente, cred: WompiCred, referencia: string, env: Record<string, string | undefined> = {}): Promise<TxWompi | null> {
  const r = await pedir(apiWompi(amb, env) + "/transactions?reference=" + encodeURIComponent(referencia), {
    headers: { Authorization: "Bearer " + cred.llave_privada }, reintentos: 2,
  });
  if (r.status === 401 || r.status === 403) throw new ErrorVento("wompi_llave_privada", "Wompi rechazó la llave privada", 400);
  if (!r.ok) throw new ErrorVento("wompi_http", "Wompi respondió " + r.status, 502);
  const j = await r.json();
  const lista: TxWompi[] = Array.isArray(j && j.data) ? j.data : [];
  if (!lista.length) return null;
  // Si hubo varios intentos con la misma referencia, manda el aprobado; si no, el más reciente.
  const ap = lista.find((t) => String(t.status).toUpperCase() === "APPROVED");
  if (ap) return ap;
  return lista.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
}

// ---------- Eventos (webhook) ----------
export type EventoWompi = {
  event: string; data: Record<string, unknown>; environment?: string;
  signature: { properties: string[]; checksum: string }; timestamp: number; sent_at?: string;
};

function valorEn(obj: unknown, ruta: string): unknown {
  let x: unknown = obj;
  for (const k of ruta.split(".")) {
    if (x === null || typeof x !== "object") return undefined;
    x = (x as Record<string, unknown>)[k];
  }
  return x;
}

export function checksumEvento(ev: EventoWompi, secreto: string): Promise<string> {
  const vals = (ev.signature.properties || []).map((p) => {
    const v = valorEn(ev.data, p);
    return v === null || v === undefined ? "" : String(v);
  }).join("");
  return sha256(vals + String(ev.timestamp) + secreto);
}

export function pareceEvento(x: unknown): x is EventoWompi {
  const e = x as EventoWompi;
  return !!e && typeof e === "object" && typeof e.event === "string" && !!e.data && !!e.signature &&
    Array.isArray(e.signature.properties) && typeof e.signature.checksum === "string" && e.timestamp !== undefined;
}

export async function verificarEvento(ev: EventoWompi, secreto: string, encabezado?: string | null): Promise<boolean> {
  if (!secreto) return false;
  const calc = await checksumEvento(ev, secreto);
  if (!igualesSeguro(calc, ev.signature.checksum)) return false;
  if (encabezado && !igualesSeguro(calc, encabezado)) return false;
  return true;
}
