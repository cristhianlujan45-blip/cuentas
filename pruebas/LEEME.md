# Pruebas automáticas de Vento

Cada archivo `*.test.js` abre Vento en un Chromium sin ventana, hace lo que haría una persona
(entrar, anotar pedidos, hablar, cobrar…) y revisa el resultado. No usan internet ni datos reales:
el micrófono, la APK y los servicios externos se simulan.

| Prueba | Qué revisa |
|---|---|
| `hola` | «Hola Vento» manos libres: palabra de activación, conversación seguida, apagar/prender |
| `holaapk` | Lo mismo dentro de la APK simulada + botón de permisos |
| `voz1ra` | El micrófono escucha a la primera (frases cortas que Android da como parciales) |
| `vozundo` | Deshacer / repetir pedidos por voz y preguntas de cuenta |
| `divtest` | Dividir la cuenta entre N personas |
| `suscrip` | Prueba gratis, licencias firmadas, bloqueo al vencer (con una llave de prueba temporal) |
| `googletest` | Entrar con Google (Vento Nube simulada) |
| `tvocupado` | Conectarse al TV aunque otro celular ya esté conectado |
| `esc` | Computador: Enter abre la mesa, Esc la cierra, ancho de pantalla grande |
| `pasos` | Tarjeta «Primeros pasos» para negocios nuevos |

## Cómo correrlas

```bash
cd pruebas
npm install
npx playwright install chromium
cd ..
bash pruebas/correr.sh            # todas
bash pruebas/correr.sh hola pasos # solo algunas
```

El script levanta un servidor local en el puerto 8765 si no hay uno. Al final dice
«✅ Todas las pruebas pasaron» o cuál falló.

Regla del equipo: **antes de publicar un cambio, correr todas las pruebas.**
Las pruebas del panel de Administrador no están aquí porque usan el código personal del proveedor.
