# Vento 1.24.1 — Recuperar contraseña por correo con ENLACE (Supabase gratis)

## Qué pasó
Supabase respondió al configurar el correo con código: «Email template modification is not available for
free tier projects using the default email provider». En el plan gratis con el correo de Supabase no se
puede cambiar el correo: llega con un **enlace**, no con un código. Además ese correo gratis solo se manda a
los correos del **equipo** del proyecto de Supabase.

## Qué cambió
- «¿Olvidaste tu contraseña?» → «📧 Enviarme un enlace al correo». Se toca el enlace desde el celular:
  Vento se abre, el servidor confirma de quién es el correo (no se puede inventar un enlace), pide la
  contraseña nueva y cierra el permiso. El permiso se borra de la dirección enseguida.
- Si el enlace se abre en Chrome y la cuenta está en la **app Vento**: botón «📲 Abrir en la app Vento»
  (la app abre los enlaces `vento://abrir…`).
- Vento Nube: «¿Olvidaste tu contraseña? Te mando un enlace al correo» (enlace de recuperación de Supabase).
- Guardar el correo de recuperación ahora pide la contraseña actual.
- Servidor Vento: deja permitida la vuelta a Vento desde el enlace. **Opcional**: con los secretos
  `VENTO_SMTP_HOST`, `VENTO_SMTP_PORT`, `VENTO_SMTP_USER`, `VENTO_SMTP_PASS`, `VENTO_SMTP_FROM` (correo
  propio) se manda a cualquier correo y con código de 6 números (la app acepta los dos).

## Pruebas
- `segur2.js` 9/9 (enlace real contra servidor simulado: comprobación, enlace inventado, abrir en la app,
  Vento Nube), `segur.js` 13/13, laya2, apk, e2e.
