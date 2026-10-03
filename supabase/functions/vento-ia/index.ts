// Supabase Edge Function «vento-ia»: la IA de Vento YA CONFIGURADA para todos los negocios.
//
// La app (GitHub Pages / APK) no lleva ninguna clave. Cuando un negocio no puso su propia clave de Gemini,
// la app le pide aquí: esta función agrega la clave del PROVEEDOR (secreto GEMINI_API_KEY del servidor, que
// se carga desde GitHub → Settings → Secrets → GEMINI_API_KEY) y reenvía la petición tal cual a Gemini.
//
// Rutas:
//   GET  /vento-ia/salud                                   → { ok, gemini }  (¿hay clave en el servidor?)
//   GET  /vento-ia/v1beta/models?pageSize=…                → lista de modelos
//   GET  /vento-ia/v1beta/models/<modelo>                  → (calentar conexión)
//   POST /vento-ia/v1beta/models/<modelo>:generateContent
//   POST /vento-ia/v1beta/models/<modelo>:streamGenerateContent?alt=sse
// Solo se aceptan pedidos desde la página de Vento (VENTO_ORIGENES), modelos «gemini-…», cuerpos de hasta
// 8 MB (fotos de facturas) y un máximo de pedidos por minuto por IP, para que nadie más gaste la clave.

const GEMINI = "https://generativelanguage.googleapis.com";
const MAX_BYTES = 8 * 1024 * 1024;
const POR_MINUTO = 40;
const visitas = new Map<string, number[]>();

function origenes(): string[] {
  return String(Deno.env.get("VENTO_ORIGENES") || "").split(",").map((s) => s.trim()).filter(Boolean);
}
function cors(origin: string): Record<string, string> {
  const ok = !origenes().length || origenes().includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "*") : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (o: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(o), { status, headers: { ...h, "content-type": "application/json" } });

function demasiados(ip: string): boolean {
  const ahora = Date.now(), l = (visitas.get(ip) || []).filter((t) => ahora - t < 60000);
  l.push(ahora); visitas.set(ip, l);
  if (visitas.size > 5000) visitas.clear();
  return l.length > POR_MINUTO;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const h = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const key = Deno.env.get("GEMINI_API_KEY") || "";
  const u = new URL(req.url);
  const ruta = u.pathname.replace(/^.*?\/vento-ia/, "");
  if (ruta === "/salud" || ruta === "" || ruta === "/") return json({ ok: true, gemini: !!key }, 200, h);
  if (origin && origenes().length && !origenes().includes(origin)) return json({ error: { message: "Origen no permitido." } }, 403, h);
  if (!key) return json({ error: { message: "La IA de Vento todavía no tiene clave en el servidor (secreto GEMINI_API_KEY)." } }, 503, h);
  const m = /^\/v1beta\/models(?:\/(gemini-[\w.-]+)(:generateContent|:streamGenerateContent)?)?$/.exec(ruta);
  if (!m || (req.method === "POST" && !m[2]) || (req.method === "GET" && m[2])) return json({ error: { message: "Ruta no permitida." } }, 404, h);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "?";
  if (demasiados(ip)) return json({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Demasiadas peticiones seguidas. Espera un momento." } }, 429, h);
  let cuerpo: string | undefined;
  if (req.method === "POST") {
    cuerpo = await req.text();
    if (cuerpo.length > MAX_BYTES) return json({ error: { message: "La foto es demasiado grande." } }, 413, h);
  }
  const q = new URLSearchParams();
  for (const [k, v] of u.searchParams) if (k === "alt" || k === "pageSize" || k === "pageToken") q.set(k, v);
  const destino = GEMINI + ruta + (q.toString() ? "?" + q.toString() : "");
  const r = await fetch(destino, {
    method: req.method,
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: cuerpo,
  });
  const out = new Headers(h);
  out.set("content-type", r.headers.get("content-type") || "application/json");
  out.set("cache-control", "no-store");
  return new Response(r.body, { status: r.status, headers: out });
});
