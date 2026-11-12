-- =====================================================================
-- RutaFlex · Base de datos PostgreSQL (backend PHP) · Release 2
-- Uso:  createdb rutaflex
--       psql -d rutaflex -f backend/schema.sql
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- =====================================================================

-- ---------- Tablas ----------------------------------------------------

create table if not exists usuarios (
  id                 text primary key,
  seq                bigserial,
  rol                text not null check (rol in ('pasajero', 'conductor', 'admin')),
  nombre             text not null,
  email              text not null unique,
  vehiculo           text,
  puntuaciones       int[] not null default '{}',
  viajes_completados int not null default 0,
  verificado         boolean not null default false,  -- US20
  extra              jsonb not null default '{}',     -- US04: carrera, celular, zona, hora habitual…
  -- Administración: solicitud de conductor revisada por un admin y suspensión de cuentas.
  estado_conductor   text check (estado_conductor in ('pendiente', 'aprobado', 'rechazado')),
  motivo_rechazo     text,
  baneado            boolean not null default false,
  motivo_baneo       text,
  creado_en          timestamptz not null default now()
);
-- Bases creadas con el Release 1: se agregan las columnas nuevas.
alter table usuarios add column if not exists verificado boolean not null default false;
alter table usuarios add column if not exists extra jsonb not null default '{}';
-- Rol admin y revisión de conductores (se agregan sin borrar datos).
alter table usuarios drop constraint if exists usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check check (rol in ('pasajero', 'conductor', 'admin'));
alter table usuarios add column if not exists estado_conductor text check (estado_conductor in ('pendiente', 'aprobado', 'rechazado'));
alter table usuarios add column if not exists motivo_rechazo text;
alter table usuarios add column if not exists baneado boolean not null default false;
alter table usuarios add column if not exists motivo_baneo text;
-- Los conductores que ya existían antes de la revisión quedan aprobados.
update usuarios set estado_conductor = 'aprobado' where rol = 'conductor' and estado_conductor is null;

-- Contraseñas separadas y cifradas con bcrypt (password_hash de PHP).
-- Ningún endpoint devuelve esta tabla.
create table if not exists credenciales (
  usuario_id text primary key references usuarios(id) on delete cascade,
  pass_hash  text not null
);

create table if not exists viajes (
  id             text primary key,
  seq            bigserial,
  conductor_id   text not null references usuarios(id) on delete cascade,
  origen         text not null,
  destino        text not null,
  hora           text not null,
  asientos       int not null check (asientos >= 0),
  precio         double precision,
  estado         text not null,
  miembros       text[] not null default '{}',
  paradas        text[],
  taxi           double precision,
  fecha          text,
  extra          jsonb not null default '{}',  -- coordenadas, ruta, posición en vivo, ubicaciones compartidas, cancelación
  actualizado_en timestamptz not null default now()
);
-- US12: estado Cancelado (reemplaza la restricción del Release 1).
alter table viajes drop constraint if exists viajes_estado_check;
alter table viajes add constraint viajes_estado_check check (estado in ('Activo', 'En curso', 'Finalizado', 'Cancelado'));

create table if not exists mensajes (
  id           text primary key,
  seq          bigserial,
  viaje_id     text not null references viajes(id) on delete cascade,
  remitente_id text not null references usuarios(id) on delete cascade,
  texto        text not null,
  hora         text,
  creado_en    timestamptz not null default now()
);

create table if not exists calificaciones (
  id         text primary key,
  seq        bigserial,
  viaje_id   text not null references viajes(id) on delete cascade,
  de_id      text not null references usuarios(id) on delete cascade,
  para_id    text not null references usuarios(id) on delete cascade,
  puntuacion int not null check (puntuacion between 1 and 5),
  creado_en  timestamptz not null default now()
);

-- US15 · US16: avisos de mensajes nuevos y de cambios en los viajes.
create table if not exists notificaciones (
  id         text primary key,
  seq        bigserial,
  usuario_id text not null references usuarios(id) on delete cascade,
  tipo       text not null check (tipo in ('mensaje', 'viaje', 'cuenta')),
  texto      text not null,
  viaje_id   text references viajes(id) on delete set null,
  leida      boolean not null default false,
  creado_en  timestamptz not null default now()
);
-- Tipo 'cuenta': avisos del administrador (solicitud de conductor aprobada o rechazada).
alter table notificaciones drop constraint if exists notificaciones_tipo_check;
alter table notificaciones add constraint notificaciones_tipo_check check (tipo in ('mensaje', 'viaje', 'cuenta'));

-- Versión de datos: sube al reiniciar la demo para que todos los clientes recarguen.
create table if not exists rf_meta (
  id      int primary key,
  version int not null default 0
);
insert into rf_meta (id, version) values (1, 0) on conflict (id) do nothing;

create index if not exists viajes_conductor_idx on viajes (conductor_id);
create index if not exists mensajes_viaje_idx on mensajes (viaje_id, seq);
create index if not exists calificaciones_para_idx on calificaciones (para_id);
create index if not exists notificaciones_usuario_idx on notificaciones (usuario_id, seq);
