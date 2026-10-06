/* =====================================================================
   Vento · Sonidos POS: «tún» al agregar, «tic» al quitar y dos notas al completar una venta

   • Web Audio propio: un solo AudioContext {latencyHint:'interactive'} para toda la app (se abre con el
     primer toque, o con el primer sonido en la APK) y tres búferes sintetizados UNA sola vez al cargar
     (precargar). Cada sonido es solo AudioBufferSourceNode → GainNode → salida: suena de inmediato, sin
     descargas ni <audio>. No toca Media Session ni el reconocimiento de voz, y no usa el AudioContext del
     tono de «Hola Vento» ni el del pitido del escáner.
   • ADD «tún» ~90 ms (tono medio-grave que cae), REMOVE «tic» ~50 ms (más agudo y más suave),
     SUCCESS ~150 ms (dos notas cortas ascendentes). Envolventes suaves: empiezan y terminan en cero (sin clics).
   • No suena: con la pestaña oculta, con el micrófono del botón abierto (voiceListening), con «Hola Vento»
     atento a una orden con el micrófono abierto, ni con window.__ventoEscuchando. Mientras «Hola Vento» solo
     espera su palabra de activación sí suena (si no, con el manos libres prendido nunca sonaría).
   • El mismo sonido dentro de 120 ms suena una sola vez. lote(fn): lo de adentro suena UNA vez al final
     (un comando de voz que agrega 5 unidades o una lista de productos). callar(fn): lo de adentro no suena
     (pedidos que llegan de afuera: QR, meseros, domicilios).
   • Después de 20 s sin sonidos se suspende el audio (batería) y vuelve a despertar con el siguiente toque.
   • Preferencia de este equipo en localStorage «vento_sonidos» = {on, vol:'bajo'|'medio'|'alto', add, remove, sale}.
   ===================================================================== */
(function(){
  'use strict';
  var KEY = 'vento_sonidos';
  var DEF = { on: true, vol: 'bajo', add: true, remove: true, sale: true };
  var VOL = { bajo: 0.3, medio: 0.6, alto: 1 };
  var CLAVE = { add: 'add', remove: 'remove', success: 'sale' };   // tipo de sonido → interruptor en la config
  var PRIORIDAD = ['success', 'add', 'remove'];                     // en un lote suena el más importante
  var TIPOS = ['add', 'remove', 'success'];
  var SR = 48000, JUNTOS_MS = 120, REPOSO_MS = 20000;
  var noop = function(){};

  var ctx = null, muestras = null, buf = {}, reposoT = null;
  var loteN = 0, callarN = 0, pend = {}, ultimo = {};
  var historial = [];
  var stats = { contextos: 0, buferes: 0, fuentes: 0, omitidos: {} };

  // ---------- Configuración ----------
  function cfg(){
    var c = {};
    try{ c = JSON.parse(localStorage.getItem(KEY)) || {}; }catch(e){ c = {}; }
    var out = {};
    Object.keys(DEF).forEach(function(k){ out[k] = c[k] == null ? DEF[k] : c[k]; });
    if(!VOL[out.vol]) out.vol = DEF.vol;
    ['on', 'add', 'remove', 'sale'].forEach(function(k){ out[k] = out[k] !== false; });
    return out;
  }
  function guardar(cambios){
    var c = cfg();
    Object.keys(cambios || {}).forEach(function(k){ if(k in DEF) c[k] = cambios[k]; });
    if(!VOL[c.vol]) c.vol = DEF.vol;
    try{ localStorage.setItem(KEY, JSON.stringify(c)); }catch(e){}
    if(!c.on) dormir();
    pintarAjustes();
    return cfg();
  }

  // ---------- Síntesis (una sola vez): muestras a 48 kHz ----------
  // Cada nota: [inicio s, duración s, frecuencia inicial, frecuencia final, caída s, nivel]
  var NOTAS = {
    add: [[0, 0.09, 560, 290, 0.032, 1]],                               // «tún»: cae de tono, redondo
    remove: [[0, 0.05, 1500, 1300, 0.013, 1]],                          // «tic»: corto, agudo
    success: [[0, 0.075, 784, 784, 0.03, 0.85], [0.06, 0.09, 1175, 1175, 0.035, 1]]   // sol → re, ascendente
  };
  var PICO = { add: 0.8, remove: 0.42, success: 0.62 };                 // «tic» más suave que «tún»
  function suave(x){ x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function sintetizar(tipo){
    var notas = NOTAS[tipo], fin = 0;
    notas.forEach(function(n){ fin = Math.max(fin, n[0] + n[1]); });
    var total = Math.ceil(fin * SR), d = new Float32Array(total);
    notas.forEach(function(n){
      var i0 = Math.round(n[0] * SR), largo = Math.round(n[1] * SR), fase = 0, cola = 0.012 * SR;
      for(var k = 0; k < largo && i0 + k < total; k++){
        var t = k / SR;
        var f = n[3] + (n[2] - n[3]) * Math.exp(-t / 0.022);         // caída de tono rápida al principio
        fase += 2 * Math.PI * f / SR;
        var env = suave(t / 0.003) * Math.exp(-t / n[4]) * suave((largo - 1 - k) / cola);   // ataque 3 ms, cola a cero
        d[i0 + k] += n[5] * env * (Math.sin(fase) + 0.22 * Math.exp(-t / 0.015) * Math.sin(2 * fase) + 0.06 * Math.sin(3 * fase));
      }
    });
    var pico = 0;
    for(var i = 0; i < total; i++) pico = Math.max(pico, Math.abs(d[i]));
    if(pico > 0){ var k2 = PICO[tipo] / pico; for(var j = 0; j < total; j++) d[j] *= k2; }
    d[0] = 0; d[total - 1] = 0;
    return d;
  }
  function aBufer(datos){
    var b = null;
    try{
      b = ctx ? ctx.createBuffer(1, datos.length, SR)
        : (typeof AudioBuffer === 'function' ? new AudioBuffer({ length: datos.length, numberOfChannels: 1, sampleRate: SR }) : null);
    }catch(e){ b = null; }
    if(!b) return null;
    if(b.copyToChannel) b.copyToChannel(datos, 0); else b.getChannelData(0).set(datos);
    stats.buferes++;
    return b;
  }
  // Pre-renderiza los tres sonidos una sola vez; se reutilizan en cada toque.
  function precargar(){
    try{
      if(!muestras){ muestras = {}; TIPOS.forEach(function(t){ muestras[t] = sintetizar(t); }); }
      if(!buf.add){
        var nuevos = {}, ok = true;
        TIPOS.forEach(function(t){ var b = aBufer(muestras[t]); if(b) nuevos[t] = b; else ok = false; });
        if(ok) buf = nuevos;                                            // sin AudioBuffer todavía: se crean al abrir el audio
      }
    }catch(e){}
    return !!buf.add;
  }

  // ---------- Audio: un solo contexto para toda la app ----------
  function contexto(){
    if(ctx) return ctx;
    var C = window.AudioContext || window.webkitAudioContext;
    if(!C) return null;
    try{ ctx = new C({ latencyHint: 'interactive' }); }catch(e){ try{ ctx = new C(); }catch(e2){ ctx = null; } }
    if(!ctx) return null;
    stats.contextos++;
    precargar();
    return ctx;
  }
  function dormir(){ clearTimeout(reposoT); try{ if(ctx && ctx.state === 'running') ctx.suspend().catch(noop); }catch(e){} }
  function programarReposo(){ clearTimeout(reposoT); reposoT = setTimeout(dormir, REPOSO_MS); }
  // Con cada toque el audio queda listo antes de que corra el clic (así el primer sonido no se demora).
  function despertar(ev){
    if(document.hidden || !cfg().on) return;
    try{ if(ev && ev.target && ev.target.closest && ev.target.closest('#voiceFabWrap')) return; }catch(e){}   // el micrófono no abre el audio
    var c = contexto(); if(!c) return;
    if(c.state === 'suspended') try{ c.resume().catch(noop); }catch(e){}
    programarReposo();
  }
  function reproducir(tipo, vol){
    var c = contexto(); if(!c) return false;
    if(!buf[tipo]) precargar();
    var b = buf[tipo]; if(!b) return false;
    try{
      if(c.state !== 'running') c.resume().catch(noop);
      var s = c.createBufferSource(), g = c.createGain();
      s.buffer = b; g.gain.value = vol;
      s.connect(g); g.connect(c.destination);
      s.onended = function(){ try{ s.disconnect(); g.disconnect(); }catch(e){} };
      s.start(0);
      stats.fuentes++;
    }catch(e){ return false; }
    programarReposo();
    return true;
  }

  // ---------- Cuándo suena ----------
  function micEscuchando(){
    if(window.__ventoEscuchando) return true;
    try{ if(typeof voiceListening !== 'undefined' && voiceListening) return true; }catch(e){}   // micrófono del botón abierto
    try{ var h = window.ventoHola && window.ventoHola.estado && window.ventoHola.estado(); if(h && h.corriendo && h.atento) return true; }catch(e){}
    return false;
  }
  function omitir(motivo){ stats.omitidos[motivo] = (stats.omitidos[motivo] || 0) + 1; return false; }
  function sonar(tipo){
    var c = cfg();
    if(!c.on || !c[CLAVE[tipo]]) return omitir('apagado');
    if(callarN > 0) return omitir('callado');
    if(loteN > 0){ pend[tipo] = true; return false; }
    if(document.hidden) return omitir('oculta');
    if(micEscuchando()) return omitir('microfono');
    var ahora = Date.now();
    if(ultimo[tipo] && ahora - ultimo[tipo] < JUNTOS_MS) return omitir('junto');
    ultimo[tipo] = ahora;
    historial.push({ tipo: tipo, t: ahora, vol: c.vol });
    if(historial.length > 100) historial.splice(0, historial.length - 100);
    reproducir(tipo, VOL[c.vol]);
    return true;
  }
  // Envuelve fn (también si devuelve una promesa) y deja pasar UN solo sonido al final: el más importante.
  function envolver(fn, alTerminar){
    var r;
    try{ r = fn(); }catch(e){ alTerminar(); throw e; }
    if(r && typeof r.then === 'function') return r.then(function(v){ alTerminar(); return v; }, function(e){ alTerminar(); throw e; });
    alTerminar();
    return r;
  }
  function lote(fn){
    loteN++;
    return envolver(fn, function(){
      if(--loteN > 0) return;
      var p = pend; pend = {};
      for(var i = 0; i < PRIORIDAD.length; i++) if(p[PRIORIDAD[i]]){ sonar(PRIORIDAD[i]); break; }
    });
  }
  function callar(fn){ callarN++; return envolver(fn, function(){ callarN--; }); }
  // «Probar» en Ajustes: los tres sonidos seguidos con el volumen elegido (aunque alguno esté apagado).
  function probar(){
    if(document.hidden) return;
    var v = VOL[cfg().vol];
    reproducir('add', v);
    setTimeout(function(){ reproducir('remove', v); }, 380);
    setTimeout(function(){ reproducir('success', v); }, 760);
  }

  // ---------- Ajustes → 🔊 Sonidos ----------
  function $(id){ return document.getElementById(id); }
  function pintarAjustes(){
    var g = $('sndGrupo'); if(!g) return;
    var c = cfg();
    [['sndOn', 'on'], ['sndAdd', 'add'], ['sndRemove', 'remove'], ['sndSale', 'sale']].forEach(function(x){ var el = $(x[0]); if(el) el.checked = !!c[x[1]]; });
    g.querySelectorAll('[data-snd-vol]').forEach(function(b){ var on = b.getAttribute('data-snd-vol') === c.vol; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    g.classList.toggle('snd-apagado', !c.on);
  }
  function estilos(){
    if($('sndEstilos')) return;
    var s = document.createElement('style'); s.id = 'sndEstilos';
    s.textContent = '#sndGrupo .snd-vol-row{flex-wrap:wrap}' +
      '#sndGrupo .snd-vol{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--line);border-radius:999px;background:var(--surface);margin-left:auto}' +
      '#sndGrupo .settings-row .snd-vol button{background:transparent;color:var(--ink-soft);border:none;border-radius:999px;padding:8px 14px;min-width:62px;font-weight:700;font-size:13px}' +
      '#sndGrupo .settings-row .snd-vol button.on{background:var(--amber);color:#1b1208}' +
      '#sndGrupo .snd-sub{transition:opacity .15s ease}' +
      '#sndGrupo.snd-apagado .snd-sub{opacity:.45;pointer-events:none}';
    document.head.appendChild(s);
  }
  function iniAjustes(){
    var g = $('sndGrupo'); if(!g || g.getAttribute('data-listo')) return;
    g.setAttribute('data-listo', '1');
    estilos();
    g.addEventListener('change', function(e){
      var m = { sndOn: 'on', sndAdd: 'add', sndRemove: 'remove', sndSale: 'sale' }[e.target && e.target.id];
      if(!m) return;
      var cambio = {}; cambio[m] = !!e.target.checked;
      guardar(cambio);
    });
    g.addEventListener('click', function(e){
      var b = e.target.closest && e.target.closest('[data-snd-vol]');
      if(b){ var c = guardar({ vol: b.getAttribute('data-snd-vol') }); reproducir('add', VOL[c.vol]); return; }   // se oye el volumen nuevo
      if(e.target.closest && e.target.closest('#sndProbar')) probar();
    });
    document.addEventListener('click', function(e){ if(e.target.closest && e.target.closest('.ajustes-cat[data-cat="sonidos"]')) setTimeout(pintarAjustes, 30); });
    pintarAjustes();
  }

  // ---------- Arranque ----------
  ['pointerdown', 'touchend', 'keydown'].forEach(function(ev){ document.addEventListener(ev, despertar, { capture: true, passive: true }); });
  document.addEventListener('visibilitychange', function(){ if(document.hidden) dormir(); });
  precargar();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniAjustes); else iniAjustes();

  window.ventoSonidos = {
    add: function(){ return sonar('add'); },
    remove: function(){ return sonar('remove'); },
    success: function(){ return sonar('success'); },
    lote: lote, callar: callar, cfg: cfg, guardar: guardar, precargar: precargar, probar: probar,
    _historial: historial, _stats: stats,
    _estado: function(){ return { contexto: ctx ? ctx.state : null, buferes: Object.keys(buf).length, lote: loteN, callado: callarN }; }
  };
})();
