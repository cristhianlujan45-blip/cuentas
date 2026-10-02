# Vento 1.17.4: Google se conecta en Brave y en la app instalada, y queda fijo

## Qué pasaba

Al tocar «Conectar con Google», Google mostraba la pantalla de permiso. Pero al tocar «Continuar» **todo se quedaba quieto**.

- Vento usaba una ventanita (popup) de Google. En **Brave**, en la app instalada y en varios celulares, esa ventanita se abre como **pestaña aparte**. Desde ahí Google no logra devolverle el código a Vento.
- La pantalla decía «ya tiene cierto acceso»: ya se había dado permiso antes. En ese caso Google puede **no entregar la llave de renovación**, y sin ella la conexión se vence a la hora.

## Arreglo

- **Sin ventanitas:** se usa el flujo oficial OAuth 2.0 para aplicaciones web con **redirección**. Vento va a Google, se toca «Continuar», y Google devuelve a Vento a la dirección registrada:
  - `https://cristhianlujan45-blip.github.io/cuentas/`
  - La dirección es la misma aunque Vento se abra como `…/cuentas/index.html`.
- **Llave permanente siempre:** se pide `access_type=offline` y `prompt=consent`. Así Google entrega la llave de renovación aunque ya se hubiera dado permiso antes.
- **Al volver de Google:**
  - Vento espera hasta 90 s a que Vento Nube esté lista y canjea el código en el Servidor Vento, que guarda la llave cifrada.
  - Aparece «Google conectado para siempre».
  - Desde ahí se renueva sola, en todos los celulares del negocio, sin volver a pedir autorización.
- **Seguridad:**
  - Cada conexión lleva un código único (state). Si una respuesta de Google no corresponde a esa conexión, se rechaza.
  - El Client Secret solo pasa por la memoria de la pestaña y se borra al terminar; nunca queda guardado en el celular.
- **Sin Client Secret, Vento ya no manda a Google para nada.** Solo se exige si el servidor no lo tiene guardado de una conexión anterior. En ese caso lo pide y lleva al campo donde se pega.
- **Sin Vento Nube**, se avisa que así la conexión dura solo 1 hora.

## Lo que debe tener Google Cloud (ya hecho por el dueño)

- **Orígenes de JavaScript:** `https://cristhianlujan45-blip.github.io`
- **URIs de redireccionamiento:** `https://cristhianlujan45-blip.github.io/cuentas/`
- **Público → Publicar app** («En producción»). Si queda «En prueba», Google vence la llave cada 7 días.

## Pruebas (navegador + Servidor Vento + Google simulado)

13/13. Cubren:
- ir a Google y volver con el código;
- pedir la llave permanente;
- renovación sola;
- otro celular del negocio;
- reconectar sin volver a pegar el Client Secret;
- rechazo de una respuesta ajena;
- el caso sin Client Secret;
- el caso sin Vento Nube.
