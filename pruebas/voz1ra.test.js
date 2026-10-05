const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async()=>{ const b=await chromium.launch(); let ok=0,mal=0; const chk=(n,c,x)=>{ if(c){ok++;console.log('✅ '+n);} else {mal++;console.log('❌ '+n+(x?' → '+x:''));} };
 const ctx=await b.newContext({viewport:{width:390,height:844}});
 await ctx.route('**/*', r=>{const u=new URL(r.request().url()); return u.hostname==='localhost'?r.continue():r.abort();});
 await ctx.addInitScript(()=>{
  window.__prep=0; window.__escena='parcial';
  window.VentoAndroid={ info:()=>'{}', hablar(){}, callar(){}, guardarArchivo(){}, fondo:()=>true, fondoActivar(){}, notificar(){return true;}, avisosEstado:()=>'{"prendidos":true}', buscarTVs(){}, lounge(){}, pararTV(){},
   vozPreparar(){ window.__prep++; },
   vozIniciar(){ const V=()=>window.__ventoVoz; setTimeout(()=>V()('start',{}),1500);   // reconocedor frío: tarda 1,5 s
     if(window.__escena==='parcial'){ setTimeout(()=>V()('result',{alts:[{t:'mesa 1 una poker',c:0.8}],final:false}),2600); setTimeout(()=>{ V()('error',{error:'no-speech'}); V()('end',{}); },4200); }
     else { setTimeout(()=>V()('result',{alts:[{t:'mesa 2 dos poker',c:0.9}],final:true}),2600); setTimeout(()=>V()('end',{}),2700); } },
   vozParar(){}, vozCancelar(){ setTimeout(()=>window.__ventoVoz('end',{}),10); } };
  localStorage.setItem('cm-tutorial-seen','1');
 });
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto((process.env.VENTO_BASE||'http://localhost:8765')+'/index.html'); await p.waitForTimeout(2500);
 await p.fill('#authBiz','Bar'); await p.fill('#authUser','ana'); await p.fill('#authPass','clave123'); await p.click('#authBtn'); await p.waitForTimeout(1500);
 await p.click('#onbSaltar').catch(()=>{});
 await p.evaluate(()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); window.speakVoice=()=>{}; window.__toasts=[]; const s=window.showToast; window.showToast=(m,ms)=>{window.__toasts.push(String(m)); s(m,ms);};
   data.products=[{id:'pk',name:'Poker',price:3800,stock:50}]; for(let i=1;i<=3;i++) data.tables[i]={items:[],people:[]}; saveData(); });
 chk('El micrófono queda preparado al abrir la app', await p.evaluate(()=>window.__prep>=1));
 await p.evaluate(()=>startVoiceCommand(false)); await p.waitForTimeout(600);
 const t1=await p.evaluate(()=>window.__toasts.slice());
 chk('Al tocar dice «Abriendo el micrófono» (todavía no «Escuchando»)', t1.some(t=>/Abriendo el micr/.test(t)) && !t1.some(t=>/Habla ahora/.test(t)), t1.join('|'));
 await p.waitForTimeout(1200);
 chk('Cuando de verdad escucha: «Habla ahora»', await p.evaluate(()=>window.__toasts.some(t=>/Habla ahora/.test(t))));
 await p.waitForTimeout(3500);
 chk('Frase corta que Android solo dio como parcial: se anota a la PRIMERA', await p.evaluate(()=>(data.tables[1].items[0]||{}).qty===1), await p.evaluate(()=>JSON.stringify(data.tables[1].items)+' '+window.__toasts.join('|')));
 chk('No dice «No escuché nada»', await p.evaluate(()=>!window.__toasts.some(t=>/No escuché nada/.test(t))));
 await p.evaluate(()=>{ window.__escena='normal'; startVoiceCommand(false); }); await p.waitForTimeout(3500);
 chk('Caso normal sigue igual', await p.evaluate(()=>(data.tables[2].items[0]||{}).qty===2));
 chk('Sin errores', !errs.length, errs.join('|'));
 console.log('RESULTADO',ok,'bien',mal,'mal'); await b.close(); process.exit(mal?1:0); })();
