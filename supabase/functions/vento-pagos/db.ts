// Acceso a la base de datos por la API REST de Supabase (PostgREST).
//  • como servidor: llave de servicio → puede llamar las funciones srv_*.
//  • como el usuario: su sesión (JWT) → las funciones revisan su rol con auth.uid().
import { ErrorVento, pedir } from "./util.ts";

export type Db = {
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T>;
};

function errorDeDb(status: number, cuerpo: string): ErrorVento {
  let msg = cuerpo;
  try {
    const j = JSON.parse(cuerpo);
    msg = j.message || j.error || cuerpo;
  } catch { /* texto plano */ }
  const conocido = /(sin_permiso|sin_sesion|proveedor_no_conectado|monto_invalido|proveedor_invalido|canal_invalido|no_existe|estado_invalido)/.exec(msg);
  if (conocido) {
    const st = conocido[1] === "sin_permiso" || conocido[1] === "sin_sesion" ? 403 : 400;
    return new ErrorVento(conocido[1], msg, st);
  }
  if (status === 401 || /JWT|jwt/.test(msg)) return new ErrorVento("sin_sesion", "La sesión venció: vuelve a entrar a Vento Nube", 401);
  return new ErrorVento("db", "Base de datos: " + msg, status >= 500 ? 502 : 400);
}

export function crearDb(url: string, apikey: string, bearer: string): Db {
  const base = url.replace(/\/+$/, "") + "/rest/v1";
  return {
    async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
      const r = await pedir(base + "/rpc/" + fn, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey, Authorization: "Bearer " + bearer },
        body: JSON.stringify(args),
        reintentos: 1,
      });
      const txt = await r.text();
      if (!r.ok) throw errorDeDb(r.status, txt);
      return (txt ? JSON.parse(txt) : null) as T;
    },
  };
}
