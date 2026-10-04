#!/usr/bin/env bash
# Corre todas las pruebas automáticas de Vento en un navegador sin ventana (Playwright + Chromium).
# Uso:  bash pruebas/correr.sh            → todas
#       bash pruebas/correr.sh hola voz1ra → solo esas
# La primera vez:  cd pruebas && npm install && npx playwright install chromium
cd "$(dirname "$0")/.." || exit 1
if ! curl -s -o /dev/null http://localhost:8765/index.html; then
  python3 -m http.server 8765 >/dev/null 2>&1 & SRV=$!
  trap 'kill $SRV 2>/dev/null' EXIT
  sleep 1
fi
export NODE_PATH="$PWD/pruebas/node_modules${NODE_PATH:+:$NODE_PATH}"
lista=("$@"); [ ${#lista[@]} -eq 0 ] && lista=($(ls pruebas/*.test.js | xargs -n1 basename | sed 's/\.test\.js$//'))
mal=0
for t in "${lista[@]}"; do
  echo "== $t"
  salida=$(timeout 240 node "pruebas/$t.test.js" 2>&1); code=$?
  echo "$salida" | grep -E "✅|❌|RESULTADO|errores|sin errores" | tail -40
  if [ $code -ne 0 ] || echo "$salida" | grep -qE "❌|RESULTADO [0-9]+ bien [1-9]"; then echo "   ⚠️  FALLÓ: $t"; mal=1; fi
done
[ $mal -eq 0 ] && echo "✅ Todas las pruebas pasaron" || echo "❌ Hay pruebas que fallaron"
exit $mal
