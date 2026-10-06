// Pago MANUAL (la beta): la persona paga por Nequi o DaviPlata al número de Vento, envía la foto del
// comprobante y un proveedor de Vento lo aprueba o rechaza a mano en el panel de administración.
//
// Orden pensado para que NUNCA quede un pago sin su comprobante:
//   1. se valida la foto (JPEG / PNG / WebP por sus bytes, máximo 3 MB) y se saca su huella sha256
//   2. se sube a Storage con el id que tendrá el pago:  comprobantes/{negocio}/{pago}.{ext}
//   3. srv_sub_pago_crear guarda el pago Y el comprobante en UNA sola transacción
//   Si Storage falla → no se crea el pago (la persona reintenta con la misma idem).
//   Si la base de datos lo rechaza (duplicado, plan inválido…) o era un reenvío (misma idem) → se borra la foto
//   que sobró. En el peor caso queda una foto suelta en el bucket privado, nunca un pago huérfano.
import { deB64, ErrorVento, hex, uuid } from "../../vento-pagos/util.ts";
import { borrar, subir } from "../almacen.ts";
import { errorSub } from "../nucleo.ts";
import type { ConfigCobro, Ctx, EntradaPago, PagoPublico, PaymentProvider, ResultadoPago } from "./tipos.ts";

export const MAX_COMPROBANTE = 3 * 1024 * 1024;
const MIMES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
type Ext = keyof typeof MIMES;

// Tipo real de la imagen por sus primeros bytes (no se confía en lo que diga el celular).
export function tipoPorBytes(b: Uint8Array): Ext | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

const invalido = (m: string) => new ErrorVento("comprobante_invalido", m, 400);

export function leerComprobante(c: unknown): { bytes: Uint8Array<ArrayBuffer>; mime: string; ext: Ext } {
  const o = (c && typeof c === "object" ? c : {}) as { base64?: unknown };
  let b64 = typeof o.base64 === "string" ? o.base64.trim() : "";
  const pre = /^data:[\w/+.-]+;base64,/.exec(b64);
  if (pre) b64 = b64.slice(pre[0].length);
  b64 = b64.replace(/\s+/g, "");
  if (!b64) throw invalido("Falta la foto del comprobante.");
  if (b64.length > Math.ceil(MAX_COMPROBANTE / 3) * 4 + 4) throw invalido("La foto pesa más de 3 MB. Tómala otra vez o recórtala.");
  let bytes: Uint8Array<ArrayBuffer>;
  try { bytes = deB64(b64.replace(/-/g, "+").replace(/_/g, "/")); } catch { throw invalido("El comprobante no es una imagen."); }
  if (bytes.length > MAX_COMPROBANTE) throw invalido("La foto pesa más de 3 MB. Tómala otra vez o recórtala.");
  const ext = bytes.length >= 64 ? tipoPorBytes(bytes) : null;
  if (!ext) throw invalido("El comprobante debe ser una foto (JPG, PNG o WebP).");
  return { bytes, mime: MIMES[ext], ext };
}

// Día de hoy en Colombia (AAAA-MM-DD).
const hoyBogota = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

function fechaPago(f: unknown): string {
  const s = String(f || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s + "T12:00:00Z"))) return hoyBogota();
  // No se acepta una fecha futura (más de un día por la diferencia de hora) ni de hace más de un año.
  const t = Date.parse(s + "T12:00:00Z"), ahora = Date.now();
  return t > ahora + 36 * 3600 * 1000 || t < ahora - 366 * 86400 * 1000 ? hoyBogota() : s;
}

const texto = (v: unknown, max: number) => (v == null ? null : String(v).trim().slice(0, max) || null);

export class ManualPaymentProvider implements PaymentProvider {
  id = "manual" as const;

  // Siempre disponible: es el medio de la beta (y el respaldo si Google Play no está configurado).
  disponible(_cfg: ConfigCobro): boolean {
    return true;
  }

  async registrarPago(ctx: Ctx, e: EntradaPago): Promise<ResultadoPago> {
    const metodo = String(e.metodo || "").trim().toUpperCase();
    if (metodo !== "NEQUI" && metodo !== "DAVIPLATA") throw errorSub("metodo_invalido");
    const monto = Math.round(Number(e.monto) || 0);
    if (!(monto > 0)) throw errorSub("monto_invalido");
    const img = leerComprobante(e.comprobante);
    const sha = hex(await crypto.subtle.digest("SHA-256", img.bytes));
    const id = uuid();
    const ruta = ctx.negocio + "/" + id + "." + img.ext;
    await subir(ctx.env, ruta, img.bytes, img.mime);
    let r: { payment?: PagoPublico; repetido?: boolean; error?: string };
    try {
      r = await ctx.db.rpc("srv_sub_pago_crear", {
        p_negocio: ctx.negocio, p_usuario: ctx.usuario.id, p_plan: String(e.plan || ""), p_metodo: metodo, p_monto: monto,
        p_referencia: texto(e.referencia, 60), p_nombre: texto(e.nombre, 80), p_telefono: texto(e.telefono, 20),
        p_fecha: fechaPago(e.fecha), p_idem: texto(e.idem, 80), p_hash: sha,
        p_id: id, p_path: ruta, p_mime: img.mime, p_size: img.bytes.length,
      });
    } catch (err) {
      // Solo se borra la foto si la base RECHAZÓ el pago (validación). Con un error de red o del servidor el pago pudo
      // quedar guardado (la respuesta se perdió): mejor una foto suelta que un pago sin su comprobante.
      const e2 = err as { status?: number; codigo?: string };
      if (e2 && typeof e2.status === "number" && e2.status < 500 && e2.codigo !== "red" && e2.codigo !== "db") await borrar(ctx.env, ruta);
      throw err;
    }
    if (r.error || !r.payment) {
      await borrar(ctx.env, ruta);
      throw errorSub(r.error || "interno", r.error ? undefined : "No se pudo registrar el pago");
    }
    // Reenvío: el pago (y su foto) ya existían. Si es ESTE mismo id (el reintento automático de la consulta después de
    // que la primera sí se guardó), la foto recién subida ES la del pago: no se borra.
    if (r.repetido && r.payment.id !== id) await borrar(ctx.env, ruta);
    return { payment: r.payment, repetido: !!r.repetido };
  }
}
