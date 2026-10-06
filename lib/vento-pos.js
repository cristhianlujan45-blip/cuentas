/* =====================================================================
   Vento · Modos de trabajo (restaurante / tienda / mixto) y Modo fácil

   1) MODO DE TRABAJO: data.modoOperacion ∈ 'restaurante' | 'tienda' | 'mixto' (viaja con los datos y la nube).
      • 'restaurante' o sin valor: la app de siempre (mesas / cuentas). Aquí no se toca nada.
      • 'tienda': la vista principal es una CAJA (POS): buscador (también lector de código de barras), productos
        con favoritos y más vendidos primero, carrito (+ / − / quitar), TOTAL grande y COBRAR. No se ven las mesas;
        si quedó alguna cuenta abierta sale el botón «Cuentas abiertas» para verlas y cobrarlas.
      • 'mixto': la caja compacta arriba y las mesas debajo.
      El cobro es el MISMO de «⚡ Venta rápida» (qsRegistrarVenta de index.html): una entrada en data.history y el
      descuento de inventario UNA sola vez. El carrito vive en memoria y en localStorage (por equipo y negocio).
   2) MODO FÁCIL (data.easyMode): una cáscara encima de la app con 3 botones grandes: 🛒 Vender, 📊 Hoy y ⋯ Más.
      No borra ni cambia nada: solo tapa la app completa. El mesero (modo mesero) sigue con su pantalla de siempre.
      Vender en mesa usa las mismas funciones de la cuenta (recordItemHistory → inventario y sonido) y el mismo
      cierre (closeTableToHistory). Después de cobrar, «↩ Deshacer» grande por 5 s en vez de preguntar antes.
   Sonidos: window.ventoSonidos (add / remove / success), siempre con guarda.
   Suscripción: si no se puede vender (subPuedeVender() o ventoAcceso.tiene('pos_basic')) sale subPaywall(…).
   ===================================================================== */
(function(){
  'use strict';
  if(window.ventoPOS) return;

  // ---------- Utilidades ----------
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const D = () => { try{ return typeof data !== 'undefined' ? data : null; }catch(e){ return null; } };
  const plata = n => { try{ return fmt(Number(n) || 0); }catch(e){ return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); } };
  const aviso = (m, ms) => { try{ showToast(m, ms); }catch(e){} };
  const guardar = () => { try{ return saveData(); }catch(e){} };
  const son = t => { try{ window.ventoSonidos && window.ventoSonidos[t] && window.ventoSonidos[t](); }catch(e){} };
  const lsGet = (k, d) => { try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } };
  const lsSet = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
  const sinTilde = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const llamar = (fn, ...a) => { try{ return typeof fn === 'function' ? fn(...a) : undefined; }catch(e){ return undefined; } };
  const etiqueta = id => { try{ return tableLabel(id); }catch(e){ return 'Mesa ' + id; } };
  const unidad = () => { try{ return [getServiceUnitName(), getServiceUnitNamePlural()]; }catch(e){ return ['Mesa', 'Mesas']; } };
  const usuario = () => { try{ return typeof authUser !== 'undefined' ? authUser : null; }catch(e){ return null; } };

  // ---------- Modo de trabajo ----------
  const MODOS = ['restaurante', 'tienda', 'mixto'];
  const modo = () => { const d = D(); return d && MODOS.includes(d.modoOperacion) ? d.modoOperacion : 'restaurante'; };
  // Negocio nuevo: las tiendas venden por caja; las que fían por cliente (distribuidora, muebles…) usan las dos.
  function modoPorTipo(tipo){
    try{
      const VN = window.VENTO_NEGOCIOS, t = VN && (VN.get(tipo) || VN.get('otro'));
      if(!t || t.fam !== 'tienda') return 'restaurante';
      return t.esp && t.esp[0] !== 'Cuenta' ? 'mixto' : 'tienda';
    }catch(e){ return 'restaurante'; }
  }
  async function ponerModo(m){
    const d = D(); if(!d || !MODOS.includes(m)) return;
    d.modoOperacion = m;
    pintarPos(); llamar(window.aplicarVocabulario); pintarFacil();
    await guardar();
  }

  // ---------- Suscripción: ¿se puede vender? ----------
  function puedeVender(){
    try{ if(typeof subPuedeVender === 'function' && !subPuedeVender()) return false; }catch(e){}
    try{ const a = window.ventoAcceso; if(a && typeof a.tiene === 'function' && !a.tiene('pos_basic')) return false; }catch(e){}
    return true;
  }
  function bloqueado(){
    if(puedeVender()) return false;
    try{ if(typeof subPaywall === 'function') subPaywall('Para hacer ventas nuevas, renueva tu suscripción.'); else aviso('🔒 Para vender, renueva tu suscripción.'); }catch(e){}
    return true;
  }

  // ---------- Productos: favoritos y más vendidos primero ----------
  let topCache = { clave: '', cuenta: {} };
  function vendidos(){
    const d = D(), h = (d && d.history) || [];
    const clave = h.length + '|' + (h[0] && (h[0].id || h[0].date || h[0].t));
    if(topCache.clave === clave) return topCache.cuenta;
    const cuenta = {};
    h.slice(0, 500).forEach(e => (e.items || []).forEach(it => { const k = sinTilde(it.name); cuenta[k] = (cuenta[k] || 0) + (Number(it.qty) || 0); }));
    topCache = { clave, cuenta };
    return cuenta;
  }
  function productos(q, cat){
    const d = D(); if(!d) return [];
    const c = vendidos(), qq = sinTilde(q).trim();
    let L = (d.products || []).filter(p => p && p.name);
    if(cat === 'fav') L = L.filter(p => p.favorite);
    else if(cat) L = L.filter(p => p.categoryId === cat);
    if(qq){ const ws = qq.split(/\s+/); L = L.filter(p => { const h = sinTilde(p.name + ' ' + (p.size || '')); return ws.every(w => h.includes(w)); }); }
    return L.map(p => [p, (p.favorite ? 1e9 : 0) + (c[sinTilde(p.name)] || 0)])
      .sort((a, b) => b[1] - a[1] || String(a[0].name).localeCompare(String(b[0].name), 'es'))
      .map(x => x[0]);
  }
  const producto = id => { const d = D(); return d && (d.products || []).find(p => p.id === id); };

  // Cara del producto: su foto si tiene, un emoji según el nombre o su inicial.
  const EMOJIS = [
    [/\b(cerveza|aguila|poker|club|costena|costenita|corona|pilsen|redds|budweiser|heineken|stella|cola y pola)\b/, '🍺'],
    [/\b(aguardiente|ron|whisky|vodka|tequila|licor|guaro|antioqueno|nectar|brandy)\b/, '🍾'], [/\b(vino|sangria)\b/, '🍷'],
    [/\b(coctel|mojito|michelada|margarita coctel)\b/, '🍹'], [/\b(agua|cristal|brisa)\b/, '💧'],
    [/\b(gaseosa|coca|cocacola|pepsi|colombiana|postobon|sprite|quatro|bretana|pony|malta|soda|speed|vive100|gatorade|powerade)\b/, '🥤'],
    [/\b(jugo|limonada|batido|avena|kumis|yogur|yogurt|te helado|hit)\b/, '🧃'],
    [/\b(cafe|tinto|capuchino|latte|americano|aromatica|te|chocolate caliente|perico|carajillo)\b/, '☕'],
    [/\b(hamburguesa|burger)\b/, '🍔'], [/\b(perro|hot dog|salchipapa|salchicha)\b/, '🌭'], [/\b(pizza)\b/, '🍕'],
    [/\b(empanada|arepa|pandebono|bunuelo|pan|croissant|almojabana|pandeyuca|sandwich|sanduche)\b/, '🥐'],
    [/\b(papa|papas|fritas|chips|margarita|detodito|platanito|choclitos)\b/, '🍟'], [/\b(pollo|alitas|pechuga)\b/, '🍗'],
    [/\b(carne|res|cerdo|chicharron|costilla|bandeja|chorizo|morcilla|picada|lomo)\b/, '🥩'],
    [/\b(sopa|caldo|sancocho|ajiaco|almuerzo|corrientazo|menu|plato|ejecutivo)\b/, '🍲'], [/\b(arroz)\b/, '🍚'],
    [/\b(pescado|mojarra|sushi|rollo|camaron|trucha)\b/, '🐟'],
    [/\b(ensalada|fruta|frutas|banano|manzana|mango|fresa|tomate|papaya|pina|naranja|limon)\b/, '🍎'],
    [/\b(helado|cono|paleta|malteada|copa)\b/, '🍦'], [/\b(torta|postre|ponque|pastel|brownie|cupcake|tres leches)\b/, '🍰'],
    [/\b(galleta|galletas|chocorramo|dulce|dulces|chocolate|chocolatina|chicle|bonbonbum|confite|mecato)\b/, '🍫'],
    [/\b(huevo|huevos)\b/, '🥚'], [/\b(leche|queso|cuajada|mantequilla)\b/, '🧀'], [/\b(cigarrillo|cigarrillos|marlboro|lucky|boston)\b/, '🚬'],
    [/\b(corte|cabello|barba|peluqueria|cepillado|keratina|tinte|cejas)\b/, '💇'], [/\b(unas|manicure|pedicure|esmalte|acrilicas)\b/, '💅'],
    [/\b(lavado|lavada|polichada|brillada)\b/, '🚿'], [/\b(servicio|reparacion|arreglo|mano de obra|revision|mantenimiento)\b/, '🛠️'],
    [/\b(hora|horas|tiempo|rato|noche|habitacion|cama)\b/, '⏱️'], [/\b(recarga|minutos|datos)\b/, '📱'], [/\b(copia|copias|impresion)\b/, '📄']
  ];
  function emoji(p){ const n = sinTilde(p.name); for(const [re, e] of EMOJIS) if(re.test(n)) return e; return ''; }
  function caraHtml(p){
    let f = ''; try{ f = p.foto && typeof fotosCache !== 'undefined' && fotosCache[p.id] || ''; }catch(e){}
    if(f && /^data:image\//.test(f)) return '<span class="pz-cara"><img src="' + esc(f) + '" alt="" loading="lazy"></span>';
    const e = emoji(p);
    return '<span class="pz-cara">' + (e ? e : '<span class="pz-letra">' + esc((String(p.name).trim()[0] || '?').toUpperCase()) + '</span>') + '</span>';
  }

  // ---------- Carrito de la caja (POS) ----------
  let carrito = null, carritoClave = '';
  const kCarrito = () => { let k = 'x'; try{ k = typeof STORAGE_KEY !== 'undefined' ? STORAGE_KEY : 'x'; }catch(e){} return 'vento_pos_carrito:' + k; };
  function cart(){
    const k = kCarrito();
    if(!carrito || carritoClave !== k){ carritoClave = k; carrito = (lsGet(k, []) || []).filter(it => it && it.id && it.qty > 0); }
    return carrito;
  }
  const guardarCarrito = () => lsSet(kCarrito(), carrito || []);
  const caja = {
    tipo: 'caja',
    lineas(){
      return cart().map(it => {
        const p = producto(it.id);
        if(p){ it.name = p.name; it.price = Number(p.price) || 0; }   // el precio de hoy
        return { k: it.id, id: it.id, name: it.name, price: Number(it.price) || 0, qty: it.qty };
      });
    },
    cuanto(id){ const it = cart().find(x => x.id === id); return it ? it.qty : 0; },
    add(p){
      if(bloqueado()) return false;
      const c = cart(), it = c.find(x => x.id === p.id);
      if(it) it.qty += 1; else c.push({ id: p.id, name: p.name, price: Number(p.price) || 0, qty: 1 });
      guardarCarrito(); son('add');
      return true;
    },
    mas(k){ const it = cart().find(x => x.id === k); if(!it || bloqueado()) return; it.qty += 1; guardarCarrito(); son('add'); },
    menos(k){
      const c = cart(), i = c.findIndex(x => x.id === k); if(i < 0) return;
      if(c[i].qty > 1) c[i].qty -= 1; else c.splice(i, 1);
      guardarCarrito(); son('remove');
    },
    quitar(k){ const c = cart(), i = c.findIndex(x => x.id === k); if(i < 0) return; c.splice(i, 1); guardarCarrito(); son('remove'); },
    cobrar(o){ return cobrarCaja(o); }
  };
  function vaciarCarrito(){
    const antes = cart().map(x => Object.assign({}, x)); if(!antes.length) return;
    carrito = []; guardarCarrito(); son('remove'); pintarTodo();
    deshacer('🗑️ Carrito vacío', () => { carrito = antes; guardarCarrito(); pintarTodo(); });
  }
  // Cobra el carrito con el registro de «Venta rápida» (historial + inventario una sola vez).
  async function cobrarCaja(o){
    o = o || {};
    const L = caja.lineas(); if(!L.length) return null;
    if(bloqueado()) return null;
    if(typeof qsRegistrarVenta !== 'function'){ aviso('⚠️ No se pudo registrar la venta. Recarga Vento.'); return null; }
    const total = L.reduce((s, x) => s + x.price * x.qty, 0);
    const pago = o.pago || await elegirPago(total, { fiado: !o.grande, grande: !!o.grande });
    if(!pago) return null;
    const copia = cart().map(x => Object.assign({}, x));
    const entry = qsRegistrarVenta(L.map(x => ({ productId: x.id, name: x.name, price: x.price, qty: x.qty })), { method: pago.method, deudor: pago.deudor, nota: pago.nota });
    carrito = []; guardarCarrito();
    if(pago.method !== 'debe'){ son('success'); try{ window.mesoraCelebrar && window.mesoraCelebrar(['💰', '✨', '🎉']); }catch(e){} }
    pintarTodo(); llamar(window.renderMesas);
    deshacer((pago.method === 'debe' ? '⏳ ' + pago.deudor + ' quedó debiendo ' : '✅ Vendido ') + plata(entry.total) + (pago.vueltas > 0 ? ' · Vueltas ' + plata(pago.vueltas) : ''), () => {
      if(typeof qsDeshacerVenta === 'function' && qsDeshacerVenta(entry)){
        const c = cart(); copia.forEach(x => { const y = c.find(z => z.id === x.id); if(y) y.qty += x.qty; else c.push(x); });
        guardarCarrito(); pintarTodo(); llamar(window.renderMesas);
        aviso('↩ Venta deshecha. Los productos volvieron al carrito.');
      }
    });
    return entry;
  }

  // ---------- Cuenta de una mesa (modo fácil): las mismas funciones de la cuenta de siempre ----------
  function mesaSrc(id){
    const T = () => { const d = D(); return d && d.tables && d.tables[id]; };
    const tocar = (it, n) => { if(typeof recordItemHistory === 'function') recordItemHistory(it, n); else son(n > 0 ? 'add' : 'remove'); };
    const nota = (name, n) => { try{ noteManualChange(id, name, n); }catch(e){} };
    return {
      tipo: 'mesa', id,
      lineas(){ const t = T(); return t ? (t.items || []).map((it, i) => ({ k: i, id: it.productId, name: it.name, price: Number(it.price) || 0, qty: it.qty })) : []; },
      cuanto(pid){ const t = T(); return t ? (t.items || []).filter(it => it.productId === pid).reduce((s, it) => s + (Number(it.qty) || 0), 0) : 0; },
      add(p){
        if(bloqueado()) return false;
        const t = T(); if(!t) return false;
        if(!t.items) t.items = [];
        const ex = t.items.find(it => it.productId === p.id && !it.personId);
        if(ex){ ex.qty += 1; tocar(ex, 1); }                    // inventario y sonido «tún» (como en la cuenta)
        else { const it = { productId: p.id, name: p.name, price: p.price, size: p.size || '', qty: 1, personId: null, history: [] }; tocar(it, 1); t.items.push(it); }
        nota(p.name, 1); guardar(); llamar(window.renderMesas);
        return true;
      },
      mas(k){ const t = T(), it = t && t.items[k]; if(!it || bloqueado()) return; it.qty += 1; tocar(it, 1); nota(it.name, 1); guardar(); llamar(window.renderMesas); },
      menos(k){
        const t = T(), it = t && t.items[k]; if(!it) return;
        if(it.qty <= 1){ nota(it.name, -it.qty); try{ invOnSale(it, -it.qty); }catch(e){} t.items.splice(k, 1); son('remove'); }
        else { it.qty -= 1; tocar(it, -1); nota(it.name, -1); }
        guardar(); llamar(window.renderMesas);
      },
      quitar(k){
        const t = T(), it = t && t.items[k]; if(!it) return;
        nota(it.name, -it.qty); try{ invOnSale(it, -it.qty); }catch(e){} t.items.splice(k, 1); son('remove');
        guardar(); llamar(window.renderMesas);
      },
      cobrar(o){ return cobrarMesa(id, o); }
    };
  }
  // Cierra la cuenta como «Cobrar todo y liberar mesa»: un pago por el saldo y closeTableToHistory (el inventario ya
  // se descontó al agregar, así que no se toca otra vez). Deshacer devuelve la mesa como estaba.
  async function cobrarMesa(id, o){
    o = o || {};
    const d = D(), t = d && d.tables && d.tables[id];
    if(!t || !(t.items || []).length || typeof closeTableToHistory !== 'function') return null;
    let saldo = 0; try{ saldo = tableBalance(id); }catch(e){ saldo = t.items.reduce((s, it) => s + it.price * it.qty, 0); }
    const pago = o.pago || await elegirPago(saldo || t.items.reduce((s, it) => s + it.price * it.qty, 0), { fiado: false, grande: true });
    if(!pago) return null;
    const t2 = D().tables[id]; if(!t2 || !(t2.items || []).length) return null;
    const antes = JSON.parse(JSON.stringify({ items: t2.items || [], payments: t2.payments || [], people: t2.people || [] }));
    const factura = D().invoiceNextNo;
    try{ saldo = tableBalance(id); }catch(e){}
    if(saldo > 0){ if(!t2.payments) t2.payments = []; t2.payments.push({ note: 'Pagó todo (' + pago.nota + ')', amount: saldo, method: pago.method, at: Date.now() }); }
    const entry = closeTableToHistory(id);
    if(!entry) return null;
    if(!(entry.debt > 0)) son('success');
    await guardar();
    if(fz.mesa === id) fz.mesa = null;
    llamar(window.renderMesas); pintarTodo();
    deshacer('✅ Cobrado ' + plata(entry.total) + ' · ' + etiqueta(id) + (pago.vueltas > 0 ? ' · Vueltas ' + plata(pago.vueltas) : ''), () => {
      const dd = D(), i = dd.history.findIndex(h => h.id === entry.id); if(i < 0) return;
      dd.history.splice(i, 1);
      const t3 = dd.tables[id] || (dd.tables[id] = { items: [], payments: [], people: [] });
      t3.items = antes.items.concat(t3.items || []); t3.payments = antes.payments.concat(t3.payments || []); t3.people = antes.people.concat(t3.people || []);
      if(dd.invoiceNextNo === factura + 1) dd.invoiceNextNo = factura;
      guardar(); fz.mesa = id; llamar(window.renderMesas); pintarTodo();
      aviso('↩ Cobro deshecho. ' + etiqueta(id) + ' quedó abierta otra vez.');
    });
    return entry;
  }

  // ---------- ¿Cómo pagó? Efectivo, Nequi, DaviPlata, Tarjeta (y fiado en la caja) ----------
  const METODOS = [['efectivo', '💵', 'Efectivo'], ['nequi', '💜', 'Nequi'], ['daviplata', '🔴', 'DaviPlata'], ['tarjeta', '💳', 'Tarjeta']];
  let quietoHasta = 0;   // un doble toque en «Efectivo» no debe caer en un producto de la venta siguiente
  function elegirPago(total, o){
    o = o || {};
    const previo = document.querySelector('.pz-pago-ov');
    if(previo && previo.classList.contains('show')) return Promise.resolve(null);   // ya hay uno abierto (doble toque en COBRAR)
    // Uno que quedó escondido (el botón Atrás de la APK le quita «show» desde afuera): se cierra como «Cancelar».
    if(previo){ if(typeof previo._fin === 'function') previo._fin(null); else previo.remove(); }
    const abierto = Date.now();
    return new Promise(res => {
      const ov = document.createElement('div');
      ov.className = 'overlay show pz-pago-ov' + (o.grande ? ' pz-pago-grande' : ''); ov.setAttribute('data-novocab', '');
      const billetes = [0, 2000, 5000, 10000, 20000, 50000, 100000].filter(b => b === 0 || b > total).slice(0, 5);
      ov.innerHTML = '<div class="modal pz-pago" role="dialog" aria-modal="true" aria-label="Cobrar">' +
        '<div class="pz-pago-tot"><span>Total a cobrar</span><b>' + plata(total) + '</b></div>' +
        '<div class="pz-pago-q">¿Cómo pagó?</div>' +
        '<div class="pz-metodos">' + METODOS.map(m => '<button type="button" class="pz-met" data-m="' + m[0] + '"><i>' + m[1] + '</i><span>' + m[2] + '</span></button>').join('') + '</div>' +
        '<details class="pz-vu-box"><summary>💵 ¿Con cuánto paga? (vueltas)</summary><div class="pz-billetes">' +
          billetes.map(b => '<button type="button" data-b="' + b + '">' + (b ? plata(b) : 'Exacto') + '</button>').join('') + '</div>' +
          (o.grande ? '' : '<input type="number" inputmode="numeric" min="0" class="mz-in pz-pagacon" placeholder="Otro valor">') + '<div class="pz-vu"></div></details>' +
        (o.fiado ? '<button type="button" class="btn-ghost pz-fiado">📝 Queda debiendo (fiado)</button><div class="pz-fiado-box" hidden><input class="mz-in pz-deudor" maxlength="40" placeholder="¿Quién queda debiendo?" autocomplete="off"><button type="button" class="btn-primary pz-fiado-ok">Guardar fiado</button></div>' : '') +
        '<button type="button" class="btn-close pz-cancel">Cancelar</button></div>';
      document.body.appendChild(ov);
      let recibido = 0;
      const vu = ov.querySelector('.pz-vu');
      const ponerRecibido = v => { recibido = Number(v) || 0; vu.textContent = recibido ? (recibido >= total ? 'Vueltas: ' + plata(recibido - total) : 'Faltan ' + plata(total - recibido)) : ''; vu.classList.toggle('falta', recibido > 0 && recibido < total); };
      const fin = r => { document.removeEventListener('keydown', tecla, true); ov.remove(); if(r) quietoHasta = Date.now() + 450; res(r); };
      ov._fin = fin;   // window.ventoAtras (botón Atrás de Android) lo cierra como «Cancelar»
      const tecla = e => { if(e.key === 'Escape'){ e.stopPropagation(); e.preventDefault(); fin(null); } };
      document.addEventListener('keydown', tecla, true);
      ov.addEventListener('click', e => {
        if(e.target === ov && Date.now() - abierto < 400) return;   // el segundo toque del doble toque en COBRAR
        if(e.target === ov || e.target.closest('.pz-cancel')) return fin(null);
        const b = e.target.closest('[data-b]');
        if(b){ ov.querySelectorAll('[data-b]').forEach(x => x.classList.toggle('on', x === b)); ponerRecibido(+b.dataset.b || total); return; }
        const m = e.target.closest('.pz-met');
        if(m){
          const k = m.dataset.m, info = METODOS.find(x => x[0] === k);
          return fin({ method: k === 'efectivo' ? 'efectivo' : 'transferencia', nota: info[2], metodo: k, vueltas: k === 'efectivo' && recibido > total ? recibido - total : 0 });
        }
        if(e.target.closest('.pz-fiado')){ const bx = ov.querySelector('.pz-fiado-box'); bx.hidden = false; bx.querySelector('input').focus(); return; }
        if(e.target.closest('.pz-fiado-ok')){
          const n = ov.querySelector('.pz-deudor').value.trim();
          if(!n){ aviso('⚠️ Escribe quién queda debiendo.'); ov.querySelector('.pz-deudor').focus(); return; }
          return fin({ method: 'debe', deudor: n, nota: n, metodo: 'debe', vueltas: 0 });
        }
      });
      const pc = ov.querySelector('.pz-pagacon'); if(pc) pc.addEventListener('input', () => ponerRecibido(pc.value));
      const dn = ov.querySelector('.pz-deudor'); if(dn) dn.addEventListener('keydown', e => { if(e.key === 'Enter') ov.querySelector('.pz-fiado-ok').click(); });
      setTimeout(() => { const f = ov.querySelector('.pz-met'); if(f) try{ f.focus({ preventScroll: true }); }catch(e){} }, 30);
    });
  }

  // ---------- «↩ Deshacer» grande por 5 segundos (en vez de preguntar antes) ----------
  let deshacerT = null;
  function deshacer(msg, fn){
    let b = $('pzDeshacer');
    if(!b){ b = document.createElement('div'); b.id = 'pzDeshacer'; b.setAttribute('role', 'status'); b.setAttribute('data-novocab', ''); document.body.appendChild(b); }
    b.innerHTML = '<span class="pz-dmsg"></span><button type="button" class="pz-dbtn">↩ Deshacer</button><i class="pz-dbar"></i>';
    b.querySelector('.pz-dmsg').textContent = msg;
    b.hidden = false;
    clearTimeout(deshacerT);
    b.querySelector('.pz-dbtn').onclick = () => { clearTimeout(deshacerT); b.hidden = true; try{ fn(); }catch(e){} };
    deshacerT = setTimeout(() => { b.hidden = true; }, 5000);
  }

  // ---------- La caja: buscador + productos + carrito (sirve para tienda, mixto y el modo fácil) ----------
  // opt.variante: 'tienda' (completa) | 'mixto' (compacta) | 'grande' (modo fácil). opt.titulo / opt.atras / opt.mic.
  function montarCaja(root, src, opt){
    let st = root._pz;
    if(!st || st.variante !== opt.variante || st.titulo !== (opt.titulo || '')){
      st = root._pz = { variante: opt.variante, titulo: opt.titulo || '', q: '', cat: '' };
      const g = opt.variante === 'grande', mixto = opt.variante === 'mixto';
      root.innerHTML =
        (g && (opt.titulo || opt.atras) ? '<div class="fz-barra">' + (opt.atras ? '<button type="button" class="fz-atras" data-atras="1">← ' + esc(unidad()[1]) + '</button>' : '') +
          '<b class="fz-titulo">' + esc(opt.titulo || '') + '</b>' + (opt.mic && hayVoz() ? '<button type="button" class="pz-mic" data-mic="1">🎤 Decir pedido</button>' : '') + '</div>' : '') +
        '<div class="pz pz-' + opt.variante + '">' +
          '<div class="pz-prod">' +
            '<div class="pz-buscar"' + (g && ((D() || {}).products || []).length <= 12 ? ' hidden' : '') + '><input type="search" class="pz-q" placeholder="🔍 ' + (g ? 'Buscar' : 'Buscar producto o código') + '" autocomplete="off" enterkeyhint="done" aria-label="Buscar producto">' +
              (g ? '' : '<button type="button" class="pz-scan" data-scan="1" title="Escanear código de barras" aria-label="Escanear código de barras">▦</button>') + '</div>' +
            (mixto || g ? '' : '<div class="pz-cats"></div>') +
            '<div class="pz-grid"></div>' +
            (opt.variante === 'tienda' ? '<div class="pz-cuentas"></div>' : '') +
          '</div>' +
          '<aside class="pz-cart" aria-label="Lo que se está vendiendo">' +
            '<div class="pz-cart-h"><b>' + (g && src.tipo === 'mesa' ? '🧾 Lo pedido' : '🛒 Venta') + '</b><span class="pz-n"></span>' + (g ? '' : '<button type="button" class="pz-vaciar" data-vaciar="1">Vaciar</button>') + '</div>' +
            '<div class="pz-lineas"></div>' +
            '<div class="pz-pie"><div class="pz-total"><span>TOTAL</span><b>' + plata(0) + '</b></div><button type="button" class="pz-cobrar" disabled>💵 COBRAR</button></div>' +
          '</aside>' +
        '</div>';
      const q = root.querySelector('.pz-q');
      q.addEventListener('input', () => { st.q = q.value; pintarProductos(root); });
      q.addEventListener('keydown', e => {
        if(e.key !== 'Enter') return;
        e.preventDefault();
        const v = q.value.trim(); if(!v) return;
        // Lector de código de barras (teclado) o una sola coincidencia: se agrega de una.
        let p = null; try{ p = typeof findProductByScannedCode === 'function' ? findProductByScannedCode(v) : null; }catch(x){}
        if(!p){ const L = productos(v, ''); if(L.length === 1) p = L[0]; }
        if(p && root._pz.src.add(p)){ q.value = ''; st.q = ''; pintarCaja(root); }
      });
      if(!root._pzClic){ root._pzClic = true; root.addEventListener('click', e => clicCaja(root, e)); }   // una sola vez por contenedor
    }
    st.src = src; st.opt = opt;
    pintarCaja(root);
  }
  function clicCaja(root, e){
    const st = root._pz, src = st && st.src; if(!src) return;
    const t = e.target.closest('button'); if(!t || !root.contains(t)) return;
    if(Date.now() < quietoHasta && (t.dataset.add || t.classList.contains('pz-cobrar'))) return;
    if(t.dataset.add){ const p = producto(t.dataset.add); if(p && src.add(p)) pintarCaja(root); return; }
    if(t.dataset.menos != null){ src.menos(clave(src, t.dataset.menos)); pintarCaja(root); return; }
    if(t.dataset.mas != null){ src.mas(clave(src, t.dataset.mas)); pintarCaja(root); return; }
    if(t.dataset.quitar != null){ src.quitar(clave(src, t.dataset.quitar)); pintarCaja(root); return; }
    if(t.dataset.cat != null){ st.cat = t.dataset.cat; pintarProductos(root); return; }
    if(t.classList.contains('pz-cobrar')){ src.cobrar({ grande: st.variante === 'grande' }); return; }
    if(t.dataset.vaciar){ vaciarCarrito(); return; }
    if(t.dataset.scan){ escanear(); return; }
    if(t.dataset.cuentas){ document.body.classList.toggle('pz-ver-cuentas'); pintarCuentas(root); return; }
    if(t.dataset.domicilio){ const b = $('domicilioBtn'); if(b) b.click(); return; }
    if(t.dataset.atras){ fz.mesa = null; fz.caja = false; pintarFacil(); return; }
    if(t.dataset.mic){ decirPedido(); return; }
  }
  const clave = (src, k) => src.tipo === 'mesa' ? Number(k) : k;
  function pintarCaja(root){ pintarProductos(root); pintarCarrito(root); pintarCuentas(root); }
  function pintarProductos(root){
    const st = root._pz, src = st.src, d = D(); if(!d) return;
    const grid = root.querySelector('.pz-grid'), cats = root.querySelector('.pz-cats');
    if(cats){
      const C = (d.categories || []).filter(c => (d.products || []).some(p => p.categoryId === c.id));
      const hayFav = (d.products || []).some(p => p.favorite);
      if(st.cat && st.cat !== 'fav' && !C.some(c => c.id === st.cat)) st.cat = '';
      cats.hidden = !C.length && !hayFav;
      cats.innerHTML = cats.hidden ? '' : [['', 'Todos']].concat(hayFav ? [['fav', '⭐ Favoritos']] : [], C.map(c => [c.id, c.name]))
        .map(c => '<button type="button" data-cat="' + esc(c[0]) + '"' + (st.cat === c[0] ? ' class="on"' : '') + '>' + esc(c[1]) + '</button>').join('');
    }
    const max = st.variante === 'mixto' ? 24 : 80;
    const L = productos(st.q, st.cat), ver = L.slice(0, max);
    if(!(d.products || []).length){ grid.innerHTML = '<div class="pz-vacio">Todavía no tienes productos. Agrégalos en ' + (fz.tab && facilActivo() ? '«⋯ Más» → Productos' : 'la pestaña Productos') + '.</div>'; return; }
    if(!L.length){ grid.innerHTML = '<div class="pz-vacio">No encontré «' + esc(st.q) + '».</div>'; return; }
    grid.innerHTML = ver.map(p => {
      const n = src.cuanto(p.id), sinStock = p.stock != null && p.stock <= 0, poco = p.stock != null && !sinStock && p.stock <= (p.minStock != null ? p.minStock : 3);
      return '<button type="button" class="pz-tile' + (n ? ' en' : '') + '" data-add="' + esc(p.id) + '" aria-label="' + esc(p.name + ', ' + plata(p.price)) + '">' +
        caraHtml(p) + '<span class="pz-nom">' + esc(p.name) + (p.size ? ' <small>' + esc(p.size) + '</small>' : '') + '</span><span class="pz-pre">' + plata(p.price) + '</span>' +
        (n ? '<span class="pz-cant">' + n + '</span>' : '') + (sinStock ? '<span class="pz-stock">Agotado</span>' : poco ? '<span class="pz-stock">Quedan ' + p.stock + '</span>' : '') + '</button>';
    }).join('') + (L.length > ver.length ? '<div class="pz-mas">… y ' + (L.length - ver.length) + ' más: búscalos arriba.</div>' : '');
  }
  function pintarCarrito(root){
    const st = root._pz, src = st.src, g = st.variante === 'grande';
    const L = src.lineas(), total = L.reduce((s, x) => s + x.price * x.qty, 0), unid = L.reduce((s, x) => s + (Number(x.qty) || 0), 0);
    const cartEl = root.querySelector('.pz-cart'); cartEl.classList.toggle('vacio', !L.length);
    root.querySelector('.pz-n').textContent = unid ? unid + (unid === 1 ? ' producto' : ' productos') : '';
    const vac = root.querySelector('.pz-vaciar'); if(vac) vac.hidden = !L.length;
    root.querySelector('.pz-lineas').innerHTML = L.length ? L.map(x =>
      '<div class="pz-linea"><div class="pz-ln"><b>' + (g ? x.qty + ' × ' : '') + esc(x.name) + '</b><small>' + (g ? plata(x.price * x.qty) : plata(x.price) + ' c/u') + '</small></div>' +
      (g ? '<div class="pz-step"><button type="button" data-menos="' + esc(x.k) + '" aria-label="Quitar uno de ' + esc(x.name) + '">−</button></div>'
         : '<div class="pz-step"><button type="button" data-menos="' + esc(x.k) + '" aria-label="Quitar uno">−</button><span>' + x.qty + '</span><button type="button" data-mas="' + esc(x.k) + '" aria-label="Sumar uno">+</button></div>' +
           '<b class="pz-sub">' + plata(x.price * x.qty) + '</b><button type="button" class="pz-x" data-quitar="' + esc(x.k) + '" aria-label="Quitar ' + esc(x.name) + '">✕</button>') +
      '</div>').join('') : '<div class="pz-vacio">' + (g ? 'Toca un producto para agregarlo.' : 'Toca un producto para venderlo.') + '</div>';
    root.querySelector('.pz-total b').textContent = plata(total);
    const cb = root.querySelector('.pz-cobrar'); cb.disabled = !L.length;
    // Tienda en el celular: el micrófono flotante sube encima del carrito para no tapar COBRAR.
    if(st.variante === 'tienda' && cartEl.offsetHeight) try{ document.body.style.setProperty('--pz-cart-h', cartEl.offsetHeight + 'px'); }catch(e){}
  }
  // Tienda: si quedó alguna cuenta abierta de antes, un botón para verla y cobrarla (no se pierde nada).
  function pintarCuentas(root){
    const box = root.querySelector('.pz-cuentas'); if(!box) return;
    const d = D(), n = d ? Object.keys(d.tables || {}).filter(id => (d.tables[id].items || []).length).length : 0;
    const dom = $('domicilioBtn'), conDom = !!(dom && !dom.hidden && d && d.domiciliosOn);
    let html = conDom ? '<button type="button" class="btn-ghost pz-cuentas-btn' + (dom.classList.contains('btn-warn') ? ' btn-warn' : '') + '" data-domicilio="1">' + esc(dom.textContent) + '</button>' : '';
    if(!n) document.body.classList.remove('pz-ver-cuentas');
    else {
      const ver = document.body.classList.contains('pz-ver-cuentas'), pl = unidad()[1].toLowerCase();
      html += '<button type="button" class="btn-ghost pz-cuentas-btn" data-cuentas="1">' + (ver ? '▲ Ocultar ' + esc(pl) : '🧾 ' + esc(unidad()[1]) + ' abiertas (' + n + ') · ver y cobrar') + '</button>';
    }
    if(box._html !== html){ box._html = html; box.innerHTML = html; }
  }
  function escanear(){
    if(typeof openScanOverlay !== 'function'){ aviso('Tu navegador no puede leer códigos con la cámara. Busca el producto a mano.'); return; }
    openScanOverlay(raw => {
      let p = null; try{ p = findProductByScannedCode(raw); }catch(e){}
      const meter = prod => { if(caja.add(prod)){ pintarTodo(); aviso('✅ ' + prod.name + ' agregado'); } };
      if(p) return meter(p);
      try{ handleUnknownScannedCode(raw, meter); }catch(e){ aviso('No encontré ese código.'); }
    }, { hint: 'Escanea el código del producto para agregarlo a la venta — puedes escanear varios seguidos.' });
  }

  // ---------- Panel de la caja en la vista principal (tienda / mixto) ----------
  function pintarPos(){
    const el = $('posPanel'), d = D(), m = d ? modo() : 'restaurante';
    document.body.classList.toggle('modo-tienda', m === 'tienda');
    document.body.classList.toggle('modo-mixto', m === 'mixto');
    pintarModoBox();
    if(!el) return;
    if(m === 'restaurante'){ if(!el.hidden || el.innerHTML){ el.hidden = true; el.innerHTML = ''; el._pz = null; } document.body.classList.remove('pz-ver-cuentas'); return; }
    el.hidden = false;
    montarCaja(el, caja, { variante: m });
  }
  // Ajustes → Negocio → «Modo de trabajo».
  function pintarModoBox(){
    const box = $('modoTrabajoBox'); if(!box || !D()) return;
    const m = modo(), pl = unidad()[1];
    const ops = [['restaurante', '🍽️', 'Con ' + pl.toLowerCase(), 'Cada ' + unidad()[0].toLowerCase() + ' tiene su cuenta'], ['tienda', '🏪', 'Tienda (caja)', 'Buscas, cobras y listo. Sin ' + pl.toLowerCase()], ['mixto', '🔀', 'Mixto', 'Caja arriba y ' + pl.toLowerCase() + ' abajo']];
    const html = '<div class="settings-row pz-modo-row"><div class="settings-row-text"><strong>Modo de trabajo</strong><span>Cómo vendes en la pantalla principal. Puedes cambiarlo cuando quieras: no se borra nada.</span></div>' +
      '<div class="pz-modos" role="radiogroup" aria-label="Modo de trabajo">' + ops.map(o => '<button type="button" role="radio" aria-checked="' + (m === o[0]) + '" class="pz-modo' + (m === o[0] ? ' on' : '') + '" data-modo="' + o[0] + '"><i>' + o[1] + '</i><b>' + esc(o[2]) + '</b><small>' + esc(o[3]) + '</small></button>').join('') + '</div></div>';
    if(box._html === html) return;
    box._html = html; box.innerHTML = html;
    box.onclick = async e => {
      const b = e.target.closest('[data-modo]'); if(!b || b.dataset.modo === modo()) return;
      await ponerModo(b.dataset.modo);
      aviso('✅ Modo de trabajo: ' + b.querySelector('b').textContent + '.');
    };
  }

  // ---------- Modo fácil: cáscara con Vender / Hoy / Más ----------
  const fz = { tab: 'vender', mesa: null, caja: false, sub: '', edit: null, q: '' };
  function esMesero(){
    if(document.body.classList.contains('modo-mesero')) return true;
    try{ return !!usuario() && typeof authIsAdmin === 'function' && !authIsAdmin(); }catch(e){ return false; }
  }
  const facilActivo = () => { const d = D(); return !!(d && d.easyMode) && !!usuario() && !esMesero(); };
  function aplicarFacil(){
    const on = facilActivo();
    document.body.classList.toggle('facil-on', on);
    let app = $('facilApp');
    if(!on){ if(app) app.hidden = true; return; }
    if(!app) app = crearFacil();
    app.hidden = false;
    pintarFacil();
    // La primera vez (también para quien ya tenía el modo fácil de antes, que solo agrandaba la letra): cómo funciona y cómo salir.
    const d = D();
    if(d && !d.facilVisto){
      d.facilVisto = 1; try{ saveData(); }catch(e){}
      setTimeout(() => aviso('🧓 Modo fácil: vende en 🛒 Vender y mira el día en 📊 Hoy. Para volver a la app completa: ⋯ Más → Salir del modo fácil.', 9000), 600);
    }
  }
  function crearFacil(){
    const app = document.createElement('div');
    app.id = 'facilApp'; app.setAttribute('data-novocab', ''); app.hidden = true;
    app.innerHTML = '<div class="fz-top"><b class="fz-biz"></b><span class="fz-dia"></span></div><div class="fz-main" id="fzMain"></div>' +
      '<div class="fz-nav" role="tablist" aria-label="Modo fácil">' + [['vender', '🛒', 'Vender'], ['hoy', '📊', 'Hoy'], ['mas', '⋯', 'Más']]
        .map(b => '<button type="button" role="tab" data-fz="' + b[0] + '"><i>' + b[1] + '</i><span>' + b[2] + '</span></button>').join('') + '</div>';
    document.body.appendChild(app);
    app.querySelector('.fz-nav').addEventListener('click', e => {
      const b = e.target.closest('[data-fz]'); if(!b) return;
      if(b.dataset.fz === fz.tab && fz.tab === 'vender'){ fz.mesa = null; fz.caja = false; }   // tocar «Vender» otra vez vuelve a las mesas
      fz.tab = b.dataset.fz; fz.sub = ''; fz.edit = null;
      pintarFacil();
    });
    return app;
  }
  function pantalla(main, clave, fn){
    let el = main.firstElementChild;
    if(!el || el.dataset.pant !== clave){ main.innerHTML = ''; el = document.createElement('div'); el.dataset.pant = clave; main.appendChild(el); main.scrollTop = 0; }
    fn(el);
  }
  function pintarFacil(){
    const app = $('facilApp'), d = D(); if(!app || app.hidden || !d) return;
    app.querySelector('.fz-biz').textContent = d.businessName || 'Mi negocio';
    const dia = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
    app.querySelector('.fz-dia').textContent = dia.charAt(0).toUpperCase() + dia.slice(1);
    app.querySelectorAll('[data-fz]').forEach(b => { const on = b.dataset.fz === fz.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    const main = $('fzMain');
    if(fz.tab === 'hoy') return pantalla(main, 'hoy', pintarHoy);
    if(fz.tab === 'mas'){
      if(fz.sub === 'productos') return pantalla(main, 'prod:' + (fz.edit || ''), pintarProductosFacil);
      return pantalla(main, 'mas', pintarMas);
    }
    const m = modo();
    if(fz.mesa != null && !(d.tables && d.tables[fz.mesa])) fz.mesa = null;
    if(m === 'tienda') return pantalla(main, 'caja', el => montarCaja(el, caja, { variante: 'grande' }));
    if(fz.caja) return pantalla(main, 'caja-rapida', el => montarCaja(el, caja, { variante: 'grande', titulo: '🛍️ Venta rápida', atras: true }));
    if(fz.mesa != null) return pantalla(main, 'mesa:' + fz.mesa, el => montarCaja(el, mesaSrc(fz.mesa), { variante: 'grande', titulo: etiqueta(fz.mesa), atras: true, mic: true }));
    pantalla(main, 'mesas', pintarMesasFacil);
  }
  function pintarMesasFacil(el){
    const d = D(), ids = Object.keys(d.tables || {}).map(Number).sort((a, b) => a - b), [sg, pl] = unidad();
    const saldo = id => { try{ return tableBalance(id) || tableTotal(id); }catch(e){ return 0; } };
    el.innerHTML = '<h2 class="fz-h">¿' + (unidad()[0] === 'Mesa' ? 'Qué mesa' : 'Cuál') + '?</h2>' +
      (modo() === 'mixto' ? '<button type="button" class="fz-rapida" data-caja="1"><i>🛍️</i><b>Venta rápida</b><small>Sin ' + esc(sg.toLowerCase()) + '</small></button>' : '') +
      (ids.length ? '<div class="fz-mesas">' + ids.map(id => {
        const ab = (d.tables[id].items || []).length > 0;
        return '<button type="button" class="fz-mesa' + (ab ? ' ocupada' : '') + '" data-mesa="' + id + '"><b>' + esc(etiqueta(id)) + '</b><span>' + (ab ? plata(saldo(id)) : 'Libre') + '</span></button>';
      }).join('') + '</div>' : '<p class="fz-vacio">No tienes ' + esc(pl.toLowerCase()) + '. Créalas en la app completa (⋯ Más → Salir del modo fácil).</p>');
    el.onclick = e => {
      const b = e.target.closest('[data-mesa]'); if(b){ fz.mesa = Number(b.dataset.mesa); pintarFacil(); return; }
      if(e.target.closest('[data-caja]')){ fz.caja = true; pintarFacil(); }
    };
  }
  // HOY: números grandes y claros, nada de gráficas.
  function ventasDeHoy(){
    const d = D(), h0 = new Date(); h0.setHours(0, 0, 0, 0);
    const H = ((d && d.history) || []).filter(h => { const t = h.date ? Date.parse(h.date) : Number(h.t) || 0; return t >= h0.getTime(); });
    let total = 0, efectivo = 0, digital = 0, fiado = 0;
    H.forEach(h => {
      total += Number(h.total) || 0;
      (h.payments || []).forEach(p => { const a = Number(p.amount) || 0; if(p.method === 'efectivo') efectivo += a; else if(p.method === 'debe') fiado += a; else digital += a; });
    });
    return { ventas: H, total, efectivo, digital, fiado };
  }
  function pintarHoy(el){
    const r = ventasDeHoy();
    const hora = h => { const t = h.date ? new Date(h.date) : new Date(Number(h.t) || Date.now()); return t.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }); };
    const donde = h => h.tableName || (h.table != null ? etiqueta(h.table) : 'Venta');
    const como = h => { const p = (h.payments || [])[0]; return !p ? '' : p.method === 'efectivo' ? '💵' : p.method === 'debe' ? '📝' : '📲'; };
    el.innerHTML = '<div class="fz-hoy"><div class="fz-big"><span>Vendiste hoy</span><b class="fz-hoy-total">' + plata(r.total) + '</b><small>' + r.ventas.length + (r.ventas.length === 1 ? ' venta' : ' ventas') + '</small></div>' +
      '<div class="fz-par"><div><span>💵 Efectivo</span><b>' + plata(r.efectivo) + '</b></div><div><span>📲 Digital</span><b>' + plata(r.digital) + '</b><small>Nequi, DaviPlata, tarjeta</small></div></div>' +
      (r.fiado ? '<div class="fz-par fz-uno"><div class="fz-fiado"><span>📝 Quedaron debiendo</span><b>' + plata(r.fiado) + '</b></div></div>' : '') +
      '<h3 class="fz-h3">Últimas ventas</h3>' +
      (r.ventas.length ? '<ul class="fz-ult">' + r.ventas.slice(0, 5).map(h => '<li><span>' + esc(hora(h)) + ' · ' + esc(donde(h)) + '</span><b>' + como(h) + ' ' + plata(h.total) + '</b></li>').join('') + '</ul>'
        : '<p class="fz-vacio">Todavía no hay ventas hoy.</p>') + '</div>';
  }
  // MÁS: solo lo poco necesario.
  function pintarMas(el){
    el.innerHTML = '<div class="fz-lista">' +
      '<button type="button" class="fz-btn" data-ir="productos"><i>📦</i><span>Productos y precios<small>Agregar o cambiar un precio</small></span></button>' +
      '<button type="button" class="fz-btn" data-ir="libreta"><i>📒</i><span>Libreta<small>Quién debe y cuánto</small></span></button>' +
      (planVisible() ? '<button type="button" class="fz-btn" data-ir="plan"><i>💳</i><span>Mi plan<small>' + esc(planTexto()) + '</small></span></button>' : '') +
      '<button type="button" class="fz-btn" data-ir="ayuda"><i>💬</i><span>Ayuda por WhatsApp<small>Te ayudamos a usar Vento</small></span></button>' +
      '<button type="button" class="fz-btn fz-salir" data-ir="salir"><i>🚪</i><span>Salir del modo fácil<small>Volver a la app completa</small></span></button></div>';
    el.onclick = e => {
      const b = e.target.closest('[data-ir]'); if(!b) return;
      const k = b.dataset.ir;
      if(k === 'productos'){ fz.sub = 'productos'; fz.edit = null; fz.q = ''; pintarFacil(); }
      else if(k === 'libreta'){ if(typeof window.libretaAbrir === 'function') window.libretaAbrir(); else aviso('La libreta no está disponible.'); }
      else if(k === 'ayuda'){
        let n = '573000000000'; try{ if(typeof ventoWa === 'function') n = ventoWa(); }catch(x){}
        const d = D(), msg = 'Hola, necesito ayuda con Vento (modo fácil).' + (d && d.businessName ? ' Negocio: ' + d.businessName : '');
        window.open('https://wa.me/' + encodeURIComponent(n) + '?text=' + encodeURIComponent(msg), '_blank');
      }
      else if(k === 'plan'){ try{ const vs = window.ventoSuscripcion, st = vs.estado(); if(st.renovar && !st.pago) vs.abrirRenovar(); else vs.abrirPlanes(''); }catch(x){} }
      else if(k === 'salir') salirFacil();
    };
  }
  // «Mi plan» en Más (la barra de la suscripción queda tapada por la pantalla fácil): solo el dueño o el administrador en la nube.
  function planVisible(){ try{ const vs = window.ventoSuscripcion; return !!(vs && vs.enCuenta() && vs.verificado() && vs.estado().manda); }catch(e){ return false; } }
  function planTexto(){
    try{
      const s = window.ventoSuscripcion.estado();
      if(s.revision) return '⏳ Pago en revisión';
      if(s.rechazo) return '❌ Pago no aprobado: toca para ver';
      if(s.renovar) return '⏰ Vence pronto: toca para renovar';
      if(s.status === 'expired') return 'Venció: toca para renovar';
      return 'Plan ' + String(s.plan || 'free').toUpperCase() + (s.status === 'active' && s.dias != null ? ' · ' + s.dias + ' día' + (s.dias === 1 ? '' : 's') : '');
    }catch(e){ return 'Ver mi plan'; }
  }
  async function salirFacil(){
    const d = D(); if(!d) return;
    d.easyMode = false; fz.tab = 'vender'; fz.mesa = null; fz.caja = false; fz.sub = ''; fz.edit = null;
    llamar(window.applyEasyMode); aplicarFacil();
    try{ window.libretaFab && window.libretaFab(); }catch(e){}
    try{ const b = document.querySelector('nav button[data-view="mesas"]'); if(b) b.click(); }catch(e){}
    aviso('Volviste a la app completa. El modo fácil se prende en Ajustes → Apariencia.', 5000);
    await guardar();
  }
  // Productos en un formulario simple: nombre y precio. Un paso por pantalla.
  function pintarProductosFacil(el){
    if(el._hecho) return;   // ya está en pantalla: no se borra lo que están escribiendo
    el._hecho = true;
    const d = D();
    if(fz.edit){
      const p = fz.edit === 'nuevo' ? null : producto(fz.edit);
      if(fz.edit !== 'nuevo' && !p){ fz.edit = null; return pintarFacil(); }
      el.innerHTML = '<div class="fz-barra"><button type="button" class="fz-atras" data-volver="1">← Productos</button><b class="fz-titulo">' + (p ? 'Cambiar precio' : 'Producto nuevo') + '</b></div>' +
        '<form class="fz-form" autocomplete="off"><label>Nombre<input class="fz-in fz-nombre" maxlength="60" required value="' + esc(p ? p.name : '') + '" placeholder="Ej. Gaseosa"></label>' +
        '<label>Precio<input class="fz-in fz-precio" type="number" inputmode="numeric" min="0" step="50" required value="' + esc(p ? p.price : '') + '" placeholder="Ej. 3000"></label>' +
        '<button type="submit" class="fz-ok">💾 Guardar</button><button type="button" class="fz-cancel" data-volver="1">Cancelar</button></form>';
      const f = el.querySelector('form');
      setTimeout(() => { const i = el.querySelector(p ? '.fz-precio' : '.fz-nombre'); if(i) try{ i.focus(); i.select && i.select(); }catch(x){} }, 30);
      el.onclick = e => { if(e.target.closest('[data-volver]')){ fz.edit = null; pintarFacil(); } };
      f.onsubmit = e => {
        e.preventDefault();
        const nombre = f.querySelector('.fz-nombre').value.trim(), precio = Math.round(parseFloat(f.querySelector('.fz-precio').value));
        if(!nombre){ aviso('⚠️ Escribe el nombre.'); return; }
        if(!isFinite(precio) || precio < 0){ aviso('⚠️ Escribe el precio.'); return; }
        let q = p;
        if(!q){
          const dup = (d.products || []).find(x => { try{ return dupKey(x) === dupKey({ name: nombre, size: '' }); }catch(er){ return sinTilde(x.name) === sinTilde(nombre); } });
          if(dup){ fz.edit = dup.id; pintarFacil(); aviso('«' + dup.name + '» ya existe: aquí le cambias el precio.'); return; }
          q = { id: Date.now().toString(), name: nombre, price: precio, categoryId: null, size: '', specifications: '', stock: null, cost: null };
          d.products.push(q);
        } else {
          const antes = q.name; q.name = nombre; q.price = precio;
          try{ sincronizarProductoEnMesas(q, antes); }catch(er){}
        }
        guardar(); llamar(window.renderProductos); llamar(window.renderInventario);
        aviso('✅ ' + q.name + ': ' + plata(q.price));
        fz.edit = null; pintarFacil();
      };
      return;
    }
    el.innerHTML = '<div class="fz-barra"><button type="button" class="fz-atras" data-volver="1">← Más</button><b class="fz-titulo">📦 Productos</b></div>' +
      '<button type="button" class="fz-btn fz-nuevo" data-nuevo="1"><i>➕</i><span>Agregar producto</span></button>' +
      '<input type="search" class="fz-in fz-buscar" placeholder="🔍 Buscar" value="' + esc(fz.q) + '" aria-label="Buscar producto">' +
      '<div class="fz-prods"></div>';
    const lista = el.querySelector('.fz-prods');
    const pintarLista = () => {
      const R = productos(fz.q, '').slice(0, 200);
      lista.innerHTML = R.length ? R.map(p => '<button type="button" class="fz-prow" data-edit="' + esc(p.id) + '"><span>' + esc(p.name) + (p.size ? ' <small>' + esc(p.size) + '</small>' : '') + '</span><b>' + plata(p.price) + '</b></button>').join('')
        : '<p class="fz-vacio">' + ((d.products || []).length ? 'No encontré ese producto.' : 'Todavía no tienes productos.') + '</p>';
    };
    pintarLista();
    const bus = el.querySelector('.fz-buscar'); bus.oninput = () => { fz.q = bus.value; pintarLista(); };
    el.onclick = e => {
      if(e.target.closest('[data-volver]')){ fz.sub = ''; pintarFacil(); return; }
      if(e.target.closest('[data-nuevo]')){ fz.edit = 'nuevo'; pintarFacil(); return; }
      const r = e.target.closest('[data-edit]'); if(r){ fz.edit = r.dataset.edit; pintarFacil(); }
    };
  }
  // Voz: el mismo micrófono de la app. En la cuenta de una mesa basta decir «dos gaseosas».
  const hayVoz = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition || window.VentoAndroid) && !!$('voiceFab');
  function decirPedido(){ const b = $('voiceFab'); if(b) b.click(); }
  function sincMic(){
    let on = false; try{ on = typeof voiceListening !== 'undefined' && !!voiceListening; }catch(e){}
    document.querySelectorAll('.pz-mic').forEach(b => { b.classList.toggle('on', on); b.textContent = on ? '⏹ Escuchando… toca para terminar' : '🎤 Decir pedido'; });
  }

  // ---------- Repintar ----------
  let pend = false;
  function pintarTodo(){
    try{ pintarPos(); }catch(e){ console.error('vento-pos', e); }
    try{ pintarFacil(); }catch(e){ console.error('vento-facil', e); }
  }
  function programar(){ if(pend) return; pend = true; setTimeout(() => { pend = false; pintarTodo(); }, 0); }
  // Se engancha a funciones de index.html sin cambiarlas (como hace «Primeros pasos»).
  function envolver(nombre, despues, antes){
    const o = window[nombre]; if(typeof o !== 'function' || o.__ventoPos) return;
    const w = function(){ if(antes){ const r = antes.apply(this, arguments); if(r !== undefined) return r; } const r = o.apply(this, arguments); try{ despues && despues.apply(this, arguments); }catch(e){} return r; };
    w.__ventoPos = true;
    window[nombre] = w;
  }
  envolver('renderMesas', programar);
  envolver('renderProductos', programar);
  envolver('domisBadge', programar);          // pedidos a domicilio pendientes → el botón de la caja
  envolver('aplicarDomicilios', programar);
  envolver('aplicarModoMesero', aplicarFacil);
  envolver('updateVoiceFabUI', sincMic);
  // En tienda la pestaña principal se llama «Vender».
  envolver('aplicarVocabulario', () => { if(modo() !== 'tienda') return; const nb = document.querySelector('nav button[data-view="mesas"] .nav-lbl'); if(nb) nb.textContent = 'Vender'; });
  // Voz en la cuenta abierta del modo fácil: si no dicen la mesa, es esa.
  envolver('resolveVoiceTableId', null, function(parsed){
    const d = D();
    if(parsed && d && d.tables && d.tables[parsed]) return undefined;
    if(fz.mesa != null && facilActivo() && fz.tab === 'vender' && d && d.tables && d.tables[fz.mesa]) return fz.mesa;
    return undefined;
  });
  document.addEventListener('visibilitychange', () => { if(!document.hidden && facilActivo()) programar(); });
  // Al volver a la pestaña principal se repinta la caja (el carrito pudo cambiar en otra parte).
  document.addEventListener('click', e => { if(e.target && e.target.closest && e.target.closest('nav button[data-view="mesas"]')) programar(); }, true);

  // ---------- Estilos ----------
  const css = document.createElement('style');
  css.id = 'ventoPosCss';
  css.textContent =
    /* Tienda: sin mesas en la vista principal (salvo «Cuentas abiertas»). Mixto: caja arriba y mesas abajo. */
    'body.modo-tienda:not(.pz-ver-cuentas) #view-mesas > :not(#primerosPasos):not(#posPanel){display:none!important}' +
    '#posPanel{margin:0 0 16px}#posPanel[hidden]{display:none}' +
    '.pz-buscar{display:flex;gap:8px;margin-bottom:10px}.pz-buscar[hidden]{display:none}' +
    '.pz-q{flex:1;min-width:0;font:inherit;font-size:16px;padding:12px 14px;min-height:48px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}' +
    '.pz-q:focus{outline:2px solid var(--amber);outline-offset:1px}' +
    '.pz .pz-scan{flex:none;width:52px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:22px;cursor:pointer}' +
    '.pz-cats{display:flex;gap:6px;overflow-x:auto;padding:0 0 8px;margin-bottom:4px;scrollbar-width:none}.pz-cats::-webkit-scrollbar{display:none}' +
    '.pz .pz-cats button{flex:none;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink-soft);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;white-space:nowrap}' +
    '.pz-cats button.on{background:var(--amber);border-color:var(--amber);color:#fff}' +
    '.pz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}' +
    '.pz .pz-tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;min-height:116px;min-width:0;padding:10px 6px 8px;border-radius:16px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;cursor:pointer;text-align:center;-webkit-tap-highlight-color:transparent;touch-action:manipulation;user-select:none}' +
    '.pz-tile:active{transform:scale(.95)}.pz-tile:hover{border-color:var(--amber-deep)}' +
    '.pz-tile.en{border-color:var(--amber);background:color-mix(in srgb,var(--amber) 12%,var(--surface))}' +
    '.pz-cara{width:46px;height:46px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:12px;background:color-mix(in srgb,var(--amber) 10%,var(--surface-2,var(--surface)));overflow:hidden;font-size:28px;line-height:1}' +
    '.pz-cara img{width:100%;height:100%;object-fit:cover}.pz-letra{font-weight:900;font-size:22px;color:var(--cream)}' +
    '.pz-nom{font-size:13px;font-weight:700;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.pz-nom small{font-weight:500;color:var(--ink-soft)}' +
    '.pz-pre{font-size:14px;font-weight:900;color:var(--cream);margin-top:auto}' +
    '.pz-cant{position:absolute;top:5px;right:5px;min-width:24px;height:24px;padding:0 6px;border-radius:999px;background:var(--amber);color:#fff;font-size:13px;font-weight:900;display:flex;align-items:center;justify-content:center}' +
    '.pz-stock{position:absolute;top:5px;left:5px;font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:color-mix(in srgb,var(--brick) 22%,transparent);color:var(--brick)}' +
    '.pz-vacio{color:var(--ink-soft);font-size:14px;text-align:center;padding:12px 4px;grid-column:1/-1}.pz-mas{grid-column:1/-1;color:var(--ink-soft);font-size:12.5px;text-align:center;padding:4px}' +
    '.pz-cart{margin-top:12px;border:1px solid var(--line);border-radius:18px;background:var(--paper,var(--surface));padding:12px}' +
    '.pz-tienda .pz-cart{position:sticky;bottom:calc(84px + env(safe-area-inset-bottom));z-index:6;box-shadow:0 -10px 30px rgba(0,0,0,.28)}' +
    '@media (min-width:761px){.pz-tienda .pz-cart{bottom:12px}}' +
    '@media (max-width:760px){body.modo-tienda:has(#view-mesas.active):not(.pz-ver-cuentas) .voice-fab-wrap{bottom:calc(96px + var(--pz-cart-h,0px) + env(safe-area-inset-bottom))}}' +
    '.pz-cart-h{display:flex;align-items:center;gap:8px;margin-bottom:4px}.pz-cart-h b{font-size:15px}.pz-n{flex:1;color:var(--ink-soft);font-size:13px}' +
    '.pz-vaciar{border:0;background:transparent;color:var(--ink-soft);font:inherit;font-size:13px;text-decoration:underline;cursor:pointer;padding:6px}' +
    '.pz-lineas{max-height:26vh;overflow:auto;overscroll-behavior:contain}' +
    '.pz-linea{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed var(--line)}.pz-linea:last-child{border-bottom:0}' +
    '.pz-ln{flex:1;min-width:0}.pz-ln b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pz-ln small{color:var(--ink-soft);font-size:12px}' +
    '.pz-step{display:flex;align-items:center;gap:4px;flex:none}' +
    '.pz .pz-step button{width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:22px;font-weight:900;line-height:1;cursor:pointer;touch-action:manipulation}' +
    '.pz-step span{min-width:24px;text-align:center;font-weight:900;font-size:15px}' +
    '.pz-sub{flex:none;font-weight:900;font-size:14px;min-width:70px;text-align:right}' +
    '.pz-x{flex:none;border:0;background:transparent;color:var(--ink-soft);font-size:16px;cursor:pointer;padding:8px 4px}' +
    '.pz-pie{display:flex;align-items:center;gap:10px;margin-top:8px}' +
    '.pz-total{flex:1;min-width:0}.pz-total span{display:block;font-size:11.5px;letter-spacing:.08em;color:var(--ink-soft);font-weight:800}' +
    '.pz-total b{display:block;font-size:clamp(22px,7vw,30px);font-weight:900;line-height:1.05;white-space:nowrap}' +
    '.pz .pz-cobrar{flex:none;min-width:148px;min-height:58px;padding:0 18px;border:0;border-radius:16px;background:#15803d;color:#fff;font:inherit;font-size:19px;font-weight:900;letter-spacing:.02em;cursor:pointer;box-shadow:0 6px 18px rgba(21,128,61,.35)}' +
    '.pz-cobrar:hover{background:#166534}.pz-cobrar:disabled{opacity:.35;box-shadow:none;cursor:not-allowed}' +
    '.pz-cuentas{margin-top:10px;display:grid;gap:8px}.pz-cuentas:empty{display:none}.pz-cuentas-btn{width:100%;padding:12px;font-size:14px}' +
    '@media (min-width:900px){.pz-tienda{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}' +
      '.pz-tienda .pz-cart{position:sticky;top:12px;bottom:auto;margin-top:0;box-shadow:none}.pz-tienda .pz-lineas{max-height:52vh}.pz-tienda .pz-grid{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}}' +
    /* Mixto: una fila de productos que se desliza y el carrito debajo */
    '.pz-mixto .pz-grid{display:flex;overflow-x:auto;gap:8px;padding-bottom:6px;scroll-snap-type:x proximity}' +
    '.pz-mixto.pz .pz-tile{flex:0 0 100px;min-height:100px;scroll-snap-align:start}.pz-mixto .pz-cara{width:36px;height:36px;font-size:22px}' +
    '.pz-mixto .pz-cart{margin-top:8px}.pz-mixto .pz-cart.vacio .pz-lineas{display:none}.pz-mixto .pz-cart.vacio .pz-total b{font-size:22px}' +
    '@media (min-width:900px){.pz-mixto{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:14px;align-items:start}.pz-mixto .pz-cart{margin-top:0}}' +
    /* Ajustes → Modo de trabajo */
    '.pz-modo-row{flex-direction:column;align-items:stretch!important;gap:8px}' +
    '.pz-modos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}' +
    '.pz-modos .pz-modo{display:flex;flex-direction:column;align-items:center;gap:3px;padding:12px 6px;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;cursor:pointer;text-align:center;min-width:0}' +
    '.pz-modo i{font-style:normal;font-size:26px}.pz-modo b{font-size:13.5px;overflow-wrap:anywhere}.pz-modo small{font-size:11.5px;color:var(--ink-soft);line-height:1.25}' +
    '.pz-modo.on{border-color:var(--amber);background:color-mix(in srgb,var(--amber) 16%,var(--surface));box-shadow:0 0 0 2px color-mix(in srgb,var(--amber) 45%,transparent)}' +
    /* Cobrar: cómo pagó */
    '.pz-pago-ov{z-index:9000}.pz-pago{max-width:440px;text-align:center}' +
    '.pz-pago-tot span{display:block;font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);font-weight:800}.pz-pago-tot b{display:block;font-size:42px;font-weight:900;line-height:1.1}' +
    '.pz-pago-q{font-size:16px;font-weight:800;margin:10px 0 2px}' +
    '.pz-metodos{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}' +
    '.pz-pago .pz-met{min-height:76px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border-radius:18px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:17px;font-weight:900;cursor:pointer}' +
    '.pz-met i{font-style:normal;font-size:28px;line-height:1}.pz-met:hover,.pz-met:focus-visible{border-color:var(--amber)}' +
    '.pz-met[data-m="efectivo"]{border-color:#15803d;background:color-mix(in srgb,#15803d 16%,var(--surface))}' +
    '.pz-vu-box{margin:4px 0 10px;text-align:left}.pz-vu-box summary{cursor:pointer;font-size:14px;color:var(--ink-soft);padding:6px 0}' +
    '.pz-billetes{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.pz-pago .pz-billetes button{flex:1 1 auto;min-height:44px;padding:0 10px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-weight:800;cursor:pointer}' +
    '.pz-pago .pz-billetes button.on{border-color:#15803d;background:color-mix(in srgb,#15803d 14%,var(--surface))}.pz-pagacon{width:100%;box-sizing:border-box}.pz-vu{text-align:center;font-size:22px;font-weight:900;color:#16a34a;min-height:28px;margin-top:6px}.pz-vu.falta{color:var(--brick)}' +
    '.pz-fiado{width:100%;padding:12px;font-size:14px}.pz-fiado-box{display:flex;flex-direction:column;gap:8px;margin-top:8px}.pz-fiado-box[hidden]{display:none}.pz-fiado-box input{width:100%;box-sizing:border-box}' +
    '.pz-pago .pz-cancel{width:100%;margin-top:10px}' +
    '.pz-pago-grande .pz-pago .pz-met{min-height:100px;font-size:21px}.pz-pago-grande .pz-met i{font-size:36px}.pz-pago-grande .pz-pago-tot b{font-size:52px}.pz-pago-grande .pz-cancel{min-height:56px;font-size:18px}' +
    /* Deshacer */
    '#pzDeshacer{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(24px + env(safe-area-inset-bottom));z-index:10040;width:min(560px,calc(100vw - 24px));display:flex;align-items:center;gap:10px;padding:10px 10px 10px 16px;border-radius:18px;background:#111827;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.45);overflow:hidden;font-weight:800;font-size:16px}' +
    '#pzDeshacer[hidden]{display:none}.pz-dmsg{flex:1;min-width:0}' +
    '#pzDeshacer .pz-dbtn{flex:none;min-height:52px;padding:0 18px;border-radius:14px;border:0;background:#fbbf24;color:#111827;font:inherit;font-size:17px;font-weight:900;cursor:pointer}' +
    '.pz-dbar{position:absolute;left:0;bottom:0;height:4px;width:100%;background:#fbbf24;transform-origin:left;animation:pzBarra 5s linear forwards}@keyframes pzBarra{to{transform:scaleX(0)}}' +
    /* En el celular y en el modo fácil va arriba: así no tapa el TOTAL ni COBRAR de la siguiente venta. */
    '@media (max-width:760px){#pzDeshacer{top:calc(10px + env(safe-area-inset-top));bottom:auto}}' +
    'body.facil-on #pzDeshacer{top:calc(8px + env(safe-area-inset-top));bottom:auto;font-size:18px}body.facil-on #pzDeshacer .pz-dbtn{min-height:60px;font-size:20px}' +
    /* ---------- Modo fácil ---------- */
    'body.facil-on{overflow:hidden}' +
    'body.facil-on .tabbar,body.facil-on .voice-fab-wrap,body.facil-on .voice-fab-tab,body.facil-on #libretaFab,body.facil-on .vito-campana,body.facil-on #mesoraFixPill{display:none!important}' +
    '#facilApp{position:fixed;inset:0;z-index:44;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);font-family:var(--font-main)}#facilApp[hidden]{display:none}' +
    '.fz-top{display:flex;align-items:baseline;gap:10px;padding:calc(12px + env(safe-area-inset-top)) 16px 10px;border-bottom:1px solid var(--line);background:var(--surface)}' +
    '.fz-top b{flex:1;min-width:0;font-size:21px;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fz-dia{font-size:14px;color:var(--ink-soft);white-space:nowrap}' +
    '.fz-main{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:14px 16px 18px}.fz-main > div{max-width:1180px;margin:0 auto}' +
    '.fz-nav{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px 12px calc(8px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--surface)}' +
    '#facilApp .fz-nav button{min-height:66px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border:2px solid transparent;border-radius:18px;background:transparent;color:var(--ink-soft);font:inherit;font-size:18px;font-weight:900;cursor:pointer}' +
    '#facilApp .fz-nav button i{font-style:normal;font-size:26px;line-height:1}#facilApp .fz-nav button.on{background:color-mix(in srgb,var(--amber) 22%,transparent);border-color:var(--amber);color:var(--ink)}' +
    '.fz-h{font-size:26px;font-weight:900;margin:2px 0 14px}.fz-h3{font-size:20px;font-weight:900;margin:22px 0 6px}' +
    '.fz-vacio{font-size:18px;color:var(--ink-soft);text-align:center;padding:18px 6px}' +
    '.fz-mesas{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}' +
    '#facilApp .fz-mesa{min-height:112px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:10px;border-radius:22px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;cursor:pointer;min-width:0}' +
    '.fz-mesa b{font-size:23px;font-weight:900;overflow-wrap:anywhere}.fz-mesa span{font-size:17px;font-weight:800;color:var(--ink-soft)}' +
    '.fz-mesa.ocupada{border-color:var(--amber);background:color-mix(in srgb,var(--amber) 18%,var(--surface))}.fz-mesa.ocupada span{color:var(--ink);font-size:21px;font-weight:900}' +
    '#facilApp .fz-rapida{width:100%;min-height:76px;display:flex;align-items:center;gap:12px;margin:0 0 14px;padding:10px 18px;border-radius:22px;border:2px dashed var(--amber);background:transparent;color:var(--ink);font:inherit;cursor:pointer;text-align:left}' +
    '.fz-rapida i{font-style:normal;font-size:30px}.fz-rapida b{font-size:21px;font-weight:900}.fz-rapida small{margin-left:auto;font-size:15px;color:var(--ink-soft)}' +
    '.fz-barra{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}' +
    '#facilApp .fz-atras{min-height:56px;padding:0 18px;border-radius:16px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:18px;font-weight:900;cursor:pointer}' +
    '.fz-titulo{flex:1 1 40%;min-width:110px;font-size:25px;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '@media (max-width:620px){.fz-barra .pz-mic{flex:1 1 100%}}' +
    '#facilApp .pz-mic{min-height:56px;padding:0 16px;border-radius:16px;border:2px solid var(--amber);background:transparent;color:var(--ink);font:inherit;font-size:17px;font-weight:900;cursor:pointer}.pz-mic.on{background:#dc2626;border-color:#dc2626;color:#fff}' +
    /* La caja grande del modo fácil */
    '.pz-grande .pz-q{font-size:19px;min-height:56px;padding:12px 16px}' +
    '.pz-grande .pz-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}' +
    '.pz-grande.pz .pz-tile{min-height:146px;border-width:2px;border-radius:22px;padding:12px 8px 10px;gap:6px}' +
    '.pz-grande .pz-cara{width:66px;height:66px;font-size:42px;border-radius:18px}.pz-grande .pz-letra{font-size:32px}' +
    '.pz-grande .pz-nom{font-size:18px;font-weight:800}.pz-grande .pz-pre{font-size:19px}' +
    '.pz-grande .pz-cant{min-width:36px;height:36px;font-size:19px;top:7px;right:7px}.pz-grande .pz-stock{font-size:12px}' +
    '.pz-grande .pz-cart{position:sticky;bottom:0;margin-top:14px;border-width:2px;border-radius:22px;box-shadow:0 -12px 30px rgba(0,0,0,.3);z-index:3}' +
    '.pz-grande .pz-cart-h b{font-size:18px}.pz-grande .pz-n{font-size:15px}' +
    // Celulares bajitos: lo pedido no puede tapar los productos (se desplaza solo y vacío no ocupa espacio).
    '.pz-grande .pz-lineas{max-height:30vh;overflow:auto;overscroll-behavior:contain}' +
    '@media (max-height:760px){.pz-grande .pz-lineas{max-height:20vh}.pz-grande .pz-cart.vacio .pz-lineas{display:none}.pz-grande .pz-cart{padding:10px 12px}}' +
    '.pz-grande .pz-lineas{max-height:20vh}.pz-grande .pz-linea{padding:8px 0}' +
    '.pz-grande .pz-ln b{font-size:19px;white-space:normal}.pz-grande .pz-ln small{font-size:16px;font-weight:700}' +
    '.pz-grande.pz .pz-step button{width:58px;height:58px;font-size:34px;border-radius:16px;border-width:2px}' +
    '.pz-grande .pz-total{flex:0 1 auto}.pz-grande .pz-total span{font-size:14px}.pz-grande .pz-total b{font-size:clamp(28px,9vw,40px)}' +
    '.pz-grande.pz .pz-cobrar{flex:1 1 auto;min-width:0;min-height:72px;padding:0 12px;font-size:clamp(19px,5.6vw,24px);border-radius:20px;white-space:nowrap}' +
    '@media (min-width:900px){.pz-grande{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:18px;align-items:start}.pz-grande .pz-cart{position:sticky;top:0;bottom:auto;margin:0;box-shadow:none}.pz-grande .pz-lineas{max-height:48vh}}' +
    /* Hoy */
    '.fz-big{text-align:center;padding:24px 12px;border-radius:26px;border:2px solid color-mix(in srgb,var(--amber) 50%,var(--line));background:color-mix(in srgb,var(--amber) 12%,var(--surface))}' +
    '.fz-big span{display:block;font-size:19px;font-weight:800;color:var(--ink-soft)}.fz-big b{display:block;font-size:clamp(40px,12vw,64px);font-weight:900;line-height:1.1;margin:6px 0;overflow-wrap:anywhere}.fz-big small{font-size:21px;font-weight:900}' +
    '.fz-par{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.fz-par.fz-uno{grid-template-columns:1fr}' +
    '.fz-par > div{padding:16px 10px;border-radius:22px;border:2px solid var(--line);background:var(--surface);text-align:center;min-width:0}' +
    '.fz-par small{display:block;font-size:13px;color:var(--ink-soft);margin-top:2px}.fz-par span{display:block;font-size:16px;font-weight:800;color:var(--ink-soft)}.fz-par b{display:block;font-size:clamp(22px,7vw,32px);font-weight:900;margin-top:4px;overflow-wrap:anywhere}.fz-fiado{border-color:var(--brick)!important}' +
    '.fz-ult{list-style:none;margin:0;padding:0}.fz-ult li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 4px;border-bottom:1px solid var(--line);font-size:18px}.fz-ult li span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fz-ult li b{flex:none;font-size:19px}' +
    /* Más */
    '.fz-lista{display:grid;gap:12px;max-width:640px;margin:0 auto}' +
    '#facilApp .fz-btn{display:flex;align-items:center;gap:16px;width:100%;min-height:78px;padding:12px 18px;border-radius:22px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:21px;font-weight:900;text-align:left;cursor:pointer}' +
    '.fz-btn i{font-style:normal;font-size:32px;line-height:1}.fz-btn small{display:block;font-size:15px;font-weight:600;color:var(--ink-soft);margin-top:2px}' +
    '.fz-salir{border-color:var(--brick);color:var(--brick)}.fz-nuevo{border-color:var(--amber);margin-bottom:12px}' +
    '.fz-in{width:100%;box-sizing:border-box;min-height:58px;padding:12px 16px;border-radius:16px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:20px}' +
    '.fz-buscar{margin-bottom:10px}.fz-prods{display:grid;gap:8px}' +
    '#facilApp .fz-prow{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:62px;padding:10px 16px;border-radius:16px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:19px;font-weight:800;text-align:left;cursor:pointer}' +
    '.fz-prow span{min-width:0;overflow-wrap:anywhere}.fz-prow small{font-weight:500;color:var(--ink-soft)}.fz-prow b{flex:none;font-size:20px}' +
    '.fz-form{display:grid;gap:14px;max-width:560px}.fz-form label{display:grid;gap:6px;font-size:18px;font-weight:800}' +
    '#facilApp .fz-ok{min-height:68px;border:0;border-radius:20px;background:#15803d;color:#fff;font:inherit;font-size:22px;font-weight:900;cursor:pointer}' +
    '#facilApp .fz-cancel{min-height:58px;border-radius:18px;border:2px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-size:18px;font-weight:800;cursor:pointer}' +
    '@media (min-width:900px){.fz-par{grid-template-columns:repeat(2,minmax(0,1fr))}.fz-hoy{max-width:820px;margin:0 auto}}';
  document.head.appendChild(css);

  // ---------- API ----------
  // ---------- Voz en la caja: «dos águilas» sin decir mesa va a la venta de la caja ----------
  // cuando = 'antes' (tienda: siempre a la caja) | 'sin_mesa' (mixto: solo si la voz no encontró una mesa).
  function vozCaja(items, mode, cuando){
    const m = modo();
    if(cuando === 'antes' ? m !== 'tienda' : m !== 'mixto') return false;
    if(facilActivo() && fz.mesa != null) return false;   // en una mesa del modo fácil la voz va a esa mesa
    if(bloqueado()) return true;
    const added = [], notFound = [], c = cart();
    (items || []).forEach(it => {
      let p = null; try{ p = typeof matchProductVoice === 'function' ? matchProductVoice(it.productText) : null; }catch(e){}
      if(!p){ notFound.push(it.productText); return; }
      const q = Math.max(0, Math.round(Number(it.qty) || 1)), line = c.find(x => x.id === p.id);
      if(mode === 'subtract'){
        if(!line){ notFound.push(it.productText); return; }
        line.qty -= q; if(line.qty <= 0) c.splice(c.indexOf(line), 1);
        added.push({ name: p.name, qty: Math.max(0, line.qty) });
      } else if(mode === 'set'){
        if(!q){ if(line) c.splice(c.indexOf(line), 1); } else if(line) line.qty = q; else c.push({ id: p.id, name: p.name, price: Number(p.price) || 0, qty: q });
        added.push({ name: p.name, qty: q });
      } else {
        if(!q) return;
        if(line) line.qty += q; else c.push({ id: p.id, name: p.name, price: Number(p.price) || 0, qty: q });
        added.push({ name: p.name, qty: q });
      }
    });
    if(added.length){ guardarCarrito(); son(mode === 'add' || !mode ? 'add' : 'remove'); pintarTodo(); }   // UN solo sonido por comando
    const decir = t => { try{ typeof speakVoice === 'function' && speakVoice(t); }catch(e){} };
    if(added.length){
      const r = added.map(a => (mode === 'subtract' ? a.name + (a.qty ? ' queda en ' + a.qty : ' (quitado)') : (a.qty > 1 ? a.qty + ' ' : '') + a.name)).join(', ');
      const t = mode === 'subtract' || mode === 'set' ? r + ' en la venta.' : r + ' agregado a la venta.';
      aviso((mode === 'subtract' ? '➖ ' : '✅ ') + t); decir(t);
    }
    if(notFound.length){ aviso('No encontré: ' + notFound.join(', ') + '.'); if(!added.length) decir('No encontré ese producto. Intenta de nuevo.'); }
    return true;
  }

  window.ventoPOS = {
    modo, modoPorTipo, ponerModo, pintar: pintarPos, puedeVender,
    vozCaja,
    carrito: () => caja.lineas(),
    agregar(id, n){ const p = producto(id); if(!p) return false; let ok = true; const f = () => { for(let i = 0; i < (n || 1) && ok; i++) ok = caja.add(p); }; if(window.ventoSonidos && n > 1) window.ventoSonidos.lote(f); else f(); pintarTodo(); return ok; },
    vaciar(){ carrito = []; guardarCarrito(); pintarTodo(); },
    cobrar: o => cobrarCaja(o),
    enfocar(){ const q = document.querySelector('#posPanel .pz-q'); if(q){ q.scrollIntoView({ block: 'center', behavior: 'smooth' }); try{ q.focus({ preventScroll: true }); }catch(e){} } }
  };
  window.ventoFacil = { aplicar: aplicarFacil, pintar: pintarFacil, activo: facilActivo, salir: salirFacil, estado: () => Object.assign({}, fz), hoy: ventasDeHoy };

  // Si los datos ya estaban cargados cuando llegó este archivo, se aplica de una vez.
  try{ if(D()){ pintarPos(); aplicarFacil(); llamar(window.aplicarVocabulario); } }catch(e){}
})();
