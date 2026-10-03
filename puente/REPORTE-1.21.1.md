# Vento 1.21.1: «🩺 Probar conexión» del puente de YouTube

El dueño dice que el puente está bien configurado pero «no lo coge». Desde el entorno de desarrollo no se puede llegar a `workers.dev` ni a `youtube.com` (la red lo bloquea), así que se agregó una prueba dentro de Vento que dice exactamente qué paso falla.

## «🩺 Probar conexión»

Está en Música → «¿Tu TV no aparece?», junto a «Ver qué pasó». Revisa:

1. **En la app de Android:** que la app hable directo con YouTube (puente incluido).
2. **Que el puente responda:** la dirección es correcta y el código es el de Vento.
3. **Que el puente llegue a YouTube:** se pregunta por un código de TV inventado; si YouTube contesta «no existe», el camino funciona.
4. **Si ya hay un TV vinculado, que conteste.**

Cada resultado dice qué hacer si falla:
- **«no es el puente de Vento»:** en Cloudflare, pegar el código y tocar Deploy.
- **«no deja pasar a Vento»:** el código del puente está viejo o incompleto.
- **«no responde»:** la dirección está mal escrita.

El resultado queda en el registro para copiarlo.

## En la app: respaldo automático

Si la conexión directa de la app con YouTube falla (no hubo conexión), Vento usa el puente configurado, si hay uno.

## Pruebas

**3/3:**
- puente bueno;
- puente que no deja pasar a Vento (se explica qué hacer);
- app con puente incluido.

Además: la app 15/15, el flujo de música 9/9, YouTube del TV 24/24, código de TV 5/5 y e2e.
