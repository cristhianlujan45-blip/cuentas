from __future__ import annotations
import os, re, unicodedata
from typing import Any
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
try:
    from laya import Router
except Exception:
    Router = None

APP_VERSION="v66-laya"
API_KEY=os.getenv("LAYA_API_KEY","").strip()
MODEL=os.getenv("LAYA_MODEL","multilingual")
app=FastAPI(title="Vento Voice + Laya",version=APP_VERSION)
app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in os.getenv("CORS_ORIGINS","*").split(",") if x.strip()],
                   allow_credentials=False,allow_methods=["*"],allow_headers=["*"])
router=None
if Router:
    try: router=Router(default=MODEL,preload=False)
    except Exception: router=None

ALIASES={
 "aguila":"Águila","aguilas":"Águila","aguila light":"Águila Light",
 "aguilalight":"Águila Light","poker":"Poker","póker":"Poker",
 "pokers":"Poker","corona":"Corona","club colombia":"Club Colombia",
 "clubcolombia":"Club Colombia"
}
WORDS={"un":1,"una":1,"uno":1,"dos":2,"tres":3,"cuatro":4,"cinco":5,"seis":6,
       "siete":7,"ocho":8,"nueve":9,"diez":10,"once":11,"doce":12,"trece":13,
       "catorce":14,"quince":15,"dieciseis":16,"dieciséis":16,"veinte":20}

class CommandIn(BaseModel):
    text:str=Field(min_length=1,max_length=500)
    context:dict[str,Any]=Field(default_factory=dict)

class Item(BaseModel):
    quantity:int=Field(ge=1,le=99)
    product:str

class CommandOut(BaseModel):
    ok:bool
    action:str
    table:int|None=None
    items:list[Item]=[]
    canonical:str=""
    confidence:float=0
    source:str="parser"
    needs_confirmation:bool=False
    message:str=""

def norm(s):
    s=unicodedata.normalize("NFD",s.lower())
    return "".join(c for c in s if unicodedata.category(c)!="Mn").strip()

def num(s):
    if not s:return None
    s=norm(s)
    return int(s) if s.isdigit() else WORDS.get(s)

def table_of(text):
    m=re.search(r"\bmesa\s*(?:numero\s*)?(\d{1,3})\b",norm(text))
    return int(m.group(1)) if m else None

def action_of(text):
    n=norm(text)
    if re.search(r"\b(deshacer|deshacer pedido|anular ultimo|cancelar ultimo)\b",n): return "undo"
    if re.search(r"\b(repetir|pedido anterior|misma ronda|repite la ronda)\b",n): return "repeat"
    if re.search(r"\b(total|cuenta)\b",n) and "todas" in n: return "total_all"
    if re.search(r"\b(total|cuenta)\b",n): return "total_table"
    if re.search(r"\b(pasa|pasar|mueve|mover|junta|juntar)\b",n): return "move_table"
    if re.search(r"\b(crea|crear|agrega una mesa|nueva mesa)\b",n): return "new_table"
    return "add_items"

def laya_intent(text):
    if not router:return action_of(text),0.0
    q={"intent":{"type":"choice","instructions":"Clasifica el comando de un restaurante.",
       "criteria":{"add_items":"agregar o pedir productos","undo":"deshacer el último pedido",
       "repeat":"repetir el pedido anterior","total_table":"consultar el total de una mesa",
       "total_all":"consultar el total de todas las mesas","move_table":"mover o juntar mesas",
       "new_table":"crear una mesa nueva"}}}
    try:
        r=router.predict(text,q,model=MODEL)
        a=r["answers"]["intent"]
        return a.get("choice") or action_of(text),float(a.get("answer_confidence",a.get("confidence",0)) or 0)
    except Exception:return action_of(text),0.0

def items_of(text):
    n=norm(text); hits=[]
    for alias,product in sorted(ALIASES.items(),key=lambda x:-len(x[0])):
        pat=rf"(?:(\d{{1,2}}|uno|una|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+)?{re.escape(alias)}s?\b"
        for m in re.finditer(pat,n):
            hits.append((m.start(),Item(quantity=num(m.group(1)) or 1,product=product)))
    hits.sort()
    merged={}; order=[]
    for _,item in hits:
        if item.product not in merged: order.append(item.product); merged[item.product]=0
        merged[item.product]+=item.quantity
    return [Item(quantity=merged[p],product=p) for p in order]

def canonical(action,table,items,text):
    if action=="undo": return "deshacer"
    if action=="repeat": return f"misma ronda para la mesa {table}" if table else "repetir pedido anterior"
    if action=="total_all": return "cuenta de todas las mesas"
    if action=="total_table": return f"cuenta de la mesa {table}" if table else "cuenta"
    if action in ("move_table","new_table"): return text.strip()
    s=", ".join(f"{i.quantity} {i.product}" for i in items)
    return (f"mesa {table}, " if table else "")+s

@app.get("/health")
def health(): return {"ok":True,"version":APP_VERSION,"laya":router is not None}

@app.post("/voice/command",response_model=CommandOut)
def command(payload:CommandIn,x_laya_key:str|None=Header(default=None)):
    if API_KEY and x_laya_key!=API_KEY: raise HTTPException(401,"Invalid API key")
    action_laya,confidence=laya_intent(payload.text.strip())
    action=action_of(payload.text) if action_of(payload.text)!="add_items" else action_laya
    if action not in {"add_items","undo","repeat","total_table","total_all","move_table","new_table"}: action="add_items"
    table=table_of(payload.text)
    items=items_of(payload.text) if action=="add_items" else []
    confirm=(action=="add_items" and not items) or (action=="add_items" and 0<confidence<.55)
    msg="Comando reconocido." if not confirm else ("No pude identificar el producto." if not items else "Confianza baja; confirma antes de enviar.")
    return CommandOut(ok=(bool(items) if action=="add_items" else True),action=action,table=table,items=items,
                      canonical=canonical(action,table,items,payload.text),confidence=confidence,
                      source=("laya" if router else "parser"),needs_confirmation=confirm,message=msg)
