// Utilidades del servidor de pagos de Vento. Solo APIs web estándar (fetch, crypto.subtle),
// así el mismo código corre en Supabase Edge Functions (Deno) y en las pruebas (Node).

export type Env = Record<string, string | undefined>;

export function leerEnv(): Env {
  const g = globalThis as unknown as { Deno?: { env: { toObject(): Record<string, string> } }; process?: { env: Env } };
  if (g.Deno) return g.Deno.env.toObject();
  return (g.process && g.process.env) || {};
}

const enc = new TextEncoder();

export function hex(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function sha256(txt: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(txt)));
}

export function b64(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

export type Bytes = Uint8Array<ArrayBuffer>;

export function deB64(s: string): Bytes {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64url(buf: ArrayBuffer | Uint8Array): string {
  return b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deB64url(s: string): Bytes {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  return deB64(t + "===".slice((t.length + 3) % 4));
}

// Comparación en tiempo constante (para firmas).
export function igualesSeguro(a: string, b: string): boolean {
  const x = String(a || "").toLowerCase(), y = String(b || "").toLowerCase();
  if (x.length !== y.length || !x.length) return false;
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return r === 0;
}

export function aleatorio(n = 16): string {
  return hex(crypto.getRandomValues(new Uint8Array(n)));
}

export function uuid(): string {
  return crypto.randomUUID();
}

export const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ErrorVento extends Error {
  status: number;
  codigo: string;
  constructor(codigo: string, mensaje: string, status = 400) {
    super(mensaje);
    this.codigo = codigo;
    this.status = status;
  }
}

// fetch con tiempo límite y reintentos SOLO para operaciones idempotentes (consultas, token).
export async function pedir(url: string, init: RequestInit & { reintentos?: number; tiempo?: number } = {}): Promise<Response> {
  const intentos = Math.max(1, (init.reintentos ?? 0) + 1);
  let ultimo: unknown = null;
  for (let i = 0; i < intentos; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), init.tiempo ?? 12000);
    try {
      const r = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(t);
      if ((r.status >= 500 || r.status === 429) && i < intentos - 1) {
        ultimo = new Error("HTTP " + r.status);
        await esperar(400 * Math.pow(2, i));
        continue;
      }
      return r;
    } catch (e) {
      clearTimeout(t);
      ultimo = e;
      if (i < intentos - 1) await esperar(400 * Math.pow(2, i));
    }
  }
  throw new ErrorVento("red", "No se pudo conectar: " + (ultimo instanceof Error ? ultimo.message : String(ultimo)), 502);
}

export function enmascararTel(t: string | null | undefined): string | null {
  const d = String(t || "").replace(/\D/g, "");
  return d.length >= 4 ? "•••" + d.slice(-4) : null;
}

// Registro estructurado (Supabase guarda la salida de las funciones en «Logs»). Nunca imprime secretos.
export function log(nivel: "info" | "warn" | "error", evento: string, datos: Record<string, unknown> = {}) {
  const limpio: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(datos)) {
    if (/secret|clave|token|key|password|autoriz/i.test(k)) continue;
    limpio[k] = v;
  }
  const linea = JSON.stringify({ t: new Date().toISOString(), nivel, evento, ...limpio });
  if (nivel === "error") console.error(linea);
  else if (nivel === "warn") console.warn(linea);
  else console.log(linea);
}
