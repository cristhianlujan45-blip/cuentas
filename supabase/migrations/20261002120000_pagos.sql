-- =====================================================================
--  Vento · Servidor de pagos (Nequi y DaviPlata)
--
--  Flujo:
--    Nequi / DaviPlata → integración autorizada → servidor Vento → base de datos → Vento → dispositivos.
--  Integraciones autorizadas:
--    • Wompi (pasarela de Bancolombia): métodos NEQUI y DAVIPLATA, eventos firmados y consulta de estado.
--    • Nequi Conecta (API oficial de Nequi): cobro push, QR y consulta de estado.
--    • Avisos del celular (auxiliar): la notificación de la app del banco reenviada con un token de dispositivo.
--
--  Tablas:
--    pago_proveedores  credenciales de cada integración (cifradas por el servidor: la app NUNCA las lee)
--    pagos             cada cobro / pago con su estado; único por referencia y por id del proveedor
--    pago_eventos      todo lo que llega al webhook (log + detección de duplicados por huella)
--    dispositivos      celulares autorizados del negocio, con token propio (se guarda solo su hash)
--    auditoria         quién hizo qué (configurar, cobrar, aplicar a la mesa, revocar…)
--
--  Seguridad: RLS en todo. Las escrituras pasan por funciones que revisan el rol. Las funciones srv_*
--  solo las puede ejecutar el servidor (service_role).
-- =====================================================================

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

-- ---------- Tablas ----------
create table if not exists public.pago_proveedores (
  negocio_id       uuid not null references public.negocios(id) on delete cascade,
  proveedor        text not null check (proveedor in ('wompi','nequi')),
  ambiente         text not null default 'produccion' check (ambiente in ('sandbox','produccion')),
  publico          jsonb not null default '{}'::jsonb,   -- datos NO secretos: llave pública, código de comercio, métodos aceptados
  secreto          text,                                 -- credenciales cifradas con AES-GCM por el servidor
  estado           text not null default 'pendiente' check (estado in ('pendiente','conectado','error')),
  detalle          text,
  verificado_en    timestamptz,
  webhook_token    text unique,
  webhook_visto_en timestamptz,
  actualizado_por  uuid references auth.users(id) on delete set null,
  actualizado_en   timestamptz not null default now(),
  primary key (negocio_id, proveedor)
);

create table if not exists public.pagos (
  id                   uuid primary key default gen_random_uuid(),
  negocio_id           uuid not null references public.negocios(id) on delete cascade,
  referencia           text not null check (char_length(referencia) between 3 and 120),
  proveedor            text not null check (proveedor in ('wompi','nequi','dispositivo','manual')),
  metodo               text not null default 'OTRO',      -- NEQUI, DAVIPLATA, CARD, PSE, BANCOLOMBIA…
  canal                text not null default 'link' check (canal in ('link','push','qr','notificacion','manual')),
  id_externo           text,
  monto                bigint not null check (monto > 0), -- pesos colombianos
  moneda               text not null default 'COP',
  estado               text not null default 'pendiente'
                         check (estado in ('pendiente','aprobado','rechazado','anulado','error','vencido')),
  estado_proveedor     text,
  verificado           boolean not null default false,   -- confirmado por la entidad/pasarela (firma o consulta de estado)
  confianza            text not null default 'entidad' check (confianza in ('entidad','app','revisar','falso','ok')),
  mesa                 text,
  pagador              text,
  telefono             text,                              -- solo los últimos 4 dígitos
  url                  text,
  qr                   text,
  detalle              text,
  creado_por           uuid references auth.users(id) on delete set null,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  expira_en            timestamptz,
  aprobado_en          timestamptz,
  aplicado_en          timestamptz,
  aplicado_por         uuid references auth.users(id) on delete set null,
  aplicado_dispositivo uuid,
  aplicado_mesa        text,
  intentos             int not null default 0,
  proximo_intento      timestamptz,
  ultimo_error         text,
  clave_idem           text,                              -- evita cobros dobles si se toca dos veces «Cobrar»
  unique (negocio_id, referencia)
);
alter table public.pagos add column if not exists clave_idem text;
create unique index if not exists pagos_idem_uq on public.pagos(negocio_id, clave_idem) where clave_idem is not null;
create unique index if not exists pagos_externo_uq on public.pagos(proveedor, id_externo) where id_externo is not null;
create index if not exists pagos_negocio_idx on public.pagos(negocio_id, actualizado_en desc);
create index if not exists pagos_pendientes_idx on public.pagos(estado, proximo_intento) where estado = 'pendiente';

create table if not exists public.pago_eventos (
  id           bigserial primary key,
  negocio_id   uuid references public.negocios(id) on delete cascade,
  proveedor    text not null,
  tipo         text,
  huella       text not null unique,          -- detección de duplicados (firma / id del evento / texto+minuto)
  id_externo   text,
  referencia   text,
  firma_valida boolean,
  resultado    text not null default 'recibido',
  error        text,
  cuerpo       jsonb,
  ip           text,
  recibido_en  timestamptz not null default now()
);
create index if not exists pago_eventos_negocio_idx on public.pago_eventos(negocio_id, recibido_en desc);

create table if not exists public.dispositivos (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   uuid not null references public.negocios(id) on delete cascade,
  usuario_id   uuid not null references auth.users(id) on delete cascade,
  nombre       text not null default 'Celular' check (char_length(nombre) <= 60),
  plataforma   text check (char_length(plataforma) <= 120),
  token_hash   text not null unique,
  push         jsonb,                          -- suscripción Web Push del navegador (endpoint + llaves públicas)
  creado_en    timestamptz not null default now(),
  ultimo_visto timestamptz not null default now(),
  revocado_en  timestamptz
);
create index if not exists dispositivos_negocio_idx on public.dispositivos(negocio_id);

create table if not exists public.auditoria (
  id             bigserial primary key,
  negocio_id     uuid references public.negocios(id) on delete cascade,
  usuario_id     uuid references auth.users(id) on delete set null,
  dispositivo_id uuid,
  accion         text not null,
  detalle        jsonb,
  creado_en      timestamptz not null default now()
);
create index if not exists auditoria_negocio_idx on public.auditoria(negocio_id, creado_en desc);

-- Llaves del servidor (Web Push VAPID). Solo el servidor las lee.
create table if not exists public.servidor_config (
  clave        text primary key,
  valor        jsonb not null,
  creado_en    timestamptz not null default now()
);

-- ---------- RLS ----------
alter table public.pago_proveedores enable row level security;
alter table public.pagos            enable row level security;
alter table public.pago_eventos     enable row level security;
alter table public.dispositivos     enable row level security;
alter table public.auditoria        enable row level security;
alter table public.servidor_config  enable row level security;

drop policy if exists pagos_ver on public.pagos;
create policy pagos_ver on public.pagos for select using (public.es_miembro(negocio_id));
drop policy if exists pago_eventos_ver on public.pago_eventos;
create policy pago_eventos_ver on public.pago_eventos for select using (public.rol_en(negocio_id) in ('dueno','admin'));
drop policy if exists auditoria_ver on public.auditoria;
create policy auditoria_ver on public.auditoria for select using (public.rol_en(negocio_id) in ('dueno','admin'));
-- pago_proveedores, dispositivos y servidor_config: sin políticas → la app no los lee directo (solo por funciones).

revoke all on public.pago_proveedores, public.dispositivos, public.servidor_config from anon, authenticated;
revoke all on public.pagos, public.pago_eventos, public.auditoria from anon, authenticated;
grant select on public.pagos, public.pago_eventos, public.auditoria to authenticated;
grant all on public.pago_proveedores, public.pagos, public.pago_eventos, public.dispositivos, public.auditoria, public.servidor_config to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------- Ayudantes ----------
create or replace function public.vento_auditar(p_negocio uuid, p_usuario uuid, p_dispositivo uuid, p_accion text, p_detalle jsonb)
returns void language sql security definer set search_path = public, extensions as $$
  insert into auditoria(negocio_id, usuario_id, dispositivo_id, accion, detalle) values (p_negocio, p_usuario, p_dispositivo, p_accion, p_detalle)
$$;

-- ¿Se puede pasar de un estado a otro? Los estados finales no vuelven a «pendiente»;
-- un pago aprobado solo puede quedar anulado (reverso/anulación del proveedor).
create or replace function public.pago_puede_pasar(p_de text, p_a text) returns boolean
language sql immutable as $$
  select case
    when p_de = p_a then false
    when p_de = 'pendiente' then p_a in ('aprobado','rechazado','anulado','error','vencido')
    when p_de in ('error','vencido') then p_a in ('aprobado','rechazado','anulado')
    when p_de = 'aprobado' then p_a = 'anulado'
    else false end
$$;

create or replace function public.pago_publico(p public.pagos) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', p.id, 'referencia', p.referencia, 'proveedor', p.proveedor, 'metodo', p.metodo, 'canal', p.canal,
    'monto', p.monto, 'estado', p.estado, 'verificado', p.verificado, 'confianza', p.confianza, 'mesa', p.mesa, 'pagador', p.pagador,
    'telefono', p.telefono, 'url', p.url, 'qr', p.qr, 'detalle', p.detalle, 'creado_en', p.creado_en, 'actualizado_en', p.actualizado_en,
    'expira_en', p.expira_en, 'aprobado_en', p.aprobado_en, 'aplicado_en', p.aplicado_en, 'aplicado_mesa', p.aplicado_mesa, 'id_externo', p.id_externo)
$$;

-- =====================================================================
--  Funciones que usa la APP (con la sesión del usuario)
-- =====================================================================

-- Estado de las integraciones (sin secretos).
create or replace function public.pagos_estado(p_negocio uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare r text := public.rol_en(p_negocio);
begin
  if r is null then raise exception 'sin_permiso'; end if;
  return jsonb_build_object(
    'rol', r,
    'proveedores', coalesce((select jsonb_agg(jsonb_build_object('proveedor', proveedor, 'ambiente', ambiente, 'estado', estado,
        'publico', publico, 'detalle', case when r in ('dueno','admin') then detalle end, 'verificado_en', verificado_en,
        'webhook_visto_en', webhook_visto_en, 'tiene_secreto', secreto is not null,
        'webhook_token', case when r in ('dueno','admin') then webhook_token end) order by proveedor)
      from pago_proveedores where negocio_id = p_negocio), '[]'::jsonb),
    'dispositivos', (select count(*) from dispositivos where negocio_id = p_negocio and revocado_en is null),
    'pendientes', (select count(*) from pagos where negocio_id = p_negocio and estado = 'pendiente'),
    'sin_aplicar', (select count(*) from pagos where negocio_id = p_negocio and estado = 'aprobado' and aplicado_en is null)
  );
end $$;

-- ¿Puede este usuario configurar los pagos? (lo usa el servidor con la sesión del usuario)
create or replace function public.pagos_puedo(p_negocio uuid, p_accion text)
returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare r text := public.rol_en(p_negocio);
begin
  if r is null then raise exception 'sin_permiso'; end if;
  if p_accion = 'configurar' and r not in ('dueno','admin') then raise exception 'sin_permiso'; end if;
  if p_accion = 'cobrar' and r not in ('dueno','admin','cajero','mesero') then raise exception 'sin_permiso'; end if;
  return auth.uid()::text || ':' || r;
end $$;

-- Crea un cobro pendiente (el servidor luego lo manda a Wompi o a Nequi).
drop function if exists public.crear_cobro(uuid, text, text, text, bigint, text, text);
create or replace function public.crear_cobro(p_negocio uuid, p_proveedor text, p_metodo text, p_canal text, p_monto bigint,
  p_mesa text default null, p_telefono text default null, p_clave text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := public.rol_en(p_negocio); p pagos%rowtype; ref text;
begin
  if r is null or r not in ('dueno','admin','cajero','mesero') then raise exception 'sin_permiso'; end if;
  if nullif(p_clave, '') is not null then
    select * into p from pagos where negocio_id = p_negocio and clave_idem = left(p_clave, 80);
    if found then return pago_publico(p) || jsonb_build_object('repetido', true); end if;
  end if;
  if p_proveedor not in ('wompi','nequi') then raise exception 'proveedor_invalido'; end if;
  if p_canal not in ('link','push','qr') then raise exception 'canal_invalido'; end if;
  if p_monto is null or p_monto < 100 or p_monto > 50000000 then raise exception 'monto_invalido'; end if;
  if not exists (select 1 from pago_proveedores where negocio_id = p_negocio and proveedor = p_proveedor and estado = 'conectado') then
    raise exception 'proveedor_no_conectado';
  end if;
  ref := 'VNT-' || to_char(now() at time zone 'America/Bogota', 'YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
  insert into pagos(negocio_id, referencia, proveedor, metodo, canal, monto, mesa, telefono, creado_por, expira_en, proximo_intento, clave_idem)
    values (p_negocio, ref, p_proveedor, upper(coalesce(nullif(p_metodo, ''), 'OTRO')), p_canal, p_monto, left(p_mesa, 20),
            case when p_telefono is not null then '•••' || right(regexp_replace(p_telefono, '\D', '', 'g'), 4) end,
            auth.uid(), now() + interval '30 minutes', now() + interval '20 seconds', left(nullif(p_clave, ''), 80))
    returning * into p;
  perform vento_auditar(p_negocio, auth.uid(), null, 'cobro_creado', jsonb_build_object('pago', p.id, 'proveedor', p_proveedor, 'canal', p_canal, 'monto', p_monto, 'mesa', p_mesa));
  return pago_publico(p);
end $$;

-- Registra este celular en el negocio. Devuelve un token nuevo (solo se guarda su hash).
create or replace function public.registrar_dispositivo(p_negocio uuid, p_nombre text, p_plataforma text default null, p_dispositivo uuid default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r text := public.rol_en(p_negocio); tok text := encode(gen_random_bytes(24), 'hex'); d uuid;
begin
  if r is null then raise exception 'sin_permiso'; end if;
  if p_dispositivo is not null then
    update dispositivos set token_hash = encode(digest(tok, 'sha256'), 'hex'), nombre = left(coalesce(nullif(trim(p_nombre), ''), nombre), 60),
        plataforma = left(p_plataforma, 120), ultimo_visto = now(), revocado_en = null
      where id = p_dispositivo and negocio_id = p_negocio and usuario_id = auth.uid() and revocado_en is null
      returning id into d;
  end if;
  if d is null then
    insert into dispositivos(negocio_id, usuario_id, nombre, plataforma, token_hash)
      values (p_negocio, auth.uid(), left(coalesce(nullif(trim(p_nombre), ''), 'Celular'), 60), left(p_plataforma, 120), encode(digest(tok, 'sha256'), 'hex'))
      returning id into d;
    perform vento_auditar(p_negocio, auth.uid(), d, 'dispositivo_registrado', jsonb_build_object('nombre', p_nombre, 'plataforma', left(p_plataforma, 120)));
  end if;
  return jsonb_build_object('id', d, 'token', tok);
end $$;

-- Latido del celular (y su suscripción de notificaciones push, si la dio).
create or replace function public.latido_dispositivo(p_dispositivo uuid, p_push jsonb default null)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  update dispositivos set ultimo_visto = now(), push = coalesce(p_push, push)
    where id = p_dispositivo and usuario_id = auth.uid() and revocado_en is null returning true into ok;
  return coalesce(ok, false);
end $$;

-- Lista de celulares (el dueño/admin ve todos; los demás, los suyos).
create or replace function public.mis_dispositivos(p_negocio uuid)
returns table(id uuid, nombre text, plataforma text, usuario text, rol text, creado_en timestamptz, ultimo_visto timestamptz, push boolean, propio boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare r text := public.rol_en(p_negocio);
begin
  if r is null then raise exception 'sin_permiso'; end if;
  return query select d.id, d.nombre, d.plataforma, coalesce(m.nombre, m.email), m.rol, d.creado_en, d.ultimo_visto, d.push is not null, d.usuario_id = auth.uid()
    from dispositivos d left join miembros m on m.negocio_id = d.negocio_id and m.usuario_id = d.usuario_id
    where d.negocio_id = p_negocio and d.revocado_en is null and (r in ('dueno','admin') or d.usuario_id = auth.uid())
    order by d.ultimo_visto desc;
end $$;

create or replace function public.revocar_dispositivo(p_dispositivo uuid)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare d dispositivos%rowtype;
begin
  select * into d from dispositivos where id = p_dispositivo;
  if not found then return false; end if;
  if d.usuario_id <> auth.uid() and coalesce(public.rol_en(d.negocio_id), '') not in ('dueno','admin') then raise exception 'sin_permiso'; end if;
  update dispositivos set revocado_en = now(), push = null where id = p_dispositivo;
  perform vento_auditar(d.negocio_id, auth.uid(), p_dispositivo, 'dispositivo_revocado', jsonb_build_object('nombre', d.nombre));
  return true;
end $$;

-- Registrar el pago en la cuenta/mesa UNA sola vez aunque lo vean varios celulares a la vez:
-- solo el primero que llama recibe «true» y es ese celular el que lo anota en la mesa.
create or replace function public.aplicar_pago(p_pago uuid, p_mesa text, p_dispositivo uuid default null)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare p pagos%rowtype;
begin
  select * into p from pagos where id = p_pago;
  if not found then return false; end if;
  if coalesce(public.rol_en(p.negocio_id), '') not in ('dueno','admin','cajero') then raise exception 'sin_permiso'; end if;
  update pagos set aplicado_en = now(), aplicado_por = auth.uid(), aplicado_dispositivo = p_dispositivo,
      aplicado_mesa = left(p_mesa, 20), actualizado_en = now()
    where id = p_pago and aplicado_en is null and estado = 'aprobado' and confianza <> 'falso' returning * into p;
  if not found then return false; end if;
  perform vento_auditar(p.negocio_id, auth.uid(), p_dispositivo, 'pago_aplicado', jsonb_build_object('pago', p.id, 'mesa', p_mesa, 'monto', p.monto, 'metodo', p.metodo));
  return true;
end $$;

-- Un aviso del celular que llegó por SMS quedó «revisar»: el dueño/cajero confirma que lo vio en la app del banco.
create or replace function public.confirmar_pago(p_pago uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare p pagos%rowtype;
begin
  select * into p from pagos where id = p_pago;
  if not found then raise exception 'no_existe'; end if;
  if coalesce(public.rol_en(p.negocio_id), '') not in ('dueno','admin','cajero') then raise exception 'sin_permiso'; end if;
  update pagos set confianza = 'ok', actualizado_en = now() where id = p_pago and confianza = 'revisar' returning * into p;
  if found then perform vento_auditar(p.negocio_id, auth.uid(), null, 'pago_confirmado_a_mano', jsonb_build_object('pago', p.id, 'monto', p.monto)); end if;
  return pago_publico(p);
end $$;

-- Pagos cambiados desde cierta hora (para sincronizar al reconectarse).
create or replace function public.pagos_desde(p_negocio uuid, p_desde timestamptz default null, p_limite int default 200)
returns setof jsonb language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.es_miembro(p_negocio) then raise exception 'sin_permiso'; end if;
  return query select pago_publico(p) from pagos p
    where p.negocio_id = p_negocio and p.actualizado_en > coalesce(p_desde, now() - interval '2 days')
    order by p.actualizado_en asc limit least(greatest(coalesce(p_limite, 200), 1), 500);
end $$;

-- =====================================================================
--  Funciones del SERVIDOR (solo service_role)
-- =====================================================================

-- Guarda el evento crudo. Devuelve false si ya había llegado (duplicado).
create or replace function public.srv_evento(p_proveedor text, p_huella text, p_negocio uuid, p_tipo text, p_id_externo text,
  p_referencia text, p_firma_valida boolean, p_resultado text, p_cuerpo jsonb, p_ip text, p_error text default null)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare n bigint;
begin
  insert into pago_eventos(negocio_id, proveedor, tipo, huella, id_externo, referencia, firma_valida, resultado, cuerpo, ip, error)
    values (p_negocio, p_proveedor, left(p_tipo, 60), p_huella, left(p_id_externo, 120), left(p_referencia, 120), p_firma_valida,
            p_resultado, p_cuerpo, left(p_ip, 60), left(p_error, 500))
    on conflict (huella) do nothing returning id into n;
  if n is null then
    update pago_eventos set resultado = case when resultado like 'duplicado%' then resultado else resultado || ' · duplicado' end where huella = p_huella;
    return false;
  end if;
  return true;
end $$;

create or replace function public.srv_evento_resultado(p_huella text, p_resultado text, p_error text default null)
returns void language sql security definer set search_path = public, extensions as $$
  update pago_eventos set resultado = p_resultado, error = left(p_error, 500) where huella = p_huella
$$;

-- Actualiza (o crea) un pago con lo que dijo el proveedor. Idempotente: el mismo estado dos veces no cambia nada.
-- Devuelve {cambio: bool, pago: {...}}.
create or replace function public.srv_pago_actualizar(p_negocio uuid, p_proveedor text, p_referencia text, p_id_externo text,
  p_estado text, p_estado_proveedor text, p_metodo text, p_monto bigint, p_extra jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare p pagos%rowtype; nuevo boolean := false; cambio boolean := false; datos boolean := false; ext text := nullif(p_id_externo, '');
begin
  if p_estado not in ('pendiente','aprobado','rechazado','anulado','error','vencido') then raise exception 'estado_invalido'; end if;
  if p_referencia is not null then
    select * into p from pagos where negocio_id = p_negocio and referencia = p_referencia for update;
  end if;
  if not found and ext is not null then
    select * into p from pagos where proveedor = p_proveedor and id_externo = ext and negocio_id = p_negocio for update;
  end if;
  if not found then
    if coalesce(p_monto, 0) <= 0 then raise exception 'monto_invalido'; end if;
    insert into pagos(negocio_id, referencia, proveedor, metodo, canal, id_externo, monto, estado, estado_proveedor, verificado,
        confianza, pagador, telefono, mesa, detalle, aprobado_en)
      values (p_negocio, coalesce(nullif(p_referencia, ''), p_proveedor || ':' || ext), p_proveedor, upper(coalesce(nullif(p_metodo, ''), 'OTRO')),
        coalesce(p_extra->>'canal', 'link'), ext, p_monto, p_estado, p_estado_proveedor, coalesce((p_extra->>'verificado')::boolean, true),
        coalesce(p_extra->>'confianza', 'entidad'), left(p_extra->>'pagador', 80), left(p_extra->>'telefono', 20), left(p_extra->>'mesa', 20),
        left(p_extra->>'detalle', 300), case when p_estado = 'aprobado' then now() end)
      returning * into p;
    return jsonb_build_object('cambio', true, 'nuevo', true, 'pago', pago_publico(p));
  end if;
  -- Datos que no son de estado (id del proveedor, link, QR, método real) se completan sin tocar el estado.
  update pagos set
      id_externo = coalesce(id_externo, ext),
      metodo = case when nullif(p_metodo, '') is not null and upper(p_metodo) <> 'OTRO' then upper(p_metodo) else metodo end,
      url = coalesce(p_extra->>'url', url), qr = coalesce(p_extra->>'qr', qr),
      pagador = coalesce(left(p_extra->>'pagador', 80), pagador),
      ultimo_error = case when p_extra ? 'error' then left(p_extra->>'error', 300) else ultimo_error end,
      estado_proveedor = coalesce(p_estado_proveedor, estado_proveedor)
    where id = p.id;
  if pago_puede_pasar(p.estado, p_estado) then
    -- Seguridad: si el proveedor reporta otro valor del que se cobró, no se aprueba solo.
    if p_estado = 'aprobado' and p_monto is not null and p_monto > 0 and p_monto <> p.monto then
      update pagos set estado = 'error', ultimo_error = 'El valor pagado (' || p_monto || ') no coincide con el cobro (' || p.monto || ')',
          actualizado_en = now(), verificado = true where id = p.id;
    else
      update pagos set estado = p_estado, verificado = true, actualizado_en = now(),
          aprobado_en = case when p_estado = 'aprobado' then now() else aprobado_en end
        where id = p.id;
    end if;
    cambio := true;
  elsif p_extra ? 'url' or p_extra ? 'qr' or (ext is not null and p.id_externo is null) then
    update pagos set actualizado_en = now() where id = p.id;   -- llega a los celulares (link, QR), sin ser cambio de estado
    datos := true;
  end if;
  select * into p from pagos where id = p.id;
  return jsonb_build_object('cambio', cambio, 'datos', datos, 'nuevo', nuevo, 'pago', pago_publico(p));
end $$;

-- Pagos pendientes que toca consultar (con espera creciente entre intentos) y vencimiento.
create or replace function public.srv_pendientes(p_negocio uuid default null, p_limite int default 40)
returns setof jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  update pagos set estado = 'vencido', actualizado_en = now(), detalle = coalesce(detalle, 'No se pagó a tiempo')
    where estado = 'pendiente' and expira_en is not null and expira_en < now() - interval '10 minutes'
      and (p_negocio is null or negocio_id = p_negocio);
  return query
    with c as (
      select id from pagos
        where estado = 'pendiente' and proveedor in ('wompi','nequi') and (p_negocio is null or negocio_id = p_negocio)
          and coalesce(proximo_intento, now()) <= now()
        order by proximo_intento nulls first limit least(greatest(p_limite, 1), 200) for update skip locked)
    update pagos p set intentos = p.intentos + 1,
        proximo_intento = now() + make_interval(secs => least(300, 15 * power(1.6, least(p.intentos, 10))::int))
      from c where p.id = c.id
      returning jsonb_build_object('id', p.id, 'negocio_id', p.negocio_id, 'proveedor', p.proveedor, 'referencia', p.referencia,
        'id_externo', p.id_externo, 'canal', p.canal, 'monto', p.monto, 'qr', p.qr, 'intentos', p.intentos);
end $$;

create or replace function public.srv_pago(p_id uuid)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select pago_publico(p) || jsonb_build_object('negocio_id', p.negocio_id) from pagos p where p.id = p_id
$$;

-- Proveedor por token del webhook (para saber de qué negocio es el evento).
create or replace function public.srv_proveedor_por_token(p_token text)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object('negocio_id', negocio_id, 'proveedor', proveedor, 'ambiente', ambiente, 'publico', publico, 'secreto', secreto)
    from pago_proveedores where webhook_token = p_token
$$;

create or replace function public.srv_proveedor(p_negocio uuid, p_proveedor text)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object('negocio_id', negocio_id, 'proveedor', proveedor, 'ambiente', ambiente, 'publico', publico, 'secreto', secreto,
    'estado', estado, 'webhook_token', webhook_token)
    from pago_proveedores where negocio_id = p_negocio and proveedor = p_proveedor
$$;

create or replace function public.srv_proveedor_guardar(p_negocio uuid, p_proveedor text, p_ambiente text, p_publico jsonb, p_secreto text,
  p_estado text, p_detalle text, p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare tok text;
begin
  insert into pago_proveedores(negocio_id, proveedor, ambiente, publico, secreto, estado, detalle, verificado_en, webhook_token, actualizado_por, actualizado_en)
    values (p_negocio, p_proveedor, p_ambiente, coalesce(p_publico, '{}'::jsonb), p_secreto, p_estado, left(p_detalle, 500),
            case when p_estado = 'conectado' then now() end, encode(gen_random_bytes(18), 'hex'), p_usuario, now())
    on conflict (negocio_id, proveedor) do update set ambiente = excluded.ambiente, publico = excluded.publico,
      secreto = coalesce(excluded.secreto, pago_proveedores.secreto), estado = excluded.estado, detalle = excluded.detalle,
      verificado_en = case when excluded.estado = 'conectado' then now() else pago_proveedores.verificado_en end,
      actualizado_por = excluded.actualizado_por, actualizado_en = now()
    returning webhook_token into tok;
  perform vento_auditar(p_negocio, p_usuario, null, 'pagos_configurados',
    jsonb_build_object('proveedor', p_proveedor, 'ambiente', p_ambiente, 'estado', p_estado));
  return jsonb_build_object('webhook_token', tok);
end $$;

create or replace function public.srv_proveedor_desconectar(p_negocio uuid, p_proveedor text, p_usuario uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from pago_proveedores where negocio_id = p_negocio and proveedor = p_proveedor;
  perform vento_auditar(p_negocio, p_usuario, null, 'pagos_desconectados', jsonb_build_object('proveedor', p_proveedor));
end $$;

create or replace function public.srv_webhook_visto(p_negocio uuid, p_proveedor text)
returns void language sql security definer set search_path = public, extensions as $$
  update pago_proveedores set webhook_visto_en = now() where negocio_id = p_negocio and proveedor = p_proveedor
$$;

-- Celular por su token (avisos reenviados desde el celular).
create or replace function public.srv_dispositivo_por_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare d dispositivos%rowtype; r text;
begin
  select * into d from dispositivos where token_hash = encode(digest(p_token, 'sha256'), 'hex') and revocado_en is null;
  if not found then return null; end if;
  select rol into r from miembros where negocio_id = d.negocio_id and usuario_id = d.usuario_id;
  if r is null then return null; end if;
  update dispositivos set ultimo_visto = now() where id = d.id;
  return jsonb_build_object('id', d.id, 'negocio_id', d.negocio_id, 'usuario_id', d.usuario_id, 'rol', r, 'nombre', d.nombre);
end $$;

-- Suscripciones push de los celulares del negocio (para avisar de un pago con la app cerrada).
create or replace function public.srv_push_destinos(p_negocio uuid)
returns table(id uuid, push jsonb) language sql stable security definer set search_path = public, extensions as $$
  select d.id, d.push from dispositivos d join miembros m on m.negocio_id = d.negocio_id and m.usuario_id = d.usuario_id
    where d.negocio_id = p_negocio and d.revocado_en is null and d.push is not null and m.rol in ('dueno','admin','cajero')
$$;

create or replace function public.srv_push_invalido(p_dispositivo uuid)
returns void language sql security definer set search_path = public, extensions as $$
  update dispositivos set push = null where id = p_dispositivo
$$;

create or replace function public.srv_config(p_clave text, p_valor jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v jsonb;
begin
  if p_valor is not null then
    insert into servidor_config(clave, valor) values (p_clave, p_valor) on conflict (clave) do nothing;
  end if;
  select valor into v from servidor_config where clave = p_clave;
  return v;
end $$;

-- Limpieza: eventos de más de 120 días.
create or replace function public.srv_limpiar()
returns void language sql security definer set search_path = public, extensions as $$
  delete from pago_eventos where recibido_en < now() - interval '120 days';
$$;

-- ---------- Permisos de las funciones ----------
do $$
declare f text;
begin
  foreach f in array array[
    'public.vento_auditar(uuid, uuid, uuid, text, jsonb)',
    'public.srv_evento(text, text, uuid, text, text, text, boolean, text, jsonb, text, text)',
    'public.srv_evento_resultado(text, text, text)',
    'public.srv_pago_actualizar(uuid, text, text, text, text, text, text, bigint, jsonb)',
    'public.srv_pendientes(uuid, int)',
    'public.srv_pago(uuid)',
    'public.srv_proveedor_por_token(text)',
    'public.srv_proveedor(uuid, text)',
    'public.srv_proveedor_guardar(uuid, text, text, jsonb, text, text, text, uuid)',
    'public.srv_proveedor_desconectar(uuid, text, uuid)',
    'public.srv_webhook_visto(uuid, text)',
    'public.srv_dispositivo_por_token(text)',
    'public.srv_push_destinos(uuid)',
    'public.srv_push_invalido(uuid)',
    'public.srv_config(text, jsonb)',
    'public.srv_limpiar()'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
    execute 'grant execute on function ' || f || ' to service_role';
  end loop;
  foreach f in array array[
    'public.pagos_estado(uuid)',
    'public.pagos_puedo(uuid, text)',
    'public.crear_cobro(uuid, text, text, text, bigint, text, text, text)',
    'public.registrar_dispositivo(uuid, text, text, uuid)',
    'public.latido_dispositivo(uuid, jsonb)',
    'public.mis_dispositivos(uuid)',
    'public.revocar_dispositivo(uuid)',
    'public.aplicar_pago(uuid, text, uuid)',
    'public.confirmar_pago(uuid)',
    'public.pagos_desde(uuid, timestamptz, int)'] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated, service_role';
  end loop;
end $$;
grant execute on function public.rol_en(uuid), public.es_miembro(uuid) to service_role;

-- ---------- Tiempo real: los celulares reciben al instante los cambios de «pagos» ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pagos') then
    execute 'alter publication supabase_realtime add table public.pagos';
  end if;
end $$;
