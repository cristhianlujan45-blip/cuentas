// Avisos reenviados desde el celular del negocio (método auxiliar, p. ej. MacroDroid):
// «origen | título | texto» de la notificación de la app del banco. Es la misma lectura que hace la app
// (index.html → pgLeer / pgFuente), aquí en el servidor para que quede centralizada.

const APPS: Array<[RegExp, string]> = [[/daviplata/i, "DAVIPLATA"], [/nequi/i, "NEQUI"], [/bancolombia/i, "BANCOLOMBIA"], [/movii/i, "MOVII"], [/\bdale\b/i, "DALE"], [/davivienda/i, "DAVIVIENDA"], [/bre-?b/i, "BRE-B"]];
const SMS = /^(sms|mensajes?|messages?|google messages|mensajes de samsung|samsung messages|mensajes de texto|textra)$/i;

export type Aviso = { monto: number; metodo: string; de: string; confianza: "app" | "revisar" | "falso"; fuente: string };

export function leerAviso(txt: string): Aviso | null {
  const t = String(txt || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const recibido = /(recibiste|te lleg(?:[oó]|aron)|te pas(?:[oó]|aron)|pasaron plata|te envi(?:[oó]|aron)|te transfiri(?:[oó]|eron)|te pag(?:[oó]|aron)|te consign|te abon|consignaron|abonaron|entr[oó] plata|ingres[oó]|recibi[oó]|recepci[oó]n|pago recibido|dinero recibido|transferencia recibida|abono a tu cuenta)/i.test(t);
  const salida = /(enviaste|pagaste|transferiste|retiraste|compraste|sacaste|c[oó]digo|clave din|otp|contrase)/i.test(t);
  if (!recibido || (salida && !/(recibiste|te lleg)/i.test(t))) return null;
  const m = t.match(/\$\s?(\d{1,3}(?:[.,]\d{3})+|\d+)/) || t.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,})\s*(?:pesos|cop)\b/i) || t.match(/\b(?:recibiste|por|de)\s+(\d{1,3}(?:[.,]\d{3})+)\b/i);
  if (!m) return null;
  const monto = Number(m[1].replace(/[.,]/g, ""));
  if (!(monto > 0)) return null;
  const metodo = (APPS.find(([re]) => re.test(t)) || [null, "TRANSFERENCIA"])[1];
  const NOM = "[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ'.]+(?:\\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ'.]+){0,3}";
  let de = (t.match(new RegExp("(" + NOM + ")\\s+te\\s+(?:envi|transfiri|pag|pas|consign|abon)")) || [])[1] ||
    (t.match(new RegExp("\\bde\\s+(" + NOM + ")")) || [])[1] || "";
  if (/^(nequi|daviplata|bancolombia|tu|su|la|el|dinero|plata|recibiste|te)$/i.test(de.split(" ")[0])) de = "";
  de = de.split(" ").map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join(" ");
  const f = fuente(txt);
  return { monto, metodo, de, confianza: f.nivel, fuente: f.txt };
}

// Una notificación de la APP del banco solo la puede mostrar esa app → confiable.
// Un SMS desde un celular común es falso (los bancos escriben desde códigos cortos); desde un código corto: revisar.
export function fuente(txt: string): { nivel: "app" | "revisar" | "falso"; txt: string } {
  const partes = String(txt || "").split("|").map((x) => x.trim());
  const origen = partes[0] || "", t1 = partes[1] || "";
  const esSms = SMS.test(origen) || /^sms$/i.test(t1);
  if (!esSms) {
    if (/nequi|daviplata|bancolombia|davivienda|movii|\bdale\b|bre-?b|banco|\bnu\b|lulo|rappipay|powwi|ual[aá]|bbva|scotiabank|av villas|colpatria|occidente|popular|caja social/i.test(origen)) return { nivel: "app", txt: "Confirmado por la app de " + origen };
    return { nivel: "revisar", txt: "Aviso de «" + (origen || "otra app") + "»: confírmalo en la app del banco" };
  }
  const quien = /^sms$/i.test(t1) ? "" : t1;
  if (quien.replace(/\D/g, "").length >= 7) return { nivel: "falso", txt: "SMS desde un número de celular (" + quien + "): los bancos no escriben desde celulares" };
  return { nivel: "revisar", txt: "Llegó por SMS" + (quien ? " (" + quien + ")" : "") + ": confírmalo en la app del banco antes de entregar" };
}
