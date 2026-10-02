# Vento 1.10.1: la app ya no se cierra sola ni abre Google

## Causa

La música automática tenía un cronómetro. Cuando calculaba que la canción había terminado, **abría YouTube Music por su cuenta** (una app de Google) y Vento quedaba atrás. Si volvías a Vento con la siguiente canción esperando, lo abría otra vez.

Por eso se veía como que la app "se cierra y se reabre Google, como si se actualizara". Además venía activado por defecto.

## Arreglo

- Vento **nunca** abre otra app por su cuenta.
- Cuando toca la siguiente canción, aparece un botón grande con vibración, "▶ Siguiente canción", con el nombre y la mesa. YouTube Music se abre solo al tocarlo.
- "Ahora no" cierra el aviso, que vuelve a salir en 5 minutos.

**Revisado:** todo lo demás que abre YouTube o YouTube Music (saltar canción, ▶ de la cola, transmitir al TV, lista de Google) ya era solo después de un toque.

**No cambió:** la cola, los enlaces, los QR, la reproducción dentro de la app y el TV.

## Pruebas

- **Cronómetro vencido:** sale el botón, Vento no navega a ninguna parte y se queda en la misma página.
- **Al volver a Vento con la canción pendiente:** sale el botón y no abre nada solo.
- **Regresión:** música automática dentro de la app, cola, saltar, cancelar, historial, pedidos por QR y QR impreso de punta a punta, sin errores.
