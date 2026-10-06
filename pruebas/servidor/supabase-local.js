/* =====================================================================
   Supabase LOCAL para las pruebas de Vento: PostgreSQL 16 REAL + un servidor HTTP que imita lo que usan
   la app (supabase-js) y las Edge Functions:
     /auth/v1/signup · /auth/v1/token?grant_type=password|refresh_token · /auth/v1/user · /auth/v1/logout · /auth/v1/settings
     /rest/v1/rpc/<función>          (transacción con el rol y request.jwt.claims del JWT, como PostgREST)
     /rest/v1/<tabla>                (GET select/eq/order/limit; POST/PATCH/DELETE simples → RLS y permisos reales)
     /storage/v1/object/...          (subir, firmar, bajar, borrar; en memoria; respeta el bucket de la base)
     /functions/v1/vento-pagos/*     → manejar(req, env) de supabase/functions/vento-pagos/app.ts
     /functions/v1/vento-suscripciones/* → manejar(req, env) de supabase/functions/vento-suscripciones/app.ts
   Cada proceso crea su PROPIA base desechable (vento_test_<pid>_<azar>) con pruebas/servidor/stub.sql + TODAS las
   migraciones de supabase/migrations en orden, y la borra al cerrar. Varias pruebas pueden correr a la vez.
   Uso:
     const { iniciar } = require('./servidor/supabase-local');
     const sb = await iniciar();            // { url, anonKey, serviceKey, sql(q, params), usuario(email), cerrar() … }
     node pruebas/servidor/supabase-local.js [puerto]     → lo deja corriendo (Ctrl+C lo apaga y borra la base)
   PostgreSQL: VENTO_PG_URL (por defecto postgres://postgres:postgres@127.0.0.1:5432/postgres). Si no está prendido
   lo prende (service postgresql start); si es root y la clave del usuario postgres no sirve, le pone 'postgres'.
   ===================================================================== */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');
const { Client, Pool, types } = require('pg');

const RAIZ = path.resolve(__dirname, '..', '..');
const MIGRACIONES = path.join(RAIZ, 'supabase', 'migrations');
const STUB = path.join(__dirname, 'stub.sql');
const FUNCIONES = {
  'vento-pagos': path.join(RAIZ, 'supabase', 'functions', 'vento-pagos', 'app.ts'),
  'vento-suscripciones': path.join(RAIZ, 'supabase', 'functions', 'vento-suscripciones', 'app.ts'),
};
const PG_URL = process.env.VENTO_PG_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres';

// Tipos como los entrega PostgREST: bigint/numeric como número y fechas como texto ISO.
const iso = (v) => v == null ? v : String(v).replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
types.setTypeParser(20, (v) => v == null ? null : Number(v));
types.setTypeParser(1700, (v) => v == null ? null : Number(v));
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1114, iso);
types.setTypeParser(1184, iso);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const esRoot = () => typeof process.getuid === 'function' && process.getuid() === 0;
const ORIGEN_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const IDENT = /^[a-z_][a-z0-9_]*$/i;
const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';

// ---------- JWT HS256 ----------
function firmarJwt(payload, secreto) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return h + '.' + p + '.' + crypto.createHmac('sha256', secreto).update(h + '.' + p).digest('base64url');
}
function leerJwt(tok, secreto) {
  const [h, p, s] = String(tok || '').split('.');
  const mal = (m) => Object.assign(new Error(m), { code: 'PGRST301', status: 401 });
  if (!h || !p || !s) throw mal('JWT invalid: no tiene tres partes');
  const esperado = crypto.createHmac('sha256', secreto).update(h + '.' + p).digest('base64url');
  if (esperado.length !== s.length || !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(s))) throw mal('JWT invalid: firma');
  const c = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (c.exp && c.exp * 1000 < Date.now()) throw mal('JWT expired');
  return c;
}

// ---------- PostgreSQL ----------
function prenderPostgres() {
  const cmd = esRoot() ? 'service postgresql start' : 'sudo -n service postgresql start';
  try { execSync(cmd, { stdio: 'ignore', timeout: 30000 }); } catch (e) { /* se ve al reintentar */ }
}
function ponerClavePostgres() {
  console.error('[supabase-local] La clave del usuario postgres no sirve: se le pone «postgres» (solo pruebas locales).');
  execSync(`su postgres -c "psql -qc \\"alter user postgres password 'postgres'\\""`, { stdio: 'ignore', timeout: 20000 });
}
async function conectar(url) {
  let prendido = false, clave = false, ultimo = null;
  for (let i = 0; i < 40; i++) {
    const c = new Client({ connectionString: url });
    try { await c.connect(); return c; } catch (e) {
      ultimo = e; try { await c.end(); } catch (x) { /* nada */ }
      if (/ECONNREFUSED|ENOENT|starting up/i.test(e.code + ' ' + e.message)) {
        if (!prendido) { prendido = true; prenderPostgres(); }
        await esperar(500); continue;
      }
      if ((e.code === '28P01' || /password/i.test(e.message)) && !clave && !process.env.VENTO_PG_URL && esRoot()) {
        clave = true; try { ponerClavePostgres(); } catch (x) { /* se reporta abajo */ } continue;
      }
      break;
    }
  }
  throw new Error('No se pudo conectar a PostgreSQL (' + (ultimo && ultimo.message) + '). Prende PostgreSQL 16 o define VENTO_PG_URL.');
}
function procesoVivo(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

async function crearBase(admin, nombre) {
  // Limpia bases de pruebas anteriores cuyo proceso ya no existe.
  const viejas = await admin.query("select datname from pg_database where datname ~ '^vento_test_[0-9]+_'");
  for (const { datname } of viejas.rows) {
    const pid = Number(datname.split('_')[2]);
    if (pid && pid !== process.pid && !procesoVivo(pid)) await admin.query('drop database if exists ' + q(datname) + ' with (force)').catch(() => {});
  }
  await admin.query('create database ' + q(nombre));
}

async function aplicarEsquema(url) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const archivos = [STUB].concat(fs.readdirSync(MIGRACIONES).filter((f) => f.endsWith('.sql')).sort().map((f) => path.join(MIGRACIONES, f)));
    for (const f of archivos) {
      try { await c.query(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error('Falló ' + path.relative(RAIZ, f) + ': ' + e.message); }
    }
    return archivos.map((f) => path.relative(RAIZ, f));
  } finally { await c.end(); }
}

// ---------- Servidor ----------
async function iniciar(opts = {}) {
  const secreto = opts.jwtSecret || 'vento-prueba-' + crypto.randomBytes(16).toString('hex');
  const ahora = Math.floor(Date.now() / 1000), diezAnios = ahora + 10 * 365 * 86400;
  const anonKey = firmarJwt({ iss: 'supabase-local', role: 'anon', iat: ahora, exp: diezAnios }, secreto);
  const serviceKey = firmarJwt({ iss: 'supabase-local', role: 'service_role', iat: ahora, exp: diezAnios }, secreto);
  const cron = opts.cron || 'cron-de-prueba-' + crypto.randomBytes(6).toString('hex');
  const env = opts.env || {};                       // se puede cambiar en vivo (sb.env.VENTO_ADMIN_EMAILS = …)
  const fallos = { storage: 0 };                    // sb.fallos.storage = n → las próximas n subidas fallan (503)
  const objetos = new Map();                        // 'bucket/ruta' → { bytes, mime }
  const refrescos = new Map();                      // refresh_token → id del usuario
  const modulos = {};

  const admin = await conectar(PG_URL);
  const nombre = opts.base || ('vento_test_' + process.pid + '_' + crypto.randomBytes(3).toString('hex'));
  await crearBase(admin, nombre);
  const urlBase = new URL(PG_URL); urlBase.pathname = '/' + nombre;
  let aplicadas;
  try { aplicadas = await aplicarEsquema(urlBase.toString()); } catch (e) {
    await admin.query('drop database if exists ' + q(nombre) + ' with (force)').catch(() => {}); await admin.end(); throw e;
  }
  const pool = new Pool({ connectionString: urlBase.toString(), max: opts.conexiones || 12 });
  pool.on('error', () => {});
  const sql = async (texto, params) => (await pool.query(texto, params)).rows;

  // ----- quién llama -----
  function quien(req) {
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || String(req.headers.apikey || '');
    if (!auth) return { rol: 'anon', claims: { role: 'anon' } };
    const c = leerJwt(auth, secreto);
    const rol = ['anon', 'authenticated', 'service_role'].includes(c.role) ? c.role : 'anon';
    return { rol, claims: c };
  }
  async function enTransaccion(rol, claims, fn) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('role', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.jwt.claim.sub', $3, true), set_config('request.jwt.claim.role', $1, true)",
        [rol, JSON.stringify(claims || {}), (claims && claims.sub) || '']);
      const r = await fn(c);
      await c.query('commit');
      return r;
    } catch (e) { try { await c.query('rollback'); } catch (x) { /* nada */ } throw e; } finally { c.release(); }
  }

  // ----- usuarios (auth) -----
  const usuarioPub = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, phone: '', email_confirmed_at: u.email_confirmed_at,
    confirmed_at: u.email_confirmed_at, last_sign_in_at: u.last_sign_in_at, app_metadata: u.raw_app_meta_data || {}, user_metadata: u.raw_user_meta_data || {},
    identities: [], created_at: u.created_at, updated_at: u.updated_at, is_anonymous: false });
  function sesionDe(u) {
    const t = Math.floor(Date.now() / 1000);
    const access = firmarJwt({ aud: 'authenticated', exp: t + 3600, iat: t, iss: url + '/auth/v1', sub: u.id, email: u.email, phone: '',
      app_metadata: u.raw_app_meta_data || {}, user_metadata: u.raw_user_meta_data || {}, role: 'authenticated', aal: 'aal1',
      amr: [{ method: 'password', timestamp: t }], session_id: crypto.randomUUID(), is_anonymous: false }, secreto);
    const refresh = crypto.randomBytes(18).toString('hex'); refrescos.set(refresh, u.id);
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: t + 3600, refresh_token: refresh, user: usuarioPub(u) };
  }
  async function crearUsuario(email, clave, meta, confirmado = true) {
    const r = await sql(`insert into auth.users(email, encrypted_password, email_confirmed_at, raw_user_meta_data)
      values (lower($1), extensions.crypt($2, extensions.gen_salt('bf', 4)), case when $4 then now() end, coalesce($3::jsonb, '{}'::jsonb)) returning *`,
      [String(email).trim(), String(clave), JSON.stringify(meta || {}), !!confirmado]);
    return r[0];
  }
  // Devuelve el usuario, null si la clave no sirve, o lanza «Email not confirmed» (como GoTrue).
  async function entrarConClave(email, clave) {
    const r = await sql(`select * from auth.users where lower(email) = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)`,
      [String(email || '').trim(), String(clave || '')]);
    if (!r[0]) return null;
    if (!r[0].email_confirmed_at) throw errAuth(400, 'email_not_confirmed', 'Email not confirmed');
    return (await sql('update auth.users set last_sign_in_at = now() where id = $1 returning *', [r[0].id]))[0];
  }

  // ----- RPC (como PostgREST) -----
  const firmas = new Map();
  async function firmaDe(fn) {
    if (firmas.has(fn)) return firmas.get(fn);
    const r = await sql(`select p.proretset as retset, p.pronargs as nargs, p.pronargdefaults as ndef, coalesce(p.proargnames, '{}') as nombres,
        coalesce(p.proargmodes::text[], '{}') as modos, array(select format_type(x.t, null) from unnest(p.proargtypes::oid[]) with ordinality x(t, i) order by x.i) as tipos,
        t.typname as ret, t.typtype as rettipo
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
      where n.nspname = 'public' and p.proname = $1`, [fn]);
    const l = r.map((x) => {
      const nombresIn = x.modos.length ? x.nombres.filter((_, i) => ['i', 'b', 'v'].includes(x.modos[i])) : x.nombres.slice(0, x.nargs);
      return { retset: x.retset, ndef: x.ndef, vacia: x.ret === 'void', args: x.tipos.map((tipo, i) => ({ nombre: nombresIn[i], tipo })),
        filas: x.ret === 'record' || x.rettipo === 'c' || x.modos.some((m) => m === 't' || m === 'o') };
    });
    firmas.set(fn, l);
    return l;
  }
  function valorPara(v, tipo) {
    if (v === undefined || v === null) return null;
    if (/^jsonb?$/.test(tipo)) return JSON.stringify(v);
    if (typeof v === 'object' && !Array.isArray(v)) return JSON.stringify(v);
    return v;
  }
  async function rpc(fn, args, rol, claims) {
    if (!IDENT.test(fn)) throw Object.assign(new Error('Función inválida'), { code: 'PGRST202', status: 404 });
    const llaves = Object.keys(args || {});
    const opciones = await firmaDe(fn);
    const f = opciones.find((o) => llaves.every((k) => o.args.some((a) => a.nombre === k)) &&
      o.args.slice(0, o.args.length - o.ndef).every((a) => llaves.includes(a.nombre)));
    if (!f) throw Object.assign(new Error('Could not find the function public.' + fn + '(' + llaves.join(', ') + ') in the schema cache'), { code: 'PGRST202', status: 404 });
    const valores = [], partes = llaves.map((k) => {
      const a = f.args.find((x) => x.nombre === k);
      valores.push(valorPara(args[k], a.tipo));
      return q(k) + ' => $' + valores.length + '::' + a.tipo;
    });
    const llamada = 'public.' + q(fn) + '(' + partes.join(', ') + ')';
    return enTransaccion(rol, claims, async (c) => {
      if (f.retset) {
        const r = await c.query('select * from ' + llamada, valores);
        return f.filas ? r.rows : r.rows.map((x) => x[r.fields[0].name]);
      }
      if (f.filas) { const r = await c.query('select * from ' + llamada, valores); return r.rows[0] || null; }
      const r = await c.query('select ' + llamada + ' as r', valores);
      return f.vacia || !r.rows[0] ? null : r.rows[0].r;
    });
  }

  // ----- Tablas (GET/POST/PATCH/DELETE simples) -----
  const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' };
  function filtros(u, valores) {
    const w = [];
    for (const [k, v] of u.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue;
      if (!IDENT.test(k)) throw Object.assign(new Error('Columna inválida: ' + k), { code: 'PGRST100', status: 400 });
      const m = /^(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/s.exec(v);
      if (!m) throw Object.assign(new Error('Filtro no soportado: ' + k + '=' + v), { code: 'PGRST100', status: 400 });
      const col = '_t.' + q(k);
      let cond;
      if (m[2] === 'is') {
        const x = m[3].toLowerCase(); if (!['null', 'true', 'false'].includes(x)) throw Object.assign(new Error('is inválido'), { code: 'PGRST100', status: 400 });
        cond = col + ' is ' + x;
      } else if (m[2] === 'in') {
        const lista = m[3].replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
        valores.push(lista); cond = col + '::text = any($' + valores.length + '::text[])';
      } else { valores.push(/like$/.test(m[2]) ? m[3].replace(/\*/g, '%') : m[3]); cond = col + ' ' + OPS[m[2]] + ' $' + valores.length; }
      w.push(m[1] ? 'not (' + cond + ')' : cond);
    }
    return w.length ? ' where ' + w.join(' and ') : '';
  }
  function columnas(sel) {
    const s = String(sel || '*').trim();
    if (s === '*') return '_t.*';
    const l = s.split(',').map((x) => x.trim()).filter(Boolean);
    if (!l.every((x) => IDENT.test(x))) throw Object.assign(new Error('select no soportado: ' + s), { code: 'PGRST100', status: 400 });
    return l.map((x) => '_t.' + q(x)).join(', ');
  }
  async function tabla(req, u, nombreT, cuerpo, rol, claims) {
    if (!IDENT.test(nombreT)) throw Object.assign(new Error('Tabla inválida'), { code: '42P01', status: 404 });
    const T = 'public.' + q(nombreT), valores = [];
    // Como PostgREST: RETURNING solo con «Prefer: return=representation» (en PostgreSQL también exige permiso de lectura).
    const devolver = /return=representation/.test(String(req.headers.prefer || '')), ret = devolver ? ' returning _t.*' : '';
    if (req.method === 'GET' || req.method === 'HEAD') {
      let s = 'select ' + columnas(u.searchParams.get('select')) + ' from ' + T + ' as _t' + filtros(u, valores);
      const orden = u.searchParams.get('order');
      if (orden) s += ' order by ' + orden.split(',').map((o) => {
        const [c, ...mods] = o.split('.');
        if (!IDENT.test(c)) throw Object.assign(new Error('order inválido'), { code: 'PGRST100', status: 400 });
        return '_t.' + q(c) + (mods.includes('desc') ? ' desc' : ' asc') + (mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : '');
      }).join(', ');
      const lim = Number(u.searchParams.get('limit')), off = Number(u.searchParams.get('offset'));
      if (lim >= 0 && u.searchParams.has('limit')) s += ' limit ' + Math.floor(lim);
      if (off > 0) s += ' offset ' + Math.floor(off);
      return { status: 200, filas: await enTransaccion(rol, claims, async (c) => (await c.query(s, valores)).rows) };
    }
    if (req.method === 'POST') {
      const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo || {}];
      const cols = Object.keys(filas[0] || {});
      if (!cols.length || !cols.every((x) => IDENT.test(x))) throw Object.assign(new Error('Columnas inválidas'), { code: 'PGRST100', status: 400 });
      const lista = cols.map(q).join(', ');
      valores.push(JSON.stringify(filas));
      const s = 'insert into ' + T + ' as _t (' + lista + ') select ' + lista + ' from jsonb_populate_recordset(null::' + T + ', $1::jsonb)' + ret;
      const r = await enTransaccion(rol, claims, async (c) => (await c.query(s, valores)).rows);
      return { status: 201, filas: devolver ? r : null };
    }
    if (req.method === 'PATCH') {
      const cols = Object.keys(cuerpo || {});
      if (!cols.length || !cols.every((x) => IDENT.test(x))) throw Object.assign(new Error('Columnas inválidas'), { code: 'PGRST100', status: 400 });
      valores.push(JSON.stringify(cuerpo));
      const s = 'update ' + T + ' as _t set ' + cols.map((x) => q(x) + ' = _r.' + q(x)).join(', ') + ' from jsonb_populate_record(null::' + T + ', $1::jsonb) as _r' +
        filtros(u, valores) + ret;
      const r = await enTransaccion(rol, claims, async (c) => (await c.query(s, valores)).rows);
      return { status: devolver ? 200 : 204, filas: devolver ? r : null };
    }
    if (req.method === 'DELETE') {
      const s = 'delete from ' + T + ' as _t' + filtros(u, valores) + ret;
      const r = await enTransaccion(rol, claims, async (c) => (await c.query(s, valores)).rows);
      return { status: devolver ? 200 : 204, filas: devolver ? r : null };
    }
    throw Object.assign(new Error('Método no soportado'), { code: 'PGRST100', status: 405 });
  }

  // ----- Storage (en memoria) -----
  async function bucket(id) { return (await sql('select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = $1', [id]))[0] || null; }
  const errSt = (status, error, message) => Object.assign(new Error(message), { storage: true, status, error });
  async function storage(req, u, cuerpoBuf, rol) {
    const p = u.pathname.replace(/^\/storage\/v1/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const servicio = rol === 'service_role';
    if (p[0] === 'bucket' && req.method === 'GET') {
      if (!servicio) throw errSt(403, 'Unauthorized', 'Solo el servidor');
      return { json: await sql('select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id') };
    }
    if (p[0] !== 'object') throw errSt(404, 'not_found', 'Ruta de Storage no soportada');
    if (p[1] === 'sign' && req.method === 'POST') {
      if (!servicio) throw errSt(403, 'Unauthorized', 'new row violates row-level security policy');
      const ruta = p.slice(2).join('/');
      if (!objetos.has(ruta)) throw errSt(404, 'not_found', 'Object not found');
      const b = JSON.parse(cuerpoBuf.toString() || '{}');
      const tok = firmarJwt({ url: ruta, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + (Number(b.expiresIn) || 60) }, secreto);
      return { json: { signedURL: '/object/sign/' + p.slice(2).map(encodeURIComponent).join('/') + '?token=' + tok } };
    }
    if (p[1] === 'sign' && req.method === 'GET') {
      const ruta = p.slice(2).join('/');
      let c; try { c = leerJwt(u.searchParams.get('token'), secreto); } catch (e) { throw errSt(400, 'InvalidJWT', e.message); }
      if (c.url !== ruta) throw errSt(400, 'InvalidSignature', 'La firma no es de este objeto');
      const o = objetos.get(ruta); if (!o) throw errSt(404, 'not_found', 'Object not found');
      return { bytes: o.bytes, mime: o.mime };
    }
    if (req.method === 'GET' && (p[1] === 'public' || p[1] === 'authenticated' || p.length >= 3)) {
      const desde = p[1] === 'public' || p[1] === 'authenticated' ? 2 : 1, ruta = p.slice(desde).join('/');
      const bk = await bucket(p[desde]);
      if (!bk) throw errSt(404, 'Bucket not found', 'Bucket not found');
      if (!(servicio || (p[1] === 'public' && bk.public))) throw errSt(400, 'not_found', 'Object not found');
      const o = objetos.get(ruta); if (!o) throw errSt(404, 'not_found', 'Object not found');
      return { bytes: o.bytes, mime: o.mime };
    }
    if (req.method === 'DELETE') {
      if (!servicio) throw errSt(403, 'Unauthorized', 'Solo el servidor');
      const lista = p.length === 2 ? (JSON.parse(cuerpoBuf.toString() || '{}').prefixes || []).map((x) => p[1] + '/' + x) : [p.slice(1).join('/')];
      const borrados = [];
      for (const ruta of lista) if (objetos.delete(ruta)) { borrados.push({ name: ruta.split('/').slice(1).join('/'), bucket_id: p[1] }); await sql('delete from storage.objects where bucket_id = $1 and name = $2', [p[1], ruta.split('/').slice(1).join('/')]); }
      return { json: borrados };
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      if (!servicio) throw errSt(403, 'Unauthorized', 'new row violates row-level security policy');
      if (fallos.storage > 0) { fallos.storage--; throw errSt(503, 'ServiceUnavailable', 'Storage simuló una falla'); }
      const bk = await bucket(p[1]);
      if (!bk) throw errSt(404, 'Bucket not found', 'Bucket not found');
      const nombreO = p.slice(2).join('/'), ruta = p[1] + '/' + nombreO;
      const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0];
      if (bk.file_size_limit && cuerpoBuf.length > bk.file_size_limit) throw errSt(413, 'Payload too large', 'The object exceeded the maximum allowed size');
      if (bk.allowed_mime_types && bk.allowed_mime_types.length && !bk.allowed_mime_types.includes(mime)) throw errSt(415, 'invalid_mime_type', 'mime type ' + mime + ' is not supported');
      const upsert = req.method === 'PUT' || String(req.headers['x-upsert']) === 'true';
      if (objetos.has(ruta) && !upsert) throw errSt(409, 'Duplicate', 'The resource already exists');
      objetos.set(ruta, { bytes: Buffer.from(cuerpoBuf), mime });
      await sql(`insert into storage.objects(bucket_id, name, metadata) values ($1, $2, $3) on conflict (bucket_id, name) do update set metadata = excluded.metadata, updated_at = now()`,
        [p[1], nombreO, JSON.stringify({ mimetype: mime, size: cuerpoBuf.length })]);
      return { json: { Key: ruta, Id: crypto.randomUUID() } };
    }
    throw errSt(405, 'method', 'Método no soportado');
  }

  // ----- Edge Functions -----
  async function funcion(req, u, cuerpoBuf, nombreF) {
    if (!modulos[nombreF]) modulos[nombreF] = await import(pathToFileURL(FUNCIONES[nombreF]).href);
    const o = req.headers.origin;
    let origenes = env.VENTO_ORIGENES || 'http://localhost:8765,http://127.0.0.1:8765';
    if (o && ORIGEN_LOCAL.test(o) && !origenes.split(',').includes(o)) origenes += ',' + o;
    const e = { SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, VENTO_CRON_SECRETO: cron,
      VENTO_SITIO: 'http://localhost:8765/', ...env, VENTO_ORIGENES: origenes };
    const h = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && !/^(host|connection|content-length|transfer-encoding)$/i.test(k)) h.set(k, v);
    const r = new Request(url + u.pathname + u.search, { method: req.method, headers: h, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : cuerpoBuf });
    return modulos[nombreF].manejar(r, e);
  }

  // ----- HTTP -----
  function cors(req) {
    const o = req.headers.origin;
    const h = {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || 'authorization, apikey, content-type, x-client-info, prefer, accept-profile, content-profile, range, x-upsert, x-supabase-api-version',
      'Access-Control-Expose-Headers': 'content-range, x-supabase-api-version',
      'Access-Control-Max-Age': '600', Vary: 'Origin',
    };
    if (o && ORIGEN_LOCAL.test(o)) h['Access-Control-Allow-Origin'] = o;
    return h;
  }
  function responder(res, req, status, cuerpo, extra = {}) {
    const h = { ...cors(req), ...extra };
    if (cuerpo === undefined || cuerpo === null && status === 204) { res.writeHead(status, h); return res.end(); }
    if (Buffer.isBuffer(cuerpo)) { res.writeHead(status, h); return res.end(cuerpo); }
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...h });
    res.end(JSON.stringify(cuerpo));
  }
  const errorRest = (e) => ({ code: e.code || 'XX000', message: e.message, details: e.detail || null, hint: e.hint || null });
  function estadoDe(e, rol) {
    if (e.status) return e.status;
    if (e.code === '42501') return rol === 'anon' ? 401 : 403;
    if (e.code === '23505' || e.code === '23503') return 409;
    if (e.code === '42P01' || e.code === '42883') return 404;
    if (/^(P0|22|23|42|2B|0A)/.test(e.code || '')) return 400;
    return 500;
  }
  const errAuth = (status, codigo, msg) => Object.assign(new Error(msg), { auth: true, status, codigo });

  async function auth(req, u, b) {
    const r = u.pathname.replace(/^\/auth\/v1/, '');
    if (r === '/settings') return { external: { email: true, google: !!opts.google, phone: false }, disable_signup: false, mailer_autoconfirm: opts.autoconfirmar !== false, phone_autoconfirm: false, sms_provider: '' };
    if (r === '/health') return { name: 'GoTrue (supabase-local)', version: 'local' };
    if (r === '/signup' && req.method === 'POST') {
      if (!b.email || !b.password) throw errAuth(400, 'validation_failed', 'Signup requires a valid password');
      if (String(b.password).length < 6) throw errAuth(422, 'weak_password', 'Password should be at least 6 characters.');
      const auto = opts.autoconfirmar !== false;   // { autoconfirmar: false } → hay que confirmar el correo (sin sesión)
      let usr; try { usr = await crearUsuario(b.email, b.password, b.data, auto); } catch (e) {
        if (e.code === '23505') throw errAuth(422, 'user_already_exists', 'User already registered'); throw e;
      }
      return auto ? sesionDe(usr) : usuarioPub(usr);
    }
    if (r === '/token' && req.method === 'POST') {
      const g = u.searchParams.get('grant_type');
      if (g === 'password') {
        const usr = await entrarConClave(b.email, b.password);
        if (!usr) throw errAuth(400, 'invalid_credentials', 'Invalid login credentials');
        return sesionDe(usr);
      }
      if (g === 'refresh_token') {
        const id = refrescos.get(String(b.refresh_token || ''));
        if (!id) throw errAuth(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
        refrescos.delete(String(b.refresh_token));
        const usr = (await sql('select * from auth.users where id = $1', [id]))[0];
        if (!usr) throw errAuth(400, 'user_not_found', 'User not found');
        return sesionDe(usr);
      }
      throw errAuth(400, 'unsupported_grant_type', 'unsupported_grant_type');
    }
    if (r === '/user') {
      const { rol, claims } = quien(req);
      if (rol !== 'authenticated') throw errAuth(401, 'no_authorization', 'This endpoint requires a Bearer token');
      if (req.method === 'PUT') {
        if (b.password) await sql("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 4)), updated_at = now() where id = $1", [claims.sub, String(b.password)]);
        if (b.data) await sql('update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb, updated_at = now() where id = $1', [claims.sub, JSON.stringify(b.data)]);
      }
      const usr = (await sql('select * from auth.users where id = $1', [claims.sub]))[0];
      if (!usr) throw errAuth(404, 'user_not_found', 'User not found');
      return usuarioPub(usr);
    }
    if (r === '/logout') return null;
    if (r === '/otp' || r === '/recover') return {};
    throw errAuth(404, 'not_found', 'Ruta de auth no soportada en supabase-local: ' + r);
  }

  async function atender(req, res) {
    const u = new URL(req.url, 'http://local');
    const trozos = []; let largo = 0;
    for await (const t of req) { largo += t.length; if (largo > 16 * 1024 * 1024) return responder(res, req, 413, { message: 'Demasiado grande' }); trozos.push(t); }
    const cuerpoBuf = Buffer.concat(trozos);
    const fn = /^\/functions\/v1\/([\w-]+)/.exec(u.pathname);
    if (fn) {
      if (!FUNCIONES[fn[1]]) return responder(res, req, 404, { code: 'NOT_FOUND', message: 'Function not found' });
      const r = await funcion(req, u, cuerpoBuf, fn[1]);
      const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      res.writeHead(r.status, h);
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    if (req.method === 'OPTIONS') return responder(res, req, 204, null);
    let rol = 'anon';
    try {
      const json = () => { try { return cuerpoBuf.length ? JSON.parse(cuerpoBuf.toString()) : {}; } catch (e) { return {}; } };
      if (u.pathname === '/' || u.pathname === '/salud') return responder(res, req, 200, { ok: true, supabase_local: true, base: nombre });
      if (u.pathname.startsWith('/auth/v1/')) {
        const r = await auth(req, u, json());
        return r === null ? responder(res, req, 204, null) : responder(res, req, 200, r);
      }
      const who = quien(req); rol = who.rol;
      const mrpc = /^\/rest\/v1\/rpc\/([^/]+)$/.exec(u.pathname);
      if (mrpc) {
        const args = req.method === 'GET' ? Object.fromEntries(u.searchParams) : json();
        const r = await rpc(mrpc[1], args, who.rol, who.claims);
        return responder(res, req, 200, r === undefined ? null : r);
      }
      const mt = /^\/rest\/v1\/([^/]+)$/.exec(u.pathname);
      if (mt) {
        const r = await tabla(req, u, mt[1], json(), who.rol, who.claims);
        if (r.filas === null) return responder(res, req, r.status, null);
        if (/vnd\.pgrst\.object/.test(String(req.headers.accept || ''))) {
          if (r.filas.length !== 1) return responder(res, req, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains ' + r.filas.length + ' rows', hint: null });
          return responder(res, req, r.status, r.filas[0]);
        }
        return responder(res, req, r.status, r.filas, { 'Content-Range': '0-' + Math.max(0, r.filas.length - 1) + '/*' });
      }
      if (u.pathname === '/rest/v1/' || u.pathname === '/rest/v1') return responder(res, req, 200, {});
      if (u.pathname.startsWith('/storage/v1/')) {
        const r = await storage(req, u, cuerpoBuf, who.rol);
        return r.bytes ? responder(res, req, 200, r.bytes, { 'Content-Type': r.mime, 'Cache-Control': 'no-store' }) : responder(res, req, 200, r.json);
      }
      return responder(res, req, 404, { message: 'Ruta no soportada en supabase-local: ' + u.pathname });
    } catch (e) {
      if (e.auth) return responder(res, req, e.status, { code: e.status, error_code: e.codigo, msg: e.message, error: e.codigo, error_description: e.message });
      if (e.storage) return responder(res, req, e.status, { statusCode: String(e.status), error: e.error, message: e.message });
      const st = estadoDe(e, rol);
      if (st >= 500) console.error('[supabase-local]', e);
      return responder(res, req, st, errorRest(e));
    }
  }

  const server = http.createServer((req, res) => {
    atender(req, res).catch((e) => { console.error('[supabase-local]', e); try { responder(res, req, 500, { message: String(e && e.message) }); } catch (x) { /* nada */ } });
  });
  server.on('upgrade', (req, socket) => socket.destroy());   // tiempo real: no se simula (la app reintenta sola)
  await new Promise((ok, mal) => { server.once('error', mal); server.listen(opts.puerto || 0, '127.0.0.1', ok); });
  const url = 'http://127.0.0.1:' + server.address().port;

  let cerrado = false;
  async function cerrar() {
    if (cerrado) return; cerrado = true;
    await new Promise((ok) => { server.close(() => ok()); if (server.closeAllConnections) server.closeAllConnections(); });
    await pool.end().catch(() => {});
    if (!opts.conservar) await admin.query('drop database if exists ' + q(nombre) + ' with (force)').catch(() => {});
    await admin.end().catch(() => {});
  }

  return {
    url, anonKey, serviceKey, jwtSecret: secreto, cron, base: nombre, pgUrl: urlBase.toString(), migraciones: aplicadas, env, fallos, objetos, sql, cerrar,
    firmarJwt: (p) => firmarJwt(p, secreto),
    // Atajos para las pruebas (no pasan por HTTP): crear/entrar usuarios y obtener su sesión.
    async usuario(email, clave = 'clave123', meta = {}, confirmado = true) {
      const usr = await crearUsuario(email, clave, meta, confirmado);
      const s = sesionDe(usr);
      return { id: usr.id, email: usr.email, token: s.access_token, refresh: s.refresh_token, sesion: s };
    },
    async entrar(email, clave = 'clave123') {
      const usr = await entrarConClave(email, clave); if (!usr) throw new Error('Clave incorrecta: ' + email);
      const s = sesionDe(usr);
      return { id: usr.id, email: usr.email, token: s.access_token, refresh: s.refresh_token, sesion: s };
    },
  };
}

// Para pruebas de NAVEGADOR (Playwright): manda https://<algo>.supabase.co/* a este servidor y sirve supabase-js
// desde pruebas/node_modules para la URL del CDN. Uso:  await enrutar(ctx, sb)
async function enrutar(ctx, sb) {
  const sdk = fs.readFileSync(require.resolve('@supabase/supabase-js/dist/umd/supabase.js'));
  await ctx.route(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: sdk }));
  // La clave pública de nube/config.js (la del proyecto real) se cambia por la de este servidor: la app no se toca.
  const propia = (t) => { const [a, b, c] = String(t || '').split('.'); return !!c && crypto.createHmac('sha256', sb.jwtSecret).update(a + '.' + b).digest('base64url') === c; };
  await ctx.route(/^https:\/\/[\w-]+\.supabase\.co\//, async (r) => {
    const pq = r.request(), u = new URL(pq.url());
    const h = { ...pq.headers() }; delete h.host;
    if (h.apikey && !propia(h.apikey)) {
      if (String(h.authorization || '') === 'Bearer ' + h.apikey) h.authorization = 'Bearer ' + sb.anonKey;
      h.apikey = sb.anonKey;
    }
    const resp = await fetch(sb.url + u.pathname + u.search, { method: pq.method(), headers: h, body: ['GET', 'HEAD'].includes(pq.method()) ? undefined : pq.postDataBuffer() || undefined });
    const out = {}; resp.headers.forEach((v, k) => { if (!/^(content-encoding|content-length|transfer-encoding|connection)$/i.test(k)) out[k] = v; });
    await r.fulfill({ status: resp.status, headers: out, body: Buffer.from(await resp.arrayBuffer()) });
  });
  if (ctx.routeWebSocket) await ctx.routeWebSocket(/supabase\.co\/realtime/, (ws) => ws.close());
}

module.exports = { iniciar, enrutar, firmarJwt, leerJwt };

if (require.main === module) {
  iniciar({ puerto: Number(process.argv[2]) || 54321, env: { VENTO_ADMIN_EMAILS: process.env.VENTO_ADMIN_EMAILS || '' } }).then((sb) => {
    console.log('Supabase local listo en ' + sb.url + '  (base ' + sb.base + ')');
    console.log('anonKey    = ' + sb.anonKey);
    console.log('serviceKey = ' + sb.serviceKey);
    console.log('cron       = ' + sb.cron);
    const salir = () => sb.cerrar().then(() => process.exit(0));
    process.on('SIGINT', salir); process.on('SIGTERM', salir);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
