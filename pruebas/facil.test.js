// Modo fácil (lib/vento-pos.js): solo 3 botones grandes (Vender / Hoy / Más), vender en una mesa con toques,
// cobrar sin ventanas de más (con «Deshacer»), HOY en números grandes, tienda directo a la caja y salir a la app completa.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = (process.env.VENTO_BASE || 'http://localhost:8765') + '/index.html';
(async()=>{ const b=await chromium.launch(); let ok=0,mal=0; const chk=(n,c,x)=>{ if(c){ok++;console.log('✅ '+n);} else {mal++;console.log('❌ '+n+(x?' → '+x:''));} };
 const nuevo=async(vp)=>{ const ctx=await b.newContext({viewport:vp||{width:390,height:844}});
  await ctx.route('**/*', r=>{const u=new URL(r.request().url()); return u.hostname==='localhost'?r.continue():r.abort();});
  await ctx.addInitScript(()=>{ try{ localStorage.setItem('vento-hola','0'); }catch(e){} });
  const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message)); return p; };
 const visible=(p,sel)=>p.evaluate(s=>{ const e=document.querySelector(s); return !!e && e.checkVisibility(); }, sel);
 const pausa=()=>new Promise(r=>setTimeout(r,170));   // más que los 120 ms en que se juntan sonidos iguales
 const S=p=>p.evaluate(()=>window.ventoSonidos?ventoSonidos._historial.map(x=>x.tipo):[]);
 const stock=(p,id)=>p.evaluate(id=>data.products.find(y=>y.id===id).stock, id);
 const mesa=(p,n)=>p.evaluate(n=>(data.tables[n].items||[]).map(i=>i.productId+'×'+i.qty).join(','), n);

 const p=await nuevo();
 await p.goto(BASE,{waitUntil:'load'}); await p.waitForTimeout(3000);
 await p.evaluate(async()=>{ await enterApp('test',null); localStorage.setItem('cm-tutorial-seen','1'); localStorage.setItem('vento-pp-oculta','1');
   document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); window.speakVoice=()=>{};
   data.products=[{id:'ag',name:'Águila',price:4000,stock:20,favorite:true},{id:'em',name:'Empanada',price:2500,stock:10},{id:'ga',name:'Gaseosa',price:3000}];
   data.tables={}; for(let k=1;k<=4;k++) data.tables[k]={items:[],people:[],payments:[]};
   data.tableCount=4; data.tipsOn=false; data.loyaltyOn=false; data.history=[]; data.easyMode=false; delete data.modoOperacion; await saveData(); renderAll(); });
 await p.waitForTimeout(400);
 chk('Sin modo fácil: la app completa (sin la cáscara)', !(await visible(p,'#facilApp')) && await visible(p,'.tabbar'));

 // ---------- Se prende en Ajustes → Apariencia ----------
 await p.evaluate(()=>{ const c=document.getElementById('easyModeToggle'); c.checked=true; c.dispatchEvent(new Event('change')); }); await p.waitForTimeout(400);
 let r=await p.evaluate(()=>({on:data.easyMode, nav:[...document.querySelectorAll('#facilApp .fz-nav button')].map(b=>b.textContent.trim()).join('|'),
   arriba:!!document.elementFromPoint(195,420).closest('#facilApp'), cls:document.body.classList.contains('facil-on')}));
 chk('Ajustes → Modo fácil: aparece la pantalla sencilla', r.on===true && r.cls && await visible(p,'#facilApp') && r.arriba, JSON.stringify(r));
 chk('Solo 3 botones grandes: Vender, Hoy y Más', r.nav==='🛒Vender|📊Hoy|⋯Más', r.nav);
 r=await p.evaluate(()=>['.tabbar','nav button[data-view="contabilidad"]','nav button[data-view="estadisticas"]','nav button[data-view="inventario"]','nav button[data-view="musica"]','#voiceFab','#libretaFab','#quickSaleBtn']
   .filter(s=>{ const e=document.querySelector(s); if(!e||!e.checkVisibility()) return false; const q=e.getBoundingClientRect(); const t=document.elementFromPoint(q.left+q.width/2,q.top+q.height/2); return t && (t===e||e.contains(t)); }));
 chk('No se ve ni se puede tocar el resto (contabilidad, estadísticas, inventario, música, micrófono flotante…)', !r.length, r.join(','));
 r=await p.evaluate(()=>[...document.querySelectorAll('#facilApp button')].filter(x=>x.checkVisibility()).map(x=>Math.round(x.getBoundingClientRect().height)).filter(h=>h<56));
 chk('Botones de al menos 56 px de alto', !r.length, r.join(','));

 // ---------- Vender en una mesa con toques ----------
 r=await p.evaluate(()=>[...document.querySelectorAll('#facilApp .fz-mesa')].map(b=>b.textContent).join('|'));
 chk('Vender: las mesas en grande (número y si está libre)', r==='Mesa 1Libre|Mesa 2Libre|Mesa 3Libre|Mesa 4Libre', r);
 await p.click('#facilApp .fz-mesa[data-mesa="2"]'); await p.waitForTimeout(200);
 r=await p.evaluate(()=>({t:document.querySelector('#facilApp .fz-titulo').textContent, tiles:document.querySelectorAll('#facilApp .pz-tile').length, cara:!!document.querySelector('#facilApp .pz-tile .pz-cara')}));
 chk('Al tocar la mesa: los productos como baldosas grandes (foto/emoji, nombre y precio)', r.t==='Mesa 2' && r.tiles===3 && r.cara, JSON.stringify(r));
 let s0=(await S(p)).length;
 await p.click('#facilApp .pz-tile[data-add="ag"]'); await pausa();
 await p.click('#facilApp .pz-tile[data-add="ag"]'); await pausa();
 await p.click('#facilApp .pz-tile[data-add="em"]'); await pausa();
 chk('Un toque = +1: Águila ×2 y Empanada ×1 en la mesa 2', (await mesa(p,2))==='ag×2,em×1', await mesa(p,2));
 chk('Suena «tún» en cada toque', JSON.stringify((await S(p)).slice(s0))==='["add","add","add"]', JSON.stringify((await S(p)).slice(s0)));
 chk('El inventario se descuenta como en la cuenta de siempre (Águila 18, Empanada 9)', (await stock(p,'ag'))===18 && (await stock(p,'em'))===9);
 s0=(await S(p)).length;
 await p.click('#facilApp .pz-linea:nth-child(2) [data-menos]'); await pausa();
 chk('− grande quita (Empanada sale y vuelve al inventario) y suena «tic»', (await mesa(p,2))==='ag×2' && (await stock(p,'em'))===10 && JSON.stringify((await S(p)).slice(s0))==='["remove"]', (await mesa(p,2)));
 await p.click('#facilApp .pz-tile[data-add="em"]'); await pausa();
 r=await p.evaluate(()=>document.querySelector('#facilApp .pz-total b').textContent);
 chk('TOTAL enorme correcto: $10.500', r==='$10.500', r);
 r=await p.evaluate(()=>Math.round(document.querySelector('#facilApp .pz-cobrar').getBoundingClientRect().height));
 chk('Botón «💵 COBRAR» gigante', r>=64 && /COBRAR/.test(await p.evaluate(()=>document.querySelector('#facilApp .pz-cobrar').textContent)), String(r));
 // Cobrar en efectivo
 const h0=await p.evaluate(()=>data.history.length);
 s0=(await S(p)).length;
 await p.click('#facilApp .pz-cobrar'); await p.waitForTimeout(250);
 r=await p.evaluate(()=>({m:[...document.querySelectorAll('.pz-pago .pz-met')].map(b=>b.textContent.trim()).join('|'), fiado:!!document.querySelector('.pz-pago .pz-fiado'), confirm:document.getElementById('confirmOverlay').classList.contains('show')}));
 chk('Cobrar: solo 4 formas de pago grandes (Efectivo, Nequi, DaviPlata, Tarjeta) y sin ventana de confirmación', r.m==='💵Efectivo|💜Nequi|🔴DaviPlata|💳Tarjeta' && !r.fiado && !r.confirm, JSON.stringify(r));
 await p.click('.pz-pago .pz-met[data-m="efectivo"]'); await p.waitForTimeout(500);
 r=await p.evaluate(()=>{ const h=data.history[0]; return {n:data.history.length, tot:h.total, mesa:h.table, met:h.payments.map(x=>x.method).join(','), debe:h.debt, items:h.items.map(i=>i.name+'×'+i.qty).join(','), libre:!data.tables[2].items.length}; });
 chk('Venta en data.history con el total correcto y la mesa libre', r.n===h0+1 && r.tot===10500 && r.mesa===2 && r.met==='efectivo' && r.debe===0 && r.items==='Águila×2,Empanada×1' && r.libre, JSON.stringify(r));
 chk('Inventario descontado UNA sola vez (no otra vez al cobrar)', (await stock(p,'ag'))===18 && (await stock(p,'em'))===9);
 chk('Cobrar suena «success»', JSON.stringify((await S(p)).slice(s0))==='["success"]', JSON.stringify((await S(p)).slice(s0)));
 chk('Vuelve a las mesas y la mesa 2 sale «Libre»', /Mesa 2Libre/.test(await p.evaluate(()=>document.querySelector('#facilApp .fz-mesa[data-mesa="2"]').textContent)));
 // Deshacer
 chk('Sale «↩ Deshacer» grande', await visible(p,'#pzDeshacer .pz-dbtn') && (await p.evaluate(()=>document.querySelector('#pzDeshacer .pz-dbtn').getBoundingClientRect().height))>=56);
 await p.click('#pzDeshacer .pz-dbtn'); await p.waitForTimeout(300);
 r=await p.evaluate(()=>({n:data.history.length, t:document.querySelector('#facilApp .fz-titulo')?.textContent}));
 chk('Deshacer: la venta sale del historial y la mesa vuelve abierta con lo pedido', r.n===h0 && (await mesa(p,2))==='ag×2,em×1' && r.t==='Mesa 2', JSON.stringify(r)+' '+(await mesa(p,2)));
 chk('Deshacer no toca el inventario (sigue igual: 18 y 9)', (await stock(p,'ag'))===18 && (await stock(p,'em'))===9);
 await p.click('#facilApp .pz-cobrar'); await p.waitForTimeout(250);
 await p.click('.pz-pago .pz-met[data-m="efectivo"]'); await p.waitForTimeout(400);
 chk('Cobrar otra vez: una sola venta de $10.500 en el historial', (await p.evaluate(()=>data.history.length))===h0+1 && (await p.evaluate(()=>data.history[0].total))===10500);
 await p.waitForTimeout(5200);
 chk('«Deshacer» se va solo a los 5 segundos', !(await visible(p,'#pzDeshacer')));
 // Mesa ocupada muestra su total
 await p.click('#facilApp .fz-mesa[data-mesa="3"]'); await p.waitForTimeout(150);
 await p.click('#facilApp .pz-tile[data-add="ga"]'); await pausa();
 // Voz en la mesa abierta: basta decir «dos águilas» (sin decir la mesa) y suena UNA vez
 chk('«🎤 Decir pedido» grande en la mesa', await visible(p,'#facilApp .pz-mic') && /Decir pedido/.test(await p.evaluate(()=>document.querySelector('#facilApp .pz-mic').textContent)));
 s0=(await S(p)).length;
 await p.evaluate(async()=>{ await handleVoiceTranscript('dos águilas'); }); await p.waitForTimeout(300);
 r=await p.evaluate(()=>[...document.querySelectorAll('#facilApp .pz-linea b')].map(x=>x.textContent).join('|'));
 chk('Voz «dos águilas» en la mesa 3: se anota ahí, se ve en la lista y suena una vez', (await mesa(p,3))==='ga×1,ag×2' && /2 × Águila/.test(r) && JSON.stringify((await S(p)).slice(s0))==='["add"]', (await mesa(p,3))+' '+r+' '+JSON.stringify((await S(p)).slice(s0)));
 await p.click('#facilApp .pz-linea:nth-child(2) [data-menos]'); await pausa(); await p.click('#facilApp .pz-linea:nth-child(2) [data-menos]'); await pausa();
 await p.click('#facilApp [data-atras]'); await p.waitForTimeout(200);
 r=await p.evaluate(()=>{ const b=document.querySelector('#facilApp .fz-mesa[data-mesa="3"]'); return {txt:b.textContent, oc:b.classList.contains('ocupada')}; });
 chk('Una mesa ocupada se ve distinta y con su total', r.oc && r.txt==='Mesa 3$3.000', JSON.stringify(r));

 // ---------- HOY ----------
 await p.click('#facilApp [data-fz="hoy"]'); await p.waitForTimeout(200);
 r=await p.evaluate(()=>({tot:document.querySelector('.fz-hoy-total').textContent, txt:document.querySelector('.fz-hoy').textContent, ult:document.querySelectorAll('.fz-ult li').length, graf:document.querySelectorAll('#facilApp canvas, #facilApp svg').length}));
 chk('HOY: el total vendido en grande ($10.500, 1 venta)', r.tot==='$10.500' && /1 venta/.test(r.txt), JSON.stringify(r));
 chk('HOY: efectivo / digital y las últimas ventas, sin gráficas', /Efectivo\$10\.500/.test(r.txt) && /Digital\$0/.test(r.txt) && r.ult===1 && r.graf===0, r.txt);

 // ---------- MÁS → Productos: agregar y cambiar precio ----------
 await p.click('#facilApp [data-fz="mas"]'); await p.waitForTimeout(200);
 r=await p.evaluate(()=>[...document.querySelectorAll('#facilApp .fz-btn')].map(b=>b.dataset.ir).join(','));
 chk('MÁS: Productos, Libreta, Ayuda por WhatsApp y Salir del modo fácil', r==='productos,libreta,ayuda,salir', r);
 await p.click('#facilApp [data-ir="productos"]'); await p.waitForTimeout(200);
 await p.click('#facilApp [data-nuevo]'); await p.waitForTimeout(150);
 await p.fill('#facilApp .fz-nombre','Tamal'); await p.fill('#facilApp .fz-precio','5000'); await p.click('#facilApp .fz-ok'); await p.waitForTimeout(300);
 r=await p.evaluate(()=>{ const t=data.products.find(x=>x.name==='Tamal'); return t?t.price:null; });
 chk('Agregar producto: nombre y precio en un formulario simple', r===5000, String(r));
 await p.click('#facilApp .fz-prow[data-edit="ga"]'); await p.waitForTimeout(150);
 await p.fill('#facilApp .fz-precio','3500'); await p.click('#facilApp .fz-ok'); await p.waitForTimeout(300);
 r=await p.evaluate(()=>({p:data.products.find(x=>x.id==='ga').price, mesa3:data.tables[3].items[0].price}));
 chk('Cambiar precio: se guarda (y se actualiza en la mesa abierta)', r.p===3500 && r.mesa3===3500, JSON.stringify(r));
 await p.click('#facilApp [data-volver]'); await p.waitForTimeout(150);
 await p.click('#facilApp [data-ir="libreta"]'); await p.waitForTimeout(300);
 chk('Libreta se abre encima', await visible(p,'#libretaOverlay'));
 await p.evaluate(()=>document.getElementById('libretaOverlay').classList.remove('show'));

 // ---------- Tienda: directo a la caja ----------
 await p.evaluate(()=>ventoPOS.ponerModo('tienda')); await p.waitForTimeout(200);
 await p.click('#facilApp [data-fz="vender"]'); await p.waitForTimeout(250);
 chk('En tienda, Vender va directo a la caja (sin mesas)', (await p.$$('#facilApp .fz-mesa')).length===0 && await visible(p,'#facilApp .pz-grande .pz-tile') && await visible(p,'#facilApp .pz-cobrar'));
 const h1=await p.evaluate(()=>data.history.length);
 await p.click('#facilApp .pz-tile[data-add="em"]'); await pausa(); await p.click('#facilApp .pz-tile[data-add="em"]'); await pausa();
 await p.click('#facilApp .pz-cobrar'); await p.waitForTimeout(250); await p.click('.pz-pago .pz-met[data-m="daviplata"]'); await p.waitForTimeout(400);
 r=await p.evaluate(()=>({n:data.history.length, tot:data.history[0].total, nota:data.history[0].payments[0].note, em:data.products.find(x=>x.id==='em').stock}));
 chk('Tienda fácil: cobrar con DaviPlata registra la venta y descuenta una vez (Empanada 9 → 7)', r.n===h1+1 && r.tot===5000 && r.nota==='DaviPlata' && r.em===7, JSON.stringify(r));
 await p.click('#facilApp [data-fz="hoy"]'); await p.waitForTimeout(200);
 chk('HOY suma también la caja ($15.500 · digital $5.000)', (await p.evaluate(()=>document.querySelector('.fz-hoy-total').textContent))==='$15.500' && /Digital\$5\.000/.test(await p.evaluate(()=>document.querySelector('.fz-hoy').textContent)));
 // Mixto: mesas + «Venta rápida»
 await p.evaluate(()=>ventoPOS.ponerModo('mixto')); await p.click('#facilApp [data-fz="vender"]'); await p.waitForTimeout(200);
 chk('En mixto: «Venta rápida» y las mesas', await visible(p,'#facilApp .fz-rapida') && (await p.$$('#facilApp .fz-mesa')).length===4);
 await p.evaluate(()=>ventoPOS.ponerModo('restaurante'));

 // ---------- El mesero conserva su pantalla ----------
 r=await p.evaluate(()=>{ document.body.classList.add('modo-mesero'); ventoFacil.aplicar(); const v=document.getElementById('facilApp').checkVisibility(); document.body.classList.remove('modo-mesero'); ventoFacil.aplicar(); return {mesero:v, dueno:document.getElementById('facilApp').checkVisibility()}; });
 chk('El mesero (modo mesero) mantiene su pantalla; el negocio sí ve la fácil', r.mesero===false && r.dueno===true, JSON.stringify(r));
 // ---------- Suscripción ----------
 r=await p.evaluate(()=>{ const a=window.ventoAcceso, o=window.subPaywall; let av=''; window.ventoAcceso={tiene:k=>k!=='pos_basic'}; window.subPaywall=m=>{av=m||'x';};
   document.querySelector('#facilApp .fz-mesa[data-mesa="1"]').click(); document.querySelector('#facilApp .pz-tile[data-add="ag"]').click(); const n=data.tables[1].items.length;
   window.ventoAcceso=a; window.subPaywall=o; document.querySelector('#facilApp [data-atras]').click(); return {n, av}; });
 chk('Sin el permiso «pos_basic» no se agrega y sale el aviso de la suscripción', r.n===0 && !!r.av, JSON.stringify(r));
 // ---------- Pantalla ancha ----------
 await p.setViewportSize({width:1280,height:800}); await p.waitForTimeout(200);
 await p.click('#facilApp .fz-mesa[data-mesa="3"]'); await p.waitForTimeout(200);
 r=await p.evaluate(()=>{ const g=document.querySelector('#facilApp .pz-grid').getBoundingClientRect(), c=document.querySelector('#facilApp .pz-cart').getBoundingClientRect(); return {lado:c.left>=g.right-1, ancho:document.documentElement.scrollWidth<=innerWidth}; });
 chk('Pantalla ancha: productos y lo pedido lado a lado', r.lado && r.ancho, JSON.stringify(r));
 await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(200);
 r=await p.evaluate(()=>{ const m=document.getElementById('fzMain'); return m.scrollWidth<=m.clientWidth+1; });
 chk('Celular 390×844: sin desplazamiento horizontal', r);

 // ---------- Salir del modo fácil ----------
 await p.click('#facilApp [data-fz="mas"]'); await p.waitForTimeout(150);
 await p.click('#facilApp [data-ir="salir"]'); await p.waitForTimeout(400);
 r=await p.evaluate(()=>({on:data.easyMode, cls:document.body.className}));
 chk('«Salir del modo fácil» restaura la app completa', r.on===false && !(await visible(p,'#facilApp')) && await visible(p,'.tabbar') && await visible(p,'#tableGrid') && !/facil-on|easy-mode/.test(r.cls), JSON.stringify(r));
 chk('La app completa sigue con todo (mesa 3 abierta con su Gaseosa)', /Mesa 3/.test(await p.evaluate(()=>document.querySelector('#tableGrid .ticket.open')?.textContent||'')));
 await p.reload(); await p.waitForTimeout(3000);
 if(await p.evaluate(()=>!document.getElementById('authOverlay').hidden)) await p.evaluate(async()=>{ await enterApp('test',null); });
 await p.waitForTimeout(300);
 chk('Después de recargar sigue en la app completa', (await p.evaluate(()=>data.easyMode))===false && !(await visible(p,'#facilApp')));
 chk('Sin errores de página', !p.errs.length, p.errs.join(' | '));

 // ---------- Negocio nuevo: el asistente ofrece la versión fácil ----------
 const pn=await nuevo();
 await pn.goto(BASE,{waitUntil:'load'}); await pn.waitForTimeout(2500);
 await pn.fill('#authBiz','Tienda Don Luis'); await pn.fill('#authUser','luis'); await pn.fill('#authPass','clave123'); await pn.click('#authBtn'); await pn.waitForTimeout(1800);
 for(let i=0;i<3;i++){ await pn.click('#onbSig'); await pn.waitForTimeout(350); }
 chk('Asistente: «¿Quieres la versión fácil?»', /¿Quieres la versión fácil\?/.test(await pn.evaluate(()=>document.getElementById('onbCuerpo').textContent)));
 await pn.click('#onbCuerpo .onb-facil'); await pn.waitForTimeout(150);
 await pn.click('#onbSig'); await pn.waitForTimeout(3500);
 r=await pn.evaluate(()=>({facil:data.easyMode, modo:data.modoOperacion, ver:document.getElementById('facilApp')?.checkVisibility(), caja:!!document.querySelector('#facilApp .pz-grande'), mesas:document.querySelectorAll('#facilApp .fz-mesa').length}));
 chk('Negocio nuevo con la versión fácil: entra a la pantalla sencilla y (tienda) directo a la caja', r.facil===true && r.modo==='tienda' && r.ver===true && r.caja && r.mesas===0, JSON.stringify(r));
 chk('Sin errores de página (negocio nuevo)', !pn.errs.length, pn.errs.join(' | '));
 console.log('RESULTADO',ok,'bien',mal,'mal'); await b.close(); process.exit(mal?1:0); })();
