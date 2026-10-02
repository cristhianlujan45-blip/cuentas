// Cifrado de las credenciales de Nequi / Wompi antes de guardarlas en la base de datos (AES-256-GCM).
// La llave sale de VENTO_CIFRADO_CLAVE (32 bytes en base64). Si no se definió, se deriva con HKDF de la
// llave de servicio del proyecto (que Supabase ya le da a la función): no hay que configurar nada.
import { b64, deB64, ErrorVento } from "./util.ts";

const enc = new TextEncoder(), dec = new TextDecoder();
let cache: { base: string; key: CryptoKey } | null = null;

async function llave(env: Record<string, string | undefined>): Promise<CryptoKey> {
  const propia = env.VENTO_CIFRADO_CLAVE || "";
  const base = propia || env.SUPABASE_SERVICE_ROLE_KEY || env.VENTO_SERVICE_KEY || "";
  if (!base) throw new ErrorVento("sin_llave", "El servidor no tiene llave de cifrado", 500);
  if (cache && cache.base === base) return cache.key;
  let key: CryptoKey;
  if (propia) {
    const raw = deB64(propia);
    if (raw.length !== 32) throw new ErrorVento("llave_invalida", "VENTO_CIFRADO_CLAVE debe tener 32 bytes en base64", 500);
    key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  } else {
    const ikm = await crypto.subtle.importKey("raw", enc.encode(base), "HKDF", false, ["deriveKey"]);
    key = await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: enc.encode("vento-pagos-v1"), info: enc.encode("credenciales") },
      ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
    );
  }
  cache = { base, key };
  return key;
}

export async function cifrar(env: Record<string, string | undefined>, datos: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await llave(env), enc.encode(JSON.stringify(datos)));
  return "v1:" + b64(iv) + ":" + b64(ct);
}

export async function descifrar<T = Record<string, string>>(env: Record<string, string | undefined>, txt: string | null | undefined): Promise<T> {
  if (!txt) throw new ErrorVento("sin_credenciales", "Faltan las credenciales de este proveedor", 400);
  const [v, iv, ct] = String(txt).split(":");
  if (v !== "v1" || !iv || !ct) throw new ErrorVento("credenciales_invalidas", "Credenciales guardadas con un formato desconocido", 500);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(iv) }, await llave(env), deB64(ct));
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    throw new ErrorVento("credenciales_ilegibles", "No se pudieron leer las credenciales guardadas: vuelve a conectarlas", 409);
  }
}
