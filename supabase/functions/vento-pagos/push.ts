// Notificaciones Web Push (estándar de los navegadores) para avisar «💜 Llegó un pago» aunque Vento esté cerrada.
//  • RFC 8292 (VAPID): el servidor se identifica con un par de llaves P-256 que crea solo la primera vez.
//  • RFC 8291 (aes128gcm): el contenido va cifrado para cada celular; el servicio de push no lo puede leer.
import { b64url, type Bytes, deB64url, log } from "./util.ts";
import type { Db } from "./db.ts";

const enc = new TextEncoder();
const bytes = (s: string): Bytes => new Uint8Array(enc.encode(s));

export type Vapid = { publica: string; privada: JsonWebKey; sub: string };
export type Suscripcion = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function vapid(db: Db, sitio: string): Promise<Vapid> {
  let v = await db.rpc<Vapid | null>("srv_config", { p_clave: "vapid" });
  if (v && v.publica && v.privada) return v;
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const publica = b64url(await crypto.subtle.exportKey("raw", par.publicKey));
  const privada = await crypto.subtle.exportKey("jwk", par.privateKey);
  // Si dos funciones las crean a la vez, gana la primera que se guardó (insert … on conflict do nothing).
  v = await db.rpc<Vapid>("srv_config", { p_clave: "vapid", p_valor: { publica, privada, sub: sitio } });
  return v;
}

async function hmac(clave: Bytes, datos: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", clave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, datos));
}

function unir(...partes: Bytes[]): Bytes {
  const n = partes.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n);
  let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}

export async function cifrarMensaje(sus: Suscripcion, texto: string): Promise<Bytes> {
  const uaPub = deB64url(sus.keys.p256dh), auth = deB64url(sus.keys.auth);
  const efimera = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", efimera.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, efimera.privateKey, 256));
  const prkKey = await hmac(auth, compartido);
  const ikm = (await hmac(prkKey, unir(bytes("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])))).slice(0, 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(sal, ikm);
  const cek = (await hmac(prk, unir(bytes("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, unir(bytes("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, unir(bytes(texto), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return unir(sal, rs, new Uint8Array([asPub.length]), asPub, ct);
}

export async function jwtVapid(v: Vapid, endpoint: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const cab = b64url(bytes(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const cuerpo = b64url(bytes(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: v.sub })));
  const k = await crypto.subtle.importKey("jwk", v.privada, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const firma = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k, bytes(cab + "." + cuerpo)));
  return cab + "." + cuerpo + "." + b64url(firma);
}

export async function enviarPush(v: Vapid, sus: Suscripcion, mensaje: Record<string, unknown>): Promise<number> {
  const cuerpo = await cifrarMensaje(sus, JSON.stringify(mensaje));
  const r = await fetch(sus.endpoint, {
    method: "POST",
    headers: {
      Authorization: "vapid t=" + (await jwtVapid(v, sus.endpoint)) + ", k=" + v.publica,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600",
      Urgency: "high",
    },
    body: cuerpo,
  });
  return r.status;
}

// Avisa a todos los celulares autorizados (dueño, admin y caja) que tengan las notificaciones activas.
export async function avisarDispositivos(db: Db, sitio: string, negocio: string, mensaje: Record<string, unknown>) {
  let destinos: Array<{ id: string; push: Suscripcion }> = [];
  try { destinos = await db.rpc("srv_push_destinos", { p_negocio: negocio }); } catch (e) { log("warn", "push_destinos", { error: String(e) }); return 0; }
  if (!destinos || !destinos.length) return 0;
  const v = await vapid(db, sitio);
  let ok = 0;
  await Promise.all(destinos.map(async (d) => {
    try {
      const st = await enviarPush(v, d.push, mensaje);
      if (st === 404 || st === 410) await db.rpc("srv_push_invalido", { p_dispositivo: d.id });
      else if (st < 300) ok++;
    } catch (e) { log("warn", "push_fallo", { dispositivo: d.id, error: String(e) }); }
  }));
  return ok;
}
