# Vento 1.9.2: notificaciones, desplazamiento y letra grande

## 1. Panel de notificaciones corrido

**Causa:** el tamaño de letra de Apariencia y el modo fácil agrandaban la app con `zoom` sobre toda la página. Eso multiplicaba también la posición de los paneles flotantes (campana, avisos, micrófono). Por eso el panel aparecía corrido hacia la derecha, se salía de la pantalla y se cortaba el texto.

**Arreglo:** ahora se agranda solo el contenido: secciones, encabezado, ventanas, avisos, botones de la barra y micrófono. Las capas fijas siguen midiendo la pantalla real.

**Probado al 100 %, 120 % y 140 %:** la campana queda centrada con 8 px de margen a cada lado y nunca se sale.

## 2. No se podía bajar en Ajustes

**Causa:** en "Ajustes → Negocio y facturación", la lista de tipos de negocio era una cajita con scroll propio (426 px de alto) que no le pasaba el desplazamiento a la página. Al poner el dedo encima, la página dejaba de bajar.

**Arreglo:** la lista ahora es parte de la página.

**Revisión con deslizamientos táctiles reales** (al 100 % y al 130 %):

| Pantalla | Resultado |
|---|---|
| Cuentas, Productos, Inventario, Historial | baja y sube completo |
| Ajustes y sus 8 secciones | baja y sube completo |
| Ventana de una cuenta con 25 productos | baja y sube completo |
| Menú "Más" | baja y sube completo |
| Chat de Laya | baja y sube completo |
| Página de pedidos y su menú | baja y sube completo |

No queda ninguna otra cajita con scroll atrapado.

## 3. Pedidos

- **Siguen los arreglos de la 1.9.1:**
  - reintentos automáticos;
  - mucho menos consumo del cupo de ntfy.
- **Pantalla de preparación:** avisa cada 6 horas que sigue abierta.
- **Probado:** pedido QR → app principal → cliente ve "Listo", y el QR impreso de punta a punta, sin errores.
