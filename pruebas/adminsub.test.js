// Panel de Administrador · 💳 Suscripciones (Vento Nube simulada).
// supabase-js es falso (window.supabase con auth.signInWithPassword/getSession) y el servidor
// /functions/v1/vento-suscripciones/admin/* se simula con ctx.route.
// El bloqueo con el código personal se OCULTA desde la prueba (page.evaluate → #lock.hidden = true):
// ese bloqueo solo protege la llave que firma licencias; la seguridad de las suscripciones la hace el servidor
// (platform_admins), que aquí responde 403 «no_admin» a una cuenta que no es administradora.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async()=>{
 const BASE = process.env.VENTO_BASE || 'http://localhost:8765';
 const b = await chromium.launch(); let ok = 0, mal = 0;
 const chk = (n, c, x) => { if(c){ ok++; console.log('✅ ' + n); } else { mal++; console.log('❌ ' + n + (x ? ' → ' + x : '')); } };
 const SB = 'https://tdxcrvuuefpthvrkokuh.supabase.co';
 const DIA = 864e5, iso = d => new Date(Date.now() + d * DIA).toISOString();
 const NEG1 = '11111111-1111-4111-8111-111111111111', NEG2 = '22222222-2222-4222-8222-222222222222', NEG3 = '33333333-3333-4333-8333-333333333333';
 const P1 = 'aaaaaaaa-0000-4000-8000-000000000001', P2 = 'aaaaaaaa-0000-4000-8000-000000000002';
 const MALO = '<img src=x onerror="window.__xss=1">Bar Malo';
 const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
 const ENTS = ['pos_basic', 'inventory', 'tables', 'expenses', 'invoices', 'ocr', 'ai_camera', 'voice', 'advanced_reports', 'multi_branch', 'employee_management'];
 // ---------- Datos del servidor simulado ----------
 const S = {
   llamadas: [],
   pagos: [
     { id: P1, plan_id: 'pro', plan_name: 'PRO', provider: 'manual', method: 'NEQUI', amount: 59900, currency: 'COP', reference: 'M1234567', payer_name: 'Ana Gómez', payer_phone: '3001234567',
       paid_at: '2026-10-05', status: 'review', kind: 'new', created_at: iso(-0.1), business_id: NEG1, negocio: 'Bar La 70', user_id: 'u1', usuario_email: 'ana@correo.com',
       comprobante: true, comprobante_mime: 'image/jpeg', aprobar_desde: '2026-10-05T15:00:00Z', aprobar_hasta: '2026-11-05T15:00:00Z' },
     { id: P2, plan_id: 'pro', plan_name: 'PRO', provider: 'manual', method: 'DAVIPLATA', amount: 59900, currency: 'COP', reference: '<b>R-77</b>', payer_name: MALO, payer_phone: '3109876543',
       paid_at: '2026-10-04', status: 'review', kind: 'new', created_at: iso(-0.05), business_id: NEG2, negocio: MALO, user_id: 'u2', usuario_email: 'malo@correo.com',
       comprobante: true, comprobante_mime: 'image/png', aprobar_desde: '2026-10-05T15:00:00Z', aprobar_hasta: '2026-11-05T15:00:00Z' }
   ],
   subs: [
     { id: 's1', status: 'active', plan_id: 'pro', plan_name: 'PRO', source: 'trial', trial: true, start_date: iso(-7), expiry_date: iso(8), dias_restantes: 8, business_id: NEG1, negocio: 'Bar La 70', dueno_email: 'ana@correo.com', plan_efectivo: 'pro', ultimo_pago: null },
     { id: 's2', status: 'payment_review', plan_id: 'pro', plan_name: 'PRO', source: 'trial', trial: true, start_date: iso(-40), expiry_date: iso(-25), dias_restantes: 0, business_id: NEG2, negocio: MALO, dueno_email: 'malo@correo.com', plan_efectivo: 'free', ultimo_pago: null },
     { id: 's3', status: 'expired', plan_id: 'pro', plan_name: 'PRO', source: 'manual', trial: false, start_date: iso(-45), expiry_date: iso(-15), dias_restantes: 0, business_id: NEG3, negocio: 'Tienda Doña Rosa', dueno_email: 'rosa@correo.com', plan_efectivo: 'free', ultimo_pago: null }
   ],
   negocios: [
     { id: NEG1, nombre: 'Bar La 70', creado_en: iso(-7), dueno_email: 'ana@correo.com', miembros: 3, plan_efectivo: 'pro', resumen: { productos: 120, inventario: 80, compras: 14, gastos: 9, ventas: 530, actualizado_en: iso(-0.2) } },
     { id: NEG2, nombre: MALO, creado_en: iso(-40), dueno_email: 'malo@correo.com', miembros: 1, plan_efectivo: 'free', resumen: { productos: 2, inventario: 0, compras: 0, gastos: 0, ventas: 1, actualizado_en: null } },
     { id: NEG3, nombre: 'Tienda Doña Rosa', creado_en: iso(-45), dueno_email: 'rosa@correo.com', miembros: 2, plan_efectivo: 'free', resumen: {} }
   ],
   planes: [
     { id: 'free', name: 'Gratis', price: 0, currency: 'COP', period_months: 1, active: true, sort: 0, description: 'Lo básico', entitlements: ['pos_basic', 'inventory', 'tables', 'expenses'] },
     { id: 'pro', name: 'PRO', price: 59900, currency: 'COP', period_months: 1, active: true, sort: 2, description: 'Todo Vento', entitlements: ['pos_basic', 'inventory', 'tables', 'expenses', 'invoices', 'ocr', 'ai_camera', 'voice', 'advanced_reports', 'employee_management'] },
     { id: 'premium', name: 'Premium', price: 99900, currency: 'COP', period_months: 1, active: false, sort: 3, description: '<img src=x onerror="window.__xss=2">', entitlements: ENTS }
   ],
   config: { beta_mode: true, trial_days: 15, renew_notice_days: 7, manual_methods: { NEQUI: { numero: '3000000000', titular: 'Vento' }, DAVIPLATA: { numero: '', titular: '' } }, support_whatsapp: '573000000000', updated_at: iso(-1) }
 };
 const detalle = id => {
   const n = S.negocios.find(x => x.id === id), s = S.subs.find(x => x.business_id === id) || null;
   return { negocio: { id, nombre: n.nombre, creado_en: n.creado_en, creado_por_email: n.dueno_email },
     miembros: [{ nombre: 'Ana', email: 'ana@correo.com', rol: 'dueno', creado_en: iso(-7) }, { nombre: '<i>Luis</i>', email: null, rol: 'mesero', creado_en: iso(-6) }],
     suscripcion: s, plan_efectivo: n.plan_efectivo, entitlements: Object.fromEntries(ENTS.map(k => [k, k !== 'multi_branch'])),
     pagos: S.pagos.filter(p => p.business_id === id).map(p => Object.assign({}, p)),
     eventos: [{ id: 2, type: 'payment_approved', payment_id: P1, data: { plan: 'pro', monto: 59900, metodo: 'NEQUI', hasta: '2026-11-05T15:00:00Z' }, created_at: iso(-0.01) },
               { id: 1, type: 'trial_started', data: { motivo: '<img src=x onerror="window.__xss=3">' }, created_at: iso(-7) }],
     resumen: n.resumen };
 };
 function servidor(accion, body, auth){
   if(auth === 'Bearer TOK-OTRO') return [403, { ok: false, error: 'no_admin', mensaje: 'Esta cuenta no es administradora de Vento.' }];
   if(auth === 'Bearer TOK-NUEVO') return [403, { ok: false, error: 'correo_sin_confirmar', mensaje: 'Confirma tu correo antes de entrar como administrador.' }];
   if(auth !== 'Bearer TOK-ADMIN') return [401, { ok: false, error: 'sin_sesion', mensaje: 'Entra con tu cuenta de Vento Nube.' }];
   if(S.fallar === accion) return [500, { ok: false, error: 'interno', mensaje: 'Error interno' }];
   const pago = () => S.pagos.find(x => x.id === body.payment), sub = () => S.subs.find(x => x.business_id === body.negocio);
   switch(accion){
     case 'yo': return [200, { ok: true, admin: true, id: 'adm-1', email: 'admin@vento.co' }];
     case 'pagos': { const st = body.status || 'review'; return [200, { ok: true, pagos: S.pagos.filter(x => st === 'all' || x.status === st) }]; }
     case 'comprobante': { const x = pago(); if(!x) return [404, { ok: false, error: 'no_existe', mensaje: 'No se encontró.' }];
       return [200, { ok: true, url: SB + '/storage/v1/object/sign/comprobantes/' + x.business_id + '/' + x.id + '.jpg?token=firmado', mime: 'image/jpeg', vence_en: 600 }]; }
     case 'aprobar': { const x = pago(); if(!x || x.status !== 'review') return [409, { ok: false, error: 'estado_invalido', mensaje: 'Ese pago ya no está en revisión.' }];
       Object.assign(x, { status: 'approved', period_start: x.aprobar_desde, period_end: x.aprobar_hasta, approved_at: iso(0), aprobar_desde: null, aprobar_hasta: null });
       const s = sub() || S.subs.find(y => y.business_id === x.business_id); Object.assign(s, { status: 'active', source: 'manual', trial: false, start_date: x.period_start, expiry_date: x.period_end, dias_restantes: 31 });
       return [200, { ok: true, payment: x, subscription: s, repetido: false }]; }
     case 'rechazar': { const x = pago(); if(!String(body.motivo || '').trim()) return [400, { ok: false, error: 'motivo_invalido', mensaje: 'Escribe el motivo del rechazo (máximo 200 caracteres).' }];
       Object.assign(x, { status: 'rejected', reject_reason: body.motivo, aprobar_desde: null, aprobar_hasta: null }); return [200, { ok: true, payment: x, subscription: null, repetido: false }]; }
     case 'suscripciones': return [200, { ok: true, suscripciones: S.subs }];
     case 'negocios': return [200, { ok: true, negocios: S.negocios }];
     case 'negocio': return [200, Object.assign({ ok: true }, detalle(body.negocio))];
     case 'cancelar': { const s = sub(); Object.assign(s, { status: 'canceled', canceled_at: iso(0) }); return [200, { ok: true, subscription: s, repetido: false }]; }
     case 'cambiar_plan': { const s = sub(); s.plan_id = body.plan; return [200, { ok: true, subscription: s, repetido: false }]; }
     case 'dar': { const s = sub(); Object.assign(s, { status: 'active', plan_id: body.plan, source: 'admin', trial: false, expiry_date: '2027-01-08T15:00:00Z', dias_restantes: 95 }); return [200, { ok: true, subscription: s }]; }
     case 'planes': return [200, { ok: true, planes: S.planes, entitlements: ENTS.map((k, i) => ({ key: k, description: k, sort: i })), config: S.config }];
     case 'plan_guardar': { const pl = Object.assign({ currency: 'COP' }, body.plan); const i = S.planes.findIndex(x => x.id === pl.id); if(i >= 0) S.planes[i] = pl; else S.planes.push(pl); return [200, { ok: true, plan: pl }]; }
     case 'config_guardar': S.config = Object.assign({}, S.config, body.config, { updated_at: iso(0) }); return [200, { ok: true, config: S.config }];
   }
   return [404, { ok: false, error: 'ruta', mensaje: 'Acción de administración desconocida' }];
 }
 const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
 const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
 await ctx.route('**/*', r => {
   const req = r.request(), u = new URL(req.url());
   if(u.hostname === 'localhost' || u.hostname === '127.0.0.1') return r.continue();
   if(u.origin === SB && u.pathname.startsWith('/storage/v1/object/sign/')) return r.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: PNG });
   const m = /^\/functions\/v1\/vento-suscripciones\/admin\/(\w+)$/.exec(u.pathname);
   if(u.origin === SB && m){
     if(req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
     const h = req.headers(); let body = {}; try{ body = JSON.parse(req.postData() || '{}'); }catch(e){}
     S.llamadas.push({ accion: m[1], body, auth: h['authorization'], apikey: h['apikey'], metodo: req.method() });
     const [st, j] = servidor(m[1], body, h['authorization']);
     return r.fulfill({ status: st, contentType: 'application/json', headers: CORS, body: JSON.stringify(j) });
   }
   return r.abort();
 });
 // supabase-js falso: guarda la sesión en memoria (TOK-ADMIN para admin@…, TOK-NUEVO para nuevo@… — admin con el correo
 // sin confirmar —, TOK-OTRO para cualquier otro correo)
 await ctx.addInitScript(() => {
   window.supabase = { createClient: (url, key, opts) => { window.__sb = { url, key, opts }; let ses = null; return { auth: {
     signInWithPassword: async ({ email, password }) => { if(password !== 'clave123') return { data: {}, error: { message: 'Invalid login credentials' } };
       ses = { access_token: /^admin@/.test(email) ? 'TOK-ADMIN' : /^nuevo@/.test(email) ? 'TOK-NUEVO' : 'TOK-OTRO', user: { email } }; return { data: { session: ses, user: ses.user }, error: null }; },
     getSession: async () => ({ data: { session: ses } }),
     signOut: async o => { window.__signOut = o || {}; ses = null; return { error: null }; },
     onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; } } }; } };
 });
 const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
 const llamadas = a => S.llamadas.filter(x => x.accion === a);
 const visible = sel => p.isVisible(sel);
 const texto = sel => p.$eval(sel, e => e.textContent).catch(() => '');
 const esperar = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 6000 }).then(() => true, () => false);

 await p.goto(BASE + '/admin.html'); await p.waitForTimeout(1200);
 chk('El panel sigue pidiendo el código personal al abrir', await visible('#lock'));
 chk('Existe la pestaña «💳 Suscripciones»', /💳 Suscripciones/.test(await texto('#tabs [data-t="subs"]')));
 // Pasar el bloqueo: se oculta desde la prueba (la seguridad de las suscripciones la hace el servidor)
 await p.evaluate(() => { document.getElementById('lock').hidden = true; });
 await p.click('#tabs [data-t="subs"]');
 chk('Pide entrar con la cuenta de Vento Nube', await esperar(() => !document.getElementById('sxLogin').hidden));
 chk('No llama al servidor antes de entrar', S.llamadas.length === 0, JSON.stringify(S.llamadas));
 chk('Sesión aparte de la app (storageKey propia, sin leer el link)', await p.evaluate(() => window.__sb && window.__sb.opts.auth.storageKey === 'vento-admin-nube' && window.__sb.opts.auth.detectSessionInUrl === false));
 chk('Usa la nube de nube/config.js', await p.evaluate(u => window.__sb && window.__sb.url === u, SB));

 // Contraseña mala
 await p.fill('#sxCorreo', 'otro@correo.com'); await p.fill('#sxClave', 'mala'); await p.click('#sxEntrar');
 chk('Contraseña mala: lo dice claro', await esperar(() => /Correo o contraseña incorrectos/.test(document.getElementById('sxLoginMsg').textContent)));

 // Cuenta que NO es admin
 await p.fill('#sxClave', 'clave123'); await p.click('#sxEntrar');
 chk('No-admin: ve el aviso «no es administradora»', await esperar(() => !document.getElementById('sxNoAdmin').hidden && /no es administradora/.test(document.getElementById('sxNoAdmin').textContent)));
 chk('No-admin: el aviso dice con qué correo entró', /otro@correo\.com/.test(await texto('#sxNoAdminCorreo')));
 chk('No-admin: el panel queda oculto y no pide datos', !(await visible('#sxPanel')) && S.llamadas.every(x => x.accion === 'yo'), S.llamadas.map(x => x.accion).join(','));
 const yo1 = llamadas('yo')[0] || {};
 chk('Pregunta al servidor con apikey + Authorization Bearer', yo1.metodo === 'POST' && yo1.auth === 'Bearer TOK-OTRO' && /^eyJ/.test(yo1.apikey || ''), JSON.stringify(yo1));

 // Otra cuenta: la administradora
 await p.click('#sxOtra');
 chk('«Usar otra cuenta» cierra la sesión solo en este equipo', await esperar(() => !document.getElementById('sxLogin').hidden) && await p.evaluate(() => window.__signOut && window.__signOut.scope === 'local'));
 // Correo de administrador sin confirmar: el servidor responde 403 «correo_sin_confirmar» y se dice tal cual
 await p.fill('#sxCorreo', 'nuevo@vento.co'); await p.fill('#sxClave', 'clave123'); await p.click('#sxEntrar');
 chk('Correo sin confirmar: lo dice y no abre el panel', await esperar(() => /Confirma tu correo/.test(document.getElementById('sxLoginMsg').textContent) && !document.getElementById('sxLogin').hidden) && !(await visible('#sxPanel')), await texto('#sxLoginMsg'));
 await p.fill('#sxCorreo', 'admin@vento.co'); await p.fill('#sxClave', 'clave123'); await p.click('#sxEntrar');
 chk('Admin: entra al panel', await esperar(() => !document.getElementById('sxPanel').hidden && document.querySelectorAll('#sxPagos .sxc').length === 2));
 chk('Admin: muestra con qué cuenta entró', /admin@vento\.co/.test(await texto('#sxQuien')));
 chk('Lista de pendientes: pide status «review»', llamadas('pagos').some(x => x.body.status === 'review'));
 chk('Contador de pendientes en la pestaña y en la sección', (await texto('#sxCnt')) === '2' && (await texto('#sxBadge')) === '2' && await visible('#sxBadge'));
 const t1 = await p.$eval('#sxPagos .sxc[data-pago="' + P1 + '"]', e => e.textContent).catch(() => '');
 chk('Tarjeta: negocio, usuario, plan, valor, método, fecha, referencia y estado', ['Bar La 70', 'ana@correo.com', 'PRO', '$59.900', 'NEQUI', '05/10/2026', 'M1234567', 'Por revisar', 'Ana Gómez'].every(x => t1.includes(x)), t1);
 chk('Tarjeta: botones Ver comprobante · Aprobar · Rechazar', (await p.$$('#sxPagos .sxc[data-pago="' + P1 + '"] [data-sxa]')).length === 3);
 chk('Todas las llamadas del admin llevan su sesión', S.llamadas.filter(x => x.accion !== 'yo' || x.auth === 'Bearer TOK-ADMIN').every(x => x.auth === 'Bearer TOK-ADMIN' && /^eyJ/.test(x.apikey || '')));

 // Escapado
 const t2 = await p.$eval('#sxPagos .sxc[data-pago="' + P2 + '"]', e => e.textContent).catch(() => '');
 chk('Escapado: el nombre con <img onerror> se ve como texto', t2.includes('<img src=x onerror="window.__xss=1">Bar Malo') && t2.includes('<b>R-77</b>'), t2.slice(0, 200));
 chk('Escapado: no se crea ninguna imagen ni corre código', (await p.$$('#sxPagos img, #sxPagos b b')).length === 0 && await p.evaluate(() => window.__xss === undefined));

 // Ver comprobante
 await p.click('#sxPagos [data-sxa="ver"][data-id="' + P1 + '"]');
 chk('Ver comprobante: abre el visor con la URL firmada', await esperar(() => document.getElementById('dlgSxVer').open && /\/storage\/v1\/object\/sign\/comprobantes\//.test(document.getElementById('sxVerImg').src) && document.getElementById('sxVerImg').naturalWidth > 0));
 chk('Ver comprobante: pide el del pago correcto', (llamadas('comprobante')[0] || {}).body && llamadas('comprobante')[0].body.payment === P1);
 chk('Ver comprobante: enlace para abrirlo aparte', /token=firmado/.test(await p.$eval('#sxVerAbrir', e => e.href)) && await visible('#sxVerAbrir'));
 await p.click('#dlgSxVer [data-cerrar]');

 // Aprobar
 const nPagos = llamadas('pagos').length;
 await p.click('#sxPagos [data-sxa="aprobar"][data-id="' + P1 + '"]');
 chk('Aprobar: confirma mostrando inicio y vencimiento', await esperar(() => document.getElementById('dlgSxOk').open) && (await texto('#sxOkDesde')) === '05/10/2026' && (await texto('#sxOkHasta')) === '05/11/2026', (await texto('#sxOkDesde')) + ' / ' + (await texto('#sxOkHasta')));
 chk('Aprobar: no aprueba antes de confirmar', llamadas('aprobar').length === 0);
 await p.click('#sxOkGo');
 chk('Aprobar: refresca la lista (queda 1 pendiente)', await esperar(() => document.querySelectorAll('#sxPagos .sxc').length === 1 && !document.querySelector('#sxPagos .sxc[data-pago="aaaaaaaa-0000-4000-8000-000000000001"]')));
 chk('Aprobar: envía el id correcto (una sola vez)', llamadas('aprobar').length === 1 && llamadas('aprobar')[0].body.payment === P1, JSON.stringify(llamadas('aprobar')));
 chk('Aprobar: volvió a pedir los pagos', llamadas('pagos').length > nPagos);
 const av = await texto('#sxAvisoTxt');
 chk('Aprobar: muestra las fechas resultantes', /05\/10\/2026/.test(av) && /05\/11\/2026/.test(av) && await visible('#sxAviso'), av);
 chk('Aprobar: el contador baja a 1', (await texto('#sxCnt')) === '1' && (await texto('#sxBadge')) === '1');

 // Rechazar (motivo obligatorio)
 await p.click('#sxPagos [data-sxa="rechazar"][data-id="' + P2 + '"]');
 await esperar(() => document.getElementById('dlgSxNo').open);
 await p.click('#sxNoGo'); await p.waitForTimeout(300);
 chk('Rechazar sin motivo: lo pide y no envía nada', /motivo/i.test(await texto('#sxNoErr')) && llamadas('rechazar').length === 0 && await p.evaluate(() => document.getElementById('dlgSxNo').open));
 await p.fill('#sxNoMotivo', 'El valor no coincide'); await p.click('#sxNoGo');
 chk('Rechazar: envía el id y el motivo', await esperar(() => document.querySelector('#sxPagos .empty')) && llamadas('rechazar').length === 1 && llamadas('rechazar')[0].body.payment === P2 && llamadas('rechazar')[0].body.motivo === 'El valor no coincide', JSON.stringify(llamadas('rechazar')));
 chk('Rechazar: la lista queda vacía y sin contador', /No hay pagos por revisar/.test(await texto('#sxPagos')) && !(await visible('#sxBadge')));
 await p.selectOption('#sxPagosEstado', 'approved');
 chk('Filtro «Aprobados»: muestra el período del pago aprobado', await esperar(() => /05\/10\/2026 → 05\/11\/2026/.test(document.getElementById('sxPagos').textContent)) && llamadas('pagos').some(x => x.body.status === 'approved'));
 await p.selectOption('#sxPagosEstado', 'review');

 // Suscripciones: filtro, dar meses, cambiar plan, cancelar
 await p.click('#sxNav [data-s="subs"]');
 chk('Suscripciones: lista todas', await esperar(() => document.querySelectorAll('#sxSubs .sxc').length === 3));
 await p.selectOption('#sxSubsFiltro', 'expired');
 chk('Suscripciones: filtro por estado (vencidas)', (await p.$$('#sxSubs .sxc')).length === 1 && /Doña Rosa/.test(await texto('#sxSubs')));
 await p.selectOption('#sxSubsFiltro', '');
 await p.click('#sxSubs [data-sxa="dar"][data-id="' + NEG3 + '"]');
 await esperar(() => document.getElementById('dlgSxAcc').open);
 await p.click('#sxAccMesesRap [data-m="3"]'); await p.click('#sxAccGo');
 chk('Dar meses: envía negocio, plan y meses', await esperar(() => !document.getElementById('dlgSxAcc').open) && JSON.stringify((llamadas('dar')[0] || {}).body) === JSON.stringify({ negocio: NEG3, plan: 'pro', meses: 3 }), JSON.stringify(llamadas('dar')));
 chk('Dar meses: muestra hasta cuándo', /08\/01\/2027/.test(await texto('#sxAvisoTxt')), await texto('#sxAvisoTxt'));
 await p.click('#sxSubs [data-sxa="plan"][data-id="' + NEG1 + '"]');
 await esperar(() => document.getElementById('dlgSxAcc').open);
 await p.selectOption('#sxAccPlan', 'premium'); await p.click('#sxAccGo');
 chk('Cambiar plan: envía el plan nuevo', await esperar(() => !document.getElementById('dlgSxAcc').open) && JSON.stringify((llamadas('cambiar_plan')[0] || {}).body) === JSON.stringify({ negocio: NEG1, plan: 'premium' }));
 await p.click('#sxSubs [data-sxa="cancelar"][data-id="' + NEG3 + '"]');
 await esperar(() => document.getElementById('dlgSxAcc').open);
 await p.fill('#sxAccMotivo', 'Lo pidió el dueño'); await p.click('#sxAccGo');
 chk('Cancelar: envía negocio y motivo', await esperar(() => !document.getElementById('dlgSxAcc').open) && JSON.stringify((llamadas('cancelar')[0] || {}).body) === JSON.stringify({ negocio: NEG3, motivo: 'Lo pidió el dueño' }));
 chk('Cancelar: la tarjeta queda «Cancelada» sin botón de cancelar', await esperar(() => /Cancelada/.test(document.getElementById('sxSubs').textContent) && !document.querySelector('#sxSubs [data-sxa="cancelar"][data-id="33333333-3333-4333-8333-333333333333"]')));

 // Negocios: resumen y detalle (con pagos y eventos)
 await p.click('#sxNav [data-s="negocios"]');
 chk('Negocios: lista con dueño y resumen de datos', await esperar(() => document.querySelectorAll('#sxNegocios .sxc').length === 3) && /ana@correo\.com/.test(await texto('#sxNegocios')) && /120Productos80Inventario14Facturas9Gastos530Ventas/.test(await texto('#sxNegocios')), (await texto('#sxNegocios')).slice(0, 200));
 chk('Negocios: nombre peligroso escapado', (await texto('#sxNegocios')).includes(MALO) && (await p.$$('#sxNegocios img')).length === 0 && await p.evaluate(() => window.__xss === undefined));
 await p.click('#sxNegocios .sxc[data-id="' + NEG1 + '"]');
 chk('Detalle del negocio: pagos, eventos y funciones', await esperar(() => document.getElementById('dlgSxNeg').open && /Pago aprobado/.test(document.getElementById('sxNegCuerpo').textContent)) &&
   /Empezó la prueba gratis/.test(await texto('#sxNegCuerpo')) && /\$59\.900/.test(await texto('#sxNegCuerpo')) && /Varias sedes/.test(await texto('#sxNegCuerpo')) && (await p.$$('#sxNegCuerpo [data-sxa="ver"]')).length === 1);
 chk('Detalle: textos peligrosos escapados', (await p.$$('#sxNegCuerpo img, #sxNegCuerpo i')).length === 0 && await p.evaluate(() => window.__xss === undefined));
 await p.click('#dlgSxNeg [data-cerrar]');

 // Planes
 await p.click('#sxNav [data-s="planes"]');
 chk('Planes: muestra los 3 con precio y estado', (await p.$$('#sxPlanes .sxc')).length === 3 && /\$59\.900/.test(await texto('#sxPlanes')) && /Inactivo/.test(await texto('#sxPlanes')) && await p.evaluate(() => window.__xss === undefined));
 await p.click('#sxPlanes [data-sxa="editarplan"][data-id="free"] .t');
 await esperar(() => document.getElementById('dlgSxPlan').open);
 chk('Plan Gratis: no se puede desactivar ni ponerle precio', await p.evaluate(() => document.getElementById('sxPlAct').disabled && document.getElementById('sxPlPre').disabled));
 await p.click('#dlgSxPlan [data-cerrar]');
 await p.click('#sxPlanes button[data-sxa="editarplan"][data-id="pro"]');
 await esperar(() => document.getElementById('dlgSxPlan').open);
 chk('Editar plan: casillas de funciones marcadas según el plan', await p.evaluate(() => document.querySelector('#sxPlEnts input[value="voice"]').checked && !document.querySelector('#sxPlEnts input[value="multi_branch"]').checked && document.getElementById('sxPlId').disabled));
 await p.fill('#sxPlPre', '64900'); await p.fill('#sxPlNom', 'PRO+');
 await p.uncheck('#sxPlEnts input[value="voice"]'); await p.check('#sxPlEnts input[value="multi_branch"]');
 await p.click('#sxPlGuardar');
 const pg = (llamadas('plan_guardar')[0] || {}).body || {}, pl = pg.plan || {};
 chk('Guardar plan: envía precio, nombre, activo y funciones', await esperar(() => !document.getElementById('dlgSxPlan').open) && pl.id === 'pro' && pl.price === 64900 && pl.name === 'PRO+' && pl.active === true &&
   pl.entitlements.includes('multi_branch') && !pl.entitlements.includes('voice') && pl.entitlements.length === 10, JSON.stringify(pg));
 chk('Guardar plan: la tarjeta queda con el precio nuevo', /\$64\.900/.test(await texto('#sxPlanes')) && /PRO\+/.test(await texto('#sxPlanes')));

 // Configuración
 await p.click('#sxNav [data-s="config"]');
 chk('Configuración: trae lo del servidor', await p.evaluate(() => document.getElementById('sxBeta').checked && document.getElementById('sxPrueba').value === '15' && document.getElementById('sxNequiNum').value === '3000000000'));
 await p.fill('#sxPrueba', '20'); await p.fill('#sxAvisoDias', '5');
 await p.fill('#sxNequiNum', '300 123 4567'); await p.fill('#sxNequiTit', 'Vento SAS');
 await p.fill('#sxDaviNum', '3109876543'); await p.fill('#sxDaviTit', 'Vento SAS'); await p.fill('#sxWa', '3001112233');
 await p.click('#sxCfgGuardar');
 await esperar(() => !document.getElementById('sxCfgGuardar').disabled);
 const cg = ((llamadas('config_guardar')[0] || {}).body || {}).config;
 chk('Guardar config: BETA, prueba, aviso, Nequi/DaviPlata y WhatsApp', JSON.stringify(cg) === JSON.stringify({ beta_mode: true, trial_days: 20, renew_notice_days: 5,
   manual_methods: { NEQUI: { numero: '3001234567', titular: 'Vento SAS' }, DAVIPLATA: { numero: '3109876543', titular: 'Vento SAS' } }, support_whatsapp: '573001112233' }), JSON.stringify(cg));

 // Si el servidor falla al cargar, queda un aviso y 🔄 lo vuelve a intentar
 S.fallar = 'suscripciones'; await p.click('#sxRefrescar');
 chk('Falla al cargar: aviso para reintentar', await esperar(() => !document.getElementById('sxAviso').hidden && document.getElementById('sxAviso').classList.contains('bad') && /intentar otra vez/.test(document.getElementById('sxAvisoTxt').textContent)));
 S.fallar = null; await p.click('#sxRefrescar');
 chk('Reintentar con 🔄: carga y quita el aviso', await esperar(() => document.getElementById('sxAviso').hidden && !document.getElementById('sxRefrescar').disabled));
 // Celular: nada se sale de la pantalla
 chk('Celular: sin desborde horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await p.evaluate(() => document.documentElement.scrollWidth));
 // Las demás pestañas siguen funcionando
 await p.click('#tabs [data-t="clientes"]');
 chk('Las otras pestañas siguen funcionando', await p.evaluate(() => document.querySelector('section[data-tab="clientes"]').classList.contains('on') && !document.querySelector('section[data-tab="subs"]').classList.contains('on')));
 await p.click('#tabs [data-t="subs"]');
 chk('Al volver a 💳 no repite el arranque', await visible('#sxPanel') && llamadas('yo').filter(x => x.auth === 'Bearer TOK-ADMIN').length === 1);
 // Computador
 await p.setViewportSize({ width: 1280, height: 800 }); await p.click('#sxNav [data-s="planes"]'); await p.waitForTimeout(200);
 chk('Computador: las tarjetas van en varias columnas', await p.evaluate(() => { const c = [...document.querySelectorAll('#sxPlanes .sxc')]; return c.length > 1 && c[0].getBoundingClientRect().top === c[1].getBoundingClientRect().top; }));
 // Al recargar vuelve el bloqueo con código personal
 await p.reload(); await p.waitForTimeout(800);
 chk('Al recargar vuelve a pedir el código personal', await visible('#lock'));
 chk('Sin errores', !errs.length, errs.join(' | '));
 console.log('RESULTADO', ok, 'bien', mal, 'mal'); await b.close(); process.exit(mal ? 1 : 0);
})();
