// Sonidos POS (lib/vento-sonidos.js): «tún» al agregar, «tic» al quitar, éxito al cobrar; voz = un solo sonido.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async()=>{ const b=await chromium.launch(); let ok=0,mal=0; const chk=(n,c,x)=>{ if(c){ok++;console.log('✅ '+n);} else {mal++;console.log('❌ '+n+(x?' → '+x:''));} };
 const ctx=await b.newContext({viewport:{width:390,height:844}});
 await ctx.route('**/*', r=>{const u=new URL(r.request().url()); return u.hostname==='localhost'?r.continue():r.abort();});
 // Se cuenta cuántos AudioContext, búferes, fuentes y ganancias crea la app (sin cambiar cómo suena).
 await ctx.addInitScript(()=>{
  window.__aud={ctxInteractivo:0,ctxOtros:0,buffers:0,fuentes:0,ganancias:[]};
  const C=window.AudioContext; if(!C) return;
  window.AudioContext=class extends C{ constructor(o){ super(o); if(o&&o.latencyHint==='interactive'){ window.__aud.ctxInteractivo++; this.__vento=1; } else window.__aud.ctxOtros++; } };
  const P=BaseAudioContext.prototype, cb=P.createBuffer, cs=P.createBufferSource, cg=P.createGain;
  P.createBuffer=function(){ window.__aud.buffers++; return cb.apply(this,arguments); };
  P.createBufferSource=function(){ if(this.__vento) window.__aud.fuentes++; return cs.apply(this,arguments); };
  P.createGain=function(){ const g=cg.apply(this,arguments); if(this.__vento) window.__aud.ganancias.push(g); return g; };
  const AB=window.AudioBuffer; window.AudioBuffer=class extends AB{ constructor(o){ super(o); window.__aud.buffers++; } };
 });
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto((process.env.VENTO_BASE||'http://localhost:8765')+'/index.html',{waitUntil:'load'}); await p.waitForTimeout(3500);
 await p.evaluate(async()=>{ try{await enterApp('test',null);}catch(x){} localStorage.setItem('cm-tutorial-seen','1'); document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show'));
   window.speakVoice=()=>{};
   const lista=['Poker','Club Colombia','Costeña','Pony Malta','Coca Cola','Agua Cristal','Papas Margarita','Empanada','Chocorramo','Tinto'];
   data.products=[{id:'ag',name:'Águila',price:4000,stock:200,favorite:true}].concat(lista.map((n,i)=>({id:'l'+i,name:n,price:1000+i*100,stock:200})));
   for(let k=1;k<=4;k++) data.tables[k]={items:[],people:[],payments:[]};
   data.tables[1].items=[{productId:'ag',name:'Águila',price:4000,qty:2,personId:null,history:[]}];
   data.tipsOn=false; data.loyaltyOn=false; saveData(); renderMesas(); openTableModal(1); });
 await p.waitForTimeout(500);
 const S=()=>p.evaluate(()=>({h:ventoSonidos._historial.map(x=>x.tipo), o:Object.assign({},ventoSonidos._stats.omitidos)}));
 const nuevos=(a,d)=>d.h.slice(a.h.length);
 const qty=(m,id)=>p.evaluate(([m,id])=>(data.tables[m].items||[]).filter(i=>i.productId===id).reduce((s,i)=>s+i.qty,0),[m,id]);
 const pausa=()=>p.waitForTimeout(200);   // más que los 120 ms en que se juntan sonidos iguales

 // Configuración por defecto
 let r=await p.evaluate(()=>({c:ventoSonidos.cfg(), ls:localStorage.getItem('vento_sonidos')}));
 chk('Por defecto: sonidos prendidos y volumen Bajo', r.c.on===true && r.c.vol==='bajo' && r.c.add && r.c.remove && r.c.sale && r.ls===null, JSON.stringify(r));

 // + en la cuenta
 let a=await S();
 await p.click('#itemsContainer .li-qty-plus'); await pausa();
 let d=await S();
 chk('Tocar + → la cantidad sube (2 → 3) y suena UN «add»', (await qty(1,'ag'))===3 && JSON.stringify(nuevos(a,d))==='["add"]', JSON.stringify(nuevos(a,d)));
 r=await p.evaluate(()=>({g:__aud.ganancias.length?__aud.ganancias[__aud.ganancias.length-1].gain.value:null, v:ventoSonidos._historial.slice(-1)[0].vol}));
 chk('Suena con volumen Bajo (ganancia 0,3)', Math.abs(r.g-0.3)<0.01 && r.v==='bajo', JSON.stringify(r));
 // − en la cuenta
 a=await S(); await p.click('#itemsContainer .li-qty-minus'); await pausa(); d=await S();
 chk('Tocar − → la cantidad baja (3 → 2) y suena UN «remove»', (await qty(1,'ag'))===2 && JSON.stringify(nuevos(a,d))==='["remove"]', JSON.stringify(nuevos(a,d)));
 // Stepper de cantidad para agregar
 a=await S(); await p.click('#qtyPlusBtn'); await pausa(); await p.click('#qtyMinusBtn'); await pausa(); await p.click('#qtyMinusBtn'); await pausa(); d=await S();
 chk('Stepper para agregar: + suena «add», − suena «remove», − en 0 no suena', JSON.stringify(nuevos(a,d))==='["add","remove"]' && (await p.inputValue('#addQty'))==='0', JSON.stringify(nuevos(a,d)));
 // Favorito
 a=await S(); await p.click('#favChips .fav-chip'); await pausa(); d=await S();
 chk('Tocar un favorito agrega y suena UN «add»', (await qty(1,'ag'))===3 && JSON.stringify(nuevos(a,d))==='["add"]', JSON.stringify(nuevos(a,d)));
 // Dos sonidos iguales en menos de 120 ms → uno
 a=await S(); await p.evaluate(()=>{ ventoSonidos.add(); ventoSonidos.add(); }); await pausa(); d=await S();
 chk('El mismo sonido dos veces seguidas (<120 ms) suena una sola vez', nuevos(a,d).length===1 && d.o.junto===(a.o.junto||0)+1, JSON.stringify(nuevos(a,d)));

 // Voz: «mesa 1 cinco águilas» = 5 unidades y UN sonido
 a=await S(); const antes=await qty(1,'ag');
 await p.evaluate(async()=>{ await handleVoiceTranscript('mesa 1 cinco águilas'); }); await pausa(); d=await S();
 chk('Voz «mesa 1 cinco águilas»: +5 y UN solo sonido', (await qty(1,'ag'))===antes+5 && JSON.stringify(nuevos(a,d))==='["add"]', (await qty(1,'ag'))+' '+JSON.stringify(nuevos(a,d)));
 // Voz con varios productos
 a=await S();
 await p.evaluate(async()=>{ await handleVoiceTranscript('mesa 3 dos águilas y un poker'); }); await pausa(); d=await S();
 r=await p.evaluate(()=>data.tables[3].items.map(i=>i.name+'x'+i.qty).join(','));
 chk('Voz con dos productos: los anota y suena UNA vez', /Águilax2/.test(r) && /Pokerx1/.test(r) && JSON.stringify(nuevos(a,d))==='["add"]', r+' '+JSON.stringify(nuevos(a,d)));
 // Lista de 10 productos en un solo comando: un sonido, y sin «juntar» (el lote lo maneja)
 a=await S();
 r=await p.evaluate(()=>{ const its=data.products.filter(x=>x.id!=='ag').map(x=>({productText:x.name,qty:2})); const res=applyVoiceItems(2,its,'add'); return {n:data.tables[2].items.length, u:data.tables[2].items.reduce((s,i)=>s+i.qty,0), add:res.added.length}; });
 await pausa(); d=await S();
 chk('Lista de 10 productos (un comando): 10 anotados y UN solo sonido', r.n===10 && r.u===20 && JSON.stringify(nuevos(a,d))==='["add"]' && (d.o.junto||0)===(a.o.junto||0), JSON.stringify(r)+' '+JSON.stringify(nuevos(a,d)));
 // Lote a mano con 10 favoritos
 a=await S();
 await p.evaluate(()=>ventoSonidos.lote(()=>{ for(let i=0;i<10;i++) addFavoriteToTable('ag'); })); await pausa(); d=await S();
 chk('ventoSonidos.lote con 10 agregados: UN sonido', JSON.stringify(nuevos(a,d))==='["add"]', JSON.stringify(nuevos(a,d)));
 // Pedidos del QR: no suenan
 a=await S();
 r=await p.evaluate(()=>{ const x=window.vitoPedidos.entrante({id:'qrprueba1',mesa:4,items:[{n:'Águila',q:2},{n:'Poker',q:1}]},'qr'); return (data.tables[4].items||[]).reduce((s,i)=>s+i.qty,0); });
 await pausa(); d=await S();
 chk('Pedido del QR: entra a la cuenta y NO suena', r===3 && nuevos(a,d).length===0, r+' '+JSON.stringify(nuevos(a,d)));

 // Pestaña oculta: no suena
 a=await S();
 await p.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));
 await p.evaluate(()=>document.querySelector('#itemsContainer .li-qty-plus').click()); await pausa();
 await p.evaluate(()=>{ delete document.hidden; }); d=await S();
 chk('Con la pestaña oculta no suena (pero sí suma)', nuevos(a,d).length===0 && d.o.oculta===(a.o.oculta||0)+1, JSON.stringify(nuevos(a,d)));
 // Micrófono escuchando: no suena
 a=await S();
 await p.evaluate(()=>{ voiceListening=true; }); await p.click('#itemsContainer .li-qty-plus'); await pausa(); await p.evaluate(()=>{ voiceListening=false; });
 await p.evaluate(()=>{ window.__ventoEscuchando=true; }); await p.click('#itemsContainer .li-qty-plus'); await pausa(); await p.evaluate(()=>{ window.__ventoEscuchando=false; });
 d=await S();
 chk('Con el micrófono escuchando no suena', nuevos(a,d).length===0 && d.o.microfono===(a.o.microfono||0)+2, JSON.stringify(nuevos(a,d)));

 // Cobrar la mesa → success
 a=await S();
 await p.click('#chargeBtn'); await p.waitForTimeout(300);
 await p.click('button[data-m="efectivo"]'); await p.waitForTimeout(400); d=await S();
 r=await p.evaluate(()=>({items:(data.tables[1].items||[]).length, h:data.history.length, debt:data.history[0]&&data.history[0].debt}));
 chk('Cobrar la cuenta: mesa liberada y suena «success»', r.items===0 && r.debt===0 && JSON.stringify(nuevos(a,d))==='["success"]', JSON.stringify(r)+' '+JSON.stringify(nuevos(a,d)));
 // Venta rápida: agregar, + y cobrar
 await p.evaluate(()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); qsOpen('mostrador'); });
 await p.waitForTimeout(300);
 a=await S();
 await p.evaluate(()=>{ document.getElementById('qsProductId').value='ag'; document.getElementById('qsQty').value=2; }); await p.click('#qsAddBtn'); await pausa();
 await p.click('#qsItemsContainer .li-qty-plus'); await pausa();
 await p.click('#qsItemsContainer .li-qty-minus'); await pausa();
 d=await S();
 chk('Venta rápida: agregar y + suenan «add», − suena «remove»', JSON.stringify(nuevos(a,d))==='["add","add","remove"]', JSON.stringify(nuevos(a,d)));
 a=await S(); const hAntes=await p.evaluate(()=>data.history.length);
 await p.click('#qsChargeBtn'); await p.waitForTimeout(300); await p.click('#confirmOkBtn'); await p.waitForTimeout(400); d=await S();
 r=await p.evaluate(()=>({h:data.history.length, t:data.history[0].tableName, tot:data.history[0].total}));
 chk('Venta rápida cobrada: queda en el historial y suena «success»', r.h===hAntes+1 && r.t==='Mostrador' && r.tot===8000 && JSON.stringify(nuevos(a,d))==='["success"]', JSON.stringify(r)+' '+JSON.stringify(nuevos(a,d)));

 // Ajustes → 🔊 Sonidos: apagar «Sonido al quitar»
 await p.evaluate(()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); asisGoView('ajustes'); });
 await p.waitForTimeout(300);
 await p.click('.ajustes-cat[data-cat="sonidos"]'); await p.waitForTimeout(200);
 r=await p.evaluate(()=>{ const g=document.getElementById('sndGrupo'); return {vis:!g.hidden, on:document.getElementById('sndOn').checked, bajo:g.querySelector('[data-snd-vol="bajo"]').classList.contains('on')}; });
 chk('Ajustes muestra «🔊 Sonidos» con todo prendido y Bajo marcado', r.vis && r.on && r.bajo, JSON.stringify(r));
 await p.screenshot({path:require('os').tmpdir()+'/sonidos-ajustes.png'});
 await p.click('#sndRemove + .switch-slider'); await p.waitForTimeout(150);
 r=await p.evaluate(()=>({c:ventoSonidos.cfg(), ls:JSON.parse(localStorage.getItem('vento_sonidos')||'{}')}));
 chk('Apagar «Sonido al quitar» se guarda en vento_sonidos', r.c.remove===false && r.ls.remove===false && r.c.add===true, JSON.stringify(r));
 await p.click('[data-snd-vol="medio"]'); await p.waitForTimeout(150);
 r=await p.evaluate(()=>({v:ventoSonidos.cfg().vol, g:__aud.ganancias[__aud.ganancias.length-1].gain.value}));
 chk('Volumen Medio: se guarda y se oye una muestra más fuerte', r.v==='medio' && Math.abs(r.g-0.6)<0.01, JSON.stringify(r));
 await p.click('[data-snd-vol="bajo"]'); await p.waitForTimeout(150);
 const f0=await p.evaluate(()=>__aud.fuentes); await p.click('#sndProbar'); await p.waitForTimeout(1100);
 chk('«Probar» toca los tres sonidos', (await p.evaluate(()=>__aud.fuentes))-f0===3);
 // Con «al quitar» apagado, − no suena pero + sí
 await p.evaluate(()=>{ asisGoView('mesas'); openTableModal(2); }); await p.waitForTimeout(400);
 a=await S(); await p.click('#itemsContainer .li-qty-minus'); await pausa(); d=await S();
 chk('«Sonido al quitar» apagado: − no suena', nuevos(a,d).length===0 && d.o.apagado===(a.o.apagado||0)+1, JSON.stringify(nuevos(a,d)));
 a=await S(); await p.click('#itemsContainer .li-qty-plus'); await pausa(); d=await S();
 chk('…y + sigue sonando', JSON.stringify(nuevos(a,d))==='["add"]', JSON.stringify(nuevos(a,d)));
 // Todo apagado
 await p.evaluate(()=>ventoSonidos.guardar({on:false}));
 a=await S(); await p.click('#itemsContainer .li-qty-plus'); await pausa(); d=await S();
 chk('«Sonidos de productos» apagado: nada suena', nuevos(a,d).length===0, JSON.stringify(nuevos(a,d)));
 await p.evaluate(()=>ventoSonidos.guardar({on:true, remove:true}));

 // Un solo AudioContext y búferes reutilizados
 r=await p.evaluate(()=>({aud:{c:__aud.ctxInteractivo, b:__aud.buffers, f:__aud.fuentes}, st:{c:ventoSonidos._stats.contextos, b:ventoSonidos._stats.buferes, f:ventoSonidos._stats.fuentes}, sonaron:ventoSonidos._historial.length}));
 chk('Un solo AudioContext (latencyHint interactive) en toda la prueba', r.aud.c===1 && r.st.c===1, JSON.stringify(r));
 chk('Solo 3 búferes creados una vez y reutilizados en cada toque', r.aud.b===3 && r.st.b===3 && r.aud.f>=r.sonaron && r.aud.f===r.st.f, JSON.stringify(r));
 chk('Sin errores de página', !errs.length, errs.join(' | '));

 // ---------- APK (window.VentoAndroid simulado, como en holaapk) con «Hola Vento» prendido ----------
 const ctx2=await b.newContext({viewport:{width:390,height:844}});
 await ctx2.route('**/*', r=>{const u=new URL(r.request().url()); return u.hostname==='localhost'?r.continue():r.abort();});
 await ctx2.addInitScript(()=>{
  const V=()=>window.__ventoVoz;
  window.VentoAndroid={ info:()=>'{}', hablar(){}, callar(){}, guardarArchivo(){}, fondo:()=>true, fondoActivar(){}, notificar(){return true;}, avisosEstado:()=>'{"prendidos":true}', buscarTVs(){}, lounge(){}, pararTV(){}, vozPreparar(){},
   permisos:()=>'{"microfono":true,"camara":false,"avisos":true,"bateria":false,"fondo":true}', pedirPermisos(){}, vozSilencio(){},
   vozIniciar(){ setTimeout(()=>V()('start',{}),50); }, vozParar(){ setTimeout(()=>V()('end',{}),30); }, vozCancelar(){ setTimeout(()=>V()('end',{}),30); } };
  window.__dice=(t)=>{ V()('result',{alts:[{t,c:0.9}],final:true}); };
  localStorage.setItem('cm-tutorial-seen','1');
 });
 const q2=await ctx2.newPage(); const errs2=[]; q2.on('pageerror',e=>errs2.push(e.message));
 await q2.goto((process.env.VENTO_BASE||'http://localhost:8765')+'/index.html'); await q2.waitForTimeout(2500);
 await q2.fill('#authBiz','Bar'); await q2.fill('#authUser','ana'); await q2.fill('#authPass','clave123'); await q2.click('#authBtn'); await q2.waitForTimeout(1500);
 await q2.click('#onbSaltar').catch(()=>{});
 await q2.evaluate(()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); window.speakVoice=()=>{};
   data.products=[{id:'pk',name:'Poker',price:3800,stock:50}]; for(let i=1;i<=3;i++) data.tables[i]={items:[],people:[]};
   data.tables[1].items=[{productId:'pk',name:'Poker',price:3800,qty:1,personId:null,history:[]}]; saveData(); openTableModal(1); });
 await q2.waitForTimeout(3500);
 const S2=()=>q2.evaluate(()=>({h:ventoSonidos._historial.map(x=>x.tipo), o:Object.assign({},ventoSonidos._stats.omitidos)}));
 const pk=()=>q2.evaluate(()=>data.tables[1].items.reduce((s,i)=>s+i.qty,0));
 r=await q2.evaluate(()=>window.ventoHola.estado());
 chk('APK: «Hola Vento» escucha de fondo (esperando su palabra)', r.corriendo && !r.atento, JSON.stringify(r));
 a=await S2(); await q2.click('#itemsContainer .li-qty-plus'); await q2.waitForTimeout(200); d=await S2();
 chk('APK: con «Hola Vento» solo esperando, tocar + sí suena', (await pk())===2 && JSON.stringify(nuevos(a,d))==='["add"]', JSON.stringify(nuevos(a,d)));
 a=await S2(); await q2.evaluate(()=>__dice('hola vento mesa 1 dos poker')); await q2.waitForTimeout(1500); d=await S2();
 chk('APK: «hola vento mesa 1 dos poker» anota 2 y suena UNA vez', (await pk())===4 && JSON.stringify(nuevos(a,d))==='["add"]', (await pk())+' '+JSON.stringify(nuevos(a,d)));
 r=await q2.evaluate(()=>window.ventoHola.estado());
 a=await S2(); await q2.click('#itemsContainer .li-qty-plus'); await q2.waitForTimeout(200); d=await S2();
 chk('APK: con «Hola Vento» atento y el micrófono abierto, tocar + no suena', r.corriendo && r.atento && (await pk())===5 && nuevos(a,d).length===0 && d.o.microfono===(a.o.microfono||0)+1, JSON.stringify(r)+' '+JSON.stringify(nuevos(a,d)));
 chk('APK: un solo AudioContext de sonidos', await q2.evaluate(()=>__aud===undefined ? ventoSonidos._stats.contextos===1 : true));
 chk('APK: sin errores de página', !errs2.length, errs2.join(' | '));
 console.log('RESULTADO',ok,'bien',mal,'mal'); await b.close(); })();
