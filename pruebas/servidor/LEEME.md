# Supabase local para las pruebas (PostgreSQL 16 real)

`supabase-local.js` levanta en segundos un «Supabase de mentiras» que usa una base de datos **de verdad**:

- crea una base desechable propia por proceso (`vento_test_<pid>_<azar>`), así varias pruebas pueden correr a la vez;
- aplica `stub.sql` (roles `anon` / `authenticated` / `service_role`, `auth.users`, `auth.uid()`, `auth.jwt()`, `storage`,
  publicación `supabase_realtime`, permisos por defecto como Supabase) y luego **todas** las migraciones de
  `supabase/migrations/` en orden;
- imita por HTTP lo que usan la app y las funciones: `/auth/v1/*` (registro, entrar, renovar sesión, usuario),
  `/rest/v1/rpc/<función>` y `/rest/v1/<tabla>` (con el rol y el JWT de quien llama: RLS y permisos reales),
  `/storage/v1/object/*` (en memoria) y las Edge Functions `vento-pagos` y `vento-suscripciones` (su `app.ts`, con Node);
- borra la base al cerrar (y limpia las que hayan quedado de procesos muertos).

Necesita `cd pruebas && npm install` (instala `pg` y `@supabase/supabase-js`) y PostgreSQL 16. Si PostgreSQL está apagado lo
prende (`service postgresql start`). Se conecta a `VENTO_PG_URL` (por defecto
`postgres://postgres:postgres@127.0.0.1:5432/postgres`); si corre como root y esa clave no sirve, le pone `postgres` al
usuario `postgres` (solo para equipos de pruebas).

## Usarlo en una prueba de Node

```js
const { iniciar } = require('./servidor/supabase-local');
const sb = await iniciar({ env: { VENTO_ADMIN_EMAILS: 'jefe@vento.co' } });
// sb.url, sb.anonKey, sb.serviceKey, sb.cron (secreto de /vencer), sb.pgUrl
const ana = await sb.usuario('ana@x.co');          // { id, email, token } sin pasar por HTTP
await sb.sql("update subscriptions set expiry_date = now() - interval '1 day'");   // mover fechas
sb.fallos.storage = 1;                               // la próxima subida a Storage falla (503)
await sb.cerrar();
```

## Usarlo en una prueba de navegador (Playwright)

```js
const { iniciar, enrutar } = require('./servidor/supabase-local');
const sb = await iniciar();
const ctx = await browser.newContext();
await enrutar(ctx, sb);   // https://<lo-que-sea>.supabase.co/* → este servidor, y supabase-js del CDN → pruebas/node_modules
```

La app sigue usando la URL y la clave pública de `nube/config.js`: `enrutar` cambia esa clave por `sb.anonKey` en el camino,
así que no hay que tocar nada de la app. Conviene abortar el resto de internet en la prueba (como hacen las demás).

CORS: el servidor acepta cualquier `http://localhost:<puerto>`; a las funciones les agrega ese origen a `VENTO_ORIGENES`.
El tiempo real (websocket) no se simula: la app reintenta sola. Dejarlo corriendo a mano:
`node pruebas/servidor/supabase-local.js 54321`.
