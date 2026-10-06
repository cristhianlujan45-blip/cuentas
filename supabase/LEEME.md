# Servidor Vento: pagos con Nequi y DaviPlata

```
 NEQUI ──► Nequi Conecta (API oficial) ─┐
                                        ├──► SERVIDOR VENTO ──► base de datos ──► Vento app ──► celulares autorizados
 DAVIPLATA ─► Wompi (pasarela oficial) ─┘    (Supabase Edge       (Postgres +       (tiempo real,     (dueño, caja,
 NEQUI ─────► Wompi (pasarela oficial) ─┘     Function)            seguridad RLS)    push, historial)   meseros…)

 Auxiliar: notificación de la app del banco reenviada desde un celular autorizado (MacroDroid) ─► mismo servidor
```

## Qué integración usa cada entidad (fuentes oficiales)

| Entidad | Mecanismo oficial | Qué hace Vento |
|---|---|---|
| **Nequi** | **Nequi Conecta**, la API de Nequi para negocios ([conecta.nequi.com.co](https://conecta.nequi.com.co)): token OAuth2, cobro push, QR dinámico, consulta de estado. | Cobro push al celular del cliente y QR de Nequi. Consulta el estado hasta que Nequi responde `35` (pago realizado). |
| **Nequi** | **Wompi**, la pasarela de Bancolombia ([docs.wompi.co](https://docs.wompi.co)), método `NEQUI`. | Link o QR de pago, evento firmado `transaction.updated` y consulta por referencia. |
| **DaviPlata** | **Wompi**, método `DAVIPLATA` (el cliente confirma con un código OTP en la página de Wompi). | Igual que Nequi por Wompi. |
| **DaviPlata** | **API Pago DaviPlata** de Davivienda (developers / API Market): requiere convenio con Davivienda y certificado. | **No se implementó.** Su especificación técnica no está publicada en abierto y Vento no inventa endpoints. Si se firma el convenio, se agrega con la documentación que entregue Davivienda. |

Vento **no** entra a las apps bancarias ni usa APIs no autorizadas.

## Qué hace el servidor (`functions/vento-pagos`)

**Detección automática.** Al llegar un evento, el servidor sigue estos pasos:
1. Identifica la entidad: Wompi por la ruta y la firma, Nequi por el cobro que se creó, aviso del celular por el token.
2. Valida la autenticidad:
   - **Wompi:** firma SHA-256 con el secreto de eventos, revisada en el cuerpo y en `X-Event-Checksum`, comparada en tiempo constante.
   - **Nequi:** consulta directa a Nequi.
   - **Aviso del celular:** token del dispositivo.
3. Normaliza el formato, guarda el evento en el log y detecta duplicados por huella única.
4. Aplica el estado con reglas:
   - un pago aprobado no vuelve a pendiente;
   - si el valor pagado no coincide con el cobro, el pago queda en error.
5. Asocia el pago a la mesa del cobro.
6. Avisa a los celulares en tiempo real (Supabase Realtime) y con Web Push cifrado (RFC 8291 y RFC 8292).
7. Deja todo en el historial y la auditoría.

**Idempotencia y reintentos.**
- Tocar dos veces «Cobrar» crea un solo cobro (clave de idempotencia).
- Un mismo evento repetido no cambia nada.
- Las consultas reintentan con espera creciente; la creación de cobros no se reintenta sola, para no cobrar dos veces.

**Sin depender del webhook.**
- Mientras un cobro está pendiente, los celulares abiertos le piden al servidor que consulte a Wompi o Nequi.
- GitHub Actions repasa cada 10 minutos.
- Los cobros vencen a los 30 minutos.

**Seguridad.**
- Las credenciales se cifran con AES-256-GCM antes de guardarse; la app nunca las lee.
- RLS en todas las tablas.
- Roles:
  - **Configurar:** dueño y administrador.
  - **Cobrar:** dueño, administrador, caja y mesero.
  - **Registrar en la caja:** dueño, administrador y caja.
- CORS solo para el sitio de Vento.
- Los logs no guardan secretos.

## Rutas

| Ruta | Quién | Para qué |
|---|---|---|
| `GET /salud` | cualquiera | Estado y versión del servidor. |
| `GET /push-clave` | cualquiera | Llave pública VAPID; se crea sola la primera vez. |
| `POST /config` | sesión | Consultar el estado, conectar Wompi o Nequi Conecta (verificando con la entidad), comprobar o desconectar. |
| `POST /cobro` | sesión | Crear un link de Wompi, un cobro push de Nequi o un QR de Nequi. |
| `POST /estado` | sesión | Consultar ya el estado de un pago. |
| `POST /sync` | sesión o `X-Vento-Cron` | Repasar los pagos pendientes. |
| `POST /webhook/wompi/{token}` | firma de Wompi | Eventos de Wompi. |
| `POST /aviso/{token}` | token del dispositivo | Aviso reenviado desde el celular (auxiliar). |

## Base de datos (`migrations/`)

| Tabla | Qué guarda |
|---|---|
| `pago_proveedores` | Credenciales cifradas y estado de Wompi y de Nequi Conecta. |
| `pagos` | Cada cobro o pago: estado, método, mesa, verificado y aplicado. |
| `pago_eventos` | Log de todo lo que llega, con su huella para detectar duplicados. |
| `dispositivos` | Celulares autorizados (solo el hash del token) y su suscripción push. |
| `auditoria` | Quién configuró, cobró, registró o revocó. |
| `servidor_config` | Llaves VAPID. |

## Despliegue (automático)

`.github/workflows/servidor-vento.yml` hace todo:
- aplica las migraciones;
- configura los secretos internos (sitio, CORS, secreto del repaso);
- despliega la función;
- comprueba que responda;
- escribe la URL y la clave **pública** en `nube/config.js`, para que todos los celulares queden conectados.

La llave de cifrado se deriva sola de la llave de servicio del proyecto.

**Lo único que hace el dueño (autorizaciones que solo él puede dar):**

1. **GitHub → Settings → Secrets and variables → Actions:** agregar `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` y `SUPABASE_DB_PASSWORD`. Luego, en **Actions → Servidor Vento → Run workflow**.
2. **En Vento → Ajustes → 💜 Pagos → Conectar Nequi / Conectar DaviPlata,** pegar las credenciales de su cuenta:
   - **Wompi:** las 4 llaves de *Desarrolladores*.
   - **Nequi Conecta:** Client ID, Client Secret, API Key y código de comercio.

   Vento las verifica con la entidad antes de guardarlas.
3. **(Recomendado)** Pegar la **URL de Eventos** que muestra Vento en Wompi → Desarrolladores. Sin este paso igual funciona, porque Vento consulta el estado, pero los avisos tardan unos segundos más.

## Variables opcionales del servidor

| Variable | Para qué |
|---|---|
| `VENTO_CIFRADO_CLAVE` | Llave AES propia (32 bytes en base64). Si no se define, se deriva sola. |
| `VENTO_ORIGENES`, `VENTO_SITIO`, `VENTO_CRON_SECRETO` | Las pone el flujo de despliegue. |

## Pruebas hechas

- **Servidor:** 68 casos contra PostgreSQL 16 real, con Wompi, Nequi y el servicio push simulados. Incluyen:
  - firma válida, alterada y de otro secreto;
  - eventos duplicados;
  - valor distinto al cobrado;
  - Wompi caído con reintentos;
  - cobro push y QR de Nequi (estado 35);
  - llaves mezcladas de prueba y producción;
  - roles, revocación de celulares y CORS;
  - push cifrado, descifrado con `http_ece` y firma VAPID verificada.
- **App + servidor + base de datos:** 19 casos en el navegador con dos celulares a la vez:
  - el dueño conecta DaviPlata;
  - cobra la mesa 3 con QR;
  - llega el evento firmado;
  - se registra **una sola vez** en la mesa;
  - un aviso de DaviPlata se recupera al reconectarse.
- **Revisión de tipos:** `deno check` y `deno lint` sin errores.

## Suscripciones de Vento (beta, `functions/vento-suscripciones`)

Cobro de la suscripción de **Vento** a cada negocio (no confundir con `pagos`, que son cobros a los clientes del negocio).
La suscripción es de la **cuenta + el negocio** (`negocios.id`), una sola fila por negocio, y el plan lo decide **siempre el
servidor**: la app consulta `POST /estado` y recibe un token firmado (ECDSA P-256, llave en `servidor_config` → `sub_firma`,
se crea sola) que le sirve sin internet hasta 72 h.

- **Migración** `20261005000000_suscripciones.sql`: `plans` (única fuente de precios), `entitlements`, `plan_entitlements`,
  `billing_config`, `platform_admins`, `subscriptions`, `payment_records`, `payment_proofs`, `payment_events` y el bucket
  privado `comprobantes`. RLS en todo; solo las funciones `srv_*` (servidor) escriben.
- **Flujo beta:** prueba gratis automática (PRO, `trial_days`) → la persona paga por Nequi o DaviPlata al número de Vento y
  envía la foto del comprobante (`POST /pago`) → queda **en revisión** (no activa nada) → un proveedor de Vento la aprueba o
  rechaza en el panel (`/admin/*`). Aprobar suma `interval '1 month'` desde hoy, o desde el vencimiento actual si es una
  renovación. Vencimiento al consultar y con el cron `/vencer` cada 10 minutos.
- **Anti-duplicados:** misma idempotencia → mismo pago; la misma referencia (por método) o la misma foto (sha256) no sirven
  para dos pagos vigentes; un solo pago en revisión por negocio; aprobar bloquea la fila (dos administradores a la vez →
  una sola activación). La foto se sube primero y el pago se guarda con su comprobante en una sola transacción: si Storage
  falla no se crea el pago.
- **Medios de pago:** interfaz `PaymentProvider` (`proveedores/`): `manual` (ahora) y `google_play` (solo arquitectura:
  responde 501 hasta que exista `GOOGLE_PLAY_PACKAGE` + `GOOGLE_PLAY_SERVICE_ACCOUNT` y `beta_mode = false`).
- **Administradores:** usuarios en `platform_admins`, o cuyo correo (confirmado) esté en el secreto opcional
  `VENTO_ADMIN_EMAILS` (GitHub → Secrets → `VENTO_ADMIN_EMAILS`, separados por comas): entran solos la primera vez.
- **Otros servicios** pueden hacer cumplir el plan con `negocio_tiene(negocio, 'voice' | 'ai_camera' | …)`.

| Ruta | Quién | Para qué |
|---|---|---|
| `GET /planes`, `GET /clave`, `GET /salud` | cualquiera | Catálogo y números de pago; llave pública del token. |
| `POST /estado` | cualquier miembro | Plan efectivo, funciones, pago pendiente/último, aviso de renovación y token firmado. |
| `POST /pago` | dueño o administrador | Pago con comprobante (JPEG/PNG/WebP ≤ 3 MB). |
| `POST /admin/…` | administrador de Vento | `yo`, `pagos`, `comprobante`, `aprobar`, `rechazar`, `suscripciones`, `negocios`, `negocio`, `cancelar`, `cambiar_plan`, `dar`, `planes`, `plan_guardar`, `config_guardar`. |
| `POST /vencer` | `X-Vento-Cron` | Vence las suscripciones con fecha pasada. |
| `POST /google-play/rtdn` | — | 501 mientras sea beta. |

Pruebas: `node pruebas/servidor/suscripciones.test.js` (141 casos contra PostgreSQL 16 real con `pruebas/servidor/supabase-local.js`).
