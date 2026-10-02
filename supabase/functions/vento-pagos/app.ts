// =====================================================================
//  Servidor Vento · pagos con Nequi y DaviPlata
//
//  Rutas (todas bajo /functions/v1/vento-pagos):
//    GET  /salud                       estado del servidor
//    GET  /push-clave                  llave pública VAPID para activar notificaciones
//    POST /config                      estado / conectar / probar / desconectar integraciones   (sesión, dueño o admin)
//    POST /cobro                       crear un cobro: link Wompi, push Nequi o QR Nequi           (sesión)
//    POST /estado                      consultar ya el estado de un pago                           (sesión)
//    POST /sync                        consultar pagos pendientes (sesión o X-Vento-Cron)
//    POST /webhook/wompi/{token}       eventos firmados de Wompi                                   (firma)
//    POST /aviso[/{token}]             aviso reenviado desde un celular autorizado (MacroDroid)    (token de dispositivo)
// =====================================================================
import { crearDb, type Db } from "./db.ts";
import { cifrar, descifrar } from "./cifrado.ts";
import * as W from "./wompi.ts";
import * as N from "./nequi.ts";
import { leerAviso } from "./avisos.ts";
import { avisarDispositivos, vapid } from "./push.ts";
import * as G from "./google.ts";
import { type Env, ErrorVento, log, sha256 } from "./util.ts";

export const VERSION = "1.17.0";
const SITIO = "https://cristhianlujan45-blip.github.io/cuentas/";

type Pago = { id: string; negocio_id?: string; referencia: string; proveedor: string; metodo: string; canal: string; monto: number;
  estado: string; mesa?: string | null; id_externo?: string | null; qr?: string | null; url?: string | null; repetido?: boolean;
  confianza?: string; pagador?: string | null; expira_en?: string | null };
type Prov = { negocio_id: string; proveedor: string; ambiente: "sandbox" | "produccion"; publico: Record<string, unknown>; secreto: string | null; estado?: string; webhook_token?: string };

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
  return crearDb(env.SUPABASE_URL, k, k);
}

function usuario(req: Request, env: Env): Db {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  // La clave pública que usa la app (sirve también con las claves nuevas «sb_publishable_…»).
  const anon = req.headers.get("apikey") || env.SUPABASE_ANON_KEY || "";
  if (!jwt || jwt === anon) throw new ErrorVento("sin_sesion", "Entra a Vento Nube para usar los pagos", 401);
  return crearDb(env.SUPABASE_URL || "", anon, jwt);
}

const plata = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CO");
const nombreMetodo = (m: string) => ({ NEQUI: "Nequi", DAVIPLATA: "DaviPlata", CARD: "tarjeta", PSE: "PSE", BANCOLOMBIA_TRANSFER: "Bancolombia", BANCOLOMBIA_QR: "QR Bancolombia" } as Record<string, string>)[m] || m;

function credDe<T>(env: Env, p: Prov | null): Promise<T> {
  if (!p) throw new ErrorVento("proveedor_no_conectado", "Esa integración no está conectada", 400);
  return descifrar<T>(env, p.secreto);
}

// ---------- Resumen del estado de Nequi y DaviPlata ----------
export function resumen(provs: Array<{ proveedor: string; estado: string; ambiente: string; publico: Record<string, unknown>; webhook_visto_en?: string | null }>) {
  const w = provs.find((p) => p.proveedor === "wompi" && p.estado === "conectado");
  const n = provs.find((p) => p.proveedor === "nequi" && p.estado === "conectado");
  const metodos = (w && Array.isArray(w.publico.metodos) ? w.publico.metodos as string[] : []).map((x) => String(x).toUpperCase());
  const conocido = metodos.length > 0;
  const via = (nombre: string) => {
    const vias: string[] = [];
    if (nombre === "NEQUI" && n) vias.push("Nequi Conecta");
    if (w && (!conocido || metodos.includes(nombre))) vias.push("Wompi");
    return vias;
  };
  const uno = (nombre: string, etiqueta: string) => {
    const v = via(nombre);
    if (v.length) return { estado: "conectado", via: v, detalle: "Cobros por " + v.join(" y ") + (w && !conocido && v.includes("Wompi") ? " (el método se confirma con el primer pago)" : "") };
    if (w && conocido) return { estado: "pendiente", via: [], detalle: "Activa " + etiqueta + " en tu comercio de Wompi (Medios de pago) y toca «Comprobar»" };
    return { estado: "pendiente", via: [], detalle: "Falta conectar" };
  };
  return {
    nequi: uno("NEQUI", "Nequi"),
    daviplata: uno("DAVIPLATA", "DaviPlata"),
    webhook: w ? (w.webhook_visto_en ? "recibiendo" : "esperando") : null,
    ambiente: (w || n) ? (w || n)!.ambiente : null,
  };
}

// ---------- Aplicar lo que dijo el proveedor y avisar ----------
async function actualizar(env: Env, db: Db, negocio: string, proveedor: string, d: { referencia?: string | null; id_externo?: string | null; estado: string; estado_proveedor?: string | null; metodo?: string | null; monto?: number | null; extra?: Record<string, unknown> }) {
  const r = await db.rpc<{ cambio: boolean; nuevo: boolean; pago: Pago }>("srv_pago_actualizar", {
    p_negocio: negocio, p_proveedor: proveedor, p_referencia: d.referencia || null, p_id_externo: d.id_externo || null,
    p_estado: d.estado, p_estado_proveedor: d.estado_proveedor || null, p_metodo: d.metodo || null, p_monto: d.monto ?? null, p_extra: d.extra || {},
  });
  if (r.cambio && r.pago.estado === "aprobado" && r.pago.confianza !== "falso") {
    const p = r.pago;
    try {
      await avisarDispositivos(db, env.VENTO_SITIO || SITIO, negocio, {
        titulo: "💜 Llegó un pago",
        cuerpo: plata(p.monto) + " por " + nombreMetodo(p.metodo) + (p.pagador ? " de " + p.pagador : "") + (p.mesa ? " · Mesa " + p.mesa : "") + (p.confianza === "revisar" ? " (revisar)" : ""),
        url: env.VENTO_SITIO || SITIO, pago: p.id, tag: "pago-" + p.id,
      });
    } catch (e) { log("warn", "push", { error: String(e) }); }
  }
  log("info", "pago_actualizado", { negocio, proveedor, pago: r.pago.id, estado: r.pago.estado, cambio: r.cambio });
  return r;
}

// Consulta al proveedor el estado de un pago pendiente.
async function consultar(env: Env, db: Db, p: Pago & { negocio_id: string }) {
  const prov = await db.rpc<Prov | null>("srv_proveedor", { p_negocio: p.negocio_id, p_proveedor: p.proveedor });
  if (!prov) return null;
  if (p.proveedor === "wompi") {
    const cred = await credDe<W.WompiCred>(env, prov);
    const tx = await W.consultarReferencia(prov.ambiente, cred, p.referencia, env);
    if (!tx) return null;
    const t = W.normalizarTx(tx);
    return actualizar(env, db, p.negocio_id, "wompi", { referencia: p.referencia, id_externo: t.id_externo, estado: t.estado, estado_proveedor: t.estado_proveedor, metodo: t.metodo, monto: t.monto, extra: { pagador: t.pagador } });
  }
  if (p.proveedor === "nequi") {
    const codigo = p.id_externo || p.qr;
    if (!codigo) return null;
    const cred = await credDe<N.NequiCred>(env, prov);
    const s = await N.estado(prov.ambiente, cred, codigo, env);
    if (!s.ok) {
      await db.rpc("srv_pago_actualizar", { p_negocio: p.negocio_id, p_proveedor: "nequi", p_referencia: p.referencia, p_id_externo: null, p_estado: "pendiente", p_estado_proveedor: s.estado_proveedor, p_metodo: "NEQUI", p_monto: null, p_extra: { error: s.detalle || s.estado_proveedor } });
      return null;
    }
    return actualizar(env, db, p.negocio_id, "nequi", { referencia: p.referencia, estado: s.estado, estado_proveedor: s.estado_proveedor, metodo: "NEQUI", monto: s.estado === "aprobado" ? s.monto : null, extra: { pagador: s.pagador } });
  }
  return null;
}

async function sincronizar(env: Env, db: Db, negocio: string | null) {
  const lista = await db.rpc<Array<Pago & { negocio_id: string }>>("srv_pendientes", { p_negocio: negocio, p_limite: 40 });
  let revisados = 0, cambios = 0, errores = 0;
  for (const p of lista || []) {
    revisados++;
    try { const r = await consultar(env, db, p); if (r && r.cambio) cambios++; }
    catch (e) {
      errores++;
      log("warn", "sync_fallo", { pago: p.id, error: e instanceof Error ? e.message : String(e) });
      try { await db.rpc("srv_pago_actualizar", { p_negocio: p.negocio_id, p_proveedor: p.proveedor, p_referencia: p.referencia, p_id_externo: null, p_estado: "pendiente", p_estado_proveedor: null, p_metodo: null, p_monto: null, p_extra: { error: e instanceof Error ? e.message : String(e) } }); } catch { /* ya quedó en el log */ }
    }
  }
  return { revisados, cambios, errores };
}

// ---------- /google (YouTube sin vencerse) ----------
type GSecreto = { client_secret: string; refresh_token: string };
async function google(req: Request, env: Env, b: Record<string, unknown>) {
  const yo = usuario(req, env), db = servidor(env);
  const negocio = String(b.negocio || "");
  if (!negocio) throw new ErrorVento("falta_negocio", "Falta el negocio", 400);
  const accion = String(b.accion || "estado");
  const quien = await yo.rpc<string>("integracion_puedo", { p_negocio: negocio, p_accion: accion === "codigo" || accion === "olvidar" ? "configurar" : "usar" });
  const uid = quien.split(":")[0];
  const guardado = await db.rpc<{ publico: Record<string, unknown>; secreto: string | null; actualizado_en: string } | null>("srv_integracion", { p_negocio: negocio, p_tipo: "google" });
  if (accion === "estado") return { conectado: !!(guardado && guardado.secreto), client_id: guardado ? guardado.publico.client_id || null : null, desde: guardado ? guardado.publico.desde || null : null, cuenta: guardado ? guardado.publico.cuenta || null : null };
  if (accion === "olvidar") { await db.rpc("srv_integracion_borrar", { p_negocio: negocio, p_tipo: "google", p_usuario: uid }); return { conectado: false }; }
  if (accion === "codigo") {
    const code = String(b.code || ""), client_id = String(b.client_id || "").trim(), redirect_uri = String(b.redirect_uri || "postmessage");
    if (!code || !client_id) throw new ErrorVento("google_faltan", "Faltan el código o el Client ID", 400);
    const previo = guardado && guardado.secreto && guardado.publico.client_id === client_id ? await descifrar<GSecreto>(env, guardado.secreto) : null;
    const client_secret = String(b.client_secret || "").trim() || (previo ? previo.client_secret : "");
    if (!client_secret) throw new ErrorVento("google_secret", "Pega el Client Secret de tu cliente OAuth de Google (Google Cloud → Credenciales) para que la conexión no se venza.", 400);
    const t = await G.canjearCodigo({ code, client_id, client_secret, redirect_uri }, env);
    const refresh_token = t.refresh_token || (previo ? previo.refresh_token : "");
    if (!refresh_token) throw new ErrorVento("google_sin_refresh", "Google no entregó la llave de renovación. Entra a myaccount.google.com/permissions, quita el acceso de tu app y vuelve a tocar «Conectar con Google».", 400);
    await db.rpc("srv_integracion_guardar", { p_negocio: negocio, p_tipo: "google", p_publico: { client_id, desde: new Date().toISOString(), cuenta: b.cuenta ? String(b.cuenta).slice(0, 80) : (guardado && guardado.publico.cuenta) || null }, p_secreto: await cifrar(env, { client_secret, refresh_token }), p_usuario: uid });
    return { access_token: t.access_token, expires_in: t.expires_in || 3599, conectado: true };
  }
  if (accion === "token") {
    if (!guardado || !guardado.secreto) throw new ErrorVento("google_no_conectado", "Google todavía no está conectado en el servidor", 404);
    const s = await descifrar<GSecreto>(env, guardado.secreto);
    const t = await G.renovar({ refresh_token: s.refresh_token, client_id: String(guardado.publico.client_id || ""), client_secret: s.client_secret }, env);
    if (t.refresh_token && t.refresh_token !== s.refresh_token) await db.rpc("srv_integracion_guardar", { p_negocio: negocio, p_tipo: "google", p_publico: guardado.publico, p_secreto: await cifrar(env, { client_secret: s.client_secret, refresh_token: t.refresh_token }), p_usuario: uid });
    return { access_token: t.access_token, expires_in: t.expires_in || 3599 };
  }
  if (accion === "cuenta") {
    if (guardado) await db.rpc("srv_integracion_guardar", { p_negocio: negocio, p_tipo: "google", p_publico: { ...guardado.publico, cuenta: String(b.cuenta || "").slice(0, 80) }, p_secreto: null, p_usuario: uid });
    return { ok: true };
  }
  throw new ErrorVento("accion_invalida", "Acción desconocida", 400);
}

// ---------- /config ----------
async function config(req: Request, env: Env, b: Record<string, unknown>) {
  const yo = usuario(req, env), db = servidor(env);
  const negocio = String(b.negocio || "");
  if (!negocio) throw new ErrorVento("falta_negocio", "Falta el negocio", 400);
  const accion = String(b.accion || "estado");
  const base = (env.SUPABASE_URL || "").replace(/\/+$/, "") + "/functions/v1/vento-pagos";
  const pintar = async () => {
    const e = await yo.rpc<{ rol: string; proveedores: Array<{ proveedor: string; estado: string; ambiente: string; publico: Record<string, unknown>; webhook_token?: string; webhook_visto_en?: string | null; detalle?: string }>; dispositivos: number; pendientes: number; sin_aplicar: number }>("pagos_estado", { p_negocio: negocio });
    const wt = e.proveedores.find((p) => p.proveedor === "wompi" && p.webhook_token);
    return { ...e, resumen: resumen(e.proveedores), webhook_wompi: wt ? base + "/webhook/wompi/" + wt.webhook_token : null, aviso_url: base + "/aviso", version: VERSION };
  };
  if (accion === "estado") return pintar();
  const quien = await yo.rpc<string>("pagos_puedo", { p_negocio: negocio, p_accion: "configurar" });
  const uid = quien.split(":")[0];

  if (accion === "guardar_wompi" || (accion === "probar" && b.proveedor === "wompi")) {
    let cred: W.WompiCred;
    if (accion === "probar") cred = await credDe<W.WompiCred>(env, await db.rpc<Prov | null>("srv_proveedor", { p_negocio: negocio, p_proveedor: "wompi" }));
    else cred = { llave_publica: String(b.llave_publica || "").trim(), llave_privada: String(b.llave_privada || "").trim(), secreto_eventos: String(b.secreto_eventos || "").trim(), secreto_integridad: String(b.secreto_integridad || "").trim() };
    const rev = W.revisarLlaves(cred);
    if (rev.problemas.length || !rev.ambiente) throw new ErrorVento("wompi_llaves", rev.problemas.join(". ") || "Revisa las llaves", 400);
    let comercio: W.Comercio;
    try { comercio = await W.verificarComercio(rev.ambiente, cred, env); }
    catch (e) {
      if (accion === "probar") await db.rpc("srv_proveedor_guardar", { p_negocio: negocio, p_proveedor: "wompi", p_ambiente: rev.ambiente, p_publico: { llave_publica: cred.llave_publica }, p_secreto: null, p_estado: "error", p_detalle: e instanceof Error ? e.message : String(e), p_usuario: uid });
      throw e;
    }
    await db.rpc("srv_proveedor_guardar", {
      p_negocio: negocio, p_proveedor: "wompi", p_ambiente: rev.ambiente,
      p_publico: { llave_publica: cred.llave_publica, comercio: comercio.nombre || null, comercio_id: comercio.id || null, metodos: comercio.metodos },
      p_secreto: accion === "probar" ? null : await cifrar(env, cred), p_estado: "conectado",
      p_detalle: "Verificado con Wompi" + (comercio.nombre ? " · " + comercio.nombre : ""), p_usuario: uid,
    });
    return pintar();
  }
  if (accion === "guardar_nequi" || (accion === "probar" && b.proveedor === "nequi")) {
    const prev = await db.rpc<Prov | null>("srv_proveedor", { p_negocio: negocio, p_proveedor: "nequi" });
    let cred: N.NequiCred, amb: "sandbox" | "produccion", codigo: string;
    if (accion === "probar") { cred = await credDe<N.NequiCred>(env, prev); amb = prev!.ambiente; codigo = String(prev!.publico.codigo || ""); }
    else {
      cred = { client_id: String(b.client_id || "").trim(), client_secret: String(b.client_secret || "").trim(), api_key: String(b.api_key || "").trim() };
      amb = b.ambiente === "sandbox" ? "sandbox" : "produccion";
      codigo = String(b.codigo || "").trim();
      if (!cred.client_id || !cred.client_secret || !cred.api_key) throw new ErrorVento("nequi_faltan", "Faltan el Client ID, el Client Secret o la API Key", 400);
      if (!codigo) throw new ErrorVento("nequi_codigo", "Falta el código de comercio que te asignó Nequi Conecta", 400);
    }
    try { await N.verificar(amb, cred, env); }
    catch (e) {
      if (accion === "probar") await db.rpc("srv_proveedor_guardar", { p_negocio: negocio, p_proveedor: "nequi", p_ambiente: amb, p_publico: { codigo }, p_secreto: null, p_estado: "error", p_detalle: e instanceof Error ? e.message : String(e), p_usuario: uid });
      throw e;
    }
    await db.rpc("srv_proveedor_guardar", { p_negocio: negocio, p_proveedor: "nequi", p_ambiente: amb, p_publico: { codigo }, p_secreto: accion === "probar" ? null : await cifrar(env, cred), p_estado: "conectado", p_detalle: "Verificado con Nequi Conecta", p_usuario: uid });
    return pintar();
  }
  if (accion === "desconectar") {
    const prov = String(b.proveedor || "");
    if (prov !== "wompi" && prov !== "nequi") throw new ErrorVento("proveedor_invalido", "Proveedor inválido", 400);
    await db.rpc("srv_proveedor_desconectar", { p_negocio: negocio, p_proveedor: prov, p_usuario: uid });
    return pintar();
  }
  throw new ErrorVento("accion_invalida", "Acción desconocida", 400);
}

// ---------- /cobro ----------
async function cobro(req: Request, env: Env, b: Record<string, unknown>) {
  const yo = usuario(req, env), db = servidor(env);
  const negocio = String(b.negocio || "");
  const canal = ["link", "push", "qr"].includes(String(b.canal)) ? String(b.canal) : "link";
  const proveedor = b.proveedor ? String(b.proveedor) : (canal === "link" ? "wompi" : "nequi");
  if (proveedor === "wompi" && canal !== "link") throw new ErrorVento("canal_invalido", "Con Wompi el cobro es por link o QR del link", 400);
  const monto = Math.round(Number(b.monto) || 0);
  const tel = b.telefono ? String(b.telefono).replace(/\D/g, "") : null;
  if (canal === "push" && !/^3\d{9}$/.test(tel || "")) throw new ErrorVento("telefono_invalido", "Escribe el celular Nequi del cliente (10 dígitos)", 400);
  const p = await yo.rpc<Pago>("crear_cobro", {
    p_negocio: negocio, p_proveedor: proveedor, p_metodo: String(b.metodo || (proveedor === "nequi" ? "NEQUI" : "")), p_canal: canal,
    p_monto: monto, p_mesa: b.mesa != null ? String(b.mesa) : null, p_telefono: tel, p_clave: b.clave ? String(b.clave) : null,
  });
  if (p.repetido && (p.url || p.id_externo || p.qr || p.estado !== "pendiente")) return { pago: p };
  const prov = await db.rpc<Prov | null>("srv_proveedor", { p_negocio: negocio, p_proveedor: proveedor });
  try {
    if (proveedor === "wompi") {
      const cred = await credDe<W.WompiCred>(env, prov);
      const url = await W.linkCheckout({ cred, referencia: p.referencia, monto: p.monto, expira: p.expira_en ? new Date(p.expira_en).toISOString() : undefined });
      const r = await db.rpc<{ pago: Pago }>("srv_pago_actualizar", { p_negocio: negocio, p_proveedor: "wompi", p_referencia: p.referencia, p_id_externo: null, p_estado: "pendiente", p_estado_proveedor: null, p_metodo: null, p_monto: null, p_extra: { url } });
      return { pago: r.pago };
    }
    const cred = await credDe<N.NequiCred>(env, prov);
    const codigo = String(prov!.publico.codigo || "");
    if (canal === "push") {
      const x = await N.cobroPush(prov!.ambiente, cred, { telefono: tel!, codigo, monto: p.monto, referencia: p.referencia, mesa: p.mesa }, env);
      const r = await db.rpc<{ pago: Pago }>("srv_pago_actualizar", { p_negocio: negocio, p_proveedor: "nequi", p_referencia: p.referencia, p_id_externo: x.id_externo, p_estado: "pendiente", p_estado_proveedor: null, p_metodo: "NEQUI", p_monto: null, p_extra: {} });
      return { pago: r.pago };
    }
    const x = await N.cobroQR(prov!.ambiente, cred, { codigo, monto: p.monto, referencia: p.referencia, mesa: p.mesa }, env);
    const r = await db.rpc<{ pago: Pago }>("srv_pago_actualizar", { p_negocio: negocio, p_proveedor: "nequi", p_referencia: p.referencia, p_id_externo: x.id_externo, p_estado: "pendiente", p_estado_proveedor: null, p_metodo: "NEQUI", p_monto: null, p_extra: { qr: x.qr } });
    return { pago: r.pago };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.rpc("srv_pago_actualizar", { p_negocio: negocio, p_proveedor: proveedor, p_referencia: p.referencia, p_id_externo: null, p_estado: "error", p_estado_proveedor: null, p_metodo: null, p_monto: null, p_extra: { error: msg } });
    throw e;
  }
}

// ---------- /webhook/wompi/{token} ----------
async function webhookWompi(req: Request, env: Env, token: string) {
  const db = servidor(env);
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "";
  const crudo = await req.text();
  if (crudo.length > 200000) return json(413, { ok: false, error: "muy_grande" });
  let ev: unknown;
  try { ev = JSON.parse(crudo); } catch { return json(400, { ok: false, error: "json_invalido" }); }
  if (!W.pareceEvento(ev)) return json(400, { ok: false, error: "no_es_evento" });
  const prov = await db.rpc<Prov | null>("srv_proveedor_por_token", { p_token: token });
  const huella = "wompi:" + await sha256(ev.signature.checksum + ":" + ev.timestamp);
  if (!prov) {
    // No se guarda nada: así nadie puede llenar la base con eventos inventados.
    log("warn", "wompi_token_desconocido", { ip });
    return json(404, { ok: false, error: "token_desconocido" });
  }
  const cred = await credDe<W.WompiCred>(env, prov);
  const valida = await W.verificarEvento(ev, cred.secreto_eventos, req.headers.get("x-event-checksum"));
  const tx = (ev.data && (ev.data as Record<string, unknown>).transaction) as W.TxWompi | undefined;
  const nuevo = await db.rpc<boolean>("srv_evento", {
    p_proveedor: "wompi", p_huella: huella, p_negocio: prov.negocio_id, p_tipo: ev.event, p_id_externo: tx ? String(tx.id) : null,
    p_referencia: tx ? String(tx.reference || "") : null, p_firma_valida: valida, p_resultado: valida ? "recibido" : "firma_invalida",
    p_cuerpo: valida ? ev : { event: ev.event, timestamp: ev.timestamp }, p_ip: ip, p_error: null,
  });
  if (!valida) { log("warn", "wompi_firma_invalida", { negocio: prov.negocio_id, ip }); return json(401, { ok: false, error: "firma_invalida" }); }
  if (!nuevo) return json(200, { ok: true, duplicado: true });
  await db.rpc("srv_webhook_visto", { p_negocio: prov.negocio_id, p_proveedor: "wompi" });
  const ambEv = String(ev.environment || "").toLowerCase();
  if ((ambEv === "test" && prov.ambiente !== "sandbox") || (ambEv === "prod" && prov.ambiente !== "produccion")) {
    await db.rpc("srv_evento_resultado", { p_huella: huella, p_resultado: "ambiente_distinto" });
    return json(200, { ok: true, ignorado: "ambiente_distinto" });
  }
  if (ev.event !== "transaction.updated" || !tx) {
    await db.rpc("srv_evento_resultado", { p_huella: huella, p_resultado: "ignorado" });
    return json(200, { ok: true, ignorado: ev.event });
  }
  try {
    const t = W.normalizarTx(tx);
    const r = await actualizar(env, db, prov.negocio_id, "wompi", { referencia: t.referencia, id_externo: t.id_externo, estado: t.estado, estado_proveedor: t.estado_proveedor, metodo: t.metodo, monto: t.monto, extra: { pagador: t.pagador, canal: "link", detalle: t.detalle } });
    await db.rpc("srv_evento_resultado", { p_huella: huella, p_resultado: r.cambio ? "procesado" : "sin_cambio" });
    return json(200, { ok: true, estado: r.pago.estado });
  } catch (e) {
    await db.rpc("srv_evento_resultado", { p_huella: huella, p_resultado: "error", p_error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

// ---------- /aviso (celular autorizado) ----------
async function aviso(req: Request, env: Env, tokenRuta: string | null) {
  const db = servidor(env);
  const tok = tokenRuta || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!tok || tok.length < 20) return json(401, { ok: false, error: "sin_token" });
  const d = await db.rpc<{ id: string; negocio_id: string; rol: string; nombre: string } | null>("srv_dispositivo_por_token", { p_token: tok });
  if (!d) return json(401, { ok: false, error: "dispositivo_no_autorizado" });
  if (!["dueno", "admin", "cajero"].includes(d.rol)) return json(403, { ok: false, error: "rol_sin_permiso" });
  let txt = await req.text();
  try { const j = JSON.parse(txt); if (j && typeof j === "object") txt = [j.app, j.titulo, j.texto].filter(Boolean).join(" | ") || String(j.text || ""); } catch { /* texto plano de MacroDroid */ }
  txt = txt.slice(0, 1000);
  const a = leerAviso(txt);
  const ventana = Math.floor(Date.now() / 120000); // dos minutos: la misma notificación repetida no cuenta dos veces
  const huella = "aviso:" + await sha256(d.negocio_id + ":" + txt.replace(/\s+/g, " ").trim().toLowerCase() + ":" + ventana);
  const nuevo = await db.rpc<boolean>("srv_evento", { p_proveedor: "dispositivo", p_huella: huella, p_negocio: d.negocio_id, p_tipo: "notificacion", p_id_externo: null, p_referencia: null, p_firma_valida: true, p_resultado: a ? "recibido" : "ignorado", p_cuerpo: { texto: txt, dispositivo: d.id }, p_ip: req.headers.get("x-forwarded-for") || "", p_error: null });
  if (!nuevo) return json(200, { ok: true, duplicado: true });
  if (!a) return json(200, { ok: true, ignorado: "no_es_un_pago_recibido" });
  const r = await actualizar(env, db, d.negocio_id, "dispositivo", {
    referencia: "AV-" + huella.slice(6, 22), estado: a.confianza === "falso" ? "rechazado" : "aprobado", estado_proveedor: "NOTIFICACION",
    metodo: a.metodo, monto: a.monto, extra: { confianza: a.confianza, verificado: false, pagador: a.de || null, canal: "notificacion", detalle: a.fuente },
  });
  await db.rpc("srv_evento_resultado", { p_huella: huella, p_resultado: "procesado" });
  return json(200, { ok: true, pago: r.pago.id, confianza: a.confianza, monto: a.monto });
}

// ---------- Entrada ----------
export async function manejar(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const partes = url.pathname.split("/").filter(Boolean);
  const i = partes.indexOf("vento-pagos");
  const ruta = (i >= 0 ? partes.slice(i + 1) : partes);
  const cors = cabecerasCors(req, env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const r0 = ruta[0] || "salud";
    if (r0 === "salud") return json(200, { ok: true, servicio: "vento-pagos", version: VERSION, integraciones: ["wompi", "nequi_conecta", "avisos_dispositivo", "google_youtube"], push: true }, cors);
    if (r0 === "webhook" && ruta[1] === "wompi" && ruta[2] && req.method === "POST") return await webhookWompi(req, env, ruta[2]);
    if (r0 === "aviso" && req.method === "POST") return await aviso(req, env, ruta[1] || null);
    if (r0 === "push-clave") { const v = await vapid(servidor(env), env.VENTO_SITIO || SITIO); return json(200, { publica: v.publica }, cors); }
    if (req.method !== "POST") return json(405, { ok: false, error: "metodo" }, cors);
    if (r0 === "sync" && env.VENTO_CRON_SECRETO && req.headers.get("x-vento-cron") === env.VENTO_CRON_SECRETO) {
      const db = servidor(env);
      const r = await sincronizar(env, db, null);
      try { await db.rpc("srv_limpiar"); } catch { /* no es grave */ }
      return json(200, { ok: true, ...r }, cors);
    }
    const b = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (r0 === "config") return json(200, await config(req, env, b), cors);
    if (r0 === "google") return json(200, await google(req, env, b), cors);
    if (r0 === "cobro") return json(200, await cobro(req, env, b), cors);
    if (r0 === "sync") {
      const negocio = String(b.negocio || "");
      await usuario(req, env).rpc("pagos_puedo", { p_negocio: negocio, p_accion: "cobrar" });
      return json(200, { ok: true, ...(await sincronizar(env, servidor(env), negocio)) }, cors);
    }
    if (r0 === "estado") {
      const negocio = String(b.negocio || "");
      await usuario(req, env).rpc("pagos_puedo", { p_negocio: negocio, p_accion: "cobrar" });
      const db = servidor(env);
      const p = await db.rpc<(Pago & { negocio_id: string }) | null>("srv_pago", { p_id: String(b.pago || "") });
      if (!p || p.negocio_id !== negocio) throw new ErrorVento("no_existe", "Ese pago no existe", 404);
      if (p.estado === "pendiente" || p.estado === "error") await consultar(env, db, p);
      return json(200, { pago: await db.rpc("srv_pago", { p_id: p.id }) }, cors);
    }
    return json(404, { ok: false, error: "ruta" }, cors);
  } catch (e) {
    const ev = e instanceof ErrorVento ? e : new ErrorVento("interno", "Error interno", 500);
    if (!(e instanceof ErrorVento)) log("error", "excepcion", { ruta: ruta.join("/"), error: e instanceof Error ? e.stack || e.message : String(e) });
    return json(ev.status, { ok: false, error: ev.codigo, mensaje: ev.message }, cors);
  }
}
