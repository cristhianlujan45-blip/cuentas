# Vento 1.27.1 — IA ya configurada para todos y TV con otro celular conectado

## 1. IA ya configurada (Gemini + Laya), sin que nadie ponga claves
- Nueva función del Servidor Vento: `supabase/functions/vento-ia`. Guarda la clave de Gemini del PROVEEDOR
  como secreto del servidor (`GEMINI_API_KEY`) y reenvía a Gemini los pedidos de la app. La clave nunca
  está en la app ni en GitHub.
- La app: si el negocio no puso su propia clave, usa la «IA de Vento» automáticamente (chat, voz con IA,
  escaneo de facturas y de productos). Si un negocio pone su propia clave, se usa la suya.
- Protección: solo la página de Vento (su origen), solo modelos `gemini-…`, máximo 40 pedidos por minuto
  por IP, cuerpos de hasta 8 MB.
- Laya (lector de facturas sin internet) ya venía configurada y sigue en carrera con Gemini.
- **Falta un paso del proveedor (una sola vez):** GitHub → Settings → Secrets and variables → Actions →
  New repository secret → nombre `GEMINI_API_KEY`, valor: la clave de Gemini (AIza…). El flujo
  «Servidor Vento» la sube al servidor y despliega la función.
- Pruebas: la función con Deno (pasa a Gemini, bloquea otros orígenes y rutas) e `iavento.js` 6/6.

## 2. No se conectaba al TV cuando ya había OTRO celular conectado
Causa: Vento siempre abría YouTube en el TV con un código de vinculación nuevo. Si YouTube ya está abierto
y en uso por otro celular, el TV ignora ese código: Vento esperaba y fallaba.
Arreglo: si el TV dice que YouTube ya está abierto y da su código de pantalla (o Vento lo recuerda de antes,
por la IP del TV), Vento se une a ESA MISMA sesión, sin volver a abrir YouTube y sin cortar lo que suena:
las canciones de las mesas entran en cola detrás. Si no se puede, sigue el camino de siempre.
Prueba `tvocupado.js`: versión 1.27.0 → 6/11 (no se conectaba); 1.27.1 → 11/11.
