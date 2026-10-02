# Vento 1.16.1: verificador de comprobantes y panel de notificaciones

## 1. 🔎 Verificar comprobantes de Nequi y DaviPlata

**El problema:** el cliente muestra un pantallazo de «Envío realizado» que puede ser falso, viejo, de otro número o uno que ya mostró antes.

**Cómo se usa:**
- **En la cuenta:** al tocar **📎 Comprobante**, Vento lee el pantallazo sin internet (unos 2 s) y lo revisa.
- **Por fuera de una cuenta:** **Más → 💜 Pagos** y **Ajustes → 💜 Pagos** tienen el botón **«🔎 Verificar un comprobante»**.

**Qué lee:**
- el valor (descarta el «costo de la transacción»);
- la referencia o el número de aprobación;
- la fecha y la hora;
- el número de destino;
- la app: Nequi, DaviPlata, Bre-B o Bancolombia.

**Lo cruza con los pagos que DE VERDAD llegaron** (Servidor Vento o avisos de la app del banco):

| Resultado | Cuándo |
|---|---|
| ✅ **Pago verificado** | Llegó un pago del mismo valor cerca de la hora del comprobante. Aparece el botón para registrarlo en la cuenta con el comprobante adjunto. |
| ⏳ **Aún no llega** | No ha llegado ese pago. Vento avisa con voz apenas llegue. |
| 🚨 **NO LO ACEPTES** | Pasa alguna de estas cosas: <ul><li>la referencia ya se usó, es decir, el mismo pantallazo en otra cuenta;</li><li>la plata fue a otro número;</li><li>la fecha es del futuro.</li></ul>El pantallazo no queda adjunto. |
| ⚠️ **Revísalo** | El comprobante es viejo, no se pudo leer o Vento no tiene avisos automáticos activos. |

**Regla de fondo:** un pantallazo nunca cuenta como pago recibido por sí solo. Los comprobantes ya usados se guardan en los datos del negocio y se sincronizan entre celulares con Vento Nube.

**Probado:**
- 11 casos de lectura y verificación.
- Una imagen real leída con el OCR (1,5–2 s): se registró con el comprobante adjunto, y el mismo pantallazo en otra cuenta salió como 🚨 «ya se usó».

## 2. Panel de notificaciones (campana)

**El problema:** en tu celular, la corrección automática de la 1.16 encogió el panel. El navegador reporta medidas distintas a lo que se ve, y además una regla vieja cortaba las palabras letra por letra.

**Arreglo:**
- **Ancho:** en celular, el panel se estira con márgenes fijos de 8 px a los lados (`left`/`right` en CSS). Ya no se calcula el ancho con JavaScript, así que ocupa todo lo visible aunque las medidas del navegador estén mal.
- **Palabras:** solo se cortan las demasiado largas.
- **Tarjetas en 3 líneas:** estado y hora / **mesa en grande** / lo que pidieron.

**Probado:**
- 360, 390 y 412 px;
- letra de 100, 130 y 150 %;
- simulando medidas falsas del navegador (ancho visible 150 px y ancho de página 980 px): siempre 8 px a cada lado y los títulos en una línea.
