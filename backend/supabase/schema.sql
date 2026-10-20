-- =====================================================================
-- RutaFlex · Backend en Supabase (PostgreSQL)
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tablas ----------------------------------------------------

create table if not exists public.usuarios (
  id                 text primary key,
  seq                bigserial,
  rol                text not null check (rol in ('pasajero', 'conductor')),
  nombre             text not null,
  email              text not null unique,
  vehiculo           text,
  puntuaciones       int[] not null default '{}',
  viajes_completados int not null default 0,
  creado_en          timestamptz not null default now()
);

-- Contraseñas separadas y cifradas (bcrypt). Nadie puede leer esta tabla desde la app.
create table if not exists public.credenciales (
  usuario_id text primary key references public.usuarios(id) on delete cascade,
  pass_hash  text not null
);

create table if not exists public.viajes (
  id             text primary key,
  seq            bigserial,
  conductor_id   text not null references public.usuarios(id) on delete cascade,
  origen         text not null,
  destino        text not null,
  hora           text not null,
  asientos       int not null check (asientos >= 0),
  precio         double precision,
  estado         text not null check (estado in ('Activo', 'En curso', 'Finalizado')),
  miembros       text[] not null default '{}',
  paradas        text[],
  taxi           double precision,
  fecha          text,
  extra          jsonb not null default '{}',  -- coordenadas, ruta, posición en vivo, progreso
  actualizado_en timestamptz not null default now()
);

create table if not exists public.mensajes (
  id           text primary key,
  seq          bigserial,
  viaje_id     text not null references public.viajes(id) on delete cascade,
  remitente_id text not null references public.usuarios(id) on delete cascade,
  texto        text not null,
  hora         text,
  creado_en    timestamptz not null default now()
);

create table if not exists public.calificaciones (
  id         text primary key,
  seq        bigserial,
  viaje_id   text not null references public.viajes(id) on delete cascade,
  de_id      text not null references public.usuarios(id) on delete cascade,
  para_id    text not null references public.usuarios(id) on delete cascade,
  puntuacion int not null check (puntuacion between 1 and 5),
  creado_en  timestamptz not null default now()
);

-- Versión de datos: cambia al reiniciar la demo para que todos los clientes recarguen.
create table if not exists public.rf_meta (
  id      int primary key,
  version int not null default 0
);
insert into public.rf_meta (id, version) values (1, 0) on conflict (id) do nothing;

create index if not exists viajes_conductor_idx on public.viajes (conductor_id);
create index if not exists mensajes_viaje_idx on public.mensajes (viaje_id, seq);
create index if not exists calificaciones_para_idx on public.calificaciones (para_id);

-- ---------- Seguridad (RLS) ------------------------------------------
-- La app solo puede LEER. Toda escritura pasa por las funciones de abajo.

alter table public.usuarios       enable row level security;
alter table public.credenciales   enable row level security;
alter table public.viajes         enable row level security;
alter table public.mensajes       enable row level security;
alter table public.calificaciones enable row level security;
alter table public.rf_meta        enable row level security;

drop policy if exists "lectura" on public.usuarios;
drop policy if exists "lectura" on public.viajes;
drop policy if exists "lectura" on public.mensajes;
drop policy if exists "lectura" on public.calificaciones;
drop policy if exists "lectura" on public.rf_meta;
create policy "lectura" on public.usuarios       for select to anon, authenticated using (true);
create policy "lectura" on public.viajes         for select to anon, authenticated using (true);
create policy "lectura" on public.mensajes       for select to anon, authenticated using (true);
create policy "lectura" on public.calificaciones for select to anon, authenticated using (true);
create policy "lectura" on public.rf_meta        for select to anon, authenticated using (true);
-- credenciales: sin políticas → inaccesible desde la app.

grant usage on schema public to anon, authenticated;
grant select on public.usuarios, public.viajes, public.mensajes, public.calificaciones, public.rf_meta to anon, authenticated;
revoke all on public.credenciales from anon, authenticated;

-- ---------- Funciones (API del backend) -------------------------------

-- Guarda (insert/update) usuarios, viajes, mensajes y calificaciones enviados por la app.
create or replace function public.rf_sync(p jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r jsonb;
begin
  for r in select value from jsonb_array_elements(coalesce(p->'users', '[]'::jsonb)) loop
    insert into usuarios (id, rol, nombre, email, vehiculo, puntuaciones, viajes_completados)
    values (
      r->>'id', r->>'role', r->>'name', lower(r->>'email'), r->>'car',
      array(select x::int from jsonb_array_elements_text(coalesce(r->'scores', '[]'::jsonb)) as x),
      coalesce((r->>'completed')::int, 0)
    )
    on conflict (id) do update set
      rol = excluded.rol, nombre = excluded.nombre, email = excluded.email,
      vehiculo = excluded.vehiculo, puntuaciones = excluded.puntuaciones,
      viajes_completados = excluded.viajes_completados;

    if coalesce(r->>'pass', '') <> '' then
      insert into credenciales (usuario_id, pass_hash)
      values (r->>'id', crypt(r->>'pass', gen_salt('bf')))
      on conflict (usuario_id) do update set pass_hash = excluded.pass_hash;
    end if;
  end loop;

  for r in select value from jsonb_array_elements(coalesce(p->'trips', '[]'::jsonb)) loop
    insert into viajes (id, conductor_id, origen, destino, hora, asientos, precio, estado,
                        miembros, paradas, taxi, fecha, extra, actualizado_en)
    values (
      r->>'id', r->>'driver', r->>'origin', r->>'dest', r->>'time',
      (r->>'seats')::int, (r->>'price')::float8, r->>'status',
      array(select jsonb_array_elements_text(coalesce(r->'members', '[]'::jsonb))),
      case when jsonb_typeof(r->'stops') = 'array'
           then array(select jsonb_array_elements_text(r->'stops')) end,
      (r->>'taxi')::float8, r->>'date', coalesce(r->'extra', '{}'::jsonb), now()
    )
    on conflict (id) do update set
      conductor_id = excluded.conductor_id, origen = excluded.origen, destino = excluded.destino,
      hora = excluded.hora, asientos = excluded.asientos, precio = excluded.precio,
      estado = excluded.estado, miembros = excluded.miembros, paradas = excluded.paradas,
      taxi = excluded.taxi, fecha = excluded.fecha, extra = excluded.extra,
      actualizado_en = now();
  end loop;

  for r in select value from jsonb_array_elements(coalesce(p->'messages', '[]'::jsonb)) loop
    insert into mensajes (id, viaje_id, remitente_id, texto, hora)
    values (r->>'id', r->>'trip', r->>'sender', r->>'text', r->>'time')
    on conflict (id) do update set texto = excluded.texto, hora = excluded.hora;
  end loop;

  for r in select value from jsonb_array_elements(coalesce(p->'ratings', '[]'::jsonb)) loop
    insert into calificaciones (id, viaje_id, de_id, para_id, puntuacion)
    values (r->>'id', r->>'trip', r->>'from', r->>'to', (r->>'score')::int)
    on conflict (id) do nothing;
  end loop;
end;
$$;

-- Login: devuelve el id del usuario si correo + contraseña son correctos; si no, null.
create or replace function public.rf_login(p_email text, p_pass text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select u.id
  from usuarios u
  join credenciales c on c.usuario_id = u.id
  where u.email = lower(p_email)
    and c.pass_hash = crypt(p_pass, c.pass_hash)
  limit 1;
$$;

-- Reinicia la demo: borra todo, carga los datos iniciales y avisa a los clientes.
create or replace function public.rf_reset(p jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from calificaciones where true;
  delete from mensajes where true;
  delete from viajes where true;
  delete from credenciales where true;
  delete from usuarios where true;
  perform rf_sync(p);
  update rf_meta set version = version + 1 where id = 1;
end;
$$;

revoke all on function public.rf_sync(jsonb)        from public;
revoke all on function public.rf_login(text, text)  from public;
revoke all on function public.rf_reset(jsonb)       from public;
grant execute on function public.rf_sync(jsonb)       to anon, authenticated;
grant execute on function public.rf_login(text, text) to anon, authenticated;
grant execute on function public.rf_reset(jsonb)      to anon, authenticated;

-- ---------- Tiempo real ------------------------------------------------
-- El pasajero ve moverse al conductor desde otro dispositivo.

do $$
declare
  t text;
begin
  foreach t in array array['usuarios', 'viajes', 'mensajes', 'calificaciones', 'rf_meta'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end;
$$;

-- Recarga el esquema de la API para que las tablas aparezcan de inmediato.
notify pgrst, 'reload schema';
