const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const crypto=require('crypto'); const fs=require('fs');
(async()=>{
 const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
 const priv = privateKey.export({ format: 'jwk' }), pub = publicKey.export({ format: 'jwk' });
 const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'),'utf8').replace(/const LIC_PUB = \{[^}]*\};/, 'const LIC_PUB = '+JSON.stringify({kty:'EC',crv:'P-256',x:pub.x,y:pub.y})+';');
 const b=await chromium.launch(); let ok=0, mal=0; const chk=(n,c,x)=>{ if(c){ok++;console.log('✅ '+n);} else {mal++;console.log('❌ '+n+(x?' → '+x:''));} };
 const ctx=await b.newContext({viewport:{width:390,height:844}});
 await ctx.route('**/*', r=>{ const u=new URL(r.request().url()); if(u.hostname!=='localhost') return r.abort(); if(/\/index\.html$/.test(u.pathname)) return r.fulfill({body:html,contentType:'text/html'}); return r.continue(); });
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(2500);
 await p.fill('#authBiz','Bar'); await p.fill('#authUser','ana'); await p.fill('#authPass','clave123'); await p.click('#authBtn'); await p.waitForTimeout(1500);
 await p.click('#onbSaltar').catch(()=>{}); await p.evaluate(()=>{ localStorage.setItem('cm-tutorial-seen','1'); document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); });
 await p.waitForTimeout(1500);
 let st = await p.evaluate(()=>ventoPlan());
 chk('Negocio nuevo: prueba gratis de 15 días', st.k==='prueba' && st.dias===15, JSON.stringify(st));
 chk('Se ve la barra de la prueba', await p.evaluate(()=>{ const b=document.getElementById('subBar'); return b && !b.hidden && /Prueba gratis/.test(b.textContent); }));
 // Borrar todo bloqueado para el suscriptor
 const toasts=[]; await p.exposeFunction('__t', m=>toasts.push(m)); await p.evaluate(()=>{ const s=window.showToast; window.showToast=(m,ms)=>{ window.__t(String(m)); s(m,ms); }; });
 await p.evaluate(()=>{ document.querySelector('nav button[data-view="ajustes"]').click(); });
 await p.evaluate(()=>document.getElementById('resetAllBtn').click()); await p.waitForTimeout(300);
 chk('«Restablecer todo» bloqueado: solo el proveedor', toasts.some(t=>/Solo el proveedor/.test(t)), toasts.join('|'));
 const dlgAbierto = await p.evaluate(()=>!!document.querySelector('.overlay.show'));
 chk('…y no se abrió la confirmación de borrar', !dlgAbierto);
 // Vender en la prueba funciona
 const vende = async()=>p.evaluate(async()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); data.products=[{id:'pk',name:'Poker',price:3800,stock:50}]; data.tables[1]={items:[],people:[]}; saveData(); openTableModal(1);
   document.getElementById('addProductSearch').value='Poker'; document.getElementById('addProductId').value='pk'; document.getElementById('addQty').value='2'; document.getElementById('addItemBtn').click(); await new Promise(r=>setTimeout(r,200)); return (data.tables[1].items[0]||{}).qty||0; });
 chk('En la prueba se vende normal', await vende()===2);
 // Se vence la prueba
 await p.evaluate(()=>{ const t=Date.now()-20*864e5; localStorage.setItem('vento-prueba-desde', String(t)); data.pruebaDesde=t; saveData(); subAplicar(); });
 st = await p.evaluate(()=>ventoPlan());
 chk('Pasados 15 + 3 días sin pagar: vencida', st.k==='vencida', JSON.stringify(st));
 chk('Vencida: no deja vender (abre el aviso de renovar)', await vende()===0 && await p.evaluate(()=>document.getElementById('subOverlay').classList.contains('show')));
 chk('Vencida: los datos siguen ahí (productos y mesas)', await p.evaluate(()=>data.products.length===1 && !!data.tables[1]));
 const cod = await p.evaluate(()=>codigoNegocio());
 // Licencia de suscripción creada con licencias.html
 const b64u=x=>Buffer.from(x).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const firmar=p=>{ const pl=b64u(JSON.stringify(p)); const sig=crypto.sign('sha256', Buffer.from(pl), { key: privateKey, dsaEncoding: 'ieee-p1363' }); return 'http://localhost:8765/index.html#licencia='+pl+'.'+b64u(sig); };
 const linkSub = firmar({ d: cod, t: Date.now(), m: 1, pl: 'Pro', v: Date.now() + 31*864e5 });
 chk('Se crea el link de suscripción', /#licencia=/.test(linkSub), linkSub.slice(0,80));
 await p.evaluate(l=>{ location.hash = l.split('#')[1]; }, linkSub); await p.waitForTimeout(1500);
 st = await p.evaluate(()=>ventoPlan());
 chk('Al abrir el link: suscripción activa (plan Pro, ~1 mes)', st.k==='activa' && st.plan==='Pro' && st.dias>=28, JSON.stringify(st));
 chk('Activa: vuelve a vender', await vende()===2);
 chk('La suscripción queda en los datos del negocio (sirve en los demás celulares)', await p.evaluate(()=>Array.isArray(data.licencias) && data.licencias.length===1));
 toasts.length=0; await p.evaluate(()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); document.getElementById('resetAllBtn').click(); }); await p.waitForTimeout(300);
 chk('Suscriptor activo: igual NO puede borrar todo', toasts.some(t=>/Solo el proveedor/.test(t)));
 // Otro celular del mismo negocio (mesero): recibe los datos y queda activo
 const datos = await p.evaluate(()=>JSON.stringify(data));
 // Licencia para otro negocio no sirve
 const linkOtro = firmar({ d: 'ZZZZ-9999', t: Date.now(), m: 1 });
 const ok2 = await p.evaluate(async l=>await licActivar(l.split('#licencia=')[1], true), linkOtro);
 chk('Un código de OTRO negocio no se acepta', ok2===false);
 // Proveedor
 const eqp = await p.evaluate(()=>codigoEquipo());
 const linkProv = firmar({ d: eqp, t: Date.now(), r: 'proveedor' });
 await p.evaluate(l=>{ location.hash = l.split('#')[1]; }, linkProv); await p.waitForTimeout(1500);
 st = await p.evaluate(()=>ventoPlan());
 chk('Licencia de proveedor: control total', st.k==='proveedor', JSON.stringify(st));
 toasts.length=0; await p.evaluate(()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); document.getElementById('resetAllBtn').click(); }); await p.waitForTimeout(400);
 chk('El proveedor sí puede «Restablecer todo» (le pide confirmar)', !toasts.some(t=>/Solo el proveedor/.test(t)) && await p.evaluate(()=>!!document.querySelector('.overlay.show')));
 await p.evaluate(()=>document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')));
 chk('El proveedor ve el enlace a Vento Admin', await p.evaluate(()=>!document.getElementById('subLicLink').hidden));
 // Firma falsificada
 const falso = await p.evaluate(async()=>{ const pl=btoa(JSON.stringify({d:codigoNegocio(),m:1,v:Date.now()+9e10})).replace(/=+$/,''); return await licActivar(pl+'.'+'A'.repeat(86), true); });
 chk('Un código inventado (sin la llave privada) no sirve', falso===false);
 // Celular del mesero
 const p2=await ctx.newPage(); await p2.goto('http://localhost:8765/index.html'); await p2.waitForTimeout(2000);
 st = await p2.evaluate(async d=>{ localStorage.clear(); data=JSON.parse(d); data.pruebaDesde=Date.now()-40*864e5; await licCargar(); return ventoPlan(); }, datos);
 chk('Otro celular con los datos del negocio: suscripción activa (no proveedor)', st.k==='activa', JSON.stringify(st));
 chk('Sin errores', !errs.length, errs.join(' | '));
 console.log('RESULTADO', ok, 'bien', mal, 'mal'); await b.close(); process.exit(mal?1:0);
})();
