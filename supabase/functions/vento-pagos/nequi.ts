// Nequi Conecta (API oficial de Nequi para negocios): https://conecta.nequi.com.co
//  • Token OAuth2:  POST https://oauth.nequi.com/oauth2/token?grant_type=client_credentials
//                   (pruebas: https://oauth.sandbox.nequi.com/oauth2/token), Authorization: Basic base64(client_id:client_secret)
//  • API:           https://api.nequi.com   (pruebas: https://api.sandbox.nequi.com)
//                   encabezados: Authorization: Bearer <token>, x-api-key: <API key de Conecta>
//  • Cobro push:    /payments/v2/-services-paymentservice-unregisteredpayment   (canal PNP04-C001) → transactionId
//  • Código QR:     /payments/v2/-services-paymentservice-generatecodeqr        (canal PQR03-C001) → codeQR
//  • Estado:        /payments/v2/-services-paymentservice-getstatuspayment      → status ("35" = pago realizado)
//  • Cancelar push: /payments/v2/-services-paymentservice-cancelunregisteredpayment
//  Todas las respuestas traen ResponseMessage.ResponseHeader.Status.StatusCode ("0" = éxito).
import { b64, ErrorVento, pedir, uuid } from "./util.ts";

export type NequiCred = { client_id: string; client_secret: string; api_key: string };
export type Ambiente = "sandbox" | "produccion";

export const NEQUI = {
  sandbox: { auth: "https://oauth.sandbox.nequi.com/oauth2/token", api: "https://api.sandbox.nequi.com" },
  produccion: { auth: "https://oauth.nequi.com/oauth2/token", api: "https://api.nequi.com" },
};
export const RUTAS = {
  push: "/payments/v2/-services-paymentservice-unregisteredpayment",
  qr: "/payments/v2/-services-paymentservice-generatecodeqr",
  estado: "/payments/v2/-services-paymentservice-getstatuspayment",
  cancelar: "/payments/v2/-services-paymentservice-cancelunregisteredpayment",
};
const CANAL = { push: "PNP04-C001", qr: "PQR03-C001" };
export const NEQUI_PAGADO = "35";

function urls(amb: Ambiente, env: Record<string, string | undefined>) {
  return {
    auth: (amb === "sandbox" ? env.VENTO_NEQUI_AUTH_SANDBOX : env.VENTO_NEQUI_AUTH) || NEQUI[amb].auth,
    api: (amb === "sandbox" ? env.VENTO_NEQUI_API_SANDBOX : env.VENTO_NEQUI_API) || NEQUI[amb].api,
  };
}

const tokens = new Map<string, { token: string; tipo: string; vence: number }>();

export async function token(amb: Ambiente, c: NequiCred, env: Record<string, string | undefined> = {}): Promise<string> {
  const k = amb + ":" + c.client_id;
  const t = tokens.get(k);
  if (t && t.vence > Date.now() + 30000) return t.tipo + " " + t.token;
  const r = await pedir(urls(amb, env).auth + "?grant_type=client_credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Authorization: "Basic " + b64(new TextEncoder().encode(c.client_id + ":" + c.client_secret)) },
    reintentos: 2,
  });
  if (r.status === 400 || r.status === 401 || r.status === 403) throw new ErrorVento("nequi_credenciales", "Nequi rechazó el Client ID o el Client Secret", 400);
  if (!r.ok) throw new ErrorVento("nequi_http", "Nequi (token) respondió " + r.status, 502);
  const j = await r.json();
  if (!j || !j.access_token) throw new ErrorVento("nequi_token", "Nequi no entregó el token de acceso", 502);
  const seg = Number(j.expires_in) || 600;
  tokens.set(k, { token: j.access_token, tipo: j.token_type || "Bearer", vence: Date.now() + seg * 1000 });
  return (j.token_type || "Bearer") + " " + j.access_token;
}

type Servicio = { ruta: string; canal: string; nombre: string; operacion: string; version: string };

async function llamar(amb: Ambiente, c: NequiCred, s: Servicio, cuerpo: Record<string, unknown>, env: Record<string, string | undefined>, reintentos = 0) {
  const auth = await token(amb, c, env);
  const body = {
    RequestMessage: {
      RequestHeader: {
        Channel: s.canal,
        RequestDate: new Date().toJSON(),
        MessageID: uuid(),
        ClientID: c.client_id,
        Destination: { ServiceName: s.nombre, ServiceOperation: s.operacion, ServiceRegion: "C001", ServiceVersion: s.version },
      },
      RequestBody: { any: cuerpo },
    },
  };
  const r = await pedir(urls(amb, env).api + s.ruta, {
    method: "POST",
    headers: { Authorization: auth, "x-api-key": c.api_key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    reintentos,
  });
  if (r.status === 401) { tokens.delete(amb + ":" + c.client_id); throw new ErrorVento("nequi_credenciales", "Nequi rechazó el acceso (token)", 400); }
  if (r.status === 403) throw new ErrorVento("nequi_api_key", "Nequi rechazó la API Key", 400);
  if (!r.ok) throw new ErrorVento("nequi_http", "Nequi respondió " + r.status, 502);
  const j = await r.json();
  const st = j && j.ResponseMessage && j.ResponseMessage.ResponseHeader && j.ResponseMessage.ResponseHeader.Status || {};
  return { codigo: String(st.StatusCode ?? ""), desc: String(st.StatusDesc ?? ""), any: (j && j.ResponseMessage && j.ResponseMessage.ResponseBody && j.ResponseMessage.ResponseBody.any) || {} };
}

// Cobro push: le llega al cliente una notificación en su app Nequi para aprobar el pago.
export async function cobroPush(amb: Ambiente, c: NequiCred, o: { telefono: string; codigo: string; monto: number; referencia: string; mesa?: string | null }, env: Record<string, string | undefined> = {}) {
  const tel = String(o.telefono).replace(/\D/g, "");
  if (!/^3\d{9}$/.test(tel)) throw new ErrorVento("telefono_invalido", "El celular Nequi debe tener 10 dígitos y empezar por 3", 400);
  const r = await llamar(amb, c, { ruta: RUTAS.push, canal: CANAL.push, nombre: "PaymentsService", operacion: "unregisteredPayment", version: "1.2.0" }, {
    unregisteredPaymentRQ: { phoneNumber: tel, code: o.codigo, value: String(Math.round(o.monto)), reference1: o.referencia, reference2: o.mesa ? "Mesa " + o.mesa : "Vento", reference3: "Vento" },
  }, env);
  if (r.codigo !== "0") throw new ErrorVento("nequi_rechazo", "Nequi: " + (r.desc || "no se pudo enviar el cobro") + " (" + r.codigo + ")", 400);
  const id = r.any.unregisteredPaymentRS && r.any.unregisteredPaymentRS.transactionId;
  if (!id) throw new ErrorVento("nequi_respuesta", "Nequi no devolvió el número de la transacción", 502);
  return { id_externo: String(id).trim() };
}

// QR dinámico para que el cliente lo escanee con Nequi.
export async function cobroQR(amb: Ambiente, c: NequiCred, o: { codigo: string; monto: number; referencia: string; mesa?: string | null }, env: Record<string, string | undefined> = {}) {
  const r = await llamar(amb, c, { ruta: RUTAS.qr, canal: CANAL.qr, nombre: "PaymentsService", operacion: "generateCodeQR", version: "1.2.0" }, {
    generateCodeQRRQ: { code: o.codigo, value: String(Math.round(o.monto)), reference1: o.referencia, reference2: o.mesa ? "Mesa " + o.mesa : "Vento", reference3: "Vento" },
  }, env);
  if (r.codigo !== "0") throw new ErrorVento("nequi_rechazo", "Nequi: " + (r.desc || "no se pudo crear el QR") + " (" + r.codigo + ")", 400);
  const qr = r.any.generateCodeQRRS && r.any.generateCodeQRRS.codeQR;
  if (!qr) throw new ErrorVento("nequi_respuesta", "Nequi no devolvió el código QR", 502);
  return { qr: String(qr), id_externo: String(qr) };
}

// Estado: para el push se consulta con el transactionId y para el QR con el codeQR (los dos van en «codeQR»).
export async function estado(amb: Ambiente, c: NequiCred, codigo: string, env: Record<string, string | undefined> = {}) {
  const r = await llamar(amb, c, { ruta: RUTAS.estado, canal: CANAL.push, nombre: "PaymentsService", operacion: "getStatusPayment", version: "1.0.0" }, {
    getStatusPaymentRQ: { codeQR: codigo },
  }, env, 2);
  if (r.codigo !== "0") return { ok: false, estado: "pendiente", estado_proveedor: "StatusCode " + r.codigo, detalle: r.desc };
  const s = r.any.getStatusPaymentRS || {};
  const pagado = String(s.status) === NEQUI_PAGADO;
  return {
    ok: true,
    estado: pagado ? "aprobado" : "pendiente",
    estado_proveedor: String(s.status ?? ""),
    monto: s.value != null && !isNaN(Number(s.value)) ? Math.round(Number(s.value)) : null,
    pagador: s.name || null,
    id_transaccion: s.trnId || null,
    detalle: null as string | null,
  };
}

// Comprueba las credenciales sin cobrar nada: pide el token y consulta un código que no existe.
// Si la API Key es mala Nequi responde 403; si el token es malo, 401.
export async function verificar(amb: Ambiente, c: NequiCred, env: Record<string, string | undefined> = {}) {
  await token(amb, c, env);
  await llamar(amb, c, { ruta: RUTAS.estado, canal: CANAL.push, nombre: "PaymentsService", operacion: "getStatusPayment", version: "1.0.0" }, {
    getStatusPaymentRQ: { codeQR: "VENTO-VERIFICACION" },
  }, env);
  return true;
}
