# Vento 1.26.3 — Conexión al YouTube del TV como antes + voz a la primera (APK 1.0.12)

## Conexión al TV
Diferencias con la versión que sí conectaba (1.22) y lo que se corrigió:
- Desde 1.22.1, si el TV tenía YouTube abierto y daba su `screenId`, Vento se conectaba SOLO por ahí, sin abrir
  YouTube con el código de vinculación (el camino que funcionaba). Ahora **primero va el camino de siempre**
  (abrir YouTube en el TV con un código de vinculación por DIAL); si falla y el TV dio su screenId, se usa ese;
  y si no, el código del TV.
- Si el TV tarda en registrar el código, **segundo intento** automático con un código nuevo.
- Abrir YouTube en el TV: primero por la red wifi y, si no responde, como antes (por la red que elija Android).
- **Turno exclusivo** mientras se conecta: ninguna revisión de fondo se cruza con la vinculación.
- El **saludo** al TV (lo que hace que el TV muestre «Vento se conectó») se reintenta hasta 3 veces. Antes, si
  fallaba, Vento decía «Conectado» igual; ahora avisa «el TV no contesta» y lo sigue intentando.
- Cada paso queda en «🔍 Ver qué pasó».

## Comando por voz a la primera (app de Android)
- El reconocedor de voz se **reusa** (antes se destruía y creaba en cada toque: en muchos celulares la primera
  escucha fallaba al instante, «ocupado» o «no te entendí»).
- Si falla al arrancar (primeros 2,5 s) o antes de oírte, **vuelve a escuchar solo** (hasta 2 veces).
- Más paciencia para terminar la frase (1,5–1,8 s de silencio).

## Pruebas (repetidas)
- `conectar2.js`: TV normal ×3, TV con YouTube abierto ×3, TV que no deja abrir YouTube pero da screenId ×3,
  TV que tarda en registrar el código ×1, primer saludo que falla ×3, TV que nunca contesta (no dice
  «Conectado») ×3 → todos bien. `conectar.js` 5/5. Regresión completa.
