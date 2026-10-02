# Vento 1.17.5 y 1.17.6: Google — Client ID del negocio y avisos claros

- **1.17.5:** el Client ID de Google del negocio (`896233860758-…apps.googleusercontent.com`) queda puesto por defecto.
  - Es un dato público: Google lo muestra en su propia página de permiso.
  - Si quedó guardado otro Client ID de pruebas anteriores, se cambia una vez por este.
- **Redirección comprobada en el celular del dueño:** Google ya devuelve a Vento sin quedarse quieto. El error que salió fue «Google rechazó el Client ID o el Client Secret»: el Secret pegado no corresponde a este cliente.
- **Revisión del Secret antes de ir a Google:**
  - si se pegó el Client ID en su lugar, se avisa sin salir de Vento;
  - si no tiene la forma `GOCSPX-…`, se pregunta antes de usarlo.
- **Secret rechazado por Google:** el aviso explica el paso exacto: Google Cloud → Clientes → «Cliente web 1» → Secretos del cliente → «Agregar secreto», copiarlo completo y pegarlo. Google ya no deja volver a ver los secretos viejos.
- **El aviso de Música dice qué falta de verdad**, con el botón que lo arregla:
  - sesión de Vento Nube;
  - servidor sin respuesta;
  - conectar una vez;
  - error de renovación.
  - Antes decía siempre «se venció (dura 1 hora) → Reconectar».
- **Lista del TV sin acceso a Google en ese momento:** primero se renueva sola por el servidor y la canción entra. Si falta algo, el aviso sale máximo una vez cada 10 min y con el motivo.
- **Sin Vento Nube:** también se conecta por redirección (sin ventanita), pero por 1 hora, y se avisa.
- **Pruebas:** 15/15 (navegador + Servidor Vento + Google simulado), e2e bien.
