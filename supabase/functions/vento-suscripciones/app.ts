// =====================================================================
//  Servidor Vento · suscripciones (BETA: pago manual por Nequi / DaviPlata)
//
//  Rutas (todas bajo /functions/v1/vento-suscripciones):
//    GET  /salud                     estado del servidor
//    GET  /planes                    catálogo público (planes, precios, funciones, números de pago) + medios disponibles
//    GET  /clave                     llave pública (JWK) para verificar el token de estado sin internet
//    POST /estado   {negocio}        estado de la suscripción + token firmado        (sesión; cualquier miembro)
//    POST /pago     {negocio, plan, metodo, monto, referencia, fecha, nombre, telefono, idem, comprobante:{base64, tipo}}
//                                    envía un pago con su comprobante                (sesión; dueño o administrador)
//    POST /admin/*                   panel del proveedor de Vento                    (sesión de un platform_admin)
//    POST /vencer                    vence las suscripciones con fecha pasada        (cabecera x-vento-cron)
//    POST /google-play/rtdn          notificaciones de Google Play                   (501 mientras sea beta)
//  El plan lo decide SIEMPRE la base de datos; la app solo consulta.
// =====================================================================
import { crearDb, type Db } from "../vento-pagos/db.ts";
import { type Env, ErrorVento, igualesSeguro, log } from "../vento-pagos/util.ts";
import * as N from "./nucleo.ts";
import { firmar } from "./almacen.ts";
import { disponibles, elegir, googlePlay } from "./proveedores/index.ts";
import type { EntradaPago } from "./proveedores/tipos.ts";

export const VERSION = N.VERSION;
const MAX_CUERPO = 6 * 1024 * 1024;   // la foto (3 MB) en base64 + los datos
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function origenes(env: Env): string[] {
  return (env.VENTO_ORIGENES || "https://cristhianlujan45-blip.github.io,http://localhost:8765,http://127.0.0.1:8765").split(",").map((x) => x.trim()).filter(Boolean);
}

function cabecerasCors(req: Request, env: Env): Record<string, string> {
  const o = req.headers.get("origin") || "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-vento-cron",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (o && origenes(env).includes(o)) h["Access-Control-Allow-Origin"] = o;
  return h;
}

function json(status: number, cuerpo: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra },
  });
}

function servidor(env: Env): Db {
  const k = env.SUPABASE_SERVICE_ROLE_KEY || env.VENTO_SERVICE_KEY || "";
  if (!env.SUPABASE_URL || !k) throw new ErrorVento("sin_config", "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el servidor", 500);
  return N.conErrores(crearDb(env.SUPABASE_URL, k, k));
}

// La base de datos con la sesión de quien llama: las funciones revisan su rol con auth.uid().
function usuario(req: Request, env: Env): Db {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const anon = req.headers.get("apikey") || env.SUPABASE_ANON_KEY || "";
  if (!jwt || jwt === anon) throw new ErrorVento("sin_sesion", "Entra con tu cuenta de Vento Nube.", 401);
  return N.conErrores(crearDb(env.SUPABASE_URL || "", anon, jwt));
}

const cacheId = (env: Env) => env.SUPABASE_URL || "";

function idDe(v: unknown, codigo: string, mensaje: string): string {
  const s = String(v || "").trim();
  if (!UUID.test(s)) throw new ErrorVento(codigo, mensaje, 400);
  return s.toLowerCase();
}
const negocioDe = (b: Record<string, unknown>) => idDe(b.negocio, "falta_negocio", "Falta el negocio");
const pagoDe = (b: Record<string, unknown>) => idDe(b.payment || b.pago, "falta_pago", "Falta el pago");

async function cuerpo(req: Request): Promise<Record<string, unknown>> {
  const txt = await req.text();
  if (txt.length > MAX_CUERPO) throw new ErrorVento("muy_grande", "Lo que se envió es demasiado grande (la foto debe pesar máximo 3 MB).", 413);
  if (!txt) return {};
  try {
    const j = JSON.parse(txt);
    return j && typeof j === "object" && !Array.isArray(j) ? j : {};
  } catch {
    throw new ErrorVento("json_invalido", "Datos inválidos", 400);
  }
}

// ---------- /estado ----------
async function estado(req: Request, env: Env, b: Record<string, unknown>) {
  const negocio = negocioDe(b);
  const rol = await usuario(req, env).rpc<string>("sub_puedo", { p_negocio: negocio, p_accion: "ver" });
  const db = servidor(env);
  const e = await N.estado(db, negocio);
  const token = await N.firmarToken(db, negocio, e, cacheId(env));
  return { ok: true, ...N.paraRol(e, rol), rol, token };
}

// ---------- /pago ----------
async function pago(req: Request, env: Env, b: Record<string, unknown>) {
  const negocio = negocioDe(b);
  const yo = usuario(req, env), db = servidor(env);
  const rol = await yo.rpc<string>("sub_puedo", { p_negocio: negocio, p_accion: "pagar" });
  const me = await yo.rpc<{ id: string; email: string | null }>("sub_yo");
  const cat = await N.catalogo(db);
  const prov = elegir(cat.config, env, b.proveedor ? String(b.proveedor) : "manual");
  const entrada: EntradaPago = {
    plan: String(b.plan || ""), metodo: b.metodo ? String(b.metodo) : "", monto: Number(b.monto),
    referencia: b.referencia != null ? String(b.referencia) : null, fecha: b.fecha ? String(b.fecha) : null,
    nombre: b.nombre != null ? String(b.nombre) : null, telefono: b.telefono != null ? String(b.telefono) : null,
    idem: b.idem ? String(b.idem) : null, comprobante: (b.comprobante || null) as EntradaPago["comprobante"],
    purchaseToken: b.purchaseToken ? String(b.purchaseToken) : null,
  };
  const r = await prov.registrarPago({ env, db, negocio, usuario: me, rol, cfg: cat.config }, entrada);
  log("info", "sub_pago", { negocio, pago: r.payment.id, repetido: r.repetido, proveedor: prov.id, metodo: r.payment.method });
  return { ok: true, payment: r.payment, repetido: r.repetido, estado: await N.estado(db, negocio) };
}

// ---------- /admin/* ----------
function correosAdmin(env: Env): string[] {
  return String(env.VENTO_ADMIN_EMAILS || "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
}

async function admin(req: Request, env: Env, accion: string, b: Record<string, unknown>) {
  const db = servidor(env);
  const me = await usuario(req, env).rpc<{ id: string; email: string | null }>("sub_yo");
  let es = await db.rpc<boolean>("srv_admin_es", { p_usuario: me.id });
  if (!es && me.email && correosAdmin(env).includes(me.email.toLowerCase())) {
    await db.rpc("srv_admin_agregar", { p_usuario: me.id, p_email: me.email });
    log("info", "admin_agregado", { usuario: me.id });
    es = true;
  }
  if (!es) throw new ErrorVento("no_admin", "Esta cuenta no es administradora de Vento.", 403);
  const a = me.id;
  switch (accion) {
    case "yo":
      return { ok: true, admin: true, id: me.id, email: me.email };
    case "pagos":
      return { ok: true, pagos: await db.rpc("srv_admin_pagos", { p_status: b.status ? String(b.status) : "review" }) };
    case "comprobante": {
      const c = await db.rpc<{ storage_path: string; mime: string } | null>("srv_sub_comprobante_de", { p_payment: pagoDe(b) });
      if (!c || !c.storage_path) throw new ErrorVento("sin_comprobante", "Ese pago no tiene comprobante.", 404);
      return { ok: true, url: await firmar(env, c.storage_path, 600), mime: c.mime, vence_en: 600 };
    }
    case "aprobar": {
      const r = await db.rpc<Record<string, unknown>>("srv_sub_aprobar", { p_payment: pagoDe(b), p_admin: a });
      log("info", "sub_aprobado", { pago: String(b.payment || b.pago), admin: a, repetido: r.repetido });
      return { ok: true, ...r };
    }
    case "rechazar":
      return { ok: true, ...(await db.rpc<Record<string, unknown>>("srv_sub_rechazar", { p_payment: pagoDe(b), p_admin: a, p_motivo: String(b.motivo || "") })) };
    case "suscripciones":
      return { ok: true, suscripciones: await db.rpc("srv_admin_suscripciones") };
    case "negocios":
      return { ok: true, negocios: await db.rpc("srv_admin_negocios") };
    case "negocio":
      return { ok: true, ...(await db.rpc<Record<string, unknown>>("srv_admin_negocio", { p_negocio: negocioDe(b) })) };
    case "cancelar":
      return { ok: true, ...(await db.rpc<Record<string, unknown>>("srv_sub_cancelar", { p_negocio: negocioDe(b), p_admin: a, p_motivo: b.motivo ? String(b.motivo) : null })) };
    case "cambiar_plan":
      return { ok: true, ...(await db.rpc<Record<string, unknown>>("srv_sub_cambiar_plan", { p_negocio: negocioDe(b), p_plan: String(b.plan || ""), p_admin: a })) };
    case "dar":
      return { ok: true, ...(await db.rpc<Record<string, unknown>>("srv_sub_dar", { p_negocio: negocioDe(b), p_plan: String(b.plan || ""), p_meses: Math.round(Number(b.meses) || 0), p_admin: a })) };
    case "planes":
      return { ok: true, ...(await db.rpc<Record<string, unknown>>("srv_admin_planes")) };
    case "plan_guardar":
      if (!b.plan || typeof b.plan !== "object") throw N.errorSub("plan_invalido");
      return { ok: true, plan: await db.rpc("srv_admin_plan_guardar", { p_plan: b.plan, p_admin: a }) };
    case "config_guardar":
      if (!b.config || typeof b.config !== "object") throw N.errorSub("config_invalida");
      return { ok: true, config: await db.rpc("srv_admin_config_guardar", { p_cfg: b.config, p_admin: a }) };
  }
  throw new ErrorVento("ruta", "Acción de administración desconocida", 404);
}

// ---------- Entrada ----------
export async function manejar(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const partes = url.pathname.split("/").filter(Boolean);
  const i = partes.indexOf("vento-suscripciones");
  const ruta = i >= 0 ? partes.slice(i + 1) : partes;
  const cors = cabecerasCors(req, env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const r0 = ruta[0] || "salud";
    if (r0 === "salud") return json(200, { ok: true, servicio: "vento-suscripciones", version: VERSION, pago_manual: true }, cors);
    if (r0 === "planes" && req.method === "GET") {
      const db = servidor(env), cat = await N.catalogo(db);
      return json(200, { ok: true, ...cat, proveedores: disponibles(cat.config, env).map((p) => p.id) }, cors);
    }
    if (r0 === "clave" && req.method === "GET") return json(200, { ok: true, ...(await N.clavePublica(servidor(env), cacheId(env))) }, cors);
    if (r0 === "google-play" && ruta[1] === "rtdn" && req.method === "POST") return await googlePlay.procesarNotificacion(req, env);
    if (req.method !== "POST") return json(405, { ok: false, error: "metodo" }, cors);
    if (r0 === "vencer") {
      const secreto = env.VENTO_CRON_SECRETO || "";
      if (!secreto || !igualesSeguro(req.headers.get("x-vento-cron") || "", secreto)) return json(401, { ok: false, error: "sin_permiso" }, cors);
      const n = await servidor(env).rpc<number>("srv_sub_vencer", { p_negocio: null });
      log("info", "sub_vencer", { vencidas: n });
      return json(200, { ok: true, vencidas: n }, cors);
    }
    const b = await cuerpo(req);
    if (r0 === "estado") return json(200, await estado(req, env, b), cors);
    if (r0 === "pago") return json(200, await pago(req, env, b), cors);
    if (r0 === "admin") return json(200, await admin(req, env, ruta[1] || "yo", b), cors);
    return json(404, { ok: false, error: "ruta" }, cors);
  } catch (e) {
    const ev = e instanceof ErrorVento ? e : new ErrorVento("interno", "Error interno", 500);
    if (!(e instanceof ErrorVento)) log("error", "excepcion", { ruta: ruta.join("/"), error: e instanceof Error ? e.stack || e.message : String(e) });
    return json(ev.status, { ok: false, error: ev.codigo, mensaje: ev.message }, cors);
  }
}
