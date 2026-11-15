-- =====================================================================
-- RutaFlex · Usuario de base de datos con permisos mínimos
-- Ejecutar UNA vez como superusuario, después de schema.sql:
--   psql -d rutaflex -v app_pass='una-clave-segura' -f backend/roles.sql
-- Luego, en backend/.env:  DB_USER=rutaflex_app  y  DB_PASS=una-clave-segura
--
-- La app solo puede leer y escribir filas: no puede crear, modificar ni borrar
-- tablas, ni crear usuarios de base de datos. Si alguien explotara un error de
-- la API, el daño queda limitado a los datos, no a la estructura ni al servidor.
-- =====================================================================

do $$
begin
  if not exists (select from pg_roles where rolname = 'rutaflex_app') then
    create role rutaflex_app login nosuperuser nocreatedb nocreaterole;
  end if;
end $$;
alter role rutaflex_app password :'app_pass';

revoke all on schema public from public;
grant usage on schema public to rutaflex_app;

revoke all on all tables in schema public from rutaflex_app;
grant select, insert, update, delete
  on usuarios, credenciales, viajes, mensajes, calificaciones, notificaciones, sesiones
  to rutaflex_app;
grant select, update on rf_meta to rutaflex_app;
grant usage, select on all sequences in schema public to rutaflex_app;
