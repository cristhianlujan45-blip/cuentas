const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async()=>{ const b=await chromium.launch(); let ok=0,mal=0; const chk=(n,c,x)=>{ if(c){ok++;console.log('✅ '+n);} else {mal++;console.log('❌ '+n+(x?' → '+x:''));} };
 const ctx=await b.newContext({viewport:{width:390,height:844}});
 await ctx.route('**/*', r=>{const u=new URL(r.request().url()); return u.hostname==='localhost'?r.continue():r.abort();});
 await ctx.addInitScript(()=>{
  window.__ini=0; window.__mute=[];
  const V=()=>window.__ventoVoz;
  window.VentoAndroid={ info:()=>'{}', hablar(){}, callar(){}, guardarArchivo(){}, fondo:()=>true, fondoActivar(){}, notificar(){return true;}, avisosEstado:()=>'{"prendidos":true}', buscarTVs(){}, lounge(){}, pararTV(){}, vozPreparar(){},
   permisos:()=>'{"microfono":true,"camara":false,"avisos":true,"bateria":false,"fondo":true}', pedirPermisos(){ window.__pidio=1; },
   vozSilencio(x){ window.__mute.push(x); },
   vozIniciar(){ window.__ini++; setTimeout(()=>V()('start',{}),50); },
   vozParar(){ setTimeout(()=>V()('end',{}),30); }, vozCancelar(){ setTimeout(()=>V()('end',{}),30); } };
  window.__dice=(t)=>{ V()('result',{alts:[{t,c:0.9}],final:true}); };
  window.__fin=()=>V()('end',{});
  localStorage.setItem('cm-tutorial-seen','1');
 });
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto((process.env.VENTO_BASE||'http://localhost:8765')+'/index.html'); await p.waitForTimeout(2500);
 await p.fill('#authBiz','Bar'); await p.fill('#authUser','ana'); await p.fill('#authPass','clave123'); await p.click('#authBtn'); await p.waitForTimeout(1500);
 await p.click('#onbSaltar').catch(()=>{});
 await p.evaluate(()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); window.speakVoice=()=>{};
   data.products=[{id:'pk',name:'Poker',price:3800,stock:50}]; for(let i=1;i<=3;i++) data.tables[i]={items:[],people:[]}; saveData(); });
 await p.waitForTimeout(3500);
 const q=(m)=>p.evaluate(m=>(data.tables[m].items||[]).reduce((s,i)=>s+i.qty,0),m);
 chk('APK: «Hola Vento» abre el micrófono solo', await p.evaluate(()=>window.__ini>=1 && window.ventoHola.estado().corriendo));
 chk('APK: silencia el pitido mientras escucha', await p.evaluate(()=>window.__mute.includes(true)));
 await p.evaluate(()=>__dice('hola vento mesa 1 dos poker')); await p.waitForTimeout(1500);
 chk('APK: «hola vento mesa 1 dos poker» anota', (await q(1))===2);
 await p.waitForTimeout(800);
 chk('APK: vuelve a escuchar', await p.evaluate(()=>window.ventoHola.estado().corriendo));
 // tocar el botón mientras «Hola Vento» escucha
 await p.evaluate(()=>startVoiceCommand(false)); await p.waitForTimeout(400);
 chk('Botón: su escucha no se corta por el «terminé» de la anterior', await p.evaluate(()=>voiceListening===true));
 await p.evaluate(()=>{ __dice('mesa 2 una poker'); __fin(); }); await p.waitForTimeout(1500);
 chk('Botón: anota en la mesa 2', (await q(2))===1);
 await p.waitForTimeout(2500);
 chk('Después «Hola Vento» vuelve solo', await p.evaluate(()=>window.ventoHola.estado().corriendo));
 // permisos
 await p.evaluate(()=>{ try{ iniCast(); }catch(e){} });
 chk('Botón «Permisos del celular» visible con estado', await p.evaluate(()=>{ const b=document.getElementById('apkPermisos'), t=document.getElementById('apkPermisosTxt'); return b && !b.hidden && /Cámara/.test(t.textContent) && /Dar los permisos/.test(b.textContent); }));
 await p.evaluate(()=>document.getElementById('apkPermisos').click());
 chk('Pide los permisos a Android', await p.evaluate(()=>window.__pidio===1));
 chk('Sin errores', !errs.length, errs.join('|'));
 console.log('RESULTADO',ok,'bien',mal,'mal'); await b.close(); })();
