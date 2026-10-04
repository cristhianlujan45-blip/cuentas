# Vento 1.27.5 — En cualquier pantalla

## Qué cambió
- **Computador y pantallas grandes**: desde 1200 px de ancho la app usa hasta 1180 px (antes 900 px), y desde 1700 px hasta 1480 px. Las tarjetas de mesa y la ventana de la mesa crecen un poco. Celular y tableta quedan exactamente igual.
- **Teclado y control remoto**: marco visible al moverse por botones (`:focus-visible`); Enter abre la mesa y **Esc la cierra** (solo si no hay otra ventana encima).
- **Presentación de ventas**: nueva diapositiva «En cualquier pantalla» (TV, computador, tableta, celular) con capturas reales; ahora son 24.

## Pruebas
- Enter/Esc con teclado a 1440 px: bien, sin errores de página.
- Capturas a 390, 820, 1440 y 1920 px revisadas.
- Regresión: divtest 6/6, suscrip 20/20, admintest 22/22, googletest 7/7, tvocupado 11/11.

## No probado
- Navegadores de Smart TV reales (Samsung/LG/Android TV) y su control remoto.
