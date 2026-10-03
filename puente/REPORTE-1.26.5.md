# Vento 1.26.5 — IA conectada en la app, escaneo más rápido y foto de producto con un toque

(Incluye todo lo de la 1.26.4: vuelve el sistema de conexión con el TV de la 1.22, canal en vivo apagado.)

## IA (Gemini) desconectada en la app
La app de Android guarda sus datos aparte del navegador, así que la clave de la IA puesta en el navegador
no llegaba a la app. Ahora:
- La clave se guarda también en los datos del negocio: cualquier celular o la app que entre al negocio
  la toma sola.
- En Ajustes → IA, desde el navegador del celular aparece «📲 Pasar la IA a la app Vento», que abre la
  app con la IA ya conectada (la clave se borra de la dirección enseguida).

## Escaneo de facturas y productos (< 10 s)
- Las fotos se achican más antes de mandarlas (1150 px, calidad 0,68): suben y se leen más rápido.
- Primer intento con tope de 9 s (facturas) y 7 s (productos); solo si falla hay un segundo intento.

## Foto de productos
- En la lista, el producto sin foto muestra 📷: un toque abre el producto y la cámara/galería.

## Pruebas
`iafoto.js` 6/6 y regresión completa. No se pudo probar contra Gemini real desde aquí.
