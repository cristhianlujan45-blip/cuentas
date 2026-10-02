# Vento 1.17: Música — Google se reconecta solo

## Qué fallaba

La conexión de Vento con Google (YouTube) dura **1 hora**. Al vencerse, Vento intentaba renovarla "en silencio", pero eso tiene dos problemas:

- **Bloqueo de ventanas:** Google siempre necesita abrir una ventanita para renovar, y el celular bloquea las ventanas que no se abren con un toque de la persona. Fallaba sin avisar, y quedaba el aviso para tocar «Reconectar» cada hora.
- **App instalada:** desde la versión 1.15.1 Vento se instala como app de verdad. En ese modo, la ventanita de Google puede quedarse en blanco y no volver a Vento («no conecta con Google»).

## Arreglo: la conexión ya no se vence (Servidor Vento)

Se usa el flujo oficial de Google de **código de autorización**, igual que las apps grandes:

1. **Conexión, una sola vez:**
   - pegas el **Client Secret** (Google Cloud → Credenciales → tu ID de cliente de OAuth);
   - tocas **Conectar con Google**;
   - el Servidor Vento guarda, cifrada, la **llave de renovación** que entrega Google.
2. **Renovación sola:** Vento pide un acceso nuevo al servidor antes de que venza. Pasa cada minuto si faltan menos de 6, al volver a la app y al volver el internet. Sin ventanas y sin botón.
3. **Todos los celulares del negocio** obtienen el acceso del servidor, sin conectar nada en cada uno.
4. **Instalada como app:** se usa el modo de redirección de Google, que no depende de ventanitas. Vento canjea el código al volver y limpia la dirección.
5. **El aviso «Reconectar»** solo aparece si de verdad se quitó el permiso en Google.
6. **Sin Vento Nube,** el «Conectar» de siempre sigue funcionando y ahora dice claramente si el celular bloqueó la ventana.

**Seguridad:**
- El Client Secret y la llave de renovación solo los tiene el servidor, cifrados con AES-GCM.
- La app nunca los ve, y el Client Secret no queda guardado en el celular.
- Conectar u olvidar la conexión: solo dueño o administrador. Pedir accesos: cualquier miembro del negocio.

## Lo que tiene que hacer el dueño (una vez)

1. **Entrar a Vento Nube** (si no lo ha hecho).
2. **En Música → YouTube Music automático:** pegar el **Client Secret** y tocar **Conectar con Google**.
3. **Publicar la app de OAuth:** en Google Cloud → **Pantalla de consentimiento de OAuth**, tocar **Publicar app** (pasar a «En producción»). Si se deja «En prueba», **Google vence la llave cada 7 días**.
4. **Solo si Vento está instalada como app:** en Google Cloud → Credenciales → tu cliente → **URIs de redireccionamiento autorizados**, agregar la dirección que muestra Vento en Música: `https://cristhianlujan45-blip.github.io/cuentas/`.

## Probado

- **Servidor:** 15/15 contra PostgreSQL real con Google simulado. Cubre:
  - conectar, sin secret, secret malo;
  - el mesero no puede conectar;
  - llaves cifradas;
  - renovaciones sucesivas;
  - un extraño no recibe nada;
  - modo redirección;
  - permiso revocado → 409;
  - olvidar la conexión;
  - auditoría sin secretos.
- **App:** 10/10 en el navegador. Cubre:
  - conecta por el flujo de código;
  - el secret no queda en el celular;
  - a 1 minuto de vencer se renueva sola, sin ventanas;
  - ya vencida, se reconecta al volver a la app;
  - «Conectar» no vuelve a abrir Google;
  - otro celular obtiene acceso sin conectar;
  - con el permiso revocado aparece «Reconectar»;
  - el regreso de Google en modo app;
  - sin la nube sigue el flujo de siempre.
- **Regresión:**
  - TV, recorrido completo, pedidos QR, todos los negocios: sin errores.
  - Pagos: 12/12.
  - Servidor de pagos: 68/68.
  - App + servidor: 22/22.
- **Canales de pedidos, canciones y TV (ntfy):** ya se reconectaban solos (cada 15 s revisan, al volver la señal y al volver a la app). No se tocaron.

## No se tocó

- La reproducción en YouTube Music.
- Los enlaces de YouTube Music.
- Los QR.
- La cola.
