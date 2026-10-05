# Vento para Android (APK)

La app abre la misma Vento de siempre (https://cristhianlujan45-blip.github.io/cuentas/), así que cada
mejora de Vento le llega sola, sin reinstalar. Le suma lo que un navegador no deja hacer:

| Qué | Cómo |
|---|---|
| **Todos los TV del wifi** (LG webOS, Samsung, TV Box, Android TV, Fire TV, Chromecast) | Búsqueda SSDP/DIAL en la red local, la misma que usa la app de YouTube (`BuscadorTV.java`) |
| **Conectar sin escribir códigos** | Abre YouTube en el TV por DIAL con un código de vinculación (`pairingCode`) y Vento se vincula con ese código (sistema «Vincular con código de TV») |
| Micrófono (dictado), «Hola Vento» manos libres y voz de Vento | Reconocedor de voz y lectura en voz alta de Android (puente `window.VentoAndroid`) |
| Cámara y galería (facturas) | Selector de archivos nativo con cámara |
| Respaldos y reportes | Se guardan en Descargas/Vento |
| Botón Atrás | Cierra la ventana abierta de Vento |
| Pantalla encendida | Mientras Vento está abierta |

## Permisos

La primera vez que se abre, Vento pide de una vez micrófono, cámara y avisos, y luego quitar el ahorro de batería.
En Música → «🔐 Permisos del celular» se ve qué falta y se puede pedir otra vez (si Android ya no deja preguntar, abre los ajustes de la app).
Si Android cierra la página de fondo por memoria, Vento la vuelve a abrir sola (antes se cerraba la app).

## Vento Admin (APK del proveedor)

Carpeta `admin/`: abre el panel de administración (admin.html), que sigue pidiendo el código personal.
Guarda respaldos y CSV en Descargas/Vento. Descarga:
https://github.com/cristhianlujan45-blip/cuentas/releases/latest/download/vento-admin.apk

## Descargar

https://github.com/cristhianlujan45-blip/cuentas/releases/latest/download/vento.apk

GitHub la compila solo (`.github/workflows/android.yml`) cada vez que cambia esta carpeta.

## Firma

⚠️ **La llave anterior (`vento-apk.jks`, contraseña `vento-apk-2026`) estuvo publicada en este repositorio público
y hay que darla por comprometida.** Ya no está en el repositorio ni en los `build.gradle`; la firma sale de secretos de GitHub.

**Secretos (Settings → Secrets and variables → Actions):**

| Secreto | Qué es |
|---|---|
| `VENTO_KEYSTORE_B64` | La llave nueva en base64: `base64 -w0 vento-nueva.jks` |
| `VENTO_KS_PASS` | Su contraseña (larga y que no esté en ningún archivo) |

Sin esos secretos el flujo compila con una llave de prueba y **no publica** el APK (para que nunca salga
una versión que no se pueda instalar encima de la anterior).

**Cambiar a la llave nueva sin que los clientes reinstalen** (rotación de firma APK v3, Android 9+):

```bash
# 1) Llave nueva (guárdala FUERA del repositorio, con copia de seguridad)
keytool -genkeypair -keystore vento-nueva.jks -alias vento -keyalg EC -groupname secp256r1 -validity 10000
# 2) Prueba de linaje: la llave vieja autoriza a la nueva y pierde el permiso de «volver atrás»
apksigner rotate --out vento.lineage \
  --old-signer --ks vento-apk.jks --ks-key-alias vento --set-rollback false \
  --new-signer --ks vento-nueva.jks --ks-key-alias vento
# 3) Firmar cada versión con la nueva llave + el linaje
apksigner sign --ks vento-nueva.jks --ks-key-alias vento --lineage vento.lineage --rotation-min-sdk-version 28 app-release.apk
```

En Android 8 o anterior la rotación no aplica: esos celulares deben desinstalar e instalar una vez.
Para la Play Store se usa la firma de Google Play (App Signing); allí la llave de subida se cambia desde
Play Console → Integridad de la app → «Solicitar restablecimiento de la llave de subida».

La llave vieja sigue en el historial de git. Para borrarla también de ahí (reescribe la historia; avisar antes a quien tenga copias):
`git filter-repo --path android/vento-apk.jks --invert-paths` y luego `git push --force`. Aun así, como ya fue pública, lo que protege es la rotación.

## Lo que sigue pidiendo el navegador

- **Conectar Google (YouTube Music) se hace una vez desde Chrome** con la misma cuenta de Vento Nube. La app
  usa esa conexión guardada en el Servidor Vento. Google no deja iniciar sesión dentro de una app así.
- **El puente del YouTube del TV** (paso 1 de «Conectar con el código del TV») tiene que estar configurado.
  Es el mismo de antes.
