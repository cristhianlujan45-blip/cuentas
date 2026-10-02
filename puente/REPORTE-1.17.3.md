# Vento 1.17.3: YouTube del TV — vuelve a reproducir

## Qué mostraba el registro

En el registro del usuario solo aparecía «saludo al TV: ok · el TV está no se sabe», cada pocos segundos, y **ninguna orden de reproducir**. Vento se conectaba al TV pero nunca le mandaba las canciones.

## Causas

1. **El TV no decía nada y Vento no hacía nada.** Ese TV, cuando no tiene nada puesto, no informa su estado. La revisión de la 1.17.1 trataba ese silencio como «no adivinar» y se quedaba quieta. Las canciones que ya estaban marcadas como «en el TV» se quedaban esperando para siempre.
2. **Formato nuevo de lista.** La 1.17.1 mandaba la cola entera en una sola orden («setPlaylist» con varias canciones). Ese formato no está comprobado y hay TV que no lo reproducen.
3. **«No se sabe» después de mandar.** Si el TV no confirmaba que sonaba, Vento solo le daba «play» y lo dejaba así.

## Arreglos

- **Las mismas órdenes que el TV ya aceptaba:** la primera canción con «setPlaylist» (formato de siempre) y las demás detrás con «addVideo».
- **Silencio del TV = no tiene nada puesto.** Un TV que está sonando sí informa su estado. Por eso, si no dice nada y no se le ha visto sonar esa cola, Vento le pone las canciones que faltan, y queda escrito en el registro.
- **Comprobar después de mandar:** si el TV no confirma que suena, Vento le da «play» y, si hace falta, le vuelve a poner la cola.
- **Si el TV no arranca:** máximo 3 intentos seguidos. Después de eso:
  - queda el aviso de qué revisar: dejar la app de YouTube del TV en su pantalla de inicio y tocar ▶;
  - el botón ▶ reintenta con las canciones ya mandadas.
- **Canciones viejas:** las mandadas hace más de 3 horas (TV apagado) ya no se reponen.

## Pruebas (TV simulado con el protocolo)

Escenarios probados, además de los de 1.17.1 y 1.17.2:
- TV que no informa nada y con canciones ya mandadas: las recibe y suena.
- No se usa el formato nuevo de lista.
- TV que recibe pero nunca suena: máximo 3 intentos y un aviso claro.
