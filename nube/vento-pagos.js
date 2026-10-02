/* =====================================================================
   Vento · Pagos con Nequi y DaviPlata (lado de la app)

   Núcleo:  Nequi / DaviPlata → integración autorizada (Wompi o Nequi Conecta) → Servidor Vento
            (Supabase Edge Function «vento-pagos») → base de datos → esta app → celulares autorizados.

   Esta parte:
   • Ajustes → 💜 Pagos: estado de Nequi y DaviPlata, asistente «Conectar», comprobaciones automáticas,
     URL de eventos, celulares autorizados, historial y avisos del celular (auxiliar).
   • Cuenta/mesa → «💜 Cobrar Nequi / DaviPlata»: link/QR de Wompi, cobro push o QR de Nequi, con el
     estado en vivo. Cuando se aprueba, se registra solo en la cuenta (una sola vez aunque haya varios celulares).
   • Registro del celular (id + token seguro), latido, notificaciones push con la app cerrada.
   • Tiempo real (Supabase Realtime) + sincronización al reconectarse (los pagos quedan en el servidor).
   Sin Vento Nube configurada no hace nada: Vento sigue funcionando igual.
   ===================================================================== */
(function(){
  'use strict';
  var K_DEV = 'vento_pagos_dev', K_VISTO = 'vento_pagos_visto', K_CACHE = 'vento_pagos_cache';
  var plata = function(n){ return '$' + Math.round(n || 0).toLocaleString('es-CO'); };
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function lsGet(k, d){ try{ var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; }catch(e){ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function toast(t, ms){ try{ window.showToast && window.showToast(t, ms || 5000); }catch(e){} }
  function hablar(t){ try{ (window.ventoHablar || window.speakVoice || function(){})(t); }catch(e){} }
  function nube(){ return window.ventoNube || null; }
  function negocio(){ var n = nube(); return n && n.negocio ? n.negocio() : null; }
  function etiquetaMesa(m){ try{ return window.tableLabel ? window.tableLabel(m) : 'Mesa ' + m; }catch(e){ return 'Mesa ' + m; } }
  var METODO = { NEQUI: 'Nequi', DAVIPLATA: 'DaviPlata', CARD: 'Tarjeta', PSE: 'PSE', BANCOLOMBIA_TRANSFER: 'Bancolombia', BANCOLOMBIA_QR: 'QR Bancolombia', BANCOLOMBIA: 'Bancolombia', TRANSFERENCIA: 'Transferencia', 'BRE-B': 'Bre-B' };
  var nombreMetodo = function(m){ return METODO[String(m || '').toUpperCase()] || (m ? String(m).charAt(0) + String(m).slice(1).toLowerCase() : 'Pago digital'); };
  var ESTADO = { pendiente: '⏳ Esperando el pago', aprobado: '✅ Pagado', rechazado: '❌ Rechazado', anulado: '↩️ Anulado', error: '⚠️ Error', vencido: '⌛ Venció' };

  // ---------- Conexión con el servidor ----------
  var est = { servidor: null, version: null, resumen: null, info: null, dev: null, canal: null, ultimoSync: 0, revisando: false };
  function base(){ var c = nube().config(); return c.url.replace(/\/+$/, '') + '/functions/v1/vento-pagos'; }
  function sesion(){
    return nube().cliente().then(function(c){ return c.auth.getSession().then(function(r){ return { c: c, token: r && r.data && r.data.session ? r.data.session.access_token : null }; }); });
  }
  function api(ruta, cuerpo){
    return sesion().then(function(s){
      if(!s.token) throw Object.assign(new Error('Entra a Vento Nube para usar los pagos.'), { codigo: 'sin_sesion' });
      return fetch(base() + '/' + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: nube().config().key, Authorization: 'Bearer ' + s.token }, body: JSON.stringify(cuerpo || {}) });
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(!r.ok) throw Object.assign(new Error(j.mensaje || ('El servidor respondió ' + r.status)), { codigo: j.error || ('http_' + r.status), status: r.status });
        return j;
      });
    });
  }
  function rpc(fn, args){ return nube().cliente().then(function(c){ return c.rpc(fn, args || {}); }).then(function(r){ if(r.error) throw r.error; return r.data; }); }
  function salud(){
    if(!nube() || !nube().configurada()) return Promise.resolve(false);
    var ctrl = window.AbortController ? new AbortController() : null, t = setTimeout(function(){ ctrl && ctrl.abort(); }, 8000);
    return fetch(base() + '/salud', ctrl ? { signal: ctrl.signal } : {}).then(function(r){ clearTimeout(t); return r.ok ? r.json() : null; })
      .then(function(j){ est.servidor = !!(j && j.ok); est.version = j && j.version; return est.servidor; })
      .catch(function(){ clearTimeout(t); est.servidor = false; return false; });
  }

  // ---------- Este celular ----------
  function plataforma(){ var u = navigator.userAgent || ''; return /iPhone|iPad/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : 'Navegador'; }
  function nombreRol(r){ return ({ dueno: 'Dueño', admin: 'Administrador', cajero: 'Caja', mesero: 'Mesero' })[r] || 'Celular'; }
  function miDispositivo(){ var n = negocio(), d = lsGet(K_DEV, null); return n && d && d.negocio === n.id ? d : null; }
  function registrarDispositivo(forzar){
    var n = negocio(); if(!n) return Promise.resolve(null);
    var d = miDispositivo();
    if(d && !forzar) return Promise.resolve(d);
    return rpc('registrar_dispositivo', { p_negocio: n.id, p_nombre: nombreRol(n.rol) + ' · ' + plataforma(), p_plataforma: (navigator.userAgent || '').slice(0, 120), p_dispositivo: d ? d.id : null })
      .then(function(r){ var nd = { negocio: n.id, id: r.id, token: r.token, desde: Date.now() }; lsSet(K_DEV, nd); est.dev = nd; return nd; });
  }
  function latido(push){
    var d = miDispositivo(); if(!d) return Promise.resolve(false);
    return rpc('latido_dispositivo', { p_dispositivo: d.id, p_push: push || null }).then(function(ok){
      if(ok === false){ est.revocado = true; }   // lo retiró el dueño: se vuelve a autorizar desde Ajustes → Pagos
      return ok;
    }).catch(function(){ return null; });
  }

  // ---------- Notificaciones con la app cerrada (Web Push) ----------
  function pushSoportado(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function b64aBytes(s){ var t = s.replace(/-/g, '+').replace(/_/g, '/'); t += '==='.slice((t.length + 3) % 4); var b = atob(t), u = new Uint8Array(b.length); for(var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function activarPush(){
    if(!pushSoportado()) return Promise.reject(new Error('Este navegador no permite notificaciones push. En iPhone, primero agrega Vento a la pantalla de inicio.'));
    return Notification.requestPermission().then(function(p){
      if(p !== 'granted') throw new Error('No diste permiso de notificaciones. Actívalo en los ajustes del navegador para este sitio.');
      return navigator.serviceWorker.register('sw.js');
    }).then(function(reg){ return navigator.serviceWorker.ready.then(function(){ return reg; }); })
      .then(function(reg){
        return fetch(base() + '/push-clave').then(function(r){ return r.json(); }).then(function(j){
          return reg.pushManager.getSubscription().then(function(s){ return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(j.publica) }); });
        });
      }).then(function(sus){ return registrarDispositivo(false).then(function(){ return latido(sus.toJSON()); }); })
      .then(function(){ lsSet('vento_pagos_push', true); return true; });
  }
  function pushActivo(){ return !!lsGet('vento_pagos_push', false) && pushSoportado() && Notification.permission === 'granted'; }

  // ---------- Pagos que llegan del servidor ----------
  var cache = lsGet(K_CACHE, {});          // id → pago (últimos 150)
  var oyentes = [];                        // ventanas de cobro abiertas
  function guardarCache(){ var ks = Object.keys(cache); if(ks.length > 150){ ks.sort(function(a, b){ return String(cache[a].actualizado_en).localeCompare(String(cache[b].actualizado_en)); }).slice(0, ks.length - 150).forEach(function(k){ delete cache[k]; }); } lsSet(K_CACHE, cache); }
  function puedeCaja(){ var n = negocio(); return n && ['dueno', 'admin', 'cajero'].indexOf(n.rol) >= 0; }

  function regLocal(p){
    if(typeof data === 'undefined' || !data) return null;
    if(!data.pagos) data.pagos = { on: false, topic: '', lista: [], vistos: [], espera: {} };
    var g = data.pagos; g.lista = g.lista || [];
    var id = 'srv-' + p.id, x = g.lista.find(function(y){ return y.id === id; });
    var fuente = p.verificado ? 'Verificado por ' + (p.proveedor === 'nequi' ? 'Nequi Conecta' : 'Wompi') : (p.detalle || 'Aviso del celular');
    if(!x){
      x = { id: id, srv: p.id, t: Date.parse(p.aprobado_en || p.actualizado_en || p.creado_en) || Date.now(), monto: Number(p.monto), app: nombreMetodo(p.metodo), de: p.pagador || '', mesa: p.mesa ? (isNaN(+p.mesa) ? p.mesa : +p.mesa) : null,
        estado: p.confianza === 'revisar' ? 'revisar' : p.confianza === 'falso' ? 'falso' : 'app', fuente: fuente, txt: (p.referencia || '').slice(0, 60) };
      g.lista.unshift(x); g.lista = g.lista.slice(0, 200);
    } else if(x.estado === 'revisar' && p.confianza === 'ok'){ x.estado = 'ok'; }
    if(p.aplicado_en && !x.aplicado) x.aplicado = p.aplicado_mesa ? (isNaN(+p.aplicado_mesa) ? p.aplicado_mesa : +p.aplicado_mesa) : true;
    if(p.estado === 'anulado') x.estado = 'falso', x.fuente = 'Anulado por ' + (p.proveedor === 'nequi' ? 'Nequi' : 'Wompi');
    return x;
  }

  function avisar(p, x){
    var m = (p.mesa ? ' · ' + etiquetaMesa(p.mesa) : '');
    if(p.confianza === 'falso'){
      toast('🚨 OJO, PAGO FALSO: ' + plata(p.monto) + '. ' + (p.detalle || 'No entregues nada.'), 15000);
      hablar('Ojo. Llegó un mensaje de pago sospechoso por ' + p.monto + ' pesos. Parece falso.');
      try{ navigator.vibrate && navigator.vibrate([500, 150, 500]); }catch(e){}
      return;
    }
    if(p.confianza === 'revisar'){
      toast('⚠️ ' + nombreMetodo(p.metodo) + ': ' + plata(p.monto) + (p.pagador ? ' de ' + p.pagador : '') + m + '. ' + (p.detalle || 'Confírmalo en la app del banco.'), 12000);
      return;
    }
    toast('💜 Llegó ' + nombreMetodo(p.metodo) + ': ' + plata(p.monto) + (p.pagador ? ' de ' + p.pagador : '') + m + (p.verificado ? ' · ✅ verificado' : ''), 9000);
    hablar('Llegó un ' + nombreMetodo(p.metodo) + ' de ' + p.monto + ' pesos' + (p.pagador ? ' de ' + p.pagador : '') + (p.mesa ? ', de la ' + etiquetaMesa(p.mesa) : ''));
    try{ navigator.vibrate && navigator.vibrate([150, 80, 150]); }catch(e){}
    try{ window.mesoraCelebrar && window.mesoraCelebrar(['💜', '💰', '✨']); }catch(e){}
  }

  // Registrar en la cuenta: el servidor decide quién lo hace (aplicar_pago devuelve true a UN solo celular).
  function aplicarEnMesa(p, x, mesa){
    var d = miDispositivo();
    return rpc('aplicar_pago', { p_pago: p.id, p_mesa: String(mesa), p_dispositivo: d ? d.id : null }).then(function(gane){
      if(!gane){ x.aplicado = x.aplicado || mesa; try{ saveData(); }catch(e){} return false; }
      var msg = window.pagoRegistrar ? window.pagoRegistrar(x, mesa) : null;
      if(msg) toast(msg, 7000);
      return true;
    }).catch(function(e){ toast('No se pudo registrar el pago en la cuenta: ' + (e.message || e), 8000); return false; });
  }

  function recibir(p, enVivo){
    if(!p || !p.id) return;
    var antes = cache[p.id];
    cache[p.id] = Object.assign({}, antes || {}, p); guardarCache();
    oyentes.forEach(function(f){ try{ f(cache[p.id]); }catch(e){} });
    var nuevoAprobado = p.estado === 'aprobado' && (!antes || antes.estado !== 'aprobado');
    if(p.estado !== 'aprobado' && !(p.estado === 'rechazado' && p.confianza === 'falso') && p.estado !== 'anulado') { pintarHistorial(); return; }
    var x = regLocal(p); if(!x){ return; }
    try{ saveData(); }catch(e){}
    if(nuevoAprobado && enVivo) avisar(p, x);
    else if(p.estado === 'rechazado' && p.confianza === 'falso' && !antes && enVivo) avisar(p, x);
    pintarHistorial();
    try{ window.layaPintarTarjeta && window.layaPintarTarjeta(); }catch(e){}
    if(p.estado !== 'aprobado' || p.aplicado_en || p.confianza === 'falso' || p.confianza === 'revisar' || !puedeCaja()) return;
    var mesa = p.mesa && data.tables && data.tables[p.mesa] ? p.mesa : null;
    if(mesa) aplicarEnMesa(p, x, isNaN(+mesa) ? mesa : +mesa);
    else if(nuevoAprobado && enVivo){ try{ window.pagoLlego && window.pagoLlego(x); }catch(e){} }
  }

  // Al registrar a mano desde «Llegó un pago», el servidor también lo marca (y otro celular ya no lo repite).
  window.ventoPagosAntesDeRegistrar = function(x, mesa){
    if(!x || !x.srv || !negocio()) return Promise.resolve(true);
    var d = miDispositivo();
    return rpc('aplicar_pago', { p_pago: x.srv, p_mesa: String(mesa), p_dispositivo: d ? d.id : null }).catch(function(){ return true; });
  };

  function sincronizar(){
    var n = negocio(); if(!n || est.revisando) return Promise.resolve();
    est.revisando = true;
    var desde = lsGet(K_VISTO, {})[n.id] || null;
    return rpc('pagos_desde', { p_negocio: n.id, p_desde: desde, p_limite: 200 }).then(function(l){
      var max = desde;
      (l || []).forEach(function(p){ recibir(p, !!desde && Date.parse(p.actualizado_en) > Date.now() - 15 * 60e3); if(!max || p.actualizado_en > max) max = p.actualizado_en; });
      var v = lsGet(K_VISTO, {}); v[n.id] = max || new Date(Date.now() - 2 * 864e5).toISOString(); lsSet(K_VISTO, v);
      est.ultimoSync = Date.now();
    }).catch(function(){}).then(function(){ est.revisando = false; });
  }

  function conectarTiempoReal(){
    var n = negocio(); if(!n || est.canal) return;
    nube().cliente().then(function(c){
      if(!c.channel) return;
      est.canal = c.channel('vento-pagos-' + n.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos', filter: 'negocio_id=eq.' + n.id }, function(ev){
          var p = ev && ev.new; if(!p || !p.id) return;
          recibir(p, true);
          var v = lsGet(K_VISTO, {}); if(!v[n.id] || p.actualizado_en > v[n.id]){ v[n.id] = p.actualizado_en; lsSet(K_VISTO, v); }
        })
        .subscribe(function(s){ est.vivo = s === 'SUBSCRIBED'; if(s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED'){ try{ c.removeChannel(est.canal); }catch(e){} est.canal = null; setTimeout(conectarTiempoReal, 15000); } });
    }).catch(function(){});
  }

  // Mientras haya cobros esperando, le pide al servidor que consulte a Wompi/Nequi (además del webhook).
  function hayPendientes(){ return Object.keys(cache).some(function(k){ var p = cache[k]; return p.estado === 'pendiente' && Date.now() - Date.parse(p.creado_en || 0) < 45 * 60e3; }); }
  function vigilar(){
    var n = negocio(); if(!n || !est.servidor || document.hidden) return;
    if(hayPendientes()) api('sync', { negocio: n.id }).then(function(){ return sincronizar(); }).catch(function(){});
    else if(!est.vivo && Date.now() - est.ultimoSync > 20000) sincronizar();
  }

  function arrancar(){
    if(!negocio()) return;
    salud().then(function(ok){
      registrarDispositivo(false).then(function(){ return latido(null); }).catch(function(){});
      sincronizar().then(conectarTiempoReal);
      if(ok) crearBotonCuenta();
    });
  }
  setInterval(vigilar, 10000);
  setInterval(function(){ if(negocio()) latido(null); }, 5 * 60e3);
  window.addEventListener('online', function(){ if(negocio()){ sincronizar(); conectarTiempoReal(); } });
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && negocio()) sincronizar(); });
  var espera = setInterval(function(){ if(typeof data !== 'undefined' && data && nube()){ clearInterval(espera); if(negocio()) arrancar(); else setInterval(function(){ if(negocio() && !est.dev && !miDispositivo()) arrancar(); }, 20000); } }, 1500);

  // ---------- Estilos ----------
  var st = document.createElement('style');
  st.textContent =
    '.vp-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0}@media(max-width:420px){.vp-cards{grid-template-columns:1fr}}' +
    '.vp-card{border:1px solid var(--line);border-radius:16px;padding:14px;background:var(--surface-2,transparent)}' +
    '.vp-card h3{margin:0 0 6px;font-size:15px;letter-spacing:.06em}.vp-card .vp-st{font-weight:800;font-size:15px}.vp-card small{display:block;color:var(--ink-soft);margin-top:4px;line-height:1.35}' +
    '.vp-ok{color:#22c55e}.vp-pend{color:#f5a524}.vp-mal{color:#e5484d}' +
    '.vp-checks{list-style:none;padding:0;margin:8px 0;font-size:14px;line-height:1.7}.vp-checks li{display:flex;gap:8px;align-items:flex-start}' +
    '.vp-form label{display:block;font-size:13px;color:var(--ink-soft);margin:10px 0 4px}.vp-form input,.vp-form select{width:100%;box-sizing:border-box}' +
    '.vp-hist{font-size:14px}.vp-hist div{display:flex;gap:8px;justify-content:space-between;padding:7px 0;border-top:1px solid var(--line)}.vp-hist small{display:block;color:var(--ink-soft)}' +
    '.vp-url{width:100%;box-sizing:border-box;font-size:12px}' +
    '.vp-modal{max-width:440px;width:100%}.vp-opc{display:grid;gap:8px;margin:10px 0}.vp-opc button{text-align:left;padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:var(--surface-2,transparent);color:inherit;font:600 15px var(--font-main);cursor:pointer}.vp-opc button small{display:block;font-weight:400;color:var(--ink-soft);margin-top:2px}' +
    '.vp-qr{display:grid;place-items:center;margin:12px auto;background:#fff;padding:12px;border-radius:16px;width:max-content;max-width:100%}' +
    '.vp-monto{font:800 34px/1.2 var(--font-main);text-align:center;margin:6px 0}.vp-estado{text-align:center;font-weight:800;font-size:17px;margin:10px 0}' +
    '.vp-btn-cuenta{width:100%;margin:8px 0 4px;padding:12px;border-radius:14px;border:1px solid #7c3aed;background:color-mix(in srgb,#7c3aed 14%,transparent);color:inherit;font:700 15px var(--font-main);cursor:pointer}' +
    '@keyframes vpGira{to{transform:rotate(360deg)}}.vp-gira{display:inline-block;animation:vpGira 1.2s linear infinite}';
  document.head.appendChild(st);

  // ---------- Ventanas ----------
  function ventana(id){
    var ov = document.getElementById(id);
    if(!ov){ ov = document.createElement('div'); ov.id = id; ov.className = 'overlay'; ov.setAttribute('data-novocab', ''); document.body.appendChild(ov);
      ov.addEventListener('click', function(e){ if(e.target === ov) cerrarVentana(ov); }); }
    return ov;
  }
  function cerrarVentana(ov){ ov.classList.remove('show'); if(ov._fin) try{ ov._fin(); }catch(e){} ov._fin = null; }

  // ---------- Cobrar desde la cuenta ----------
  function saldoMesa(id){ try{ return Math.max(0, tableTotal(id) - tablePaid(id)); }catch(e){ return 0; } }
  window.ventoPagosCobrar = function(mesa, monto){
    var n = negocio(); if(!n) return toast('Conecta Vento Nube y los pagos en Ajustes → 💜 Pagos.');
    var r = est.resumen || {}, wompi = r.nequi && r.nequi.via && r.nequi.via.indexOf('Wompi') >= 0 || r.daviplata && r.daviplata.estado === 'conectado';
    var nequiDirecto = r.nequi && r.nequi.via && r.nequi.via.indexOf('Nequi Conecta') >= 0;
    var ov = ventana('vpCobroOv');
    monto = Math.round(monto != null ? monto : (mesa != null ? saldoMesa(mesa) : 0));
    ov.innerHTML = '<div class="modal vp-modal"><h2>💜 Cobrar con Nequi o DaviPlata</h2>' +
      '<label style="display:block;font-size:13px;color:var(--ink-soft)">Valor a cobrar' + (mesa != null ? ' · ' + esc(etiquetaMesa(mesa)) : '') + '</label>' +
      '<input id="vpMonto" class="mz-in" type="number" min="100" step="100" inputmode="numeric" value="' + (monto || '') + '" style="width:100%;font-size:22px;font-weight:800">' +
      '<div class="vp-opc">' +
      (wompi ? '<button type="button" data-c="link">🔗 Link / QR de pago<small>El cliente escanea y paga con Nequi, DaviPlata, tarjeta o PSE (Wompi).</small></button>' : '') +
      (nequiDirecto ? '<button type="button" data-c="push">📲 Cobro a su Nequi<small>Le llega una notificación al celular del cliente para aprobar.</small></button>' +
        '<button type="button" data-c="qr">🔳 QR de Nequi<small>El cliente lo escanea desde su app Nequi.</small></button>' : '') +
      (!wompi && !nequiDirecto ? '<div class="modal-sub">Todavía no hay una integración conectada. Ve a <b>Ajustes → 💜 Pagos</b> y toca «Conectar Nequi» o «Conectar DaviPlata».</div>' : '') +
      '</div><div id="vpCobroRes"></div><div class="modal-actions"><button type="button" class="btn-close" id="vpCobroX">Cerrar</button></div></div>';
    ov.classList.add('show');
    ov.querySelector('#vpCobroX').onclick = function(){ cerrarVentana(ov); };
    var clave = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    ov.querySelectorAll('[data-c]').forEach(function(b){ b.onclick = function(){
      var canal = b.dataset.c, valor = Math.round(+ov.querySelector('#vpMonto').value || 0);
      if(valor < 100) return toast('Escribe el valor a cobrar.');
      var tel = null;
      if(canal === 'push'){ tel = (prompt('Celular Nequi del cliente (10 dígitos):') || '').replace(/\D/g, ''); if(!/^3\d{9}$/.test(tel)) return toast('El celular debe tener 10 dígitos y empezar por 3.'); }
      var res = ov.querySelector('#vpCobroRes');
      res.innerHTML = '<div class="vp-estado"><span class="vp-gira">⏳</span> Creando el cobro…</div>';
      ov.querySelectorAll('[data-c]').forEach(function(x){ x.disabled = true; });
      api('cobro', { negocio: n.id, canal: canal, monto: valor, mesa: mesa != null ? String(mesa) : null, telefono: tel, clave: clave + canal })
        .then(function(j){ recibir(j.pago, false); mostrarCobro(ov, j.pago); })
        .catch(function(e){ res.innerHTML = '<div class="vp-estado vp-mal">⚠️ ' + esc(e.message) + '</div>'; ov.querySelectorAll('[data-c]').forEach(function(x){ x.disabled = false; }); });
    }; });
  };
  function mostrarCobro(ov, p){
    var res = ov.querySelector('#vpCobroRes'); ov.querySelector('.vp-opc').hidden = true;
    var pintar = function(x){
      var html = '<div class="vp-monto">' + plata(x.monto) + '</div>';
      if(x.estado === 'pendiente'){
        if(x.canal === 'link' && x.url) html += '<div class="vp-qr" id="vpQr"></div><div class="mz-actions" style="justify-content:center;flex-wrap:wrap"><button type="button" class="btn-ghost" id="vpCopiar">📋 Copiar link</button><a class="btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('Paga aquí con Nequi o DaviPlata: ' + x.url) + '">WhatsApp</a></div>';
        if(x.canal === 'qr' && x.qr) html += '<div class="vp-qr" id="vpQr"></div><div class="modal-sub" style="text-align:center">Escanéalo desde la app Nequi.</div>';
        if(x.canal === 'push') html += '<div class="modal-sub" style="text-align:center">Le llegó una notificación a su Nequi (' + esc(x.telefono || '') + '). Debe aprobarla en su celular.</div>';
        html += '<div class="vp-estado"><span class="vp-gira">⏳</span> Esperando el pago…</div><div class="modal-sub" style="text-align:center">Se registra solo en la cuenta cuando Nequi/DaviPlata lo confirmen.</div>';
      } else {
        html += '<div class="vp-estado ' + (x.estado === 'aprobado' ? 'vp-ok' : 'vp-mal') + '">' + (ESTADO[x.estado] || x.estado) + (x.estado === 'aprobado' ? ' · ' + esc(nombreMetodo(x.metodo)) + (x.pagador ? ' · ' + esc(x.pagador) : '') : '') + '</div>' +
          (x.estado === 'aprobado' ? '<div class="modal-sub" style="text-align:center">✅ Verificado por ' + (x.proveedor === 'nequi' ? 'Nequi' : 'Wompi') + '. Quedó registrado en la cuenta.</div>' : x.ultimo_error || x.detalle ? '<div class="modal-sub" style="text-align:center">' + esc(x.ultimo_error || x.detalle) + '</div>' : '');
      }
      res.innerHTML = html;
      var q = res.querySelector('#vpQr');
      if(q && window.QRCode) try{ new QRCode(q, { text: x.canal === 'qr' ? x.qr : x.url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M }); }catch(e){ q.textContent = 'No se pudo dibujar el QR.'; }
      var cp = res.querySelector('#vpCopiar'); if(cp) cp.onclick = function(){ try{ navigator.clipboard.writeText(x.url); toast('📋 Link copiado.'); }catch(e){ prompt('Copia el link:', x.url); } };
      if(x.estado === 'aprobado'){ try{ window.mesoraCelebrar && window.mesoraCelebrar(['💜', '✅', '✨']); }catch(e){} }
    };
    pintar(p);
    var oye = function(x){ if(x.id === p.id && (x.estado !== p.estado)){ p = x; pintar(x); } };
    oyentes.push(oye);
    ov._fin = function(){ oyentes = oyentes.filter(function(f){ return f !== oye; }); };
  }

  function crearBotonCuenta(){
    if(document.getElementById('vpCobrarCuenta')) return;
    var cont = document.getElementById('paymentsContainer'); if(!cont) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'vpCobrarCuenta'; b.className = 'vp-btn-cuenta'; b.setAttribute('data-novocab', '');
    b.textContent = '💜 Cobrar Nequi / DaviPlata';
    b.onclick = function(){ try{ window.ventoPagosCobrar(typeof currentTable !== 'undefined' ? currentTable : null); }catch(e){ window.ventoPagosCobrar(null); } };
    cont.parentNode.insertBefore(b, cont);
    refrescarEstado().then(function(){ b.hidden = !(est.resumen && (est.resumen.nequi.estado === 'conectado' || est.resumen.daviplata.estado === 'conectado')); });
  }

  // ---------- Ajustes → 💜 Pagos ----------
  function refrescarEstado(){
    var n = negocio(); if(!n || !est.servidor) return Promise.resolve(null);
    return api('config', { negocio: n.id, accion: 'estado' }).then(function(j){ est.info = j; est.resumen = j.resumen; var b = document.getElementById('vpCobrarCuenta'); if(b) b.hidden = !(j.resumen.nequi.estado === 'conectado' || j.resumen.daviplata.estado === 'conectado'); return j; }).catch(function(e){ est.errorEstado = e.message; return null; });
  }
  function crearCategoria(){
    var cats = document.getElementById('ajustesCats'); if(!cats || cats.querySelector('[data-cat="pagos"]')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'ajustes-cat'; b.dataset.cat = 'pagos'; b.setAttribute('data-novocab', '');
    b.innerHTML = '<span class="ac-icon">💜</span><span class="ac-label">Pagos: Nequi y DaviPlata</span><span class="ac-arrow">›</span>';
    var ref = cats.querySelector('[data-cat="pedidos"]'); cats.insertBefore(b, ref ? ref.nextSibling : null);
    b.addEventListener('click', function(){ if(window.mostrarCategoriaAjustes) window.mostrarCategoriaAjustes('pagos'); pintarAjustes(); });
    var g = document.createElement('div'); g.className = 'settings-group'; g.id = 'vpGrupo'; g.dataset.cat = 'pagos'; g.hidden = true; g.setAttribute('data-novocab', '');
    var otro = document.querySelector('#view-ajustes .settings-group[data-cat]'); if(otro) otro.parentNode.insertBefore(g, otro); else return;
  }
  function estadoHtml(nombre, r, color){
    var ok = r && r.estado === 'conectado';
    return '<div class="vp-card"><h3>' + nombre + '</h3><div class="vp-st ' + (ok ? 'vp-ok' : 'vp-pend') + '">' + (ok ? color + ' Conectado' : '🟠 Pendiente') + '</div><small>' + esc(r ? r.detalle : 'Falta conectar') + '</small></div>';
  }
  function chequeos(){
    var n = negocio(), cfg = nube() && nube().configurada();
    var l = [
      [cfg, 'Vento Nube configurada', 'Falta: Ajustes → ☁️ Nube y usuarios.'],
      [!!n, 'Sesión iniciada en un negocio', 'Entra con tu correo en Vento Nube.'],
      [est.servidor === true, 'Servidor Vento activo' + (est.version ? ' (v' + est.version + ')' : ''), est.servidor === false ? 'El servidor de pagos aún no está desplegado en tu Supabase (ver abajo).' : 'Comprobando…'],
      [!!miDispositivo() && !est.revocado, 'Este celular autorizado', est.revocado ? 'Este celular fue retirado. Toca «Autorizar este celular».' : 'Se autoriza solo al entrar.'],
      [pushActivo(), 'Avisos con la app cerrada', 'Opcional: toca «🔔 Activar avisos».']
    ];
    return '<ul class="vp-checks">' + l.map(function(c){ return '<li><span>' + (c[0] ? '✅' : (c[2].indexOf('Opcional') === 0 ? '▫️' : '⚠️')) + '</span><span>' + esc(c[1]) + (c[0] ? '' : '<br><small style="color:var(--ink-soft)">' + esc(c[2]) + '</small>') + '</span></li>'; }).join('') + '</ul>';
  }
  function pintarAjustes(){
    crearCategoria();
    var g = document.getElementById('vpGrupo'); if(!g) return;
    var n = negocio();
    var pinta = function(){
      var r = est.resumen, info = est.info || {}, admin = n && (n.rol === 'dueno' || n.rol === 'admin');
      var html = '<h2>💜 Pagos: Nequi y DaviPlata</h2>' +
        '<div class="settings-desc">Los pagos llegan al <b>Servidor Vento</b> por una integración autorizada (Wompi o Nequi Conecta), quedan guardados en la base de datos y aparecen al instante en todos los celulares del negocio. Vento verifica la firma, evita duplicados y los registra solos en la cuenta.</div>' +
        '<div class="vp-cards">' + estadoHtml('NEQUI', r && r.nequi, '🟢') + estadoHtml('DAVIPLATA', r && r.daviplata, '🔵') + '</div>' +
        (admin && est.servidor ? '<div class="mz-actions" style="flex-wrap:wrap"><button type="button" class="btn-primary" id="vpConNequi">Conectar Nequi</button><button type="button" class="btn-primary" id="vpConDavi">Conectar DaviPlata</button>' + (r && (r.nequi.estado === 'conectado' || r.daviplata.estado === 'conectado') ? '<button type="button" class="btn-ghost" id="vpProbar">🔄 Comprobar</button>' : '') + '</div>' : '') +
        chequeos();
      if(est.servidor === false) html += servidorPendienteHtml();
      if(!n) html += '<div class="mz-actions"><button type="button" class="btn-primary" id="vpNube">☁️ Abrir Vento Nube</button></div>';
      if(n && est.servidor){
        html += '<div class="mz-actions" style="flex-wrap:wrap">' + (pushActivo() ? '' : '<button type="button" class="btn-ghost" id="vpPush">🔔 Activar avisos aunque Vento esté cerrada</button>') +
          ((!miDispositivo() || est.revocado) ? '<button type="button" class="btn-ghost" id="vpAutorizar">📱 Autorizar este celular</button>' : '') + '</div>';
        if(admin && info.webhook_wompi) html += '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:6px"><div class="settings-row-text"><strong>Eventos de Wompi ' + (r.webhook === 'recibiendo' ? '<span class="vp-ok">✅ recibiendo</span>' : '<span class="vp-pend">⏳ esperando el primero</span>') + '</strong><span>Pégala una vez en Wompi → Desarrolladores → «URL de Eventos». Mientras tanto Vento consulta el estado de cada cobro, así que igual funciona.</span></div><input class="mz-in vp-url" readonly id="vpHook" value="' + esc(info.webhook_wompi) + '"><div class="mz-actions"><button type="button" class="btn-ghost" id="vpCopHook">📋 Copiar URL de eventos</button><a class="btn-ghost" href="https://comercios.wompi.co" target="_blank" rel="noopener">Abrir Wompi</a></div></div>';
        html += '<div class="settings-row" style="flex-direction:column;align-items:stretch"><div class="settings-row-text"><strong>Últimos pagos en el servidor</strong></div><div class="vp-hist" id="vpHist"></div></div>';
        if(admin) html += '<div class="settings-row" style="flex-direction:column;align-items:stretch"><div class="settings-row-text"><strong>📱 Celulares autorizados</strong><span>Cada celular que entra a Vento con tu negocio queda autorizado con su propio token. Puedes retirar uno perdido.</span></div><div class="vp-hist" id="vpDevs">Cargando…</div></div>';
        if(puedeCaja() && miDispositivo()) html += '<details class="settings-desc"><summary><b>Avisos del celular (método auxiliar, MacroDroid)</b></summary><p style="margin:8px 0 0">Si quieres que también cuenten las notificaciones de la app Nequi/DaviPlata de ESTE celular (por ejemplo, transferencias normales a tu número), en MacroDroid crea una macro: disparador <b>Notificación recibida</b> (apps Nequi y DaviPlata) → acción <b>Solicitud HTTP POST</b> a esta dirección, con el cuerpo <b>[app] | [título] | [texto]</b>. Quedan marcadas como «aviso del celular» (no verificadas por la entidad).</p><input class="mz-in vp-url" readonly id="vpAvisoUrl" value="' + esc((info.aviso_url || (base() + '/aviso')) + '/' + miDispositivo().token) + '"><div class="mz-actions"><button type="button" class="btn-ghost" id="vpCopAviso">📋 Copiar dirección</button></div></details>';
      }
      g.innerHTML = html;
      enlazarAjustes(g);
      pintarHistorial();
      if(admin && est.servidor) pintarDispositivos();
    };
    pinta();
    if(!n){ return; }
    salud().then(function(){ return refrescarEstado(); }).then(pinta);
  }
  function servidorPendienteHtml(){
    return '<details class="settings-desc" open><summary><b>Activar el Servidor Vento (una sola vez)</b></summary><p style="margin:8px 0 0">El código del servidor ya está listo en el proyecto (carpeta <b>supabase/</b>) y se despliega solo con GitHub. Solo falta autorizarlo, porque esas llaves son de tu cuenta:</p><ol style="margin:6px 0 0;padding-left:20px;line-height:1.55">' +
      '<li>En Supabase → tu foto → <b>Account → Access Tokens</b> crea un token.</li>' +
      '<li>En GitHub → el repositorio de Vento → <b>Settings → Secrets and variables → Actions</b> agrega: <b>SUPABASE_ACCESS_TOKEN</b> (el token), <b>SUPABASE_PROJECT_REF</b> (lo que va antes de .supabase.co en tu URL) y <b>SUPABASE_DB_PASSWORD</b> (la contraseña que pusiste al crear el proyecto).</li>' +
      '<li>En GitHub → <b>Actions → «Servidor Vento» → Run workflow</b>. Crea las tablas, sube el servidor y conecta todos los celulares solo.</li></ol><p style="margin:6px 0 0">Cuando termine, vuelve aquí: esta pantalla lo detecta sola.</p></details>';
  }
  function enlazarAjustes(g){
    var q = function(id){ return g.querySelector('#' + id); };
    if(q('vpNube')) q('vpNube').onclick = function(){ nube() && nube().abrir(); };
    if(q('vpConNequi')) q('vpConNequi').onclick = function(){ asistente('nequi'); };
    if(q('vpConDavi')) q('vpConDavi').onclick = function(){ asistente('daviplata'); };
    if(q('vpProbar')) q('vpProbar').onclick = function(){
      var n = negocio(), provs = (est.info && est.info.proveedores || []).map(function(p){ return p.proveedor; });
      Promise.all(provs.map(function(p){ return api('config', { negocio: n.id, accion: 'probar', proveedor: p }).catch(function(e){ toast('⚠️ ' + p + ': ' + e.message, 8000); }); }))
        .then(function(){ toast('🔄 Comprobado con ' + provs.join(' y ') + '.'); pintarAjustes(); });
    };
    if(q('vpPush')) q('vpPush').onclick = function(){ activarPush().then(function(){ toast('🔔 Listo: te avisamos de cada pago aunque Vento esté cerrada.'); pintarAjustes(); }).catch(function(e){ toast(e.message, 9000); }); };
    if(q('vpAutorizar')) q('vpAutorizar').onclick = function(){ est.revocado = false; registrarDispositivo(true).then(function(){ toast('📱 Celular autorizado.'); pintarAjustes(); }).catch(function(e){ toast(e.message || String(e)); }); };
    var copiar = function(id, msg){ var el = q(id); try{ navigator.clipboard.writeText(el.value); toast(msg); }catch(e){ el.select(); } };
    if(q('vpCopHook')) q('vpCopHook').onclick = function(){ copiar('vpHook', '📋 Copiada. Pégala en Wompi → Desarrolladores → URL de Eventos.'); };
    if(q('vpCopAviso')) q('vpCopAviso').onclick = function(){ copiar('vpAvisoUrl', '📋 Copiada. Pégala en MacroDroid (Solicitud HTTP → URL).'); };
  }
  function pintarHistorial(){
    var el = document.getElementById('vpHist'); if(!el) return;
    var l = Object.keys(cache).map(function(k){ return cache[k]; }).sort(function(a, b){ return String(b.actualizado_en || '').localeCompare(String(a.actualizado_en || '')); }).slice(0, 20);
    el.innerHTML = l.length ? l.map(function(p){
      return '<div><span>' + esc(nombreMetodo(p.metodo)) + (p.pagador ? ' · ' + esc(p.pagador) : '') + ' <b class="' + (p.estado === 'aprobado' ? 'vp-ok' : p.estado === 'pendiente' ? 'vp-pend' : 'vp-mal') + '">' + (ESTADO[p.estado] || p.estado) + '</b>' +
        '<small>' + new Date(p.actualizado_en || p.creado_en).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (p.mesa ? ' · ' + esc(etiquetaMesa(p.mesa)) : '') + (p.aplicado_en ? ' · registrado' : '') + ' · ' + (p.verificado ? 'verificado por ' + (p.proveedor === 'nequi' ? 'Nequi' : 'Wompi') : 'aviso del celular') + '</small></span><b>' + plata(p.monto) + '</b></div>';
    }).join('') : '<div class="empty-note">Todavía no hay pagos en el servidor.</div>';
  }
  function pintarDispositivos(){
    var el = document.getElementById('vpDevs'), n = negocio(); if(!el || !n) return;
    rpc('mis_dispositivos', { p_negocio: n.id }).then(function(l){
      var mio = miDispositivo();
      el.innerHTML = (l || []).map(function(d){ return '<div><span>' + esc(d.nombre) + (mio && mio.id === d.id ? ' <b>(este)</b>' : '') + '<small>' + esc(d.usuario || '') + ' · ' + nombreRol(d.rol) + ' · visto ' + new Date(d.ultimo_visto).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (d.push ? ' · 🔔' : '') + '</small></span><button type="button" class="btn-ghost" data-rev="' + esc(d.id) + '" style="padding:4px 10px">Retirar</button></div>'; }).join('') || '<div class="empty-note">Ninguno.</div>';
      el.onclick = function(e){ var b = e.target.closest('[data-rev]'); if(!b || !confirm('¿Retirar este celular? Dejará de recibir y mandar avisos de pagos.')) return; rpc('revocar_dispositivo', { p_dispositivo: b.dataset.rev }).then(function(){ toast('Celular retirado.'); pintarDispositivos(); }); };
    }).catch(function(){ el.textContent = 'No se pudo cargar la lista.'; });
  }

  // ---------- Asistente «Conectar Nequi / Conectar DaviPlata» ----------
  function asistente(cual){
    var n = negocio(), ov = ventana('vpAsisOv');
    var r = est.resumen || {}, wompiYa = (est.info && est.info.proveedores || []).some(function(p){ return p.proveedor === 'wompi' && p.estado === 'conectado'; });
    var intro = cual === 'daviplata'
      ? '<div class="modal-sub">DaviPlata permite integrar pagos de comercios por su <b>API Pago DaviPlata</b> solo con convenio y certificado de Davivienda. La vía autorizada y disponible para conectarlo aquí es <b>Wompi</b> (pasarela de Bancolombia), que cobra con <b>DaviPlata y Nequi</b> con las mismas llaves y avisa cada pago con un evento firmado.</div>'
      : '<div class="modal-sub">Hay dos vías oficiales. Puedes usar una o las dos:</div>';
    var formW = '<div class="vp-form" id="vpFormW"><h3 style="margin:14px 0 0">Wompi ' + (wompiYa ? '<span class="vp-ok">· ya conectado</span>' : '') + '</h3>' +
      '<div class="modal-sub">En <a href="https://comercios.wompi.co" target="_blank" rel="noopener">comercios.wompi.co</a> → <b>Desarrolladores</b> están las 4 llaves. Para pruebas usa las de «Sandbox» (empiezan por <b>pub_test_</b>); para cobrar de verdad, las de producción (<b>pub_prod_</b>).</div>' +
      '<label>Llave pública</label><input class="mz-in" id="vpWpub" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="pub_prod_…">' +
      '<label>Llave privada</label><input class="mz-in" id="vpWprv" type="password" autocomplete="off" placeholder="prv_prod_…">' +
      '<label>Secreto de eventos</label><input class="mz-in" id="vpWev" type="password" autocomplete="off" placeholder="prod_events_…">' +
      '<label>Secreto de integridad</label><input class="mz-in" id="vpWint" type="password" autocomplete="off" placeholder="prod_integrity_…">' +
      '<div class="mz-actions"><button type="button" class="btn-primary" id="vpWok">Conectar con Wompi</button></div></div>';
    var formN = '<div class="vp-form" id="vpFormN"><h3 style="margin:14px 0 0">Nequi Conecta (cobro push y QR directo de Nequi)</h3>' +
      '<div class="modal-sub">En <a href="https://conecta.nequi.com.co" target="_blank" rel="noopener">conecta.nequi.com.co</a> registra tu negocio y crea la aplicación: ahí salen el Client ID, el Client Secret, la API Key y tu código de comercio.</div>' +
      '<label>Ambiente</label><select class="mz-in" id="vpNamb"><option value="produccion">Producción (cobros reales)</option><option value="sandbox">Pruebas (sandbox)</option></select>' +
      '<label>Client ID</label><input class="mz-in" id="vpNcid" autocomplete="off" autocapitalize="none" spellcheck="false">' +
      '<label>Client Secret</label><input class="mz-in" id="vpNsec" type="password" autocomplete="off">' +
      '<label>API Key</label><input class="mz-in" id="vpNkey" type="password" autocomplete="off">' +
      '<label>Código de comercio</label><input class="mz-in" id="vpNcod" autocomplete="off" autocapitalize="none" placeholder="El que te asignó Nequi Conecta">' +
      '<div class="mz-actions"><button type="button" class="btn-primary" id="vpNok">Conectar con Nequi Conecta</button></div></div>';
    ov.innerHTML = '<div class="modal vp-modal" style="max-height:90vh;overflow:auto"><h2>' + (cual === 'daviplata' ? 'Conectar DaviPlata' : 'Conectar Nequi') + '</h2>' + chequeos() + intro +
      (cual === 'daviplata' ? formW : formN + formW) +
      '<div id="vpAsisMsg" class="vp-estado"></div><div class="modal-actions"><button type="button" class="btn-close" id="vpAsisX">Cerrar</button></div></div>';
    ov.classList.add('show');
    var q = function(id){ return ov.querySelector('#' + id); };
    var msg = function(t, mal){ q('vpAsisMsg').innerHTML = t; q('vpAsisMsg').className = 'vp-estado ' + (mal ? 'vp-mal' : 'vp-ok'); };
    q('vpAsisX').onclick = function(){ cerrarVentana(ov); pintarAjustes(); };
    var enviar = function(btn, cuerpo){
      if(!n) return msg('Primero entra a Vento Nube.', true);
      btn.disabled = true; msg('<span class="vp-gira">⏳</span> Comprobando con la entidad…');
      api('config', Object.assign({ negocio: n.id }, cuerpo)).then(function(j){
        est.info = j; est.resumen = j.resumen;
        var rn = j.resumen;
        msg('✅ Verificado. Nequi: ' + (rn.nequi.estado === 'conectado' ? '🟢 conectado' : '🟠 ' + esc(rn.nequi.detalle)) + ' · DaviPlata: ' + (rn.daviplata.estado === 'conectado' ? '🔵 conectado' : '🟠 ' + esc(rn.daviplata.detalle)) +
          (cuerpo.accion === 'guardar_wompi' && j.webhook_wompi ? '<div class="modal-sub" style="font-weight:400;margin-top:8px">Último paso (recomendado): en Wompi → Desarrolladores → <b>URL de Eventos</b> pega esta dirección para que los pagos lleguen en segundos:</div><input class="mz-in vp-url" readonly value="' + esc(j.webhook_wompi) + '" onclick="this.select()"><div class="mz-actions" style="justify-content:center"><button type="button" class="btn-ghost" id="vpCopHook2">📋 Copiar</button></div>' : ''));
        var c2 = q('vpCopHook2'); if(c2) c2.onclick = function(){ try{ navigator.clipboard.writeText(j.webhook_wompi); toast('📋 Copiada.'); }catch(e){} };
        var b = document.getElementById('vpCobrarCuenta'); if(b) b.hidden = !(rn.nequi.estado === 'conectado' || rn.daviplata.estado === 'conectado'); else crearBotonCuenta();
        ov.querySelectorAll('input[type=password]').forEach(function(i){ i.value = ''; });
      }).catch(function(e){ msg('⚠️ ' + esc(e.message), true); }).then(function(){ btn.disabled = false; });
    };
    if(q('vpWok')) q('vpWok').onclick = function(){ enviar(q('vpWok'), { accion: 'guardar_wompi', llave_publica: q('vpWpub').value.trim(), llave_privada: q('vpWprv').value.trim(), secreto_eventos: q('vpWev').value.trim(), secreto_integridad: q('vpWint').value.trim() }); };
    if(q('vpNok')) q('vpNok').onclick = function(){ enviar(q('vpNok'), { accion: 'guardar_nequi', ambiente: q('vpNamb').value, client_id: q('vpNcid').value.trim(), client_secret: q('vpNsec').value.trim(), api_key: q('vpNkey').value.trim(), codigo: q('vpNcod').value.trim() }); };
  }

  // La categoría aparece siempre (aunque la nube no esté lista: el asistente dice qué falta).
  var tCat = setInterval(function(){ if(document.getElementById('ajustesCats')){ clearInterval(tCat); crearCategoria(); } }, 1000);
  document.addEventListener('click', function(e){ if(e.target.closest && e.target.closest('.ajustes-cat[data-cat="pagos"]')) setTimeout(pintarAjustes, 30); });

  window.ventoPagos = { estado: function(){ return est; }, sincronizar: sincronizar, recibir: recibir, cobrar: function(m, v){ return window.ventoPagosCobrar(m, v); }, activarPush: activarPush, abrirAjustes: pintarAjustes, _cache: cache };
})();
