# RutaFlex · Backend (Supabase)

Base de datos PostgreSQL + API + tiempo real, todo en Supabase.

## Instalar (una sola vez)

1. Entra a tu proyecto en https://supabase.com/dashboard
2. Menú izquierdo → **SQL Editor** → **New query**
3. Pega todo el contenido de `supabase/schema.sql` y pulsa **Run**
4. Listo. La primera vez que abras el frontend, se cargan solos los datos de demostración.

## Qué crea

| Tabla | Contenido |
|---|---|
| `usuarios` | pasajeros y conductores (rol, vehículo, reputación) |
| `credenciales` | contraseñas cifradas con bcrypt (inaccesibles desde la app) |
| `viajes` | rutas publicadas, estado, miembros, coordenadas y posición en vivo |
| `mensajes` | chat de cada viaje |
| `calificaciones` | evaluaciones de 1 a 5 |
| `rf_meta` | versión de datos (para reiniciar la demo en todos los clientes) |

**Funciones (API):**
- `rf_sync(p)`: guarda usuarios, viajes, mensajes y calificaciones
- `rf_login(email, pass)`: valida credenciales y devuelve el id del usuario
- `rf_reset(p)`: reinicia la demo con los datos iniciales

**Seguridad:** RLS activado. La app solo puede *leer* tablas; toda escritura pasa por las funciones.
**Tiempo real:** las tablas están en `supabase_realtime`, así el pasajero ve moverse al conductor desde otro dispositivo.

> En el frontend usa solo la key **publishable/anon**. La `service_role` nunca va en el código.
