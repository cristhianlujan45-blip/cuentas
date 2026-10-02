# Vento 1.16: Servidor Vento para pagos con Nequi y DaviPlata

## 1. Lo que permiten Nequi y DaviPlata (investigado en fuentes oficiales)

| Entidad | Mecanismo oficial disponible | En Vento |
|---|---|---|
| Nequi | **Nequi Conecta**, la API oficial para negocios: cobro push, QR, estado y reverso. Credenciales: Client ID, Client Secret, API Key y código de comercio. | ✅ Implementado: cobro push, QR y consulta de estado. Nequi reporta `35` = pago realizado. |
| Nequi | **Wompi** (Bancolombia), método NEQUI, con eventos firmados. | ✅ Implementado. |
| DaviPlata | **Wompi**, método DAVIPLATA. El cliente confirma con OTP en Wompi. | ✅ Implementado. |
| DaviPlata | **API Pago DaviPlata** (Davivienda): exige convenio y certificado; la especificación no es pública. | ❌ **No implementado:** Vento no inventa endpoints. Queda descrito en `supabase/LEEME.md`. |

- **Avisos del celular (auxiliar, MacroDroid):** quedan como alternativa y ahora también llegan al servidor, con el token del celular.
- **Lo que no hace Vento:** no entra a las apps bancarias.

## 2. Qué se construyó

```
NEQUI / DAVIPLATA → Wompi o Nequi Conecta → SERVIDOR VENTO → base de datos → Vento → celulares autorizados
```

### Servidor: Supabase Edge Function `supabase/functions/vento-pagos`

- **Rutas:** `config`, `cobro`, `estado`, `sync`, `webhook/wompi/{token}`, `aviso/{token}`, `push-clave` y `salud`.
- **Clientes de las entidades:**
  - Wompi: comercio, transacciones, link firmado y verificación de eventos.
  - Nequi Conecta: token OAuth2, push, QR y estado.
- **Seguridad del webhook:**
  - Firma SHA-256 de Wompi, revisada en el cuerpo y en el encabezado, comparada en tiempo constante.
  - Se descartan los eventos de otro ambiente.
- **Duplicados e idempotencia:**
  - El mismo evento dos veces no cambia nada, gracias a una huella única.
  - Tocar dos veces "Cobrar" crea un solo cobro (clave de idempotencia).
  - Varios celulares a la vez: el pago se registra en la mesa una sola vez (`aplicar_pago`).
- **Estados:** pendiente, aprobado, rechazado, anulado, error y vencido.
  - Un pago aprobado no vuelve a pendiente.
  - Si el valor pagado no coincide con el cobro, queda en **error** y no se aprueba.
- **Reintentos:** las consultas se repiten con espera creciente. La creación de cobros no se repite sola, para no cobrar dos veces.
- **Sin depender del webhook:** se consulta el estado mientras haya cobros pendientes, tanto desde los celulares abiertos como desde GitHub Actions cada 10 minutos.
- **Notificaciones:**
  - En tiempo real (Supabase Realtime).
  - **Web Push cifrado**, que avisa aunque Vento esté cerrada. Solo llega a dueño, administrador y caja.

### Base de datos: `supabase/migrations`

- **Tablas:**
  - `pagos`
  - `pago_eventos` (log)
  - `pago_proveedores` (credenciales cifradas con AES-256-GCM)
  - `dispositivos` (solo se guarda el hash del token)
  - `auditoria`
  - `servidor_config`
- **Seguridad:**
  - RLS en todas las tablas.
  - Funciones con control de rol.
  - Las funciones `srv_*` solo las puede usar el servidor.

### App: `nube/vento-pagos.js` y `sw.js`

- **Ajustes → 💜 Pagos: Nequi y DaviPlata:**
  - Estado de **NEQUI 🟢** y **DAVIPLATA 🔵**, cada uno Conectado o Pendiente, con el motivo.
  - Botones **Conectar Nequi** y **Conectar DaviPlata**.
  - Botón **🔄 Comprobar**.
  - Comprobaciones automáticas: nube, sesión, servidor, celular y avisos.
  - URL de eventos lista para copiar.
  - Celulares autorizados, con opción de retirarlos.
  - Historial.
  - Avisos del celular (auxiliar).
- **Asistente:** verifica las credenciales con la entidad antes de guardarlas y dice exactamente qué falló, por ejemplo una llave privada rechazada o llaves de prueba mezcladas con las de producción.
- **Cuenta → "💜 Cobrar Nequi / DaviPlata":**
  - Link o QR de Wompi (Nequi, DaviPlata, tarjeta o PSE).
  - Cobro push a su Nequi.
  - QR de Nequi.
  - El estado se ve en vivo; al aprobarse se registra solo en la cuenta.
- **Pago sin mesa** (por ejemplo, un link o un aviso): sale la ventana de siempre, «💜 Llegó un pago», para elegir la cuenta.
- **Celulares:** cada celular se registra solo al entrar, con un id y un token seguro, y manda un latido. Si se queda sin conexión, al volver sincroniza los pagos guardados en el servidor.

### Despliegue: `.github/workflows/servidor-vento.yml`

El flujo hace todo esto:
1. Crea las tablas (migraciones).
2. Fija los secretos internos: sitio, CORS y el secreto del repaso.
3. Despliega la función.
4. Comprueba que el servidor responda.
5. Escribe la URL y la clave pública en `nube/config.js`, con lo que todos los celulares quedan conectados.

Si faltan los secretos, no falla: avisa qué falta.

## 3. Lo único que le toca al dueño

Son autorizaciones que solo él puede dar:

1. **Autorizar el servidor (una vez):**
   1. Crear un token en Supabase → Account → Access Tokens.
   2. En GitHub → Settings → Secrets and variables → Actions, agregar `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` y `SUPABASE_DB_PASSWORD`.
   3. Ir a Actions → **Servidor Vento** → *Run workflow*.
2. **Credenciales de la entidad,** en Vento → Ajustes → 💜 Pagos:
   - **Wompi:** las 4 llaves de *Desarrolladores*.
   - **Nequi Conecta:** Client ID, Client Secret, API Key y código de comercio.
3. **(Recomendado)** Pegar en Wompi la **URL de Eventos** que muestra Vento. Sin este paso igual funciona, porque Vento consulta el estado.

## 4. Autocomprobación

- **Base de datos:** 31 pruebas de permisos, duplicados, estados, tokens y auditoría en PostgreSQL 16, con la migración aplicada dos veces (idempotente).
- **Servidor:** **68/68** con Wompi, Nequi y el servicio push simulados. Cubre:
  - firma válida, alterada y de otro secreto;
  - token desconocido;
  - ambiente distinto;
  - duplicados;
  - valor distinto al cobrado;
  - Wompi caído con reintentos;
  - push y QR de Nequi;
  - llaves mezcladas;
  - roles y CORS;
  - sesión vencida;
  - push cifrado, descifrado con `http_ece` y firma VAPID verificada;
  - el log no guarda secretos.
- **App + servidor + base de datos:** **19/19** en el navegador, con dos celulares a la vez:
  - conectar DaviPlata;
  - cobrar la mesa 3 con QR;
  - llega el evento firmado;
  - se registra **una sola vez**;
  - un aviso de DaviPlata se recupera al reconectarse.
- **Tipos:** `deno check` y `deno lint` sin errores.
- **Regresión:** pagos (MacroDroid), calculadora, pedidos QR, Laya, vitrina de pedidos, recorrido completo y `todos`.

### Corregido durante la revisión

- **Cambios de estado:** el contador de cambios contaba también los datos que no son de estado.
- **Tokens inventados:** un webhook con un token inventado escribía en la base. Ahora no escribe nada.
- **Clave pública:** ahora se toma primero la de la app, para que funcione con las claves nuevas `sb_publishable_` de Supabase.

## 5. Panel de notificaciones (campana) corrido a la derecha

**Causa probable:** en algunos celulares el panel se calculaba con medidas que no son las de la pantalla:
- el ancho "virtual" de la página, que en Android puede crecer más que lo visible;
- o la referencia de `position:fixed`, que cambia con temas que usan efectos en el fondo.

Con eso quedaba corrido unos 270 px y cortado.

**Arreglo:**
- **Medida real:** el panel se ubica con lo que realmente se ve (`visualViewport`, `clientWidth` y `screen.width`).
- **Comprobación al abrir:** mide dónde quedó en la pantalla y se corrige solo si algo lo movió (zoom, efectos del tema, desplazamiento).
- **Se reacomoda solo** al girar el celular, al salir el teclado o al moverse la vista.

**Probado:** quedan 8 px de margen a cada lado en estos casos:
- tamaños de letra de 100, 130 y 150 %;
- modo fácil;
- ancho virtual inflado a 980 px;
- fondo con `transform` y con `filter`;
- zoom de 1,5;
- contenedor corrido 270 px, que es el caso de la captura.

## No se tocó

- YouTube Music.
- QR físicos.
- Datos guardados.
- El método MacroDroid por ntfy, que sigue igual.

Sin Vento Nube configurada, Vento funciona exactamente como antes.
