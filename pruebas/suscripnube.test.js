// Suscripción en Vento Nube (nube/vento-suscripcion.js): el servidor decide el plan con un token firmado.
// El servidor «vento-suscripciones» se simula aquí (respuestas según el contrato) y firma con una llave
// ECDSA P-256 creada en la prueba. No usa internet.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { webcrypto } = require('crypto'); const zlib = require('zlib');
const BASE = process.env.VENTO_BASE || 'http://localhost:8765';
const NEG = '7b0c2a51-4d3e-4f6a-9b1c-2d3e4f5a6b7c';
const DIA = 864e5, H = 3600e3;
const TODOS = ['pos_basic', 'inventory', 'tables', 'expenses', 'invoices', 'ocr', 'ai_camera', 'voice', 'advanced_reports', 'multi_branch', 'employee_management'];
const ENTS = { free: ['pos_basic', 'tables', 'inventory', 'expenses'], pro: ['pos_basic', 'inventory', 'tables', 'expenses', 'invoices', 'ocr', 'ai_camera', 'voice', 'advanced_reports', 'employee_management'] };
const PLANES = [
  { id: 'free', name: 'Gratis', price: 0, currency: 'COP', period_months: 1, active: true, sort: 0, description: 'Para empezar', entitlements: ENTS.free },
  { id: 'pro', name: 'Pro', price: 59900, currency: 'COP', period_months: 1, active: true, sort: 2, description: 'Todo Vento', entitlements: ENTS.pro }
];
const CATALOGO = { ok: true, planes: PLANES, config: { beta_mode: true, trial_days: 15, renew_notice_days: 7, support_whatsapp: '573001112233',
  manual_methods: { NEQUI: { numero: '3001234567', titular: 'Vento Pruebas SAS' }, DAVIPLATA: { numero: '3109876543', titular: 'Vento Pruebas SAS' } } }, proveedores: ['manual'] };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fechaCO = ms => { const d = new Date(ms - 5 * H), p = n => String(n).padStart(2, '0'); return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); };
const hoy = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };

// PNG de prueba (más grande que 1600 px para comprobar que la app lo achica)
function png(w, h){
  const T = []; for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for(const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for(let y = 0; y < h; y++){ const o = y * (w * 3 + 1); for(let x = 0; x < w; x++){ const i = o + 1 + x * 3; raw[i] = x * 255 / w | 0; raw[i + 1] = y * 255 / h | 0; raw[i + 2] = 140; } }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function jpegTam(b){ let i = 2; while(i < b.length - 9){ if(b[i] !== 0xFF){ i++; continue; } const m = b[i + 1]; if(m >= 0xC0 && m <= 0xC3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + b.readUInt16BE(i + 2); } return null; }

(async()=>{
  const S = webcrypto.subtle;
  const llave = await S.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const otra = await S.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);   // la de un «pirata»
  const pubJwk = await S.exportKey('jwk', llave.publicKey), PUB = { kty: 'EC', crv: 'P-256', x: pubJwk.x, y: pubJwk.y };
  const firmar = async (pl, k) => { const a = b64u(JSON.stringify(pl)); const sig = await S.sign({ name: 'ECDSA', hash: 'SHA-256' }, (k || llave).privateKey, Buffer.from(a)); return a + '.' + b64u(new Uint8Array(sig)); };
  const alterar = tok => { const [a, s] = tok.split('.'); const pl = JSON.parse(Buffer.from(a.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); Object.assign(pl, { p: 'premium', s: 'active', e: TODOS, v: Date.now() + 365 * DIA, h: Date.now() + 365 * DIA }); return b64u(JSON.stringify(pl)) + '.' + s; };

  // ---------- Servidor simulado (POST /estado, /pago; GET /planes, /clave) ----------
  const nuevoServidor = (rol, sub) => ({ rol, sub, pendiente: null, ultimo: null, renovar: false, pedidos: [], pagos: [], offline: false, fallarPago: 0, demoraPago: 0, alterar: false });
  async function respEstado(sv, conToken){
    const now = Date.now(), s = sv.sub, activo = !!(s && s.status === 'active' && s.expiry > now), pe = activo ? s.plan : 'free';
    const r = { ok: true,
      subscription: s ? { id: 'sub-1', status: s.status, plan_id: s.plan, source: s.source || 'manual', start_date: new Date(now - 10 * DIA).toISOString(), expiry_date: s.expiry ? new Date(s.expiry).toISOString() : null, auto_renew: false, dias_restantes: s.expiry ? Math.max(0, Math.ceil((s.expiry - now) / DIA)) : null } : null,
      plan_efectivo: pe, plan: PLANES.find(p => p.id === pe), entitlements: Object.fromEntries(TODOS.map(k => [k, ENTS[pe].includes(k)])),
      pending_payment: sv.pendiente, last_payment: sv.ultimo, renew_notice: !!sv.renovar, rol: sv.rol };
    if(conToken){
      r.token = await firmar({ t: 'vento-sub', n: NEG, p: pe, s: s ? s.status : 'pending_payment', e: ENTS[pe], v: (s && s.expiry) || 0, i: now, h: Math.min((s && s.expiry) || Infinity, now + 72 * H) });
      if(sv.alterar) r.token = alterar(r.token);
    }
    return r;
  }
  async function enrutar(ctx, sv){
    await ctx.route('**/*', async r => {
      const req = r.request(), u = new URL(req.url());
      if(u.hostname === 'localhost') return r.continue();
      const m = /^\/functions\/v1\/vento-suscripciones\/([\w-]+)$/.exec(u.pathname);
      if(!/supabase\.co$/.test(u.hostname) || !m) return r.abort();
      if(req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      let cuerpo = null; try{ cuerpo = JSON.parse(req.postData() || 'null'); }catch(e){}
      sv.pedidos.push({ ruta: m[1], metodo: req.method(), cuerpo, auth: req.headers()['authorization'] || '' });
      if(sv.offline) return r.abort('internetdisconnected');
      const json = (status, j) => r.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(j) });
      if(m[1] === 'clave') return json(200, { ok: true, jwk: PUB });
      if(m[1] === 'planes') return json(200, CATALOGO);
      if(!/^Bearer \S+/.test(req.headers()['authorization'] || '')) return json(401, { ok: false, error: 'sin_sesion', mensaje: 'Primero entra con tu cuenta.' });
      if(!cuerpo || cuerpo.negocio !== NEG) return json(403, { ok: false, error: 'sin_permiso', mensaje: 'No eres miembro de ese negocio.' });
      if(m[1] === 'estado') return json(200, await respEstado(sv, true));
      if(m[1] === 'pago'){
        if(sv.rol !== 'dueno' && sv.rol !== 'admin') return json(403, { ok: false, error: 'sin_permiso', mensaje: 'Tu rol no permite pagar.' });
        if(sv.demoraPago) await new Promise(ok => setTimeout(ok, sv.demoraPago));
        if(sv.fallarPago > 0){ sv.fallarPago--; return json(503, { ok: false, error: 'ocupado', mensaje: 'El servidor está ocupado. Inténtalo otra vez.' }); }
        const ya = sv.pagos.find(x => x.idem === cuerpo.idem);
        if(ya) return json(200, { ok: true, payment: ya, repetido: true, estado: await respEstado(sv, false) });
        const pago = { id: 'pay-' + (sv.pagos.length + 1), idem: cuerpo.idem, status: 'review', plan_id: cuerpo.plan, method: cuerpo.metodo, amount: cuerpo.monto, reference: cuerpo.referencia, payer_name: cuerpo.nombre, payer_phone: cuerpo.telefono, paid_at: cuerpo.fecha, created_at: new Date().toISOString() };
        sv.pagos.push(pago); sv.pendiente = pago;
        if(!sv.sub || sv.sub.status !== 'active') sv.sub = Object.assign({}, sv.sub || { plan: cuerpo.plan }, { status: 'payment_review', plan: cuerpo.plan });
        return json(200, { ok: true, payment: pago, repetido: false, estado: await respEstado(sv, false) });
      }
      return json(404, { ok: false, error: 'no_existe' });
    });
  }
  // Vento Nube simulada: sesión (token) y negocio en la nube con su rol.
  async function celular(sv, o){
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await enrutar(ctx, sv);
    await ctx.addInitScript(({ neg, rol, email, tok, nube }) => {
      if(nube){ try{ const st = JSON.parse(localStorage.getItem('vento_nube_estado') || 'null'); if(!st || !st.negocio) localStorage.setItem('vento_nube_estado', JSON.stringify({ email, negocio: { id: neg, nombre: 'Bar Nube', rol }, version: 1 })); }catch(e){} }
      const q = () => { const o = { select(){ return o; }, eq(){ return o; }, order(){ return o; }, limit(){ return o; }, maybeSingle: async () => ({ data: { version: 1 } }), single: async () => ({ data: { datos: null, version: 1 } }), then(f, g){ return Promise.resolve({ data: [] }).then(f, g); } }; return o; };
      window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: tok ? { access_token: tok } : null } }), onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; }, signOut: async () => ({}) }, from: () => q(), rpc: async () => ({ data: [] }) }) };
    }, { neg: NEG, rol: o.rol, email: o.email, tok: o.tok, nube: o.nube !== false });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(o.nombre + ': ' + e.message));
    await p.goto(BASE + '/index.html'); await p.waitForTimeout(2500);
    if(o.entrar !== false){
      await p.fill('#authBiz', 'Bar Nube'); await p.fill('#authUser', 'ana'); await p.fill('#authPass', 'clave123'); await p.click('#authBtn'); await p.waitForTimeout(1500);
      await p.click('#onbSaltar', { timeout: 2000 }).catch(() => {});
      await p.evaluate(() => { localStorage.setItem('cm-tutorial-seen', '1'); document.querySelectorAll('.overlay.show').forEach(o => o.classList.remove('show')); });
      await p.waitForTimeout(800);
    }
    return { ctx, p };
  }
  const listo = (p, cond, ms) => p.waitForFunction(cond, null, { timeout: ms || 8000 }).then(() => true, () => false);
  const refrescar = p => p.evaluate(() => ventoSuscripcion.refrescar(true).then(() => true));
  const pantalla = p => p.evaluate(() => { const o = document.getElementById('vsOv'); return o && o.classList.contains('show') ? o.dataset.pantalla : ''; });
  const textoOv = p => p.evaluate(() => { const o = document.getElementById('vsOv'); return o ? o.innerText : ''; });
  const cerrarOv = p => p.evaluate(() => document.querySelectorAll('.overlay.show').forEach(o => o.classList.remove('show')));
  const barra = p => p.evaluate(() => { const b = document.getElementById('subBar'); return b && !b.hidden ? b.innerText : ''; });
  // Toca el micrófono (abrirlo de verdad se simula: solo se anota que se abrió)
  const tocarMicro = p => p.evaluate(() => { window.__micAbierto = false; window.startVoiceCommand = () => { window.__micAbierto = true; }; document.querySelectorAll('.overlay.show').forEach(o => o.classList.remove('show')); document.getElementById('voiceFab').click(); return window.__micAbierto; });
  const vende = p => p.evaluate(async () => { document.querySelectorAll('.overlay.show').forEach(o => o.classList.remove('show')); data.products = [{ id: 'pk', name: 'Poker', price: 3800, stock: 50 }]; data.tables[1] = { items: [], people: [] }; saveData(); openTableModal(1);
    document.getElementById('addProductSearch').value = 'Poker'; document.getElementById('addProductId').value = 'pk'; document.getElementById('addQty').value = '2'; document.getElementById('addItemBtn').click(); await new Promise(r => setTimeout(r, 200));
    const q = (data.tables[1].items[0] || {}).qty || 0; document.querySelectorAll('.overlay.show').forEach(o => o.classList.remove('show')); return q; });

  const b = await chromium.launch(); let ok = 0, mal = 0; const errs = [];
  const chk = (n, c, x) => { if(c){ ok++; console.log('✅ ' + n); } else { mal++; console.log('❌ ' + n + (x !== undefined ? ' → ' + x : '')); } };
  try{
    // ===================== Celular del DUEÑO =====================
    const sv = nuevoServidor('dueno', { status: 'expired', plan: 'pro', source: 'trial', expiry: Date.now() - 2 * DIA });
    const { ctx, p } = await celular(sv, { nombre: 'dueño', rol: 'dueno', email: 'dueno@bar.co', tok: 'TOK-DUENO' });
    chk('Negocio en la nube: el estado llega del servidor con la firma verificada', await listo(p, () => window.ventoSuscripcion && ventoSuscripcion.verificado()), JSON.stringify(sv.pedidos.map(x => x.ruta)));
    const pe = sv.pedidos.find(x => x.ruta === 'estado');
    chk('POST /estado con la sesión y el negocio', !!pe && pe.metodo === 'POST' && pe.auth === 'Bearer TOK-DUENO' && pe.cuerpo.negocio === NEG, JSON.stringify(pe));
    chk('La llave pública queda fijada en el celular (vento_sub_clave)', await p.evaluate(x => { try{ return JSON.parse(localStorage.getItem('vento_sub_clave')).x === x; }catch(e){ return false; } }, PUB.x));
    chk('El token firmado se guarda para usar sin internet', await p.evaluate(n => /^[\w-]+\.[\w-]+$/.test(localStorage.getItem('vento_sub_token:' + n) || ''), NEG));
    let e = await p.evaluate(() => ({ plan: ventoSuscripcion.planEfectivo(), pos: ventoSuscripcion.tiene('pos_basic'), voz: ventoSuscripcion.tiene('voice'), k: ventoPlan().k, nube: ventoPlan().nube }));
    chk('Prueba vencida: plan gratis (vende, sin voz)', e.plan === 'free' && e.pos && !e.voz && e.k === 'vencida' && e.nube, JSON.stringify(e));
    chk('Barra: «venció» con RENOVAR', /venció/.test(await barra(p)) && /RENOVAR/.test(await barra(p)), await barra(p));
    chk('Plan gratis: se sigue vendiendo (pos_basic)', await vende(p) === 2);
    chk('Plan gratis: el micrófono NO se abre', await tocarMicro(p) === false);
    chk('…y aparece «Función PRO» con [Ver planes]', await pantalla(p) === 'pro' && /Función PRO/.test(await textoOv(p)) && await p.evaluate(() => !!document.querySelector('#vsOv [data-vs="planes"]')), await textoOv(p));
    // ---------- Flujo de pago ----------
    await p.click('#vsOv [data-vs="planes"]');
    chk('PLANES: tarjetas FREE y PRO con el precio del servidor', await listo(p, () => /\$59\.900/.test(document.getElementById('vsOv').innerText) && document.querySelectorAll('#vsOv .vs-plan').length === 2) && /FREE/.test(await textoOv(p)) && /PRO/.test(await textoOv(p)), await textoOv(p));
    chk('Beneficios traducidos (voz, cámara con IA…)', /Pedidos por voz/.test(await textoOv(p)) && /Cámara con IA/.test(await textoOv(p)));
    await p.click('#vsOv [data-pagar="pro"]');
    chk('MÉTODO: botones grandes NEQUI y DAVIPLATA', await pantalla(p) === 'metodo' && await p.evaluate(() => !!document.querySelector('#vsOv [data-metodo="NEQUI"]') && !!document.querySelector('#vsOv [data-metodo="DAVIPLATA"]')));
    await p.click('#vsOv [data-metodo="NEQUI"]');
    let t = await textoOv(p);
    chk('INSTRUCCIONES: valor, número, titular, botones Copiar y pasos', await pantalla(p) === 'instrucciones' && /\$59\.900/.test(t) && /300 123 4567/.test(t) && /Vento Pruebas SAS/.test(t) && (await p.$$('#vsOv [data-copiar]')).length >= 2 && /Ya pagué/i.test(t), t);
    await p.click('#vsYaPague');
    const campos = await p.evaluate(() => ({ pant: document.getElementById('vsOv').dataset.pantalla, tit: document.getElementById('vsTit').textContent, neg: vsNegocio.value, plan: vsPlan.value, met: vsMetodo.value, monto: vsMonto.value, fecha: vsFecha.value,
      cam: document.getElementById('vsFileCam').getAttribute('capture'), camAcc: document.getElementById('vsFileCam').accept, gal: document.getElementById('vsFileGal').accept, foto: !!document.getElementById('vsFotoCam') && !!document.getElementById('vsFotoGal'), nom: !!document.getElementById('vsNombre'), tel: !!document.getElementById('vsTel'), ref: !!document.getElementById('vsRef') }));
    chk('«ENVÍA TU COMPROBANTE»: tomar foto / galería y todos los campos', campos.pant === 'comprobante' && campos.tit === 'ENVÍA TU COMPROBANTE' && campos.foto && campos.cam === 'environment' && campos.camAcc === 'image/*' && campos.gal === 'image/*' && campos.nom && campos.tel && campos.ref, JSON.stringify(campos));
    chk('Campos llenos: negocio, plan, método, valor y fecha de hoy', campos.neg === 'Bar Nube' && campos.plan === 'PRO' && campos.met === 'NEQUI' && campos.monto === '59900' && campos.fecha === hoy(), JSON.stringify(campos));
    await p.click('#vsEnviar'); await p.waitForTimeout(300);
    chk('Sin foto no se envía (pide el comprobante)', /comprobante/i.test(await p.textContent('#vsMsg')) && !sv.pedidos.some(x => x.ruta === 'pago'), await p.textContent('#vsMsg'));
    await p.setInputFiles('#vsFileGal', { name: 'comprobante.png', mimeType: 'image/png', buffer: png(2000, 1000) });
    chk('Vista previa de la foto', await listo(p, () => { const i = document.getElementById('vsPrev'); return i && !i.hidden && /^data:image\/jpeg/.test(i.src); }));
    await p.fill('#vsNombre', 'Ana Dueña'); await p.fill('#vsTel', '300 555 1234'); await p.fill('#vsRef', 'M123456');
    sv.fallarPago = 1;
    await p.click('#vsEnviar');
    chk('Si el servidor falla, avisa y deja reintentar', await listo(p, () => /ocupado/i.test(document.getElementById('vsMsg').textContent) && !document.getElementById('vsEnviar').disabled), await p.textContent('#vsMsg'));
    const antesPagos = sv.pedidos.filter(x => x.ruta === 'pago').length;
    sv.demoraPago = 700;
    await p.evaluate(() => { const x = document.getElementById('vsEnviar'); x.click(); x.click(); x.click(); });   // toques repetidos
    chk('«Pago en revisión» después de enviar', await listo(p, () => document.getElementById('vsOv').dataset.pantalla === 'revision' && /Pago en revisión/.test(document.getElementById('vsOv').innerText)), await textoOv(p));
    const pagos = sv.pedidos.filter(x => x.ruta === 'pago');
    chk('Doble toque en ENVIAR = UNA sola petición', pagos.length - antesPagos === 1, pagos.length + ' (antes ' + antesPagos + ')');
    chk('El reintento usa la MISMA llave (idem)', pagos.length === 2 && !!pagos[0].cuerpo.idem && pagos[0].cuerpo.idem === pagos[1].cuerpo.idem, pagos.map(x => x.cuerpo.idem).join(' / '));
    chk('El servidor guardó UN solo pago', sv.pagos.length === 1);
    const c = pagos[pagos.length - 1].cuerpo, img = Buffer.from((c.comprobante || {}).base64 || '', 'base64'), tam = jpegTam(img);
    chk('Comprobante con todos los campos (negocio, plan, método, monto, referencia, fecha, nombre, teléfono, idem)', c.negocio === NEG && c.plan === 'pro' && c.metodo === 'NEQUI' && c.monto === 59900 && c.referencia === 'M123456' && c.fecha === hoy() && c.nombre === 'Ana Dueña' && c.telefono === '3005551234' && /^vs-/.test(c.idem), JSON.stringify(Object.assign({}, c, { comprobante: '…' })));
    chk('La foto va en base64 como JPEG (comprimida)', c.comprobante && c.comprobante.tipo === 'image/jpeg' && img[0] === 0xFF && img[1] === 0xD8 && img[2] === 0xFF, img.slice(0, 4).toString('hex'));
    chk('La foto quedó de máximo 1600 px', !!tam && Math.max(tam.w, tam.h) <= 1600 && tam.w === 1600, JSON.stringify(tam));
    chk('Después de enviar se vuelve a consultar el estado', await listo(p, () => ventoSuscripcion.estado().status === 'payment_review'), await p.evaluate(() => ventoSuscripcion.estado().status));
    e = await p.evaluate(() => ({ plan: ventoSuscripcion.planEfectivo(), voz: ventoSuscripcion.tiene('voice'), acc: ventoAcceso.tiene('voice'), k: ventoPlan().k }));
    chk('Pago en revisión NO activa premium', e.plan === 'free' && !e.voz && !e.acc && e.k === 'revision', JSON.stringify(e));
    await cerrarOv(p); await p.evaluate(() => subAplicar());
    chk('Barra: «Pago en revisión»', /Pago en revisión/.test(await barra(p)), await barra(p));
    // ---------- Aprobado: PRO activo ----------
    const vence = Date.now() + 31 * DIA;
    sv.sub = { status: 'active', plan: 'pro', source: 'manual', expiry: vence }; sv.ultimo = Object.assign({}, sv.pendiente, { status: 'approved' }); sv.pendiente = null;
    await refrescar(p);
    e = await p.evaluate(() => ({ plan: ventoSuscripcion.planEfectivo(), voz: ventoSuscripcion.tiene('voice'), ocr: ventoSuscripcion.tiene('ocr'), cam: ventoSuscripcion.tiene('ai_camera'), acc: ventoAcceso.tiene('voice'), k: ventoPlan().k, plan2: ventoPlan().plan }));
    chk('Aprobado: plan PRO activo con voz, OCR y cámara IA', e.plan === 'pro' && e.voz && e.ocr && e.cam && e.acc && e.k === 'activa' && e.plan2 === 'PRO', JSON.stringify(e));
    chk('PRO: el micrófono se abre', await tocarMicro(p) === true && await pantalla(p) === '');
    await p.evaluate(() => { document.querySelector('nav button[data-view="estadisticas"]').click(); });
    chk('PRO: entra a Estadísticas', await p.evaluate(() => document.querySelector('nav button.active').dataset.view === 'estadisticas') && await pantalla(p) === '');
    await p.evaluate(() => { document.querySelector('nav button[data-view="ajustes"]').click(); });
    const panel = await p.evaluate(() => { const x = document.getElementById('subNubePanel'); return x && !x.hidden ? x.innerText : ''; });
    chk('Ajustes: «Plan PRO activo · vence el dd/mm/aaaa»', panel.includes('Plan PRO activo · vence el ' + fechaCO(vence)), panel);
    chk('Ajustes: el sistema viejo de códigos queda oculto con la nube', await p.evaluate(() => document.getElementById('subViejo').hidden));
    await p.evaluate(() => { document.querySelector('nav button[data-view="mesas"]').click(); });
    // ---------- Vencido: bloquea PRO, deja vender ----------
    sv.sub = { status: 'expired', plan: 'pro', source: 'manual', expiry: Date.now() - DIA };
    await refrescar(p);
    e = await p.evaluate(() => ({ plan: ventoSuscripcion.planEfectivo(), voz: ventoSuscripcion.tiene('voice'), pos: ventoSuscripcion.tiene('pos_basic'), k: ventoPlan().k }));
    chk('Vencido: vuelve al plan gratis', e.plan === 'free' && !e.voz && e.pos && e.k === 'vencida', JSON.stringify(e));
    chk('Vencido: bloquea la voz («Función PRO»)', await tocarMicro(p) === false && await pantalla(p) === 'pro' && /venció/.test(await textoOv(p)));
    await cerrarOv(p);
    await p.evaluate(() => { document.getElementById('invInvoiceCamBtn').click(); });
    chk('Vencido: bloquea leer facturas con la cámara (OCR)', await pantalla(p) === 'pro' && /facturas/i.test(await textoOv(p)));
    await cerrarOv(p);
    await p.evaluate(() => { document.querySelector('nav button[data-view="estadisticas"]').click(); });
    chk('Vencido: bloquea Estadísticas avanzadas', await pantalla(p) === 'pro' && await p.evaluate(() => document.querySelector('nav button.active').dataset.view !== 'estadisticas'));
    chk('Vencido: deja vender (plan gratis con pos_basic)', await vende(p) === 2);
    chk('Barra: «Tu plan PRO venció» con RENOVAR', /PRO venció/.test(await barra(p)) && /RENOVAR/.test(await barra(p)), await barra(p));
    // ---------- Rechazado ----------
    sv.sub = { status: 'rejected', plan: 'pro', source: 'manual', expiry: 0 }; sv.ultimo = Object.assign({}, sv.ultimo, { status: 'rejected', reject_reason: 'El valor no coincide con el comprobante' });
    await refrescar(p);
    await p.evaluate(() => ventoSuscripcion.abrirPlanes());
    t = await textoOv(p);
    chk('Rechazado: muestra el motivo', await p.evaluate(() => ventoPlan().k) === 'rechazada' && /no fue aprobado/.test(t) && /El valor no coincide con el comprobante/.test(t), t);
    chk('Rechazado: botón «Enviar otro comprobante»', await p.evaluate(() => !!document.querySelector('#vsOv [data-vs="reintentar"]')));
    await p.click('#vsOv [data-vs="reintentar"]');
    chk('…que vuelve a las instrucciones de pago (mismo método)', await pantalla(p) === 'instrucciones' && /NEQUI/.test(await p.textContent('#vsTit')));
    await cerrarOv(p); await p.evaluate(() => subAplicar());
    chk('Barra: «Tu pago no fue aprobado» con el motivo', /no fue aprobado: El valor no coincide/.test(await barra(p)), await barra(p));
    // ---------- Cerca del vencimiento: RENOVAR ----------
    const vence2 = Date.now() + 5 * DIA;
    sv.sub = { status: 'active', plan: 'pro', source: 'manual', expiry: vence2 }; sv.renovar = true; sv.ultimo = Object.assign({}, sv.ultimo, { status: 'approved', reject_reason: null });
    await refrescar(p);
    t = await barra(p);
    chk('Cerca del vencimiento: «Tu suscripción vence el dd/mm/aaaa.» + RENOVAR', t.includes('Tu suscripción vence el ' + fechaCO(vence2) + '.') && /RENOVAR/.test(t), t);
    await p.click('#subBar [data-sub="renovar"]');
    chk('RENOVAR abre el mismo flujo de pago (método)', await pantalla(p) === 'metodo', await pantalla(p));
    await cerrarOv(p);
    chk('Ajustes también muestra RENOVAR', await p.evaluate(() => !!document.querySelector('#subNubePanel [data-panel="renovar"]')));
    sv.renovar = false;
    // ---------- Token alterado ----------
    sv.alterar = true; await refrescar(p);
    e = await p.evaluate(() => ({ v: ventoSuscripcion.verificado(), plan: ventoSuscripcion.planEfectivo(), voz: ventoSuscripcion.tiene('voice'), tok: localStorage.getItem('vento_sub_token:' + ventoSuscripcion.estado().negocio) }));
    chk('Token alterado (premium inventado con la firma vieja): se rechaza', !e.v && e.plan !== 'premium' && e.plan !== 'pro' && !e.voz && !e.tok, JSON.stringify(e));
    sv.alterar = false;
    // ---------- Sin internet: usa el token firmado hasta «h» ----------
    sv.sub = { status: 'active', plan: 'pro', source: 'manual', expiry: Date.now() + 31 * DIA };
    await refrescar(p);
    chk('Con internet otra vez: PRO verificado', await p.evaluate(() => ventoSuscripcion.verificado() && ventoSuscripcion.planEfectivo() === 'pro'));
    sv.offline = true; const nAntes = sv.pedidos.length;
    await p.reload(); await p.waitForTimeout(3500);
    e = await p.evaluate(() => ({ v: ventoSuscripcion.verificado(), plan: ventoSuscripcion.planEfectivo(), voz: ventoAcceso.tiene('voice'), red: ventoSuscripcion.estado().sinInternet }));
    chk('Sin internet: sigue PRO con el token guardado (antes de «h»)', sv.pedidos.length > nAntes && e.v && e.plan === 'pro' && e.voz && e.red, JSON.stringify(e));
    const viejo = await firmar({ t: 'vento-sub', n: NEG, p: 'pro', s: 'active', e: ENTS.pro, v: Date.now() + 20 * DIA, i: Date.now() - 73 * H, h: Date.now() - H });
    await p.evaluate(([n, tk]) => localStorage.setItem('vento_sub_token:' + n, tk), [NEG, viejo]);
    await p.reload(); await p.waitForTimeout(3500);
    e = await p.evaluate(() => ({ v: ventoSuscripcion.verificado(), plan: ventoSuscripcion.planEfectivo(), voz: ventoSuscripcion.tiene('voice'), acc: ventoAcceso.tiene('voice'), pos: ventoSuscripcion.tiene('pos_basic'), vende: subPuedeVender() }));
    chk('Sin internet y pasado «h»: ya no hay PRO (pero se sigue vendiendo)', e.v && e.plan === 'free' && !e.voz && !e.acc && e.pos && e.vende, JSON.stringify(e));
    const pirata = await firmar({ t: 'vento-sub', n: NEG, p: 'premium', s: 'active', e: TODOS, v: Date.now() + 99 * DIA, i: Date.now(), h: Date.now() + 99 * DIA }, otra);
    await p.evaluate(([n, tk]) => localStorage.setItem('vento_sub_token:' + n, tk), [NEG, pirata]);
    await p.reload(); await p.waitForTimeout(3500);
    e = await p.evaluate(() => ({ v: ventoSuscripcion.verificado(), plan: ventoSuscripcion.planEfectivo(), voz: ventoSuscripcion.tiene('voice') }));
    chk('Token firmado con OTRA llave: no sirve', !e.v && e.plan !== 'premium' && !e.voz, JSON.stringify(e));
    await p.evaluate(n => { localStorage.setItem('vento_sub_token:' + n, '{"p":"pro","premium":true}'); localStorage.setItem('vento_premium', '1'); localStorage.setItem('vento_sub_pro', 'true');
      localStorage.setItem('vento_sub_info:' + n, JSON.stringify({ plan_efectivo: 'premium', entitlements: { voice: true, ocr: true }, subscription: { status: 'active', plan_id: 'premium' } })); }, NEG);
    await p.reload(); await p.waitForTimeout(3500);
    e = await p.evaluate(() => ({ v: ventoSuscripcion.verificado(), plan: ventoSuscripcion.planEfectivo(), voz: ventoSuscripcion.tiene('voice'), ents: ventoSuscripcion.entitlements().length, k: ventoPlan().k }));
    chk('Un flag puesto a mano en localStorage NO da premium (sin internet)', !e.v && e.plan === null && !e.voz && e.ents === 0 && e.k !== 'activa', JSON.stringify(e));
    sv.offline = false; sv.sub = { status: 'expired', plan: 'pro', source: 'manual', expiry: Date.now() - DIA };
    await p.reload(); await listo(p, () => window.ventoSuscripcion && ventoSuscripcion.verificado());
    e = await p.evaluate(() => ({ v: ventoSuscripcion.verificado(), plan: ventoSuscripcion.planEfectivo(), acc: ventoAcceso.tiene('voice'), flag: localStorage.getItem('vento_premium') }));
    chk('Con internet y el flag todavía puesto: manda el servidor (gratis, sin voz)', e.v && e.plan === 'free' && !e.acc && e.flag === '1', JSON.stringify(e));
    chk('Google Play: solo arquitectura (oculto sin la APK)', await p.evaluate(() => { const pr = ventoSuscripcion.proveedores; return pr.lista().join() === 'manual,google_play' && pr.elegir().id === 'manual' && !pr.GooglePlayPaymentProvider.disponible({ proveedores: ['google_play'] }); }));
    await ctx.close();

    // ===================== Otro celular del mismo dueño (cambio de celular) =====================
    sv.sub = { status: 'active', plan: 'pro', source: 'manual', expiry: Date.now() + 20 * DIA };
    const n0 = sv.pedidos.length;
    const c2 = await celular(sv, { nombre: 'celular nuevo', rol: 'dueno', email: 'dueno@bar.co', tok: 'TOK-DUENO-2', entrar: false });
    chk('Cambio de celular (sin nada guardado): recupera el plan PRO del servidor', await listo(c2.p, () => window.ventoSuscripcion && ventoSuscripcion.planEfectivo() === 'pro'), await c2.p.evaluate(() => JSON.stringify(window.ventoSuscripcion && ventoSuscripcion.estado())));
    const nuevos = sv.pedidos.slice(n0);
    chk('…con la misma cuenta (sesión) y sin licencia atada al teléfono', nuevos.some(x => x.ruta === 'estado' && x.auth === 'Bearer TOK-DUENO-2' && x.cuerpo.negocio === NEG) && nuevos.some(x => x.ruta === 'clave'));
    await c2.ctx.close();

    // ===================== Celular del MESERO =====================
    const sm = nuevoServidor('mesero', { status: 'expired', plan: 'pro', source: 'trial', expiry: Date.now() - DIA });
    const m = await celular(sm, { nombre: 'mesero', rol: 'mesero', email: 'mesero@bar.co', tok: 'TOK-MESERO' });
    chk('Mesero: estado verificado del negocio', await listo(m.p, () => window.ventoSuscripcion && ventoSuscripcion.verificado()));
    chk('Mesero: no ve la barra de pagos', !(await barra(m.p)));
    await m.p.evaluate(() => ventoSuscripcion.abrirPlanes()); await m.p.waitForTimeout(400);
    t = await textoOv(m.p);
    chk('Mesero: no ve planes, precios ni botones de pagar', !/\$59\.900/.test(t) && !/PAGAR/.test(t) && await m.p.evaluate(() => !document.querySelector('#vsOv [data-pagar], #vsOv [data-metodo]')) && /dueño o el administrador/.test(t), t);
    await cerrarOv(m.p);
    chk('Mesero: «Función PRO» le dice que se lo pida al dueño (sin [Ver planes])', await tocarMicro(m.p) === false && /Pídele al dueño/.test(await textoOv(m.p)) && await m.p.evaluate(() => !document.querySelector('#vsOv [data-vs="planes"]')), await textoOv(m.p));
    await cerrarOv(m.p);
    await m.p.evaluate(() => subAplicar());
    chk('Mesero: Ajustes sin «Planes y pagos»', await m.p.evaluate(() => { const x = document.getElementById('subNubePanel'); return !!x && !x.hidden && !x.querySelector('[data-panel]') && !/Planes y pagos/.test(x.innerText); }));
    chk('Mesero: nunca se llamó a /pago ni a /planes', !sm.pedidos.some(x => x.ruta === 'pago' || x.ruta === 'planes'), sm.pedidos.map(x => x.ruta).join());
    await m.ctx.close();

    // ===================== Sin Vento Nube: todo como siempre =====================
    const s0 = nuevoServidor('dueno', null);
    const l = await celular(s0, { nombre: 'sin nube', rol: 'dueno', email: '', tok: null, nube: false, entrar: false });
    await l.p.waitForTimeout(1000);
    e = await l.p.evaluate(() => ({ cuenta: ventoSuscripcion.enCuenta(), v: ventoSuscripcion.verificado(), acc: ventoAcceso.tiene('voice') && ventoAcceso.tiene('multi_branch'), k: ventoPlan().k }));
    chk('Sin nube: no consulta al servidor y no bloquea nada (sistema de siempre)', !e.cuenta && !e.v && e.acc && e.k === 'prueba' && !s0.pedidos.length, JSON.stringify(e) + ' ' + s0.pedidos.length);
    await l.ctx.close();
  }catch(x){ chk('La prueba terminó sin excepciones', false, x && x.stack); }
  chk('Sin errores de página', !errs.length, errs.join(' | '));
  console.log('RESULTADO', ok, 'bien', mal, 'mal'); await b.close(); process.exit(mal ? 1 : 0);
})();
