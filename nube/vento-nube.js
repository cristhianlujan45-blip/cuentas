/* =====================================================================
   Vento Nube · usuarios y sincronización entre celulares (Supabase)
   ---------------------------------------------------------------------
   Es OPCIONAL: si no se configura, Vento funciona igual que siempre (todo en el celular).
   Con la nube:
     • cada persona entra con su correo y contraseña (usuarios reales);
     • varios celulares comparten el mismo negocio (caja, meseros, dueño desde la casa);
     • roles: dueño, administrador, cajero, mesero (el mesero entra en «modo mesero»);
     • invitaciones con código; respaldos automáticos en la nube (uno por hora, últimos 48).
   Sincronización: cada vez que la app guarda, sube los datos (a los 3 s). Cada 15 s mira si otro
   celular cambió algo y lo baja. Si dos celulares cambiaron a la vez, MEZCLA los cambios (lo que
   agregó cada uno se conserva) en vez de que uno pise al otro.
   Seguridad: solo se usa la «anon key» pública de Supabase; las reglas (Row Level Security) de
   nube/schema.sql impiden ver o tocar negocios ajenos. Ninguna clave privada va en la app.
   ===================================================================== */
(function(){
  'use strict';
  var SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  var K_CFG = 'vento_nube_cfg', K_ST = 'vento_nube_estado';
  var POLL_MS = 15000, SUBIR_MS = 3000;

  // ---------- Estado guardado en el celular ----------
  function lsGet(k, d){ try{ var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; }catch(e){ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function cfg(){ var c = lsGet(K_CFG, null) || (window.VENTO_NUBE_DEFAULT || {}); return { url: String(c.url || '').trim().replace(/\/+$/, ''), key: String(c.key || '').trim() }; }
  function configurada(){ var c = cfg(); return /^https:\/\/[\w.-]+$/.test(c.url) && c.key.length > 20; }
  var st = lsGet(K_ST, {});            // { email, negocio:{id,nombre,rol}, version, sucio, ultimo }
  function guardarSt(){ lsSet(K_ST, st); }

  // Link para configurar otro celular: …index.html#nube=<base64(url|key)>
  try{
    var mh = /[#&]nube=([\w\-+/=%]+)/.exec(location.hash);
    if(mh){
      var par = atob(decodeURIComponent(mh[1])).split('|');
      if(/^https:\/\//.test(par[0]) && par[1]) lsSet(K_CFG, { url: par[0], key: par[1] });
      history.replaceState(null, '', location.pathname + location.search);
    }
  }catch(e){}

  // ---------- Cliente de Supabase (se carga solo cuando hace falta) ----------
  var sb = null, sdkProm = null;
  function cargarSDK(){
    if(window.supabase && window.supabase.createClient) return Promise.resolve();
    if(sdkProm) return sdkProm;
    sdkProm = new Promise(function(ok, mal){
      var s = document.createElement('script'); s.src = SDK; s.async = true;
      s.onload = function(){ ok(); }; s.onerror = function(){ sdkProm = null; mal(new Error('No se pudo cargar la conexión con la nube. Revisa el internet.')); };
      document.head.appendChild(s);
    });
    return sdkProm;
  }
  function cliente(){
    if(!configurada()) return Promise.reject(new Error('Falta configurar la nube (dirección y clave pública de Supabase).'));
    if(sb) return Promise.resolve(sb);
    return cargarSDK().then(function(){ var c = cfg(); sb = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true } }); return sb; });
  }
  function msgError(e){
    var m = String((e && (e.message || e.error_description || e.msg)) || e || '');
    var mapa = [
      [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
      [/token has expired|otp.*(expired|invalid)|invalid.*(token|otp)/i, 'Ese código no sirve o ya venció. Pide uno nuevo.'],
      [/rate limit|too many|for security purposes/i, 'Ya se mandaron varios códigos: espera unos minutos y vuelve a pedirlo.'],
      [/signups? not allowed|email address.*not authorized|not authorized/i, 'El servidor no deja mandar correos a esa dirección todavía (revisa el correo de envío en Supabase).'],
      [/error sending|smtp|sending (magic link|confirmation|recovery) email/i, 'El servidor no pudo mandar el correo. Intenta más tarde.'],
      [/email not confirmed/i, 'Falta confirmar el correo: abre el mensaje que te llegó y vuelve a entrar.'],
      [/already registered|already exists/i, 'Ese correo ya tiene cuenta: usa «Entrar».'],
      [/password should be at least|weak password/i, 'La contraseña debe tener al menos 6 caracteres.'],
      [/sin_permiso/, 'Tu rol no permite hacer eso.'], [/sin_sesion/, 'Primero entra con tu cuenta.'],
      [/codigo_invalido/, 'Ese código no existe. Revísalo.'], [/codigo_usado/, 'Ese código ya se usó. Pide uno nuevo.'],
      [/codigo_vencido/, 'Ese código venció (duran 7 días). Pide uno nuevo.'], [/dueno_no_sale/, 'El dueño no puede salirse de su propio negocio.'],
      [/no_a_si_mismo/, 'No puedes cambiar tu propio rol.'], [/failed to fetch|networkerror|load failed/i, 'Sin conexión con la nube. Revisa el internet.']
    ];
    for(var i = 0; i < mapa.length; i++) if(mapa[i][0].test(m)) return mapa[i][1];
    return m || 'Algo falló con la nube.';
  }
  function rpc(nombre, args){ return cliente().then(function(c){ return c.rpc(nombre, args || {}); }).then(function(r){ if(r.error) throw r.error; return r.data; }); }

  // ---------- Copia «base» (lo último que se sincronizó) para poder mezclar ----------
  var idb = null;
  function base(op, val){
    return new Promise(function(ok){
      try{
        var abrir = idb ? Promise.resolve(idb) : new Promise(function(a, b){ var r = indexedDB.open('vento-nube', 1); r.onupgradeneeded = function(){ r.result.createObjectStore('kv'); }; r.onsuccess = function(){ idb = r.result; a(idb); }; r.onerror = b; });
        abrir.then(function(db){
          var tx = db.transaction('kv', op === 'get' ? 'readonly' : 'readwrite'), s = tx.objectStore('kv'), k = 'base_' + ((st.negocio && st.negocio.id) || '');
          var q = op === 'get' ? s.get(k) : s.put(val, k);
          q.onsuccess = function(){ ok(op === 'get' ? q.result || null : true); }; q.onerror = function(){ ok(null); };
        }, function(){ ok(null); });
      }catch(e){ ok(null); }
    });
  }
  var clonar = function(o){ return JSON.parse(JSON.stringify(o == null ? null : o)); };
  // Comparación por contenido: la base de datos (jsonb) cambia el orden de los campos y la app agrega
  // campos vacíos (ej. personId: null) al cargar; sin esto un mismo producto parecía otro y se duplicaba.
  function canon(x){
    if(Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
    if(x && typeof x === 'object') return '{' + Object.keys(x).filter(function(k){ return x[k] != null; }).sort().map(function(k){ return JSON.stringify(k) + ':' + canon(x[k]); }).join(',') + '}';
    return JSON.stringify(x == null ? null : x);
  }
  var igual = function(a, b){ return canon(a) === canon(b); };

  /* Mezcla de 3 vías: base (lo último sincronizado), local (este celular) y remoto (la nube).
     - Si solo uno de los dos cambió algo, se queda ese cambio.
     - Si los dos cambiaron la misma lista (productos, historial, pedidos, los productos de una mesa…),
       se juntan: lo que agregó cada uno se conserva y lo que borró cada uno se borra.
     - Si los dos cambiaron el mismo dato suelto (ej. el nombre del negocio), gana la nube. */
  function claveDe(x){ return (x && typeof x === 'object' && !Array.isArray(x) && x.id != null) ? 'id:' + x.id : 'v:' + canon(x); }
  function unirListas(b, l, r){
    b = Array.isArray(b) ? b : [];
    var kb = {}, kl = {}, kr = {};
    b.forEach(function(x){ kb[claveDe(x)] = 1; }); l.forEach(function(x){ kl[claveDe(x)] = 1; }); r.forEach(function(x){ kr[claveDe(x)] = 1; });
    var out = r.filter(function(x){ var k = claveDe(x); return !(kb[k] && !kl[k]); });          // lo que borró este celular
    l.forEach(function(x){ var k = claveDe(x); if(!kb[k] && !kr[k]) out.push(x); });          // lo que agregó este celular
    // Mismo elemento (mismo id) cambiado en uno o en los dos celulares: se mezcla campo por campo
    // (así el stock suma las dos ventas y cada cambio se conserva).
    return out.map(function(x){
      if(!(x && x.id != null)) return x;
      var lb = b.find(function(y){ return y && y.id === x.id; }), ll = l.find(function(y){ return y && y.id === x.id; });
      return (lb && ll) ? fusionar(lb, ll, x) : x;
    });
  }
  // Contadores: si los dos celulares vendieron del mismo producto, se suman los dos movimientos
  // (stock 20 → aquí 18, allá 17 → queda 15), en vez de quedarse con uno solo.
  var CONTADORES = { stock: 1, stockMin: 0 };
  function fusionar(b, l, r, k){
    if(CONTADORES[k] && typeof l === 'number' && typeof r === 'number' && typeof b === 'number' && l !== b && r !== b) return r + (l - b);
    if(igual(l, r)) return clonar(r);
    if(igual(r, b)) return clonar(l);
    if(igual(l, b)) return clonar(r);
    if(Array.isArray(l) && Array.isArray(r)) return unirListas(b, l, r);
    if(l && r && typeof l === 'object' && typeof r === 'object'){
      var out = {}, ks = {};
      Object.keys(l).forEach(function(k){ ks[k] = 1; }); Object.keys(r).forEach(function(k){ ks[k] = 1; });
      var bb = (b && typeof b === 'object') ? b : {};
      Object.keys(ks).forEach(function(k){
        var enL = k in l, enR = k in r, enB = k in bb;
        if(enL && enR) out[k] = fusionar(bb[k], l[k], r[k], k);
        else if(enL && !enR){ if(!enB || !igual(l[k], bb[k])) out[k] = clonar(l[k]); }        // nuevo aquí (o borrado allá pero cambiado aquí)
        else if(!enL && enR){ if(!enB || !igual(r[k], bb[k])) out[k] = clonar(r[k]); }        // nuevo allá
      });
      return out;
    }
    return clonar(r);
  }

  // ---------- Conexión con la app ----------
  function datosApp(){ try{ return typeof window.ventoDatosActuales === 'function' ? window.ventoDatosActuales() : null; }catch(e){ return null; } }
  function aplicar(obj, respaldar){ return typeof window.ventoAplicarDatosNube === 'function' ? Promise.resolve(window.ventoAplicarDatosNube(obj, respaldar)) : Promise.resolve(); }
  var subiendo = false, otraVez = false, tSubir = null, tPoll = null, ultimoError = '';
  function aviso(t){ try{ window.showToast && window.showToast(t, 5000); }catch(e){} }
  function pintarEstado(){ try{ var el = document.getElementById('nubeEstadoAj'); if(el) el.textContent = textoEstado(); }catch(e){} }
  function textoEstado(){
    if(!configurada()) return 'Sin configurar: todo se guarda solo en este celular.';
    if(!st.negocio) return st.email ? 'Conectado como ' + st.email + ' · elige o crea un negocio.' : 'Configurada · nadie ha entrado en este celular.';
    return '☁️ ' + st.negocio.nombre + ' · ' + (st.email || '') + ' (' + ROLES[st.negocio.rol] + ')' + (st.sucio ? ' · cambios por subir…' : ' · al día') + (st.ultimo ? ' · ' + new Date(st.ultimo).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '') + (ultimoError ? ' · ⚠️ ' + ultimoError : '');
  }
  var ROLES = { dueno: 'dueño', admin: 'administrador', cajero: 'cajero', mesero: 'mesero' };

  function cambio(){                     // la app acaba de guardar
    if(!st.negocio || !configurada()) return;
    st.sucio = true; guardarSt(); pintarEstado();
    clearTimeout(tSubir); tSubir = setTimeout(subir, SUBIR_MS);
  }
  function subir(){
    if(!st.negocio) return Promise.resolve();
    if(subiendo){ otraVez = true; return Promise.resolve(); }
    var d = datosApp(); if(!d) return Promise.resolve();
    subiendo = true;
    return rpc('guardar_datos', { p_negocio: st.negocio.id, p_datos: d, p_version: st.version || 0 })
      .then(function(v){ st.version = v; st.sucio = false; st.ultimo = Date.now(); ultimoError = ''; guardarSt(); return base('put', clonar(d)); })
      .catch(function(e){
        if(/conflicto/.test(String(e && e.message))) return mezclarConNube();
        ultimoError = msgError(e); clearTimeout(tSubir); tSubir = setTimeout(subir, 20000);
      })
      .then(function(){ subiendo = false; pintarEstado(); if(otraVez){ otraVez = false; return subir(); } });
  }
  function leerNube(){
    return cliente().then(function(c){ return c.from('datos_negocio').select('datos,version').eq('negocio_id', st.negocio.id).single(); })
      .then(function(r){ if(r.error) throw r.error; return r.data; });
  }
  function mezclarConNube(){
    return Promise.all([leerNube(), base('get')]).then(function(x){
      var nube = x[0], b = x[1], local = datosApp();
      var mezcla = fusionar(b, local, nube.datos);
      st.version = nube.version; guardarSt();
      return aplicar(mezcla).then(function(){
        return rpc('guardar_datos', { p_negocio: st.negocio.id, p_datos: mezcla, p_version: nube.version });
      }).then(function(v){
        st.version = v; st.sucio = false; st.ultimo = Date.now(); guardarSt();
        aviso('☁️ Otro celular también hizo cambios: se juntaron los dos.');
        return base('put', clonar(mezcla));
      });
    }).catch(function(e){ ultimoError = msgError(e); clearTimeout(tSubir); tSubir = setTimeout(subir, 10000); });
  }
  function bajar(respaldarLocal){
    return leerNube().then(function(n){
      st.version = n.version; st.sucio = false; st.ultimo = Date.now(); ultimoError = ''; guardarSt();
      return aplicar(n.datos, respaldarLocal === true).then(function(){ return base('put', clonar(n.datos)); });
    });
  }
  function revisarNube(){
    if(!st.negocio || !configurada() || document.hidden || subiendo) return;
    cliente().then(function(c){ return c.from('datos_negocio').select('version').eq('negocio_id', st.negocio.id).maybeSingle(); })
      .then(function(r){
        if(r.error) throw r.error;
        if(!r.data){ ultimoError = 'ya no eres miembro de este negocio'; pintarEstado(); return; }
        if(r.data.version > (st.version || 0)){ if(st.sucio) return subir(); return bajar().then(function(){ aviso('☁️ Datos actualizados desde otro celular.'); }); }
      }).catch(function(e){ ultimoError = msgError(e); pintarEstado(); });
  }
  function arrancar(){
    clearInterval(tPoll);
    if(!st.negocio || !configurada()) return;
    tPoll = setInterval(revisarNube, POLL_MS);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) revisarNube(); });
    window.addEventListener('online', function(){ if(st.sucio) subir(); else revisarNube(); });
    setTimeout(function(){ if(st.sucio) subir(); else revisarNube(); }, 2500);
  }

  // ---------- Cuentas y negocios ----------
  function registrar(email, pass, nombre){
    return cliente().then(function(c){ return c.auth.signUp({ email: email, password: pass, options: { data: { nombre: nombre || '' } } }); })
      .then(function(r){ if(r.error) throw r.error; st.email = email; st.nombre = nombre || ''; guardarSt(); return !!(r.data && r.data.session); });
  }
  function entrar(email, pass){
    return cliente().then(function(c){ return c.auth.signInWithPassword({ email: email, password: pass }); })
      .then(function(r){ if(r.error) throw r.error; st.email = email; guardarSt(); return true; });
  }
  // ---------- Código por correo (recuperar contraseña) ----------
  // Supabase manda al correo un código de 6 números (plantilla «Magic Link» con {{ .Token }}, la configura el
  // flujo «Servidor Vento»). Con ese código se comprueba que la persona es dueña del correo.
  function codigoCorreo(email){
    return cliente().then(function(c){ return c.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } }); })
      .then(function(r){ if(r.error) throw r.error; return true; });
  }
  function verificarCorreo(email, codigo){
    return cliente().then(function(c){ return c.auth.verifyOtp({ email: email, token: String(codigo || '').replace(/\D/g, ''), type: 'email' }); })
      .then(function(r){ if(r.error) throw r.error; return true; });
  }
  function nuevaClave(pass){
    return cliente().then(function(c){ return c.auth.updateUser({ password: pass }); }).then(function(r){ if(r.error) throw r.error; return true; });
  }
  // Tras comprobar un correo para recuperar una cuenta del celular: si no se usa Vento Nube, se cierra esa sesión.
  function soltarSesion(){ if(st.email) return Promise.resolve(); return cliente().then(function(c){ return c.auth.signOut(); }).catch(function(){}); }
  function salir(){
    clearInterval(tPoll);
    var p = st.sucio ? subir() : Promise.resolve();
    return p.then(function(){ return cliente(); }).then(function(c){ return c.auth.signOut(); }).catch(function(){})
      .then(function(){ st = {}; guardarSt(); pintarEstado(); });
  }
  function misNegocios(){ return rpc('mis_negocios'); }
  function crearNegocio(nombre){
    var d = datosApp() || {};
    return rpc('crear_negocio', { p_nombre: nombre || d.businessName || 'Mi negocio', p_datos: d, p_nombre_usuario: st.nombre || null })
      .then(function(id){ st.negocio = { id: id, nombre: nombre || d.businessName || 'Mi negocio', rol: 'dueno' }; st.version = 1; st.sucio = false; st.ultimo = Date.now(); guardarSt(); return base('put', clonar(d)); })
      .then(function(){ arrancar(); });
  }
  function elegir(n){
    st.negocio = { id: n.id, nombre: n.nombre, rol: n.rol }; st.version = 0; guardarSt();
    return bajar(true).then(function(){ arrancar(); });
  }
  function unirse(codigo, nombre){
    return rpc('unirse_con_codigo', { p_codigo: codigo, p_nombre: nombre || st.nombre || null })
      .then(function(id){ return misNegocios().then(function(l){ var n = (l || []).find(function(x){ return x.id === id; }); if(!n) throw new Error('No se encontró el negocio.'); return elegir(n, true); }); });
  }
  function invitar(rol){ return rpc('crear_invitacion', { p_negocio: st.negocio.id, p_rol: rol }); }
  function miembros(){ return cliente().then(function(c){ return c.from('miembros').select('usuario_id,rol,nombre,email').eq('negocio_id', st.negocio.id).order('creado_en'); }).then(function(r){ if(r.error) throw r.error; return r.data; }); }
  function quitar(uid){ return rpc('quitar_miembro', { p_negocio: st.negocio.id, p_usuario: uid }); }
  function cambiarRol(uid, rol){ return rpc('cambiar_rol', { p_negocio: st.negocio.id, p_usuario: uid, p_rol: rol }); }
  function respaldos(){ return cliente().then(function(c){ return c.from('respaldos').select('id,version,creado_en').eq('negocio_id', st.negocio.id).order('creado_en', { ascending: false }).limit(48); }).then(function(r){ if(r.error) throw r.error; return r.data; }); }
  function restaurar(id){ return rpc('restaurar_respaldo', { p_respaldo: id }).then(function(){ return bajar(); }); }
  function linkConfig(){ var c = cfg(); return location.origin + location.pathname + '#nube=' + encodeURIComponent(btoa(c.url + '|' + c.key)); }

  // ---------- Ventana «Vento Nube» ----------
  var esc = function(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ov = null, alEntrar = null;
  function abrir(opts){
    opts = opts || {}; alEntrar = opts.alEntrar || null;
    if(!ov){
      ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'nubeOv';
      ov.innerHTML = '<div class="modal nube-modal" role="dialog" aria-label="Vento Nube"><div class="nube-h"><h2>☁️ Vento Nube</h2><button type="button" class="btn-ghost" data-n="cerrar">Cerrar</button></div><div id="nubeCuerpo"></div><div class="nube-msg" id="nubeMsg"></div></div>';
      document.body.appendChild(ov);
      var css = document.createElement('style');
      css.textContent = '#nubeOv{z-index:10050}#nubeOv .nube-modal{max-width:460px;width:100%}.nube-h{display:flex;justify-content:space-between;align-items:center;gap:8px}.nube-h h2{margin:0}' +
        '#nubeCuerpo{display:flex;flex-direction:column;gap:10px;margin-top:10px}#nubeCuerpo label{display:flex;flex-direction:column;gap:4px;font-size:13px}' +
        '#nubeCuerpo input,#nubeCuerpo select{padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2,transparent);color:inherit;font:inherit;font-size:16px}' +
        '.nube-fila{display:flex;gap:8px;flex-wrap:wrap}.nube-fila>*{flex:1}.nube-p{font-size:13px;color:var(--ink-soft);margin:0;line-height:1.45}.nube-msg{min-height:20px;margin-top:10px;font-size:14px}' +
        '.nube-li{display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:14px;overflow-wrap:anywhere}.nube-li small{color:var(--ink-soft)}' +
        '.nube-cod{font:800 26px/1.2 monospace;letter-spacing:.12em;text-align:center;padding:10px;border:2px dashed var(--amber,#f59e0b);border-radius:12px}';
      document.head.appendChild(css);
      ov.addEventListener('click', function(e){ if(e.target === ov || (e.target.closest && e.target.closest('[data-n="cerrar"]'))) cerrar(); });
    }
    ov.classList.add('show'); pintar();
  }
  function cerrar(){ if(ov) ov.classList.remove('show'); pintarEstado(); }
  function msg(t, mal){ var m = document.getElementById('nubeMsg'); if(m){ m.textContent = t || ''; m.style.color = mal ? 'var(--brick,#e11d48)' : ''; } }
  function ocupado(b, si){ if(b){ b.disabled = si; if(si){ b.dataset.t = b.textContent; b.textContent = '⏳ …'; } else if(b.dataset.t) b.textContent = b.dataset.t; } }
  function accion(btn, fn){ msg(''); ocupado(btn, true); return Promise.resolve().then(fn).catch(function(e){ msg(msgError(e), true); }).then(function(){ ocupado(btn, false); }); }
  function q(id){ return document.getElementById(id); }

  function pintar(){
    var c = q('nubeCuerpo'); if(!c) return; msg('');
    if(!configurada()){
      var cf = cfg();
      c.innerHTML = '<p class="nube-p">Para tener <b>usuarios</b> y usar el mismo negocio en <b>varios celulares</b>, conecta Vento a tu base de datos gratuita de Supabase. Los pasos están en <a href="https://github.com/cristhianlujan45-blip/cuentas/blob/claude/nuevo-repo-correcciones-xacdbz/nube/LEEME.md" target="_blank" rel="noopener">nube/LEEME.md</a> (5 minutos).</p>' +
        '<label>Project URL<input id="nubeUrl" placeholder="https://xxxx.supabase.co" value="' + esc(cf.url) + '" autocapitalize="none" spellcheck="false"></label>' +
        '<label>Clave pública (anon / publishable key)<input id="nubeKey" placeholder="eyJhbGciOi… o sb_publishable_…" value="' + esc(cf.key) + '" autocapitalize="none" spellcheck="false"></label>' +
        '<button type="button" class="btn-primary" id="nubeGuardarCfg">Guardar y continuar</button>' +
        '<p class="nube-p">⚠️ Nunca pegues aquí la «service_role» / «secret key»: esa es privada.</p>';
      q('nubeGuardarCfg').onclick = function(){
        var u = q('nubeUrl').value.trim().replace(/\/+$/, ''), k = q('nubeKey').value.trim();
        if(!/^https:\/\/[\w.-]+$/.test(u)) return msg('La dirección debe empezar por https:// (la copias de Supabase → Project Settings → API).', true);
        if(/service_role|sb_secret_/i.test(k) || (function(){ try{ return JSON.parse(atob(k.split('.')[1])).role === 'service_role'; }catch(e){ return false; } })()) return msg('Esa es la clave SECRETA (service_role). Usa la pública (anon / publishable).', true);
        if(k.length < 20) return msg('Pega la clave pública completa.', true);
        lsSet(K_CFG, { url: u, key: k }); sb = null; pintar();
      };
      return;
    }
    if(!st.email){
      c.innerHTML = '<p class="nube-p">Entra con tu correo. Si es tu primera vez, crea la cuenta (el dueño la crea primero y después invita a los demás).</p>' +
        '<label>Correo<input id="nubeEmail" type="email" autocomplete="username" autocapitalize="none"></label>' +
        '<label>Contraseña<input id="nubePass" type="password" autocomplete="current-password"></label>' +
        '<label>Tu nombre (solo para crear la cuenta)<input id="nubeNombre" autocomplete="name" placeholder="Ej: Ana"></label>' +
        '<div class="nube-fila"><button type="button" class="btn-primary" id="nubeEntrar">Entrar</button><button type="button" class="btn-ghost" id="nubeCrear">Crear cuenta</button></div>' +
        '<button type="button" class="auth-link" id="nubeOlvide">¿Olvidaste tu contraseña? Te mando un código al correo</button>' +
        '<button type="button" class="auth-link" id="nubeCambiarCfg">Cambiar la base de datos conectada</button>';
      var datos = function(){ return { e: q('nubeEmail').value.trim().toLowerCase(), p: q('nubePass').value, n: q('nubeNombre').value.trim() }; };
      q('nubeEntrar').onclick = function(){ var d = datos(); if(!d.e || !d.p) return msg('Escribe tu correo y contraseña.', true); accion(this, function(){ return entrar(d.e, d.p).then(pintar); }); };
      q('nubeCrear').onclick = function(){ var d = datos(); if(!d.e || d.p.length < 6) return msg('Escribe tu correo y una contraseña de al menos 6 caracteres.', true);
        accion(this, function(){ return registrar(d.e, d.p, d.n).then(function(conSesion){ if(conSesion) pintar(); else { st = {}; guardarSt(); pintar(); msg('✅ Cuenta creada. Revisa tu correo para confirmarla y luego toca «Entrar».'); } }); }); };
      q('nubeOlvide').onclick = function(){
        var e = q('nubeEmail').value.trim().toLowerCase();
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return msg('Escribe arriba tu correo y vuelve a tocar aquí.', true);
        var b = this;
        accion(b, function(){ return codigoCorreo(e).then(function(){
          msg('📧 Te mandé un código de 6 números a ' + e + '. Revisa también «Spam».');
          var cod = prompt('Escribe el código que te llegó a ' + e + ':'); if(!cod) return;
          var p1 = prompt('Escribe tu contraseña nueva (mínimo 6 caracteres):'); if(!p1) return;
          if(p1.length < 6) return msg('La contraseña debe tener al menos 6 caracteres.', true);
          return verificarCorreo(e, cod).then(function(){ return nuevaClave(p1); }).then(function(){ st.email = e; guardarSt(); msg('✅ Contraseña cambiada. Ya entraste.'); pintar(); });
        }); });
      };
      q('nubeCambiarCfg').onclick = function(){ if(confirm('¿Desconectar esta base de datos de este celular?')){ localStorage.removeItem(K_CFG); sb = null; pintar(); } };
      return;
    }
    if(!st.negocio){
      c.innerHTML = '<p class="nube-p">Conectado como <b>' + esc(st.email) + '</b>.</p><div id="nubeLista" class="nube-p">Buscando tus negocios…</div>' +
        '<button type="button" class="btn-primary" id="nubeSubirEste">☁️ Subir el negocio de este celular a la nube</button>' +
        '<div class="nube-fila"><input id="nubeCodigo" placeholder="Código de invitación" autocapitalize="characters" maxlength="12"><button type="button" class="btn-ghost" id="nubeUnirme">Unirme</button></div>' +
        '<button type="button" class="auth-link" id="nubeSalir">Cerrar sesión de la nube</button>';
      misNegocios().then(function(l){
        var box = q('nubeLista'); if(!box) return;
        if(!l || !l.length){ box.textContent = 'Todavía no perteneces a ningún negocio: sube el de este celular o únete con un código.'; return; }
        box.innerHTML = '<b>Tus negocios:</b>' + l.map(function(n, i){ return '<div class="nube-li"><span>' + esc(n.nombre) + ' <small>· ' + ROLES[n.rol] + '</small></span><button type="button" class="btn-ghost" data-elegir="' + i + '">Usar este</button></div>'; }).join('');
        box.querySelectorAll('[data-elegir]').forEach(function(b){ b.onclick = function(){
          var n = l[+b.dataset.elegir];
          if(!confirm('Se cargarán en este celular los datos de «' + n.nombre + '» que están en la nube. Lo que hay ahora en este celular se reemplaza (queda un punto de restauración local). ¿Seguir?')) return;
          accion(b, function(){ return elegir(n).then(function(){ msg('✅ Listo: este celular ya usa «' + n.nombre + '».'); pintar(); entrarApp(); }); });
        }; });
      }).catch(function(e){ var box = q('nubeLista'); if(box) box.textContent = msgError(e); });
      q('nubeSubirEste').onclick = function(){ var d = datosApp() || {}; var nom = prompt('Nombre del negocio en la nube:', d.businessName || 'Mi negocio'); if(!nom) return;
        accion(this, function(){ return crearNegocio(nom.trim()).then(function(){ msg('✅ Tu negocio ya está en la nube. Ahora invita a tu equipo.'); pintar(); entrarApp(); }); }); };
      q('nubeUnirme').onclick = function(){ var cod = q('nubeCodigo').value.trim(); if(!cod) return msg('Escribe el código que te dio el dueño.', true);
        accion(this, function(){ return unirse(cod, st.nombre).then(function(){ msg('✅ Te uniste a «' + st.negocio.nombre + '».'); pintar(); entrarApp(); }); }); };
      q('nubeSalir').onclick = function(){ accion(this, function(){ return salir().then(pintar); }); };
      return;
    }
    var manda = st.negocio.rol === 'dueno' || st.negocio.rol === 'admin';
    c.innerHTML = '<p class="nube-p" id="nubeEstadoTxt">' + esc(textoEstado()) + '</p>' +
      '<button type="button" class="btn-primary" id="nubeSync">🔄 Sincronizar ahora</button>' +
      (manda ? '<div class="nube-fila"><select id="nubeRolInv"><option value="mesero">Mesero</option><option value="cajero">Cajero</option>' + (st.negocio.rol === 'dueno' ? '<option value="admin">Administrador</option>' : '') + '</select><button type="button" class="btn-ghost" id="nubeInvitar">➕ Invitar</button></div><div id="nubeInvRes"></div>' : '') +
      '<div id="nubeMiembros" class="nube-p">Cargando el equipo…</div>' +
      (manda ? '<details><summary>🗂️ Respaldos en la nube</summary><div id="nubeResp" class="nube-p">…</div></details>' : '') +
      (manda ? '<button type="button" class="btn-ghost" id="nubeLinkCfg">📋 Copiar link para conectar otro celular</button>' : '') +
      '<div class="nube-fila"><button type="button" class="btn-ghost" id="nubeOtro">Cambiar de negocio</button><button type="button" class="btn-ghost" id="nubeSalir">Cerrar sesión de la nube</button></div>';
    q('nubeSync').onclick = function(){ accion(this, function(){ return (st.sucio ? subir() : bajar()).then(function(){ msg('✅ Al día.'); var e = q('nubeEstadoTxt'); if(e) e.textContent = textoEstado(); }); }); };
    if(manda){
      q('nubeInvitar').onclick = function(){ var rol = q('nubeRolInv').value; accion(this, function(){ return invitar(rol).then(function(cod){
        q('nubeInvRes').innerHTML = '<p class="nube-p">Código para un <b>' + ROLES[rol] + '</b> (un solo uso, vence en 7 días):</p><div class="nube-cod">' + esc(cod) + '</div><p class="nube-p">La persona abre Vento en su celular → «☁️ Entrar con Vento Nube» → crea su cuenta → escribe este código.</p>'; }); }); };
      q('nubeLinkCfg').onclick = function(){ var u = linkConfig(); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function(){ msg('📋 Link copiado: mándalo por WhatsApp a tu equipo.'); }, function(){ prompt('Copia este link:', u); }); };
      respaldos().then(function(l){ var b = q('nubeResp'); if(!b) return; if(!l.length){ b.textContent = 'Aún no hay respaldos (se crea uno por hora mientras se usa la app).'; return; }
        b.innerHTML = l.map(function(r){ return '<div class="nube-li"><span>' + new Date(r.creado_en).toLocaleString('es-CO') + ' <small>· v' + r.version + '</small></span><button type="button" class="btn-ghost" data-rest="' + r.id + '">Restaurar</button></div>'; }).join('');
        b.querySelectorAll('[data-rest]').forEach(function(x){ x.onclick = function(){ if(!confirm('¿Volver los datos de TODOS los celulares a ese momento? Lo actual queda guardado como otro respaldo.')) return; accion(x, function(){ return restaurar(+x.dataset.rest).then(function(){ msg('✅ Restaurado.'); }); }); }; });
      }).catch(function(e){ var b = q('nubeResp'); if(b) b.textContent = msgError(e); });
    }
    miembros().then(function(l){
      var b = q('nubeMiembros'); if(!b) return;
      b.innerHTML = '<b>Equipo (' + l.length + '):</b>' + l.map(function(m){
        var yo = m.email === st.email, puede = !yo && m.rol !== 'dueno' && (st.negocio.rol === 'dueno' || (st.negocio.rol === 'admin' && (m.rol === 'cajero' || m.rol === 'mesero')));
        return '<div class="nube-li"><span>' + esc(m.nombre || m.email || 'Sin nombre') + ' <small>· ' + esc(m.email || '') + ' · ' + ROLES[m.rol] + (yo ? ' · tú' : '') + '</small></span>' +
          (puede && st.negocio.rol === 'dueno' ? '<select data-rol="' + esc(m.usuario_id) + '"><option value="mesero"' + (m.rol === 'mesero' ? ' selected' : '') + '>Mesero</option><option value="cajero"' + (m.rol === 'cajero' ? ' selected' : '') + '>Cajero</option><option value="admin"' + (m.rol === 'admin' ? ' selected' : '') + '>Admin</option></select>' : '') +
          (puede ? '<button type="button" class="btn-ghost" data-quitar="' + esc(m.usuario_id) + '">Quitar</button>' : '') + '</div>';
      }).join('');
      b.querySelectorAll('[data-quitar]').forEach(function(x){ x.onclick = function(){ if(!confirm('¿Quitarle el acceso a esta persona? Ya no verá el negocio.')) return; accion(x, function(){ return quitar(x.dataset.quitar).then(pintar); }); }; });
      b.querySelectorAll('[data-rol]').forEach(function(x){ x.onchange = function(){ accion(null, function(){ return cambiarRol(x.dataset.rol, x.value).then(function(){ msg('✅ Rol cambiado.'); }); }); }; });
    }).catch(function(e){ var b = q('nubeMiembros'); if(b) b.textContent = msgError(e); });
    q('nubeOtro').onclick = function(){ accion(this, function(){ var p = st.sucio ? subir() : Promise.resolve(); return p.then(function(){ clearInterval(tPoll); delete st.negocio; st.version = 0; guardarSt(); pintar(); }); }); };
    q('nubeSalir').onclick = function(){ if(!confirm('¿Cerrar la sesión de la nube en este celular? Los datos se quedan aquí y en la nube.')) return; accion(this, function(){ return salir().then(pintar); }); };
  }
  function entrarApp(){ if(typeof alEntrar === 'function'){ var f = alEntrar; alEntrar = null; setTimeout(function(){ cerrar(); f(st.email); }, 700); } }

  // ---------- API para la app ----------
  window.ventoNube = {
    configurada: configurada, abrir: abrir, cambio: cambio, subir: subir, bajar: bajar, estado: textoEstado,
    correo: function(){ return st.negocio ? st.email : null; },
    rolActivo: function(){ return st.negocio ? st.negocio.rol : null; },
    // Para el módulo de pagos (nube/vento-pagos.js): mismo cliente, sesión y negocio.
    negocio: function(){ return st.negocio && configurada() ? { id: st.negocio.id, nombre: st.negocio.nombre, rol: st.negocio.rol } : null; },
    cliente: cliente, config: cfg,
    msgError: msgError, codigoCorreo: codigoCorreo, verificarCorreo: verificarCorreo, nuevaClave: nuevaClave, soltarSesion: soltarSesion,
    _fusionar: fusionar
  };
  if(st.negocio && configurada()){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar(); }
})();
