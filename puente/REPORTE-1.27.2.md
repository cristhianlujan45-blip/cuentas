# Vento 1.27.2 — Vento Admin (panel del proveedor), TV ocupado y mesa más ordenada

## 1. Vento Admin (`admin.html`) — el panel para manejar el negocio de vender Vento
Organizado como los paneles de SaaS (resumen, clientes/CRM, suscripciones, pagos, configuración):
- **📊 Resumen:** clientes, activos, por vencer (7 días), vencidos, ingreso mensual esperado, cobrado este
  mes, gráfica de ingresos de 6 meses y lista «Por cobrar» con botón de WhatsApp.
- **👥 Clientes:** buscador y filtros; ficha (negocio, contacto, WhatsApp, ciudad, código del negocio, plan,
  precio, vencimiento, notas). Acciones: **Renovar y cobrar** (registra el pago y firma el código de
  activación con tu llave privada → link por WhatsApp), recordatorio de pago, suspender, historial.
- **💵 Pagos:** por mes, total y descarga CSV.
- **🔑 Licencias:** carga de la llave privada (avisa si no es la de Vento) y códigos sueltos, incluida la
  licencia de **proveedor** para tus celulares.
- **📦 Planes:** nombre, precio y sedes incluidas.
- **⚙️ Configurar la app:** precio que ven al renovar, días de prueba y de gracia, WhatsApp de soporte,
  **anuncio para todos los negocios** y **negocios suspendidos**. Se publica en `vento-config.json`
  (rama `vento-config`) con un token de GitHub que queda solo en tu equipo. La app lo lee al abrir y
  cada hora (y lo guarda para cuando no hay internet).
- **💾 Respaldo** descargable/cargable y **PIN** opcional.
- Los datos de clientes viven solo en tu equipo. En Vento (Ajustes → Negocio → Plan) el proveedor ve
  el acceso «👑 Vento Admin».
- Prueba `admintest.js` 14/14 (plan → cliente → renovar → el negocio queda activo → publicar config →
  anuncio y precio en la app → suspender → respaldo).

## 2. TV con otro celular / TV Box ya conectado (como lo hace ytcast y la app de YouTube)
- Nuevo en la APK: `VentoAndroid.infoYouTube` (DIAL GET). Al tocar el TV, Vento le pregunta primero:
  si YouTube ya está abierto, el TV da su código de pantalla y Vento se une a esa sesión sin volver a
  abrir YouTube ni cortar lo que suena.
- Si el TV ignora el código de vinculación (en uso), Vento le vuelve a preguntar mientras espera y se une
  con el código de pantalla apenas lo da.
- Pruebas: `tvocupado.js`, `tvocupado2.js` (el TV no dio el código al buscar), `tvocupado3.js` (el TV
  ignora el código y da su pantalla después): 11/11 cada una. Requiere la APK nueva.

## 3. Mesa más ordenada
- Buscador de productos en tarjeta: lupa, sugerencias oscuras con precio en verde, cantidad en píldora
  (− 0 +) y botón «＋ Agregar» grande. Igual en la cuenta de cada persona.
- Personas como fichas con su inicial y lo que deben. «Dividir cuenta» con el mismo estilo.
