/* V66: capa aditiva sobre V65. No reemplaza el motor de pedidos. */
(function(){
"use strict";
const C=Object.assign({api:window.LAYA_API||"/voice/command",key:window.LAYA_API_KEY||"",lang:"es-CO"},window.LAYA_VOICE_CONFIG||{});
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null, listening=false;
function msg(s){if(typeof window.toast==="function")return window.toast(s);const e=document.getElementById("toast")||document.getElementById("m");if(e)e.textContent=s;}
async function classify(text,context){
 const h={"Content-Type":"application/json"};if(C.key)h["X-Laya-Key"]=C.key;
 const r=await fetch(C.api,{method:"POST",headers:h,body:JSON.stringify({text,context:context||{}})});
 if(!r.ok)throw Error("Laya HTTP "+r.status);return r.json();
}
function mesLink(){try{return localStorage.getItem("mes_link")||""}catch(_){return""}}
function mesName(){try{return localStorage.getItem("mes_nombre")||""}catch(_){return""}}
async function sendMesero(command){
 const link=mesLink();if(!/^[a-z0-9]+\.[a-z0-9]+$/i.test(link))throw Error("No hay vínculo de mesero configurado");
 const p=link.split("."),topic=p[0]+"m"+p[1],id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
 const r=await fetch("https://ntfy.sh/"+topic,{method:"POST",body:JSON.stringify({k:"voz",texto:command,mesero:mesName(),id:id})});
 if(!r.ok)throw Error("No se pudo enviar");return id;
}
function listen(btn,context,done){
 if(!SR){msg("⚠️ Usa Chrome para dictar.");return}
 if(listening&&rec){try{rec.stop()}catch(_){}return}
 rec=new SR();rec.lang=C.lang;rec.interimResults=false;rec.continuous=false;let text="";
 rec.onresult=e=>{for(let i=0;i<e.results.length;i++)if(e.results[i].isFinal)text+=e.results[i][0].transcript+" "};
 rec.onerror=e=>{listening=false;if(btn)btn.classList.remove("on");msg(e.error==="not-allowed"?"⚠️ Permite el micrófono.":"⚠️ No pude escuchar.")};
 rec.onend=async()=>{listening=false;if(btn)btn.classList.remove("on");text=text.trim();if(!text)return;
   msg("🧠 Interpretando…");try{const r=await classify(text,context?context():{});if(r.needs_confirmation){msg("⚠️ "+r.message);return}await done(r,text)}
   catch(e){console.warn(e);msg("⚠️ Laya no respondió. El sistema original sigue disponible.")}
 };
 listening=true;if(btn)btn.classList.add("on");msg("🎤 Te escucho…");try{rec.start()}catch(_){listening=false;if(btn)btn.classList.remove("on")}
}
function installMesero(){
 const fab=document.getElementById("fab"),mic=document.getElementById("sMic");if(!fab&&!mic)return;
 const run=(btn,table)=>listen(btn,()=>({app:"mesero",table:table??null,version:"v65"}),async r=>{
   let c=r.canonical;if(r.action==="add_items"&&!r.table&&table!=null)c="mesa "+table+", "+c;
   await sendMesero(c);msg("✅ "+c);
 });
 if(fab)fab.onclick=()=>run(fab,null);
 if(mic)mic.onclick=()=>{const e=document.getElementById("sTit"),m=e&&(e.textContent||"").match(/(\d+)/);run(mic,m?+m[1]:null)};
}
function installPedido(){
 const input=document.getElementById("p"),add=document.getElementById("add");if(!input||!add||document.getElementById("layaMic"))return;
 const b=document.createElement("button");b.id="layaMic";b.type="button";b.textContent="🎤";b.title="Pedir por voz";
 b.style.cssText="flex:none;width:54px;border-radius:14px;border:1px solid var(--gold);background:transparent;color:var(--gold-hi);font-size:21px";
 add.parentNode.insertBefore(b,add);
 b.onclick=()=>listen(b,()=>({app:"pedido",table:window.mesa||null,version:"v65"}),async r=>{
   if(r.action!=="add_items"){msg("ℹ️ "+r.message);return}
   if(typeof window.agregar==="function")r.items.forEach(x=>{try{window.agregar(x.quantity,x.product)}catch(_){}});
   else{input.value=r.canonical;input.dispatchEvent(new Event("input",{bubbles:true}))}
   msg("✅ "+r.canonical);
 });
}
function boot(){installMesero();installPedido()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
window.LayaVoice={classify,listen,installMesero,installPedido};
})();