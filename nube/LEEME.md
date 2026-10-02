# Vento Nube: base de datos de usuarios

Con Vento Nube:
- cada persona entra con **su correo y contraseña**;
- todos los celulares del negocio comparten los mismos datos: caja, meseros, y el dueño desde la casa;
- hay respaldos automáticos en la nube.

La base de datos es **Supabase**: PostgreSQL gratis con usuarios incluidos. Funciona desde GitHub Pages sin servidor propio.

Es opcional: si no se configura, Vento sigue funcionando igual, todo en el celular.

> **Nuevo (1.16): despliegue automático.** Si agregas los secretos `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` y `SUPABASE_DB_PASSWORD` en GitHub (Settings → Secrets and variables → Actions), el flujo **Actions → Servidor Vento** hace solo los pasos 1.2 y 2. Crea las tablas, sube el servidor de pagos de Nequi y DaviPlata, y conecta todos los celulares. Ver [`supabase/LEEME.md`](../supabase/LEEME.md).

## 1. Crear la base de datos (una sola vez, unos 5 minutos)

1. **Crear el proyecto.**
   1. Entra a <https://supabase.com> y toca **Start your project**. Puedes entrar con tu cuenta de GitHub.
   2. Toca **New project** y llena:
      - Name: `vento`
      - Database Password: una contraseña larga; guárdala.
      - Region: **South America (São Paulo)**, la más cercana a Colombia.
   3. Espera 1 o 2 minutos a que el proyecto quede listo.
2. **Cargar las tablas.**
   1. En el menú de la izquierda abre **SQL Editor** y toca **New query**.
   2. Copia **todo** el contenido de [`nube/schema.sql`](schema.sql), pégalo y toca **Run**. Debe decir *Success*. Se puede volver a correr sin dañar nada.
3. **Revisar el acceso con correo** en **Authentication → Sign In / Providers → Email**.
   - "Email" debe estar activado (viene así).
   - **Recomendado:** apaga **Confirm email**. Así cada persona entra apenas crea su cuenta.
   - Si lo dejas encendido, cada persona debe abrir el correo de confirmación antes de entrar.
4. **Copiar los dos datos de conexión** en **Project Settings → API** (o **Data API / API Keys**):
   - **Project URL**, por ejemplo `https://abcdefghijklmnop.supabase.co`;
   - la clave **pública**: `anon` `public` o `publishable` (`sb_publishable_…`).

   ⚠️ **Nunca** copies la `service_role` / `secret`: esa es privada. Vento la rechaza si la pegas.

## 2. Conectar Vento

**Opción A, en el celular del dueño:**
1. Ve a Vento → **Ajustes → ☁️ Nube y usuarios → Abrir Vento Nube**.
2. Pega la URL y la clave pública y toca **Guardar**.
3. Escribe tu correo, contraseña y nombre, y toca **Crear cuenta**.
4. Toca **☁️ Subir el negocio de este celular a la nube**. Tú quedas como **dueño**.

**Opción B, que todos los celulares queden conectados solos:** pon los dos datos en [`nube/config.js`](config.js) (o pásaselos a Claude para que los ponga). La clave pública puede ir ahí sin problema.

## 3. Agregar al equipo

1. En **Vento Nube**, elige el rol y toca **➕ Invitar**. Sale un código de 8 letras, de un solo uso, que vence en 7 días.
2. Toca **📋 Copiar link para conectar otro celular** y mándalo por WhatsApp junto con el código.
3. La otra persona abre el link y sigue estos pasos:
   1. En la pantalla de entrada toca **☁️ Entrar con Vento Nube**.
   2. Toca **Crear cuenta**.
   3. Escribe el código y toca **Unirme**.
   4. Entra directo al negocio.

| Rol | Qué puede hacer |
|---|---|
| Dueño | Todo. Invita a cualquiera, cambia roles, quita personas y restaura respaldos. |
| Administrador | Todo en la app. Invita meseros y cajeros, quita meseros y cajeros, y restaura respaldos. |
| Cajero | Toda la app. No maneja el equipo. |
| Mesero | Entra en **modo mesero** (lo mismo que los meseros de siempre). |

## Cómo se sincroniza

- **Al guardar:** cada vez que la app guarda algo (un pedido, un cobro, un producto), lo sube a la nube a los 3 segundos.
- **Cada 15 segundos,** y al volver a la app, revisa si otro celular cambió algo y lo trae.
- **Si dos celulares cambian algo a la vez,** se **mezclan** los cambios en vez de que uno borre al otro:
  - **Mesas:** cada uno agrega a mesas distintas, o a la misma mesa, y se ven los dos.
  - **Stock:** el mismo producto vendido en los dos celulares descuenta las dos ventas (20 → 18 y 17 → queda 15).
  - **Cobro y producto nuevo:** si uno cobra y el otro agrega un producto, quedan los dos cambios.
  - **Mismo dato cambiado en los dos** (el nombre del negocio o el precio del mismo producto): gana el que llegó primero a la nube.
- **Sin internet:** se sigue trabajando normal y se sube apenas vuelve la señal.
- **Respaldos:** uno por hora como máximo; se guardan los últimos 48. Se restauran desde **Respaldos en la nube**.
- **Antes de bajar los datos de la nube** a un celular que ya tenía datos, queda un punto de restauración local.

## Seguridad

- **Row Level Security** en todas las tablas: cada usuario solo ve los negocios de los que es miembro, y quien no tiene sesión no ve nada.
- **Cambios por funciones:** los cambios se hacen solo con funciones que revisan el rol. Un mesero no puede invitar ni editar tablas directamente.
- **Claves:** en la app solo va la clave pública. Las contraseñas las guarda Supabase cifradas; Vento nunca las ve.

**Probado** con PostgreSQL 16 y la app en dos celulares simulados:
- dueño y mesero;
- invitación de un solo uso;
- mesero sin permiso para invitar;
- un extraño no ve nada;
- sin sesión, permiso denegado;
- conflicto de versión, mezcla y respaldos.

## Límites del plan gratis de Supabase

- 500 MB de base de datos (sobra para muchos negocios) y hasta 50.000 usuarios activos al mes.
- **Si el proyecto no se usa en 7 días, Supabase lo pausa.** Se reactiva con un clic en el panel. Mientras la app se use a diario no pasa.
- Las fotos de las facturas siguen guardándose solo en el celular donde se tomaron; a la nube va el resto de los datos.
