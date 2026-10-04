# Vento 1.28.0 — «Hola Vento», la IA se llama Vento y Vento Admin en APK

## Qué cambió
- **La IA se llama Vento.** Todo lo que el usuario ve dice «Vento» / «Vento IA» (antes «Laya»). Los mensajes de error y de
  lectura de facturas ya no nombran a otra IA. El código interno conserva sus nombres (no cambia datos ni funciones).
  La voz sigue entendiendo «Laya…» por costumbre, y ahora también «Vento…», «Hola Vento», «Oye Vento» y «Bento».
- **«Hola Vento» manos libres** (prendido por defecto; Ajustes → «Hola Vento»): con la app abierta escucha sola; al oír
  «Hola Vento» / «Oye Vento» / «Vento, …» hace la orden igual que el botón 🎤. Tras cada orden queda atenta 9 s para
  seguir sin repetir «Hola Vento». Se pausa mientras Vento habla, con el botón 🎤, en la pantalla de entrada o en segundo
  plano. «Vento, deja de escuchar» lo apaga. Puntico verde en el micrófono = escuchando; brillo verde = atenta.
- **APK (Vento):**
  - La primera vez pide de una vez micrófono, cámara y avisos; luego quitar el ahorro de batería.
  - Música → «🔐 Permisos del celular»: muestra qué falta y lo vuelve a pedir (o abre los ajustes de la app).
  - Si Android cierra la página de fondo por memoria, se vuelve a abrir sola (antes se caía toda la app).
  - La página queda con prioridad «importante» aunque no se vea (menos cierres de fondo).
  - Mientras «Hola Vento» escucha se silencia el pitido de Android al abrir el micrófono (avisos/sistema).
  - Corregido: si «Hola Vento» soltaba el micrófono y se tocaba 🎤 enseguida, la escucha nueva se cortaba.
- **APK de Vento Admin** (`android/admin`, `co.vento.admin`): abre admin.html (sigue pidiendo el código personal),
  guarda respaldos y CSV en Descargas/Vento, abre WhatsApp/GitHub con su app. Se publica junto a vento.apk:
  https://github.com/cristhianlujan45-blip/cuentas/releases/latest/download/vento-admin.apk

## Pruebas
- hola 15/15 (navegador), holaapk 10/10 (APK simulada), voz1ra 7/7, vozundo, vozlaya, vozq sin errores,
  divtest 6/6, suscrip 20/20, admintest 22/22, googletest 7/7, tvocupado 11/11, esc ok.
- Java de ambas apps compila contra android-all-14 (javac). El APK lo compila GitHub Actions.

## No probado en aparatos reales
- Micrófono continuo en celulares reales (cada marca se comporta distinto; en algunos el pitido sale por el canal de música).
- «Hola Vento» con la app cerrada o la pantalla apagada: Android no lo permite a apps normales; funciona con la app abierta.
