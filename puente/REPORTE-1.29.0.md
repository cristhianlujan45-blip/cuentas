# Vento 1.29.0 — Primeros pasos y pruebas en el repositorio

## Qué cambió
- **Primer uso más simple.** Antes: crear cuenta → asistente → carrusel de 6 pantallas. Ahora, quien completa el
  asistente ya no ve el carrusel: arriba de las ventas aparece la tarjeta **«🚀 Primeros pasos»** con 5 pasos
  (configurar, revisar productos, abrir una cuenta, cobrar, probar la voz) que se marcan solos y con barra de avance.
  Al terminar dice «¡Vento quedó listo!». El recorrido sigue en «¿Cómo funciona Vento?» dentro de la tarjeta.
  - Solo la ve el administrador (el mesero no).
  - Los negocios que ya tenían ventas no la ven (no es para ellos).
  - Se oculta con ✕ y vuelve desde Ajustes → «Primeros pasos».
- **Pruebas automáticas en el repositorio** (`pruebas/`): 10 pruebas + `bash pruebas/correr.sh`.
  Ver `pruebas/LEEME.md`.

## Pruebas
`bash pruebas/correr.sh`: divtest 6/6, esc ok, googletest 7/7, hola 15/15, holaapk 10/10, pasos 14/14,
suscrip 20/20, tvocupado 11/11, voz1ra 7/7, vozundo sin errores.
