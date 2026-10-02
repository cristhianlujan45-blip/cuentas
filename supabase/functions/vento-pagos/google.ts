// Google (YouTube) con renovación automática: flujo oficial de «código de autorización» de Google.
//  • La app consigue un código con Google Identity Services (initCodeClient) y lo manda aquí.
//  • El servidor lo canjea en https://oauth2.googleapis.com/token y guarda (cifrado) el refresh token.
//  • Cada vez que el acceso (1 hora) va a vencer, la app pide uno nuevo: grant_type=refresh_token.
// Documentación: https://developers.google.com/identity/oauth2/web/guides/use-code-model
import { ErrorVento, pedir } from "./util.ts";

export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

type RespToken = { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string; error?: string; error_description?: string };

async function token(url: string, campos: Record<string, string>, reintentos: number): Promise<RespToken> {
  const r = await pedir(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(campos).toString(),
    reintentos,
  });
  let j: RespToken = {};
  try { j = await r.json(); } catch { /* respuesta vacía */ }
  if (!r.ok || !j.access_token) {
    const e = j.error || "http_" + r.status;
    if (e === "invalid_grant") throw new ErrorVento("google_revocado", "Google ya no acepta la conexión guardada (se quitó el permiso o venció). Toca «Conectar con Google» una vez más.", 409);
    if (e === "invalid_client" || e === "unauthorized_client") throw new ErrorVento("google_cliente", "Google rechazó el Client ID o el Client Secret: revísalos en Música → YouTube.", 400);
    if (e === "redirect_uri_mismatch") throw new ErrorVento("google_redirect", "Google no reconoce esta dirección de regreso: agrégala en Google Cloud → Credenciales → URIs de redireccionamiento autorizados.", 400);
    throw new ErrorVento("google_error", "Google: " + (j.error_description || e), r.status >= 500 ? 502 : 400);
  }
  return j;
}

export function canjearCodigo(o: { code: string; client_id: string; client_secret: string; redirect_uri: string }, env: Record<string, string | undefined> = {}) {
  // Canjear un código no se reintenta: un código sirve una sola vez.
  return token(env.VENTO_GOOGLE_TOKEN_URL || GOOGLE_TOKEN, { grant_type: "authorization_code", code: o.code, client_id: o.client_id, client_secret: o.client_secret, redirect_uri: o.redirect_uri }, 0);
}

export function renovar(o: { refresh_token: string; client_id: string; client_secret: string }, env: Record<string, string | undefined> = {}) {
  return token(env.VENTO_GOOGLE_TOKEN_URL || GOOGLE_TOKEN, { grant_type: "refresh_token", refresh_token: o.refresh_token, client_id: o.client_id, client_secret: o.client_secret }, 2);
}
