/* Puente de Mesora para la CUENTA EN LA NUBE (Cloudflare Worker, gratis).

   Para qué sirve: para que entres con el MISMO correo y la MISMA contraseña en cualquier
   equipo (el celular, el computador del local, el de la casa) y la app ya aparezca cuadrada:
   la clave de la IA, el YouTube, la música, los avisos, el QR, los domicilios y la carta.
   Sin esto, cada aparato guarda lo suyo y hay que volver a montar todo en cada uno.

   Qué guarda: tu cuenta (correo, usuario y la contraseña cifrada, nunca en texto) y tu
   configuración. Todo queda en TU propia cuenta de Cloudflare, no en un servidor de nadie más.
   No guarda las mesas abiertas ni el historial de ventas: eso se queda en cada equipo.

   Cómo publicarlo (una sola vez, son 3 pasos):
   1) dash.cloudflare.com → Workers & Pages → Create → Create Worker → Deploy.
      Luego Edit code → borra todo, pega este archivo completo → Deploy.
   2) Crea la base de datos donde viven las cuentas:
      dash.cloudflare.com → Storage & Databases → KV → Create a namespace → ponle «mesora».
   3) Conéctala a este Worker con el nombre exacto CUENTAS:
      el Worker → Settings → Bindings → Add → KV namespace →
        Variable name: CUENTAS      KV namespace: mesora     → Deploy.
   Para comprobar que quedó: abre la dirección del Worker en el navegador. Debe decir
   «puente de cuenta funcionando ✔» y NO debe pedirte conectar la base de datos.

   Opcional: en Settings → Variables and Secrets puedes agregar un secreto llamado SECRETO
   con cualquier palabra larga que inventes. Si no lo pones, el puente se crea uno solo y lo
   guarda; funciona igual. Si algún día lo cambias, todos tendrán que volver a entrar.

   Después pega la dirección de este Worker en Mesora: Ajustes → Cuenta → Cuenta en la nube. */

const ITER = 120000;                   // vueltas de PBKDF2 para cifrar la contraseña
const DIAS_TOKEN = 90;                 // cuánto dura la sesión antes de pedir contraseña otra vez
const MAX_CFG = 4 * 1024 * 1024;       // tope de la configuración que se guarda (4 MB)

const te = new TextEncoder();
const b64 = u8 => btoa(String.fromCharCode.apply(null, Array.from(u8)));
const unb64 = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const b64url = u8 => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};
const json = (o, status) => new Response(JSON.stringify(o), {
  status: status || 200,
  headers: Object.assign({}, cors, { 'Content-Type': 'application/json; charset=utf-8' })
});

const normUser = u => String(u == null ? '' : u).trim().toLowerCase();
const mailOk = m => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(m == null ? '' : m).trim());

/* Clave con la que se busca el correo. Sirve para que «Juan.Perez+bar@Gmail.com» y
   «juanperez@gmail.com» NO puedan ser dos cuentas distintas: en Gmail son el mismo buzón. */
function mailKey(m){
  const s = String(m == null ? '' : m).trim().toLowerCase();
  const i = s.lastIndexOf('@');
  if(i < 1 || i === s.length - 1) return '';
  let user = s.slice(0, i).split('+')[0], dom = s.slice(i + 1);
  if(dom === 'googlemail.com') dom = 'gmail.com';
  if(dom === 'gmail.com') user = user.replace(/\./g, '');
  return user && dom ? user + '@' + dom : '';
}

async function pbkdf2(pass, salt){
  const k = await crypto.subtle.importKey('raw', te.encode(String(pass)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, k, 256);
  return b64(new Uint8Array(bits));
}

/* Comparación que tarda lo mismo acierte o no, para no dar pistas de la contraseña. */
function igual(a, b){
  a = String(a); b = String(b);
  if(a.length !== b.length) return false;
  let d = 0;
  for(let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function secreto(env){
  if(env.SECRETO) return String(env.SECRETO);
  let s = await env.CUENTAS.get('sys:secreto');
  if(!s){
    s = b64url(crypto.getRandomValues(new Uint8Array(32)));
    await env.CUENTAS.put('sys:secreto', s);
  }
  return s;
}

async function firma(msg, sec){
  const k = await crypto.subtle.importKey('raw', te.encode(sec), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, te.encode(msg))));
}
async function tokenNuevo(user, sec){
  const exp = Date.now() + DIAS_TOKEN * 864e5;
  return b64url(te.encode(user)) + '.' + exp + '.' + (await firma(user + '|' + exp, sec));
}
async function tokenUser(tok, sec){
  const p = String(tok == null ? '' : tok).split('.');
  if(p.length !== 3) return null;
  let user;
  try{ user = new TextDecoder().decode(unb64(p[0])); }catch(e){ return null; }
  const exp = Number(p[1]);
  if(!user || !exp || exp < Date.now()) return null;
  return igual(await firma(user + '|' + exp, sec), p[2]) ? user : null;
}

/* Freno a quien prueba contraseñas al puro intento. */
async function frenado(env, id){
  const r = await env.CUENTAS.get('freno:' + id, 'json');
  if(r && Date.now() - r.t < 6e5 && r.n >= 8) return Math.ceil((6e5 - (Date.now() - r.t)) / 6e4);
  return 0;
}
async function fallo(env, id){
  const r = await env.CUENTAS.get('freno:' + id, 'json');
  const fresco = r && Date.now() - r.t < 6e5;
  await env.CUENTAS.put('freno:' + id, JSON.stringify({ n: (fresco ? r.n : 0) + 1, t: Date.now() }), { expirationTtl: 900 });
}

export default {
  async fetch(req, env) {
    if(req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const u = new URL(req.url);
    const ruta = u.pathname.replace(/\/+$/, '') || '/';

    if(req.method === 'GET'){
      const falta = !env.CUENTAS;
      const txt = 'Mesora: puente de cuenta funcionando ✔' + (falta
        ? '\n\n⚠️ Falta un paso: conectar la base de datos KV con el nombre exacto CUENTAS.\n' +
          'En el panel de Cloudflare: este Worker → Settings → Bindings → Add → KV namespace →\n' +
          'Variable name: CUENTAS   ·   KV namespace: el que creaste (ej. «mesora») → Deploy.'
        : '\n\nBase de datos conectada ✔  Ya puedes pegar esta dirección en Mesora\n(Ajustes → Cuenta → Cuenta en la nube).');
      return new Response(txt, {
        status: ruta === '/' ? 200 : 404,
        headers: Object.assign({}, cors, { 'Content-Type': 'text/plain; charset=utf-8' })
      });
    }
    if(req.method !== 'POST') return json({ error: 'Este puente solo responde a POST.' }, 405);
    if(!env.CUENTAS) return json({ error: 'Falta conectar la base de datos KV con el nombre CUENTAS en el panel de Cloudflare (Settings → Bindings → Add → KV namespace). Abre la dirección del puente en el navegador y te dice los pasos.' }, 500);

    let b;
    try{ b = await req.json(); }catch(e){ return json({ error: 'No se entendió la solicitud (JSON inválido).' }, 400); }
    if(!b || typeof b !== 'object') b = {};

    const sec = await secreto(env);
    const guardar = cta => env.CUENTAS.put('cuenta:' + cta.user, JSON.stringify(cta));
    const sesion = async () => {
      const user = await tokenUser(b.token, sec);
      return user ? await env.CUENTAS.get('cuenta:' + user, 'json') : null;
    };
    const salida = async cta => ({
      ok: true,
      token: await tokenNuevo(cta.user, sec),
      user: cta.user,
      email: cta.email || '',
      rol: cta.rol || 'admin',
      cfg: cta.cfg || null,
      at: cta.cfgAt || 0
    });

    // ---------- Crear la cuenta ----------
    if(ruta === '/registro'){
      const user = normUser(b.user);
      const mail = String(b.email == null ? '' : b.email).trim();
      const mk = mailKey(mail);
      if(user.length < 3) return json({ error: 'El usuario debe tener al menos 3 caracteres.' }, 400);
      if(!/^[a-z0-9._-]+$/.test(user)) return json({ error: 'El usuario solo puede llevar letras, números, punto, guion y guion bajo (sin espacios ni tildes).' }, 400);
      if(!mailOk(mail) || !mk) return json({ error: 'Escribe un correo válido (ejemplo: nombre@gmail.com).' }, 400);
      if(String(b.pass == null ? '' : b.pass).length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
      if(await env.CUENTAS.get('mail:' + mk)) return json({ error: 'Ya hay una cuenta con ese correo. Entra con ella, o recupera la contraseña si no la recuerdas.' }, 409);
      if(await env.CUENTAS.get('cuenta:' + user)) return json({ error: 'Ese usuario ya está tomado. Elige otro.' }, 409);

      const salt = crypto.getRandomValues(new Uint8Array(16));
      const cta = {
        user, email: mail, mk,
        salt: b64(salt), hash: await pbkdf2(b.pass, salt),
        rol: 'admin', creada: Date.now(), cfg: null, cfgAt: 0
      };
      await guardar(cta);
      await env.CUENTAS.put('mail:' + mk, user);
      return json(await salida(cta));
    }

    // ---------- Entrar (con el correo o con el usuario) ----------
    if(ruta === '/entrar'){
      const id = normUser(b.id || b.email || b.user);
      if(!id) return json({ error: 'Escribe tu correo o tu usuario.' }, 400);
      const esperar = await frenado(env, id);
      if(esperar) return json({ error: '🔒 Demasiados intentos. Espera ' + esperar + ' min. e intenta de nuevo.' }, 429);

      let user = id;
      if(id.indexOf('@') >= 0) user = (await env.CUENTAS.get('mail:' + mailKey(id))) || '';
      const cta = user ? await env.CUENTAS.get('cuenta:' + user, 'json') : null;
      const bien = !!cta && igual(await pbkdf2(String(b.pass == null ? '' : b.pass), unb64(cta.salt)), cta.hash);
      if(!bien){
        await fallo(env, id);
        return json({ error: 'Correo (o usuario) y contraseña no coinciden.' }, 401);
      }
      await env.CUENTAS.delete('freno:' + id);
      return json(await salida(cta));
    }

    // ---------- Bajar la configuración ----------
    if(ruta === '/bajar'){
      const cta = await sesion();
      if(!cta) return json({ error: 'La sesión venció. Entra otra vez con tu correo y contraseña.' }, 401);
      return json({ ok: true, user: cta.user, email: cta.email || '', cfg: cta.cfg || null, at: cta.cfgAt || 0 });
    }

    // ---------- Subir la configuración ----------
    if(ruta === '/subir'){
      const cta = await sesion();
      if(!cta) return json({ error: 'La sesión venció. Entra otra vez con tu correo y contraseña.' }, 401);
      const at = Number(b.at) || Date.now();
      // Si otro equipo guardó algo más nuevo, no se pisa: se le devuelve lo nuevo a este.
      if(at < (cta.cfgAt || 0)) return json({ ok: true, viejo: true, cfg: cta.cfg || null, at: cta.cfgAt || 0 });
      const txt = JSON.stringify(b.cfg == null ? null : b.cfg);
      if(txt.length > MAX_CFG) return json({ error: 'La configuración es demasiado grande para guardarla en la nube.' }, 413);
      cta.cfg = b.cfg == null ? null : b.cfg;
      cta.cfgAt = at;
      await guardar(cta);
      return json({ ok: true, at });
    }

    // ---------- Cambiar la contraseña ----------
    if(ruta === '/clave'){
      const cta = await sesion();
      if(!cta) return json({ error: 'La sesión venció. Entra otra vez con tu correo y contraseña.' }, 401);
      if(!igual(await pbkdf2(String(b.actual == null ? '' : b.actual), unb64(cta.salt)), cta.hash)) return json({ error: 'La contraseña actual no coincide.' }, 401);
      if(String(b.nueva == null ? '' : b.nueva).length < 6) return json({ error: 'La contraseña nueva debe tener al menos 6 caracteres.' }, 400);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      cta.salt = b64(salt);
      cta.hash = await pbkdf2(b.nueva, salt);
      await guardar(cta);
      return json({ ok: true, token: await tokenNuevo(cta.user, sec) });
    }

    // ---------- Cambiar el correo de la cuenta ----------
    if(ruta === '/correo'){
      const cta = await sesion();
      if(!cta) return json({ error: 'La sesión venció. Entra otra vez con tu correo y contraseña.' }, 401);
      const mail = String(b.email == null ? '' : b.email).trim();
      const mk = mailKey(mail);
      if(!mailOk(mail) || !mk) return json({ error: 'Escribe un correo válido (ejemplo: nombre@gmail.com).' }, 400);
      if(mk !== cta.mk){
        const dueno = await env.CUENTAS.get('mail:' + mk);
        if(dueno && dueno !== cta.user) return json({ error: 'Ese correo ya lo está usando otra cuenta.' }, 409);
        if(cta.mk) await env.CUENTAS.delete('mail:' + cta.mk);
        await env.CUENTAS.put('mail:' + mk, cta.user);
      }
      cta.email = mail;
      cta.mk = mk;
      await guardar(cta);
      return json({ ok: true, email: mail });
    }

    return json({ error: 'Ruta desconocida: ' + ruta }, 404);
  }
};
