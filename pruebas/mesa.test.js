// Panel de la mesa (buscar y agregar productos primero; acciones secundarias como iconos pequeños; personas plegable)
// y micrófono rápido (al tocar escucha al instante, también con «Hola Vento» escuchando y en la APK simulada).
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = process.env.VENTO_BASE || 'http://localhost:8765';
(async()=>{ const b=await chromium.launch(); let ok=0,mal=0; const chk=(n,c,x)=>{ if(c){ok++;console.log('✅ '+n);} else {mal++;console.log('❌ '+n+(x?' → '+x:''));} };
 const errs=[];
 async function entrar(ctx){
  await ctx.route('**/*', r=>{const u=new URL(r.request().url()); return u.hostname==='localhost'?r.continue():r.abort();});
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE+'/index.html'); await p.waitForTimeout(2500);
  await p.fill('#authBiz','Bar'); await p.fill('#authUser','ana'); await p.fill('#authPass','clave123'); await p.click('#authBtn'); await p.waitForTimeout(1500);
  await p.click('#onbSaltar').catch(()=>{});
  return p;
 }

 // ---------------- 1) Panel de la mesa en celular (390×844) ----------------
 { const ctx=await b.newContext({viewport:{width:390,height:844}, hasTouch:true, isMobile:true});
  await ctx.addInitScript(()=>{ localStorage.setItem('cm-tutorial-seen','1'); localStorage.setItem('vento-hola','0'); });
  const p=await entrar(ctx);
  await p.evaluate(()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show'));
   data.modoCompleto=true; try{ aplicarModulos(); }catch(e){}
   data.products=[{id:'pk',name:'Poker',price:3800,stock:50,favorite:true},{id:'ag',name:'Águila',price:4000,stock:50,favorite:true},{id:'xs',name:'<img src=x onerror="window.__xss=1">',price:1000}];
   data.tables={1:{items:[{productId:'pk',name:'Poker',price:3800,qty:2,personId:null,history:[]}],people:[],payments:[]},2:{items:[],people:[],payments:[]}};
   saveData(); renderMesas(); openTableModal(1); });
  await p.waitForTimeout(500);
  const L=await p.evaluate(()=>{
   const s=document.getElementById('addProductSearch'), per=document.getElementById('personasToggle'), m=document.querySelector('#overlay .modal');
   const r=s.getBoundingClientRect(), el=document.elementFromPoint(r.left+r.width/3, r.top+r.height/2);
   const ico=['renameTableBtn','moveTableBtn','combinarMesaBtn','reiniciarMesaBtn'].map(id=>{ const e=document.getElementById(id), q=e.getBoundingClientRect(); return {id,h:q.height,w:q.width,vis:q.height>0&&getComputedStyle(e).display!=='none'}; });
   return { antes: !!(s.compareDocumentPosition(per) & Node.DOCUMENT_POSITION_FOLLOWING), top:r.top, bottom:r.bottom, alto:innerHeight, scroll:m.scrollTop, tapado: !(el===s || s.parentNode.contains(el)),
     ico, foco: document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName) ? document.activeElement.id : '',
     cliente: document.getElementById('clienteRow').offsetHeight, persona: document.getElementById('personNameInput').offsetHeight, ayuda: document.querySelector('.persona-hint').offsetHeight,
     sub: document.getElementById('modalSub').textContent, total: document.getElementById('mesaTotal').hidden ? '' : document.getElementById('mesaTotalV').textContent };
  });
  chk('El buscador de productos va ANTES que «Personas»', L.antes);
  chk('El buscador se ve sin desplazar (390×844)', L.scroll===0 && L.top>=0 && L.bottom<=L.alto && !L.tapado, JSON.stringify(L));
  chk('✏️ 🔀 🔗 ♻️ son botones chicos (≤ 40 px) y visibles', L.ico.every(i=>i.vis && i.h<=40 && i.w<=40), JSON.stringify(L.ico));
  chk('Al abrir la mesa no se abre el teclado', !L.foco, L.foco);
  chk('Nombre del cliente y agregar persona quedan plegados (sin ayuda a la vista)', L.cliente===0 && L.persona===0 && L.ayuda===0, JSON.stringify(L));
  chk('Encabezado con estado y total debajo de los productos', /Cuenta abierta · 2 productos/.test(L.sub) && L.total==='$7.600', L.sub+' | '+L.total);
  // Acciones del encabezado: cada una abre lo suyo
  await p.click('#renameTableBtn'); await p.waitForTimeout(250);
  chk('✏️ abre «Renombrar»', await p.evaluate(()=>document.getElementById('renameOverlay').classList.contains('show')));
  await p.click('#renameCancelBtn'); await p.waitForTimeout(200);
  await p.click('#moveTableBtn'); await p.waitForTimeout(250);
  chk('🔀 abre «Cambiar de mesa»', await p.evaluate(()=>{ const o=document.getElementById('movOverlay'); return !!o && o.classList.contains('show'); }));
  await p.evaluate(()=>document.getElementById('movOverlay').classList.remove('show'));
  await p.click('#combinarMesaBtn'); await p.waitForTimeout(250);
  chk('🔗 abre «Combinar»', await p.evaluate(()=>{ const o=document.getElementById('grupoOv'); return !!o && o.classList.contains('show'); }));
  await p.evaluate(()=>document.getElementById('grupoOv').classList.remove('show'));
  await p.click('#reiniciarMesaBtn'); await p.waitForTimeout(250);
  chk('♻️ abre «Reiniciar»', await p.evaluate(()=>{ const o=document.getElementById('reinicioOv'); return !!o && o.classList.contains('show'); }));
  await p.evaluate(()=>document.getElementById('reinicioOv').classList.remove('show'));
  chk('Ya no hay botones grandes de Combinar/Reiniciar en la mesa', await p.evaluate(()=>!document.querySelector('#grupoBar [data-g="combinar"], #grupoBar [data-g="reiniciar"]')));
  // Agregar por el buscador: tocar el producto deja la cantidad en 1 y «Agregar» lo anota
  await p.click('#addProductSearch'); await p.keyboard.type('pok'); await p.waitForTimeout(200);
  await p.click('#addProductSuggestions .product-suggestion-item'); await p.waitForTimeout(100);
  chk('Al elegir el producto la cantidad queda en 1', await p.evaluate(()=>document.getElementById('addQty').value==='1'));
  await p.click('#addItemBtn'); await p.waitForTimeout(200);
  chk('Agregar por el buscador funciona', await p.evaluate(()=>data.tables[1].items.find(i=>i.productId==='pk').qty===3));
  // Enter («Ir» del teclado) con el buscador VACÍO solo cierra el teclado: no agrega nada
  const antesVacio = await p.evaluate(()=>(data.tables[1].items||[]).reduce((s,i)=>s+i.qty,0));
  await p.click('#addProductSearch'); await p.fill('#addProductSearch',''); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  chk('Enter con el buscador vacío no agrega ningún producto', await p.evaluate(n=>(data.tables[1].items||[]).reduce((s,i)=>s+i.qty,0)===n, antesVacio));
  // Enter: toma el primero de la lista y lo agrega
  await p.click('#addProductSearch'); await p.keyboard.type('agu'); await p.waitForTimeout(150); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  chk('Enter agrega el primer producto y limpia el buscador', await p.evaluate(()=>{ const a=data.tables[1].items.find(i=>i.productId==='ag'); return a && a.qty===1 && document.getElementById('addProductSearch').value===''; }));
  // Favoritos: botones de un toque
  await p.click('#favChips .fav-chip[data-id="ag"]'); await p.waitForTimeout(200);
  chk('Favorito con un toque (es un botón)', await p.evaluate(()=>data.tables[1].items.find(i=>i.productId==='ag').qty===2 && document.querySelector('#favChips .fav-chip').tagName==='BUTTON'));
  // Datos escapados: un nombre con HTML no se ejecuta
  await p.click('#addProductSearch'); await p.keyboard.type('img'); await p.waitForTimeout(150); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  chk('Nombres con HTML se muestran como texto (sin ejecutar nada)', await p.evaluate(()=>!window.__xss && data.tables[1].items.some(i=>i.productId==='xs') && /<img/.test(document.getElementById('itemsContainer').textContent)));
  // Personas: plegable
  await p.click('#personasToggle'); await p.waitForTimeout(150);
  chk('«Personas» se despliega con el campo y la ayuda', await p.evaluate(()=>document.getElementById('personNameInput').offsetHeight>0 && document.querySelector('.persona-hint').offsetHeight>0 && document.getElementById('personasToggle').getAttribute('aria-expanded')==='true'));
  await p.fill('#personNameInput','Ana'); await p.click('#addPersonBtn'); await p.waitForTimeout(200);
  chk('Agregar persona funciona y el contador la muestra', await p.evaluate(()=>data.tables[1].people.length===1 && data.tables[1].people[0].name==='Ana' && /1/.test(document.getElementById('personasN').textContent) && document.querySelectorAll('#peopleChips .chip').length===1));
  // Nombre del cliente: plegable discreto
  await p.click('#clienteToggle'); await p.waitForTimeout(150);
  await p.fill('#clienteNombre','Jaime'); await p.click('#clienteGuardar'); await p.waitForTimeout(200);
  chk('Nombre del cliente desde su plegable', await p.evaluate(()=>data.tables[1].name==='Jaime' && document.getElementById('modalTitle').textContent==='Jaime' && /Jaime/.test(document.getElementById('clienteN').textContent)));
  // Al volver a abrir, todo lo secundario arranca plegado otra vez
  await p.evaluate(()=>{ document.getElementById('closeModalBtn').click(); openTableModal(1); }); await p.waitForTimeout(200);
  chk('Al reabrir, lo secundario vuelve a estar plegado', await p.evaluate(()=>document.getElementById('personNameInput').offsetHeight===0 && document.getElementById('clienteRow').offsetHeight===0));
  // Mesero (no administrador): no ve el icono de reiniciar (solo un administrador puede)
  await p.evaluate(()=>{ window.__adm=window.authIsAdmin; window.authIsAdmin=()=>false; openTableModal(1); });
  chk('Mesero: sin ♻️ Reiniciar; ✏️ 🔀 🔗 siguen', await p.evaluate(()=>document.getElementById('reiniciarMesaBtn').offsetHeight===0 && document.getElementById('renameTableBtn').offsetHeight>0 && document.getElementById('combinarMesaBtn').offsetHeight>0));
  await p.evaluate(()=>{ window.authIsAdmin=window.__adm; });
  await ctx.close(); }

 // ---------------- 2) Computador (1440×900): se ve bien y los iconos van en la línea del nombre ----------------
 { const ctx=await b.newContext({viewport:{width:1440,height:900}});
  await ctx.addInitScript(()=>{ localStorage.setItem('cm-tutorial-seen','1'); localStorage.setItem('vento-hola','0'); });
  const p=await entrar(ctx);
  await p.evaluate(()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show'));
   data.products=[{id:'pk',name:'Poker',price:3800,stock:50,favorite:true}]; data.tables={1:{items:[],people:[],payments:[]}}; saveData(); renderMesas(); openTableModal(1); });
  await p.waitForTimeout(400);
  const D=await p.evaluate(()=>{ const h=document.getElementById('modalTitle').getBoundingClientRect(), i=document.getElementById('renameTableBtn').getBoundingClientRect(), s=document.getElementById('addProductSearch').getBoundingClientRect(), m=document.querySelector('#overlay .modal').getBoundingClientRect();
   return { misma: Math.abs((h.top+h.height/2)-(i.top+i.height/2))<14, sVis: s.top>0 && s.bottom<innerHeight, ancho: Math.round(m.width), dentro: i.right<=m.right && s.right<=m.right, sub: document.getElementById('modalSub').textContent }; });
  chk('Computador: iconos en la línea del nombre, buscador visible y nada se sale', D.misma && D.sVis && D.dentro && D.ancho>=440, JSON.stringify(D));
  chk('Mesa libre: el estado lo dice', /Libre/.test(D.sub), D.sub);
  chk('Computador: al abrir la mesa no se enfoca nada solo', await p.evaluate(()=>!/INPUT|TEXTAREA/.test((document.activeElement||{}).tagName||'')));
  // Escribir con la mesa abierta va directo al buscador (sin hacer clic) y Enter lo agrega
  await p.keyboard.type('pok'); await p.waitForTimeout(200);
  chk('Computador: escribir va directo al buscador', await p.evaluate(()=>document.activeElement.id==='addProductSearch' && document.getElementById('addProductSearch').value==='pok' && document.querySelectorAll('#addProductSuggestions .product-suggestion-item').length===1), await p.evaluate(()=>document.activeElement.id+' '+document.getElementById('addProductSearch').value));
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  chk('Computador: Enter lo agrega a la mesa', await p.evaluate(()=>(data.tables[1].items[0]||{}).qty===1));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  chk('Computador: Esc sigue cerrando la mesa', await p.evaluate(()=>!document.getElementById('overlay').classList.contains('show')));
  await ctx.close(); }

 // ---------------- 2b) Celular angosto (360×640): todo cabe sin partirse ----------------
 { const ctx=await b.newContext({viewport:{width:360,height:640}, hasTouch:true, isMobile:true});
  await ctx.addInitScript(()=>{ localStorage.setItem('cm-tutorial-seen','1'); localStorage.setItem('vento-hola','0'); });
  const p=await entrar(ctx);
  await p.evaluate(()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show'));
   data.modoCompleto=true; try{ aplicarModulos(); }catch(e){}
   data.products=[{id:'pk',name:'Poker',price:3800,stock:50,favorite:true},{id:'ag',name:'Águila',price:4000,stock:50,favorite:true},{id:'cc',name:'Club Colombia',price:4500,stock:50,favorite:true},{id:'cr',name:'Corona',price:6000,stock:50,favorite:true}];
   data.tables={1:{name:'Jaime Andrés',items:[],people:[{id:'p1',name:'Ana'},{id:'p2',name:'Beto'}],payments:[]}}; saveData(); renderMesas(); openTableModal(1); });
  await p.waitForTimeout(400);
  const N=await p.evaluate(()=>{ const r=id=>document.getElementById(id).getBoundingClientRect(), s=r('addProductSearch'), a=r('addItemBtn'), pt=r('personasToggle'), ct=r('clienteToggle'), m=document.querySelector('#overlay .modal').getBoundingClientRect(), f=document.getElementById('favChips');
   return { sVis: s.top>=0 && s.bottom<=innerHeight, agregarAlto: Math.round(a.height), unaLinea: Math.abs(pt.top-ct.top)<2, dentro: pt.left>=m.left && ct.right<=m.right, cabe: [...document.querySelectorAll('#overlay .mesa-pleg-btn')].every(b=>b.scrollWidth<=b.clientWidth+1),
    personas: document.getElementById('personasN').textContent, cliente: document.getElementById('clienteN').textContent, desliza: f.classList.contains('desliza') }; });
  chk('360 px: el buscador se ve sin desplazar y «Agregar» va en una sola línea', N.sVis && N.agregarAlto<=50, JSON.stringify(N));
  chk('360 px: «Personas» y «Cliente» en una línea, sin salirse ni cortarse', N.unaLinea && N.dentro && N.cabe && N.personas==='2' && N.cliente==='Jaime Andrés', JSON.stringify(N));
  chk('360 px: si los favoritos no caben, el borde se desvanece para deslizar', N.desliza, JSON.stringify(N));
  await ctx.close(); }

 // ---------------- 3) Micrófono en la APK simulada con «Hola Vento» escuchando ----------------
 { const ctx=await b.newContext({viewport:{width:390,height:844}, hasTouch:true, isMobile:true});
  await ctx.addInitScript(()=>{
   // La APK no trae speechSynthesis: Vento habla con la voz de Android (A.hablar / A.callar)
   try{ Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true,writable:true}); }catch(e){}
   window.__ini=0; window.__cancel=0; window.__callar=0; window.__hablar=0; window.__ttsLargo=false; window.__iniT=[];
   const V=()=>window.__ventoVoz;
   window.VentoAndroid={ info:()=>'{}', guardarArchivo(){}, fondo:()=>true, fondoActivar(){}, notificar(){return true;}, avisosEstado:()=>'{"prendidos":true}', buscarTVs(){}, lounge(){}, pararTV(){}, vozPreparar(){},
    permisos:()=>'{"microfono":true,"camara":false,"avisos":true,"bateria":false,"fondo":true}', pedirPermisos(){}, vozSilencio(){},
    hablar(){ window.__hablar++; if(!window.__ttsLargo) setTimeout(()=>window.__ventoHabla&&window.__ventoHabla('end'),120); },
    callar(){ window.__callar++; },
    vozIniciar(){ window.__ini++; window.__iniT.push(performance.now()); setTimeout(()=>V()('start',{}),50); },
    vozParar(){ setTimeout(()=>V()('end',{}),30); }, vozCancelar(){ window.__cancel++; setTimeout(()=>V()('end',{}),30); } };
   window.__dice=(t,fin)=>V()('result',{alts:[{t,c:0.9}],final:fin!==false});
   window.__fin=()=>V()('end',{});
   localStorage.setItem('cm-tutorial-seen','1');
  });
  const p=await entrar(ctx);
  await p.evaluate(()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); window.speakVoice=()=>{};
   window.__toasts=[]; const s=window.showToast; window.showToast=(m,ms)=>{window.__toasts.push([performance.now(),String(m)]); s(m,ms);};
   document.addEventListener('click',e=>{ if(e.target.closest && e.target.closest('#voiceFab')) window.__toque=performance.now(); },true);
   data.products=[{id:'pk',name:'Poker',price:3800,stock:50}]; for(let i=1;i<=3;i++) data.tables[i]={items:[],people:[]}; saveData(); });
  const q=(m)=>p.evaluate(m=>(data.tables[m].items||[]).reduce((s,i)=>s+i.qty,0),m);
  const listoHola=async()=>{ for(let i=0;i<40;i++){ if(await p.evaluate(()=>window.ventoHola.estado().corriendo && !voiceListening)) { await p.waitForTimeout(150); return true; } await p.waitForTimeout(150); } return false; };
  const tocar=()=>p.evaluate(()=>{ window.__toasts=[]; window.__a={ini:window.__ini,cancel:window.__cancel,callar:window.__callar}; document.getElementById('voiceFab').click(); });
  chk('APK: «Hola Vento» está escuchando', await listoHola());
  // a) tocar mientras «Hola Vento» escucha: se toma su micrófono abierto, sin cerrarlo ni volverlo a abrir
  await tocar(); await p.waitForTimeout(250);
  const A1=await p.evaluate(()=>{ const h=window.__toasts.find(t=>/Habla ahora/.test(t[1])); return { ms: h ? h[0]-window.__toque : 9999, ini: window.__ini-window.__a.ini, cancel: window.__cancel-window.__a.cancel, escuchando: voiceListening && document.getElementById('voiceFab').classList.contains('listening'), abriendo: window.__toasts.some(t=>/Abriendo/.test(t[1])) }; });
  chk('APK + «Hola Vento»: escucha al instante (< 150 ms del toque a «Habla ahora»)', A1.ms<150 && A1.escuchando, JSON.stringify(A1));
  chk('APK + «Hola Vento»: no cierra ni reabre el micrófono de Android y no dice «Abriendo…»', A1.ini===0 && A1.cancel===0 && !A1.abriendo, JSON.stringify(A1));
  await p.waitForTimeout(250);   // la persona empieza a hablar después de tocar
  await p.evaluate(()=>{ __dice('mesa 2 una poker'); __fin(); }); await p.waitForTimeout(1200);
  chk('APK: lo que se dice después del toque se anota (mesa 2)', (await q(2))===1);
  // b) «Hola Vento» ya había oído charla: lo de antes del toque no entra al pedido
  chk('APK: «Hola Vento» vuelve a escuchar solo', await listoHola());
  await p.evaluate(()=>__dice('la mesa 1 está sucia', false)); await p.waitForTimeout(100);
  await tocar(); await p.waitForTimeout(450);
  await p.evaluate(()=>{ __dice('la mesa 1 está sucia mesa 3 dos poker', false); __dice('la mesa 1 está sucia mesa 3 dos poker'); __fin(); }); await p.waitForTimeout(1200);
  chk('APK: la charla de antes del toque se descarta (mesa 3 = 2, mesa 1 nada)', (await q(3))===2 && (await q(1))===0, JSON.stringify(await p.evaluate(()=>[data.tables[1].items,data.tables[3].items])));
  // c) la escucha tomada se cierra por silencio antes de hablar: se reabre sola, sin «No escuché nada»
  chk('APK: «Hola Vento» otra vez listo', await listoHola());
  await tocar(); await p.waitForTimeout(400);
  await p.evaluate(()=>{ window.__ventoVoz('error',{error:'no-speech'}); window.__ventoVoz('end',{}); }); await p.waitForTimeout(200);
  const C1=await p.evaluate(()=>({ ini: window.__ini-window.__a.ini, escuchando: voiceListening, noEscuche: window.__toasts.some(t=>/No escuché/.test(t[1])) }));
  chk('APK: si Android cierra la escucha antes de hablar, se reabre sola (1 vez) sin «No escuché nada»', C1.ini===1 && C1.escuchando && !C1.noEscuche, JSON.stringify(C1));
  await p.evaluate(()=>{ __dice('mesa 2 una poker'); __fin(); }); await p.waitForTimeout(1200);
  chk('APK: y lo que se dice se anota', (await q(2))===2);
  // «Producto por voz» (Productos): también toma el micrófono de «Hola Vento» en vez de pelearlo
  chk('APK: «Hola Vento» listo antes de «Producto por voz»', await listoHola());
  await p.evaluate(()=>{ window.__a={ini:window.__ini,cancel:window.__cancel}; startVoiceProductCreation(); }); await p.waitForTimeout(150);
  const P1=await p.evaluate(()=>({ ini: window.__ini-window.__a.ini, cancel: window.__cancel-window.__a.cancel, hola: window.ventoHola.estado().corriendo, escuchando: voiceProductListening }));
  chk('APK: «Producto por voz» toma el micrófono abierto (sin reabrirlo) y «Hola Vento» se aparta', P1.ini===0 && P1.cancel===0 && !P1.hola && P1.escuchando, JSON.stringify(P1));
  await p.waitForTimeout(250);
  await p.evaluate(()=>{ __dice('agregar producto Club Colombia precio cinco mil'); __fin(); }); await p.waitForTimeout(800);
  chk('APK: «Producto por voz» crea el producto (con el nombre completo)', await p.evaluate(()=>data.products.some(x=>/^club colombia$/i.test(x.name) && x.price===5000)), await p.evaluate(()=>JSON.stringify(data.products.map(x=>x.name+':'+x.price))));
  const PV=await p.evaluate(()=>[['Águila precio cuatro mil','aguila',4000],['corona a 6000','corona',6000],['poker por 3800','poker',3800],['pizza a la carta a 12000','pizza a la carta',12000]].map(([t,n,v])=>{ const r=parseVoiceProductCreation(t); return r.name===n && r.price===v ? '' : t+' → '+JSON.stringify(r); }).filter(Boolean));
  chk('Nombres que terminan en «a» no pierden la letra al dictar el precio', !PV.length, PV.join(' | '));
  // d) Vento está hablando (sin «Hola Vento»): al tocar se calla y escucha YA, sin esperar ni reintentar
  await p.evaluate(()=>window.ventoHola.apagar()); await p.waitForTimeout(300);
  await p.evaluate(()=>{ window.__ttsLargo=true; window.ventoHablar('Listo, te anoté dos poker en la mesa tres y ya va saliendo'); });
  chk('APK: Vento está hablando', await p.evaluate(()=>window.speechSynthesis.speaking===true));
  await tocar(); await p.waitForTimeout(1500);
  const D1=await p.evaluate(()=>{ const h=window.__toasts.find(t=>/Habla ahora/.test(t[1])); return { alStart: window.__iniT.length ? window.__iniT[window.__iniT.length-1]-window.__toque : 9999, ini: window.__ini-window.__a.ini, callar: window.__callar-window.__a.callar, habla: window.speechSynthesis.speaking, ms: h ? h[0]-window.__toque : 9999, abriendo: window.__toasts.some(t=>/Abriendo/.test(t[1])) }; });
  chk('APK hablando: el micrófono abre al instante (< 150 ms del toque a rec.start) y Vento se calla', D1.alStart<150 && D1.callar>=1 && !D1.habla, JSON.stringify(D1));
  chk('APK hablando: una sola apertura (sin reintentos) y sin «Abriendo…» si abre rápido', D1.ini===1 && !D1.abriendo && D1.ms<400, JSON.stringify(D1));
  await p.evaluate(()=>{ __dice('mesa 1 una poker'); __fin(); }); await p.waitForTimeout(1200);
  chk('APK hablando: el pedido se anota', (await q(1))===1);
  await ctx.close(); }

 // ---------------- 4) Navegador con «Hola Vento» escuchando: del toque a rec.start() ----------------
 { const ctx=await b.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(()=>{
   window.__inst=[]; window.__startT=[];
   function F(){ this.onresult=this.onend=this.onerror=this.onstart=null; this._res=[]; window.__inst.push(this); }
   F.prototype.start=function(){ if(window.__act && window.__act!==this) throw new Error('busy'); window.__act=this; window.__startT.push([performance.now(),this]); this._res=[]; setTimeout(()=>this.onstart&&this.onstart({}),10); };
   F.prototype.stop=F.prototype.abort=function(){ if(window.__act===this){ window.__act=null; setTimeout(()=>this.onend&&this.onend({}),10);} };
   window.SpeechRecognition=window.webkitSpeechRecognition=F;
   localStorage.setItem('cm-tutorial-seen','1');
  });
  const p=await entrar(ctx);
  await p.evaluate(()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); data.products=[{id:'pk',name:'Poker',price:4000,stock:50}]; data.tables={1:{items:[],people:[]}}; saveData(); renderMesas();
   document.addEventListener('click',e=>{ if(e.target.closest && e.target.closest('#voiceFab')) window.__toque=performance.now(); },true); });
  await p.mouse.click(200,300); await p.waitForTimeout(2500);
  chk('Navegador: «Hola Vento» escuchando', await p.evaluate(()=>window.ventoHola.estado().corriendo && !!window.__act));
  await p.evaluate(()=>document.getElementById('voiceFab').click()); await p.waitForTimeout(200);
  const B1=await p.evaluate(()=>{ const s=window.__startT.find(x=>x[1]===voiceRecognizer); return { ms: s ? s[0]-window.__toque : 9999, toma: window.__act===voiceRecognizer }; });
  chk('Navegador + «Hola Vento»: del toque a rec.start() < 150 ms', B1.ms<150 && B1.toma, JSON.stringify(B1));
  await ctx.close(); }

 chk('Sin errores', !errs.length, errs.join('|'));
 console.log('RESULTADO',ok,'bien',mal,'mal'); await b.close(); process.exit(mal?1:0); })();
