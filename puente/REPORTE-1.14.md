# Vento 1.14: pagos Nequi / Daviplata que llegan a la cuenta, y calculadora

## Cómo llegan los pagos a Vento

**Por qué no se le pregunta al banco:** Nequi y Daviplata no tienen una conexión pública para cuentas personales. Las APIs de "Nequi Negocios" exigen un contrato empresarial.

**Lo que sí llega al instante** es la notificación en tu celular ("JUAN PÉREZ te envió $20.000"). La app gratis **MacroDroid** la reenvía a Vento por un canal privado en menos de un segundo.

### Configurarlo (una vez, en el celular donde te llegan los pagos)

1. **Activar en Vento:** ve a **Ajustes → Negocio → "🔔 Verificar pagos de Nequi y Daviplata"**, prende el interruptor y toca **📋 Copiar dirección**. También se llega desde **Más → 💜 Pagos → Activar y ver los pasos**.
2. **Instalar MacroDroid:** descárgalo de Play Store (gratis) y dale el permiso de **acceso a notificaciones**.
3. **Disparador:** toca **Añadir macro → Disparadores → Notificación → Notificación recibida**, marca **Nequi** y **DaviPlata** (y Bancolombia si quieres) y deja "cualquier contenido".
4. **Acción:** elige **Web / Conectividad → Solicitud HTTP**, método **POST**, y pega la dirección que copiaste.
5. **Cuerpo del mensaje:** con el botón de texto mágico, pon **nombre de la app | título | texto de la notificación**.
6. **Probar:** guarda la macro con ✓. Pídele a alguien $1.000, o toca **Probar** en Vento.
7. **Batería:** en los ajustes del celular deja MacroDroid **sin ahorro de batería**, para que siga funcionando con la pantalla apagada.

Vento debe estar abierta en algún celular o computador del negocio (no hace falta que sea el mismo).

### Qué pasa cuando llega un pago

- **✅ Confirmado** (llegó por la notificación de la app del banco): sale la ventana **"💜 Llegó un pago"** con el valor, quién pagó y el botón **"Registrar en Mesa 3 (debe $20.000)"** si coincide con lo que debe una cuenta. Si no coincide, eliges la cuenta en la lista.
  - El pago se anota como transferencia, con la app, el nombre y la marca de verificado.
  - Te dice si quedó al día o cuánto falta.
  - Nunca se registra dos veces, aunque el aviso se repita.
- **⚠️ Revisar** (llegó por SMS): míralo en la app del banco y toca "Lo vi en la app".
- **🚨 Falso** (SMS desde un número de celular): suena una alarma y no se registra.

**Lectura de las notificaciones:** ahora también entiende "Recibiste 25.000 pesos" (sin el signo $) y "te pasó $8.500" (formatos de Daviplata). Probado con 12 formatos de Nequi, Daviplata, Bancolombia, Bre-B y SMS.

### Dónde ver los pagos

- **Más → 💜 Pagos Nequi / Daviplata:** el total confirmado de hoy por app y la lista con su estado. En cada pago puedes tocar "Registrar" o "Lo vi en la app".
- **Laya:**
  - "¿Cuánto me ha llegado por Nequi hoy?" responde con el total y el detalle por app, lo que falta registrar y lo que hay por revisar.
  - "¿Llegó el pago de la mesa 3?" responde si llegó y cómo.
- **Tarjeta de Laya en el inicio:** muestra los pagos confirmados que todavía no se registraron en una cuenta, con su botón.

## Calculadora

**Dónde abrirla:** en **Más → 🧮 Calculadora**, diciendo "calculadora" en el micrófono, o diciéndole a Laya "abre la calculadora".

- **Teclado grande:** + − × ÷, %, 000, borrar y C.
- **Orden de las operaciones:** primero multiplica y divide. Ej.: 3 × 4000 + 2 × 3500 = 19.000.
- **Porcentaje:** 50.000 + 10% = 55.000; 200 × 10% = 20.
- **Cinta:** guarda las últimas cuentas, incluso después de cerrarla.
- **🎤 Dictar:** varias cuentas a la vez, por ejemplo "súmame 3500 más 4000 y multiplícame 5000 por 2". Dice el resultado en voz alta.
- **En computador:** funciona con el teclado (números, + − * /, Enter, Esc).

## Pruebas

| Prueba | Resultado |
|---|---|
| Nequi $20.000 que coincide con Cuenta 3 | La ventana ofrece "Registrar en Cuenta 3"; al tocarlo, saldo $0 |
| El mismo aviso repetido | No se duplica |
| Daviplata $5.000 asignado a Cuenta 4 | Le falta $7.000 |
| SMS falso | No abre la ventana |
| Laya: total del día y pago de una mesa | Correcto |
| Panel de pagos | Totales por app y estados correctos |
| 7 cuentas de la calculadora y teclado en pantalla | Correctos |
| Regresión (12/12 de pagos, 26/26 de libreta, cuentas por voz, Laya, pedidos, QR impreso, todos los tipos de negocio) | Sin errores |
