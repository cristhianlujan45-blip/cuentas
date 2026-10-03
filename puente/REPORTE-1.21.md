# Vento 1.21 (app Android 1.0.3): trabaja con la app cerrada

## Trabajo de fondo en la app de Android

- **Servicio en primer plano** con un aviso fijo en la barra: «Vento está trabajando — Recibiendo pedidos y mandando la música al TV, aunque cierres la app». Con ese aviso Android no apaga la app. El aviso tiene el botón **Detener**.
- **Sigue con la app cerrada, la pantalla apagada o la app quitada de recientes.** La página de Vento ahora vive en el «motor» de la app, no en la ventana. Si se cierra la ventana, el motor sigue: siguen llegando los pedidos y la música sigue yendo al TV, sin duplicar nada porque es la misma página.
- **Al prender el celular** (o al actualizar la app), Vento vuelve a trabajar sola, sin abrirla.
- **Procesador y wifi despiertos** mientras está prendido.
- **Pide una vez quitar el ahorro de batería** para Vento. También hay un botón en Música para hacerlo cuando se quiera.
- **Latido cada 5 s:** con la ventana cerrada Android frena los relojes de la página (hasta una vez por minuto). El servicio despierta a Vento para mandar al TV las canciones nuevas y revisar qué suena, igual que con la app abierta.
- **Interruptor en Música → Música en el TV:** «🔋 Trabajar con la app cerrada» (prendido por defecto).
- **Permiso de notificaciones** (Android 13+) para el aviso fijo.

## Arreglo: el paso del puente se seguía viendo

Con el puente ya configurado (o en la app, que lo trae incluido), el paso 1 y el texto largo debían ocultarse, pero el estilo `.lng-step{display:flex}` le ganaba a la orden de ocultar. Ahora se ocultan con estilo directo: queda solo el código del TV y el botón Conectar. Prueba: 4/4.

## Pruebas

- **Vento dentro de la app: 15/15.**
  - interruptor de fondo y botón de batería;
  - latido: una canción pedida con la app cerrada entra al TV al final de la cola;
  - lista de TV, conexión sola, voz, descargas y botón Atrás.
- **Código Java:** compila sin errores contra Android 14.
- **Además:** todas las pruebas de música, TV, pedidos y negocios.

## Notas

- Algunas marcas (Xiaomi, Huawei, Oppo) tienen además su propio «inicio automático» o «ahorro de batería». Si ahí Vento se cierra, en los ajustes del celular → Apps → Vento → Batería, hay que elegir «Sin restricciones».
