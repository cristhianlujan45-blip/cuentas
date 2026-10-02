# Vento 1.9.3: peso por unidad en facturas y desplazamiento

## 1. Facturas: peso de cada unidad

Cuando la descripción trae "cantidad × peso", la revisión muestra cuánto pesa **cada unidad**:

| Factura | Se muestra |
|---|---|
| MAGGI CALDO GALLINA 24X594G (1 paquete) | 24 unidades · "Cada unidad: **24,75 g** (594 g ÷ 24)" · presentación "24 x 24,75 g (594 g en total)" · nombre sugerido "Maggi Caldo Gallina 24,75 g" |
| LA LECHERA 48X80G (4 sueltas a $2.742) | 4 unidades · "Cada unidad: 80 g" (no se divide) |
| JABON REY 3X300G | "Cada unidad: 300 g", porque 300 g es un tamaño típico de una barra |

**Cuándo divide solo:** si se compró el paquete completo y el peso no es un tamaño típico de una unidad (no es múltiplo de 5, como 594 g).

**Si se equivoca:** en cada renglón hay un botón para cambiarlo, "➗ Dividir: 100 g c/u" o "↩️ No dividir: 594 g c/u".

El peso por unidad se guarda como el tamaño del producto.

## 2. Desplazamiento (subir y bajar)

**Causa encontrada:** la pantalla de fondo se bloqueaba con una regla CSS cada vez que alguna ventana quedaba marcada como abierta, aunque no se viera. Con una ventana "fantasma" así, la app entera dejaba de subir y bajar.

**Arreglo:**
- **Bloqueo controlado:** ahora lo maneja `ventoScrollSano`, que bloquea el fondo solo si hay una ventana abierta **y visible**. Si una ventana quedó marcada pero no se ve, la cierra sola. Revisa cada 1,5 s, al volver a la app y en cada cambio.
- **Una sola zona de desplazamiento:** `html` y `body` usan `overflow-x: clip`, así el body nunca se convierte en una segunda zona de scroll (en algunos Android eso dejaba la pantalla quieta).
- **Lo de la 1.9.2 sigue:** la lista de tipos de negocio es parte de la página, y la letra grande ya no agranda toda la página de una vez.

**Probado con deslizamientos táctiles al 100 % y al 130 %:**
- todas las secciones;
- Ajustes y sus 8 partes (Pedidos, QR y caja hasta el final);
- la ventana de una cuenta con 25 productos;
- el menú "Más";
- la página de pedidos y su menú.

Mientras el tutorial está abierto, el fondo queda quieto, como debe ser.

## Regresión

Sin errores en las pruebas de:
- pedidos de punta a punta (incluido el QR impreso);
- facturas con IA;
- unidades por paquete;
- pantalla de preparación;
- avisos y campana;
- pantallas en celular, tableta y computador;
- los tipos de negocio.
