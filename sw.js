/* Service worker de Mesora.

   Está aquí por dos razones:
   1) Sin un service worker, el navegador NO ofrece instalar la app: no sale «Instalar» ni se
      crea el acceso directo en la pantalla de inicio. Con él, Mesora se instala como una app
      de verdad (pantalla completa, su propio ícono, y abre aunque no haya internet).
   2) Para que la app abra sin señal: si no hay internet, se usa la última copia guardada.

   MUY IMPORTANTE — por qué NO guarda la página "de primeras":
   Lo normal en un service worker es servir siempre lo guardado (cache-first) porque es más
   rápido. Aquí NO se hace, a propósito: eso fue lo que hacía que la app se quedara pegada en
   una versión vieja y no cargara los cambios. Esta regla manda:

     la página SIEMPRE se pide primero a internet; lo guardado solo se usa si no hay señal.

   Así, cada vez que se abre Mesora con internet, sale la última versión publicada. Lo que sí
   se guarda de primeras son los íconos y las letras (eso no cambia). */

const VER = 'mesora-v1';
const CACHE_PAGINA = VER + '-pagina';     // la app (index.html y demás páginas)
const CACHE_COSAS = VER + '-cosas';       // íconos, letras y librerías: no cambian
const ESPERA_RED = 8000;                  // si internet está muy lento, se usa lo guardado

/* Direcciones que NUNCA se guardan: son cosas del momento (pedidos, canciones, avisos,
   la cuenta en la nube). Guardarlas sería servir información vieja como si fuera de ahora. */
const NUNCA = [
  'ntfy.sh',
  'googleapis.com',
  'google.com',
  'gstatic.com/accounts',
  'youtube.com',
  'graph.facebook.com',
  'workers.dev'
];
const esDeLasQueNoSeGuardan = url => NUNCA.some(d => url.includes(d));

const esPagina = req =>
  req.mode === 'navigate' ||
  (req.destination === 'document') ||
  (req.headers.get('accept') || '').includes('text/html');

self.addEventListener('install', e => {
  // La versión nueva entra de una, sin esperar a que cierren todas las pestañas.
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_COSAS).then(c =>
      c.addAll(['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'manifest.webmanifest']).catch(() => {})
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Se borra lo guardado por versiones anteriores de este archivo.
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k.indexOf(VER) !== 0).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* La app puede pedir que se borre todo lo guardado (botón «Actualizar ahora»). */
self.addEventListener('message', e => {
  const d = e.data || {};
  if(d.tipo === 'limpiar'){
    e.waitUntil((async () => {
      const ks = await caches.keys();
      await Promise.all(ks.map(k => caches.delete(k)));
      if(e.source && e.source.postMessage) e.source.postMessage({ tipo: 'limpio' });
    })());
  }
});

async function deLaRedYGuardar(req, cacheName){
  const red = fetch(req);
  const corte = new Promise((_, no) => setTimeout(() => no(new Error('lento')), ESPERA_RED));
  const r = await Promise.race([red, corte]);
  if(r && r.ok && r.status === 200 && (r.type === 'basic' || r.type === 'cors')){
    const copia = r.clone();
    caches.open(cacheName).then(c => c.put(req, copia)).catch(() => {});
  }
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = req.url;
  if(!url.startsWith('http')) return;
  if(esDeLasQueNoSeGuardan(url)) return;              // va derecho a internet, sin tocar nada

  // ---- La app: SIEMPRE internet primero. Lo guardado es solo el paracaídas. ----
  if(esPagina(req)){
    e.respondWith((async () => {
      try{
        return await deLaRedYGuardar(req, CACHE_PAGINA);
      }catch(err){
        const guardada = await caches.match(req, { ignoreSearch: true });
        if(guardada) return guardada;
        const inicio = await caches.match('index.html', { ignoreSearch: true });
        if(inicio) return inicio;
        return new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>Mesora sin conexión</title>' +
          '<body style="font:16px system-ui;background:#171310;color:#fff;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:20px">' +
          '<div><div style="font-size:48px">📶</div><h1 style="font-size:20px">Sin internet</h1>' +
          '<p style="opacity:.8;max-width:30em">No hay señal y todavía no hay una copia guardada de Mesora en este aparato. ' +
          'Conéctate una vez a internet y vuelve a abrirla: desde ahí ya abre sin señal.</p>' +
          '<button onclick="location.reload()" style="background:#2d7d46;color:#fff;border:0;border-radius:10px;padding:12px 22px;font:700 15px system-ui">Reintentar</button>' +
          '</div></body>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // ---- Íconos, letras y librerías: lo guardado sirve de una, y se refresca por detrás. ----
  e.respondWith((async () => {
    const guardado = await caches.match(req);
    if(guardado){
      e.waitUntil(deLaRedYGuardar(req, CACHE_COSAS).catch(() => {}));
      return guardado;
    }
    try{
      return await deLaRedYGuardar(req, CACHE_COSAS);
    }catch(err){
      return new Response('', { status: 504, statusText: 'Sin conexión' });
    }
  })());
});
