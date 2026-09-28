# V66 — Laya sobre V65

Base confirmada: rama `claude/precio-margen-productos-tabla-mioclt`, V65.

Incluye backend FastAPI + Laya 0.3.21 y una capa de voz aditiva para `pedido.html` y `mesero.html`.

Ejemplos:
- mesa 2, cuatro Poker
- agrégame cinco Águilas
- mesa dos, cinco Águilas
- deshacer
- repetir
- cuenta de la mesa 2
- cuenta de todas las mesas

El parser de productos es determinista; Laya clasifica la intención. Así el modelo no inventa cantidades ni productos.

Instalación:
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export LAYA_API_KEY="una-clave-larga"
export CORS_ORIGINS="https://TU-DOMINIO"
uvicorn app.main:app --host 127.0.0.1 --port 8000

En las páginas HTML agrega:
<link rel="stylesheet" href="laya-voice-v66.css">
<script>window.LAYA_API="https://TU-DOMINIO/api/voice/command";</script>
<script src="laya-voice-v66.js"></script>

V65 queda como base; esta integración se identifica como V66.
