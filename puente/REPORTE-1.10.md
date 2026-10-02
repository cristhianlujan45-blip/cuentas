# Vento 1.10: base de datos de usuarios (Vento Nube)

## Qué se creó

| Archivo | Para qué |
|---|---|
| `nube/schema.sql` | La base de datos: tablas, reglas de seguridad y funciones (ver abajo) |
| `nube/vento-nube.js` | El módulo de la app: cuentas, sincronización, mezcla de cambios y ventana "Vento Nube" |
| `nube/config.js` | La conexión por defecto para todos los celulares (URL y clave pública) |
| `nube/LEEME.md` | Los pasos para crear el proyecto en Supabase (unos 5 minutos) |
| `index.html` | Botón "☁️ Entrar con Vento Nube", Ajustes → Nube y usuarios, permisos por rol y aviso a la nube al guardar |

**Contenido de `nube/schema.sql`:**
- **Tablas:** `negocios`, `miembros`, `datos_negocio`, `invitaciones` y `respaldos`.
- **Seguridad:** Row Level Security en todas.
- **Funciones:**
  - `crear_negocio`, `mis_negocios`, `guardar_datos` (con control de versión);
  - `crear_invitacion`, `unirse_con_codigo`;
  - `cambiar_rol`, `quitar_miembro`;
  - `restaurar_respaldo`.

**Lo que falta del lado del usuario:** crear la cuenta gratis en supabase.com, pegar el SQL y copiar dos datos. Sin cuenta propia no se puede crear el proyecto desde aquí.

## Pruebas

**Seguridad** (PostgreSQL 16 real con las funciones de Supabase simuladas):

| Caso | Resultado |
|---|---|
| Crear negocio | El que lo crea queda como dueño, con versión 1 |
| Guardar con una versión vieja | `conflicto` |
| Mesero con código | Se une y ve y guarda los datos |
| Mesero intenta invitar | `sin_permiso` |
| Mesero intenta editar la tabla directo | Permiso denegado |
| Reusar un código | `codigo_usado` |
| Usuario extraño | Ve 0 negocios, 0 datos y 0 miembros; si intenta guardar, `sin_permiso` |
| Sin sesión | Permiso denegado en tablas y funciones |
| El dueño intenta salirse | `dueno_no_sale` |
| Restaurar un respaldo | El estado actual queda guardado antes |
| Volver a correr el SQL | No daña nada |

**App** (dos celulares simulados contra esa base de datos real):
1. El dueño crea su cuenta, sube su negocio e invita a un mesero.
2. El mesero, en un celular nuevo, entra con "☁️ Entrar con Vento Nube", crea su cuenta y se une con el código. Recibe los productos, entra en modo mesero y no puede invitar.
3. El dueño agrega a la mesa 1 y el mesero a la mesa 2 al mismo tiempo: los dos celulares terminan viendo las dos mesas, sin duplicados.
4. El mesero recarga la app y entra solo con su sesión de la nube.

**Mezcla de cambios:**

| Caso | Resultado |
|---|---|
| Misma mesa, cada uno agrega algo | Quedan los dos |
| Uno borra y el otro agrega | Queda solo lo que se agregó |
| Cobro en uno y producto nuevo en el otro | Quedan los dos |
| Stock 20 → 18 en uno y 20 → 17 en el otro | Queda en 15 |
| Mesas nuevas en cada uno | Quedan las dos |

**Error encontrado y corregido:** la base de datos cambia el orden de los campos y la app agrega `personId: null` al cargar, así que el mismo producto parecía otro y se duplicaba. Ahora se compara por contenido.

**Regresión:** pedidos, QR impreso, barrido de tipos de negocio, entrada, salida y avisos, sin errores. Sin la nube configurada, la app se comporta igual que antes.
