# Vento 1.16.3: Servidor Vento activo y comprobado

## Estado del servidor (comprobado en el Supabase real)

El flujo **Servidor Vento** (intento 14) desplegó todo. Los intentos 11 a 13 fallaron porque la contraseña de la base de datos estaba mal; después se corrigió.

**Qué quedó hecho:**
- **Tablas:** migraciones `20261002000000` (Vento Nube) y `20261002120000` (pagos) aplicadas.
- **Servidor:** función `vento-pagos` desplegada. Responde `{"ok":true,"version":"1.16.0"}`.
- **Secretos internos:** sitio, CORS y secreto del repaso.
- **Celulares:** `nube/config.js` quedó con la URL y la clave **pública** (rol `anon`) del proyecto, así que todos los celulares se conectan solos.

**Nuevo flujo «Comprobar Servidor Vento»:** corre solo después de cada despliegue y también a mano. Resultado: **17 de 17**.

| Prueba | Resultado |
|---|---|
| Salud del servidor y llave push | ✅ |
| Sin sesión no deja configurar (401) | ✅ |
| Webhook y aviso con tokens inventados (404 y 401) | ✅ |
| CORS: deja entrar al sitio de Vento y bloquea a otros | ✅ |
| Nadie de afuera lee las credenciales | ✅ |
| La app no puede usar las funciones internas del servidor (`srv_*`) | ✅ |
| Funciones de pagos y Vento Nube instaladas | ✅ |
| Migraciones aplicadas | ✅ |
| `config.js` con la clave pública | ✅ |

## Más automático: los avisos de MacroDroid también van al servidor

- **Reenvío automático:** cuando llega un aviso por MacroDroid (el canal de siempre), el celular de caja, dueño o administrador lo reenvía solo al Servidor Vento.
  - Queda guardado en la nube.
  - Avisa con push a los demás celulares, aunque tengan Vento cerrada.
  - No hay que cambiar nada en MacroDroid.
- **Sin duplicados:** si el mismo pago llega por las dos vías (MacroDroid y servidor), se reconoce como el mismo y no se repiten el aviso, la voz ni la ventana.
- **Probado:**
  - App + servidor: 22/22, incluido el caso MacroDroid → caja → servidor → dueño, que da 1 solo pago en cada celular.
  - Servidor: 68/68.
  - Pagos: 12/12.
  - Comprobantes: 11/11.

## Lo que falta (solo lo puede hacer el dueño)

1. **Entrar a Vento Nube:** en Vento, en la pantalla de entrada, tocar **☁️ Entrar con Vento Nube** y crear la cuenta del dueño. Luego tocar **Subir el negocio de este celular a la nube**.
   - Los demás celulares entran con una invitación (Ajustes → ☁️ Nube y usuarios → Invitar).
2. **Ajustes → 💜 Pagos → Conectar DaviPlata / Conectar Nequi:** pegar las llaves de **Wompi** (comercios.wompi.co → Desarrolladores) o de **Nequi Conecta**. Vento las verifica con la entidad.
3. **(Recomendado)** Pegar la **URL de Eventos** que muestra Vento en Wompi → Desarrolladores.
