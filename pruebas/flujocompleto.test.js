// Flujo COMPLETO de suscripción, de punta a punta, contra el «Supabase local» REAL: PostgreSQL 16 + la Edge Function
// vento-suscripciones de verdad + supabase-js de verdad (pruebas/servidor/supabase-local.js). Nada del servidor se
// simula: cada paso pasa por /estado, /pago, /admin/* y la base de datos. Solo se simula el micrófono (se anota si se
// abrió) y el administrador de Vento usa las mismas rutas que admin.html (/admin/pagos, /admin/aprobar, /admin/rechazar).
//  1. Celular A: el dueño crea su negocio en el celular, su cuenta de Vento Nube (Ajustes → Nube) y sube el negocio
//     (billing_config.trial_days = 0: sin prueba gratis; números de Nequi y DaviPlata configurados).
//  2. Plan Gratis: vende (mesa → producto → cobrar) y el micrófono abre «Función PRO».
//  3. Planes → PRO (precio del servidor) → NEQUI → instrucciones → YA PAGUÉ → comprobante (PNG real) → «Pago en revisión»
//     (en la base: pago 'review', comprobante en Storage, suscripción 'payment_review'; PRO sigue bloqueado).
//  4. La respuesta se pierde, la persona reintenta y toca varias veces ENVIAR: UN solo pago (misma llave idem).
//  5. El admin aprueba → «Plan PRO activo · vence el dd/mm/aaaa» (hoy + 1 mes, hora de Colombia) y el micrófono abre.
//  6. Celular B (sin nada guardado) entra con la misma cuenta, elige el negocio y recupera PRO sin pagar.
//     Un cajero invitado no ve precios ni pagos (y el servidor no lo deja pagar).
//  7. Otro negocio en plan Gratis con un token de OTRO negocio y flags «pro» en localStorage: sigue Gratis.
//  8. Vencimiento (expiry_date en el pasado) → Gratis, bloquea PRO y SIGUE vendiendo.
//  9. Renovar vencido (empieza hoy) y renovar con 3 días por delante (el mes se suma al vencimiento anterior).
// 10. Renovación rechazada con motivo (el plan sigue activo) → la app muestra el motivo y «Enviar otro comprobante».
// 11. Comprobante que no es imagen → mensaje claro y ningún pago creado.
// 12. Sin errores de página en ningún celular.
// Sin PostgreSQL en el equipo se omite (como «servidor» y «adminsubreal»). VENTO_CAPTURAS=<carpeta> guarda pantallazos;
// VENTO_DEBUG=1 muestra la pila de los primeros errores de página.
'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

function hayPostgres(){
  if(process.env.VENTO_PG_URL) return true;
  if(fs.existsSync('/usr/lib/postgresql')) return true;
  return spawnSync('bash', ['-c', 'command -v psql || command -v pg_ctl'], { stdio: 'ignore' }).status === 0;
}
// Los registros JSON del servidor ({"t":…}) se ocultan para que se lea el resultado (VENTO_LOGS=1 los muestra).
if(!process.env.VENTO_LOGS) for(const k of ['log', 'warn', 'error']){
  const orig = console[k].bind(console);
  console[k] = (...a) => { if(typeof a[0] === 'string' && a[0].startsWith('{"t":"')) return; orig(...a); };
}

// PNG de verdad (degradado de un color): cada color da otra foto y otra huella del comprobante.
function png(w, h, rgb){
  const T = Array.from({ length: 256 }, (_, n) => { let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for(const x of buf) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const trozo = (tipo, datos) => { const t = Buffer.from(tipo), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(datos.length); c.writeUInt32BE(crc(Buffer.concat([t, datos]))); return Buffer.concat([l, t, datos, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for(let y = 0; y < h; y++){ const o = y * (w * 3 + 1); for(let x = 0; x < w; x++){ const i = o + 1 + x * 3; raw[i] = (rgb[0] + x) & 255; raw[i + 1] = (rgb[1] + y) & 255; raw[i + 2] = rgb[2]; } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ihdr), trozo('IDAT', zlib.deflateSync(raw)), trozo('IEND', Buffer.alloc(0))]);
}
const H = 3600e3;
const dos = n => String(n).padStart(2, '0');
// dd/mm/aaaa en hora de Colombia (UTC−5 todo el año), como las muestra la app
const fCo = t => { const d = new Date(new Date(t).getTime() - 5 * H); return dos(d.getUTCDate()) + '/' + dos(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); };
// + n meses en hora de Colombia, como PostgreSQL (31/01 → 28/02): 06/10/2026 → 06/11/2026
function masMeses(t, n){
  const d = new Date(new Date(t).getTime() - 5 * H);
  const m = d.getUTCMonth() + n, y = d.getUTCFullYear() + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  const dia = Math.min(d.getUTCDate(), new Date(Date.UTC(y, mm + 1, 0)).getUTCDate());
  return Date.UTC(y, mm, dia, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()) + 5 * H;
}
// La fecha que la app pone por defecto en el comprobante (día de este equipo)
const hoyLocal = () => { const d = new Date(); return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()); };
const b64u = s => Buffer.from(s).toString('base64url');

(async () => {
  if(!hayPostgres()){ console.log('RESULTADO 0 bien 0 mal (este equipo no tiene PostgreSQL: se omitió esta prueba)'); process.exit(0); }
  const { iniciar, enrutar } = require('./servidor/supabase-local');
  const BASE = process.env.VENTO_BASE || 'http://localhost:8765';
  const CAP = process.env.VENTO_CAPTURAS || '';
  let ok = 0, mal = 0;
  const errs = [];
  const chk = (n, c, x) => { if(c){ ok++; console.log('✅ ' + n); } else { mal++; console.log('❌ ' + n + (x !== undefined ? ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500) : '')); } };
  const sb = await iniciar();
  const b = await chromium.launch();
  try{ await pruebas(); }
  catch(e){ mal++; console.log('❌ La prueba se cayó: ' + (e && e.stack || e)); }
  chk('12. Sin errores de página en ningún celular', !errs.length, errs.join(' | '));
  await b.close().catch(() => {}); await sb.cerrar().catch(() => {});
  console.log('RESULTADO', ok, 'bien', mal, 'mal'); process.exit(mal ? 1 : 0);

  async function pruebas(){
    const F = sb.url + '/functions/v1/vento-suscripciones';
    const api = async (ruta, cuerpo, tok) => {
      const r = await fetch(F + ruta, { method: 'POST', headers: { apikey: sb.anonKey, 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(cuerpo || {}) });
      return { st: r.status, j: await r.json().catch(() => ({})) };
    };
    const uno = async (q, p) => (await sb.sql(q, p))[0];
    const fotos = neg => [...sb.objetos.keys()].filter(k => k.startsWith('comprobantes/' + neg + '/'));

    // ---------- Configuración del cobro (lo que el proveedor pone en Vento Admin → Configuración / Planes) ----------
    const NEQUI = { numero: '3001234567', titular: 'Vento Pruebas SAS' }, DAVI = { numero: '3109876543', titular: 'Vento Pruebas SAS' };
    await sb.sql('update billing_config set trial_days = 0, manual_methods = $1 where id = 1', [JSON.stringify({ NEQUI, DAVIPLATA: DAVI })]);
    const PRECIO = 62900;   // distinto del precio sembrado (59.900): así se ve que la app usa el precio del SERVIDOR
    await sb.sql("update plans set price = $1 where id = 'pro'", [PRECIO]);
    const PRECIO_TXT = '$62.900';
    const jefe = await sb.usuario('jefe@vento.co');
    await sb.sql('insert into platform_admins(user_id, email) values ($1, $2)', [jefe.id, jefe.email]);

    // ---------- Ayudantes del navegador ----------
    async function celular(nombre){
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
      // Nada de internet: solo este equipo (la página y el arnés). enrutar() va después para que mande sobre esta regla.
      await ctx.route('**/*', rt => { const u = new URL(rt.request().url()); return (u.hostname === 'localhost' || u.hostname === '127.0.0.1') ? rt.continue() : rt.abort(); });
      await enrutar(ctx, sb);
      const p = await ctx.newPage();
      const cel = { nombre, ctx, p, respuestas: [], pedidos: [] };
      p.on('pageerror', e => { errs.push(nombre + ': ' + e.message); if(process.env.VENTO_DEBUG && errs.length < 3) console.log('PAGEERROR', nombre, e.stack); });
      p.on('dialog', d => d.accept(d.type() === 'prompt' ? (cel.respuestas.shift() || d.defaultValue()) : undefined));
      p.on('request', r => { const m = /\/functions\/v1\/vento-suscripciones\/([\w/-]+)/.exec(r.url()); if(m && r.method() !== 'OPTIONS') cel.pedidos.push(m[1]); });
      await p.goto(BASE + '/index.html');
      await p.waitForSelector('#authOverlay:not([hidden])', { timeout: 15000 });
      await p.waitForFunction(() => window.ventoNube && window.ventoSuscripcion, null, { timeout: 15000 });
      return cel;
    }
    const esperar = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 10000 }).then(() => true, () => false);
    const captura = async (p, nombre) => { if(CAP){ fs.mkdirSync(CAP, { recursive: true }); await p.screenshot({ path: path.join(CAP, nombre + '.png') }); } };
    const pantalla = p => p.evaluate(() => { const o = document.getElementById('vsOv'); return o && o.classList.contains('show') ? o.dataset.pantalla : ''; });
    const textoOv = p => p.evaluate(() => { const o = document.getElementById('vsOv'); return o && o.classList.contains('show') ? o.innerText : ''; });
    const barra = p => p.evaluate(() => { const x = document.getElementById('subBar'); return x && !x.hidden ? x.innerText : ''; });
    const est = p => p.evaluate(() => { const s = ventoSuscripcion.estado(); return { v: s.verificado, plan: s.plan, status: s.status, voz: ventoSuscripcion.tiene('voice'), pos: ventoSuscripcion.tiene('pos_basic'), k: ventoPlan().k, rol: s.rol, manda: s.manda, vence: s.vence, renovar: s.renovar, rechazo: s.rechazo, pago: !!s.pago }; });
    const refrescar = p => p.evaluate(() => ventoSuscripcion.refrescar(true).then(() => true));
    // Ventanas que quedan abiertas entre un paso y otro (lo que haría la persona: cerrarlas).
    const cerrarTodo = p => p.evaluate(() => document.querySelectorAll('.overlay.show').forEach(o => o.classList.remove('show')));
    async function irAjustes(p, cat){
      await cerrarTodo(p);
      await p.click('#navMoreBtn'); await p.click('.more-tile[data-go="ajustes"]');
      if(await p.isVisible('#ajustesBackBtn')) await p.click('#ajustesBackBtn');
      await p.click('.ajustes-cat[data-cat="' + cat + '"]');
    }
    async function abrirNubeAjustes(p){
      await irAjustes(p, 'nube'); await p.click('#nubeAbrirAj');
      await p.waitForSelector('#nubeOv.show #nubeCuerpo');
    }
    // La pantalla de entrada → «☁️ Entrar con Vento Nube»
    async function nubeDesdeEntrada(p){ await p.click('#authNube'); await p.waitForSelector('#nubeOv.show #nubeEmail'); }
    async function crearCuenta(p, email, nombre){
      await p.fill('#nubeEmail', email); await p.fill('#nubePass', 'clave123'); await p.fill('#nubeNombre', nombre);
      await p.click('#nubeCrear'); await p.waitForSelector('#nubeSubirEste', { state: 'visible' });
    }
    async function subirNegocio(cel, nombre){
      cel.respuestas.push(nombre);                                    // prompt «Nombre del negocio en la nube»
      await cel.p.click('#nubeSubirEste');
      return esperar(cel.p, n => { const x = window.ventoNube.negocio(); return !!x && x.nombre === n && /ya está en la nube/.test(document.getElementById('nubeMsg').textContent); }, nombre);
    }
    const negocioId = p => p.evaluate(() => (window.ventoNube.negocio() || {}).id);
    // El micrófono: se toca el botón de verdad; abrir el reconocedor de voz se simula (se anota que se abrió).
    async function microfono(p){
      await cerrarTodo(p);
      await p.evaluate(() => { window.__mic = 0; window.startVoiceCommand = () => { window.__mic++; }; });
      await p.click('#voiceFab'); await p.waitForTimeout(250);
      return p.evaluate(() => { const o = document.getElementById('vsOv'), v = !!(o && o.classList.contains('show')); return { abrio: window.__mic > 0, pro: v && o.dataset.pantalla === 'pro', texto: v ? o.innerText : '' }; });
    }
    // Vender: Mesas → mesa 1 → buscar el producto → elegirlo → +2 → Agregar → Cobrar todo → efectivo.
    async function vender(p, buscar){
      await cerrarTodo(p);
      await p.click('nav button[data-view="mesas"]');
      const h0 = await p.evaluate(() => data.history.length);
      await p.click('#tableGrid .ticket >> nth=0');
      await p.click('#addProductSearch'); await p.fill('#addProductSearch', buscar);
      await p.click('#addProductSuggestions .product-suggestion-item >> nth=0');
      await p.click('#qtyPlusBtn'); await p.click('#qtyPlusBtn'); await p.click('#addItemBtn');
      const enMesa = await p.evaluate(() => (data.tables[1].items || []).reduce((s, i) => s + (i.qty || 0), 0));
      await p.click('#chargeBtn');
      if(await p.waitForSelector('button[data-v="0"]', { timeout: 600 }).then(() => true, () => false)) await p.click('button[data-v="0"]');   // propina (si está activada)
      await p.click('button[data-m="efectivo"]');
      const cobro = await esperar(p, h => data.history.length > h, h0, 6000);
      return Object.assign({ enMesa, cobro }, await p.evaluate(() => ({ h: data.history.length, total: (data.history[0] || {}).total, debe: (data.history[0] || {}).debt, libre: !(data.tables[1].items || []).length })));
    }
    // ENVÍA TU COMPROBANTE: foto de la galería + datos.
    async function llenarComprobante(p, foto, ref, nombre, tel){
      await p.setInputFiles('#vsFileGal', foto);
      const prev = await esperar(p, () => { const i = document.getElementById('vsPrev'); return i && !i.hidden && /^data:image\/jpeg/.test(i.src); });
      if(nombre) await p.fill('#vsNombre', nombre);
      if(tel) await p.fill('#vsTel', tel);
      await p.fill('#vsRef', ref);
      return prev;
    }
    const enRevision = p => esperar(p, () => { const o = document.getElementById('vsOv'); return o.classList.contains('show') && o.dataset.pantalla === 'revision' && /Pago en revisión/.test(o.innerText); }, null, 15000);
    const pagosDe = async neg => (await sb.sql('select * from payment_records where business_id = $1 order by created_at', [neg]));

    // =====================================================================
    // 1. Celular A: el dueño crea su negocio, su cuenta de Vento Nube y lo sube a la nube
    // =====================================================================
    const A = await celular('celular A'), pA = A.p;
    await pA.fill('#authBiz', 'Bar Real'); await pA.fill('#authUser', 'ana'); await pA.fill('#authPass', 'clave123');
    await pA.click('#authTypePick .tp-btn'); await pA.fill('#tipoSheet .tp-q', 'bar');
    await pA.click('#tipoSheet .tp-it:has-text("Bar / Cervecería")');
    await pA.click('#authBtn');
    await pA.waitForSelector('#authOverlay', { state: 'hidden' });
    await pA.click('#onbSaltar', { timeout: 4000 }).catch(() => {});   // asistente de bienvenida: «Ahora no»
    await abrirNubeAjustes(pA);
    await crearCuenta(pA, 'ana@barreal.co', 'Ana');
    chk('1. Celular A: cuenta de Vento Nube creada desde Ajustes → Nube (con sesión)', /Conectado como ana@barreal\.co/.test(await pA.textContent('#nubeCuerpo')));
    chk('1. «Subir el negocio de este celular a la nube» crea el negocio en el servidor', await subirNegocio(A, 'Bar Real'), await pA.textContent('#nubeMsg'));
    const NEG = await negocioId(pA);
    await pA.click('#nubeOv [data-n="cerrar"]');
    const ana = await uno("select id from auth.users where email = 'ana@barreal.co'");
    const neg = await uno('select n.nombre, n.creado_por, m.rol from negocios n join miembros m on m.negocio_id = n.id where n.id = $1', [NEG]);
    chk('1. En la base: negocio «Bar Real» con Ana de dueña', neg && neg.nombre === 'Bar Real' && neg.creado_por === ana.id && neg.rol === 'dueno', neg);
    chk('1. La app recibe el estado del servidor con la firma verificada', await esperar(pA, () => ventoSuscripcion.verificado(), null, 15000), A.pedidos.join());
    let e = await est(pA);
    chk('1. Sin prueba gratis (trial_days = 0): plan Gratis', e.plan === 'free' && e.k === 'gratis' && e.pos && !e.voz && e.rol === 'dueno' && e.manda, e);
    chk('1. En la base: ninguna suscripción creada para el negocio', Number((await uno('select count(*) n from subscriptions where business_id = $1', [NEG])).n) === 0);

    // =====================================================================
    // 2. Plan Gratis: vender funciona; el micrófono es PRO
    // =====================================================================
    let v = await vender(pA, 'Aguila');
    chk('2. Gratis: agregar a la mesa y cobrar en efectivo (queda en el historial y la mesa libre)', v.enMesa === 2 && v.cobro && v.total > 0 && v.debe === 0 && v.libre, v);
    let mic = await microfono(pA);
    chk('2. Gratis: el micrófono NO se abre y sale «Función PRO» con [Ver planes]', !mic.abrio && mic.pro && /Función PRO/.test(mic.texto) && /Ver planes/.test(mic.texto), mic);
    await captura(pA, '2-funcion-pro');

    // =====================================================================
    // 3. Planes → PRO → NEQUI → instrucciones → YA PAGUÉ → ENVÍA TU COMPROBANTE
    // =====================================================================
    await pA.click('#vsOv [data-vs="planes"]');
    chk('3. PLANES: FREE y PRO con el precio del servidor (' + PRECIO_TXT + ')', await esperar(pA, t => { const o = document.getElementById('vsOv'); return o.dataset.pantalla === 'inicio' && o.innerText.includes(t) && document.querySelectorAll('#vsOv .vs-plan').length === 2; }, PRECIO_TXT) && /FREE/.test(await textoOv(pA)), await textoOv(pA));
    await captura(pA, '3-planes');
    await pA.click('#vsOv [data-pagar="pro"]');
    chk('3. MÉTODO: botones NEQUI y DAVIPLATA', await pantalla(pA) === 'metodo' && await pA.isVisible('#vsOv [data-metodo="NEQUI"]') && await pA.isVisible('#vsOv [data-metodo="DAVIPLATA"]'));
    await pA.click('#vsOv [data-metodo="NEQUI"]');
    let t = await textoOv(pA);
    chk('3. INSTRUCCIONES: valor, número y titular configurados en el servidor', await pantalla(pA) === 'instrucciones' && t.includes(PRECIO_TXT) && t.includes('300 123 4567') && t.includes(NEQUI.titular), t);
    await captura(pA, '3-instrucciones');
    await pA.click('#vsYaPague');
    const campos = await pA.evaluate(() => ({ tit: document.getElementById('vsTit').textContent, neg: vsNegocio.value, plan: vsPlan.value, met: vsMetodo.value, monto: vsMonto.value, fecha: vsFecha.value }));
    chk('3. «ENVÍA TU COMPROBANTE» con negocio, plan, método, valor y fecha ya llenos', campos.tit === 'ENVÍA TU COMPROBANTE' && campos.neg === 'Bar Real' && campos.plan === 'PRO' && campos.met === 'NEQUI' && campos.monto === String(PRECIO) && campos.fecha === hoyLocal(), campos);
    chk('3. Foto del comprobante (PNG real desde la galería) con vista previa', await llenarComprobante(pA, { name: 'comprobante-nequi.png', mimeType: 'image/png', buffer: png(900, 600, [218, 0, 129]) }, 'M-PRO-0001', 'Ana Dueña', '300 555 1234'));
    await captura(pA, '3-comprobante');

    // =====================================================================
    // 4. La respuesta del primer envío se pierde (el servidor SÍ lo recibió); luego reintento con toques repetidos
    // =====================================================================
    let perdida = null;
    await pA.route(/\/functions\/v1\/vento-suscripciones\/pago$/, async rt => {
      const rq = rt.request();
      if(rq.method() !== 'POST' || perdida) return rt.fallback();
      const h = { ...rq.headers() }; delete h.host; h.apikey = sb.anonKey;
      const r = await fetch(sb.url + new URL(rq.url()).pathname, { method: 'POST', headers: h, body: rq.postDataBuffer() });
      perdida = { st: r.status, j: await r.json().catch(() => null), idem: JSON.parse(rq.postData()).idem };
      await rt.abort('connectionreset');                              // la respuesta nunca llega al celular
    });
    await pA.click('#vsEnviar');
    chk('4. Sin respuesta del servidor: la app avisa y deja reintentar', await esperar(pA, () => /Sin conexión/.test(document.getElementById('vsMsg').textContent) && !document.getElementById('vsEnviar').disabled), await pA.textContent('#vsMsg'));
    chk('4. …aunque el servidor sí lo recibió (1 pago en revisión)', perdida && perdida.st === 200 && (await pagosDe(NEG)).length === 1, perdida && perdida.st);
    const pagosAntes = A.pedidos.filter(x => x === 'pago').length;
    await pA.evaluate(() => { const x = document.getElementById('vsEnviar'); x.click(); x.click(); x.click(); });   // toques repetidos
    chk('3. «⏳ Pago en revisión» después de enviar', await enRevision(pA), await textoOv(pA));
    t = await textoOv(pA);
    chk('4. Reintento con la MISMA llave: el servidor devuelve el pago que ya tenía («no quedó repetido»)', /no quedó repetido/.test(t), t);
    chk('4. Tres toques en ENVIAR = UNA sola petición', A.pedidos.filter(x => x === 'pago').length - pagosAntes === 1, A.pedidos.join());
    await pA.unroute(/\/functions\/v1\/vento-suscripciones\/pago$/);
    let pagos = await pagosDe(NEG);
    const P1 = pagos[0] || {};
    chk('4. En la base: UN solo pago (misma idem del primer envío)', pagos.length === 1 && P1.idempotency_key === perdida.idem && /^vs-/.test(P1.idempotency_key), pagos.map(x => x.id + ':' + x.idempotency_key));
    chk('3. En la base: pago en «review» con plan, método, valor, referencia, pagador y fecha', P1.status === 'review' && P1.plan_id === 'pro' && P1.method === 'NEQUI' && Number(P1.amount) === PRECIO && P1.reference === 'M-PRO-0001' &&
      P1.payer_name === 'Ana Dueña' && P1.payer_phone === '3005551234' && P1.kind === 'new' && P1.paid_at === hoyLocal() && P1.user_id === ana.id, P1);
    const prueba1 = await uno('select * from payment_proofs where payment_id = $1', [P1.id]);
    const foto1 = sb.objetos.get('comprobantes/' + (prueba1 && prueba1.storage_path));
    chk('3. Comprobante en Storage (bucket privado «comprobantes»): JPEG comprimido por la app, con su huella', !!prueba1 && prueba1.storage_path === NEG + '/' + P1.id + '.jpg' && prueba1.mime === 'image/jpeg' && !!foto1 &&
      foto1.bytes[0] === 0xff && foto1.bytes[1] === 0xd8 && crypto.createHash('sha256').update(foto1.bytes).digest('hex') === prueba1.sha256 && prueba1.sha256 === P1.proof_hash, prueba1);
    chk('4. En Storage: una sola foto (la del reenvío se borró)', fotos(NEG).length === 1, fotos(NEG));
    let sub = await uno('select * from subscriptions where business_id = $1', [NEG]);
    chk('3. En la base: suscripción en «payment_review» (sin PRO)', sub && sub.status === 'payment_review' && sub.plan_id === 'pro' && sub.source === 'manual', sub);
    await refrescar(pA);
    e = await est(pA);
    chk('3. Pago en revisión NO activa PRO', e.status === 'payment_review' && e.plan === 'free' && !e.voz && e.k === 'revision' && e.pago, e);
    await pA.click('#vsOv [data-vs="cerrar"]');
    mic = await microfono(pA);
    chk('3. En revisión: el micrófono sigue bloqueado («Función PRO»)', !mic.abrio && mic.pro, mic);
    await pA.click('#vsOv [data-vs="planes"]');
    t = await textoOv(pA);
    chk('4. Con un pago en revisión no se ofrece pagar otra vez', /Pago en revisión/.test(t) && /Ya tienes un pago en revisión/.test(t) && !(await pA.$('#vsOv [data-pagar]')), t);
    // Otro envío por fuera de la pantalla (otra llave, otra foto): el servidor tampoco crea un segundo pago.
    const otro = await pA.evaluate(async b64 => {
      const c = await ventoNube.cliente(), s = (await c.auth.getSession()).data.session, cfg = ventoNube.config();
      const r = await fetch(cfg.url + '/functions/v1/vento-suscripciones/pago', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.key, Authorization: 'Bearer ' + s.access_token },
        body: JSON.stringify({ negocio: ventoNube.negocio().id, plan: 'pro', metodo: 'DAVIPLATA', monto: 62900, referencia: 'D-OTRA-9', fecha: '', nombre: 'Ana', telefono: '3005551234', idem: 'otra-llave-1', comprobante: { base64: b64, tipo: 'image/png' } }) });
      return { st: r.status, j: await r.json() };
    }, png(300, 200, [10, 200, 30]).toString('base64'));
    chk('4. Otro pago con otra llave mientras hay uno en revisión → 409 «pago_en_revision», sin pago ni foto nuevos', otro.st === 409 && otro.j.error === 'pago_en_revision' && (await pagosDe(NEG)).length === 1 && fotos(NEG).length === 1, otro);
    await captura(pA, '4-revision');

    // =====================================================================
    // 5. El administrador de Vento aprueba (POST /admin/aprobar, como admin.html)
    // =====================================================================
    let r = await api('/admin/pagos', { status: 'review' }, jefe.token);
    const enLista = (r.j.pagos || []).find(x => x.id === P1.id);
    chk('5. Admin: el pago aparece pendiente con negocio, usuario y comprobante', r.st === 200 && !!enLista && enLista.negocio === 'Bar Real' && enLista.usuario_email === 'ana@barreal.co' && enLista.comprobante === true, r.j);
    r = await api('/admin/aprobar', { payment: P1.id }, jefe.token);
    chk('5. Admin: aprobado', r.st === 200 && r.j.payment && r.j.payment.status === 'approved' && r.j.subscription && r.j.subscription.status === 'active', r.j);
    sub = await uno('select status, plan_id, source, start_date, expiry_date from subscriptions where business_id = $1', [NEG]);
    const VENCE1 = fCo(masMeses(Date.now(), 1));
    chk('5. En la base: suscripción activa, PRO, manual, desde hoy y vence hoy + 1 mes (' + VENCE1 + ')', sub.status === 'active' && sub.plan_id === 'pro' && sub.source === 'manual' && Date.now() - Date.parse(sub.start_date) < 5 * 60e3 &&
      fCo(sub.start_date) === fCo(Date.now()) && fCo(sub.expiry_date) === VENCE1 && Date.parse(sub.expiry_date) === masMeses(sub.start_date, 1), sub);
    // Celular A vuelve a consultar (al volver a la app / cada 30 min / aquí: refrescar)
    await refrescar(pA);
    e = await est(pA);
    chk('5. Celular A: PRO activo verificado por el servidor', e.status === 'active' && e.plan === 'pro' && e.voz && e.k === 'activa' && fCo(e.vence) === VENCE1, e);
    t = await textoOv(pA);
    chk('5. La pantalla de planes se actualiza sola: «Plan PRO activo · vence el ' + VENCE1 + '»', t.includes('Plan PRO activo · vence el ' + VENCE1), t);
    await irAjustes(pA, 'negocio');
    t = await pA.evaluate(() => { const x = document.getElementById('subNubePanel'); return x && !x.hidden ? x.innerText : ''; });
    chk('5. Ajustes → Plan y suscripción: «Plan PRO activo · vence el ' + VENCE1 + '»', t.includes('Plan PRO activo · vence el ' + VENCE1) && await pA.evaluate(() => document.getElementById('subViejo').hidden), t);
    await captura(pA, '5-pro-activo');
    mic = await microfono(pA);
    chk('5. PRO: el micrófono se abre (ya no sale «Función PRO»)', mic.abrio && !mic.pro, mic);

    // =====================================================================
    // 6. Celular B (nuevo, sin nada guardado): misma cuenta → elige el negocio → recupera PRO sin pagar
    // =====================================================================
    const B = await celular('celular B'), pB = B.p;
    chk('6. Celular B arranca sin nada guardado', await pB.evaluate(() => !Object.keys(localStorage).some(k => /^vento_(sub|nube)/.test(k))));
    await nubeDesdeEntrada(pB);
    await pB.fill('#nubeEmail', 'ana@barreal.co'); await pB.fill('#nubePass', 'clave123'); await pB.click('#nubeEntrar');
    await pB.waitForSelector('#nubeLista [data-elegir]');
    chk('6. Celular B: «Tus negocios» muestra Bar Real (dueño)', /Bar Real/.test(await pB.textContent('#nubeLista')) && /dueño/.test(await pB.textContent('#nubeLista')));
    await pB.click('#nubeLista [data-elegir="0"]');
    chk('6. Celular B: entra a la app con el negocio de la nube', await esperar(pB, n => { const x = window.ventoNube.negocio(); return x && x.id === n && document.getElementById('authOverlay').hidden; }, NEG, 15000));
    chk('6. Celular B: recupera el plan PRO del servidor (cambio de celular)', await esperar(pB, () => window.ventoSuscripcion.planEfectivo() === 'pro', null, 15000), JSON.stringify(await est(pB)));
    e = await est(pB);
    chk('6. Celular B: mismo vencimiento, sin pagar de nuevo', fCo(e.vence) === VENCE1 && e.voz && !B.pedidos.includes('pago') && (await pagosDe(NEG)).length === 1, e);
    mic = await microfono(pB);
    chk('6. Celular B: el micrófono se abre', mic.abrio && !mic.pro, mic);

    // Un cajero invitado por el dueño (Ajustes → Nube → Invitar · Cajero)
    await abrirNubeAjustes(pA);
    await pA.selectOption('#nubeRolInv', 'cajero'); await pA.click('#nubeInvitar');
    await pA.waitForSelector('#nubeInvRes .nube-cod');
    const codigo = (await pA.textContent('#nubeInvRes .nube-cod')).trim();
    chk('6. El dueño (PRO) invita a un cajero desde Vento Nube', /^[A-Z0-9-]{4,}$/.test(codigo), codigo);
    await pA.click('#nubeOv [data-n="cerrar"]');
    const C = await celular('cajero'), pC = C.p;
    await nubeDesdeEntrada(pC);
    await crearCuenta(pC, 'caja@barreal.co', 'Camilo');
    await pC.fill('#nubeCodigo', codigo); await pC.click('#nubeUnirme');
    chk('6. Cajero: se une con el código y entra a la app', await esperar(pC, n => { const x = window.ventoNube.negocio(); return x && x.id === n && x.rol === 'cajero' && document.getElementById('authOverlay').hidden; }, NEG, 15000));
    chk('6. Cajero: estado verificado del negocio (PRO del negocio)', await esperar(pC, () => window.ventoSuscripcion.planEfectivo() === 'pro', null, 15000));
    e = await est(pC);
    chk('6. Cajero: rol cajero, sin manejo de pagos', e.rol === 'cajero' && !e.manda && e.voz, e);
    await pC.evaluate(() => subAplicar());
    chk('6. Cajero: no ve la barra de pagos', !(await barra(pC)));
    await pC.evaluate(() => ventoSuscripcion.abrirPlanes());
    t = await textoOv(pC);
    chk('6. Cajero: no ve precios ni botones de pagar', !t.includes(PRECIO_TXT) && !/\$\d/.test(t) && !/PAGAR|RENOVAR/.test(t) && !(await pC.$('#vsOv [data-pagar], #vsOv [data-metodo]')) && /dueño o el administrador/.test(t), t);
    await irAjustes(pC, 'negocio');
    chk('6. Cajero: Ajustes sin «Planes y pagos»', await pC.evaluate(() => { const x = document.getElementById('subNubePanel'); return !!x && !x.hidden && !x.querySelector('[data-panel]') && !/Planes y pagos|\$\d/.test(x.innerText); }));
    const pedidosCaja = C.pedidos.slice();   // lo que pidió la app del cajero (antes de la prueba «a mano» de abajo)
    const caja = await pC.evaluate(async b64 => {
      const c = await ventoNube.cliente(), s = (await c.auth.getSession()).data.session, cfg = ventoNube.config();
      const h = { 'Content-Type': 'application/json', apikey: cfg.key, Authorization: 'Bearer ' + s.access_token }, n = ventoNube.negocio().id, u = cfg.url + '/functions/v1/vento-suscripciones/';
      const es = await (await fetch(u + 'estado', { method: 'POST', headers: h, body: JSON.stringify({ negocio: n }) })).json();
      const pg = await fetch(u + 'pago', { method: 'POST', headers: h, body: JSON.stringify({ negocio: n, plan: 'pro', metodo: 'NEQUI', monto: 62900, referencia: 'C-1', nombre: 'Camilo', telefono: '3011111111', idem: 'caja-1', comprobante: { base64: b64, tipo: 'image/png' } }) });
      return { ultimo: es.last_payment, pend: es.pending_payment, st: pg.status, j: await pg.json() };
    }, png(200, 200, [5, 5, 250]).toString('base64'));
    chk('6. Cajero: el servidor no le muestra los pagos y no lo deja pagar (403)', caja.ultimo === null && caja.pend === null && caja.st === 403 && caja.j.error === 'sin_permiso', caja);
    chk('6. Cajero: su app nunca pidió /planes ni /pago', pedidosCaja.includes('estado') && !pedidosCaja.some(x => x === 'planes' || x === 'pago'), pedidosCaja.join());
    await C.ctx.close();
    await B.ctx.close();
    // Celular A se pone al día con lo que subieron B y el cajero (si no, la app lo baja sola en ≤ 15 s).
    await abrirNubeAjustes(pA);
    await pA.click('#nubeSync');
    const alDia = await esperar(pA, () => /Al día/.test(document.getElementById('nubeMsg').textContent));
    const vA = await pA.evaluate(() => JSON.parse(localStorage.getItem('vento_nube_estado')).version);
    const vS = (await uno('select version from datos_negocio where negocio_id = $1', [NEG])).version;
    chk('6. Celular A: «🔄 Sincronizar ahora» queda al día con lo que subieron los otros celulares', alDia && Number(vA) === Number(vS), [vA, vS]);
    await pA.click('#nubeOv [data-n="cerrar"]');

    // =====================================================================
    // 7. Otro negocio en plan Gratis: datos falsos en localStorage no dan PRO
    // =====================================================================
    const D = await celular('otro negocio'), pD = D.p;
    await nubeDesdeEntrada(pD);
    await crearCuenta(pD, 'luis@tienda.co', 'Luis');
    chk('7. Otro dueño crea su cuenta y su negocio', await subirNegocio(D, 'Tienda Gratis'));
    const NEGD = await negocioId(pD);
    await esperar(pD, () => document.getElementById('authOverlay').hidden && ventoSuscripcion.verificado(), null, 15000);
    e = await est(pD);
    chk('7. Ese negocio está en plan Gratis', e.v && e.plan === 'free' && !e.voz, e);
    // Token REAL firmado por el servidor pero de OTRO negocio (el PRO de Bar Real) + flags «pro» puestos a mano
    const tokA = await pA.evaluate(n => localStorage.getItem('vento_sub_token:' + n), NEG);
    await pD.evaluate(([n, tok]) => {
      localStorage.setItem('vento_sub_token:' + n, tok);
      localStorage.setItem('vento_sub_info:' + n, JSON.stringify({ plan_efectivo: 'pro', entitlements: { voice: true, ocr: true }, subscription: { status: 'active', plan_id: 'pro', source: 'manual', expiry_date: '2099-01-01T00:00:00Z' } }));
      localStorage.setItem('vento_premium', '1'); localStorage.setItem('vento_sub_pro', 'true'); localStorage.setItem('vento_plan', 'pro');
    }, [NEGD, tokA]);
    await pD.reload();
    await esperar(pD, () => window.ventoSuscripcion && ventoSuscripcion.verificado() && ventoSuscripcion.estado().ultimo > 0, null, 15000);
    e = await est(pD);
    chk('7. Token de otro negocio + flags «pro» en localStorage: sigue Gratis', e.v && e.plan === 'free' && !e.voz && e.k === 'gratis', e);
    mic = await microfono(pD);
    chk('7. …y el micrófono sigue abriendo «Función PRO»', !mic.abrio && mic.pro, mic);
    const guardado = await pD.evaluate(n => { try{ return JSON.parse(atob(localStorage.getItem('vento_sub_token:' + n).split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))); }catch(x){ return null; } }, NEGD);
    chk('7. El token guardado es el del servidor para ESTE negocio (Gratis)', guardado && guardado.n === NEGD && guardado.p === 'free', guardado);
    // Sin internet y con un token inventado (sin firma válida): el módulo de la nube no lo acepta
    await pD.route(/\/functions\/v1\//, rt => rt.abort('internetdisconnected'));
    const falso = b64u(JSON.stringify({ t: 'vento-sub', n: NEGD, p: 'pro', s: 'active', e: ['pos_basic', 'voice', 'ocr', 'ai_camera'], v: Date.now() + 99 * 864e5, i: Date.now(), h: Date.now() + 99 * 864e5 })) + '.' + b64u('firma-inventada');
    await pD.evaluate(([n, tok]) => localStorage.setItem('vento_sub_token:' + n, tok), [NEGD, falso]);
    await pD.reload(); await pD.waitForTimeout(2500);
    e = await pD.evaluate(() => ({ v: ventoSuscripcion.verificado(), voz: ventoSuscripcion.tiene('voice'), plan: ventoSuscripcion.planEfectivo() }));
    chk('7. Sin internet, un token inventado no se acepta (ventoSuscripcion no da «voice»)', !e.v && !e.voz && e.plan !== 'pro', e);
    await D.ctx.close();

    // =====================================================================
    // 8. Vencimiento: la fecha pasa → Gratis, bloquea PRO y SIGUE vendiendo
    // =====================================================================
    await sb.sql("update subscriptions set expiry_date = now() - interval '1 minute' where business_id = $1", [NEG]);
    await refrescar(pA);
    sub = await uno('select status from subscriptions where business_id = $1', [NEG]);
    const ev = await uno("select count(*) n from payment_events where business_id = $1 and type = 'subscription_expired'", [NEG]);
    chk('8. En la base: el servidor la pasa a «expired» (con su evento)', sub.status === 'expired' && Number(ev.n) === 1, sub);
    e = await est(pA);
    chk('8. La app pasa a Gratis (vencida): sin voz, con pos_basic', e.status === 'expired' && e.plan === 'free' && !e.voz && e.pos && e.k === 'vencida', e);
    mic = await microfono(pA);
    chk('8. Vencido: el micrófono abre «Función PRO» («venció»)', !mic.abrio && mic.pro && /venció/.test(mic.texto), mic);
    await pA.click('#vsOv [data-vs="cerrar"]');
    v = await vender(pA, 'Heineken');
    chk('8. Vencido: SIGUE vendiendo (mesa → cobrar)', v.enMesa === 2 && v.cobro && v.debe === 0 && v.libre, v);
    await pA.evaluate(() => subAplicar());
    t = await barra(pA);
    chk('8. Barra: «Tu plan PRO venció» con RENOVAR', /PRO venció/.test(t) && /RENOVAR/.test(t), t);
    await captura(pA, '8-vencido');

    // =====================================================================
    // 9a. Renovar desde vencido (barra RENOVAR → DaviPlata): empieza el día de la aprobación
    // =====================================================================
    await pA.click('#subBar [data-sub="renovar"]');
    chk('9. RENOVAR abre el mismo flujo (método de pago)', await esperar(pA, () => document.getElementById('vsOv').dataset.pantalla === 'metodo'));
    await pA.click('#vsOv [data-metodo="DAVIPLATA"]');
    t = await textoOv(pA);
    chk('9. DaviPlata: número y titular del servidor', t.includes('310 987 6543') && t.includes(DAVI.titular) && t.includes(PRECIO_TXT), t);
    await pA.click('#vsYaPague');
    const pagador = await pA.evaluate(() => ({ n: vsNombre.value, t: vsTel.value, m: vsMetodo.value }));
    chk('9. El comprobante recuerda al pagador (nombre y teléfono) y trae DAVIPLATA', pagador.n === 'Ana Dueña' && pagador.t === '3005551234' && pagador.m === 'DAVIPLATA', pagador);
    await llenarComprobante(pA, { name: 'daviplata.png', mimeType: 'image/png', buffer: png(800, 500, [237, 28, 39]) }, 'D-REN-0002');
    await pA.click('#vsEnviar');
    chk('9. Renovación (vencida) enviada: «Pago en revisión»', await enRevision(pA), await textoOv(pA));
    const P2 = (await pagosDe(NEG)).slice(-1)[0];
    r = await api('/admin/aprobar', { payment: P2.id }, jefe.token);
    sub = await uno('select status, start_date, expiry_date from subscriptions where business_id = $1', [NEG]);
    chk('9. Aprobada: como estaba vencida, empieza hoy y vence hoy + 1 mes', r.st === 200 && P2.kind === 'new' && sub.status === 'active' && fCo(sub.start_date) === fCo(Date.now()) && fCo(sub.expiry_date) === VENCE1, [r.j.error, P2.kind, sub]);
    await refrescar(pA);

    // =====================================================================
    // 9b. Renovación con el plan activo que vence en 3 días: el mes se SUMA al vencimiento
    // =====================================================================
    const E0 = (await uno("update subscriptions set expiry_date = now() + interval '3 days' where business_id = $1 returning expiry_date::text as t, expiry_date", [NEG]));
    await refrescar(pA);
    await cerrarTodo(pA); await pA.evaluate(() => subAplicar());
    t = await barra(pA);
    chk('9. Vence en 3 días: barra «Tu suscripción vence el ' + fCo(E0.expiry_date) + '.» + RENOVAR', t.includes('Tu suscripción vence el ' + fCo(E0.expiry_date) + '.') && /RENOVAR/.test(t), t);
    await captura(pA, '9-renovar');
    await pA.click('#subBar [data-sub="renovar"]');
    await esperar(pA, () => document.getElementById('vsOv').dataset.pantalla === 'metodo');
    await pA.click('#vsOv [data-metodo="NEQUI"]'); await pA.click('#vsYaPague');
    await llenarComprobante(pA, { name: 'renovacion.png', mimeType: 'image/png', buffer: png(700, 900, [40, 90, 200]) }, 'M-REN-0003');
    await pA.click('#vsEnviar');
    chk('9. Renovación anticipada enviada: «Pago en revisión»', await enRevision(pA), await textoOv(pA));
    const P3 = (await pagosDe(NEG)).slice(-1)[0];
    sub = await uno('select status from subscriptions where business_id = $1', [NEG]);
    await esperar(pA, () => ventoSuscripcion.estado().pago);   // la app vuelve a consultar sola después de enviar
    e = await est(pA);
    chk('9. Mientras se revisa la renovación, el plan sigue ACTIVO (PRO)', P3.kind === 'renewal' && sub.status === 'active' && e.plan === 'pro' && e.voz && e.pago, [P3.kind, sub.status, e]);
    r = await api('/admin/aprobar', { payment: P3.id }, jefe.token);
    const VENCE3 = fCo(masMeses(E0.expiry_date, 1));
    sub = await uno("select status, expiry_date, expiry_date = (($1::timestamptz at time zone 'America/Bogota') + interval '1 month') at time zone 'America/Bogota' as suma from subscriptions where business_id = $2", [E0.t, NEG]);
    chk('9. Aprobada: nuevo vencimiento = vencimiento anterior + 1 mes (' + VENCE3 + ')', r.st === 200 && sub.status === 'active' && sub.suma === true && fCo(sub.expiry_date) === VENCE3, [r.j.error, sub, E0.t]);
    await refrescar(pA);
    t = await textoOv(pA);
    chk('9. La app: «¡Tu plan PRO está activo!» y vence el ' + VENCE3, /Tu plan PRO está activo/.test(t) && t.includes(VENCE3), t);
    e = await est(pA);
    chk('9. La app: PRO activo hasta ' + VENCE3 + ', ya sin aviso de renovar', e.status === 'active' && e.plan === 'pro' && fCo(e.vence) === VENCE3 && !e.renovar, e);

    // =====================================================================
    // 10. Otro pago → el admin lo rechaza con motivo → la app lo muestra
    // =====================================================================
    await irAjustes(pA, 'negocio');
    await pA.click('#subNubePanel [data-panel="planes"]');
    await esperar(pA, () => !!document.querySelector('#vsOv [data-pagar="pro"]'));
    chk('10. Con PRO activo el botón dice «RENOVAR PRO»', /RENOVAR PRO/.test(await pA.textContent('#vsOv [data-pagar="pro"]')));
    await pA.click('#vsOv [data-pagar="pro"]'); await pA.click('#vsOv [data-metodo="NEQUI"]'); await pA.click('#vsYaPague');
    await llenarComprobante(pA, { name: 'otro.png', mimeType: 'image/png', buffer: png(600, 600, [250, 180, 20]) }, 'M-REN-0004');
    await pA.click('#vsEnviar');
    chk('10. Otro pago enviado: «Pago en revisión»', await enRevision(pA), await textoOv(pA));
    const P4 = (await pagosDe(NEG)).slice(-1)[0];
    const MOTIVO = 'El valor no llegó a la cuenta Nequi';
    r = await api('/admin/rechazar', { payment: P4.id, motivo: MOTIVO }, jefe.token);
    const p4 = await uno('select status, reject_reason, rejected_by from payment_records where id = $1', [P4.id]);
    sub = await uno('select status, expiry_date from subscriptions where business_id = $1', [NEG]);
    chk('10. En la base: pago rechazado con su motivo; la suscripción sigue activa hasta ' + VENCE3, r.st === 200 && p4.status === 'rejected' && p4.reject_reason === MOTIVO && p4.rejected_by === jefe.id && sub.status === 'active' && fCo(sub.expiry_date) === VENCE3, [r.j, p4, sub]);
    await refrescar(pA);
    t = await textoOv(pA);
    chk('10. La pantalla abierta pasa a «Tu pago no fue aprobado» con el motivo', /no fue aprobado/.test(t) && t.includes(MOTIVO) && !!(await pA.$('#vsOv [data-vs="reintentar"]')), t);
    e = await est(pA);
    chk('10. El rechazo no quita el PRO vigente', e.status === 'active' && e.plan === 'pro' && e.voz && e.rechazo === MOTIVO, e);
    await cerrarTodo(pA); await pA.evaluate(() => subAplicar());
    t = await barra(pA);
    chk('10. Barra: «Tu pago no fue aprobado: <motivo>»', t.includes('Tu pago no fue aprobado: ' + MOTIVO), t);
    await pA.click('#subBar');
    t = await textoOv(pA);
    chk('10. Planes: motivo del rechazo y «📸 Enviar otro comprobante»', t.includes(MOTIVO) && /Enviar otro comprobante/.test(t), t);
    await captura(pA, '10-rechazado');
    await pA.click('#vsOv [data-vs="reintentar"]');
    chk('10. «Enviar otro comprobante» vuelve a las instrucciones (mismo método)', await pantalla(pA) === 'instrucciones' && /NEQUI/.test(await pA.textContent('#vsTit')));

    // =====================================================================
    // 11. Comprobante que no es imagen → mensaje claro, sin pago
    // =====================================================================
    await pA.click('#vsYaPague');
    const nPagos = (await pagosDe(NEG)).length, nFotos = fotos(NEG).length, nPedidos = A.pedidos.filter(x => x === 'pago').length;
    await pA.setInputFiles('#vsFileGal', { name: 'comprobante.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n') });
    chk('11. Un PDF: «Elige una foto (imagen) del comprobante.»', await esperar(pA, () => /Elige una foto \(imagen\)/.test(document.getElementById('vsMsg').textContent)) && await pA.evaluate(() => document.getElementById('vsPrev').hidden), await pA.textContent('#vsMsg'));
    await pA.setInputFiles('#vsFileGal', { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('esto no es una imagen de verdad, solo texto con nombre de foto') });
    chk('11. Un archivo con nombre de foto que no es imagen: «Esa imagen no se pudo abrir…»', await esperar(pA, () => /no se pudo abrir/.test(document.getElementById('vsMsg').textContent)), await pA.textContent('#vsMsg'));
    await pA.fill('#vsRef', 'M-REN-0005'); await pA.click('#vsEnviar'); await pA.waitForTimeout(300);
    chk('11. ENVIAR sin una foto válida: pide el comprobante y no manda nada', /Toma la foto del comprobante/.test(await pA.textContent('#vsMsg')) && A.pedidos.filter(x => x === 'pago').length === nPedidos, await pA.textContent('#vsMsg'));
    const malo = await pA.evaluate(async () => {
      const c = await ventoNube.cliente(), s = (await c.auth.getSession()).data.session, cfg = ventoNube.config();
      const r = await fetch(cfg.url + '/functions/v1/vento-suscripciones/pago', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.key, Authorization: 'Bearer ' + s.access_token },
        body: JSON.stringify({ negocio: ventoNube.negocio().id, plan: 'pro', metodo: 'NEQUI', monto: 62900, referencia: 'M-REN-0006', nombre: 'Ana', telefono: '3005551234', idem: 'no-imagen-1', comprobante: { base64: btoa('%PDF-1.4 esto no es una foto '.repeat(8)), tipo: 'image/jpeg' } }) });
      return { st: r.status, j: await r.json() };
    });
    chk('11. Al servidor tampoco le sirve (400 «comprobante_invalido» con mensaje claro)', malo.st === 400 && malo.j.error === 'comprobante_invalido' && /foto/i.test(malo.j.mensaje || ''), malo);
    chk('11. Ningún pago ni foto nuevos', (await pagosDe(NEG)).length === nPagos && fotos(NEG).length === nFotos, [nPagos, nFotos]);
    const tot = await uno("select count(*) filter (where status = 'approved') ap, count(*) filter (where status = 'rejected') re, count(*) filter (where status = 'review') rv, count(*) n from payment_records where business_id = $1", [NEG]);
    chk('Resumen en la base: 4 pagos (3 aprobados, 1 rechazado, 0 en revisión) y 1 sola suscripción', Number(tot.n) === 4 && Number(tot.ap) === 3 && Number(tot.re) === 1 && Number(tot.rv) === 0 &&
      Number((await uno('select count(*) n from subscriptions where business_id = $1', [NEG])).n) === 1, tot);
    await A.ctx.close();
  }
})();
