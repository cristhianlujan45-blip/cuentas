# Vento 1.9.1: correcciones

## 1. La app se recargaba sola

**Causa real:** `index.html` pesaba 14 MB. Unos 12 MB eran el lector de facturas sin internet (OCR y PDF), que iba metido dentro de la página. Con tanto en memoria, Android descartaba la pestaña cada vez que se iba a otra app (la cámara, WhatsApp, YouTube Music) y Chrome la recargaba al volver. Eso explicaba también fotos de factura que "no se detectaban": la página se recargaba al volver de la cámara y la foto se perdía.

**Arreglo:**
- **La página pasó de 14 MB a 2 MB.** Los motores de lectura ahora están en `lib/vento-ocr.js`, `lib/vento-pdf.js` y `lib/vento-pdf-worker.js`. Se cargan solo al leer una factura, y al entrar a Inventario se dejan descargados en la caché sin ocupar memoria.
- **Sin "jalar para recargar":** antes, deslizar hacia abajo arriba de la lista recargaba la app sin querer.
- **Si Android igual la recarga,** Vento vuelve a la sección donde estabas y no repite el logo completo.

Ninguna parte de la app llama sola a "recargar". Solo lo hacen el botón "Actualizar ahora", cerrar sesión y el cambio de nombre de unidades.

## 2. Pantalla de preparación (Cocina / Pantalla)

**Causa:** con "Mostrar todas las funciones" activado, el interruptor de la pantalla de preparación no hacía nada. Además, sin tipo de negocio elegido el nombre por defecto era "Cocina".

**Arreglo:**
- **El interruptor manda siempre.**
- **Nombre por defecto según el negocio:**
  - **Pantalla:** tiendas y demás negocios.
  - **Cocina:** restaurantes.
  - **Barra:** bares.
  - **Preparación:** cafeterías y heladerías.
  - **Producción:** panaderías y pastelerías.
- **Nuevo nombre "Pantalla"** en la lista.
- **Controles dentro de la misma pantalla:** cambiarle el nombre y "Ocultar esta pantalla", sin ir a Ajustes. Para volver a activarla: Ajustes → Pedidos, QR y caja.
- **El ícono del título cambia con el nombre:** 🍳 cocina, 🍹 barra, 🖥️ los demás.

## 3. Facturas: unidades por paquete

**Antes:** "MAGGI CALDO GALLINA 24X594G", con cantidad 1 y $21.653, quedaba como 1 unidad de $21.653.

**Ahora:** si la presentación dice cuántas trae (24X594G, X12 UND, 330 X24), se toma como 1 paquete × 24 = 24 unidades de $902,21 ($758,16 + IVA $144,05). El cambio queda anotado en el renglón y se puede corregir en "Cajas/paquetes".

**Controles para no equivocarse:**
- **Cantidad ya en unidades:** si la cantidad ya viene en unidades (24, 48…, múltiplo exacto del paquete), se respeta y no se multiplica.
- **Precio ya unitario:** si al repartir el valor cada unidad quedaría en menos de $200, el precio ya era por unidad. Ejemplo: "LA LECHERA 48X80G", 4 × $2.742, son 4 sobres, no 192.
- **Por peso o volumen:** los renglones en KG, G, L o ML no se multiplican.

## 4. Botón del micrófono

- **Ícono nuevo:** círculo con degradado y micrófono relleno. Al escuchar se pone rojo y muestra "detener".
- **Arrastre:**
  - Sigue al dedo aunque se salga del círculo; antes se quedaba pegado.
  - Se mueve suave, un cuadro a la vez.
  - Al soltarlo se pega al borde izquierdo o derecho más cercano.
- **Lado izquierdo:** el botón "IA" y el "?" se pasan al otro lado para no salirse de la pantalla.
- **Tocarlo sigue activando el micrófono** igual que antes.

## 5. App de pedidos (pedido.html) en cualquier pantalla

**Causa:** tocar "+" varias veces seguidas hacía el zoom de doble toque del celular. Además, el idioma y la moneda tenían letra de 13 px, y el iPhone hacía zoom solo al tocarlos.

**Arreglo:**
- **Sin zoom por doble toque** (se puede seguir ampliando con dos dedos).
- **Campos a 16 px.**
- **Nada se sale por los lados.**

**Probado en:** 320, 360, 390, 430, 768 y 1280 px de ancho, sin desbordes.

Lo del doble toque se aplicó también a la app principal, mesero, preparación y TV.

## 6. Otros

- **El botón "♻️ Reiniciar …"** ahora cambia de nombre al instante cuando cambia la palabra de la unidad. Antes decía "Reiniciar mesas" en un negocio con "Cuentas".

## 7. Pedidos que salían «Sin conexión»

**Causa probable:** el envío funciona por ntfy.sh, que tiene un cupo gratis de mensajes por día **por conexión a internet**. La app principal publicaba mucho:
- la pantalla de preparación cada minuto, aunque no hubiera ninguna abierta;
- la cuenta de **cada** mesa en cada cambio;
- además, el TV y los meseros.

Si los clientes usan el mismo Wi-Fi del local, comparten ese cupo. Cuando se acaba, ntfy rechaza el pedido del cliente y la página decía "Sin conexión".

No hay forma de comprobarlo desde aquí: el entorno de pruebas no tiene acceso a ntfy.sh. Por eso se arregló por los dos lados.

**App principal (gasta mucho menos cupo):**
- **Cuenta en vivo:** se publica solo para las mesas que usaron el QR en las últimas 12 horas.
- **Pantalla de preparación:** se publica solo si hay una abierta (la pantalla avisa al abrirse), y el repaso pasó de cada minuto a cada 10 minutos.

**Página de pedidos (pedido.html):**
- **Envío:** 3 intentos rápidos (0 s, 1,5 s y 4 s, más espera si ntfy dice "demasiados envíos"). Un corte de señal corto ya no deja el pedido sin enviar.
- **Si no sale:** queda guardado y se reintenta solo cada vez con más espera (10 s, 20 s, 40 s… hasta 2 min). También se reintenta al volver la señal o al volver a la página.
- **El mensaje ya no dice "Sin señal":** dice "Aún no se pudo enviar… se reintenta solo, no lo vuelvas a enviar".
- **Sin duplicados:** el pedido sigue con su ID único.

**Probado:** con 2 rechazos seguidos de ntfy, el pedido sale en el 3.er intento. Con 5 rechazos, queda guardado y sale solo en el siguiente reintento. Se envía 1 pedido, sin errores.

**Pendiente de confirmar en el local:** si vuelve a salir el aviso, revisar si el celular del cliente estaba en el Wi-Fi del local.

## 8. Panel de notificaciones (campana)

En el celular el panel quedaba corrido: pegado a un lado, con espacio de más al otro, y se metía debajo de la barra de abajo.

Ahora:
- **En pantallas de menos de 600 px:** ocupa el ancho con 8 px de margen a cada lado.
- **Alto:** termina antes de la barra de abajo, con su propio scroll.
- **Texto:** se ve completo, en 320, 390 y 768 px.

## No se tocó

- **YouTube Music:** enlaces, QR, reproducción, cola e integración.
- **QR físicos.**
- **Datos guardados.**
