# Vento 1.27.3 — Administración solo para el proveedor, código personal, licencias de por vida y equipo

## Solo el proveedor administra
- La app de los clientes solo muestra lo que el cliente necesita: su plan y el **código de su negocio**
  (para pagar/activar). Ya no ve el código del equipo ni el acceso al panel; el acceso «👑 Vento Admin»
  aparece solo en los celulares del proveedor.
- `licencias.html` ya no es una herramienta aparte: lleva a Vento Admin.

## Código personal del administrador
- Vento Admin pide el **código personal** al abrir (sin él no se ve nada). Ese código desbloquea la
  llave que firma las licencias, guardada CIFRADA dentro del panel (AES-256-GCM, clave sacada del código
  con PBKDF2-SHA256 de 600.000 vueltas). Sin el código no se puede usar ni leer.
- Funciona en cualquier equipo del proveedor solo con el código (ya no hace falta cargar el archivo de la
  llave). La llave antigua se sigue aceptando (opción «Avanzado»), y la app acepta las dos firmas.
- «Recordar en este equipo» y botón 🔒 para cerrar la sesión de administrador.

## Licencias de por vida
- Al activar un cliente, la vigencia por defecto es **♾️ De por vida** (sin fecha límite). También se
  pueden dar 1, 3, 6 o 12 meses.
- «👑 Tú como proveedor»: crea la licencia de proveedor para el código de TU negocio (sirve en todos tus
  celulares) y la abre en la app Vento o en el navegador.

## 🧑‍💻 Equipo
- Pestaña nueva para invitar por su usuario de GitHub a quien te ayude con el código (permiso de
  escribir código, organizar reportes, solo ver o mantener), ver quién tiene acceso, invitaciones
  pendientes y quitar accesos. Usa tu token de GitHub (necesita «Administration: Read and write»).
  El panel y las licencias siguen siendo solo tuyos.

## Pruebas
`admintest.js` 21/21: sin código no entra, código equivocado no entra, con el código entra y firma;
plan → cliente → renovación → licencia de por vida → el cliente no ve nada de administrador → licencia de
proveedor → publicar configuración → suspender → respaldo.
