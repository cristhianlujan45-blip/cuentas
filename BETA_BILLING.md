# Suscripciones de Vento · BETA (pago manual por Nequi y DaviPlata)

Fase actual: **beta / primeros clientes**. El cobro es **manual**: el negocio paga por Nequi o DaviPlata,
envía el comprobante desde la app y un administrador de Vento lo aprueba. No se usa Google Play Billing
(la arquitectura ya está lista para eso; ver [FUTURE_GOOGLE_PLAY.md](FUTURE_GOOGLE_PLAY.md)).

```
CUENTA (Vento Nube) → NEGOCIO → PLAN → NEQUI / DAVIPLATA → COMPROBANTE → PAGO EN REVISIÓN
   → ADMIN APRUEBA → SUSCRIPCIÓN ACTIVA → ENTITLEMENTS (funciones del plan) → APP DESBLOQUEADA
```

## Reglas del sistema

- **La suscripción es de la CUENTA + el NEGOCIO**, no del celular. Si el dueño cambia de celular: instala Vento,
  entra con su cuenta, elige su negocio y la app le pide el estado al servidor. No hay licencias atadas al teléfono.
- **El servidor decide.** La app nunca decide «soy Premium»: pide `POST /estado` y recibe el plan, las funciones
  activas y un **token firmado** por el servidor (ECDSA P-256). Sin internet, la app usa ese token firmado hasta su
  fecha de validez (máximo 72 horas). Un dato puesto a mano en el celular (localStorage) no da acceso a nada.
- **Una sola base de datos:** la misma de Vento Nube (Supabase): `auth.users`, `negocios`, `miembros`.
  Se agregaron solo las tablas de la tabla de abajo.
- **Sin duplicados:** una suscripción por negocio (índice único), y un pago no se puede registrar dos veces
  (misma clave de envío, misma referencia de Nequi/DaviPlata o la misma foto de comprobante).
- **Negocios sin Vento Nube** (solo en el celular) siguen con el sistema anterior: prueba gratis local, código de
  activación firmado y WhatsApp. Para suscribirse con el sistema nuevo deben crear su cuenta en
  Ajustes → Nube y usuarios.

## Puesta en marcha (una sola vez)

1. **Desplegar.** Al publicar en la rama principal, GitHub Actions → «Servidor Vento» aplica las migraciones y
   despliega la función `vento-suscripciones` (las ramas de trabajo ya **no** despliegan a producción).
2. **Quién aprueba los pagos.** En GitHub → Settings → Secrets and variables → Actions, crear el secreto
   `VENTO_ADMIN_EMAILS` con tu correo de Vento Nube (varios separados por comas) y volver a correr
   «Servidor Vento». El correo debe estar **confirmado** en Vento Nube. (Alternativa por SQL en Supabase:
   `insert into platform_admins(user_id, email) select id, email from auth.users where email = 'tu@correo.com';`)
3. **Tus números de cobro.** Vento Admin → 💳 Suscripciones → Configuración: número y titular de **Nequi** y de
   **DaviPlata**, y el WhatsApp de soporte. Mientras estén vacíos, la app no puede mostrar dónde pagar.

## Planes y precios

Los precios viven **solo** en la tabla `plans` de la base de datos (se cambian desde el panel, nunca en el código).

| Plan | Estado inicial | Precio inicial | Funciones (entitlements) |
|---|---|---|---|
| `free` (Gratis) | activo | $0 | pos_basic, tables, inventory, expenses |
| `basic` (Básico) | inactivo | $34.900 | Gratis + invoices, employee_management |
| `pro` (PRO) | activo | $59.900/mes | pos_basic, inventory, tables, expenses, invoices, ocr, ai_camera, voice, advanced_reports, employee_management |
| `premium` (Premium) | inactivo | $99.900 | todo, incluido multi_branch |

**Crear o cambiar un plan:** Vento Admin → 💳 Suscripciones → Planes: nombre, precio (pesos, sin puntos),
activo sí/no, meses por pago y casillas de funciones. Al marcar «activo», el plan aparece en la app.
El plan Gratis no se puede desactivar. Un plan nuevo también se puede crear por SQL en `plans` + `plan_entitlements`.

**Configurar precio:** en la misma pantalla, campo Precio → Guardar. La app lo toma del servidor la próxima vez que
abre la pantalla de planes. El precio que paga el cliente se valida en el servidor: un pago por menos del precio
del plan se rechaza (`monto_insuficiente`).

## Prueba gratis

- `billing_config.trial_days` (15 por defecto). La primera vez que un negocio consulta su estado se crea su
  suscripción de prueba: plan PRO, `source = 'trial'`.
- Se cuenta desde la fecha más reciente entre **la creación del negocio** y **el inicio de la beta**
  (`billing_config.trial_desde`). Así ningún negocio que ya usaba Vento queda en Gratis al actualizar.
- Al terminar la prueba el negocio queda en **Gratis**: puede seguir vendiendo, con mesas, inventario y gastos.

## Cómo se recibe un pago (lo que hace el cliente)

1. Ajustes → Negocio y facturación → 💳 Plan y suscripción → **Ver planes** (o la barra de arriba).
2. Elige **PRO** → elige **NEQUI** o **DAVIPLATA** → ve el valor, el número y el titular (con botón Copiar).
3. Paga desde su app de Nequi/DaviPlata y toca **✅ YA PAGUÉ · ENVIAR COMPROBANTE**.
4. **ENVÍA TU COMPROBANTE**: tomar foto o elegir de la galería, nombre, teléfono, negocio, plan, método,
   referencia (si la tiene), valor pagado y fecha → **ENVIAR COMPROBANTE**.
5. La app muestra **«⏳ Pago en revisión»**. Las funciones PRO **no** se activan hasta que un admin apruebe.

Solo el **dueño** o un **administrador** del negocio ven precios y pagos. Cajeros y meseros no ven nada de cobros.
La foto se comprime en el celular (JPEG, máx. 1600 px) y se guarda en el bucket **privado** `comprobantes`
(solo el servidor la lee; el admin la ve con un enlace temporal de 10 minutos).

## Cómo revisar y aprobar (lo que hace el administrador)

Vento Admin (`admin.html`) → código personal → pestaña **💳 Suscripciones** → entra con tu cuenta de Vento Nube.

**Pagos pendientes:** cada tarjeta muestra usuario, negocio, plan, valor, método (NEQUI / DAVIPLATA), fecha,
referencia y estado.

1. **VER COMPROBANTE** → abre la foto. Compara valor, fecha, referencia y titular con lo que llegó a tu Nequi/DaviPlata.
2. **APROBAR** → confirma mostrando inicio y vencimiento. El servidor, en una sola transacción:
   registra el pago como aprobado (quién y cuándo), crea o actualiza la suscripción del negocio, calcula
   inicio y vencimiento (+1 mes calendario: 05/10/2026 → 05/11/2026), pone el estado en **ACTIVE**, activa las
   funciones del plan y deja el evento en `payment_events` y en `auditoria`.
   Aprobar dos veces (o dos admins a la vez) no duplica nada.
3. **RECHAZAR** → pide el motivo (obligatorio). El cliente lo ve en la app con el botón «Enviar otro comprobante».

## Estados

| Estado | Qué significa | Qué ve el negocio |
|---|---|---|
| `pending_payment` | Eligió plan, aún no envía pago | «Elige tu plan» |
| `payment_review` | Envió comprobante | «⏳ Pago en revisión» (sin funciones PRO) |
| `active` | Pagó y se aprobó (o está en prueba) | «Plan PRO activo · vence el dd/mm/aaaa» |
| `expired` | Pasó la fecha de vencimiento | Plan Gratis + «Renovar» |
| `canceled` | Un admin la canceló | Plan Gratis |
| `rejected` | El comprobante se rechazó | Motivo + «Enviar otro comprobante» |

## Vencimiento

- Si `fecha actual > expiry_date`, el **servidor** pasa la suscripción de `active` a `expired` y el plan efectivo
  queda en Gratis (se retiran las funciones PRO).
- Se revisa **cada vez que alguien consulta el estado** y además **cada 10 minutos** (GitHub Actions →
  «Servidor Vento» → `POST /vencer`). No depende del celular.
- Sin internet, el celular deja de dar funciones PRO cuando vence el token firmado (máximo 72 horas).

## Renovación

- Cuando faltan `renew_notice_days` días (7 por defecto) la app muestra: **«Tu suscripción vence el dd/mm/aaaa.»**
  con el botón **RENOVAR**, que abre el mismo flujo (Nequi / DaviPlata → comprobante).
- Al aprobar una renovación del **mismo plan** vigente, el mes nuevo **se suma al vencimiento actual**
  (nadie pierde días por pagar antes). Si estaba vencida, empieza el día de la aprobación.
- Mientras la renovación está en revisión, la suscripción sigue **activa** hasta su fecha.

## Cancelar, cambiar de plan, dar meses

En Vento Admin → 💳 Suscripciones → Suscripciones (o Negocios → detalle):

- **Cancelar:** pide motivo; estado `canceled`; el negocio pasa a Gratis de inmediato.
- **Cambiar plan:** cambia el plan conservando las fechas (por ejemplo, PRO → Premium).
- **Dar meses:** de 1 a 36 meses de cortesía (`source = 'admin'`); si ya tiene ese plan vigente, se suman al final.
- Si el cliente paga un plan distinto al que tiene, al aprobarlo el plan cambia y el período empieza ese día.

## Funciones por plan (entitlements)

El servidor calcula las funciones a partir del plan efectivo (`plan_entitlements`). En la app, con el negocio
conectado a Vento Nube:

| Entitlement | Qué abre en la app |
|---|---|
| `pos_basic` | Vender (cobrar, cuentas, venta rápida). Con la suscripción vencida igual se puede vender. |
| `voice` | Micrófono, «Hola Vento», producto por voz |
| `ocr`, `ai_camera` | Leer facturas con la cámara/galería, vender escaneando |
| `advanced_reports` | Estadísticas |
| `multi_branch` | Agregar sedes |
| `employee_management` | Invitar personas al negocio |
| `invoices` | Facturas de proveedor |
| `expenses` | Gastos |

Si una función no está en el plan, al tocarla sale **«Función PRO»** con el botón **Ver planes**.
Para otros servicios del servidor existe `negocio_tiene(negocio, 'voice')` en la base de datos.

## Configuración (`billing_config`)

| Campo | Para qué | Dónde se cambia |
|---|---|---|
| `beta_mode` | `true` = solo pago manual (Nequi/DaviPlata). `false` = se podrán ofrecer otros medios (Google Play). | Panel → Configuración |
| `trial_days` | Días de prueba gratis | Panel → Configuración |
| `renew_notice_days` | Días antes del vencimiento para avisar «Renovar» | Panel → Configuración |
| `manual_methods` | Número y titular de NEQUI y DAVIPLATA | Panel → Configuración |
| `support_whatsapp` | WhatsApp de soporte | Panel → Configuración |
| `trial_desde` | Inicio de la beta (para la prueba de los negocios antiguos) | SQL |

## Referencia técnica

**Tablas nuevas** (migraciones `20261005000000_suscripciones.sql` y `20261006000000_suscripciones_lanzamiento.sql`):
`plans`, `entitlements`, `plan_entitlements`, `billing_config`, `platform_admins`, `subscriptions`,
`payment_records`, `payment_proofs`, `payment_events` y el bucket privado `comprobantes`. RLS en todas;
las escrituras solo por funciones `srv_*` que ejecuta el servidor.

**Rutas** (`/functions/v1/vento-suscripciones`): `GET /salud`, `GET /planes`, `GET /clave`, `POST /estado`,
`POST /pago`, `POST /admin/{yo, pagos, comprobante, aprobar, rechazar, suscripciones, negocios, negocio,
cancelar, cambiar_plan, dar, planes, plan_guardar, config_guardar}`, `POST /vencer` (cron) y
`POST /google-play/rtdn` (501 en beta).

**Pruebas:** `bash pruebas/correr.sh servidor` (servidor contra PostgreSQL 16 real) y
`bash pruebas/correr.sh suscripnube` (la app). Ver `pruebas/LEEME.md`.
