// De punta a punta, como en el negocio (app de Android, SIN canal en vivo): se conecta el TV (tocándolo en la lista),
// un cliente pide una canción por el QR, Vento la recibe, le busca el video y la manda al TV. Y otra más, y otra.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const mock = require('./ntfymock.js')();
(async () => {
  const b = await chromium.launch(); let ok = 0, mal = 0; const chk = (n, c, x) => { if(c){ ok++; console.log('✅ ' + n); } else { mal++; console.log('❌ ' + n + (x ? ' → ' + x : '')); } };
  const tv = { pareados: new Set(), cmds: [], binds: 0, cola: ['vOTROCEL01'], abrir: 0 };
  const resp = (ruta, query, cuerpo) => {
    const qs = new URLSearchParams(query), f = new URLSearchParams(cuerpo);
    if(/pairing\/get_screen/.test(ruta)){ if(!tv.pareados.has(f.get('pairing_code'))) return { st: 404, b: 'no' }; return { st: 200, b: JSON.stringify({ screen: { screenId: 'scr-lg', loungeToken: 'tok-lg', name: 'YouTube on TV', expiration: Date.now() + 864e5 } }) }; }
    if(/get_lounge_token_batch/.test(ruta)) return { st: 200, b: JSON.stringify({ screens: [{ screenId: 'scr-lg', loungeToken: 'tok-lg', expiration: Date.now() + 864e5 }] }) };
    if(!qs.get('SID')){ tv.binds++; const np = tv.cola.length ? { videoId: tv.cola[0], state: '1', currentTime: '5', duration: '200' } : {}; return { st: 200, b: JSON.stringify([[0, ['c', 'SID' + tv.binds, '', 8]], [1, ['S', 'gs']], [2, ['nowPlaying', np]]]) }; }
    const sc = f.get('req0__sc'), v = f.get('req0_videoId'); tv.cmds.push(sc + ':' + (v || ''));
    if(sc === 'setPlaylist') tv.cola = [v]; if(sc === 'addVideo') tv.cola.push(v);
    return { st: 200, b: '[]' };
  };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; wv) Chrome/129.0 Mobile VentoAndroid/1.0.13' });
  await ctx.route('**/*', async r => { if(await mock.handler(r)) return; const u = new URL(r.request().url());
    if(u.hostname === 'localhost') return r.continue();
    if(u.hostname === 'www.googleapis.com'){ const q = u.searchParams.get('q') || ''; if(/search/.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: { videoId: 'v_' + q.replace(/\W+/g, '').slice(0, 8) }, snippet: { title: q, channelTitle: 'Art' } }] }) });
      const ids = (u.searchParams.get('id') || '').split(','); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: ids.map(id => ({ id, status: { embeddable: true, privacyStatus: 'public', uploadStatus: 'processed' }, contentDetails: { duration: 'PT3M' }, snippet: { title: id } })) }) }); }
    return r.abort(); });
  await ctx.exposeFunction('__lounge', (ruta, query, cuerpo) => resp(ruta, query, cuerpo));
  await ctx.exposeFunction('__abrio', (url, codigo) => { tv.abrir++; return 201; });   // YouTube ya abierto con otro celular: ignora el código nuevo
  await ctx.addInitScript(() => {
    window.VentoAndroid = { info: () => '{}', vozIniciar(){}, vozParar(){}, vozCancelar(){}, hablar(){}, callar(){}, guardarArchivo(){}, fondo: () => true, fondoActivar(){}, ajustesBateria(){}, notificar(){ return true; }, avisosEstado: () => '{"prendidos":true}',
      buscarTVs: () => { setTimeout(() => window.__ventoTV({ id: 'uuid:lg::dial', nombre: '[LG] webOS TV', fabricante: 'LG Electronics', ip: '192.168.1.40', tipo: 'lg', appUrl: 'http://192.168.1.40:36866/apps/', youtube: true, screenId: 'scr-lg' }), 150); setTimeout(() => window.__ventoTVfin(1, {}), 400); },
      abrirYouTube: (id, appUrl, codigo) => { window.__abrio(appUrl, codigo).then(st => setTimeout(() => window.__ventoCb(id, { status: st }), 80)); },
      lounge: (id, ruta, query, cuerpo) => { window.__lounge(ruta, query, cuerpo).then(x => window.__ventoCb(id, { status: x.st, text: x.b })); },
      escucharTV: id => { window.__escuchas = (window.__escuchas || 0) + 1; }, pararTV(){} };
    if(!sessionStorage.getItem('ini')){ sessionStorage.setItem('ini', 1); localStorage.setItem('cm-tutorial-seen', '1'); localStorage.setItem('vito_tvfix1', '1'); }
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(2500);
  await p.fill('#authBiz', 'Bar'); await p.fill('#authUser', 'ana'); await p.fill('#authPass', 'clave123'); await p.click('#authBtn'); await p.waitForTimeout(1500);
  await p.click('#onbSaltar').catch(() => {});
  const topic = await p.evaluate(() => { document.querySelectorAll('.overlay.show').forEach(o => o.classList.remove('show')); document.getElementById('avBarra')?.remove(); for(let i = 1; i <= 4; i++) data.tables[i] = data.tables[i] || { items: [], people: [] }; saveData(); document.querySelector('nav button[data-view="musica"]')?.click(); return vitoMod.qCfg().topic; });
  await p.waitForTimeout(500);
  await p.click('#tvTransmitir'); await p.waitForTimeout(1000);
  await p.evaluate(() => [...document.querySelectorAll('#tvApkLista > button')].find(x => /webOS/.test(x.innerText)).click());
  await p.waitForTimeout(9000);
  chk('TV con YouTube abierto y OTRO celular conectado: Vento se conecta igual', await p.evaluate(() => !!lng.sid && lngOn()) && tv.binds >= 1, await p.evaluate(() => lng.error));
  chk('Sin volver a abrir YouTube en el TV (no interrumpe al otro)', tv.abrir === 0, String(tv.abrir));
  chk('No se usa el canal en vivo (sistema de la 1.22)', !(await p.evaluate(() => window.__escuchas || 0)));
  // Clientes piden canciones por el QR
  const pedir = async (mesa, s, id) => { mock.msgs.push({ id: 'n' + id, time: Math.floor(Date.now() / 1000), event: 'message', topic, message: JSON.stringify({ t: 'cancion', mesa, s, id }) }); await p.evaluate(() => window.dispatchEvent(new Event('online'))); };
  await pedir(1, 'Vivir mi vida Marc Anthony', 'r1'); await p.waitForTimeout(9000);
  chk('La canción del QR llegó a Vento', await p.evaluate(() => window.vitoMusica.cola().concat(window.vitoMusica.hist()).some(x => /Vivir mi vida/i.test(x.song))));
  chk('Y llegó al TV', tv.cola.some(v => /Vivirmi/.test(v)), JSON.stringify(tv.cmds));
  await pedir(2, 'Depende Jarabe de Palo', 'r2'); await p.waitForTimeout(9000);
  chk('La segunda entra al TV detrás (addVideo, sin cortar)', tv.cmds.some(c => /^addVideo:v_Depende/i.test(c)), JSON.stringify(tv.cmds));
  await pedir(3, 'Sin poderte hablar Willie Colon', 'r3'); await p.waitForTimeout(9000);
  chk('La tercera también', tv.cola.length === 4, JSON.stringify(tv.cola));
  // 40 s más: la conexión no se cae ni se reabre en ciclo
  const b1 = tv.binds; await p.waitForTimeout(40000);
  chk('En 40 s no entra en ciclo de reconexión (saludos normales cada ~12 s)', tv.binds - b1 <= 5, (tv.binds - b1) + ' saludos');
  chk('Sigue conectado', await p.evaluate(() => !!lng.sid && lngOn()));
  chk('No cortó el video del otro celular (las de las mesas entran en cola detrás)', tv.cola[0] === 'vOTROCEL01' && !tv.cmds.some(c => /^setPlaylist/.test(c)), JSON.stringify(tv.cmds));
  chk('Sin errores de página', !errs.length, errs.join(' | '));
  console.log('RESULTADO', ok, 'bien', mal, 'mal'); await b.close(); process.exit(mal ? 1 : 0);
})();
