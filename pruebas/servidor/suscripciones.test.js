// Pruebas del SERVIDOR de suscripciones (Edge Function vento-suscripciones + migración) contra PostgreSQL 16 REAL.
// Corre solo:   node pruebas/servidor/suscripciones.test.js      (o: bash pruebas/correr.sh servidor)
// Crea su propia base desechable (pruebas/servidor/supabase-local.js) y la borra al terminar.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
const { iniciar } = require('./supabase-local');

let ok = 0, mal = 0;
const chk = (n, c, x) => {
  if (c) { ok++; console.log('✅ ' + n); }
  else { mal++; console.log('❌ ' + n + (x !== undefined ? ' → ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500) : '')); }
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// Los registros JSON del servidor ({"t":…,"nivel":…}) se ocultan para que se lea el resultado (VENTO_LOGS=1 los muestra).
if (!process.env.VENTO_LOGS) for (const k of ['log', 'warn', 'error']) {
  const orig = console[k].bind(console);
  console[k] = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('{"t":"')) return; orig(...a); };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hoy = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const ms = (t) => Date.parse(t);
const DIA = 86400e3;

// Fotos de prueba: el servidor revisa el tipo por los primeros bytes (JPEG / PNG / WebP).
const MAGIA = { png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], jpg: [0xff, 0xd8, 0xff, 0xe0], webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50] };
const foto = (semilla, tipo = 'png') => Buffer.concat([Buffer.from(MAGIA[tipo]), crypto.createHash('sha512').update(String(semilla)).digest(), Buffer.alloc(300, 7)]);
const comp = (buf, tipo = 'image/png') => ({ base64: buf.toString('base64'), tipo });

// Verificación INDEPENDIENTE del token (como lo hará la app con la llave pública de GET /clave).
async function verificar(token, jwk) {
  const [c, f, sobra] = String(token || '').split('.');
  if (!c || !f || sobra !== undefined) return null;
  try {
    const k = await crypto.webcrypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const bien = await crypto.webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, Buffer.from(f, 'base64url'), Buffer.from(c));
    return bien ? JSON.parse(Buffer.from(c, 'base64url').toString()) : null;
  } catch (e) { return null; }
}

async function pruebas(sb) {
  const F = sb.url + '/functions/v1/vento-suscripciones';
  const cab = (tok, extra) => ({ apikey: sb.anonKey, 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...(extra || {}) });
  async function api(ruta, cuerpo, tok, extra) {
    const r = await fetch(F + ruta, { method: cuerpo === undefined ? 'GET' : 'POST', headers: cab(tok, extra), body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    return { st: r.status, j: await r.json().catch(() => ({})), h: r.headers };
  }
  async function rest(metodo, ruta, tok, cuerpo, extra) {
    const r = await fetch(sb.url + '/rest/v1/' + ruta, { method: metodo, headers: cab(tok || sb.anonKey, extra), body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    return { st: r.status, j: await r.json().catch(() => null) };
  }
  const rpc = (fn, args, tok) => rest('POST', 'rpc/' + fn, tok, args || {});
  const uno = async (q, p) => (await sb.sql(q, p))[0];
  const contar = async (q, p) => Number((await uno(q, p)).n);
  const eventos = (neg, tipo) => contar('select count(*) n from payment_events where business_id = $1 and type = $2', [neg, tipo]);

  // =========================== Usuarios y negocios ===========================
  let r = await fetch(sb.url + '/auth/v1/signup', { method: 'POST', headers: cab(), body: JSON.stringify({ email: 'Dueno@Bar.co', password: 'clave123', data: { nombre: 'Carlos' } }) });
  const s1 = await r.json();
  chk('Crear usuario (registro con correo y contraseña)', r.status === 200 && s1.access_token && UUID.test(s1.user.id), s1);
  const dueno = { id: s1.user.id, token: s1.access_token };
  const datos = { products: [{ id: 'p1', name: 'Águila', price: 3300, stock: 20 }, { id: 'p2', name: 'Poker', price: 3300 }], history: [{ id: 1 }, { id: 2 }],
    purchases: [{ id: 'f1' }], contab: [{ id: 'g1', tipo: 'gasto', monto: 5000 }, { id: 'i1', tipo: 'ingreso', monto: 1000 }] };
  r = await rpc('crear_negocio', { p_nombre: 'Bar Las Palmas', p_datos: datos, p_nombre_usuario: 'Carlos' }, dueno.token);
  const neg = r.j;
  chk('Crear negocio (queda como dueño)', r.st === 200 && UUID.test(neg), r);
  const cajero = await sb.usuario('cajero@bar.co');
  const cod = (await rpc('crear_invitacion', { p_negocio: neg, p_rol: 'cajero' }, dueno.token)).j;
  r = await rpc('unirse_con_codigo', { p_codigo: cod, p_nombre: 'Luis' }, cajero.token);
  chk('El cajero entra al negocio con un código', r.st === 200 && r.j === neg, r);
  const otro = await sb.usuario('otro@tienda.co');
  const neg2 = (await rpc('crear_negocio', { p_nombre: 'Tienda Don Pepe', p_datos: {} }, otro.token)).j;
  const curioso = await sb.usuario('curioso@x.co');
  const jefe = await sb.usuario('jefe@vento.co');
  const jefe2 = await sb.usuario('jefe2@vento.co', 'clave123', {}, false);   // correo SIN confirmar
  chk('Segundo negocio de otro dueño', UUID.test(neg2), neg2);

  // =========================== Catálogo ===========================
  r = await api('/salud');
  chk('GET /salud', r.st === 200 && r.j.ok && r.j.servicio === 'vento-suscripciones', r.j);
  r = await api('/planes');
  const ids = (r.j.planes || []).map((p) => p.id);
  const pro = (r.j.planes || []).find((p) => p.id === 'pro') || {};
  chk('GET /planes: solo planes activos (Gratis y PRO) con precio del servidor', r.st === 200 && ids.join() === 'free,pro' && pro.price === 59900, ids);
  chk('…PRO trae voz, cámara IA y OCR; Gratis no', pro.entitlements.includes('voice') && pro.entitlements.includes('ai_camera') && pro.entitlements.includes('ocr') &&
    !r.j.planes[0].entitlements.includes('voice'), r.j.planes);
  chk('…beta: el único medio de pago es el manual (Nequi/DaviPlata)', r.j.config.beta_mode === true && JSON.stringify(r.j.proveedores) === '["manual"]', r.j.proveedores);
  r = await rest('GET', 'plans?select=id,price&order=sort', null);
  chk('Sin sesión se puede leer el catálogo de planes (público)', r.st === 200 && r.j.length === 4, r);

  // =========================== Prueba gratis ===========================
  r = await api('/estado', { negocio: neg }, dueno.token);
  let e = r.j;
  chk('Prueba gratis automática: PRO activo por 15 días', r.st === 200 && e.subscription && e.subscription.source === 'trial' && e.subscription.status === 'active' &&
    e.plan_efectivo === 'pro' && e.subscription.dias_restantes === 15 && e.rol === 'dueno', e);
  chk('…con las funciones PRO encendidas (voz, cámara IA)', e.entitlements && e.entitlements.voice === true && e.entitlements.ai_camera === true && e.entitlements.multi_branch === false, e.entitlements);
  chk('…evento trial_started (una sola vez)', await eventos(neg, 'trial_started') === 1);
  await api('/estado', { negocio: neg }, dueno.token);
  chk('Consultar otra vez no crea otra suscripción ni otra prueba', await contar('select count(*) n from subscriptions where business_id = $1', [neg]) === 1 && await eventos(neg, 'trial_started') === 1);

  // Lanzamiento: un negocio que ya usaba Vento (creado hace 40 días) NO queda en Gratis al actualizar:
  // su prueba se cuenta desde el inicio de la beta (billing_config.trial_desde).
  const viejo = await sb.usuario('viejo@bar.co');
  const negViejo = (await rpc('crear_negocio', { p_nombre: 'Bar Antiguo', p_datos: {} }, viejo.token)).j;
  await sb.sql("update negocios set creado_en = now() - interval '40 days' where id = $1", [negViejo]);
  r = await api('/estado', { negocio: negViejo }, viejo.token);
  chk('Lanzamiento: negocio antiguo conserva la prueba de 15 días desde el inicio de la beta', r.st === 200 && r.j.plan_efectivo === 'pro' &&
    r.j.subscription.status === 'active' && r.j.subscription.dias_restantes === 15, r.j.subscription);
  const negViejo2 = (await rpc('crear_negocio', { p_nombre: 'Bar Antiguo 2', p_datos: {} }, viejo.token)).j;
  await sb.sql("update negocios set creado_en = now() - interval '40 days' where id = $1", [negViejo2]);
  const tdAntes = (await uno('select trial_desde from billing_config where id = 1')).trial_desde;
  await sb.sql("update billing_config set trial_desde = now() - interval '20 days' where id = 1");
  r = await api('/estado', { negocio: negViejo2 }, viejo.token);
  chk('…y si la beta empezó hace 20 días, esa prueba ya venció (plan Gratis)', r.st === 200 && r.j.plan_efectivo === 'free' && r.j.subscription.status === 'expired', r.j.subscription);
  await sb.sql('update billing_config set trial_desde = $1 where id = 1', [tdAntes]);

  // Una sola prueba gratis por DUEÑO: «subir otra vez el negocio a la nube» ya no regala otros 15 días de PRO.
  const negDos = (await rpc('crear_negocio', { p_nombre: 'Bar Las Palmas 2', p_datos: datos }, dueno.token)).j;
  r = await api('/estado', { negocio: negDos }, dueno.token);
  chk('Una sola prueba por dueño: su segundo negocio arranca en Gratis (sin otros 15 días de PRO)', r.st === 200 && r.j.plan_efectivo === 'free' &&
    r.j.subscription && r.j.subscription.status === 'expired' && r.j.entitlements.voice === false && r.j.entitlements.pos_basic === true, r.j.subscription);
  chk('…y queda anotado que ya había tenido prueba', await contar("select count(*) n from payment_events where business_id = $1 and type = 'trial_started' and (data->>'ya_tuvo_prueba')::boolean", [negDos]) === 1);
  r = await api('/estado', { negocio: neg }, dueno.token);
  chk('…su primer negocio sigue con su prueba PRO', r.j.plan_efectivo === 'pro' && r.j.subscription.source === 'trial', r.j.subscription);

  // =========================== Token firmado ===========================
  const clave = (await api('/clave')).j;
  chk('GET /clave: llave pública ES256 (JWK P-256)', clave.ok && clave.alg === 'ES256' && clave.jwk && clave.jwk.crv === 'P-256' && clave.jwk.x && !clave.jwk.d, clave);
  let c = await verificar(e.token, clave.jwk);
  chk('El token del estado verifica con la llave pública', !!c && c.t === 'vento-sub' && c.n === neg && c.p === 'pro' && c.s === 'active' && c.k === clave.kid, c);
  chk('…lleva las funciones activas y vence a más tardar en 72 h', c && c.e.includes('voice') && c.h <= c.i + 72 * 3600e3 && c.h > Date.now() && c.v === ms(e.subscription.expiry_date), c);
  const [cuerpoTok, firmaTok] = e.token.split('.');
  const falso = Buffer.from(JSON.stringify({ ...c, p: 'premium', h: Date.now() + 9e9 })).toString('base64url') + '.' + firmaTok;
  chk('Un token ALTERADO (plan cambiado) no verifica', await verificar(falso, clave.jwk) === null);
  const firmaMala = cuerpoTok + '.' + (firmaTok[0] === 'A' ? 'B' : 'A') + firmaTok.slice(1);
  chk('Un token con la firma alterada no verifica', await verificar(firmaMala, clave.jwk) === null);
  const ajena = await crypto.webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const firmaAjena = Buffer.from(await crypto.webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ajena.privateKey, Buffer.from(cuerpoTok))).toString('base64url');
  chk('Un token firmado con otra llave no verifica', await verificar(cuerpoTok + '.' + firmaAjena, clave.jwk) === null);
  chk('La llave privada queda solo en el servidor (servidor_config, sin acceso de afuera)',
    !!(await uno("select valor->'privada'->>'d' d from servidor_config where clave = 'sub_firma'")).d && (await rest('GET', 'servidor_config?select=*', dueno.token)).st >= 400);

  // =========================== Roles ===========================
  r = await api('/estado', { negocio: neg }, cajero.token);
  chk('El cajero ve el plan (rol cajero) pero nada de los cobros de Vento', r.st === 200 && r.j.rol === 'cajero' && r.j.plan_efectivo === 'pro' && r.j.pending_payment === null && r.j.last_payment === null, r.j);
  r = await api('/estado', { negocio: neg }, otro.token);
  chk('Un miembro de OTRO negocio no ve nada (403)', r.st === 403 && r.j.error === 'sin_permiso', r);
  r = await api('/estado', { negocio: neg });
  chk('Sin sesión no hay estado (401)', r.st === 401 && r.j.error === 'sin_sesion', r);
  const base = { negocio: neg, plan: 'pro', metodo: 'NEQUI', monto: 59900, referencia: 'M1234567', fecha: hoy(), nombre: 'Carlos Pérez', telefono: '300 123 4567' };
  r = await api('/pago', { ...base, idem: 'caj-1', comprobante: comp(foto('caj')) }, cajero.token);
  chk('El cajero NO puede pagar (403)', r.st === 403 && r.j.error === 'sin_permiso', r);
  r = await api('/pago', { ...base, idem: 'cur-1', comprobante: comp(foto('cur')) }, curioso.token);
  chk('Alguien de afuera no puede pagar por el negocio (403)', r.st === 403, r);

  // =========================== Vencimiento perezoso de la prueba ===========================
  await sb.sql("update subscriptions set expiry_date = now() - interval '1 minute' where business_id = $1", [neg]);
  r = await api('/estado', { negocio: neg }, dueno.token);
  e = r.j;
  chk('Vencimiento: al consultar, la prueba pasa a «expired» y queda en Gratis', e.subscription.status === 'expired' && e.plan_efectivo === 'free', e.subscription);
  chk('…sin funciones PRO (voz apagada) pero se puede vender', e.entitlements.voice === false && e.entitlements.pos_basic === true, e.entitlements);
  chk('…evento subscription_expired', await eventos(neg, 'subscription_expired') === 1);
  c = await verificar(e.token, clave.jwk);
  chk('…el token dice Gratis (v = 0, válido 72 h)', c && c.p === 'free' && c.v === 0 && c.h === c.i + 72 * 3600e3, c);

  // =========================== Validaciones del pago ===========================
  const pagar = (extra, tok = dueno.token) => api('/pago', { ...base, ...extra }, tok);
  r = await pagar({ idem: 'v1' });
  chk('Pago sin comprobante → comprobante_invalido', r.st === 400 && r.j.error === 'comprobante_invalido', r);
  r = await pagar({ idem: 'v2', comprobante: comp(Buffer.from('hola, esto no es una foto '.repeat(20))) });
  chk('Comprobante que no es imagen → comprobante_invalido', r.st === 400 && r.j.error === 'comprobante_invalido', r);
  r = await pagar({ idem: 'v3', comprobante: comp(Buffer.concat([Buffer.from(MAGIA.jpg), Buffer.alloc(3 * 1024 * 1024)])) });
  chk('Comprobante de más de 3 MB → comprobante_invalido', r.st === 400 && r.j.error === 'comprobante_invalido' && /3 MB/.test(r.j.mensaje), r.j);
  r = await pagar({ idem: 'v4', plan: 'free', comprobante: comp(foto('v4')) });
  chk('El plan Gratis no se puede comprar → plan_invalido', r.st === 400 && r.j.error === 'plan_invalido', r);
  r = await pagar({ idem: 'v5', plan: 'premium', comprobante: comp(foto('v5')) });
  chk('Un plan inactivo (Premium) no se puede comprar', r.st === 400 && r.j.error === 'plan_invalido', r);
  r = await pagar({ idem: 'v6', monto: 30000, comprobante: comp(foto('v6')) });
  chk('Monto menor que el precio → monto_insuficiente', r.st === 400 && r.j.error === 'monto_insuficiente', r);
  r = await pagar({ idem: 'v7', monto: 0, comprobante: comp(foto('v7')) });
  chk('Monto 0 → monto_invalido', r.st === 400 && r.j.error === 'monto_invalido', r);
  r = await pagar({ idem: 'v8', metodo: 'BANCOLOMBIA', comprobante: comp(foto('v8')) });
  chk('Método distinto de Nequi/DaviPlata → metodo_invalido', r.st === 400 && r.j.error === 'metodo_invalido', r);
  r = await pagar({ idem: 'v9', proveedor: 'google_play', purchaseToken: 'x', comprobante: comp(foto('v9')) });
  chk('Google Play no se ofrece en la beta', r.st === 400 && r.j.error === 'proveedor_no_disponible', r);
  chk('Ningún intento inválido dejó pagos ni fotos sueltas', await contar('select count(*) n from payment_records') === 0 && sb.objetos.size === 0, sb.objetos.size);

  sb.fallos.storage = 2;
  r = await pagar({ idem: 'st-1', comprobante: comp(foto('st')) });
  chk('Si Storage falla, el pago NO se crea (nunca queda un pago sin comprobante)', r.st === 502 && r.j.error === 'almacen' && await contar('select count(*) n from payment_records') === 0, r);
  sb.fallos.storage = 1;
  r = await pagar({ idem: 'st-2', referencia: 'ST-RETRY', comprobante: comp(foto('st2')) });
  const pagoReintento = r.j.payment;
  chk('…y si falla una sola vez, el servidor reintenta y el pago entra', r.st === 200 && pagoReintento && pagoReintento.status === 'review', r);
  // Se rechaza para seguir con el flujo normal.
  r = await api('/admin/rechazar', { payment: pagoReintento && pagoReintento.id, motivo: 'Prueba de reintento' }, jefe.token);
  chk('(el administrador rechaza ese pago de prueba)', r.st === 200 && r.j.payment.status === 'rejected', r);

  // =========================== Pago Nequi con comprobante ===========================
  const fotoA = foto('A');
  r = await pagar({ idem: 'idem-1', comprobante: comp(fotoA) });
  const p1 = r.j.payment || {};
  chk('Pago Nequi con comprobante → queda «en revisión»', r.st === 200 && p1.status === 'review' && r.j.repetido === false && p1.kind === 'new' && p1.method === 'NEQUI', r.j);
  chk('…la referencia se guarda limpia y el teléfono solo con números', p1.reference === 'M1234567' && p1.payer_phone === '3001234567', p1);
  chk('Pago en revisión NO activa PRO (sigue en Gratis)', r.j.estado && r.j.estado.plan_efectivo === 'free' && r.j.estado.subscription.status === 'payment_review' &&
    r.j.estado.entitlements.voice === false && r.j.estado.pending_payment && r.j.estado.pending_payment.id === p1.id, r.j.estado);
  const prueba = await uno('select storage_path, mime, sha256, size_bytes from payment_proofs where payment_id = $1', [p1.id]);
  chk('El comprobante quedó en el bucket privado: comprobantes/{negocio}/{pago}.png', prueba && prueba.storage_path === neg + '/' + p1.id + '.png' &&
    sb.objetos.has('comprobantes/' + neg + '/' + p1.id + '.png') && prueba.mime === 'image/png', prueba);
  chk('…con su huella sha256', prueba && prueba.sha256 === crypto.createHash('sha256').update(fotoA).digest('hex') && prueba.size_bytes === fotoA.length, prueba);
  chk('…y el evento payment_submitted', await eventos(neg, 'payment_submitted') === 2);

  r = await pagar({ idem: 'idem-1', comprobante: comp(fotoA) });
  chk('Pago duplicado con la misma idem → devuelve el MISMO pago', r.st === 200 && r.j.repetido === true && r.j.payment.id === p1.id, r.j);
  chk('…no se creó otro pago ni quedó otra foto', await contar("select count(*) n from payment_records where business_id = $1 and status = 'review'", [neg]) === 1 &&
    [...sb.objetos.keys()].filter((k) => k.includes(neg)).length === 2, [...sb.objetos.keys()]);
  r = await pagar({ idem: 'idem-otro', referencia: 'OTRA-1', comprobante: comp(foto('B')) });
  chk('Otro pago mientras uno está en revisión → pago_en_revision', r.st === 409 && r.j.error === 'pago_en_revision', r);

  // =========================== Administración ===========================
  r = await api('/admin/yo', {}, curioso.token);
  chk('Un usuario cualquiera no es administrador (403)', r.st === 403 && r.j.error === 'no_admin', r);
  r = await api('/admin/aprobar', { payment: p1.id }, dueno.token);
  chk('El dueño NO puede aprobar su propio pago (no es admin de Vento)', r.st === 403 && r.j.error === 'no_admin', r);
  r = await rpc('srv_sub_aprobar', { p_payment: p1.id, p_admin: dueno.id }, dueno.token);
  chk('Nadie puede llamar srv_sub_aprobar directo con su sesión (solo el servidor)', r.st === 403 && /permission denied/.test(r.j.message), r);
  r = await api('/admin/yo', {}, jefe2.token);
  chk('Correo de administrador SIN confirmar no entra al panel', r.st === 403 && r.j.error === 'correo_sin_confirmar', r);
  r = await api('/admin/yo', {}, jefe.token);
  chk('Administrador por VENTO_ADMIN_EMAILS entra y queda en platform_admins', r.st === 200 && r.j.admin === true &&
    await contar('select count(*) n from platform_admins where user_id = $1', [jefe.id]) === 1, r);
  r = await api('/admin/pagos', { status: 'review' }, jefe.token);
  const fila = (r.j.pagos || []).find((x) => x.id === p1.id) || {};
  chk('El admin ve el pago pendiente con negocio, usuario, plan y comprobante', r.st === 200 && fila.negocio === 'Bar Las Palmas' && fila.usuario_email === 'dueno@bar.co' &&
    fila.plan_id === 'pro' && fila.amount === 59900 && fila.method === 'NEQUI' && fila.comprobante === true && fila.reference === 'M1234567', fila);
  chk('…y ve de antemano el inicio y el vencimiento que resultarían (+1 mes)', fila.aprobar_desde && fila.aprobar_hasta &&
    Math.abs(ms(fila.aprobar_desde) - Date.now()) < 120e3 && ms(fila.aprobar_hasta) - ms(fila.aprobar_desde) >= 28 * DIA, fila);
  r = await api('/admin/comprobante', { payment: p1.id }, jefe.token);
  const vista = r.j.url ? await fetch(r.j.url) : null;
  const bytesVista = vista ? Buffer.from(await vista.arrayBuffer()) : Buffer.alloc(0);
  chk('Ver comprobante: URL firmada (10 min) que entrega la misma foto', r.st === 200 && vista && vista.status === 200 && bytesVista.equals(fotoA) && r.j.mime === 'image/png' && r.j.vence_en === 600, r.j);
  const sinFirma = await fetch(sb.url + '/storage/v1/object/comprobantes/' + prueba.storage_path, { headers: cab(dueno.token) });
  chk('…sin la firma del servidor la foto no se puede bajar (bucket privado)', sinFirma.status >= 400, sinFirma.status);
  const alterada = r.j.url ? await fetch(r.j.url.replace(p1.id, '00000000-0000-0000-0000-000000000000')) : { status: 0 };
  chk('…y la firma no sirve para otra foto', alterada.status >= 400, alterada.status);
  r = await api('/admin/negocios', {}, jefe.token);
  const nf = (r.j.negocios || []).find((x) => x.id === neg) || {};
  chk('Panel de negocios: dueño y resumen (productos, inventario, compras, gastos, ventas)', r.st === 200 && nf.dueno_email === 'dueno@bar.co' && nf.miembros === 2 &&
    nf.resumen && nf.resumen.productos === 2 && nf.resumen.inventario === 1 && nf.resumen.compras === 1 && nf.resumen.gastos === 1 && nf.resumen.ventas === 2, nf);
  r = await api('/admin/negocio', { negocio: neg }, jefe.token);
  chk('Detalle del negocio: miembros, pagos y eventos', r.st === 200 && r.j.miembros.length === 2 && r.j.pagos.length === 2 && r.j.eventos.some((x) => x.type === 'payment_submitted'), r.j);

  // ----- Aprobación concurrente (dos administradores a la vez) -----
  const [a1, a2] = await Promise.all([api('/admin/aprobar', { payment: p1.id }, jefe.token), api('/admin/aprobar', { payment: p1.id }, jefe.token)]);
  chk('Dos aprobaciones a la vez del mismo pago → ambas responden bien', a1.st === 200 && a2.st === 200, [a1, a2]);
  chk('…pero UNA sola activación (una dice repetido)', [a1.j.repetido, a2.j.repetido].sort().join() === 'false,true' &&
    await eventos(neg, 'subscription_activated') === 1 && await eventos(neg, 'payment_approved') === 1, [a1.j.repetido, a2.j.repetido]);
  const sus = await uno('select status, source, plan_id, start_date, expiry_date, sub_sumar_meses(start_date, 1) as mas_un_mes from subscriptions where business_id = $1', [neg]);
  chk('Aprobado: PRO activo, inicio HOY', sus.status === 'active' && sus.source === 'manual' && sus.plan_id === 'pro' && Math.abs(ms(sus.start_date) - Date.now()) < 120e3, sus);
  chk('…y vence exactamente un mes después', sus.expiry_date === sus.mas_un_mes, sus);
  const pAprob = await uno('select status, approved_by, period_start, period_end from payment_records where id = $1', [p1.id]);
  chk('…el pago queda aprobado con su período', pAprob.status === 'approved' && pAprob.approved_by === jefe.id && pAprob.period_start === sus.start_date && pAprob.period_end === sus.expiry_date, pAprob);
  chk('…y queda en la auditoría', await contar("select count(*) n from auditoria where negocio_id = $1 and accion = 'suscripcion_pago_aprobado'", [neg]) === 1);
  const f1 = await uno("select sub_sumar_meses(timestamptz '2026-10-05 10:00-05', 1) = timestamptz '2026-11-05 10:00-05' a, sub_sumar_meses(timestamptz '2026-01-31 10:00-05', 1) = timestamptz '2026-02-28 10:00-05' b");
  chk('Fechas con interval \'1 month\': 05/10/2026 → 05/11/2026 y 31/01 → 28/02', f1.a === true && f1.b === true, f1);

  r = await api('/estado', { negocio: neg }, dueno.token);
  e = r.j;
  chk('Estado: Plan PRO activo con sus funciones', e.plan_efectivo === 'pro' && e.subscription.status === 'active' && e.subscription.trial === false &&
    ['voice', 'ocr', 'ai_camera', 'advanced_reports', 'invoices', 'employee_management', 'pos_basic'].every((k) => e.entitlements[k] === true) && e.entitlements.multi_branch === false, e);
  chk('…sin pago pendiente; el último pago aparece aprobado; sin aviso de renovación todavía', e.pending_payment === null && e.last_payment.status === 'approved' && e.renew_notice === false, e);
  c = await verificar(e.token, clave.jwk);
  chk('…token con plan PRO y vencimiento real', c && c.p === 'pro' && c.v === ms(e.subscription.expiry_date) && c.h === Math.min(c.v, c.i + 72 * 3600e3), c);

  // ----- Otro celular / otra sesión del mismo usuario -----
  r = await fetch(sb.url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: cab(), body: JSON.stringify({ email: 'dueno@bar.co', password: 'clave123' }) });
  const s2 = await r.json();
  const r2 = await api('/estado', { negocio: neg }, s2.access_token);
  chk('Otro celular (otra sesión del mismo usuario) recupera la suscripción', r.status === 200 && s2.access_token !== dueno.token && r2.st === 200 &&
    r2.j.subscription.id === e.subscription.id && r2.j.plan_efectivo === 'pro', r2.j);
  r = await fetch(sb.url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: cab(), body: JSON.stringify({ email: 'dueno@bar.co', password: 'mala' }) });
  chk('Contraseña equivocada no entra', r.status === 400);
  r = await fetch(sb.url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: cab(), body: JSON.stringify({ email: 'jefe2@vento.co', password: 'clave123' }) });
  chk('Correo sin confirmar no entra («Email not confirmed», como Supabase)', r.status === 400 && /Email not confirmed/.test((await r.json()).msg));

  // =========================== Renovación ===========================
  await sb.sql("update subscriptions set expiry_date = now() + interval '3 days' where business_id = $1", [neg]);
  r = await api('/estado', { negocio: neg }, dueno.token);
  chk('Aviso de renovación cuando faltan ≤ 7 días', r.j.renew_notice === true && r.j.subscription.dias_restantes === 3, r.j);
  chk('…el cajero no ve el aviso de renovación', (await api('/estado', { negocio: neg }, cajero.token)).j.renew_notice === false);
  const venciaAntes = (await uno('select expiry_date, start_date from subscriptions where business_id = $1', [neg]));
  r = await pagar({ idem: 'idem-2', referencia: 'M7654321', comprobante: comp(foto('R')) });
  const p2 = r.j.payment || {};
  chk('Pago de renovación: tipo renewal y el plan sigue activo mientras se revisa', r.st === 200 && p2.kind === 'renewal' && r.j.estado.plan_efectivo === 'pro' && r.j.estado.subscription.status === 'active', r.j);
  // Dos conexiones independientes: la primera aprueba y NO confirma; la segunda queda esperando el bloqueo.
  const c1 = new Client({ connectionString: sb.pgUrl }), c2 = new Client({ connectionString: sb.pgUrl });
  await c1.connect(); await c2.connect();
  await c1.query('begin');
  const x1 = (await c1.query('select srv_sub_aprobar($1, $2) r', [p2.id, jefe.id])).rows[0].r;
  let termino = false;
  const prom2 = c2.query('select srv_sub_aprobar($1, $2) r', [p2.id, jefe.id]).then((q) => { termino = true; return q.rows[0].r; });
  await esperar(400);
  chk('Bloqueo: la segunda aprobación espera a que termine la primera', termino === false);
  await c1.query('commit');
  const x2 = await prom2;
  await c1.end(); await c2.end();
  chk('…y al soltar el bloqueo ve que ya estaba aprobado (repetido, sin activar dos veces)', x1.repetido === false && x2.repetido === true && await eventos(neg, 'subscription_renewed') === 1, [x1.repetido, x2.repetido]);
  const susR = await uno('select expiry_date, start_date, sub_sumar_meses($2::timestamptz, 1) as esperado from subscriptions where business_id = $1', [neg, venciaAntes.expiry_date]);
  chk('Renovación: el mes nuevo se SUMA al vencimiento actual (no a hoy)', susR.expiry_date === susR.esperado && susR.start_date === venciaAntes.start_date, { susR, venciaAntes });
  const p2db = await uno('select period_start, period_end from payment_records where id = $1', [p2.id]);
  chk('…el período del pago empieza donde vencía el anterior', p2db.period_start === venciaAntes.expiry_date && p2db.period_end === susR.expiry_date, p2db);

  // =========================== Duplicados entre negocios ===========================
  const base2 = { ...base, negocio: neg2, metodo: 'NEQUI' };
  r = await api('/pago', { ...base2, idem: 'o-1', referencia: 'M1234567', comprobante: comp(foto('O1')) }, otro.token);
  chk('Misma referencia de otro pago (de otro negocio) → bloqueado', r.st === 409 && r.j.error === 'referencia_usada', r);
  r = await api('/pago', { ...base2, idem: 'o-2', referencia: 'm 1234 567', comprobante: comp(foto('O2')) }, otro.token);
  chk('…aunque la escriban con minúsculas y espacios', r.st === 409 && r.j.error === 'referencia_usada', r);
  r = await api('/pago', { ...base2, idem: 'o-3', referencia: 'NUEVA-1', comprobante: comp(fotoA) }, otro.token);
  chk('Mismo comprobante (misma foto) → bloqueado', r.st === 409 && r.j.error === 'comprobante_repetido', r);
  chk('…cada intento queda registrado como duplicate_blocked y no crea pagos', await eventos(neg2, 'duplicate_blocked') === 3 &&
    await contar('select count(*) n from payment_records where business_id = $1', [neg2]) === 0 && ![...sb.objetos.keys()].some((k) => k.includes(neg2)));
  r = await api('/pago', { ...base2, idem: 'o-4', metodo: 'DAVIPLATA', referencia: 'M1234567', comprobante: comp(foto('O4')) }, otro.token);
  chk('La misma referencia en OTRO método (DaviPlata) sí se acepta', r.st === 200 && r.j.payment.method === 'DAVIPLATA', r);
  const pOtro = r.j.payment || {};

  // =========================== Rechazo ===========================
  r = await api('/admin/rechazar', { payment: pOtro.id, motivo: '  ' }, jefe.token);
  chk('Rechazar sin motivo → motivo_invalido', r.st === 400 && r.j.error === 'motivo_invalido', r);
  r = await api('/admin/rechazar', { payment: pOtro.id, motivo: 'x'.repeat(201) }, jefe.token);
  chk('Motivo de más de 200 caracteres → motivo_invalido', r.st === 400 && r.j.error === 'motivo_invalido', r);
  r = await api('/admin/rechazar', { payment: pOtro.id, motivo: 'El valor no aparece en la cuenta de Vento' }, jefe.token);
  chk('Rechazo con motivo', r.st === 200 && r.j.payment.status === 'rejected' && r.j.payment.reject_reason === 'El valor no aparece en la cuenta de Vento', r.j);
  r = await api('/estado', { negocio: neg2 }, otro.token);
  // neg2 pagó antes de consultar su estado: la suscripción nació «en revisión» (sin prueba) y el rechazo la deja «rejected».
  chk('Rechazo: la suscripción queda «rejected», en Gratis, y el dueño ve el motivo', r.j.subscription && r.j.subscription.status === 'rejected' && r.j.plan_efectivo === 'free' &&
    r.j.last_payment && r.j.last_payment.status === 'rejected' && r.j.last_payment.reject_reason === 'El valor no aparece en la cuenta de Vento' && r.j.pending_payment === null, r.j);
  r = await api('/admin/aprobar', { payment: pOtro.id }, jefe.token);
  chk('Un pago rechazado ya no se puede aprobar → estado_invalido', r.st === 409 && r.j.error === 'estado_invalido', r);
  r = await api('/pago', { ...base2, idem: 'o-5', metodo: 'DAVIPLATA', referencia: 'M1234567', comprobante: comp(foto('O5')) }, otro.token);
  chk('Enviar otro comprobante después del rechazo (con la misma referencia) se puede', r.st === 200 && r.j.estado.subscription.status === 'payment_review', r.j);
  const pOtro2 = r.j.payment || {};
  r = await api('/admin/rechazar', { payment: pOtro2.id, motivo: 'Comprobante ilegible' }, jefe.token);
  r = await api('/estado', { negocio: neg2 }, otro.token);
  chk('Rechazo: la suscripción queda «rejected» con el motivo y en Gratis', r.j.subscription.status === 'rejected' && r.j.plan_efectivo === 'free' && r.j.last_payment.reject_reason === 'Comprobante ilegible', r.j);
  chk('…evento payment_rejected', await eventos(neg2, 'payment_rejected') === 2);

  // =========================== Dar meses, cambiar plan, cancelar ===========================
  r = await api('/admin/dar', { negocio: neg2, plan: 'pro', meses: 2 }, jefe.token);
  const susD = await uno('select status, source, plan_id, expiry_date, sub_sumar_meses(start_date, 2) as dos from subscriptions where business_id = $1', [neg2]);
  chk('Dar 2 meses de cortesía: PRO activo (source admin) hasta +2 meses', r.st === 200 && susD.status === 'active' && susD.source === 'admin' && susD.expiry_date === susD.dos, { r: r.j, susD });
  r = await api('/admin/dar', { negocio: neg2, plan: 'pro', meses: 99 }, jefe.token);
  chk('Dar 99 meses → meses_invalido', r.st === 400 && r.j.error === 'meses_invalido', r);
  r = await api('/admin/dar', { negocio: neg2, plan: 'pro', meses: 1 }, curioso.token);
  chk('Un no-admin no puede dar meses', r.st === 403, r);
  const antesCambio = await uno('select expiry_date from subscriptions where business_id = $1', [neg]);
  r = await api('/admin/cambiar_plan', { negocio: neg, plan: 'premium' }, jefe.token);
  e = (await api('/estado', { negocio: neg }, dueno.token)).j;
  chk('Cambiar plan (a Premium) conserva las fechas y enciende varias sedes', r.st === 200 && r.j.subscription.plan_id === 'premium' && e.subscription.expiry_date === antesCambio.expiry_date &&
    e.entitlements.multi_branch === true && await eventos(neg, 'plan_changed') >= 1, { r: r.j, e: e.entitlements });
  await api('/admin/cambiar_plan', { negocio: neg, plan: 'pro' }, jefe.token);
  r = await api('/admin/cancelar', { negocio: neg2, motivo: 'Lo pidió el cliente' }, jefe.token);
  e = (await api('/estado', { negocio: neg2 }, otro.token)).j;
  chk('Cancelar: queda «canceled» y sin funciones PRO', r.st === 200 && e.subscription.status === 'canceled' && e.plan_efectivo === 'free' && e.entitlements.voice === false &&
    await eventos(neg2, 'subscription_canceled') === 1, e);
  r = await api('/admin/suscripciones', {}, jefe.token);
  chk('Panel de suscripciones lista ambos negocios con su plan efectivo', r.st === 200 && r.j.suscripciones.some((x) => x.business_id === neg && x.plan_efectivo === 'pro') &&
    r.j.suscripciones.some((x) => x.business_id === neg2 && x.status === 'canceled'), r.j);

  // =========================== Cron /vencer ===========================
  await sb.sql("update subscriptions set expiry_date = now() - interval '1 minute' where business_id = $1", [neg]);
  r = await api('/vencer', {});
  chk('/vencer sin la cabecera del cron → 401', r.st === 401, r);
  r = await api('/vencer', {}, null, { 'x-vento-cron': 'adivinando' });
  chk('/vencer con un secreto equivocado → 401', r.st === 401, r);
  r = await api('/vencer', {}, null, { 'x-vento-cron': sb.cron });
  const stCron = await uno('select status from subscriptions where business_id = $1', [neg]);
  chk('Cron /vencer vence las suscripciones con fecha pasada', r.st === 200 && r.j.vencidas >= 1 && stCron.status === 'expired', { r: r.j, stCron });
  e = (await api('/estado', { negocio: neg }, dueno.token)).j;
  chk('…y el negocio queda en Gratis', e.plan_efectivo === 'free' && e.entitlements.voice === false && e.entitlements.pos_basic === true, e.entitlements);

  // =========================== Planes y configuración del administrador ===========================
  r = await api('/admin/planes', {}, jefe.token);
  chk('El admin ve TODOS los planes (también inactivos), el catálogo y la configuración', r.st === 200 && r.j.planes.length === 4 && r.j.entitlements.length === 11 && r.j.config.trial_days === 15, r.j);
  const entsPro = ['pos_basic', 'inventory', 'tables', 'expenses', 'invoices', 'ocr', 'ai_camera', 'voice', 'employee_management'];
  r = await api('/admin/plan_guardar', { plan: { id: 'pro', price: 64900, name: 'PRO', entitlements: entsPro } }, jefe.token);
  chk('Guardar plan PRO con precio nuevo y funciones', r.st === 200 && r.j.plan.price === 64900 && !r.j.plan.entitlements.includes('advanced_reports'), r.j);
  r = await api('/planes');
  const pro2 = r.j.planes.find((p) => p.id === 'pro');
  chk('…/planes refleja el precio y las funciones nuevas', pro2.price === 64900 && pro2.entitlements.length === entsPro.length, pro2);
  r = await api('/admin/plan_guardar', { plan: { id: 'free', active: false } }, jefe.token);
  chk('El plan Gratis no se puede desactivar', r.st === 400 && r.j.error === 'free_siempre_activo', r);
  r = await api('/admin/plan_guardar', { plan: { id: 'pro', entitlements: ['volar'] } }, jefe.token);
  chk('Una función inventada → entitlement_invalido', r.st === 400 && r.j.error === 'entitlement_invalido', r);
  r = await api('/admin/plan_guardar', { plan: { id: 'pro', price: 0 } }, jefe.token);
  chk('Un plan de pago con precio 0 → precio_invalido', r.st === 400 && r.j.error === 'precio_invalido', r);
  r = await api('/admin/plan_guardar', { plan: { id: 'basic', active: true } }, jefe.token);
  chk('Activar el plan Básico lo muestra en /planes', r.st === 200 && (await api('/planes')).j.planes.map((p) => p.id).join() === 'free,basic,pro', r.j);
  r = await api('/admin/plan_guardar', { plan: { id: 'pro', price: 1 } }, dueno.token);
  chk('Un no-admin no puede cambiar precios', r.st === 403, r);
  r = await api('/admin/config_guardar', { config: { manual_methods: { NEQUI: { numero: '300 123 4567', titular: 'Vento SAS' } }, trial_days: 10, renew_notice_days: 5, support_whatsapp: '+57 300 000 0000' } }, jefe.token);
  chk('Guardar configuración del cobro', r.st === 200 && r.j.config.trial_days === 10, r.j);
  r = await api('/planes');
  chk('…/planes muestra el número de Nequi, el titular, los días de prueba y el WhatsApp', r.j.config.manual_methods.NEQUI.numero === '3001234567' && r.j.config.manual_methods.NEQUI.titular === 'Vento SAS' &&
    r.j.config.manual_methods.DAVIPLATA.numero === '' && r.j.config.trial_days === 10 && r.j.config.renew_notice_days === 5 && r.j.config.support_whatsapp === '573000000000', r.j.config);
  r = await api('/admin/config_guardar', { config: { trial_days: 'mucho' } }, jefe.token);
  chk('Configuración inválida → config_invalida', r.st === 400 && r.j.error === 'config_invalida', r);
  const tercero = await sb.usuario('tercero@x.co');
  const neg3 = (await rpc('crear_negocio', { p_nombre: 'Panadería', p_datos: {} }, tercero.token)).j;
  e = (await api('/estado', { negocio: neg3 }, tercero.token)).j;
  chk('Negocio nuevo usa los días de prueba configurados (10)', e.subscription.dias_restantes === 10 && e.plan_efectivo === 'pro', e.subscription);
  r = await api('/pago', { ...base, negocio: neg3, idem: 't-1', referencia: 'T-1', comprobante: comp(foto('T1')) }, tercero.token);
  chk('Con el precio nuevo, pagar el valor viejo → monto_insuficiente', r.st === 400 && r.j.error === 'monto_insuficiente', r);

  // =========================== RLS y permisos directos ===========================
  r = await rest('GET', 'subscriptions?select=id,status,plan_id&business_id=eq.' + neg, dueno.token);
  chk('El dueño puede LEER su suscripción', r.st === 200 && r.j.length === 1, r);
  r = await rest('GET', 'subscriptions?select=id&business_id=eq.' + neg, otro.token);
  chk('Otro dueño no ve la suscripción ajena (RLS → [])', r.st === 200 && r.j.length === 0, r);
  r = await rest('GET', 'payment_records?select=id,reference', cajero.token);
  chk('El cajero no ve los pagos de Vento (RLS → [])', r.st === 200 && r.j.length === 0, r);
  r = await rest('POST', 'subscriptions', dueno.token, { business_id: neg3, plan_id: 'premium', status: 'active', source: 'admin', expiry_date: '2030-01-01T00:00:00Z' });
  chk('Un usuario NO puede insertar suscripciones directo', r.st === 403 || r.st === 401, r);
  r = await rest('PATCH', 'subscriptions?business_id=eq.' + neg, dueno.token, { status: 'active', plan_id: 'premium', expiry_date: '2030-01-01T00:00:00Z' });
  const sigue = await uno('select status, plan_id from subscriptions where business_id = $1', [neg]);
  chk('Un usuario NO puede ponerse PRO actualizando su suscripción', (r.st === 403 || r.st === 401) && sigue.status === 'expired' && sigue.plan_id === 'pro', { r, sigue });
  r = await rest('POST', 'payment_records', dueno.token, { business_id: neg, plan_id: 'pro', method: 'NEQUI', amount: 59900, status: 'approved' });
  chk('Un usuario NO puede insertar pagos aprobados directo', r.st === 403 || r.st === 401, r);
  r = await rest('PATCH', 'payment_records?id=eq.' + p1.id, dueno.token, { status: 'review' });
  chk('Un usuario NO puede cambiar el estado de un pago', (r.st === 403 || r.st === 401) && (await uno('select status from payment_records where id = $1', [p1.id])).status === 'approved', r);
  r = await rest('DELETE', 'payment_records?id=eq.' + p1.id, dueno.token);
  chk('Un usuario NO puede borrar pagos', (r.st === 403 || r.st === 401) && await contar('select count(*) n from payment_records where id = $1', [p1.id]) === 1, r);
  let fugas = [];
  for (const t of ['subscriptions', 'payment_records', 'payment_proofs', 'payment_events', 'billing_config', 'platform_admins', 'servidor_config']) {
    const x = await rest('GET', t + '?select=*', null);
    if (x.st === 200 && Array.isArray(x.j) && x.j.length) fugas.push(t);
    if (x.st === 200 && t !== 'subscriptions' && t !== 'payment_records') fugas.push(t + ' (200)');
  }
  chk('Sin sesión (anon) no se lee nada privado', fugas.length === 0, fugas);
  fugas = [];
  for (const t of ['payment_proofs', 'payment_events', 'billing_config', 'platform_admins']) {
    const x = await rest('GET', t + '?select=*', dueno.token);
    if (x.st === 200 && Array.isArray(x.j) && x.j.length) fugas.push(t);
  }
  chk('Con sesión tampoco se leen comprobantes, eventos, configuración ni administradores', fugas.length === 0, fugas);
  r = await rpc('srv_sub_dar', { p_negocio: neg, p_plan: 'premium', p_meses: 12, p_admin: dueno.id }, dueno.token);
  chk('Ninguna función srv_* se puede llamar con sesión de usuario', r.st === 403, r);
  r = await rpc('sub_yo', {}, null);
  chk('anon no puede llamar funciones de sesión (sub_yo)', r.st === 401, r);
  r = await rpc('sub_catalogo', {}, null);
  chk('anon sí puede leer el catálogo (sub_catalogo)', r.st === 200 && Array.isArray(r.j.planes), r);
  r = await rpc('negocio_tiene', { p_negocio: neg3, p_ent: 'voice' }, tercero.token);
  const r3 = await rpc('negocio_tiene', { p_negocio: neg3, p_ent: 'voice' }, dueno.token);
  const r4 = await rpc('negocio_tiene', { p_negocio: neg, p_ent: 'pos_basic' }, dueno.token);
  chk('negocio_tiene: responde por el plan propio y no revela el de otros', r.j === true && r3.j === false && r4.j === true, [r.j, r3.j, r4.j]);

  // =========================== Google Play (futuro) y CORS ===========================
  r = await api('/google-play/rtdn', { message: { data: 'e30=' } });
  chk('POST /google-play/rtdn → 501 no_implementado', r.st === 501 && r.j.error === 'no_implementado', r);
  let o = await fetch(F + '/estado', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8765', 'Access-Control-Request-Method': 'POST' } });
  chk('CORS permite la app (localhost)', o.status === 204 && o.headers.get('access-control-allow-origin') === 'http://localhost:8765');
  o = await fetch(F + '/estado', { method: 'OPTIONS', headers: { Origin: 'https://sitio-malo.example', 'Access-Control-Request-Method': 'POST' } });
  chk('CORS bloquea otros sitios', !o.headers.get('access-control-allow-origin'));
  r = await api('/estado', { negocio: 'no-es-un-id' }, dueno.token);
  chk('Negocio inválido → 400', r.st === 400 && r.j.error === 'falta_negocio', r);

  // =========================== supabase-js contra el arnés (lo que usarán las pruebas del navegador) ===========================
  const { createClient } = require('@supabase/supabase-js');
  const js = createClient(sb.url, sb.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const reg = await js.auth.signUp({ email: 'js@x.co', password: 'clave123', options: { data: { nombre: 'JS' } } });
  const nJs = await js.rpc('crear_negocio', { p_nombre: 'Café JS', p_datos: { products: [] } });
  const dJs = await js.from('datos_negocio').select('datos,version').eq('negocio_id', nJs.data).single();
  const mJs = await js.from('miembros').select('usuario_id,rol,nombre,email').eq('negocio_id', nJs.data).order('creado_en');
  const fJs = await js.functions.invoke('vento-suscripciones/estado', { body: { negocio: nJs.data } });
  chk('supabase-js: registro, rpc, select().eq().single(), order() y functions.invoke funcionan contra el arnés',
    !reg.error && reg.data.session && !nJs.error && UUID.test(nJs.data) && !dJs.error && dJs.data.version === 1 && !mJs.error && mJs.data[0].rol === 'dueno' &&
    !fJs.error && fJs.data.plan_efectivo === 'pro', { reg: reg.error, nJs, dJs, mJs: mJs.error, fJs: fJs.error || fJs.data && fJs.data.plan_efectivo });
  const ent = await js.auth.signInWithPassword({ email: 'js@x.co', password: 'clave123' });
  const malo = await js.auth.signInWithPassword({ email: 'js@x.co', password: 'otra' });
  chk('supabase-js: entrar con contraseña y error claro si es incorrecta', !ent.error && ent.data.session && malo.error && /Invalid login credentials/.test(malo.error.message), malo.error && malo.error.message);

  // =========================== La migración se puede volver a correr ===========================
  let errMig = null;
  try { await sb.sql(fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261005000000_suscripciones.sql'), 'utf8')); } catch (x) { errMig = x.message; }
  const tras = await uno("select (select price from plans where id = 'pro') precio, (select count(*) from plans) planes, (select trial_days from billing_config) dias, (select count(*) from billing_config) filas, (select count(*) from plan_entitlements where plan_id = 'pro') ents");
  chk('La migración se vuelve a correr sin errores y sin pisar lo que cambió el admin', !errMig && tras.precio === 64900 && tras.planes === 4 && tras.dias === 10 && tras.filas === 1 && tras.ents === entsPro.length, { errMig, tras });
  chk('Una sola suscripción por negocio (índice único)', await contar('select count(*) n from (select business_id from subscriptions group by 1 having count(*) > 1) x') === 0);
}

(async () => {
  let sb = null;
  try {
    sb = await iniciar({ env: { VENTO_ADMIN_EMAILS: 'jefe@vento.co, jefe2@vento.co' } });
    console.log('ℹ️ Base de prueba ' + sb.base + ' (' + sb.migraciones.length + ' archivos SQL aplicados)');
    await pruebas(sb);
  } catch (e) {
    mal++; console.log('❌ Error inesperado → ' + (e && e.stack || e));
  } finally {
    if (sb) await sb.cerrar().catch(() => {});
  }
  console.log('RESULTADO', ok, 'bien', mal, 'mal');
  process.exit(mal ? 1 : 0);
})();
