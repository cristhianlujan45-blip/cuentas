/* =====================================================================
   Vento · Suscripción del negocio en Vento Nube (lado de la app)

   Vento es un servicio por suscripción. Con el negocio en Vento Nube, el SERVIDOR decide el plan
   (Edge Function «vento-suscripciones»); esta parte solo consulta el estado, lo muestra y manda pagos.
   • POST /estado al abrir, cada 30 min, al volver a la app y después de enviar un pago.
   • El servidor manda un token FIRMADO (ECDSA P-256). Se verifica con la llave pública de GET /clave
     (se fija la 1ª vez en este celular: «vento_sub_clave») y se guarda en «vento_sub_token:<negocio>»
     para seguir funcionando sin internet hasta su «h». Nunca se usa un dato sin firma: un flag puesto
     a mano en el celular no da nada.
   • La suscripción es de la CUENTA + el NEGOCIO (no del celular): otro celular con la misma sesión
     recibe el mismo estado del servidor.
   • Pagos con proveedores intercambiables: ManualPaymentProvider (Nequi / DaviPlata + comprobante,
     aprobación humana: BETA) y GooglePlayPaymentProvider (solo arquitectura, todavía no se usa).
     La pantalla de planes no conoce los detalles del medio de pago.
   • Solo dueño y administrador ven precios y pagos; cajero y mesero no ven nada de cobros de Vento.
   Sin Vento Nube no hace nada: la app sigue con el sistema de siempre (prueba gratis + licencias).
   ===================================================================== */
(function(){
  'use strict';
  var K_CLAVE = 'vento_sub_clave', K_TOKEN = 'vento_sub_token:', K_INFO = 'vento_sub_info:', K_IDEM = 'vento_sub_idem:',
      K_BORRADOR = 'vento_sub_borrador:', K_PAGADOR = 'vento_sub_pagador', K_CAT = 'vento_sub_catalogo';
  var REFRESCO_MS = 30 * 60e3, H72 = 72 * 3600e3, DIA = 864e5;
  // Lo mínimo del plan gratis: con el token vencido y sin internet se sigue vendiendo (pero sin funciones PRO).
  var BASE_GRATIS = ['pos_basic', 'tables', 'inventory', 'expenses'];
  var BENEFICIOS = {
    pos_basic: 'Ventas, caja y cuentas', tables: 'Mesas y pedidos', inventory: 'Inventario', expenses: 'Gastos y contabilidad',
    invoices: 'Facturas de proveedor', ocr: 'Leer facturas con la cámara', ai_camera: 'Cámara con IA', voice: 'Pedidos por voz y «Hola Vento»',
    advanced_reports: 'Estadísticas avanzadas', multi_branch: 'Varias sedes', employee_management: 'Tu equipo: invitar personas y roles'
  };
  var METODOS = { NEQUI: { nombre: 'Nequi', color: '#da0081' }, DAVIPLATA: { nombre: 'DaviPlata', color: '#ed1c27' } };
  var ERRORES = {
    plan_invalido: 'Ese plan no está disponible ahora.', metodo_invalido: 'Elige Nequi o DaviPlata.', monto_invalido: 'Escribe el valor que pagaste.',
    monto_insuficiente: 'El valor pagado es menor que el precio del plan.', pago_en_revision: 'Ya tienes un pago en revisión. Te avisamos apenas lo revisemos.',
    referencia_usada: 'Esa referencia ya se usó en otro pago. Revísala.', comprobante_repetido: 'Ese comprobante ya se había enviado.',
    comprobante_invalido: 'La foto del comprobante no sirve: debe ser una imagen de menos de 3 MB.', sin_permiso: 'Solo el dueño o el administrador pueden pagar el plan.',
    sin_sesion: 'Entra a Vento Nube para ver y pagar tu plan.', red: 'Sin conexión con el servidor de Vento. Revisa el internet e inténtalo otra vez.'
  };

  // ---------- Utilidades ----------
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function lsGet(k, d){ try{ var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; }catch(e){ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
  function toast(t, ms){ try{ window.showToast && window.showToast(t, ms || 5000); }catch(e){} }
  var plata = function(n){ return '$' + Math.round(+n || 0).toLocaleString('es-CO'); };
  var dos = function(n){ return (n < 10 ? '0' : '') + n; };
  // dd/mm/aaaa en hora de Colombia (UTC-5, sin horario de verano), igual en todos los celulares.
  function fecha(ms){ if(!ms) return ''; var d = new Date(+ms - 5 * 3600e3); return dos(d.getUTCDate()) + '/' + dos(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); }
  function hoyISO(){ var d = new Date(); return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()); }
  var aMs = function(x){ if(!x) return 0; if(typeof x === 'number') return x; var t = Date.parse(x); return isNaN(t) ? 0 : t; };
  var telefono = function(t){ t = String(t || '').replace(/\D/g, ''); return t.length === 10 ? t.slice(0, 3) + ' ' + t.slice(3, 6) + ' ' + t.slice(6) : t; };
  function idAzar(){ var a = new Uint8Array(12); try{ crypto.getRandomValues(a); }catch(e){ for(var i = 0; i < a.length; i++) a[i] = Math.random() * 256 | 0; } return 'vs-' + Date.now().toString(36) + '-' + Array.prototype.map.call(a, function(b){ return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function nube(){ return window.ventoNube || null; }
  function negocio(){ try{ var n = nube(); return n && n.negocio ? n.negocio() : null; }catch(e){ return null; } }
  function enCuenta(){ return !!negocio(); }

  // ---------- Servidor ----------
  function base(){ return nube().config().url.replace(/\/+$/, '') + '/functions/v1/vento-suscripciones'; }
  function conTiempo(ms){ var c = window.AbortController ? new AbortController() : null; return { signal: c ? c.signal : undefined, t: setTimeout(function(){ try{ c && c.abort(); }catch(e){} }, ms) }; }
  function errorDe(codigo, mensaje, status){ return Object.assign(new Error(mensaje || ERRORES[codigo] || codigo), { codigo: codigo, status: status || 0 }); }
  function sesion(){
    return nube().cliente().then(function(c){ return c.auth.getSession(); })
      .then(function(r){ return r && r.data && r.data.session ? r.data.session.access_token : null; });
  }
  // Rutas con sesión (POST): mismo formato que vento-pagos ({ok:false, error, mensaje} con el status).
  function api(ruta, cuerpo, ms){
    return sesion().then(function(tok){
      if(!tok) throw errorDe('sin_sesion');
      var x = conTiempo(ms || 20000);
      return fetch(base() + '/' + ruta, { method: 'POST', signal: x.signal, headers: { 'Content-Type': 'application/json', apikey: nube().config().key, Authorization: 'Bearer ' + tok }, body: JSON.stringify(cuerpo || {}) })
        .then(function(r){ clearTimeout(x.t); return r.json().catch(function(){ return {}; }).then(function(j){
          if(!r.ok || j.ok === false) throw errorDe(j.error || ('http_' + r.status), j.mensaje, r.status);
          return j;
        }); }, function(){ clearTimeout(x.t); throw errorDe('red'); });
    });
  }
  // Rutas públicas (GET sin cabeceras: no necesitan sesión).
  function publico(ruta){
    var x = conTiempo(12000);
    return fetch(base() + '/' + ruta, { signal: x.signal }).then(function(r){ clearTimeout(x.t); if(!r.ok) throw errorDe('http_' + r.status, null, r.status); return r.json(); }, function(){ clearTimeout(x.t); throw errorDe('red'); });
  }

  // ---------- Firma del servidor (ECDSA P-256) ----------
  function b64u(s){ s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while(s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for(var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  // Por si el servidor firmara en formato DER: WebCrypto pide r||s (64 bytes).
  function derAPlano(der){
    if(der.length < 8 || der[0] !== 0x30) return der;
    var i = (der[1] & 0x80) ? 2 + (der[1] & 0x7f) : 2, out = new Uint8Array(64);
    for(var k = 0; k < 2; k++){
      if(der[i] !== 0x02) return der;
      var len = der[i + 1], v = der.subarray(i + 2, i + 2 + len); i += 2 + len;
      while(v.length > 32 && v[0] === 0) v = v.subarray(1);
      if(v.length > 32) return der;
      out.set(v, k * 32 + 32 - v.length);
    }
    return out;
  }
  function jwkDe(j){
    var k = j && (j.jwk || j.clave || j.publica || j.key || (j.kty ? j : null));
    if(typeof k === 'string'){ try{ k = JSON.parse(k); }catch(e){ k = null; } }
    return k && k.kty === 'EC' && k.x && k.y ? { kty: 'EC', crv: k.crv || 'P-256', x: String(k.x), y: String(k.y) } : null;
  }
  var mismaClave = function(a, b){ return !!(a && b && a.x === b.x && a.y === b.y); };
  var llaves = {};
  function importar(jwk){
    var id = jwk.x + '.' + jwk.y;
    if(!llaves[id]) llaves[id] = crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return llaves[id];
  }
  // Devuelve el contenido del token solo si la firma es auténtica con esa llave.
  function firmaOk(jwk, tok){
    var m = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(tok || ''));
    if(!m || !jwk || !(window.crypto && crypto.subtle)) return Promise.resolve(null);
    return Promise.resolve().then(function(){
      var sig = b64u(m[2]); if(sig.length !== 64) sig = derAPlano(sig);
      return importar(jwk).then(function(k){ return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, sig, new TextEncoder().encode(m[1])); })
        .then(function(ok){ if(!ok) return null; var p = JSON.parse(new TextDecoder().decode(b64u(m[1]))); return p && typeof p === 'object' ? p : null; });
    }).catch(function(){ return null; });
  }
  /* Verifica con la llave fijada en este celular. Si no hay o no coincide y hay internet, se le pide la
     llave al servidor y se compara: si el servidor tiene otra (la cambió, o alguien tocó la del celular),
     manda la del servidor. Sin internet solo sirve la fijada. */
  function verificar(tok, negId, conServidor){
    var pin = jwkDe(lsGet(K_CLAVE, null));
    return firmaOk(pin, tok).then(function(p){
      if(p || !conServidor) return p;
      return publico('clave').then(jwkDe).then(function(srv){
        if(!srv || mismaClave(srv, pin)) return null;
        return firmaOk(srv, tok).then(function(p2){ if(p2) lsSet(K_CLAVE, srv); return p2; });
      }).catch(function(){ return null; });
    }).then(function(p){ return p && p.t === 'vento-sub' && p.n === negId ? p : null; });
  }

  // ---------- Estado ----------
  // p: contenido verificado del token (lo único que decide); info: lo último que dijo el servidor (solo para mostrar).
  // recibido: hora de ESTE celular en que llegó del servidor (así un reloj adelantado no apaga el plan).
  var E = { neg: null, p: null, info: null, recibido: 0, ultimo: 0, error: '', cargando: null, cat: null, catProm: null };
  // Un token del plan gratis no da nada PRO: vale al menos 72 h desde que se emitió.
  var hastaDe = function(p){ var h = +p.h || 0; return p.p === 'free' ? Math.max(h, (+p.i || 0) + H72) : h; };
  function vivo(p){
    if(!p) return false;
    if(p === E.p && E.recibido) return Date.now() < E.recibido + (hastaDe(p) - (+p.i || 0));
    return Date.now() < hastaDe(p);                                   // guardado en el celular (sin internet)
  }
  function ents(){
    var p = E.p; if(!p) return [];
    var e = Array.isArray(p.e) ? p.e.map(String) : [];
    return vivo(p) ? e : e.filter(function(x){ return BASE_GRATIS.indexOf(x) >= 0; });   // token vencido: solo lo básico
  }
  function rolActual(){ var n = negocio(); return (E.p && E.info && E.info.rol) || (n && n.rol) || null; }
  var manda = function(){ var r = rolActual(); return r === 'dueno' || r === 'admin'; };
  function estado(){
    var n = negocio(), p = E.p, info = (p && E.info) || {}, sub = info.subscription || {};
    var viva = vivo(p), status = p ? (p.s === 'active' && !viva ? 'expired' : String(p.s || '')) : null;
    var vence = p ? (+p.v || aMs(sub.expiry_date)) : 0, prueba = sub.source === 'trial';
    var dias = vence ? Math.max(0, Math.ceil((vence - Date.now()) / DIA)) : null;
    var avisoDias = (E.cat && E.cat.cfg && +E.cat.cfg.renew_notice_days) || 7;
    var ultimo = info.last_payment || null, planSub = String(sub.plan_id || (p && p.p !== 'free' ? p.p : '') || '');
    /* Pago rechazado: con la suscripción «rejected», o con el plan TODAVÍA activo (una renovación anticipada que
       no se aprobó: el servidor deja la suscripción activa hasta su fecha). En ese caso solo cuenta si se rechazó
       después del último cambio de la suscripción (si luego se renovó o el admin dio meses, ya no se muestra). */
    var motivo = String((ultimo && (ultimo.reject_reason || ultimo.motivo)) || '');
    var rechazo = status === 'rejected' ? motivo :
      (p && ultimo && ultimo.status === 'rejected' && !info.pending_payment && aMs(ultimo.rejected_at) >= aMs(sub.updated_at)) ? (motivo || 'no se pudo comprobar el pago') : '';
    return {
      enCuenta: !!n, verificado: !!p, negocio: n ? n.id : null, rol: rolActual(), manda: manda(),
      status: status, plan: p ? (viva ? String(p.p || 'free') : 'free') : null, planSub: planSub, entitlements: ents(), vence: vence || null, dias: dias, prueba: prueba,
      revision: !!p && (status === 'payment_review' || !!info.pending_payment), pago: info.pending_payment || null, ultimoPago: ultimo,
      rechazo: rechazo,
      // Lo decide el servidor (renew_notice); sin internet se calcula con los días de aviso.
      renovar: status === 'active' && !prueba && (!!info.renew_notice || (!E.recibido && !!vence && vence - Date.now() <= avisoDias * DIA)),
      sinInternet: E.error === 'red', ultimo: E.ultimo
    };
  }
  function nombrePlan(id){ id = String(id || 'free'); var pl = E.cat && E.cat.planes.filter(function(x){ return x.id === id; })[0]; return pl && pl.id !== 'free' ? String(pl.nombre).toUpperCase() : id.toUpperCase(); }
  // Lo que usa index.html (subEstado) cuando el negocio está en la nube y hay estado verificado.
  function estadoApp(){
    var s = estado(); if(!s.verificado) return null;
    var x = { nube: true, status: s.status, plan: nombrePlan(s.status === 'active' ? s.plan : s.planSub || s.plan), v: s.vence || 0, dias: s.dias, renovar: s.renovar, revision: s.revision, motivo: s.rechazo };
    x.k = s.status === 'active' ? (s.prueba ? 'prueba' : 'activa') : s.status === 'payment_review' ? 'revision' : s.status === 'rejected' ? 'rechazada' :
      s.status === 'canceled' ? 'cancelada' : s.status === 'expired' ? 'vencida' : 'gratis';
    return x;
  }
  var antes = '';
  function avisar(){
    var s = estado(), clave = s.status + '|' + s.plan;
    if(antes && s.verificado && s.manda && s.status === 'active' && antes.indexOf('active|') !== 0 && !s.prueba) toast('✅ ¡Tu plan ' + nombrePlan(s.plan) + ' quedó activo! Gracias.', 8000);
    antes = s.verificado ? clave : '';
    try{ window.dispatchEvent(new CustomEvent('vento-suscripcion', { detail: s })); }catch(e){}
    if(ov && ov.classList.contains('show') && (ov.dataset.pantalla === 'inicio' || ov.dataset.pantalla === 'revision') && pila.length) pila[pila.length - 1]();
  }
  function cargarGuardado(){
    var n = negocio(); if(!n) return Promise.resolve();
    var tok = null; try{ tok = localStorage.getItem(K_TOKEN + n.id); }catch(e){}
    if(!tok) return Promise.resolve();
    return verificar(tok, n.id, false).then(function(p){
      if(!p || E.neg !== n.id || E.p) return;                        // ya llegó algo más nuevo del servidor
      if(Date.now() + 10 * 60e3 < (+p.i || 0)) return;               // el reloj del celular se atrasó a mano: no se confía
      E.p = p; E.info = lsGet(K_INFO + n.id, null); avisar();
    });
  }
  // forzar: si ya había una consulta en camino (de antes de pagar), se hace otra al terminar.
  function refrescar(forzar){
    var n = negocio(); if(!n) return Promise.resolve(estado());
    if(E.cargando) return forzar === true ? E.cargando.then(function(){ return refrescar(); }) : E.cargando;
    var id = n.id;
    E.cargando = api('estado', { negocio: id }).then(function(j){
      if(E.neg !== id) return;
      var tok = j.token, info = Object.assign({}, j); delete info.token; delete info.ok;
      return verificar(tok, id, true).then(function(p){
        if(E.neg !== id) return;
        E.ultimo = Date.now();
        if(p){ E.p = p; E.recibido = Date.now(); E.info = info; E.error = ''; try{ localStorage.setItem(K_TOKEN + id, tok); }catch(e){} lsSet(K_INFO + id, info); }
        else { E.p = null; E.recibido = 0; E.info = null; E.error = 'firma'; lsDel(K_TOKEN + id); lsDel(K_INFO + id); }
      });
    }).catch(function(e){
      E.error = (e && e.codigo) || 'red';
      // Ya no es miembro del negocio: se olvida el plan guardado. Sin internet queda lo verificado.
      if(e && e.status === 403){ E.p = null; E.info = null; lsDel(K_TOKEN + id); lsDel(K_INFO + id); }
    }).then(function(){ E.cargando = null; avisar(); return estado(); });
    return E.cargando;
  }
  function cambiarNegocio(id){
    var habia = !!E.neg;
    E = { neg: id, p: null, info: null, recibido: 0, ultimo: 0, error: '', cargando: null, cat: E.cat, catProm: null }; antes = '';
    if(!id){ if(habia) avisar(); return; }                 // sin nube: no se toca nada de la app
    cargarGuardado().catch(function(){}).then(refrescar);
  }

  // ---------- Catálogo de planes (precios del servidor) ----------
  function leerCatalogo(j){
    var c = (j && (j.catalogo || j)) || {};
    var planes = (c.planes || c.plans || []).map(function(p){
      var en = p.entitlements || p.ents || [];
      if(!Array.isArray(en)) en = Object.keys(en).filter(function(k){ return en[k]; });
      return { id: String(p.id), nombre: String(p.name || p.nombre || p.id), precio: Math.round(+(p.price != null ? p.price : p.precio) || 0), meses: +p.period_months || 1,
        desc: String(p.description || p.descripcion || ''), orden: +p.sort || 0, ents: en.map(String), activo: p.active !== false };
    }).filter(function(p){ return p.activo; }).sort(function(a, b){ return a.orden - b.orden || a.precio - b.precio; });
    var prov = (j && (j.proveedores || c.proveedores)) || ['manual'];
    return { planes: planes, cfg: c.config || (j && j.config) || {}, proveedores: prov.map(function(x){ return typeof x === 'string' ? x : x && (x.id || x.proveedor); }).filter(Boolean) };
  }
  function cargarCatalogo(){
    if(E.catProm) return E.catProm;
    E.catProm = publico('planes').then(function(j){ E.cat = leerCatalogo(j); lsSet(K_CAT, j); return E.cat; })
      .catch(function(e){ E.catProm = null; var g = lsGet(K_CAT, null); if(g){ E.cat = leerCatalogo(g); return E.cat; } throw e; });
    return E.catProm;
  }
  (function(){ var g = lsGet(K_CAT, null); if(g) try{ E.cat = leerCatalogo(g); }catch(e){} })();

  // ---------- Proveedores de pago ----------
  var registro = [];
  function registrarProveedor(p){ registro = registro.filter(function(x){ return x.id !== p.id; }).concat([p]); }
  // El servidor dice cuáles hay (BETA → «manual»); se usa el primero que este celular pueda usar.
  function proveedorPara(cat){
    var orden = cat && cat.proveedores && cat.proveedores.length ? cat.proveedores : ['manual'];
    for(var i = 0; i < orden.length; i++){ var p = registro.filter(function(x){ return x.id === orden[i]; })[0]; try{ if(p && p.disponible(cat)) return p; }catch(e){} }
    return null;
  }

  /* Pago manual (BETA): la persona paga desde su app Nequi o DaviPlata, envía la foto del comprobante y
     el proveedor de Vento lo aprueba a mano. El servidor evita duplicados (idem, referencia y huella). */
  var ManualPaymentProvider = {
    id: 'manual', nombre: 'Nequi o DaviPlata',
    disponible: function(){ return true; },
    metodos: function(cat){
      var mm = (cat && cat.cfg && cat.cfg.manual_methods) || {};
      return Object.keys(METODOS).map(function(id){ var m = mm[id] || {}; return { id: id, nombre: METODOS[id].nombre, color: METODOS[id].color, numero: String(m.numero || '').replace(/\s+/g, ''), titular: String(m.titular || '').trim() }; });
    },
    iniciar: function(ui, plan, metodo){
      var m = metodo && this.metodos(E.cat).filter(function(x){ return x.id === metodo; })[0];
      if(m) ui.ir(pInstrucciones(ui, plan, m)); else ui.ir(pMetodo(ui, plan));
    },
    registrarPago: function(entrada){ return api('pago', entrada, 90000); }
  };
  /* Google Play Billing (FUTURO, no es el método principal): solo existe la arquitectura. Se ofrece únicamente
     si la APK lo anuncia (VentoAndroid.billingDisponible) y el servidor lo lista en «proveedores».
     Flujo previsto: VentoAndroid compra el producto (plans.google_play_product_id) → purchaseToken →
     el servidor lo verifica con Google y activa la suscripción por el mismo punto único (srv_sub_activar). */
  var GooglePlayPaymentProvider = {
    id: 'google_play', nombre: 'Google Play',
    disponible: function(cat){
      var A = window.VentoAndroid, b = A && A.billingDisponible;
      var si = false; try{ si = typeof b === 'function' ? !!b.call(A) : !!b; }catch(e){}
      return si && !!(cat && cat.proveedores && cat.proveedores.indexOf('google_play') >= 0);
    },
    iniciar: function(ui){ ui.msg('Pagar con Google Play todavía no está disponible. Usa Nequi o DaviPlata.', true); },
    registrarPago: function(){ return Promise.reject(errorDe('no_implementado', 'Google Play todavía no está disponible.')); }
  };
  registrarProveedor(ManualPaymentProvider);
  registrarProveedor(GooglePlayPaymentProvider);

  // ---------- Ventana ----------
  var ov = null, pila = [];
  function q(id){ return document.getElementById(id); }
  function ventana(){
    if(ov) return ov;
    ov = document.createElement('div'); ov.id = 'vsOv'; ov.className = 'overlay'; ov.setAttribute('data-novocab', '');
    ov.innerHTML = '<div class="modal vs-modal" role="dialog" aria-modal="true" aria-labelledby="vsTit"><div class="vs-cab">' +
      '<button type="button" class="vs-ic" id="vsAtras" data-vs="atras" aria-label="Atrás">‹</button><h2 id="vsTit">Tu plan Vento</h2>' +
      '<button type="button" class="vs-ic" data-vs="cerrar" aria-label="Cerrar">✕</button></div><div id="vsCuerpo"></div><div class="vs-msg" id="vsMsg" role="status" aria-live="polite"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){
      if(e.target === ov) return cerrar();
      var b = e.target.closest && e.target.closest('[data-vs],[data-copiar]'); if(!b) return;
      if(b.dataset.copiar != null) return copiar(b.dataset.copiar);
      var a = b.dataset.vs;
      if(a === 'cerrar') cerrar(); else if(a === 'atras') atras(); else if(a === 'planes') ir(vInicio(''));
      else if(a === 'renovar') pagarPlan(planParaRenovar()); else if(a === 'reintentar') reintentar();
    });
    window.addEventListener('keydown', function(e){ if(e.key === 'Escape' && ov.classList.contains('show')){ e.stopPropagation(); cerrar(); } }, true);
    return ov;
  }
  function msg(t, mal){ var m = q('vsMsg'); if(m){ m.textContent = t || ''; m.className = 'vs-msg' + (mal ? ' mal' : ''); } }
  function pantalla(nombre, titulo, html, enlazar){
    ventana(); ov.dataset.pantalla = nombre;
    q('vsTit').textContent = titulo; q('vsCuerpo').innerHTML = html; msg('');
    q('vsAtras').style.visibility = pila.length > 1 ? 'visible' : 'hidden';
    var md = ov.querySelector('.modal'); if(md) md.scrollTop = 0;
    if(enlazar) enlazar(q('vsCuerpo'));
  }
  function ir(fn){ pila.push(fn); fn(); }
  function atras(){ if(pila.length > 1){ pila.pop(); pila[pila.length - 1](); } else cerrar(); }
  function abrir(fn){ ventana(); pila = []; ir(fn); ov.classList.add('show'); }
  function cerrar(){ if(ov) ov.classList.remove('show'); pila = []; }
  function copiar(t){
    var ok = function(){ toast('📋 Copiado: ' + t, 3000); };
    try{ (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(ok, function(){ prompt('Copia esto:', t); }); }catch(e){ prompt('Copia esto:', t); }
  }
  // Lo que los proveedores usan para pintar sus pantallas (no conocen el resto de la ventana).
  var ui = { ir: ir, pantalla: pantalla, msg: msg, cerrar: cerrar, negocio: negocio, terminar: function(j){ pila = []; ir(vRevision(Object.assign({ t: Date.now() }, j))); refrescar(true); } };

  // ---------- Pantallas ----------
  function tarjetaEstado(s){
    if(!s.verificado) return '<div class="vs-estado"><b>Consultando tu plan…</b><small>' + (s.sinInternet ? 'No hay conexión con el servidor de Vento. Inténtalo con internet.' : 'Un momento.') + '</small></div>';
    var P = esc(nombrePlan(s.status === 'active' ? s.plan : s.planSub || s.plan)), f = fecha(s.vence);
    if(s.status === 'active' && s.prueba) return '<div class="vs-estado ok"><span class="vs-chip">' + P + '</span><b>🎁 Prueba gratis del plan ' + P + '</b><small>Te quedan ' + s.dias + ' día' + (s.dias === 1 ? '' : 's') + (f ? ' (hasta el ' + f + ')' : '') + '.</small></div>';
    if(s.status === 'active') return '<div class="vs-estado ok"><span class="vs-chip">' + P + '</span><b>Plan ' + P + ' activo' + (f ? ' · vence el ' + f : '') + '</b><small>' + (s.dias != null ? 'Te quedan ' + s.dias + ' día' + (s.dias === 1 ? '' : 's') + '. ' : '') + 'Sirve en todos los celulares de tu negocio.</small>' +
      (s.pago ? '<small>⏳ Tu renovación está en revisión.</small>' : '') +
      (s.rechazo ? '<small class="vs-rechazo">❌ Tu último pago no fue aprobado. Motivo: ' + esc(s.rechazo) + '</small>' : '') + '</div>';
    if(s.status === 'payment_review') return '<div class="vs-estado esp"><b>⏳ Pago en revisión</b><small>Recibimos tu comprobante' + (s.pago ? ' de ' + plata(s.pago.amount) + ' por ' + esc((METODOS[s.pago.method] || {}).nombre || s.pago.method || '') : '') + '. Apenas lo aprobemos se activa tu plan. Mientras tanto sigues vendiendo con el plan gratis.</small></div>';
    if(s.status === 'rejected') return '<div class="vs-estado mal"><b>❌ Tu pago no fue aprobado</b><small>Motivo: ' + esc(s.rechazo || 'no se pudo comprobar el pago') + '</small></div>';
    if(s.status === 'expired') return '<div class="vs-estado mal"><b>⌛ Tu plan ' + P + ' venció' + (f ? ' el ' + f : '') + '</b><small>' +
      (s.pago ? '⏳ Tu pago está en revisión: apenas lo aprobemos vuelve tu plan. Mientras tanto sigues vendiendo con el plan gratis.' : 'Sigues vendiendo con el plan gratis. Renueva para volver a usar la voz, la cámara con IA y lo demás.') + '</small></div>';
    if(s.status === 'canceled') return '<div class="vs-estado mal"><b>🚫 Suscripción cancelada</b><small>Estás en el plan gratis. Puedes volver a activar tu plan cuando quieras.</small></div>';
    return '<div class="vs-estado"><b>Elige tu plan</b><small>Estás en el plan gratis.</small></div>';
  }
  function planesHtml(s){
    var cat = E.cat;
    if(!cat) return '<div class="vs-estado"><small>' + (E.catError ? esc(E.catError) : 'Cargando planes…') + '</small></div>';
    if(!cat.planes.length) return '<div class="vs-estado"><small>No hay planes disponibles en este momento.</small></div>';
    var borr = lsGet(K_BORRADOR + s.negocio, null), actual = s.status === 'active' ? s.plan : 'free';
    var free = cat.planes.filter(function(p){ return !p.precio; })[0];
    return '<div class="vs-planes">' + cat.planes.map(function(p){
      var gratis = !p.precio, yo = p.id === actual, nom = gratis ? 'FREE' : String(p.nombre).toUpperCase();
      // Plan pago: «Todo lo de FREE, y además:» con solo lo que agrega (más fácil de leer).
      var extra = !gratis && free ? p.ents.filter(function(k){ return free.ents.indexOf(k) < 0; }) : p.ents;
      var todoFree = !gratis && free && extra.length < p.ents.length && free.ents.every(function(k){ return p.ents.indexOf(k) >= 0; });
      var lista = todoFree ? extra : p.ents, btn = '';
      if(!gratis && !s.revision){
        btn = '<button type="button" class="btn-primary vs-grande" data-pagar="' + esc(p.id) + '">' + (yo && !s.prueba ? 'RENOVAR ' : 'PAGAR ') + esc(nom) + '</button>';
        if(borr && borr.plan === p.id) btn += '<button type="button" class="btn-ghost vs-sec" data-instr="' + esc(p.id) + '">📋 VER INSTRUCCIONES</button>';
      }
      return '<div class="vs-plan' + (gratis ? '' : ' pago') + (yo ? ' yo' : '') + '" data-plan="' + esc(p.id) + '"><h3><span>' + esc(nom) + '</span>' + (yo ? '<em>Tu plan</em>' : '') + '</h3>' +
        '<div class="vs-precio">' + (gratis ? 'Gratis' : plata(p.precio) + '<small> / ' + (p.meses > 1 ? p.meses + ' meses' : 'mes') + '</small>') + '</div>' +
        (p.desc ? '<div class="vs-desc">' + esc(p.desc) + '</div>' : '') +
        (todoFree ? '<div class="vs-mas">Todo lo de FREE, y además:</div>' : '') +
        '<ul class="vs-ben">' + lista.map(function(k){ return '<li>' + esc(BENEFICIOS[k] || k) + '</li>'; }).join('') + '</ul>' + btn + '</div>';
    }).join('') + '</div>' + (s.revision ? '<p class="vs-nota">Ya tienes un pago en revisión: espera a que lo revisemos antes de enviar otro.</p>' : '') +
      '<p class="vs-nota">Tu plan es de tu cuenta y de tu negocio: sirve en todos tus celulares, aunque cambies de celular.</p>';
  }
  function vInicio(motivo){
    var fn = function(){
      var s = estado(), h = motivo ? '<div class="vs-aviso"><span>' + esc(motivo) + '</span></div>' : '';
      h += tarjetaEstado(s);
      if(!s.manda){
        pantalla('inicio', 'Plan del negocio', h + '<p class="vs-nota">Los pagos del plan los maneja el dueño o el administrador del negocio. Si necesitas una función PRO, pídeselo.</p><div class="vs-acciones"><button type="button" class="btn-primary vs-grande" data-vs="cerrar">Entendido</button></div>');
        return;
      }
      if(s.renovar && !s.pago && !s.rechazo) h += '<div class="vs-aviso" id="vsAvisoRenovar"><span>⏰ Tu suscripción vence el ' + fecha(s.vence) + '.</span><button type="button" class="btn-primary" data-vs="renovar">RENOVAR</button></div>';
      if(s.status === 'rejected' || s.rechazo) h += '<div class="vs-acciones vs-sep"><button type="button" class="btn-primary vs-grande" data-vs="reintentar">📸 Enviar otro comprobante</button></div>';
      h += planesHtml(s);
      pantalla('inicio', 'Tu plan Vento', h, function(c){
        c.querySelectorAll('[data-pagar]').forEach(function(b){ b.onclick = function(){ pagarPlan(b.dataset.pagar); }; });
        c.querySelectorAll('[data-instr]').forEach(function(b){ b.onclick = function(){ var d = lsGet(K_BORRADOR + s.negocio, {}); pagarPlan(b.dataset.instr, d.metodo); }; });
      });
      if(!E.cat) cargarCatalogo().catch(function(e){ E.catError = (e && e.message) || ERRORES.red; }).then(function(){ if(ov && ov.classList.contains('show') && pila[pila.length - 1] === fn) fn(); });
    };
    return fn;
  }
  function pagarPlan(id, metodo){
    var go = function(){
      var plan = E.cat && E.cat.planes.filter(function(p){ return p.id === id; })[0];
      if(!plan || !plan.precio) return msg(ERRORES.plan_invalido, true);
      if(!manda()) return msg(ERRORES.sin_permiso, true);
      // Ya hay un pago en revisión (por ejemplo, el plan venció antes de que lo aprobaran): no se paga dos veces.
      var st = estado(); if(st.revision) return ir(vRevision({ payment: st.pago }));
      var prov = proveedorPara(E.cat); if(!prov) return msg('No hay medios de pago disponibles ahora. Escríbenos por WhatsApp.', true);
      prov.iniciar(ui, plan, metodo);
    };
    if(E.cat) return go();
    msg('Cargando planes…'); cargarCatalogo().then(go, function(){ msg(ERRORES.red, true); });
  }
  function planParaRenovar(){
    var s = estado(), p = s.planSub && s.planSub !== 'free' ? s.planSub : (s.ultimoPago && s.ultimoPago.plan_id);
    if(!p && E.cat){ var pago = E.cat.planes.filter(function(x){ return x.precio > 0; })[0]; p = pago && pago.id; }
    return p || 'pro';
  }
  function reintentar(){ var u = estado().ultimoPago || {}; pagarPlan(u.plan_id || planParaRenovar(), u.method); }

  // Pantallas del pago manual
  function pMetodo(ui, plan){
    return function(){
      var ms = ManualPaymentProvider.metodos(E.cat);
      ui.pantalla('metodo', '¿Cómo vas a pagar?', '<div class="vs-resumen">Plan <b>' + esc(String(plan.nombre).toUpperCase()) + '</b> · <b>' + plata(plan.precio) + '</b> / ' + (plan.meses > 1 ? plan.meses + ' meses' : 'mes') + '</div>' +
        '<div class="vs-metodos">' + ms.map(function(m){ return '<button type="button" class="vs-metodo" data-metodo="' + m.id + '"><i style="background:' + m.color + '"></i><span>' + m.id + '<small>Desde tu app ' + esc(m.nombre) + '</small></span><b>›</b></button>'; }).join('') + '</div>' +
        '<p class="vs-nota">Versión BETA: pagas desde tu app y nos envías la foto del comprobante. Lo revisamos y activamos tu plan.</p>', function(c){
        c.querySelectorAll('[data-metodo]').forEach(function(b){ b.onclick = function(){ var m = ms.filter(function(x){ return x.id === b.dataset.metodo; })[0]; ui.ir(pInstrucciones(ui, plan, m)); }; });
      });
    };
  }
  function pInstrucciones(ui, plan, m){
    return function(){
      var n = negocio(); if(n) lsSet(K_BORRADOR + n.id, { plan: plan.id, metodo: m.id });
      var wa = String((E.cat && E.cat.cfg && E.cat.cfg.support_whatsapp) || '').replace(/\D/g, '');
      var h = '<div class="vs-dato"><span><small>Valor a pagar</small><b>' + plata(plan.precio) + '</b></span><button type="button" class="btn-ghost" data-copiar="' + plan.precio + '">Copiar</button></div>';
      if(m.numero){
        h += '<div class="vs-dato"><span><small>Número ' + esc(m.nombre) + '</small><b>' + esc(telefono(m.numero)) + '</b></span><button type="button" class="btn-ghost" data-copiar="' + esc(m.numero) + '">Copiar</button></div>' +
          (m.titular ? '<div class="vs-dato"><span><small>A nombre de</small><b>' + esc(m.titular) + '</b></span></div>' : '') +
          '<ol class="vs-pasos"><li>Abre tu app <b>' + esc(m.nombre) + '</b> y elige «Enviar plata».</li><li>Envía exactamente <b>' + plata(plan.precio) + '</b> al número ' + esc(telefono(m.numero)) + '.</li><li>Toma una captura del comprobante.</li><li>Vuelve aquí y toca «Ya pagué».</li></ol>' +
          '<div class="vs-acciones"><button type="button" class="btn-primary vs-grande" id="vsYaPague">✅ YA PAGUÉ · ENVIAR COMPROBANTE</button></div>';
      } else {
        h += '<div class="vs-estado esp"><b>' + esc(m.nombre) + ' todavía no está listo</b><small>Escríbenos y te decimos cómo pagar.' + (wa ? '' : ' Elige otro método.') + '</small></div>' +
          (wa ? '<div class="vs-acciones"><a class="btn-primary vs-grande vs-link" href="https://wa.me/' + esc(wa) + '?text=' + encodeURIComponent('Hola, quiero pagar el plan ' + plan.nombre + ' de Vento con ' + m.nombre + '.') + '" target="_blank" rel="noopener">💬 Escribir por WhatsApp</a></div>' : '');
      }
      ui.pantalla('instrucciones', 'Paga con ' + m.id, h, function(c){ var b = c.querySelector('#vsYaPague'); if(b) b.onclick = function(){ ui.ir(pComprobante(ui, plan, m)); }; });
    };
  }
  // Foto del comprobante: JPEG de máximo 1600 px y calidad 0.8 (más liviana para subir con datos).
  function comprimir(file){
    return new Promise(function(ok, mal){
      if(!file || !/^image\//.test(file.type || 'image/')) return mal(new Error('Elige una foto (imagen) del comprobante.'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){
        try{
          var w = img.naturalWidth, h = img.naturalHeight, f = Math.min(1, 1600 / Math.max(w, h, 1)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * f)); c.height = Math.max(1, Math.round(h * f));
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          var d = c.toDataURL('image/jpeg', 0.8);
          if(d.length > 3.9e6) d = c.toDataURL('image/jpeg', 0.6);     // ~2,9 MB: el servidor acepta hasta 3 MB
          URL.revokeObjectURL(url);
          ok({ dataUrl: d, base64: d.slice(d.indexOf(',') + 1), tipo: 'image/jpeg' });
        }catch(e){ URL.revokeObjectURL(url); mal(new Error('No se pudo preparar la foto. Prueba con otra.')); }
      };
      img.onerror = function(){ URL.revokeObjectURL(url); mal(new Error('Esa imagen no se pudo abrir. Prueba con otra foto.')); };
      img.src = url;
    });
  }
  var enviando = null;
  function pComprobante(ui, plan, m){
    var foto = null;
    return function(){
      var n = negocio() || {}, yo = lsGet(K_PAGADOR, {}), ms = ManualPaymentProvider.metodos(E.cat);
      ui.pantalla('comprobante', 'ENVÍA TU COMPROBANTE',
        '<div class="vs-form">' +
        '<div class="vs-fotos"><button type="button" id="vsFotoCam">📷 Tomar foto</button><button type="button" id="vsFotoGal">🖼️ Galería</button></div>' +
        '<input type="file" id="vsFileCam" accept="image/*" capture="environment" hidden><input type="file" id="vsFileGal" accept="image/*" hidden>' +
        '<img id="vsPrev" class="vs-prev" alt="Vista previa del comprobante"' + (foto ? ' src="' + foto.dataUrl + '"' : ' hidden') + '>' +
        '<label>Nombre<input id="vsNombre" autocomplete="name" maxlength="80" placeholder="El de la cuenta que pagó" value="' + esc(yo.nombre || '') + '"></label>' +
        '<label>Teléfono<input id="vsTel" type="tel" inputmode="numeric" autocomplete="tel" maxlength="15" placeholder="300 123 4567" value="' + esc(yo.tel || '') + '"></label>' +
        '<label>Negocio<input id="vsNegocio" readonly value="' + esc(n.nombre || '') + '"></label>' +
        '<div class="vs-fila"><label>Plan<input id="vsPlan" readonly data-plan="' + esc(plan.id) + '" value="' + esc(String(plan.nombre).toUpperCase()) + '"></label>' +
        '<label>Método<select id="vsMetodo">' + ms.map(function(x){ return '<option value="' + x.id + '"' + (x.id === m.id ? ' selected' : '') + '>' + x.id + '</option>'; }).join('') + '</select></label></div>' +
        '<label>Referencia (opcional)<input id="vsRef" maxlength="60" autocapitalize="characters" placeholder="Número del comprobante"></label>' +
        '<div class="vs-fila"><label>Valor pagado<input id="vsMonto" type="number" inputmode="numeric" min="1" step="1" value="' + plan.precio + '"></label>' +
        '<label>Fecha<input id="vsFecha" type="date" max="' + hoyISO() + '" value="' + hoyISO() + '"></label></div>' +
        '<button type="button" class="btn-primary vs-grande" id="vsEnviar">ENVIAR COMPROBANTE</button></div>', function(c){
        var cam = c.querySelector('#vsFileCam'), gal = c.querySelector('#vsFileGal'), prev = c.querySelector('#vsPrev');
        c.querySelector('#vsFotoCam').onclick = function(){ cam.click(); };
        c.querySelector('#vsFotoGal').onclick = function(){ gal.click(); };
        var elegir = function(inp){ var f = inp.files && inp.files[0]; inp.value = ''; if(!f) return; ui.msg('Preparando la foto…');
          comprimir(f).then(function(x){ foto = x; prev.src = x.dataUrl; prev.hidden = false; ui.msg(''); }, function(e){ ui.msg(e.message, true); }); };
        cam.onchange = function(){ elegir(cam); }; gal.onchange = function(){ elegir(gal); };
        c.querySelector('#vsEnviar').onclick = function(){ enviar(c, plan, function(){ return foto; }); };
      });
    };
  }
  function enviar(c, plan, laFoto){
    if(enviando) return enviando;                          // doble toque: una sola petición
    var n = negocio(), btn = c.querySelector('#vsEnviar'), v = function(id){ return String(c.querySelector('#' + id).value || '').trim(); };
    var foto = laFoto(), nombre = v('vsNombre'), tel = v('vsTel').replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, ''), monto = Math.round(+v('vsMonto') || 0), dia = v('vsFecha'), metodo = v('vsMetodo');
    if(!n) return msg(ERRORES.sin_sesion, true);
    if(!foto) return msg('Toma la foto del comprobante o elígela de la galería.', true);
    if(nombre.length < 3) return msg('Escribe tu nombre (el de la cuenta que pagó).', true);
    if(!/^\d{7,12}$/.test(tel)) return msg('Escribe tu número de teléfono.', true);
    if(monto <= 0) return msg(ERRORES.monto_invalido, true);
    if(monto < plan.precio) return msg('El valor pagado es menor que el precio del plan (' + plata(plan.precio) + ').', true);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia > hoyISO()) return msg('Revisa la fecha del pago.', true);
    // La misma llave (idem) mientras se reintenta: si el servidor ya lo recibió, no se crea otro pago.
    var guard = lsGet(K_IDEM + n.id, null),
      idem = guard && guard.idem && guard.plan === plan.id && Date.now() - (+guard.desde || 0) < 3600e3 ? guard.idem : idAzar();
    lsSet(K_IDEM + n.id, { idem: idem, plan: plan.id, desde: Date.now() });
    var cuerpo = { negocio: n.id, plan: plan.id, metodo: metodo, monto: monto, referencia: v('vsRef'), fecha: dia, nombre: nombre, telefono: tel, idem: idem, comprobante: { base64: foto.base64, tipo: foto.tipo } };
    btn.disabled = true; btn.textContent = '⏳ Enviando…'; msg('');
    enviando = ManualPaymentProvider.registrarPago(cuerpo).then(function(j){
      lsDel(K_IDEM + n.id);
      // El servidor dice que ese envío ya estaba (y ya no está en revisión): este comprobante NO se registró.
      if(j && j.repetido && j.payment && j.payment.status && j.payment.status !== 'review'){
        msg('Ese envío ya se había procesado antes. Toca ENVIAR COMPROBANTE otra vez para mandar este.', true); refrescar(); return;
      }
      lsDel(K_BORRADOR + n.id); lsSet(K_PAGADOR, { nombre: nombre, tel: tel });
      ui.terminar(Object.assign({ monto: monto, metodo: metodo }, j));
    }, function(e){
      msg((e && (ERRORES[e.codigo] || e.message)) || ERRORES.red, true);
      if(e && (e.codigo === 'pago_en_revision' || e.codigo === 'comprobante_repetido')){ lsDel(K_IDEM + n.id); refrescar(); }
    }).then(function(){ enviando = null; btn.disabled = false; btn.textContent = 'ENVIAR COMPROBANTE'; });
    return enviando;
  }
  function vRevision(j){
    var p = (j && j.payment) || {};
    return function(){
      var s = estado(), nuevo = s.verificado && E.ultimo > ((j && j.t) || 0);
      if(nuevo && !s.pago && (s.status === 'rejected' || s.rechazo)){   // lo rechazaron mientras se miraba esta pantalla
        pantalla('revision', 'Tu plan Vento', '<div class="vs-grande-ic">❌</div><h3 class="vs-centro">Tu pago no fue aprobado</h3><p class="vs-nota vs-centro">Motivo: ' + esc(s.rechazo || 'no se pudo comprobar el pago') + '</p>' +
          '<div class="vs-acciones"><button type="button" class="btn-primary vs-grande" data-vs="reintentar">📸 Enviar otro comprobante</button><button type="button" class="btn-ghost" data-vs="cerrar">Ahora no</button></div>');
        return;
      }
      if(nuevo && s.status === 'active' && !s.pago){   // ya lo aprobaron
        pantalla('revision', 'Tu plan Vento', '<div class="vs-grande-ic">✅</div><h3 class="vs-centro">¡Tu plan ' + esc(nombrePlan(s.plan)) + ' está activo!</h3><p class="vs-nota vs-centro">Vence el ' + fecha(s.vence) + '.</p><div class="vs-acciones"><button type="button" class="btn-primary vs-grande" data-vs="cerrar">Listo</button></div>');
        return;
      }
      var monto = p.amount || (j && j.monto), met = p.method || (j && j.metodo);
      pantalla('revision', 'Pago en revisión', '<div class="vs-grande-ic">⏳</div><h3 class="vs-centro">Pago en revisión</h3>' +
        '<p class="vs-nota vs-centro">Recibimos tu comprobante' + (monto ? ' de <b>' + plata(monto) + '</b>' : '') + (met ? ' por <b>' + esc((METODOS[met] || {}).nombre || met) + '</b>' : '') + '. Lo revisamos y activamos tu plan; te avisamos aquí mismo. Mientras tanto sigues vendiendo normal.</p>' +
        (j && j.repetido ? '<p class="vs-nota vs-centro">Ya lo habíamos recibido: no quedó repetido.</p>' : '') +
        '<div class="vs-acciones"><button type="button" class="btn-primary vs-grande" data-vs="cerrar">Entendido</button></div>');
    };
  }
  // «Función PRO»: la abre index.html cuando el plan del negocio no incluye esa función.
  function funcionPro(ent, nombre){
    var s = estado(), pl = E.cat && E.cat.planes.filter(function(p){ return p.precio > 0 && p.ents.indexOf(ent) >= 0; })[0];
    var P = pl ? String(pl.nombre).toUpperCase() : 'PRO', que = esc(nombre || BENEFICIOS[ent] || 'Esta función');
    abrir(function(){
      pantalla('pro', 'Función ' + P,'<div class="vs-grande-ic">⭐</div><p class="vs-centro"><b>' + que + '</b> es parte del plan ' + esc(P) + '.</p>' +
        (s.manda
          ? '<p class="vs-nota vs-centro">' + (s.status === 'expired' ? 'Tu plan venció: sigues vendiendo con el plan gratis. Renueva para volver a usarla.' : 'Actívalo y úsala en todos los celulares de tu negocio.') + '</p><div class="vs-acciones"><button type="button" class="btn-primary vs-grande" data-vs="planes">Ver planes</button><button type="button" class="btn-ghost" data-vs="cerrar">Ahora no</button></div>'
          : '<p class="vs-nota vs-centro">Pídele al dueño o al administrador del negocio que active el plan ' + esc(P) + '.</p><div class="vs-acciones"><button type="button" class="btn-primary vs-grande" data-vs="cerrar">Entendido</button></div>'));
    });
    if(!E.cat && s.manda) cargarCatalogo().catch(function(){});
  }
  function abrirPlanes(motivo){ abrir(vInicio(motivo || '')); if(!E.cat && manda()) cargarCatalogo().catch(function(){}); }
  function abrirRenovar(){ abrir(vInicio('')); pagarPlan(planParaRenovar()); }

  // ---------- Panel de Ajustes y barra de arriba (los pinta index.html) ----------
  function pintarPanel(el){
    if(!el) return;
    var s = estado();
    if(!s.verificado){ el.innerHTML = tarjetaEstado(s); return; }
    if(!s.manda){
      el.innerHTML = '<div class="lic-plan">Plan del negocio: <b>' + esc(nombrePlan(s.plan)) + '</b></div><div class="settings-desc">Los pagos del plan los maneja el dueño o el administrador del negocio.</div>';
      return;
    }
    var rechazado = s.status === 'rejected' || !!s.rechazo, otra = (s.renovar && !s.pago) || rechazado;
    el.innerHTML = tarjetaEstado(s) +
      '<div class="settings-desc">Tu plan es de tu cuenta y de tu negocio: sirve en todos tus celulares, aunque cambies de celular.</div>' +
      '<div class="mz-actions" style="flex-wrap:wrap">' + (s.renovar && !s.pago && !rechazado ? '<button class="btn-primary" type="button" data-panel="renovar">🔁 RENOVAR</button>' : '') +
      (rechazado ? '<button class="btn-primary" type="button" data-panel="reintentar">📸 Enviar otro comprobante</button>' : '') +
      '<button class="' + (otra ? 'btn-ghost' : 'btn-primary') + '" type="button" data-panel="planes">💳 Planes y pagos</button></div>';
    el.querySelectorAll('[data-panel]').forEach(function(b){ b.onclick = function(){ var a = b.dataset.panel; if(a === 'renovar') abrirRenovar(); else { abrirPlanes(''); if(a === 'reintentar') reintentar(); } }; });
  }
  function barra(){
    var s = estado(); if(!s.verificado || !s.manda) return { mostrar: false };
    var P = esc(nombrePlan(s.planSub || s.plan));
    // Renovación rechazada con el plan todavía activo: el motivo va primero (desde ahí se envía otro comprobante).
    if(s.status === 'active' && s.rechazo) return { mostrar: true, k: 'rechazada', fija: true, html: '<span>❌ Tu pago no fue aprobado: ' + esc(s.rechazo) + '</span><b>Ver ›</b>' };
    if(s.renovar && !s.pago) return { mostrar: true, k: 'renovar', accion: 'renovar', html: '<span>⏰ Tu suscripción vence el ' + fecha(s.vence) + '.</span><b data-sub="renovar">RENOVAR</b><i data-x title="Ocultar">✕</i>' };
    if(s.status === 'payment_review') return { mostrar: true, k: 'revision', html: '<span>⏳ <b>Pago en revisión</b>: te avisamos cuando se active tu plan.</span><b>Ver ›</b><i data-x title="Ocultar">✕</i>' };
    if(s.status === 'rejected') return { mostrar: true, k: 'rechazada', fija: true, html: '<span>❌ Tu pago no fue aprobado' + (s.rechazo ? ': ' + esc(s.rechazo) : '') + '</span><b>Ver ›</b>' };
    if(s.revision) return { mostrar: true, k: 'revision', html: '<span>⏳ <b>Pago en revisión</b>: te avisamos cuando se active tu plan.</span><b>Ver ›</b><i data-x title="Ocultar">✕</i>' };
    if(s.status === 'expired') return { mostrar: true, k: 'vencida', fija: true, accion: 'renovar', html: '<span>⌛ Tu plan ' + P + ' venció: sigues vendiendo con el plan gratis.</span><b data-sub="renovar">RENOVAR</b>' };
    if(s.status === 'active' && s.prueba && s.dias != null && s.dias <= 5) return { mostrar: true, k: 'prueba', html: '<span>🎁 Prueba ' + P + ': te quedan ' + s.dias + ' día' + (s.dias === 1 ? '' : 's') + '.</span><b>Ver planes ›</b><i data-x title="Ocultar">✕</i>' };
    return { mostrar: false };
  }

  // ---------- Estilos ----------
  var css = document.createElement('style');
  css.textContent =
    '#vsOv{z-index:10060}#vsOv .vs-modal{max-width:460px;padding:16px 16px 14px}' +
    '.vs-cab{display:flex;align-items:center;gap:8px;margin-bottom:12px}.vs-cab h2{flex:1;margin:0;font-size:clamp(15px,4.4vw,19px);line-height:1.2;text-align:center}' +
    '.vs-ic{width:38px;height:38px;flex:none;border-radius:50%;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font-size:18px;line-height:1;cursor:pointer}' +
    '.vs-estado{border-radius:16px;padding:14px;border:1px solid var(--line);background:var(--surface-2);margin-bottom:12px}.vs-estado b{display:block;font-size:16px;line-height:1.3}' +
    '.vs-estado small{display:block;color:var(--ink-soft);margin-top:4px;line-height:1.45;font-size:13px}.vs-estado small.vs-rechazo{color:var(--brick);font-weight:600}' +
    '.vs-estado.ok{border-color:color-mix(in srgb,var(--paid) 55%,var(--line));background:color-mix(in srgb,var(--paid) 10%,var(--surface-2))}' +
    '.vs-estado.esp{border-color:color-mix(in srgb,#f5a524 55%,var(--line));background:color-mix(in srgb,#f5a524 10%,var(--surface-2))}' +
    '.vs-estado.mal{border-color:color-mix(in srgb,var(--brick) 55%,var(--line));background:color-mix(in srgb,var(--brick) 10%,var(--surface-2))}' +
    '.vs-chip{display:inline-block;font:800 11px/1 var(--font-main);letter-spacing:.1em;padding:5px 9px;border-radius:999px;background:var(--amber);color:#fff;margin-bottom:8px}' +
    '.vs-planes{display:grid;gap:10px}.vs-plan{border:1.5px solid var(--line);border-radius:16px;padding:14px;background:var(--surface)}' +
    '.vs-plan.pago{border-color:var(--amber);box-shadow:0 0 0 3px color-mix(in srgb,var(--amber) 16%,transparent)}' +
    '.vs-plan h3{margin:0;font-size:14px;letter-spacing:.12em;display:flex;justify-content:space-between;align-items:center;gap:8px}.vs-plan h3 em{font:700 11px var(--font-main);letter-spacing:0;font-style:normal;color:var(--paid)}' +
    '.vs-precio{font:800 27px/1.15 var(--font-main);margin:6px 0 4px}.vs-precio small{font-size:13px;color:var(--ink-soft);font-weight:600}.vs-desc{font-size:13px;color:var(--ink-soft);margin-bottom:6px}' +
    '.vs-mas{font-size:12.5px;font-weight:700;color:var(--cream);margin:6px 0 0}.vs-acciones.vs-sep{margin:0 0 12px}' +
    '.vs-ben{list-style:none;margin:6px 0 12px;padding:0;font-size:13.5px;line-height:1.65}.vs-ben li::before{content:"✓  ";color:var(--paid);font-weight:800}' +
    '.vs-grande{display:block;width:100%;padding:14px;font-size:15px;border-radius:12px;letter-spacing:.03em;box-sizing:border-box}.vs-link{text-align:center;text-decoration:none}' +
    '.vs-sec{display:block;width:100%;margin-top:8px;padding:11px;font-size:13.5px;border-radius:12px}' +
    '.vs-resumen{text-align:center;font-size:14px;color:var(--ink-soft);margin:-2px 0 12px}.vs-resumen b{color:var(--ink)}' +
    '.vs-metodos{display:grid;gap:10px}.vs-metodo{display:flex;align-items:center;gap:14px;width:100%;min-height:68px;padding:14px 16px;border-radius:16px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);font:800 19px var(--font-main);letter-spacing:.08em;cursor:pointer;text-align:left}' +
    '.vs-metodo:active{transform:scale(.99)}.vs-metodo i{width:16px;height:16px;border-radius:50%;flex:none}.vs-metodo span{flex:1}.vs-metodo b{color:var(--ink-soft);font-size:22px}' +
    '.vs-metodo small{display:block;font:500 12.5px var(--font-main);letter-spacing:0;color:var(--ink-soft);margin-top:3px}' +
    '.vs-dato{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--line);border-radius:12px;margin-bottom:8px;background:var(--surface)}' +
    '.vs-dato span{flex:1;min-width:0}.vs-dato small{display:block;font-size:12px;color:var(--ink-soft)}.vs-dato b{display:block;font-size:19px;overflow-wrap:anywhere}' +
    '.vs-pasos{margin:10px 0 6px;padding-left:20px;font-size:13.5px;line-height:1.6;color:var(--ink-soft)}.vs-pasos b{color:var(--ink)}' +
    '.vs-form{display:flex;flex-direction:column;gap:10px}.vs-form label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--ink-soft);font-weight:600;min-width:0}' +
    '.vs-form input,.vs-form select{padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font:500 16px var(--font-main);width:100%;box-sizing:border-box;min-width:0}' +
    '.vs-form input[readonly]{opacity:.7}.vs-fila{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
    '.vs-fotos{display:grid;grid-template-columns:1fr 1fr;gap:8px}.vs-fotos button{min-height:58px;padding:12px 8px;border-radius:12px;border:1.5px dashed var(--line);background:var(--surface);color:var(--ink);font:700 14px var(--font-main);cursor:pointer}' +
    '.vs-prev{display:block;max-width:100%;max-height:240px;margin:0 auto;border-radius:12px;border:1px solid var(--line);object-fit:contain}.vs-prev[hidden]{display:none}' +
    '.vs-msg{min-height:18px;margin-top:10px;font-size:13.5px;text-align:center}.vs-msg.mal{color:var(--brick)}' +
    '.vs-aviso{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;border:1px solid color-mix(in srgb,#f5a524 50%,var(--line));background:color-mix(in srgb,#f5a524 12%,var(--surface));margin-bottom:12px;font-size:13.5px;line-height:1.4}' +
    '.vs-aviso span{flex:1}.vs-aviso .btn-primary{flex:none;padding:9px 14px;border-radius:999px}' +
    '.vs-centro{text-align:center}h3.vs-centro{margin:0 0 6px;font-size:18px}.vs-grande-ic{font-size:44px;line-height:1;margin:4px 0 10px;text-align:center}' +
    '.vs-nota{font-size:12.5px;color:var(--ink-soft);line-height:1.5;margin:10px 0 0}.vs-acciones{display:flex;flex-direction:column;gap:8px;margin-top:14px}.vs-acciones .btn-ghost{padding:11px;font-size:14px}' +
    '@media(max-width:360px){.vs-fila{grid-template-columns:1fr}}';
  document.head.appendChild(css);

  // ---------- Arranque y refrescos ----------
  function negId(){ var n = negocio(); return n ? n.id : null; }
  cambiarNegocio(negId());
  setInterval(function(){ var id = negId(); if(id !== E.neg) cambiarNegocio(id); }, 3000);   // entró o cambió de negocio
  setInterval(function(){ if(E.neg && !document.hidden) refrescar(); }, REFRESCO_MS);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && E.neg && Date.now() - E.ultimo > 60e3) refrescar(); });
  window.addEventListener('online', function(){ if(E.neg) refrescar(); });

  // ---------- API ----------
  window.ventoSuscripcion = {
    estado: estado, refrescar: refrescar, enCuenta: enCuenta, verificado: function(){ return !!E.p; },
    tiene: function(ent){ return ents().indexOf(String(ent)) >= 0; }, entitlements: ents,
    planEfectivo: function(){ return estado().plan; },
    abrirPlanes: abrirPlanes, abrirRenovar: abrirRenovar, funcionPro: funcionPro, catalogo: cargarCatalogo,
    estadoApp: estadoApp, pintarPanel: pintarPanel, barra: barra, fecha: fecha,
    proveedores: { registrar: registrarProveedor, lista: function(){ return registro.map(function(p){ return p.id; }); }, elegir: function(){ return proveedorPara(E.cat); },
      ManualPaymentProvider: ManualPaymentProvider, GooglePlayPaymentProvider: GooglePlayPaymentProvider }
  };
  // ¿Puede usar esta función? Sin nube (o sin estado verificado por el servidor) no se bloquea nada: sistema de siempre.
  window.ventoAcceso = {
    tiene: function(ent){
      try{ if(window.ventoPlan && window.ventoPlan().k === 'proveedor') return true; }catch(e){}
      return !(enCuenta() && E.p) || ents().indexOf(String(ent)) >= 0;
    }
  };
})();
