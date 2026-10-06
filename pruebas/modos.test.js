// Modos de trabajo (lib/vento-pos.js): restaurante = como siempre; tienda = caja (POS) sin mesas; mixto = caja arriba y mesas abajo.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = (process.env.VENTO_BASE || 'http://localhost:8765') + '/index.html';
(async()=>{ const b=await chromium.launch(); let ok=0,mal=0; const chk=(n,c,x)=>{ if(c){ok++;console.log('✅ '+n);} else {mal++;console.log('❌ '+n+(x?' → '+x:''));} };
 const nuevo=async(vp)=>{ const ctx=await b.newContext({viewport:vp||{width:390,height:844}});
  await ctx.route('**/*', r=>{const u=new URL(r.request().url()); return u.hostname==='localhost'?r.continue():r.abort();});
  await ctx.addInitScript(()=>{ try{ localStorage.setItem('vento-hola','0'); }catch(e){} });
  const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message)); return p; };
 const visible=(p,sel)=>p.evaluate(s=>{ const e=document.querySelector(s); return !!e && e.checkVisibility(); }, sel);
 const S=p=>p.evaluate(()=>window.ventoSonidos?ventoSonidos._historial.map(x=>x.tipo):[]);
 const pausa=()=>new Promise(r=>setTimeout(r,170));   // más que los 120 ms en que se juntan sonidos iguales
 const stock=(p,id)=>p.evaluate(id=>{ const x=data.products.find(y=>y.id===id); return x?x.stock:undefined; }, id);
 const linea=(p,id)=>p.evaluate(id=>{ const x=ventoPOS.carrito().find(y=>y.id===id); return x?x.qty:0; }, id);

 let p=await nuevo();
 await p.goto(BASE,{waitUntil:'load'}); await p.waitForTimeout(3000);
 await p.evaluate(async()=>{ await enterApp('test',null); localStorage.setItem('cm-tutorial-seen','1'); localStorage.setItem('vento-pp-oculta','1');
   document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); window.speakVoice=()=>{};
   data.products=[{id:'ag',name:'Águila',price:4000,stock:20,favorite:true},{id:'em',name:'Empanada',price:2500,stock:10},{id:'ga',name:'Gaseosa',price:3000},{id:'pa',name:'Papas',price:2000,stock:5}];
   data.tables={}; for(let k=1;k<=4;k++) data.tables[k]={items:[],people:[],payments:[]};
   data.tableCount=4; data.tipsOn=false; data.loyaltyOn=false; data.history=[]; delete data.modoOperacion; await saveData(); renderAll(); });
 await p.waitForTimeout(500);

 // ---------- 1. Restaurante (sin valor): exactamente como antes ----------
 let r=await p.evaluate(()=>({modo:ventoPOS.modo(), pos:document.getElementById('posPanel').hidden, html:document.getElementById('posPanel').innerHTML, cls:document.body.className, nav:document.querySelector('nav button[data-view="mesas"] .nav-lbl').textContent}));
 chk('Restaurante por defecto: modo «restaurante», sin caja (panel vacío y oculto)', r.modo==='restaurante' && r.pos===true && r.html==='' && !/modo-tienda|modo-mixto/.test(r.cls), JSON.stringify(r));
 chk('Restaurante: se ven las mesas y sus botones (Venta rápida incluida)', await visible(p,'#tableGrid') && await visible(p,'#quickSaleBtn') && await visible(p,'#mesasSummary') && (await p.$$('#tableGrid .ticket')).length===4);
 chk('Restaurante: la pestaña principal conserva su nombre', r.nav!=='Vender', r.nav);
 // Venta en mesa: el inventario se descuenta al agregar y NO otra vez al cobrar (igual que antes)
 await p.evaluate(()=>openTableModal(1)); await p.waitForTimeout(300);
 await p.click('#favChips .fav-chip'); await pausa(); await p.click('#favChips .fav-chip'); await pausa();
 chk('Mesa: agregar 2 Águilas descuenta el inventario al agregar (20 → 18)', (await stock(p,'ag'))===18, String(await stock(p,'ag')));
 await p.click('#chargeBtn'); await p.waitForTimeout(300);
 await p.click('button[data-m="efectivo"]'); await p.waitForTimeout(400);
 r=await p.evaluate(()=>({h:data.history.length, tot:data.history[0]&&data.history[0].total, mesa:data.history[0]&&data.history[0].table, libre:!data.tables[1].items.length}));
 chk('Mesa cobrada: venta en el historial y la mesa queda libre', r.h===1 && r.tot===8000 && r.mesa===1 && r.libre, JSON.stringify(r));
 chk('Mesa cobrada: el inventario NO se descuenta otra vez (sigue en 18)', (await stock(p,'ag'))===18, String(await stock(p,'ag')));

 // ---------- 2. Tienda: se elige en Ajustes → Negocio → Modo de trabajo ----------
 r=await p.evaluate(()=>{ const b=document.querySelectorAll('#modoTrabajoBox [data-modo]'); return [...b].map(x=>x.dataset.modo+':'+x.getAttribute('aria-checked')).join(','); });
 chk('Ajustes → Negocio muestra «Modo de trabajo» con las 3 opciones (restaurante marcado)', r==='restaurante:true,tienda:false,mixto:false', r);
 await p.evaluate(()=>document.querySelector('#modoTrabajoBox [data-modo="tienda"]').click()); await p.waitForTimeout(400);
 r=await p.evaluate(()=>({m:data.modoOperacion, tiles:document.querySelectorAll('#posPanel .pz-tile').length, nav:document.querySelector('nav button[data-view="mesas"] .nav-lbl').textContent}));
 chk('Tienda: el modo queda guardado en los datos', r.m==='tienda', JSON.stringify(r));
 chk('Tienda: se ve la caja (buscador, productos, COBRAR) y la pestaña se llama «Vender»', await visible(p,'#posPanel .pz-q') && r.tiles===4 && await visible(p,'#posPanel .pz-cobrar') && r.nav==='Vender', JSON.stringify(r));
 chk('Tienda: NO se ven las mesas ni sus botones', !(await visible(p,'#tableGrid')) && !(await visible(p,'#mesasSummary')) && !(await visible(p,'#quickSaleBtn')) && !(await visible(p,'#tableGrid .ticket')));
 r=await p.evaluate(()=>[...document.querySelectorAll('#posPanel .pz-tile')].map(t=>t.dataset.add).join(','));
 chk('Tienda: favoritos y más vendidos primero', r.startsWith('ag,'), r);
 // Carrito: 3 productos (uno 2 veces), +, − y total
 let s0=(await S(p)).length;
 await p.click('#posPanel .pz-tile[data-add="ag"]'); await pausa();
 await p.click('#posPanel .pz-tile[data-add="ag"]'); await pausa();
 await p.click('#posPanel .pz-tile[data-add="em"]'); await pausa();
 await p.click('#posPanel .pz-tile[data-add="ga"]'); await pausa();
 r=await p.evaluate(()=>ventoPOS.carrito().map(x=>x.id+'×'+x.qty).join(','));
 chk('Carrito: Águila ×2, Empanada ×1, Gaseosa ×1', r==='ag×2,em×1,ga×1', r);
 chk('Agregar al carrito NO toca el inventario todavía', (await stock(p,'ag'))===18 && (await stock(p,'em'))===10);
 await p.click('#posPanel .pz-linea [data-mas="ga"]'); await pausa();
 chk('+ en la línea suma 1 (Gaseosa ×2)', (await linea(p,'ga'))===2);
 await p.click('#posPanel .pz-linea [data-menos="ga"]'); await pausa();
 chk('− en la línea resta 1 (Gaseosa ×1)', (await linea(p,'ga'))===1);
 await p.click('#posPanel .pz-tile[data-add="pa"]'); await pausa();
 await p.click('#posPanel .pz-linea [data-quitar="pa"]'); await pausa();
 chk('✕ quita la línea completa', (await linea(p,'pa'))===0);
 let son=(await S(p)).slice(s0);
 chk('Sonidos: «add» al tocar y al +, «remove» al − y al ✕', JSON.stringify(son)==='["add","add","add","add","add","remove","add","remove"]', JSON.stringify(son));
 r=await p.evaluate(()=>document.querySelector('#posPanel .pz-total b').textContent);
 chk('TOTAL correcto: $13.500', r==='$13.500', r);
 // Carrito persistente (por equipo): sobrevive a recargar
 await p.reload(); await p.waitForTimeout(3000);
 if(await p.evaluate(()=>!document.getElementById('authOverlay').hidden)) await p.evaluate(async()=>{ await enterApp('test',null); });
 await p.evaluate(()=>{ window.speakVoice=()=>{}; document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); }); await p.waitForTimeout(400);
 r=await p.evaluate(()=>({m:data.modoOperacion, c:ventoPOS.carrito().map(x=>x.id+'×'+x.qty).join(','), pos:!document.getElementById('posPanel').hidden}));
 chk('Después de recargar: sigue en tienda, con la caja y el mismo carrito', r.m==='tienda' && r.pos && r.c==='ag×2,em×1,ga×1', JSON.stringify(r));
 // COBRAR → ¿cómo pagó? → efectivo
 const log0=await p.evaluate(()=>(data.stockLog||[]).length);
 s0=(await S(p)).length;
 await p.click('#posPanel .pz-cobrar'); await p.waitForTimeout(250);
 r=await p.evaluate(()=>[...document.querySelectorAll('.pz-pago .pz-met')].map(b=>b.textContent.trim()).join('|'));
 chk('COBRAR abre «¿Cómo pagó?»: Efectivo, Nequi, DaviPlata, Tarjeta (y fiado)', r==='💵Efectivo|💜Nequi|🔴DaviPlata|💳Tarjeta' && await visible(p,'.pz-pago .pz-fiado'), r);
 await p.click('.pz-pago .pz-met[data-m="efectivo"]'); await p.waitForTimeout(400);
 r=await p.evaluate(()=>{ const h=data.history[0]; return {n:data.history.length, tot:h.total, mesa:h.table, met:h.payments[0].method, items:h.items.map(i=>i.name+'×'+i.qty+'@'+i.price).join(','), debe:h.debt}; });
 chk('Venta registrada en el historial con los ítems y el total', r.n===2 && r.tot===13500 && r.mesa===null && r.met==='efectivo' && r.debe===0 && r.items==='Águila×2@4000,Empanada×1@2500,Gaseosa×1@3000', JSON.stringify(r));
 r={ag:await stock(p,'ag'), em:await stock(p,'em'), ga:await stock(p,'ga'), log:(await p.evaluate(()=>(data.stockLog||[]).length))-log0};
 chk('Inventario descontado exactamente UNA vez (Águila 18 → 16, Empanada 10 → 9, Gaseosa sin control)', r.ag===16 && r.em===9 && (r.ga==null) && r.log===3, JSON.stringify(r));
 son=(await S(p)).slice(s0);
 chk('Cobrar suena «success» y el carrito queda vacío', JSON.stringify(son)==='["success"]' && (await p.evaluate(()=>ventoPOS.carrito().length))===0, JSON.stringify(son));
 chk('Sale «↩ Deshacer» (sin ventana de confirmación antes)', await visible(p,'#pzDeshacer .pz-dbtn'));
 await p.click('#pzDeshacer .pz-dbtn'); await p.waitForTimeout(300);
 r=await p.evaluate(()=>({n:data.history.length, c:ventoPOS.carrito().map(x=>x.id+'×'+x.qty).join(','), ag:data.products.find(x=>x.id==='ag').stock, em:data.products.find(x=>x.id==='em').stock}));
 chk('Deshacer: la venta sale del historial, el inventario vuelve y el carrito también', r.n===1 && r.c==='ag×2,em×1,ga×1' && r.ag===18 && r.em===10, JSON.stringify(r));
 await p.click('#posPanel .pz-cobrar'); await p.waitForTimeout(250);
 await p.click('.pz-pago .pz-met[data-m="nequi"]'); await p.waitForTimeout(400);
 r=await p.evaluate(()=>{ const h=data.history[0]; return {n:data.history.length, tot:h.total, met:h.payments[0].method, nota:h.payments[0].note, ag:data.products.find(x=>x.id==='ag').stock}; });
 chk('Cobrar con Nequi: queda como pago digital (transferencia · Nequi) y descuenta una vez', r.n===2 && r.tot===13500 && r.met==='transferencia' && r.nota==='Nequi' && r.ag===16, JSON.stringify(r));
 chk('La venta se ve en Estadísticas/Historial como cualquier venta (no se duplica al repintar)', (await p.evaluate(()=>{ renderMesas(); renderProductos(); return data.history.length; }))===2 && (await stock(p,'ag'))===16);
 // Doble toque: en COBRAR abre UNA sola ventana; en «Efectivo» registra UNA venta y no se cuela un producto en la siguiente
 await p.click('#posPanel .pz-tile[data-add="ga"]'); await pausa();
 let hN=await p.evaluate(()=>data.history.length);
 await p.dblclick('#posPanel .pz-cobrar'); await p.waitForTimeout(300);
 chk('Doble toque en COBRAR: una sola ventana «¿Cómo pagó?» y sigue abierta', (await p.$$('.pz-pago-ov')).length===1 && await visible(p,'.pz-pago .pz-met'));
 await p.dblclick('.pz-pago .pz-met[data-m="efectivo"]'); await p.waitForTimeout(400);
 r=await p.evaluate(()=>({n:data.history.length, c:ventoPOS.carrito().length, ov:document.querySelectorAll('.pz-pago-ov').length}));
 chk('Doble toque en «Efectivo»: una sola venta y el carrito queda vacío', r.n===hN+1 && r.c===0 && r.ov===0, JSON.stringify(r));
 // Fiado
 await p.click('#posPanel .pz-tile[data-add="em"]'); await pausa();
 await p.click('#posPanel .pz-cobrar'); await p.waitForTimeout(250);
 await p.click('.pz-pago .pz-fiado'); await p.fill('.pz-pago .pz-deudor','Doña Rosa'); await p.click('.pz-pago .pz-fiado-ok'); await p.waitForTimeout(400);
 r=await p.evaluate(()=>{ const h=data.history[0]; return {tot:h.total, debe:h.debt, quien:h.person, met:h.payments[0].method}; });
 chk('Fiado: queda debiendo con nombre (Historial → Deben)', r.tot===2500 && r.debe===2500 && r.quien==='Doña Rosa' && r.met==='debe', JSON.stringify(r));
 // Lector de código de barras (teclado): el código + Enter en el buscador agrega el producto
 await p.evaluate(()=>{ data.products.find(x=>x.id==='ga').barcodes=['7702000111222']; });
 await p.fill('#posPanel .pz-q','7702000111222'); await p.press('#posPanel .pz-q','Enter'); await pausa();
 chk('Lector de código: código + Enter agrega el producto y limpia el buscador', (await linea(p,'ga'))===1 && (await p.inputValue('#posPanel .pz-q'))==='');
 await p.fill('#posPanel .pz-q','empa'); await p.waitForTimeout(150);
 r=await p.evaluate(()=>[...document.querySelectorAll('#posPanel .pz-tile')].map(t=>t.dataset.add).join(','));
 chk('Buscar filtra los productos', r==='em', r);
 await p.fill('#posPanel .pz-q',''); await p.evaluate(()=>ventoPOS.vaciar());
 // Cuentas abiertas de antes: no se pierden
 await p.evaluate(()=>{ data.tables[3].items=[{productId:'pa',name:'Papas',price:2000,qty:1,personId:null,history:[]}]; renderMesas(); }); await p.waitForTimeout(150);
 chk('Tienda con una cuenta abierta de antes: sale «Cuentas abiertas (1)»', /abiertas \(1\)/.test(await p.evaluate(()=>document.querySelector('#posPanel .pz-cuentas').textContent)));
 await p.click('#posPanel .pz-cuentas-btn'); await p.waitForTimeout(150);
 chk('…y al tocarlo se ven las cuentas para cobrarlas', await visible(p,'#tableGrid .ticket.open'));
 await p.evaluate(()=>{ data.tables[3].items=[]; renderMesas(); }); await p.waitForTimeout(150);
 chk('Sin cuentas abiertas se vuelven a ocultar', !(await visible(p,'#tableGrid')));
 // Domicilios prendidos: el botón «🛵 Domicilio» también está en la caja
 await p.evaluate(()=>{ data.domiciliosOn=true; aplicarDomicilios(); renderMesas(); }); await p.waitForTimeout(150);
 chk('Tienda con domicilios: «🛵 Domicilio» en la caja', await visible(p,'#posPanel [data-domicilio]') && /Domicilio/.test(await p.evaluate(()=>document.querySelector('#posPanel [data-domicilio]').textContent)));
 await p.click('#posPanel [data-domicilio]'); await p.waitForTimeout(250);
 chk('…y abre la factura de domicilio de siempre', await p.evaluate(()=>document.getElementById('quickSaleOverlay').classList.contains('show') && qsMode==='domicilio'));
 await p.evaluate(()=>{ document.getElementById('quickSaleOverlay').classList.remove('show'); data.domiciliosOn=false; aplicarDomicilios(); renderMesas(); }); await p.waitForTimeout(150);
 // Suscripción: sin «pos_basic» no se vende (sale el aviso de siempre)
 r=await p.evaluate(()=>{ const a=window.ventoAcceso, o=window.subPaywall; let aviso=''; window.ventoAcceso={tiene:k=>k!=='pos_basic'}; window.subPaywall=m=>{aviso=m||'x';};
   document.querySelector('#posPanel .pz-tile[data-add="ag"]').click(); const n=ventoPOS.carrito().length; window.ventoAcceso=a; window.subPaywall=o; return {n, aviso}; });
 chk('Sin el permiso «pos_basic» no se agrega y sale el aviso de la suscripción', r.n===0 && !!r.aviso, JSON.stringify(r));

 // ---------- 3. Mixto: caja arriba y mesas abajo ----------
 await p.evaluate(()=>document.querySelector('#modoTrabajoBox [data-modo="mixto"]').click()); await p.waitForTimeout(400);
 r=await p.evaluate(()=>({m:data.modoOperacion, pos:document.querySelector('#posPanel').getBoundingClientRect().top, grid:document.querySelector('#tableGrid').getBoundingClientRect().top}));
 chk('Mixto: se ven la caja y las mesas (la caja arriba)', r.m==='mixto' && await visible(p,'#posPanel .pz-cobrar') && await visible(p,'#tableGrid .ticket') && await visible(p,'#quickSaleBtn') && r.pos<r.grid, JSON.stringify(r));
 await p.click('#posPanel .pz-tile[data-add="pa"]'); await pausa();
 await p.click('#posPanel .pz-cobrar'); await p.waitForTimeout(250); await p.click('.pz-pago .pz-met[data-m="tarjeta"]'); await p.waitForTimeout(400);
 r=await p.evaluate(()=>({tot:data.history[0].total, nota:data.history[0].payments[0].note, pa:data.products.find(x=>x.id==='pa').stock}));
 chk('Mixto: cobrar en la caja con tarjeta registra la venta y descuenta (Papas 5 → 4)', r.tot===2000 && r.nota==='Tarjeta' && r.pa===4, JSON.stringify(r));
 await p.reload(); await p.waitForTimeout(3000);
 if(await p.evaluate(()=>!document.getElementById('authOverlay').hidden)) await p.evaluate(async()=>{ await enterApp('test',null); });
 await p.waitForTimeout(300);
 chk('El modo mixto sobrevive a recargar', (await p.evaluate(()=>data.modoOperacion))==='mixto' && await visible(p,'#posPanel .pz-q') && await visible(p,'#tableGrid'));
 await p.evaluate(()=>document.querySelector('#modoTrabajoBox [data-modo="restaurante"]').click()); await p.waitForTimeout(300);
 chk('Volver a restaurante: sin caja y con mesas, como antes', (await p.evaluate(()=>document.getElementById('posPanel').hidden && !document.body.classList.contains('modo-mixto'))) && await visible(p,'#tableGrid'));
 chk('Sin errores de página (negocio existente)', !p.errs.length, p.errs.join(' | '));
 // Pantalla ancha: la caja y el carrito lado a lado
 const pw=await nuevo({width:1366,height:820});
 await pw.goto(BASE,{waitUntil:'load'}); await pw.waitForTimeout(3000);
 await pw.evaluate(async()=>{ await enterApp('test',null); document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); data.modoOperacion='tienda'; await saveData(); renderAll(); });
 await pw.waitForTimeout(400);
 r=await pw.evaluate(()=>{ const g=document.querySelector('#posPanel .pz-grid').getBoundingClientRect(), c=document.querySelector('#posPanel .pz-cart').getBoundingClientRect(); return {lado:c.left>g.right-1, ancho:document.documentElement.scrollWidth<=innerWidth}; });
 chk('Pantalla ancha: productos a la izquierda y carrito a la derecha, sin desbordar', r.lado && r.ancho, JSON.stringify(r));
 r=await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
 chk('Celular: sin desplazamiento horizontal', r);
 chk('Sin errores de página (pantalla ancha)', !pw.errs.length, pw.errs.join(' | '));

 // ---------- 4. Negocio NUEVO tipo tienda: arranca en tienda ----------
 r=await p.evaluate(()=>[ventoPOS.modoPorTipo('tienda'), ventoPOS.modoPorTipo('minimercado'), ventoPOS.modoPorTipo('distribuidora'), ventoPOS.modoPorTipo('restaurante'), ventoPOS.modoPorTipo('bar'), ventoPOS.modoPorTipo('barberia')].join(','));
 chk('Modo por tipo: tienda/minimercado → tienda, distribuidora → mixto, restaurante/bar/barbería → restaurante', r==='tienda,tienda,mixto,restaurante,restaurante,restaurante', r);
 const pn=await nuevo();
 await pn.goto(BASE,{waitUntil:'load'}); await pn.waitForTimeout(2500);
 await pn.fill('#authBiz','Tienda Doña Ana'); await pn.fill('#authUser','ana'); await pn.fill('#authPass','clave123'); await pn.click('#authBtn'); await pn.waitForTimeout(1800);
 chk('Negocio nuevo: sale el asistente', await pn.evaluate(()=>document.getElementById('onbOv')?.classList.contains('show')));
 for(let i=0;i<3;i++){ await pn.click('#onbSig'); await pn.waitForTimeout(350); }
 r=await pn.evaluate(()=>({modos:[...document.querySelectorAll('#onbCuerpo [data-modo]')].map(b=>b.dataset.modo+(b.classList.contains('on')?'*':'')).join(','), facil:!!document.querySelector('#onbCuerpo [data-facil]')}));
 chk('Asistente: «¿Cómo vas a vender?» con la tienda marcada', r.modos==='restaurante,tienda*,mixto', JSON.stringify(r));
 await pn.click('#onbSig'); await pn.waitForTimeout(3500);
 r=await pn.evaluate(()=>({m:data.modoOperacion, tipo:data.businessType, pos:!document.getElementById('posPanel').hidden, facil:!!data.easyMode}));
 chk('Negocio nuevo tipo tienda: arranca en modo tienda con la caja', r.m==='tienda' && r.tipo==='tienda' && r.pos && !r.facil, JSON.stringify(r));
 chk('Negocio nuevo tipo tienda: no se ven mesas', !(await visible(pn,'#tableGrid')));
 chk('Sin errores de página (negocio nuevo)', !pn.errs.length, pn.errs.join(' | '));
 console.log('RESULTADO',ok,'bien',mal,'mal'); await b.close(); process.exit(mal?1:0); })();
