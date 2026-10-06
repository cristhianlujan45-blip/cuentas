// Comprobantes en Supabase Storage (bucket PRIVADO «comprobantes»). Solo el servidor sube, firma y borra.
// Ruta de cada foto: comprobantes/{negocio}/{pago}.{jpg|png|webp}
import { type Env, ErrorVento, esperar, log, pedir } from "../vento-pagos/util.ts";

export const BUCKET = "comprobantes";

function cfg(env: Env) {
  const url = (env.SUPABASE_URL || "").replace(/\/+$/, "");
  const k = env.SUPABASE_SERVICE_ROLE_KEY || env.VENTO_SERVICE_KEY || "";
  if (!url || !k) throw new ErrorVento("sin_config", "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el servidor", 500);
  return { base: url + "/storage/v1", h: { apikey: k, Authorization: "Bearer " + k } };
}

// Sube la foto. Reintenta una vez si Storage falla; la ruta es única (lleva el id del pago), así que un
// «ya existe» después de una respuesta perdida cuenta como subida.
export async function subir(env: Env, ruta: string, bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<void> {
  const { base, h } = cfg(env);
  let ultimo = "";
  for (let i = 0; i < 2; i++) {
    try {
      const r = await pedir(base + "/object/" + BUCKET + "/" + ruta, {
        method: "POST", headers: { ...h, "Content-Type": mime, "x-upsert": "false", "cache-control": "max-age=0" }, body: bytes, tiempo: 20000,
      });
      if (r.ok) return;
      const t = await r.text();
      if (r.status === 409 || /already exists|duplicate/i.test(t)) return;
      ultimo = r.status + " " + t.slice(0, 200);
      if (r.status < 500 && r.status !== 429) break;
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e);
    }
    if (i === 0) await esperar(400);
  }
  log("error", "comprobante_no_subio", { ruta, error: ultimo });
  throw new ErrorVento("almacen", "No se pudo guardar la foto del comprobante. Intenta otra vez en un momento.", 502);
}

// URL firmada para ver la foto (por defecto 10 minutos).
export async function firmar(env: Env, ruta: string, segundos = 600): Promise<string> {
  const { base, h } = cfg(env);
  const r = await pedir(base + "/object/sign/" + BUCKET + "/" + ruta, {
    method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: segundos }), reintentos: 1,
  });
  const j = await r.json().catch(() => ({})) as { signedURL?: string; signedUrl?: string };
  const s = j.signedURL || j.signedUrl;
  if (!r.ok || !s) throw new ErrorVento("almacen", "No se pudo abrir el comprobante", 502);
  return /^https?:\/\//.test(s) ? s : base + (s.startsWith("/") ? s : "/" + s);
}

// Borra una foto que sobró (pago repetido o rechazado por la base de datos). Nunca lanza.
export async function borrar(env: Env, ruta: string): Promise<boolean> {
  try {
    const { base, h } = cfg(env);
    const r = await pedir(base + "/object/" + BUCKET, {
      method: "DELETE", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [ruta] }), reintentos: 1,
    });
    return r.ok;
  } catch (e) {
    log("warn", "comprobante_no_se_borro", { ruta, error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}
