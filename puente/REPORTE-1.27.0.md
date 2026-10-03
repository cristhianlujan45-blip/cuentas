# Vento 1.27.0 — Música del QR que no sonaba, proveedor y suscripciones, voz, Laya ⚡ Gemini, botones de pago

## 1. Las canciones del QR llegaban a Vento pero NO sonaban en el TV (causa encontrada)
Para mandar una canción al TV, Vento primero busca su video en YouTube. Esa búsqueda usaba UNA clave
compartida por todos los locales, con cupo de ~100 búsquedas al día. Cuando el cupo se acaba (una noche
movida lo agota), la búsqueda dependía de servidores gratuitos que casi siempre están caídos: la canción
quedaba en la cola de Vento, el TV seguía «conectado», pero la canción nunca le llegaba.
Reproducido en prueba: con el cupo agotado, 0 de 3 canciones del QR llegaban al TV.

**Arreglo:** la app de Android ahora busca la canción ella misma en la página pública de YouTube
(`VentoAndroid.buscarYT`), sin clave y sin cupo, y lo hace PRIMERO. Con el cupo agotado: 3 de 3 llegan
al TV (`qrtvapp.js`). Requiere la APK nueva (se compila sola en GitHub Actions).
Además se mantiene lo de la 1.26.4/1.26.5: conexión con el TV como en la 1.22 (sin canal en vivo).

## 2. Proveedor y suscripciones (Vento como servicio)
- **Proveedor** (el dueño de Vento): su equipo se activa con una licencia firmada «proveedor» creada en
  `licencias.html` con SU llave privada. Control total, sin vencimiento. Es el único que puede
  «Restablecer todo» y «Borrar historial de un día».
- **Suscriptores**: licencia firmada para el CÓDIGO DEL NEGOCIO (sirve en todos sus celulares, viaja con
  los datos) con fecha de vencimiento y plan. Ajustes → Negocio → 💳 Plan y suscripción.
- **Sin pagar:** 15 días de prueba + 3 de gracia. Después NO se borra nada ni se pierden pedidos: se puede
  ver todo, cobrar las cuentas abiertas, recibir pedidos del QR y sacar respaldo; no deja hacer ventas
  nuevas hasta renovar (aviso con WhatsApp y campo para pegar el código).
- Nadie puede fabricar una licencia sin la llave privada (firma ECDSA P-256; la app solo tiene la pública).
- `licencias.html`: nuevo selector «Suscripción / Sedes / Proveedor».
- Prueba `suscrip.js`: 20/20.

## 3. Voz
- «Borra / deshace / elimina / anula / quita el pedido anterior» ya deshace (antes lo tomaba como
  «recuérdame el pedido»).
- Nuevos: «¿cuántas Póker quedan?», «abre la mesa 3», «cobra la mesa 3», «agrega a Juan a la mesa 4»,
  «la mesa 3 abona 20 mil», «Juan paga 10 mil de la mesa 2 por Nequi» (se deshace con «deshacer»),
  y preguntas a Laya por el micrófono («¿cuánto vendí hoy?», «¿qué mesas están abiertas?»,
  «siguiente canción», «pon la canción…»).
- «Que sean dos Póker para la mesa 3», «hay que agregar dos Póker…», «que me traigan…»: antes anotaba 1
  (se perdía la cantidad por la muletilla del inicio); ahora anota las que se dijeron.

## 4. Laya ⚡ Gemini: gana la que responda primero
- Facturas: Gemini y el lector de Laya (en el celular, sin internet) leen a la vez; se muestra la
  primera que traiga productos. Si gana Laya y Gemini termina después, aparece «🤖 Gemini ya terminó:
  usar su lectura». Factura real de prueba: Laya en 2,4 s.
- Preguntas: Laya contesta al instante con los datos del negocio; Gemini solo cuando Laya no sabe.

## 5. Botones de pago/abono y de personas
- Tarjeta «Registrar un pago o abono»: monto grande, botones rápidos (Todo, La mitad, Dividido),
  método con botones (Efectivo, Transferencia, Queda debiendo), Productos/Comprobante y
  «Registrar pago». También en la cuenta de cada persona.
- «Agregar persona» y «¿A nombre de quién?» con diseño redondeado y botón claro.

## Pruebas
Regresión completa + nuevas: `qrtvapp.js` 10/10, `suscrip.js` 20/20, `carrera.js` (5 casos), `vozundo.js`.
No se pudo probar contra el YouTube, el TV ni Gemini reales desde aquí.
