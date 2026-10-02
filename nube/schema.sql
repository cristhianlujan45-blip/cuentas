-- =====================================================================
--  Vento Nube · base de datos de usuarios y negocios (Supabase / PostgreSQL)
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este archivo → Run.
--  Se puede volver a correr sin dañar nada (usa "if not exists" / "or replace").
--
--  Qué guarda:
--    negocios        cada negocio (un dueño puede tener varios)
--    miembros        quién entra a cada negocio y con qué rol (dueno, admin, cajero, mesero)
--    datos_negocio   los datos de la app (productos, cuentas, inventario, historial…) con número de versión
--    invitaciones    códigos para que otra persona se una al negocio con un rol
--    respaldos       copias automáticas (una por hora como máximo, se guardan las últimas 48)
--
--  Seguridad: Row Level Security en TODAS las tablas. Cada usuario solo ve los negocios de los que es
--  miembro. Los cambios importantes pasan por funciones que revisan el rol. La «anon key» que se pone en
--  la app es pública por diseño: sin una sesión válida no deja leer ni escribir nada.
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists public.negocios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(nombre) between 1 and 80),
  creado_por  uuid not null references auth.users(id) on delete cascade,
  creado_en   timestamptz not null default now()
);

create table if not exists public.miembros (
  negocio_id  uuid not null references public.negocios(id) on delete cascade,
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  rol         text not null check (rol in ('dueno','admin','cajero','mesero')),
  nombre      text check (char_length(nombre) <= 60),
  email       text,
  creado_en   timestamptz not null default now(),
  primary key (negocio_id, usuario_id)
);
create index if not exists miembros_usuario_idx on public.miembros(usuario_id);

create table if not exists public.datos_negocio (
  negocio_id      uuid primary key references public.negocios(id) on delete cascade,
  datos           jsonb not null default '{}'::jsonb,
  version         bigint not null default 0,
  actualizado_por uuid references auth.users(id) on delete set null,
  actualizado_en  timestamptz not null default now()
);

create table if not exists public.invitaciones (
  codigo      text primary key,
  negocio_id  uuid not null references public.negocios(id) on delete cascade,
  rol         text not null check (rol in ('admin','cajero','mesero')),
  creado_por  uuid references auth.users(id) on delete set null,
  creado_en   timestamptz not null default now(),
  vence       timestamptz not null default now() + interval '7 days',
  usada_por   uuid references auth.users(id) on delete set null,
  usada_en    timestamptz
);

create table if not exists public.respaldos (
  id          bigserial primary key,
  negocio_id  uuid not null references public.negocios(id) on delete cascade,
  datos       jsonb not null,
  version     bigint not null,
  creado_por  uuid references auth.users(id) on delete set null,
  creado_en   timestamptz not null default now()
);
create index if not exists respaldos_negocio_idx on public.respaldos(negocio_id, creado_en desc);

-- ---------- Ayudantes (security definer: evitan recursión en las políticas) ----------
create or replace function public.rol_en(n uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select rol from public.miembros where negocio_id = n and usuario_id = auth.uid()
$$;

create or replace function public.es_miembro(n uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.miembros where negocio_id = n and usuario_id = auth.uid())
$$;

-- ---------- Row Level Security ----------
alter table public.negocios      enable row level security;
alter table public.miembros      enable row level security;
alter table public.datos_negocio enable row level security;
alter table public.invitaciones  enable row level security;
alter table public.respaldos     enable row level security;

drop policy if exists negocios_ver on public.negocios;
create policy negocios_ver on public.negocios for select using (public.es_miembro(id));
drop policy if exists negocios_renombrar on public.negocios;
create policy negocios_renombrar on public.negocios for update
  using (public.rol_en(id) in ('dueno','admin')) with check (public.rol_en(id) in ('dueno','admin'));

drop policy if exists miembros_ver on public.miembros;
create policy miembros_ver on public.miembros for select using (public.es_miembro(negocio_id));

drop policy if exists datos_ver on public.datos_negocio;
create policy datos_ver on public.datos_negocio for select using (public.es_miembro(negocio_id));

drop policy if exists invitaciones_ver on public.invitaciones;
create policy invitaciones_ver on public.invitaciones for select using (public.rol_en(negocio_id) in ('dueno','admin'));

drop policy if exists respaldos_ver on public.respaldos;
create policy respaldos_ver on public.respaldos for select using (public.rol_en(negocio_id) in ('dueno','admin'));

-- Nada se inserta/actualiza/borra directo: todo pasa por las funciones de abajo, que revisan el rol.

-- ---------- Funciones que usa la app ----------

-- Crea un negocio, deja al usuario como dueño y sube los datos iniciales.
create or replace function public.crear_negocio(p_nombre text, p_datos jsonb, p_nombre_usuario text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare n uuid;
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  insert into negocios(nombre, creado_por) values (left(coalesce(nullif(trim(p_nombre), ''), 'Mi negocio'), 80), auth.uid()) returning id into n;
  insert into miembros(negocio_id, usuario_id, rol, nombre, email)
    values (n, auth.uid(), 'dueno', left(p_nombre_usuario, 60), auth.jwt() ->> 'email');
  insert into datos_negocio(negocio_id, datos, version, actualizado_por) values (n, coalesce(p_datos, '{}'::jsonb), 1, auth.uid());
  return n;
end $$;

-- Negocios del usuario con su rol y la versión actual de los datos.
create or replace function public.mis_negocios()
returns table(id uuid, nombre text, rol text, version bigint, actualizado_en timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select n.id, n.nombre, m.rol, d.version, d.actualizado_en
  from miembros m join negocios n on n.id = m.negocio_id left join datos_negocio d on d.negocio_id = n.id
  where m.usuario_id = auth.uid() order by n.creado_en
$$;

-- Guarda los datos solo si nadie más los cambió desde la versión que tenía este equipo.
-- Devuelve la versión nueva; si hubo un cambio de otro equipo lanza 'conflicto' (la app baja lo nuevo).
create or replace function public.guardar_datos(p_negocio uuid, p_datos jsonb, p_version bigint)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v bigint; ult timestamptz;
begin
  if not public.es_miembro(p_negocio) then raise exception 'sin_permiso'; end if;
  update datos_negocio set datos = p_datos, version = version + 1, actualizado_por = auth.uid(), actualizado_en = now()
    where negocio_id = p_negocio and version = p_version returning version into v;
  if v is null then raise exception 'conflicto'; end if;
  -- Respaldo automático: como máximo uno por hora, se guardan los últimos 48.
  select max(creado_en) into ult from respaldos where negocio_id = p_negocio;
  if ult is null or ult < now() - interval '1 hour' then
    insert into respaldos(negocio_id, datos, version, creado_por) values (p_negocio, p_datos, v, auth.uid());
    delete from respaldos where negocio_id = p_negocio and id not in
      (select id from respaldos where negocio_id = p_negocio order by creado_en desc limit 48);
  end if;
  return v;
end $$;

-- Código para invitar a alguien con un rol (solo dueño o administrador).
create or replace function public.crear_invitacion(p_negocio uuid, p_rol text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare c text;
begin
  if public.rol_en(p_negocio) not in ('dueno','admin') then raise exception 'sin_permiso'; end if;
  if p_rol not in ('admin','cajero','mesero') then raise exception 'rol_invalido'; end if;
  if p_rol = 'admin' and public.rol_en(p_negocio) <> 'dueno' then raise exception 'sin_permiso'; end if;
  c := upper(substr(translate(encode(gen_random_bytes(9), 'base64'), '+/=0O1Il', ''), 1, 8));
  insert into invitaciones(codigo, negocio_id, rol, creado_por) values (c, p_negocio, p_rol, auth.uid());
  return c;
end $$;

-- Unirse a un negocio con un código de invitación (de un solo uso, vence a los 7 días).
create or replace function public.unirse_con_codigo(p_codigo text, p_nombre text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare i invitaciones%rowtype;
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  select * into i from invitaciones where codigo = upper(trim(p_codigo)) for update;
  if not found then raise exception 'codigo_invalido'; end if;
  if i.usada_por is not null then raise exception 'codigo_usado'; end if;
  if i.vence < now() then raise exception 'codigo_vencido'; end if;
  insert into miembros(negocio_id, usuario_id, rol, nombre, email)
    values (i.negocio_id, auth.uid(), i.rol, left(p_nombre, 60), auth.jwt() ->> 'email')
    on conflict (negocio_id, usuario_id) do update set rol = excluded.rol;
  update invitaciones set usada_por = auth.uid(), usada_en = now() where codigo = i.codigo;
  return i.negocio_id;
end $$;

-- Cambiar el rol de alguien (solo el dueño; el dueño no se puede quitar a sí mismo).
create or replace function public.cambiar_rol(p_negocio uuid, p_usuario uuid, p_rol text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if public.rol_en(p_negocio) <> 'dueno' then raise exception 'sin_permiso'; end if;
  if p_usuario = auth.uid() then raise exception 'no_a_si_mismo'; end if;
  if p_rol not in ('admin','cajero','mesero') then raise exception 'rol_invalido'; end if;
  update miembros set rol = p_rol where negocio_id = p_negocio and usuario_id = p_usuario;
end $$;

-- Quitar a alguien del negocio (dueño o admin; un admin no puede quitar al dueño ni a otro admin).
-- Cualquiera puede salirse a sí mismo, menos el dueño.
create or replace function public.quitar_miembro(p_negocio uuid, p_usuario uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare yo text := public.rol_en(p_negocio); el text;
begin
  select rol into el from miembros where negocio_id = p_negocio and usuario_id = p_usuario;
  if el is null then return; end if;
  if p_usuario = auth.uid() then
    if el = 'dueno' then raise exception 'dueno_no_sale'; end if;
  elsif yo = 'dueno' then null;
  elsif yo = 'admin' and el in ('cajero','mesero') then null;
  else raise exception 'sin_permiso';
  end if;
  delete from miembros where negocio_id = p_negocio and usuario_id = p_usuario;
end $$;

-- Restaurar un respaldo (solo dueño o admin). El estado actual queda guardado como respaldo antes.
create or replace function public.restaurar_respaldo(p_respaldo bigint)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare r respaldos%rowtype; v bigint;
begin
  select * into r from respaldos where id = p_respaldo;
  if not found then raise exception 'no_existe'; end if;
  if public.rol_en(r.negocio_id) not in ('dueno','admin') then raise exception 'sin_permiso'; end if;
  insert into respaldos(negocio_id, datos, version, creado_por)
    select negocio_id, datos, version, auth.uid() from datos_negocio where negocio_id = r.negocio_id;
  update datos_negocio set datos = r.datos, version = version + 1, actualizado_por = auth.uid(), actualizado_en = now()
    where negocio_id = r.negocio_id returning version into v;
  return v;
end $$;

-- Solo usuarios con sesión pueden llamar las funciones.
revoke all on function public.crear_negocio(text, jsonb, text), public.mis_negocios(), public.guardar_datos(uuid, jsonb, bigint),
  public.crear_invitacion(uuid, text), public.unirse_con_codigo(text, text), public.cambiar_rol(uuid, uuid, text),
  public.quitar_miembro(uuid, uuid), public.restaurar_respaldo(bigint), public.rol_en(uuid), public.es_miembro(uuid) from public, anon;
grant execute on function public.crear_negocio(text, jsonb, text), public.mis_negocios(), public.guardar_datos(uuid, jsonb, bigint),
  public.crear_invitacion(uuid, text), public.unirse_con_codigo(text, text), public.cambiar_rol(uuid, uuid, text),
  public.quitar_miembro(uuid, uuid), public.restaurar_respaldo(bigint), public.rol_en(uuid), public.es_miembro(uuid) to authenticated;
grant select on public.negocios, public.miembros, public.datos_negocio, public.invitaciones, public.respaldos to authenticated;
grant update (nombre) on public.negocios to authenticated;
