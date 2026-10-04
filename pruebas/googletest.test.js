const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async()=>{ const b=await chromium.launch(); let ok=0,mal=0; const chk=(n,c,x)=>{ if(c){ok++;console.log('✅ '+n);} else {mal++;console.log('❌ '+n+(x?' → '+x:''));} };
 const ctx=await b.newContext({viewport:{width:390,height:844}});
 await ctx.route('**/*', r=>{ const u=new URL(r.request().url());
   if(u.hostname==='localhost') return r.continue();
   if(/supabase\.co$/.test(u.hostname) && u.pathname==='/auth/v1/settings') return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({external:{google:true,email:true}})});
   return r.abort(); });
 await ctx.addInitScript(()=>{
   const q=()=>{ const o={ select(){return o;}, eq(){return o;}, order(){return o;}, limit(){return o;}, maybeSingle: async()=>({data:null}), then(f){ return Promise.resolve({data:[]}).then(f); } }; return o; };
   window.supabase={ createClient:()=>({ auth:{
     signInWithOAuth: async o=>{ window.__oauth=o; return {data:{}}; },
     setSession: async s=>{ window.__sesion=s; return {data:{user:{email:'Dueno@Gmail.com',user_metadata:{full_name:'Carlos Dueño'}}}}; },
     getSession: async()=>({data:{session:null}}), onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; } },
     from: ()=>q(), rpc: async()=>({data:[]}) }) };
 });
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(3500);
 chk('En la entrada aparece «Continuar con Google» (el servidor lo tiene activado)', await p.isVisible('#authGoogle'));
 await p.click('#authGoogle'); await p.waitForTimeout(800);
 const o=await p.evaluate(()=>window.__oauth);
 chk('Lleva a Google y vuelve a Vento', o && o.provider==='google' && /\?nubegoogle=1$/.test(o.options.redirectTo), JSON.stringify(o));
 // Simula la vuelta de Google
 await p.goto('http://localhost:8765/index.html?nubegoogle=1#access_token=TOK123&refresh_token=REF456&token_type=bearer&expires_in=3600'); await p.waitForTimeout(4000);
 chk('Al volver, la dirección queda limpia (el permiso no queda a la vista)', !/access_token/.test(p.url()) && !/nubegoogle/.test(p.url()), p.url());
 chk('Abre la sesión con ese permiso', await p.evaluate(()=>window.__sesion && window.__sesion.access_token==='TOK123' && window.__sesion.refresh_token==='REF456'));
 chk('Queda conectado con su Gmail y sigue con sus negocios', /dueno@gmail\.com/i.test(await p.evaluate(()=>{ const c=document.getElementById('nubeCuerpo'); return c?c.textContent:''; })), await p.evaluate(()=>{ const c=document.getElementById('nubeCuerpo'); return c?c.textContent.slice(0,120):'(sin panel)'; }));
  chk('No se confunde con un enlace de recuperar contraseña', await p.evaluate(()=>![...document.querySelectorAll('div')].some(d=>d.style.zIndex==='2147483100')));
 chk('Sin errores', !errs.length, errs.join('|'));
 console.log('RESULTADO',ok,'bien',mal,'mal'); await b.close(); process.exit(mal?1:0); })();
