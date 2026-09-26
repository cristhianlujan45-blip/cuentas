/* Puente de Vento para YouTube en el TV (Cloudflare Worker, gratis).
   Vento (una página web) no puede hablar directo con el sistema de YouTube que controla la
   app del TV («Vincular con código de TV»): el navegador lo bloquea (CORS). Este puente solo
   reenvía esas llamadas a www.youtube.com/api/lounge/… y le devuelve la respuesta a Vento.
   No guarda nada y no sirve para nada más que para esa dirección.

   Cómo publicarlo: dash.cloudflare.com → Workers & Pages → Create → Create Worker →
   Deploy → Edit code → borra todo, pega este archivo completo → Deploy. */
export default {
  async fetch(req) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-YouTube-LoungeId-Token',
      'Access-Control-Max-Age': '86400'
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const u = new URL(req.url);
    if (req.method !== 'POST' || !u.pathname.startsWith('/api/lounge/')) {
      return new Response('Vento: puente de YouTube TV funcionando ✔', { status: u.pathname === '/' ? 200 : 404, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    const headers = { 'Content-Type': req.headers.get('Content-Type') || 'application/x-www-form-urlencoded' };
    const tok = req.headers.get('X-YouTube-LoungeId-Token');
    if (tok) headers['X-YouTube-LoungeId-Token'] = tok;
    const r = await fetch('https://www.youtube.com' + u.pathname + u.search, { method: 'POST', headers, body: await req.text() });
    return new Response(await r.text(), { status: r.status, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
  }
};
