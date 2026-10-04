const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext();
 await ctx.route('**/*', r=>{const u=new URL(r.request().url()); return u.hostname==='localhost'?r.continue():r.abort();});
 const p=await ctx.newPage(); const e=[]; p.on('pageerror',x=>e.push(x.message));
 await p.goto('http://localhost:8765/index.html',{waitUntil:'load'}); await p.waitForTimeout(4000);
 const r=await p.evaluate(async()=>{ try{await enterApp('test',null);}catch(x){} window.speakVoice=()=>{};
   const toasts=[]; window.showToast=(m)=>{toasts.push(String(m));};
   data.products=[{id:'ag',name:'Cerveza Águila',price:4000,stock:50},{id:'pk',name:'Poker',price:3800,stock:50}];
   for(let k=1;k<=4;k++){ data.tables[k]={items:[],people:[]}; } window.currentTable=null; saveData();
   const desc=()=>Object.keys(data.tables).filter(k=>(data.tables[k].items||[]).length).map(k=>k+':'+data.tables[k].items.map(i=>i.name+'x'+i.qty).join(',')).join(' | ')||'(vacío)';
   const out=[];
   const frases=['mesa 3 dos poker','pon a María José en la mesa 3','siguiente canción','pon la canción despacito','mesa 2 dos poker','cuánto debe la mesa 3'];;
   for(const f of frases){ toasts.length=0; try{ await handleVoiceTranscript(f); }catch(x){ toasts.push('ERR '+x.message); }
     await new Promise(r=>setTimeout(r,300)); document.querySelectorAll('.overlay.show').forEach(o=>{ if(o.id!=='authOverlay') o.classList.remove('show'); });
     out.push(f+'  =>  '+desc()+' pag:'+JSON.stringify((data.tables[3].payments||[]).map(x=>x.amount+x.method[0]))+' per:'+(data.tables[3].people||[]).map(x=>x.name)+'   ['+toasts.join(' / ').slice(0,140)+']'); }
   return out; });
 console.log(r.join('\n')); console.log(e.join(' | ')||'sin errores'); await b.close(); })();
