# Vento 1.11: facturas y productos por foto, más rápidos

## Con IA (Gemini)

| Cambio | Efecto |
|---|---|
| **Empieza a leer mientras revisas la foto.** En cuanto sale la vista previa "Revisa la foto", la factura ya se le está mandando a la IA. | Cuando tocas "✅ Usar esta foto", la respuesta ya viene en camino o ya llegó. Probado con la IA simulada: la factura apareció **0,1 s** después de tocar. Si tomas otra foto o usas la original, se lee la nueva. |
| **Respuesta compacta.** Antes la IA escribía unos 20 campos con nombre por producto y otros 20 de encabezado. Ahora escribe una lista corta por producto y omite lo que no está impreso. `fiExpandirCompacto()` la vuelve al formato de siempre. | Se escribe 3 a 4 veces menos texto, que es lo que más demora. |
| **La IA interpreta los nombres.** Cada renglón trae la descripción impresa tal cual y el nombre interpretado. Ej.: "AG LIGH LAT 330" → "Cerveza Águila Light lata 330 ml". | Si el producto ya existe en tu inventario, usa exactamente ese nombre y se emparejan solos. Los productos nuevos se crean con el nombre interpretado. |
| **Tiempos máximos más cortos.** Primera pasada de 15 s (antes 18 s); la de respaldo de 30 s y también rápida (antes 45 s y lenta). | La espera máxima baja de unos 63 s a unos 45 s, y casi nunca se llega a la segunda pasada. |
| **Productos y precios por foto:** una sola pasada rápida de 10 s. La verificación web (25-90 s) solo se hace si no se reconoció el producto o si está activado "Verificar siempre en la web". La foto de precio pasa de 1000 a 800 px. | Respuesta corta y directa. |

**Tiempo real:** no se pudo medir contra Gemini desde aquí, porque la red de pruebas lo bloquea. Por cómo cambió, se espera bastante menos de 10 s. Se confirma en el celular.

## Sin internet

| Cambio | Efecto |
|---|---|
| **Ya no relee la foto sin necesidad.** Antes, con confianza menor a 55 se leía 3 o 4 veces más (girada 90°, 270°, 180° y con la original). Además, el "otro modo de lectura" lo decidía el lector viejo, que casi siempre veía 1 producto. Ahora se relee girada solo si no salió casi nada o la confianza es muy baja (< 40); el segundo modo, solo si el lector bueno tampoco encontró renglones. Todas las relecturas caben en unos 6 s. | Menos lecturas repetidas. |
| **El motor se carga mientras tomas la foto.** | Ahorra hasta 1 s. |

**Probado con las 7 facturas reales**, tiempo desde tocar "Leer", en computador:

| Factura | Antes (total) | Ahora (desde tocar "Leer") | Productos |
|---|---|---|---|
| Distrimarcas | 10,7 s | 4,5 s | 2 = 2 |
| CCESTAN 1 | 5,3 s | 2,8 s | 9 = 9 |
| Colombina | 8,0 s | 5,0 s | 10 = 10 |
| Dulmarcas | 10,6 s | 4,8 s | 6 = 6 |
| Foto difícil | 25,0 s | 9,2 s | 1 = 1 |
| CCESTAN 2 | 10,8 s | 8,3 s | 9 = 9 |
| Tirilla | 8,4 s | 5,6 s | 5 = 5 |

Las 7 detectan los mismos productos que antes. Un celular es más lento que el computador; con IA y con internet es lo más rápido.

**Se probó y se descartó achicar la foto para el lector sin internet:** era más rápido, pero perdía productos (10 → 9, 9 → 8, 5 → 3).
