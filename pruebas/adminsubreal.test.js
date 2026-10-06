// Panel de Administrador · 💳 Suscripciones contra el «Supabase local» REAL (PostgreSQL 16 + la Edge Function
// vento-suscripciones de verdad + supabase-js de verdad, servido por el arnés en la URL del CDN).
// Un dueño se registra, crea dos negocios y manda un pago con comprobante en cada uno (POST /pago, como la app).
// Otro usuario se vuelve administrador (fila en platform_admins), entra al panel, ve los pendientes, abre el
// comprobante, aprueba uno (la base queda con la suscripción activa y vencimiento = inicio + 1 mes) y rechaza el
// otro con motivo. El dueño también intenta entrar al panel y el servidor lo frena («no es administradora»).
// El bloqueo con el código personal se OCULTA desde la prueba (#lock.hidden = true): solo protege la llave que firma
// licencias; la seguridad de las suscripciones la hace el servidor.
// Sin PostgreSQL en el equipo se omite (como la prueba «servidor»).
// Capturas opcionales: VENTO_CAPTURAS=<carpeta> guarda pantallazos del panel (celular y computador).
'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
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

// PNG de verdad (se ve en el navegador) de un color: cada color da otra huella del comprobante.
function png(w, h, rgb){
  const T = Array.from({ length: 256 }, (_, n) => { let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for(const x of buf) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const trozo = (tipo, datos) => { const t = Buffer.from(tipo), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(datos.length); c.writeUInt32BE(crc(Buffer.concat([t, datos]))); return Buffer.concat([l, t, datos, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const fila = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w * 3 }, (_, i) => rgb[i % 3]))]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => fila)))), trozo('IEND', Buffer.alloc(0))]);
}
// dd/mm/aaaa en hora de Colombia (UTC−5 todo el año), como las muestra el panel
const fCo = t => { const d = new Date(new Date(t).getTime() - 5 * 3600e3); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear(); };
const hoy = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);

(async () => {
  if(!hayPostgres()){ console.log('RESULTADO 0 bien 0 mal (este equipo no tiene PostgreSQL: se omitió esta prueba)'); process.exit(0); }
  const { iniciar, enrutar } = require('./servidor/supabase-local');
  const BASE = process.env.VENTO_BASE || 'http://localhost:8765';
  const CAP = process.env.VENTO_CAPTURAS || '';
  let ok = 0, mal = 0;
  const chk = (n, c, x) => { if(c){ ok++; console.log('✅ ' + n); } else { mal++; console.log('❌ ' + n + (x !== undefined ? ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 400) : '')); } };
  const sb = await iniciar();
  const b = await chromium.launch();
  try{ await pruebas(); }
  catch(e){ mal++; console.log('❌ La prueba se cayó: ' + (e && e.stack || e)); }
  finally{ await b.close().catch(() => {}); await sb.cerrar().catch(() => {}); }
  console.log('RESULTADO', ok, 'bien', mal, 'mal'); process.exit(mal ? 1 : 0);

  async function pruebas(){
    const F = sb.url + '/functions/v1/vento-suscripciones';
    const cab = tok => ({ apikey: sb.anonKey, 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) });
    const api = async (ruta, cuerpo, tok) => { const r = await fetch(F + ruta, { method: 'POST', headers: cab(tok), body: JSON.stringify(cuerpo || {}) }); return { st: r.status, j: await r.json().catch(() => ({})) }; };
    const rpc = async (fn, args, tok) => { const r = await fetch(sb.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: cab(tok), body: JSON.stringify(args || {}) }); return { st: r.status, j: await r.json().catch(() => null) }; };
    const uno = async (q, p) => (await sb.sql(q, p))[0];

    // ---------- El dueño: registro, dos negocios y un pago con comprobante en cada uno ----------
    let r = await fetch(sb.url + '/auth/v1/signup', { method: 'POST', headers: cab(), body: JSON.stringify({ email: 'dueno@barreal.co', password: 'clave123', data: { nombre: 'Carlos' } }) });
    const s1 = await r.json();
    const dueno = { id: s1.user && s1.user.id, token: s1.access_token };
    chk('Dueño registrado con correo y contraseña', r.status === 200 && !!dueno.token, s1);
    const datos = { products: [{ id: 'p1', name: 'Águila', price: 3300, stock: 20 }, { id: 'p2', name: 'Poker', price: 3300, stock: 5 }, { id: 'p3', name: 'Empanada', price: 2500 }],
      history: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], purchases: [{ id: 'f1' }], contab: [{ id: 'g1', tipo: 'gasto', monto: 5000 }, { id: 'i1', tipo: 'ingreso', monto: 1000 }] };
    const NEG1 = (await rpc('crear_negocio', { p_nombre: 'Bar Real', p_datos: datos, p_nombre_usuario: 'Carlos' }, dueno.token)).j;
    const MALO = '<img src=x onerror="window.__xss=1">Tienda Real';
    const NEG2 = (await rpc('crear_negocio', { p_nombre: MALO, p_datos: {}, p_nombre_usuario: 'Carlos' }, dueno.token)).j;
    chk('Dos negocios creados en la nube', /^[0-9a-f-]{36}$/.test(String(NEG1)) && /^[0-9a-f-]{36}$/.test(String(NEG2)), [NEG1, NEG2]);
    // La app pide el estado al abrir: el primer negocio arranca su prueba gratis
    r = await api('/estado', { negocio: NEG1 }, dueno.token);
    chk('El negocio 1 está en prueba gratis', r.st === 200 && r.j.subscription && r.j.subscription.source === 'trial', r.j);
    const pagar = (neg, n, metodo, ref, color) => api('/pago', { negocio: neg, plan: 'pro', metodo, monto: 59900, referencia: ref, fecha: hoy(), nombre: 'Carlos Pérez', telefono: '3001234567',
      idem: 'idem-real-' + n, comprobante: { base64: png(120, 80, color).toString('base64'), tipo: 'image/png' } }, dueno.token);
    const r1 = await pagar(NEG1, 1, 'NEQUI', 'M-REAL-001', [218, 0, 129]);
    const r2 = await pagar(NEG2, 2, 'DAVIPLATA', 'D-REAL-002', [239, 51, 64]);
    const PAY1 = r1.j.payment && r1.j.payment.id, PAY2 = r2.j.payment && r2.j.payment.id;
    chk('Pagos enviados con comprobante (POST /pago) y en revisión', r1.st === 200 && r2.st === 200 && r1.j.payment.status === 'review' && r2.j.payment.status === 'review', [r1.j, r2.j]);

    // ---------- Otro usuario se vuelve administrador de Vento ----------
    const jefe = await sb.usuario('jefe@vento.co');
    await sb.sql('insert into platform_admins(user_id, email) values ($1, $2)', [jefe.id, jefe.email]);

    // ---------- Navegador: el panel con supabase-js de verdad ----------
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    // Nada de internet: solo este equipo (la página y el arnés). enrutar() va después para que mande sobre esta regla.
    await ctx.route('**/*', rt => { const u = new URL(rt.request().url()); return (u.hostname === 'localhost' || u.hostname === '127.0.0.1') ? rt.continue() : rt.abort(); });
    await enrutar(ctx, sb);
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    const resp = [];
    p.on('response', async x => { const m = /\/functions\/v1\/vento-suscripciones\/admin\/(\w+)/.exec(x.url()); if(m && x.request().method() === 'POST') resp.push({ accion: m[1], st: x.status(), j: await x.json().catch(() => null) }); });
    const texto = sel => p.$eval(sel, e => e.textContent).catch(() => '');
    const esperar = (fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 10000 }).then(() => true, () => false);
    const captura = async nombre => { if(CAP){ fs.mkdirSync(CAP, { recursive: true }); await p.screenshot({ path: path.join(CAP, nombre + '.png'), fullPage: true }); } };

    await p.goto(BASE + '/admin.html'); await p.waitForTimeout(800);
    await p.evaluate(() => { document.getElementById('lock').hidden = true; });
    await p.click('#tabs [data-t="subs"]');
    chk('Pide entrar con la cuenta de Vento Nube (supabase-js real cargado del «CDN»)', await esperar(() => !document.getElementById('sxLogin').hidden) && await p.evaluate(() => !!(window.supabase && window.supabase.createClient)));
    await captura('1-entrar');

    // El dueño (no es admin): el servidor responde 403 «no_admin» y el panel lo dice claro
    await p.fill('#sxCorreo', 'dueno@barreal.co'); await p.fill('#sxClave', 'clave123'); await p.click('#sxEntrar');
    chk('No-admin: el servidor lo frena y se ve «no es administradora»', await esperar(() => !document.getElementById('sxNoAdmin').hidden) &&
      resp.some(x => x.accion === 'yo' && x.st === 403 && x.j && x.j.error === 'no_admin') && /dueno@barreal\.co/.test(await texto('#sxNoAdminCorreo')), resp);
    chk('No-admin: no ve el panel', !(await p.isVisible('#sxPanel')));
    await p.click('#sxOtra');
    await esperar(() => !document.getElementById('sxLogin').hidden);

    // El administrador
    await p.fill('#sxCorreo', 'jefe@vento.co'); await p.fill('#sxClave', 'clave123'); await p.click('#sxEntrar');
    chk('Admin: entra y ve los 2 pagos pendientes', await esperar(() => !document.getElementById('sxPanel').hidden && document.querySelectorAll('#sxPagos .sxc').length === 2),
      await texto('#sxLoginMsg'));
    chk('Admin: el contador dice 2', (await texto('#sxCnt')) === '2' && (await texto('#sxBadge')) === '2');
    const t1 = await p.$eval('#sxPagos .sxc[data-pago="' + PAY1 + '"]', e => e.textContent).catch(() => '');
    chk('Tarjeta del pago: negocio, usuario, plan, valor, método, fecha, referencia, estado', ['Bar Real', 'dueno@barreal.co', 'PRO', '$59.900', 'NEQUI', fCo(Date.now()), 'M-REAL-001', 'Por revisar', 'Carlos Pérez'].every(x => t1.includes(x)), t1);
    const t2 = await p.$eval('#sxPagos .sxc[data-pago="' + PAY2 + '"]', e => e.textContent).catch(() => '');
    chk('Escapado: el nombre con <img onerror> del negocio se ve como texto', t2.includes(MALO) && (await p.$$('#sxPagos img')).length === 0 && await p.evaluate(() => window.__xss === undefined), t2.slice(0, 160));
    await captura('2-pendientes');

    // Ver comprobante (URL firmada por el servidor, 10 minutos)
    await p.click('#sxPagos [data-sxa="ver"][data-id="' + PAY1 + '"]');
    const urlFirmada = sb.url + '/storage/v1/object/sign/comprobantes/' + NEG1 + '/' + PAY1 + '.png?token=';
    chk('Ver comprobante: el visor muestra la foto de verdad (URL firmada)', await esperar(u => { const i = document.getElementById('sxVerImg'); return document.getElementById('dlgSxVer').open && i.src.startsWith(u) && i.naturalWidth === 120; }, urlFirmada),
      await p.$eval('#sxVerImg', i => i.src + ' ' + i.naturalWidth).catch(() => ''));
    chk('Ver comprobante: el servidor devolvió la URL firmada por 10 minutos', resp.some(x => x.accion === 'comprobante' && x.st === 200 && x.j.vence_en === 600));
    await captura('3-comprobante');

    // Aprobar desde el visor: confirma con inicio y vencimiento
    await p.click('#sxVerAprobar');
    await esperar(() => document.getElementById('dlgSxOk').open);
    const desdeUI = await texto('#sxOkDesde'), hastaUI = await texto('#sxOkHasta');
    chk('Aprobar: la confirmación muestra hoy y el vencimiento', desdeUI === fCo(Date.now()) && /^\d{2}\/\d{2}\/\d{4}$/.test(hastaUI), desdeUI + ' / ' + hastaUI);
    await captura('4-aprobar');
    await p.click('#sxOkGo');
    chk('Aprobar: la lista se refresca (queda 1 pendiente)', await esperar(id => document.querySelectorAll('#sxPagos .sxc').length === 1 && !document.querySelector('#sxPagos .sxc[data-pago="' + id + '"]') && !document.getElementById('dlgSxVer').open, PAY1));
    const sub1 = await uno('select status, plan_id, source, start_date, expiry_date, (expiry_date = ((start_date at time zone \'America/Bogota\') + interval \'1 month\') at time zone \'America/Bogota\') as mes, start_date > now() - interval \'5 minutes\' as reciente from subscriptions where business_id = $1', [NEG1]);
    chk('Base de datos: suscripción ACTIVA, plan PRO, pago manual', sub1 && sub1.status === 'active' && sub1.plan_id === 'pro' && sub1.source === 'manual', sub1);
    chk('Base de datos: vence exactamente 1 mes después del inicio (hoy)', sub1 && sub1.mes === true && sub1.reciente === true, sub1);
    chk('Las fechas de la confirmación son las que quedaron en la base', sub1 && fCo(sub1.start_date) === desdeUI && fCo(sub1.expiry_date) === hastaUI, [desdeUI, hastaUI, sub1 && sub1.start_date, sub1 && sub1.expiry_date]);
    const pg1 = await uno('select status, approved_by, period_start, period_end from payment_records where id = $1', [PAY1]);
    chk('Base de datos: pago aprobado por el admin con su período', pg1 && pg1.status === 'approved' && pg1.approved_by === jefe.id && fCo(pg1.period_end) === hastaUI, pg1);
    const av = await texto('#sxAvisoTxt');
    chk('Aprobar: el panel dice hasta cuándo quedó', av.includes(desdeUI) && av.includes(hastaUI) && /Bar Real/.test(av), av);
    r = await api('/estado', { negocio: NEG1 }, dueno.token);
    chk('La app del negocio ya ve PRO pagado', r.st === 200 && r.j.plan_efectivo === 'pro' && r.j.subscription.source === 'manual' && r.j.entitlements.voice === true, r.j);

    // Rechazar el otro con motivo (obligatorio)
    await p.click('#sxPagos [data-sxa="rechazar"][data-id="' + PAY2 + '"]');
    await esperar(() => document.getElementById('dlgSxNo').open);
    await p.click('#sxNoGo'); await p.waitForTimeout(300);
    chk('Rechazar sin motivo: lo pide y no envía nada', /motivo/i.test(await texto('#sxNoErr')) && !resp.some(x => x.accion === 'rechazar'));
    const MOTIVO = 'El valor del comprobante no llegó a la cuenta';
    await p.fill('#sxNoMotivo', MOTIVO); await p.click('#sxNoGo');
    chk('Rechazar: la lista queda vacía', await esperar(() => /No hay pagos por revisar/.test(document.getElementById('sxPagos').textContent)) && !(await p.isVisible('#sxBadge')));
    const pg2 = await uno('select status, reject_reason, rejected_by from payment_records where id = $1', [PAY2]);
    chk('Base de datos: pago rechazado con el motivo y quién lo rechazó', pg2 && pg2.status === 'rejected' && pg2.reject_reason === MOTIVO && pg2.rejected_by === jefe.id, pg2);
    const sub2 = await uno('select status from subscriptions where business_id = $1', [NEG2]);
    chk('Base de datos: la suscripción del negocio 2 queda «rejected» (sin premium)', sub2 && sub2.status === 'rejected', sub2);
    r = await api('/estado', { negocio: NEG2 }, dueno.token);
    chk('La app del negocio 2 ve el motivo del rechazo', r.st === 200 && r.j.last_payment && r.j.last_payment.reject_reason === MOTIVO && r.j.plan_efectivo === 'free', r.j);
    await p.selectOption('#sxPagosEstado', 'all');
    chk('Filtro «Todos»: el aprobado con su período y el rechazado con su motivo', await esperar((m) => { const t = document.getElementById('sxPagos').textContent; return document.querySelectorAll('#sxPagos .sxc').length === 2 && /Aprobado/.test(t) && /Rechazado/.test(t) && t.includes(m); }, MOTIVO));
    await p.selectOption('#sxPagosEstado', 'review');

    // Suscripciones y negocios con los datos reales
    await p.click('#sxNav [data-s="subs"]');
    chk('Suscripciones: Bar Real activa y la otra rechazada', await esperar(() => { const t = document.getElementById('sxSubs').textContent; return document.querySelectorAll('#sxSubs .sxc').length === 2 && /Activa/.test(t) && /Rechazada/.test(t); }), await texto('#sxSubs'));
    await p.click('#sxNav [data-s="negocios"]');
    chk('Negocios: dueño y resumen de datos (3 productos, 2 con inventario, 1 factura, 1 gasto, 4 ventas)', await esperar(() => /3Productos2Inventario1Facturas1Gastos4Ventas/.test(document.getElementById('sxNegocios').textContent)) && /dueno@barreal\.co/.test(await texto('#sxNegocios')), (await texto('#sxNegocios')).slice(0, 300));
    await p.click('#sxNegocios .sxc[data-id="' + NEG1 + '"]');
    chk('Detalle del negocio: pago aprobado e historial', await esperar(() => { const t = document.getElementById('sxNegCuerpo').textContent; return /Pago aprobado/.test(t) && /Empezó la prueba gratis/.test(t) && /Envió un pago/.test(t); }), (await texto('#sxNegCuerpo')).slice(0, 300));
    await captura('5-negocio');
    await p.click('#dlgSxNeg [data-cerrar]');

    // Planes y configuración: lo que se guarda llega a la base
    await p.click('#sxNav [data-s="planes"]');
    await p.click('#sxPlanes button[data-sxa="editarplan"][data-id="pro"]');
    await esperar(() => document.getElementById('dlgSxPlan').open);
    await p.fill('#sxPlPre', '64900'); await p.check('#sxPlEnts input[value="multi_branch"]'); await p.click('#sxPlGuardar');
    await esperar(() => !document.getElementById('dlgSxPlan').open);
    const plan = await uno("select price, (select count(*) from plan_entitlements where plan_id = 'pro' and entitlement_key = 'multi_branch') as sedes from plans where id = 'pro'");
    chk('Guardar plan: precio y funciones quedan en la base', plan && Number(plan.price) === 64900 && Number(plan.sedes) === 1, plan);
    await p.click('#sxNav [data-s="config"]');
    await p.fill('#sxNequiNum', '300 555 1234'); await p.fill('#sxNequiTit', 'Vento SAS'); await p.fill('#sxPrueba', '10');
    await p.click('#sxCfgGuardar');
    await esperar(() => /Última modificación/.test(document.getElementById('sxCfgInfo').textContent) && !document.getElementById('sxCfgGuardar').disabled);
    await p.waitForTimeout(300);
    const cfg = await uno('select trial_days, manual_methods, updated_by from billing_config where id = 1');
    chk('Guardar configuración: Nequi, titular y días de prueba quedan en la base', cfg && cfg.trial_days === 10 && cfg.manual_methods.NEQUI.numero === '3005551234' && cfg.manual_methods.NEQUI.titular === 'Vento SAS' && cfg.updated_by === jefe.id, cfg);

    // Computador
    await p.setViewportSize({ width: 1280, height: 820 }); await p.click('#sxNav [data-s="pagos"]'); await p.selectOption('#sxPagosEstado', 'all');
    await esperar(() => document.querySelectorAll('#sxPagos .sxc').length === 2);
    await captura('6-computador');
    chk('Celular y computador sin desborde horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    chk('Sin errores en la página', !errs.length, errs.join(' | '));
  }
})();
