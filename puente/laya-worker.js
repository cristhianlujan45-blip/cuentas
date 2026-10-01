/* Puente seguro entre Vento y Laya IA (Cloudflare Worker, plan gratis).
 *
 * Por qué existe: la app vive en GitHub Pages (solo archivos del navegador). Si la clave de Laya
 * estuviera en index.html, cualquiera podría verla. Este puente guarda la clave como SECRETO del
 * servidor y es lo único que habla con Laya. Además agrega CORS (el servidor de Laya no lo trae)
 * y limita qué se puede pedir.
 *
 * Laya: motor de decisiones de github.com/NandhaKishorM/laya. Formato oficial (POST /v1/systemone):
 *   { "state": {"body": "texto"}, "questions": {"id": {"type": "choice", "instructions": "...",
 *     "criteria": {"opcion": "descripción", ...}}}, "model": "multilingual" }
 * y responde { answers: { id: { choice, probabilities, answer_confidence, ... } }, usage }.
 * El servidor de Laya se monta con su Docker (laya-serve) y pide la clave con LAYA_API_KEY.
 *
 * Variables del Worker (Cloudflare → Workers → tu worker → Settings → Variables):
 *   LAYA_URL         dirección del servidor de Laya, ej. https://laya.midominio.com   (obligatoria)
 *   LAYA_API_KEY     la clave de Laya (agrégala como «Secret», no como texto)         (si tu servidor la pide)
 *   ALLOWED_ORIGINS  orígenes permitidos separados por coma, ej.
 *                    https://cristhianlujan45-blip.github.io                          (recomendado)
 *
 * En Vento: Ajustes → Laya IA → Motor de decisiones Laya → pega la dirección del Worker → «Probar conexión».
 */
const RUTAS = new Set(['/v1/systemone', '/v1/systemone/batch']);
const MAX_BYTES = 32 * 1024;

function cors(origin, env){
  const permitidos = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = !permitidos.length || permitidos.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'content-type': 'application/json' }, h) });

export default {
  async fetch(request, env){
    const origin = request.headers.get('Origin') || '';
    const h = cors(origin, env);
    if(request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const permitidos = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if(permitidos.length && !permitidos.includes(origin)) return json({ error: 'origen no permitido' }, 403, h);
    const url = new URL(request.url);
    if(request.method !== 'POST' || !RUTAS.has(url.pathname)) return json({ error: 'ruta no permitida' }, 404, h);
    if(!env.LAYA_URL) return json({ error: 'falta LAYA_URL en el Worker' }, 500, h);

    const texto = await request.text();
    if(texto.length > MAX_BYTES) return json({ error: 'pedido demasiado grande' }, 413, h);
    let cuerpo;
    try{ cuerpo = JSON.parse(texto); }catch(e){ return json({ error: 'JSON inválido' }, 400, h); }
    // Solo se reenvía lo que Laya entiende (nada de campos extra).
    const limpio = {};
    if(cuerpo.state && typeof cuerpo.state.body === 'string') limpio.state = { body: cuerpo.state.body.slice(0, 2000) };
    if(Array.isArray(cuerpo.states)) limpio.states = cuerpo.states.slice(0, 64).map(s => ({ body: String((s && s.body) || '').slice(0, 2000) }));
    if(!limpio.state && !limpio.states) return json({ error: 'falta state.body' }, 400, h);
    if(!cuerpo.questions || typeof cuerpo.questions !== 'object') return json({ error: 'faltan questions' }, 400, h);
    limpio.questions = {};
    Object.entries(cuerpo.questions).slice(0, 8).forEach(([id, q]) => {
      if(!q || !['choice', 'score', 'noul'].includes(q.type)) return;
      const c = {};
      Object.entries(q.criteria || {}).slice(0, 30).forEach(([k, v]) => { c[String(k).slice(0, 40)] = String(v).slice(0, 200); });
      limpio.questions[String(id).slice(0, 40)] = { type: q.type, instructions: String(q.instructions || '').slice(0, 300), criteria: c };
    });
    if(['english', 'multilingual', 'typed-decisions'].includes(cuerpo.model)) limpio.model = cuerpo.model;

    const cabeceras = { 'content-type': 'application/json' };
    if(env.LAYA_API_KEY) cabeceras.Authorization = 'Bearer ' + env.LAYA_API_KEY;
    try{
      const r = await fetch(String(env.LAYA_URL).replace(/\/+$/, '') + url.pathname, { method: 'POST', headers: cabeceras, body: JSON.stringify(limpio) });
      const out = await r.text();
      return new Response(out, { status: r.status, headers: Object.assign({ 'content-type': 'application/json' }, h) });
    }catch(e){
      return json({ error: 'Laya no respondió' }, 502, h);
    }
  }
};
