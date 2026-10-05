const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async()=>{ const b=await chromium.launch(); let ok=0,mal=0; const chk=(n,c,x)=>{ if(c){ok++;console.log('✅ '+n);} else {mal++;console.log('❌ '+n+(x?' → '+x:''));} };
 const nuevo=async()=>{ const ctx=await b.newContext({viewport:{width:390,height:844}});
  await ctx.route('**/*', r=>{const u=new URL(r.request().url()); return u.hostname==='localhost'?r.continue():r.abort();});
  await ctx.addInitScript(()=>{ try{ localStorage.setItem('vento-hola','0'); }catch(e){} });
  const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message)); return p; };
 // 1. Negocio nuevo
 let p=await nuevo(); await p.goto((process.env.VENTO_BASE||'http://localhost:8765')+'/index.html'); await p.waitForTimeout(2500);
 await p.fill('#authBiz','Bar Nuevo'); await p.fill('#authUser','ana'); await p.fill('#authPass','clave123'); await p.click('#authBtn'); await p.waitForTimeout(1800);
 chk('Negocio nuevo: sale el asistente', await p.evaluate(()=>document.getElementById('onbOv')?.classList.contains('show')));
 for(let i=0;i<4;i++){ await p.click('#onbSig'); await p.waitForTimeout(400); }
 await p.waitForTimeout(3000);
 chk('Después del asistente NO sale el carrusel', await p.evaluate(()=>!document.getElementById('tutorialOverlay').classList.contains('show')));
 chk('Sale «Primeros pasos» con 1 de 5', await p.evaluate(()=>{ const e=document.getElementById('primerosPasos'); return !e.hidden && /1 de 5/.test(e.textContent); }), await p.evaluate(()=>document.getElementById('primerosPasos').textContent.slice(0,80)));
 await p.screenshot({path:require('os').tmpdir()+'/pp1.png'});
 await p.evaluate(()=>document.querySelector('nav button[data-view="productos"]').click()); await p.waitForTimeout(400);
 await p.evaluate(()=>document.querySelector('nav button[data-view="mesas"]').click()); await p.waitForTimeout(400);
 chk('Ver productos lo marca (2 de 5)', await p.evaluate(()=>/2 de 5/.test(document.getElementById('primerosPasos').textContent)));
 await p.evaluate(()=>{ const id=Object.keys(data.tables)[0]; data.tables[id].items.push({productId:data.products[0].id,name:data.products[0].name,price:data.products[0].price,qty:1,personId:null,history:[]}); saveData(); renderMesas(); }); await p.waitForTimeout(400);
 chk('Abrir una cuenta lo marca (3 de 5)', await p.evaluate(()=>/3 de 5/.test(document.getElementById('primerosPasos').textContent)));
 await p.evaluate(async()=>{ await handleVoiceTranscript('ayuda'); }); await p.waitForTimeout(400);
 await p.evaluate(()=>{ document.querySelectorAll('.overlay.show').forEach(o=>o.classList.remove('show')); renderMesas(); });
 chk('Usar la voz lo marca (4 de 5)', await p.evaluate(()=>/4 de 5/.test(document.getElementById('primerosPasos').textContent)));
 await p.evaluate(()=>{ data.history=[{t:Date.now(),total:3000,items:[]}]; saveData(); renderMesas(); }); await p.waitForTimeout(300);
 chk('Cobrar → «¡Vento quedó listo!»', await p.evaluate(()=>/quedó listo/.test(document.getElementById('primerosPasos').textContent)));
 await p.click('#primerosPasos .pp-x'); await p.waitForTimeout(300);
 chk('Cerrar la felicitación la oculta', await p.evaluate(()=>document.getElementById('primerosPasos').hidden));
 await p.evaluate(()=>window.ventoPasos.mostrar()); await p.waitForTimeout(300);
 chk('Ajustes → Primeros pasos la vuelve a mostrar', await p.evaluate(()=>!document.getElementById('primerosPasos').hidden));
 await p.evaluate(()=>{ document.getElementById('primerosPasos').hidden=false; window.ventoPasos.pintar(); }); const pc=await p.$('.pp-como'); if(pc){ await pc.click(); await p.waitForTimeout(300); } chk('«¿Cómo funciona?» abre el recorrido', await p.evaluate(()=>document.getElementById('tutorialOverlay').classList.contains('show') || !document.querySelector('.pp-como')));
 chk('Sin errores (nuevo)', !p.errs.length, p.errs.join('|'));
 // 2. Negocio que ya existía con ventas: no debe verla
 p=await nuevo(); await p.goto((process.env.VENTO_BASE||'http://localhost:8765')+'/index.html'); await p.waitForTimeout(2500);
 await p.fill('#authBiz','Bar Viejo'); await p.fill('#authUser','ana'); await p.fill('#authPass','clave123'); await p.click('#authBtn'); await p.waitForTimeout(1800);
 await p.click('#onbSaltar').catch(()=>{});
 await p.evaluate(()=>{ localStorage.removeItem('vento-pp-eval'); localStorage.removeItem('vento-pp-oculta'); data.history=[{t:Date.now(),total:5000,items:[]}]; saveData(); });
 await p.reload(); await p.waitForTimeout(2500);
 if(await p.$('#authPass')) { await p.fill('#authUser','ana').catch(()=>{}); await p.fill('#authPass','clave123').catch(()=>{}); await p.click('#authBtn').catch(()=>{}); await p.waitForTimeout(1800); }
 chk('Negocio con ventas: no ve la guía', await p.evaluate(()=>document.getElementById('primerosPasos').hidden));
 chk('Sin errores (existente)', !p.errs.length, p.errs.join('|'));
 // 3. Mesero no la ve
 chk('El mesero no la ve (CSS)', await p.evaluate(()=>{ document.body.classList.add('modo-mesero'); const e=document.getElementById('primerosPasos'); e.hidden=false; const v=getComputedStyle(e).display==='none'; document.body.classList.remove('modo-mesero'); return v; }));
 console.log('RESULTADO',ok,'bien',mal,'mal'); await b.close(); })();
