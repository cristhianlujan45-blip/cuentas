// =====================================================================
//  Núcleo de las suscripciones de Vento (independiente del medio de pago).
//   • estado del negocio (lo decide la base de datos: srv_sub_estado)
//   • activar (único punto: srv_sub_activar)
//   • token de estado FIRMADO (ECDSA P-256) para que la app funcione sin internet sin poder inventarse el plan
// =====================================================================
import type { Db } from "../vento-pagos/db.ts";
import { b64url, deB64url, ErrorVento, hex } from "../vento-pagos/util.ts";
import type { ConfigCobro, PagoPublico } from "./proveedores/tipos.ts";

export const VERSION = "1.0.0";
// El token sirve sin internet como máximo 72 horas (o hasta que venza el plan, lo que pase primero).
export const VALIDEZ_TOKEN_MS = 72 * 3600 * 1000;

export type Plan = {
  id: string; name: string; price: number; currency: string; period_months: number; active?: boolean;
  description?: string | null; entitlements: string[];
};
export type Suscripcion = {
  id: string; status: string; plan_id: string; plan_name?: string; source: string; trial: boolean;
  start_date: string | null; expiry_date: string | null; auto_renew: boolean; canceled_at?: string | null; dias_restantes: number | null;
};
export type Estado = {
  negocio: { id: string; nombre: string };
  subscription: Suscripcion | null;
  plan_efectivo: string;
  plan: Plan | null;
  entitlements: Record<string, boolean>;
  pending_payment: PagoPublico | null;
  last_payment: PagoPublico | null;
  renew_notice: boolean;
  ahora: string;
};
export type Catalogo = { planes: Plan[]; entitlements: Array<{ key: string; description: string }>; config: ConfigCobro };

// ---------- Errores de la base de datos → mensajes para la persona ----------
const MENSAJES: Record<string, [number, string]> = {
  sin_sesion: [401, "Entra con tu cuenta de Vento Nube."],
  sin_permiso: [403, "Tu rol no permite hacer eso en este negocio."],
  no_existe: [404, "No se encontró."],
  plan_invalido: [400, "Ese plan no está disponible."],
  metodo_invalido: [400, "Elige Nequi o DaviPlata."],
  monto_invalido: [400, "Escribe el valor que pagaste."],
  monto_insuficiente: [400, "El valor pagado es menor que el precio del plan."],
  pago_en_revision: [409, "Ya tienes un pago en revisión. Espera la respuesta antes de enviar otro."],
  referencia_usada: [409, "Esa referencia ya se usó en otro pago. Revisa el número del comprobante."],
  comprobante_repetido: [409, "Ese comprobante ya se envió antes."],
  comprobante_invalido: [400, "Envía una foto del comprobante (JPG, PNG o WebP de máximo 3 MB)."],
  estado_invalido: [409, "Ese pago ya no está en revisión."],
  motivo_invalido: [400, "Escribe el motivo del rechazo (máximo 200 caracteres)."],
  meses_invalido: [400, "Los meses deben estar entre 1 y 36."],
  precio_invalido: [400, "Revisa el precio: el plan Gratis vale $0 y los demás deben tener precio."],
  entitlement_invalido: [400, "Hay una función que no existe en el catálogo."],
  free_siempre_activo: [400, "El plan Gratis no se puede desactivar."],
  config_invalida: [400, "Revisa la configuración: hay un dato inválido."],
  correo_sin_confirmar: [403, "Confirma tu correo antes de entrar como administrador."],
  fechas_invalidas: [400, "Las fechas no son válidas."],
  source_invalido: [400, "Origen de la suscripción inválido."],
  accion_invalida: [400, "Acción desconocida."],
};
const CODIGOS = new RegExp("\\b(" + Object.keys(MENSAJES).join("|") + ")\\b");

export function errorSub(codigo: string, mensaje?: string): ErrorVento {
  const m = MENSAJES[codigo];
  return new ErrorVento(codigo, mensaje || (m ? m[1] : codigo), m ? m[0] : 400);
}

// Envuelve la base de datos para que los códigos de las funciones lleguen con su mensaje y su estado HTTP.
export function conErrores(db: Db): Db {
  return {
    async rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
      try {
        return await db.rpc<T>(fn, args);
      } catch (e) {
        if (!(e instanceof ErrorVento)) throw e;
        if (e.codigo === "sin_sesion" && e.status === 401) throw e;   // «la sesión venció» de db.ts
        const codigo = MENSAJES[e.codigo] ? e.codigo : (CODIGOS.exec(e.message) || [])[1];
        throw codigo ? errorSub(codigo) : e;
      }
    },
  };
}

// ---------- Estado ----------
export function estado(db: Db, negocio: string): Promise<Estado> {
  return db.rpc<Estado>("srv_sub_estado", { p_negocio: negocio });
}

export function catalogo(db: Db): Promise<Catalogo> {
  return db.rpc<Catalogo>("sub_catalogo");
}

// Cajero y mesero no ven nada de los cobros de Vento (solo qué pueden usar).
export function paraRol(e: Estado, rol: string): Estado {
  if (rol === "dueno" || rol === "admin") return e;
  return { ...e, pending_payment: null, last_payment: null, renew_notice: false };
}

// ÚNICO punto que activa (lo usan la aprobación manual por SQL y, en el futuro, Google Play).
export function activar(db: Db, d: { negocio: string; plan: string; desde: string; hasta: string; source: "manual" | "google_play" | "admin";
  externo?: string | null; actor?: string | null; pago?: string | null }): Promise<Suscripcion> {
  return db.rpc<Suscripcion>("srv_sub_activar", {
    p_negocio: d.negocio, p_plan: d.plan, p_desde: d.desde, p_hasta: d.hasta, p_source: d.source,
    p_external: d.externo || null, p_actor: d.actor || null, p_payment: d.pago || null,
  });
}

export function entitlementsActivos(ents: Record<string, boolean>): string[] {
  return Object.keys(ents || {}).filter((k) => ents[k] === true).sort();
}

// ---------- Token firmado ----------
// token = base64url(JSON del contenido) + "." + base64url(firma ECDSA P-256 / SHA-256 de la primera parte)
// contenido = { t:'vento-sub', k:kid, n:negocio, p:plan efectivo, s:estado, e:[funciones activas],
//               v:vence (ms, 0 si el plan efectivo es Gratis), i:emitido (ms), h:válido hasta (ms) = min(v || ∞, i + 72 h) }
export type ContenidoToken = { t: "vento-sub"; k: string; n: string; p: string; s: string; e: string[]; v: number; i: number; h: number };
type LlaveFirma = { kid: string; publica: JsonWebKey; privada: JsonWebKey };

const enc = new TextEncoder(), dec = new TextDecoder();
const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
const llaves = new Map<string, { llave: LlaveFirma; firmar: CryptoKey }>();

// La llave se crea sola la primera vez y queda en servidor_config ('sub_firma'); solo el servidor la lee.
export async function llaveFirma(db: Db, cacheId = ""): Promise<{ llave: LlaveFirma; firmar: CryptoKey }> {
  const c = llaves.get(cacheId);
  if (c) return c;
  let v = await db.rpc<LlaveFirma | null>("srv_config", { p_clave: "sub_firma" });
  if (!v || !v.privada || !v.publica) {
    const par = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]) as CryptoKeyPair;
    const pub = await crypto.subtle.exportKey("jwk", par.publicKey);
    const publica: JsonWebKey = { kty: "EC", crv: "P-256", x: pub.x, y: pub.y };
    const kid = hex(await crypto.subtle.digest("SHA-256", enc.encode(publica.x + "." + publica.y))).slice(0, 16);
    // Si dos funciones la crean a la vez gana la primera que se guardó (insert … on conflict do nothing).
    v = await db.rpc<LlaveFirma>("srv_config", { p_clave: "sub_firma", p_valor: { kid, publica, privada: await crypto.subtle.exportKey("jwk", par.privateKey) } });
  }
  const firmar = await crypto.subtle.importKey("jwk", v.privada, ALG, false, ["sign"]);
  const r = { llave: v, firmar };
  llaves.set(cacheId, r);
  return r;
}

export async function clavePublica(db: Db, cacheId = ""): Promise<{ alg: "ES256"; kid: string; jwk: JsonWebKey }> {
  const { llave } = await llaveFirma(db, cacheId);
  return { alg: "ES256", kid: llave.kid, jwk: llave.publica };
}

export function contenidoToken(negocio: string, e: Estado, kid: string, ahora = Date.now()): ContenidoToken {
  const s = e.subscription;
  const vence = e.plan_efectivo !== "free" && s && s.expiry_date ? Date.parse(s.expiry_date) || 0 : 0;
  return {
    t: "vento-sub", k: kid, n: negocio, p: e.plan_efectivo, s: s ? s.status : "none",
    e: entitlementsActivos(e.entitlements), v: vence, i: ahora, h: Math.min(vence || Infinity, ahora + VALIDEZ_TOKEN_MS),
  };
}

export async function firmarToken(db: Db, negocio: string, e: Estado, cacheId = "", ahora = Date.now()): Promise<string> {
  const { llave, firmar } = await llaveFirma(db, cacheId);
  const cuerpo = b64url(enc.encode(JSON.stringify(contenidoToken(negocio, e, llave.kid, ahora))));
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, firmar, enc.encode(cuerpo));
  return cuerpo + "." + b64url(firma);
}

// Verificación (la misma que hace la app con la llave pública de GET /clave). Devuelve null si la firma no cuadra.
export async function verificarToken(token: string, jwk: JsonWebKey): Promise<ContenidoToken | null> {
  const [cuerpo, firma, sobra] = String(token || "").split(".");
  if (!cuerpo || !firma || sobra !== undefined) return null;
  try {
    const k = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, ALG, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, deB64url(firma), enc.encode(cuerpo));
    if (!ok) return null;
    const c = JSON.parse(dec.decode(deB64url(cuerpo))) as ContenidoToken;
    return c && c.t === "vento-sub" ? c : null;
  } catch {
    return null;
  }
}
