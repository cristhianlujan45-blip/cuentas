-- =====================================================================
--  Vento · Suscripciones (BETA con pago manual por Nequi / DaviPlata)
--
--  La suscripción es de la CUENTA + el NEGOCIO (negocios.id), nunca del teléfono. Una fila por negocio.
--  El backend decide el plan: la app solo consulta el estado (y un token firmado por el servidor).
--
--  Tablas (en inglés, como pidió el dueño; separadas de pagos/pago_eventos, que son cobros a clientes):
--    plans              planes y precios (ÚNICA fuente de precios)
--    entitlements       funciones que se pueden habilitar (voz, OCR, reportes…)
--    plan_entitlements  qué funciones trae cada plan
--    billing_config     configuración del cobro (beta, días de prueba, números de Nequi/DaviPlata…)
--    platform_admins    proveedores de Vento que aprueban pagos
--    subscriptions      la suscripción de cada negocio (1 fila por negocio)
--    payment_records    cada pago enviado (con anti-duplicados: idempotencia, referencia, huella del comprobante)
--    payment_proofs     el comprobante (foto) de cada pago, guardado en el bucket privado «comprobantes»
--    payment_events     historial de todo lo que pasó
--
--  Seguridad: RLS en todas. El catálogo (planes) es público; la suscripción y los pagos los ven el dueño y
--  los administradores del negocio. Nadie escribe directo: todo pasa por funciones srv_* que solo puede
--  ejecutar el servidor (service_role). Se puede volver a correr sin dañar nada.
-- =====================================================================

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

-- ---------- Catálogo ----------
create table if not exists public.plans (
  id                      text primary key check (id ~ '^[a-z0-9_]{2,30}$'),
  name                    text not null check (char_length(name) between 1 and 60),
  price                   bigint not null default 0 check (price >= 0),          -- pesos colombianos
  currency                text not null default 'COP',
  period_months           int not null default 1 check (period_months between 1 and 36),
  active                  boolean not null default true,
  sort                    int not null default 0,
  description             text check (char_length(description) <= 400),
  google_play_product_id  text,                                                    -- futuro (Google Play Billing)
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists public.entitlements (
  key          text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  description  text,
  sort         int not null default 0
);

create table if not exists public.plan_entitlements (
  plan_id          text not null references public.plans(id) on delete cascade,
  entitlement_key  text not null references public.entitlements(key) on delete cascade,
  primary key (plan_id, entitlement_key)
);

create table if not exists public.billing_config (
  id                 int primary key default 1 check (id = 1),
  beta_mode          boolean not null default true,
  trial_days         int not null default 15 check (trial_days between 0 and 365),
  renew_notice_days  int not null default 7 check (renew_notice_days between 0 and 60),
  manual_methods     jsonb not null default '{"NEQUI":{"numero":"","titular":""},"DAVIPLATA":{"numero":"","titular":""}}'::jsonb,
  support_whatsapp   text,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null
);

create table if not exists public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now()
);

-- ---------- Suscripción y pagos ----------
create table if not exists public.subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete set null,            -- quien la pagó / creó
  business_id  uuid not null unique references public.negocios(id) on delete cascade,
  plan_id      text not null references public.plans(id),
  status       text not null check (status in ('pending_payment','payment_review','active','expired','canceled','rejected')),
  source       text not null check (source in ('trial','manual','google_play','admin')),
  start_date   timestamptz,
  expiry_date  timestamptz,
  auto_renew   boolean not null default false,
  external_id  text,                                                           -- token de compra de Google Play (futuro)
  canceled_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists subscriptions_vencen_idx on public.subscriptions(expiry_date) where status = 'active';

create table if not exists public.payment_records (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete set null,
  business_id      uuid not null references public.negocios(id) on delete cascade,
  subscription_id  uuid references public.subscriptions(id) on delete set null,
  plan_id          text not null references public.plans(id),
  provider         text not null default 'manual' check (provider in ('manual','google_play')),
  method           text not null check (method in ('NEQUI','DAVIPLATA','GOOGLE_PLAY')),
  amount           bigint not null check (amount > 0),
  currency         text not null default 'COP',
  reference        text check (char_length(reference) <= 60),
  payer_name       text check (char_length(payer_name) <= 80),
  payer_phone      text check (char_length(payer_phone) <= 20),
  paid_at          date,
  status           text not null default 'review' check (status in ('review','approved','rejected','canceled')),
  kind             text not null default 'new' check (kind in ('new','renewal','change')),
  idempotency_key  text check (char_length(idempotency_key) <= 80),
  proof_hash       text,
  reject_reason    text check (char_length(reject_reason) <= 200),
  period_start     timestamptz,
  period_end       timestamptz,
  created_at       timestamptz not null default now(),
  approved_at      timestamptz,
  approved_by      uuid references auth.users(id) on delete set null,
  rejected_at      timestamptz,
  rejected_by      uuid references auth.users(id) on delete set null,
  unique (business_id, idempotency_key)
);
-- Anti-duplicados: la misma referencia o el mismo comprobante no sirven para dos pagos vigentes (de ningún negocio).
create unique index if not exists payment_records_ref_uq on public.payment_records(method, lower(reference))
  where coalesce(reference, '') <> '' and status in ('review','approved');
create unique index if not exists payment_records_hash_uq on public.payment_records(proof_hash)
  where proof_hash is not null and status in ('review','approved');
-- Un solo pago en revisión por negocio.
create unique index if not exists payment_records_revision_uq on public.payment_records(business_id) where status = 'review';
create index if not exists payment_records_negocio_idx on public.payment_records(business_id, created_at desc);
create index if not exists payment_records_estado_idx on public.payment_records(status, created_at);

create table if not exists public.payment_proofs (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null unique references public.payment_records(id) on delete cascade,
  storage_path  text not null,
  mime          text,
  size_bytes    int,
  sha256        text,
  uploaded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.payment_events (
  id               bigserial primary key,
  payment_id       uuid references public.payment_records(id) on delete set null,
  subscription_id  uuid references public.subscriptions(id) on delete set null,
  business_id      uuid references public.negocios(id) on delete cascade,
  type             text not null check (type in ('trial_started','payment_submitted','duplicate_blocked','payment_approved',
                     'payment_rejected','subscription_activated','subscription_renewed','subscription_expired',
                     'subscription_canceled','plan_changed')),
  actor            uuid,
  data             jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists payment_events_negocio_idx on public.payment_events(business_id, created_at desc);

-- ---------- Semillas (no pisan lo que el administrador ya cambió) ----------
insert into public.plans(id, name, price, active, sort, description) values
  ('free',    'Gratis',  0,     true,  0, 'Vende, maneja mesas, inventario y gastos.'),
  ('basic',   'Básico',  34900, false, 1, 'Lo gratis + facturas y equipo.'),
  ('pro',     'PRO',     59900, true,  2, 'Todo para tu negocio: voz, cámara con IA, lectura de facturas y reportes.'),
  ('premium', 'Premium', 99900, false, 3, 'PRO + varias sedes.')
on conflict (id) do nothing;

insert into public.entitlements(key, description, sort) values
  ('pos_basic',           'Vender: caja, mesas y cuentas', 1),
  ('inventory',           'Inventario', 2),
  ('tables',              'Mesas', 3),
  ('expenses',            'Gastos', 4),
  ('invoices',            'Facturas', 5),
  ('ocr',                 'Leer facturas con la cámara', 6),
  ('ai_camera',           'Cámara con inteligencia artificial', 7),
  ('voice',               'Pedidos por voz', 8),
  ('advanced_reports',    'Estadísticas avanzadas', 9),
  ('multi_branch',        'Varias sedes', 10),
  ('employee_management', 'Equipo y permisos', 11)
on conflict (key) do nothing;

insert into public.plan_entitlements(plan_id, entitlement_key)
select x.plan_id, x.ent from (values
  ('free','pos_basic'), ('free','tables'), ('free','inventory'), ('free','expenses'),
  ('basic','pos_basic'), ('basic','tables'), ('basic','inventory'), ('basic','expenses'), ('basic','invoices'), ('basic','employee_management'),
  ('pro','pos_basic'), ('pro','inventory'), ('pro','tables'), ('pro','expenses'), ('pro','invoices'), ('pro','ocr'), ('pro','ai_camera'),
  ('pro','voice'), ('pro','advanced_reports'), ('pro','employee_management')
) as x(plan_id, ent)
where not exists (select 1 from public.plan_entitlements pe where pe.plan_id = x.plan_id)
on conflict do nothing;
-- Premium = todo el catálogo.
insert into public.plan_entitlements(plan_id, entitlement_key)
select 'premium', e.key from public.entitlements e
where not exists (select 1 from public.plan_entitlements pe where pe.plan_id = 'premium')
on conflict do nothing;

insert into public.billing_config(id) values (1) on conflict (id) do nothing;

-- ---------- RLS ----------
alter table public.plans              enable row level security;
alter table public.entitlements       enable row level security;
alter table public.plan_entitlements  enable row level security;
alter table public.billing_config     enable row level security;
alter table public.platform_admins    enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.payment_records    enable row level security;
alter table public.payment_proofs     enable row level security;
alter table public.payment_events     enable row level security;

drop policy if exists plans_ver on public.plans;
create policy plans_ver on public.plans for select to anon, authenticated using (true);
drop policy if exists entitlements_ver on public.entitlements;
create policy entitlements_ver on public.entitlements for select to anon, authenticated using (true);
drop policy if exists plan_entitlements_ver on public.plan_entitlements;
create policy plan_entitlements_ver on public.plan_entitlements for select to anon, authenticated using (true);
drop policy if exists subscriptions_ver on public.subscriptions;
create policy subscriptions_ver on public.subscriptions for select to authenticated
  using (public.rol_en(business_id) in ('dueno','admin'));
drop policy if exists payment_records_ver on public.payment_records;
create policy payment_records_ver on public.payment_records for select to authenticated
  using (public.rol_en(business_id) in ('dueno','admin'));
-- billing_config, platform_admins, payment_proofs y payment_events: sin políticas → solo el servidor.

revoke all on public.plans, public.entitlements, public.plan_entitlements, public.billing_config, public.platform_admins,
  public.subscriptions, public.payment_records, public.payment_proofs, public.payment_events from public, anon, authenticated;
grant select on public.plans, public.entitlements, public.plan_entitlements to anon, authenticated;
grant select on public.subscriptions, public.payment_records to authenticated;
grant all on public.plans, public.entitlements, public.plan_entitlements, public.billing_config, public.platform_admins,
  public.subscriptions, public.payment_records, public.payment_proofs, public.payment_events to service_role;
revoke all on sequence public.payment_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.payment_events_id_seq to service_role;

-- ---------- Bucket privado de comprobantes (solo si este proyecto tiene Storage) ----------
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets(id, name, public) values ('comprobantes', 'comprobantes', false) on conflict (id) do nothing;
    if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
      execute 'update storage.buckets set file_size_limit = 3145728 where id = ''comprobantes''';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
      execute 'update storage.buckets set allowed_mime_types = array[''image/jpeg'',''image/png'',''image/webp''] where id = ''comprobantes''';
    end if;
  end if;
end $$;

-- =====================================================================
--  Ayudantes internos
-- =====================================================================

-- Suma meses en la hora de Colombia: 05/10/2026 → 05/11/2026; 31/01 → 28/02.
create or replace function public.sub_sumar_meses(p_desde timestamptz, p_meses int) returns timestamptz
language sql stable set search_path = public, extensions as $$
  select ((p_desde at time zone 'America/Bogota') + p_meses * interval '1 month') at time zone 'America/Bogota'
$$;

-- Largo de una lista jsonb (0 si no es lista): el resumen no se rompe si faltan llaves.
create or replace function public.sub_largo(j jsonb) returns int
language sql immutable as $$
  select case when jsonb_typeof(j) = 'array' then jsonb_array_length(j) else 0 end
$$;

-- Plan con el que arranca la prueba gratis.
create or replace function public.sub_plan_prueba() returns text
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select id from plans where id = 'pro'),
                  (select id from plans where active and id <> 'free' order by sort limit 1), 'free')
$$;

create or replace function public.sub_plan_pub(p_plan text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'price', p.price, 'currency', p.currency, 'period_months', p.period_months,
    'active', p.active, 'sort', p.sort, 'description', p.description, 'google_play_product_id', p.google_play_product_id,
    'entitlements', coalesce((select jsonb_agg(pe.entitlement_key order by e.sort) from plan_entitlements pe
                              join entitlements e on e.key = pe.entitlement_key where pe.plan_id = p.id), '[]'::jsonb))
  from plans p where p.id = p_plan
$$;

-- {clave: true/false} para TODO el catálogo según el plan.
create or replace function public.sub_ents(p_plan text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_object_agg(e.key, exists (select 1 from plan_entitlements pe where pe.plan_id = p_plan and pe.entitlement_key = e.key)), '{}'::jsonb)
  from entitlements e
$$;

create or replace function public.sub_sus_pub(s public.subscriptions) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when s.id is null then null else jsonb_build_object('id', s.id, 'status', s.status, 'plan_id', s.plan_id,
    'plan_name', (select name from plans where id = s.plan_id), 'source', s.source, 'trial', s.source = 'trial',
    'start_date', s.start_date, 'expiry_date', s.expiry_date, 'auto_renew', s.auto_renew, 'canceled_at', s.canceled_at,
    'dias_restantes', case when s.expiry_date is null then null
                           else greatest(0, ceil(extract(epoch from (s.expiry_date - now())) / 86400))::int end,
    'updated_at', s.updated_at) end
$$;

create or replace function public.sub_pago_pub(p public.payment_records) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when p.id is null then null else jsonb_build_object('id', p.id, 'plan_id', p.plan_id,
    'plan_name', (select name from plans where id = p.plan_id), 'provider', p.provider, 'method', p.method, 'amount', p.amount,
    'currency', p.currency, 'reference', p.reference, 'payer_name', p.payer_name, 'payer_phone', p.payer_phone, 'paid_at', p.paid_at,
    'status', p.status, 'kind', p.kind, 'reject_reason', p.reject_reason, 'period_start', p.period_start, 'period_end', p.period_end,
    'created_at', p.created_at, 'approved_at', p.approved_at, 'rejected_at', p.rejected_at) end
$$;

-- Plan efectivo SIN escribir nada (si todavía no existe la fila, cuenta la prueba gratis desde que se creó el negocio).
create or replace function public.sub_plan_de(p_negocio uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((
    select case
      when s.id is null then case when c.trial_days > 0 and n.creado_en + c.trial_days * interval '1 day' > now() then sub_plan_prueba() else 'free' end
      when s.status = 'active' and s.expiry_date > now() then s.plan_id
      else 'free' end
    from negocios n left join subscriptions s on s.business_id = n.id cross join billing_config c
    where n.id = p_negocio and c.id = 1), 'free')
$$;

-- Período que resulta de pagar/dar un plan: si ya hay uno pagado, vigente y del mismo plan, se suma al final.
create or replace function public.sub_periodo(p_negocio uuid, p_plan text, p_meses int, out desde timestamptz, out hasta timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare s subscriptions%rowtype;
begin
  select * into s from subscriptions where business_id = p_negocio;
  if found and s.status = 'active' and s.source <> 'trial' and s.plan_id = p_plan and s.expiry_date > now() then
    desde := s.expiry_date;
  else
    desde := now();
  end if;
  hasta := sub_sumar_meses(desde, greatest(coalesce(p_meses, 1), 1));
end $$;

-- Resumen de los datos del negocio para el panel del proveedor.
create or replace function public.sub_resumen(d jsonb) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'productos', sub_largo(d -> 'products'),
    'inventario', (select count(*) from jsonb_array_elements(case when jsonb_typeof(d -> 'products') = 'array' then d -> 'products' else '[]'::jsonb end) e
                   where jsonb_typeof(e -> 'stock') = 'number'),
    'compras', sub_largo(d -> 'purchases'),
    'gastos', (select count(*) from jsonb_array_elements(case when jsonb_typeof(d -> 'contab') = 'array' then d -> 'contab' else '[]'::jsonb end) g
               where g ->> 'tipo' = 'gasto') + sub_largo(d -> 'expenses'),
    'ventas', sub_largo(d -> 'history'))
$$;

-- =====================================================================
--  Funciones con la sesión del usuario (las llama el servidor con su JWT)
-- =====================================================================

-- ¿Quién llama? (el servidor no decodifica el JWT por su cuenta: se lo pregunta a la base de datos)
create or replace function public.sub_yo() returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  return jsonb_build_object('id', auth.uid(), 'email', auth.jwt() ->> 'email');
end $$;

-- 'ver' = cualquier miembro; 'pagar' = dueño o administrador. Devuelve el rol.
create or replace function public.sub_puedo(p_negocio uuid, p_accion text) returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare r text;
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  r := public.rol_en(p_negocio);
  if r is null then raise exception 'sin_permiso'; end if;
  if p_accion = 'pagar' and r not in ('dueno','admin') then raise exception 'sin_permiso'; end if;
  if p_accion not in ('ver','pagar') then raise exception 'accion_invalida'; end if;
  return r;
end $$;

-- Catálogo público: planes activos con precio y funciones + configuración pública del cobro.
create or replace function public.sub_catalogo() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'planes', coalesce((select jsonb_agg(sub_plan_pub(p.id) order by p.sort, p.id) from plans p where p.active), '[]'::jsonb),
    'entitlements', coalesce((select jsonb_agg(jsonb_build_object('key', e.key, 'description', e.description) order by e.sort) from entitlements e), '[]'::jsonb),
    'config', (select jsonb_build_object('beta_mode', c.beta_mode, 'trial_days', c.trial_days, 'renew_notice_days', c.renew_notice_days,
                 'manual_methods', c.manual_methods, 'support_whatsapp', c.support_whatsapp) from billing_config c where c.id = 1))
$$;

-- Para que otros servicios del backend hagan cumplir el plan. Con sesión, solo responde por negocios propios.
create or replace function public.negocio_tiene(p_negocio uuid, p_ent text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is not null and not public.es_miembro(p_negocio) then return false; end if;
  return exists (select 1 from plan_entitlements where plan_id = sub_plan_de(p_negocio) and entitlement_key = p_ent);
end $$;

-- =====================================================================
--  Funciones del SERVIDOR (solo service_role)
-- =====================================================================

-- Vencimiento: activas con fecha pasada → expired. Si p_negocio, solo ese negocio. Devuelve cuántas vencieron.
create or replace function public.srv_sub_vencer(p_negocio uuid default null) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  with v as (
    update subscriptions set status = 'expired', updated_at = now()
      where status = 'active' and expiry_date < now() and (p_negocio is null or business_id = p_negocio)
      returning id, business_id, plan_id, source, expiry_date)
  insert into payment_events(subscription_id, business_id, type, data)
    select id, business_id, 'subscription_expired', jsonb_build_object('plan', plan_id, 'source', source, 'expiry_date', expiry_date) from v;
  get diagnostics n = row_count;
  return n;
end $$;

-- ÚNICO punto que activa una suscripción (aprobación manual, cortesía del admin y, en el futuro, Google Play).
create or replace function public.srv_sub_activar(p_negocio uuid, p_plan text, p_desde timestamptz, p_hasta timestamptz,
  p_source text, p_external text, p_actor uuid, p_payment uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare a subscriptions%rowtype; s subscriptions%rowtype; v_existia boolean; v_tipo text; v_user uuid;
begin
  if not exists (select 1 from plans where id = p_plan) then raise exception 'plan_invalido'; end if;
  if p_source is null or p_source not in ('trial','manual','google_play','admin') then raise exception 'source_invalido'; end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then raise exception 'fechas_invalidas'; end if;
  if not exists (select 1 from negocios where id = p_negocio) then raise exception 'no_existe'; end if;
  select * into a from subscriptions where business_id = p_negocio for update;
  v_existia := found;
  if v_existia and a.status = 'active' and a.expiry_date > now() and a.source <> 'trial' then
    v_tipo := case when a.plan_id = p_plan then 'subscription_renewed' else 'plan_changed' end;
  else
    v_tipo := 'subscription_activated';
  end if;
  v_user := coalesce((select user_id from payment_records where id = p_payment), a.user_id, (select creado_por from negocios where id = p_negocio));
  insert into subscriptions as t (user_id, business_id, plan_id, status, source, start_date, expiry_date, external_id, canceled_at)
    values (v_user, p_negocio, p_plan, 'active', p_source, p_desde, p_hasta, p_external, null)
  on conflict (business_id) do update set
    user_id = excluded.user_id, plan_id = excluded.plan_id, status = 'active', source = excluded.source,
    start_date = case when v_tipo = 'subscription_renewed' then t.start_date else excluded.start_date end,
    expiry_date = case when v_tipo = 'subscription_renewed' then greatest(t.expiry_date, excluded.expiry_date) else excluded.expiry_date end,
    external_id = coalesce(excluded.external_id, t.external_id), canceled_at = null, updated_at = now()
  returning * into s;
  insert into payment_events(payment_id, subscription_id, business_id, type, actor, data)
    values (p_payment, s.id, p_negocio, v_tipo, p_actor, jsonb_build_object('plan', p_plan, 'de', case when v_existia then a.plan_id end,
      'status_antes', case when v_existia then a.status end, 'source', p_source, 'desde', p_desde, 'hasta', s.expiry_date));
  return sub_sus_pub(s);
end $$;

-- Estado de la suscripción del negocio (vence perezosamente y crea la prueba gratis la primera vez).
create or replace function public.srv_sub_estado(p_negocio uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare n negocios%rowtype; s subscriptions%rowtype; c billing_config%rowtype; v_ef text; v_pend jsonb; v_ult jsonb;
begin
  select * into n from negocios where id = p_negocio;
  if not found then raise exception 'no_existe'; end if;
  select * into c from billing_config where id = 1;
  perform srv_sub_vencer(p_negocio);
  select * into s from subscriptions where business_id = p_negocio;
  if not found and coalesce(c.trial_days, 0) > 0 then
    insert into subscriptions(user_id, business_id, plan_id, status, source, start_date, expiry_date)
      values (n.creado_por, p_negocio, sub_plan_prueba(),
              case when n.creado_en + c.trial_days * interval '1 day' > now() then 'active' else 'expired' end,
              'trial', n.creado_en, n.creado_en + c.trial_days * interval '1 day')
      on conflict (business_id) do nothing
      returning * into s;
    if found then
      insert into payment_events(subscription_id, business_id, type, data)
        values (s.id, p_negocio, 'trial_started', jsonb_build_object('plan', s.plan_id, 'dias', c.trial_days, 'hasta', s.expiry_date));
    else
      select * into s from subscriptions where business_id = p_negocio;
    end if;
  end if;
  v_ef := case when s.id is not null and s.status = 'active' and s.expiry_date > now() then s.plan_id else 'free' end;
  select sub_pago_pub(p) into v_pend from payment_records p where p.business_id = p_negocio and p.status = 'review' order by p.created_at desc limit 1;
  select sub_pago_pub(p) into v_ult from payment_records p where p.business_id = p_negocio and p.status <> 'canceled' order by p.created_at desc limit 1;
  return jsonb_build_object(
    'negocio', jsonb_build_object('id', n.id, 'nombre', n.nombre),
    'subscription', sub_sus_pub(s),
    'plan_efectivo', v_ef,
    'plan', sub_plan_pub(v_ef),
    'entitlements', sub_ents(v_ef),
    'pending_payment', v_pend,
    'last_payment', v_ult,
    'renew_notice', coalesce(s.status = 'active' and s.source <> 'trial' and s.expiry_date > now()
                             and s.expiry_date <= now() + coalesce(c.renew_notice_days, 7) * interval '1 day', false),
    'ahora', now());
end $$;

-- Guarda el comprobante de un pago (ya subido a Storage por el servidor).
create or replace function public.srv_sub_comprobante(p_payment uuid, p_path text, p_mime text, p_size int, p_sha text, p_usuario uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from payment_records where id = p_payment) then raise exception 'no_existe'; end if;
  insert into payment_proofs(payment_id, storage_path, mime, size_bytes, sha256, uploaded_by)
    values (p_payment, p_path, left(p_mime, 40), p_size, p_sha, p_usuario)
  on conflict (payment_id) do update set storage_path = excluded.storage_path, mime = excluded.mime, size_bytes = excluded.size_bytes,
    sha256 = excluded.sha256, uploaded_by = excluded.uploaded_by, created_at = now();
end $$;

-- Registra un pago manual (Nequi / DaviPlata) en revisión.
--  • misma idem → devuelve el que ya existe (repetido = true)
--  • errores de validación → excepción (plan_invalido, metodo_invalido, monto_invalido, monto_insuficiente, pago_en_revision)
--  • referencia o comprobante ya usados → {error: 'referencia_usada' | 'comprobante_repetido'} SIN excepción, para que quede
--    guardado el evento duplicate_blocked (una excepción lo desharía)
--  p_id / p_path / p_mime / p_size (opcionales): el servidor sube primero la foto a Storage con el id del pago y aquí se
--  guarda todo junto en una sola transacción: nunca queda un pago sin comprobante.
create or replace function public.srv_sub_pago_crear(p_negocio uuid, p_usuario uuid, p_plan text, p_metodo text, p_monto bigint,
  p_referencia text, p_nombre text, p_telefono text, p_fecha date, p_idem text, p_hash text,
  p_id uuid default null, p_path text default null, p_mime text default null, p_size int default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_idem text := left(nullif(trim(coalesce(p_idem, '')), ''), 80);
  v_ref text := left(nullif(regexp_replace(coalesce(p_referencia, ''), '\s+', '', 'g'), ''), 60);
  v_hash text := nullif(lower(trim(coalesce(p_hash, ''))), '');
  v_metodo text := upper(trim(coalesce(p_metodo, '')));
  pl plans%rowtype; s subscriptions%rowtype; p payment_records%rowtype;
  v_hay_sus boolean; v_kind text; v_antes text; v_otro uuid; v_restr text;
begin
  if p_negocio is null or not exists (select 1 from negocios where id = p_negocio) then raise exception 'no_existe'; end if;
  if p_usuario is null then raise exception 'sin_sesion'; end if;
  -- Un pago a la vez por negocio (dos toques seguidos o dos celulares a la vez no crean dos pagos).
  perform pg_advisory_xact_lock(hashtextextended('vento_sub:' || p_negocio::text, 0));
  if v_idem is not null then
    select * into p from payment_records where business_id = p_negocio and idempotency_key = v_idem;
    if found then return jsonb_build_object('payment', sub_pago_pub(p), 'repetido', true); end if;
  end if;
  select * into pl from plans where id = p_plan;
  if not found or not pl.active or pl.id = 'free' or pl.price <= 0 then raise exception 'plan_invalido'; end if;
  if v_metodo not in ('NEQUI','DAVIPLATA') then raise exception 'metodo_invalido'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'monto_invalido'; end if;
  if p_monto < pl.price then raise exception 'monto_insuficiente'; end if;
  if exists (select 1 from payment_records where business_id = p_negocio and status = 'review') then raise exception 'pago_en_revision'; end if;
  if v_ref is not null then
    select id into v_otro from payment_records where method = v_metodo and lower(reference) = lower(v_ref) and status in ('review','approved') limit 1;
    if found then
      insert into payment_events(payment_id, business_id, type, actor, data)
        values (v_otro, p_negocio, 'duplicate_blocked', p_usuario, jsonb_build_object('motivo', 'referencia_usada', 'metodo', v_metodo, 'referencia', v_ref));
      return jsonb_build_object('error', 'referencia_usada');
    end if;
  end if;
  if v_hash is not null then
    select id into v_otro from payment_records where proof_hash = v_hash and status in ('review','approved') limit 1;
    if found then
      insert into payment_events(payment_id, business_id, type, actor, data)
        values (v_otro, p_negocio, 'duplicate_blocked', p_usuario, jsonb_build_object('motivo', 'comprobante_repetido', 'hash', v_hash));
      return jsonb_build_object('error', 'comprobante_repetido');
    end if;
  end if;

  perform srv_sub_vencer(p_negocio);
  select * into s from subscriptions where business_id = p_negocio for update;
  v_hay_sus := found;
  v_antes := s.status;
  if v_hay_sus and s.status = 'active' and s.expiry_date > now() and s.source <> 'trial' then
    v_kind := case when s.plan_id = pl.id then 'renewal' else 'change' end;
  else
    v_kind := 'new';
  end if;

  begin
    insert into payment_records(id, user_id, business_id, subscription_id, plan_id, provider, method, amount, currency, reference,
        payer_name, payer_phone, paid_at, status, kind, idempotency_key, proof_hash)
      values (coalesce(p_id, gen_random_uuid()), p_usuario, p_negocio, s.id, pl.id, 'manual', v_metodo, p_monto, pl.currency, v_ref,
        left(nullif(trim(coalesce(p_nombre, '')), ''), 80), left(nullif(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), ''), 20),
        p_fecha, 'review', v_kind, v_idem, v_hash)
      returning * into p;
  exception when unique_violation then
    -- Carrera con otro negocio que mandó la misma referencia / foto en el mismo instante.
    get stacked diagnostics v_restr = constraint_name;
    if v_restr = 'payment_records_ref_uq' then
      insert into payment_events(business_id, type, actor, data)
        values (p_negocio, 'duplicate_blocked', p_usuario, jsonb_build_object('motivo', 'referencia_usada', 'metodo', v_metodo, 'referencia', v_ref));
      return jsonb_build_object('error', 'referencia_usada');
    elsif v_restr = 'payment_records_hash_uq' then
      insert into payment_events(business_id, type, actor, data)
        values (p_negocio, 'duplicate_blocked', p_usuario, jsonb_build_object('motivo', 'comprobante_repetido', 'hash', v_hash));
      return jsonb_build_object('error', 'comprobante_repetido');
    elsif v_restr = 'payment_records_revision_uq' then
      raise exception 'pago_en_revision';
    end if;
    raise;
  end;

  -- La suscripción: si no existe se crea en revisión; si no está activa pasa a revisión;
  -- si está activa se queda activa (renovación anticipada: nada se apaga mientras se revisa).
  if not v_hay_sus then
    insert into subscriptions(user_id, business_id, plan_id, status, source)
      values (p_usuario, p_negocio, pl.id, 'payment_review', 'manual')
      on conflict (business_id) do nothing returning * into s;
    if not found then select * into s from subscriptions where business_id = p_negocio; end if;
    update payment_records set subscription_id = s.id where id = p.id returning * into p;
  elsif s.status <> 'active' then
    update subscriptions set status = 'payment_review', updated_at = now() where id = s.id;
  end if;

  if p_path is not null then
    perform srv_sub_comprobante(p.id, p_path, p_mime, p_size, v_hash, p_usuario);
  end if;
  insert into payment_events(payment_id, subscription_id, business_id, type, actor, data)
    values (p.id, s.id, p_negocio, 'payment_submitted', p_usuario, jsonb_build_object('plan', pl.id, 'monto', p_monto, 'metodo', v_metodo,
      'kind', v_kind, 'status_antes', v_antes, 'comprobante', p_path is not null));
  return jsonb_build_object('payment', sub_pago_pub(p), 'repetido', false);
end $$;

-- Aprobar un pago (proveedor de Vento). Bloquea la fila: dos administradores aprobando a la vez → una sola activación.
create or replace function public.srv_sub_aprobar(p_payment uuid, p_admin uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p payment_records%rowtype; v_meses int; v_desde timestamptz; v_hasta timestamptz; v_sus jsonb;
begin
  if p_admin is null then raise exception 'sin_permiso'; end if;
  select * into p from payment_records where id = p_payment for update;
  if not found then raise exception 'no_existe'; end if;
  if p.status = 'approved' then
    return jsonb_build_object('payment', sub_pago_pub(p), 'repetido', true,
      'subscription', (select sub_sus_pub(s) from subscriptions s where s.business_id = p.business_id));
  end if;
  if p.status <> 'review' then raise exception 'estado_invalido'; end if;
  perform srv_sub_vencer(p.business_id);
  perform 1 from subscriptions where business_id = p.business_id for update;
  select period_months into v_meses from plans where id = p.plan_id;
  select x.desde, x.hasta into v_desde, v_hasta from sub_periodo(p.business_id, p.plan_id, coalesce(v_meses, 1)) x;
  v_sus := srv_sub_activar(p.business_id, p.plan_id, v_desde, v_hasta, 'manual', null, p_admin, p.id);
  update payment_records set status = 'approved', approved_at = now(), approved_by = p_admin, period_start = v_desde,
      period_end = v_hasta, subscription_id = (v_sus ->> 'id')::uuid
    where id = p.id returning * into p;
  insert into payment_events(payment_id, subscription_id, business_id, type, actor, data)
    values (p.id, p.subscription_id, p.business_id, 'payment_approved', p_admin,
      jsonb_build_object('plan', p.plan_id, 'monto', p.amount, 'metodo', p.method, 'desde', v_desde, 'hasta', v_hasta));
  perform vento_auditar(p.business_id, p_admin, null, 'suscripcion_pago_aprobado',
    jsonb_build_object('pago', p.id, 'plan', p.plan_id, 'monto', p.amount, 'metodo', p.method, 'hasta', v_hasta));
  return jsonb_build_object('payment', sub_pago_pub(p), 'subscription', v_sus, 'repetido', false);
end $$;

-- Rechazar un pago (motivo obligatorio, máximo 200 caracteres).
create or replace function public.srv_sub_rechazar(p_payment uuid, p_admin uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p payment_records%rowtype; s subscriptions%rowtype; v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if p_admin is null then raise exception 'sin_permiso'; end if;
  if v_motivo is null or char_length(v_motivo) > 200 then raise exception 'motivo_invalido'; end if;
  select * into p from payment_records where id = p_payment for update;
  if not found then raise exception 'no_existe'; end if;
  if p.status = 'rejected' then
    return jsonb_build_object('payment', sub_pago_pub(p), 'repetido', true,
      'subscription', (select sub_sus_pub(x) from subscriptions x where x.business_id = p.business_id));
  end if;
  if p.status <> 'review' then raise exception 'estado_invalido'; end if;
  update payment_records set status = 'rejected', reject_reason = v_motivo, rejected_at = now(), rejected_by = p_admin
    where id = p.id returning * into p;
  update subscriptions set status = 'rejected', updated_at = now() where business_id = p.business_id and status = 'payment_review';
  select * into s from subscriptions where business_id = p.business_id;
  insert into payment_events(payment_id, subscription_id, business_id, type, actor, data)
    values (p.id, s.id, p.business_id, 'payment_rejected', p_admin, jsonb_build_object('motivo', v_motivo, 'monto', p.amount, 'metodo', p.method));
  perform vento_auditar(p.business_id, p_admin, null, 'suscripcion_pago_rechazado', jsonb_build_object('pago', p.id, 'motivo', v_motivo));
  return jsonb_build_object('payment', sub_pago_pub(p), 'subscription', sub_sus_pub(s), 'repetido', false);
end $$;

-- Cancelar (el plan efectivo pasa a Gratis).
create or replace function public.srv_sub_cancelar(p_negocio uuid, p_admin uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s subscriptions%rowtype; v_antes text;
begin
  if p_admin is null then raise exception 'sin_permiso'; end if;
  select * into s from subscriptions where business_id = p_negocio for update;
  if not found then raise exception 'no_existe'; end if;
  if s.status = 'canceled' then return jsonb_build_object('subscription', sub_sus_pub(s), 'repetido', true); end if;
  v_antes := s.status;
  update subscriptions set status = 'canceled', canceled_at = now(), auto_renew = false, updated_at = now() where id = s.id returning * into s;
  insert into payment_events(subscription_id, business_id, type, actor, data)
    values (s.id, p_negocio, 'subscription_canceled', p_admin, jsonb_build_object('motivo', left(p_motivo, 200), 'plan', s.plan_id, 'status_antes', v_antes));
  perform vento_auditar(p_negocio, p_admin, null, 'suscripcion_cancelada', jsonb_build_object('motivo', left(p_motivo, 200)));
  return jsonb_build_object('subscription', sub_sus_pub(s), 'repetido', false);
end $$;

-- Cambiar de plan conservando las fechas.
create or replace function public.srv_sub_cambiar_plan(p_negocio uuid, p_plan text, p_admin uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s subscriptions%rowtype; v_de text;
begin
  if p_admin is null then raise exception 'sin_permiso'; end if;
  if not exists (select 1 from plans where id = p_plan) then raise exception 'plan_invalido'; end if;
  select * into s from subscriptions where business_id = p_negocio for update;
  if not found then raise exception 'no_existe'; end if;
  if s.plan_id = p_plan then return jsonb_build_object('subscription', sub_sus_pub(s), 'repetido', true); end if;
  v_de := s.plan_id;
  update subscriptions set plan_id = p_plan, updated_at = now() where id = s.id returning * into s;
  insert into payment_events(subscription_id, business_id, type, actor, data)
    values (s.id, p_negocio, 'plan_changed', p_admin, jsonb_build_object('de', v_de, 'a', p_plan, 'por', 'admin'));
  perform vento_auditar(p_negocio, p_admin, null, 'suscripcion_plan_cambiado', jsonb_build_object('de', v_de, 'a', p_plan));
  return jsonb_build_object('subscription', sub_sus_pub(s), 'repetido', false);
end $$;

-- Meses de cortesía (source 'admin'). Si ya tiene ese plan pagado y vigente, se suman al final.
create or replace function public.srv_sub_dar(p_negocio uuid, p_plan text, p_meses int, p_admin uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_desde timestamptz; v_hasta timestamptz; v_sus jsonb;
begin
  if p_admin is null then raise exception 'sin_permiso'; end if;
  if p_meses is null or p_meses < 1 or p_meses > 36 then raise exception 'meses_invalido'; end if;
  if p_plan = 'free' or not exists (select 1 from plans where id = p_plan) then raise exception 'plan_invalido'; end if;
  if not exists (select 1 from negocios where id = p_negocio) then raise exception 'no_existe'; end if;
  perform srv_sub_vencer(p_negocio);
  perform 1 from subscriptions where business_id = p_negocio for update;
  select x.desde, x.hasta into v_desde, v_hasta from sub_periodo(p_negocio, p_plan, p_meses) x;
  v_sus := srv_sub_activar(p_negocio, p_plan, v_desde, v_hasta, 'admin', null, p_admin, null);
  perform vento_auditar(p_negocio, p_admin, null, 'suscripcion_cortesia', jsonb_build_object('plan', p_plan, 'meses', p_meses, 'hasta', v_hasta));
  return jsonb_build_object('subscription', v_sus);
end $$;

create or replace function public.srv_sub_comprobante_de(p_payment uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object('storage_path', storage_path, 'mime', mime, 'size_bytes', size_bytes, 'sha256', sha256)
  from payment_proofs where payment_id = p_payment
$$;

-- ---------- Administradores de la plataforma ----------
create or replace function public.srv_admin_es(p_usuario uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from platform_admins where user_id = p_usuario)
$$;

-- Solo se agrega si ese usuario existe con ESE correo y el correo está confirmado.
create or replace function public.srv_admin_agregar(p_usuario uuid, p_email text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from auth.users where id = p_usuario and lower(email) = lower(trim(p_email)) and email_confirmed_at is not null) then
    raise exception 'correo_sin_confirmar';
  end if;
  insert into platform_admins(user_id, email) values (p_usuario, lower(trim(p_email)))
    on conflict (user_id) do update set email = excluded.email;
end $$;

-- Pagos para el panel (p_status: review | approved | rejected | canceled | all). En revisión: el más viejo primero.
create or replace function public.srv_admin_pagos(p_status text default 'review') returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(x.j order by x.orden), '[]'::jsonb) from (
    select sub_pago_pub(p) || jsonb_build_object(
        'business_id', p.business_id, 'negocio', n.nombre, 'user_id', p.user_id, 'usuario_email', u.email,
        'comprobante', pr.payment_id is not null, 'comprobante_mime', pr.mime,
        'suscripcion', (select sub_sus_pub(s) from subscriptions s where s.business_id = p.business_id),
        'aprobar_desde', case when p.status = 'review' then d.desde end,
        'aprobar_hasta', case when p.status = 'review' then d.hasta end) as j,
      case when coalesce(p_status, 'review') = 'review' then extract(epoch from p.created_at) else -extract(epoch from p.created_at) end as orden
    from payment_records p
      join negocios n on n.id = p.business_id
      left join auth.users u on u.id = p.user_id
      left join payment_proofs pr on pr.payment_id = p.id
      left join plans pl on pl.id = p.plan_id
      left join lateral sub_periodo(p.business_id, p.plan_id, coalesce(pl.period_months, 1)) d on true
    where coalesce(p_status, 'review') in ('all','todos','') or p.status = coalesce(p_status, 'review')
    order by p.created_at desc
    limit 500) x
$$;

create or replace function public.srv_admin_suscripciones() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(x.j order by x.t desc), '[]'::jsonb) from (
    select sub_sus_pub(s) || jsonb_build_object('business_id', s.business_id, 'negocio', n.nombre,
        'dueno_email', coalesce((select m.email from miembros m where m.negocio_id = n.id and m.rol = 'dueno' limit 1),
                                (select email from auth.users where id = n.creado_por)),
        'plan_efectivo', case when s.status = 'active' and s.expiry_date > now() then s.plan_id else 'free' end,
        'ultimo_pago', (select sub_pago_pub(p) from payment_records p where p.business_id = s.business_id order by p.created_at desc limit 1)) as j,
      s.updated_at as t
    from subscriptions s join negocios n on n.id = s.business_id
    order by s.updated_at desc limit 1000) x
$$;

create or replace function public.srv_admin_negocios() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(x.j order by x.t desc), '[]'::jsonb) from (
    select jsonb_build_object('id', n.id, 'nombre', n.nombre, 'creado_en', n.creado_en,
        'dueno_email', coalesce((select m.email from miembros m where m.negocio_id = n.id and m.rol = 'dueno' limit 1),
                                (select email from auth.users where id = n.creado_por)),
        'miembros', (select count(*) from miembros m where m.negocio_id = n.id),
        'suscripcion', sub_sus_pub(s), 'plan_efectivo', sub_plan_de(n.id),
        'resumen', sub_resumen(coalesce(d.datos, '{}'::jsonb)) || jsonb_build_object('actualizado_en', d.actualizado_en)) as j,
      n.creado_en as t
    from negocios n left join subscriptions s on s.business_id = n.id left join datos_negocio d on d.negocio_id = n.id
    order by n.creado_en desc limit 1000) x
$$;

create or replace function public.srv_admin_negocio(p_negocio uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare n negocios%rowtype; s subscriptions%rowtype; d datos_negocio%rowtype;
begin
  select * into n from negocios where id = p_negocio;
  if not found then raise exception 'no_existe'; end if;
  select * into s from subscriptions where business_id = p_negocio;
  select * into d from datos_negocio where negocio_id = p_negocio;
  return jsonb_build_object(
    'negocio', jsonb_build_object('id', n.id, 'nombre', n.nombre, 'creado_en', n.creado_en,
                                  'creado_por_email', (select email from auth.users where id = n.creado_por)),
    'miembros', coalesce((select jsonb_agg(jsonb_build_object('nombre', m.nombre, 'email', m.email, 'rol', m.rol, 'creado_en', m.creado_en) order by m.creado_en)
                          from miembros m where m.negocio_id = p_negocio), '[]'::jsonb),
    'suscripcion', sub_sus_pub(s),
    'plan_efectivo', sub_plan_de(p_negocio),
    'entitlements', sub_ents(sub_plan_de(p_negocio)),
    'pagos', coalesce((select jsonb_agg(sub_pago_pub(p) || jsonb_build_object('comprobante', exists (select 1 from payment_proofs pr where pr.payment_id = p.id)) order by p.created_at desc)
                       from (select * from payment_records where business_id = p_negocio order by created_at desc limit 50) p), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'type', e.type, 'payment_id', e.payment_id, 'actor', e.actor, 'data', e.data, 'created_at', e.created_at) order by e.id desc)
                         from (select * from payment_events where business_id = p_negocio order by id desc limit 100) e), '[]'::jsonb),
    'resumen', sub_resumen(coalesce(d.datos, '{}'::jsonb)) || jsonb_build_object('actualizado_en', d.actualizado_en, 'version', d.version));
end $$;

create or replace function public.srv_admin_planes() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'planes', coalesce((select jsonb_agg(sub_plan_pub(p.id) order by p.sort, p.id) from plans p), '[]'::jsonb),
    'entitlements', coalesce((select jsonb_agg(jsonb_build_object('key', e.key, 'description', e.description, 'sort', e.sort) order by e.sort) from entitlements e), '[]'::jsonb),
    'config', (select to_jsonb(c) - 'id' from billing_config c where c.id = 1))
$$;

-- Guardar un plan: precio, nombre, activo, descripción, meses, orden y funciones (lista completa de claves).
create or replace function public.srv_admin_plan_guardar(p_plan jsonb, p_admin uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id text := lower(trim(coalesce(p_plan ->> 'id', '')));
  pl plans%rowtype; v_nuevo boolean; v_price bigint; v_active boolean; v_meses int; v_sort int; v_ents text[];
begin
  if p_admin is null then raise exception 'sin_permiso'; end if;
  if v_id !~ '^[a-z0-9_]{2,30}$' then raise exception 'plan_invalido'; end if;
  select * into pl from plans where id = v_id for update;
  v_nuevo := not found;
  if p_plan ? 'price' and coalesce(p_plan ->> 'price', '') !~ '^\d{1,9}$' then raise exception 'precio_invalido'; end if;
  if p_plan ? 'period_months' and coalesce(p_plan ->> 'period_months', '') !~ '^\d{1,2}$' then raise exception 'plan_invalido'; end if;
  if p_plan ? 'sort' and coalesce(p_plan ->> 'sort', '') !~ '^-?\d{1,4}$' then raise exception 'plan_invalido'; end if;
  if p_plan ? 'active' and jsonb_typeof(p_plan -> 'active') <> 'boolean' then raise exception 'plan_invalido'; end if;
  v_price := case when p_plan ? 'price' then (p_plan ->> 'price')::bigint else coalesce(pl.price, 0) end;
  v_active := case when p_plan ? 'active' then (p_plan ->> 'active')::boolean else coalesce(pl.active, false) end;
  v_meses := case when p_plan ? 'period_months' then (p_plan ->> 'period_months')::int else coalesce(pl.period_months, 1) end;
  v_sort := case when p_plan ? 'sort' then (p_plan ->> 'sort')::int else coalesce(pl.sort, 50) end;
  if v_id = 'free' and not v_active then raise exception 'free_siempre_activo'; end if;
  if v_id = 'free' and v_price <> 0 then raise exception 'precio_invalido'; end if;
  if v_id <> 'free' and v_price <= 0 then raise exception 'precio_invalido'; end if;
  if v_meses < 1 or v_meses > 36 then raise exception 'plan_invalido'; end if;
  if p_plan ? 'entitlements' then
    if jsonb_typeof(p_plan -> 'entitlements') <> 'array' then raise exception 'entitlement_invalido'; end if;
    v_ents := array(select distinct jsonb_array_elements_text(p_plan -> 'entitlements'));
    if exists (select 1 from unnest(v_ents) k where k not in (select key from entitlements)) then raise exception 'entitlement_invalido'; end if;
  end if;
  insert into plans as t (id, name, price, period_months, active, sort, description, google_play_product_id, updated_at)
    values (v_id, left(coalesce(nullif(trim(p_plan ->> 'name'), ''), pl.name, initcap(v_id)), 60), v_price, v_meses, v_active, v_sort,
            case when p_plan ? 'description' then left(nullif(trim(p_plan ->> 'description'), ''), 400) else pl.description end,
            case when p_plan ? 'google_play_product_id' then left(nullif(trim(p_plan ->> 'google_play_product_id'), ''), 120) else pl.google_play_product_id end,
            now())
  on conflict (id) do update set name = excluded.name, price = excluded.price, period_months = excluded.period_months,
    active = excluded.active, sort = excluded.sort, description = excluded.description,
    google_play_product_id = excluded.google_play_product_id, updated_at = now();
  if v_ents is not null then
    delete from plan_entitlements where plan_id = v_id and entitlement_key <> all (v_ents);
    insert into plan_entitlements(plan_id, entitlement_key) select v_id, k from unnest(v_ents) k on conflict do nothing;
  end if;
  perform vento_auditar(null, p_admin, null, 'plan_guardado', jsonb_build_object('plan', v_id, 'nuevo', v_nuevo, 'price', v_price, 'active', v_active, 'entitlements', to_jsonb(v_ents)));
  return sub_plan_pub(v_id);
end $$;

-- Guardar la configuración del cobro (solo las llaves que vengan).
create or replace function public.srv_admin_config_guardar(p_cfg jsonb, p_admin uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c billing_config%rowtype; v_m jsonb; k text;
begin
  if p_admin is null then raise exception 'sin_permiso'; end if;
  if p_cfg is null or jsonb_typeof(p_cfg) <> 'object' then raise exception 'config_invalida'; end if;
  if p_cfg ? 'beta_mode' and jsonb_typeof(p_cfg -> 'beta_mode') <> 'boolean' then raise exception 'config_invalida'; end if;
  if p_cfg ? 'trial_days' and (coalesce(p_cfg ->> 'trial_days', '') !~ '^\d{1,3}$' or (p_cfg ->> 'trial_days')::int > 365) then raise exception 'config_invalida'; end if;
  if p_cfg ? 'renew_notice_days' and (coalesce(p_cfg ->> 'renew_notice_days', '') !~ '^\d{1,2}$' or (p_cfg ->> 'renew_notice_days')::int > 60) then raise exception 'config_invalida'; end if;
  select * into c from billing_config where id = 1 for update;
  v_m := c.manual_methods;
  if p_cfg ? 'manual_methods' then
    if jsonb_typeof(p_cfg -> 'manual_methods') <> 'object' then raise exception 'config_invalida'; end if;
    foreach k in array array['NEQUI','DAVIPLATA'] loop
      if (p_cfg -> 'manual_methods') ? k then
        v_m := jsonb_set(v_m, array[k], jsonb_build_object(
          'numero', left(regexp_replace(coalesce(p_cfg -> 'manual_methods' -> k ->> 'numero', ''), '\D', '', 'g'), 20),
          'titular', left(trim(coalesce(p_cfg -> 'manual_methods' -> k ->> 'titular', '')), 80)), true);
      end if;
    end loop;
  end if;
  update billing_config set
      beta_mode = case when p_cfg ? 'beta_mode' then (p_cfg ->> 'beta_mode')::boolean else beta_mode end,
      trial_days = case when p_cfg ? 'trial_days' then (p_cfg ->> 'trial_days')::int else trial_days end,
      renew_notice_days = case when p_cfg ? 'renew_notice_days' then (p_cfg ->> 'renew_notice_days')::int else renew_notice_days end,
      manual_methods = v_m,
      support_whatsapp = case when p_cfg ? 'support_whatsapp'
                              then nullif(left(regexp_replace(coalesce(p_cfg ->> 'support_whatsapp', ''), '\D', '', 'g'), 20), '')
                              else support_whatsapp end,
      updated_at = now(), updated_by = p_admin
    where id = 1 returning * into c;
  perform vento_auditar(null, p_admin, null, 'cobro_config_guardada', p_cfg - 'manual_methods');
  return to_jsonb(c) - 'id';
end $$;

-- ---------- Permisos de las funciones ----------
do $$
declare f text;
begin
  -- Internas y del servidor: solo service_role.
  foreach f in array array[
    'public.sub_sumar_meses(timestamptz, int)',
    'public.sub_largo(jsonb)',
    'public.sub_plan_prueba()',
    'public.sub_plan_pub(text)',
    'public.sub_ents(text)',
    'public.sub_sus_pub(public.subscriptions)',
    'public.sub_pago_pub(public.payment_records)',
    'public.sub_plan_de(uuid)',
    'public.sub_periodo(uuid, text, int)',
    'public.sub_resumen(jsonb)',
    'public.srv_sub_vencer(uuid)',
    'public.srv_sub_activar(uuid, text, timestamptz, timestamptz, text, text, uuid, uuid)',
    'public.srv_sub_estado(uuid)',
    'public.srv_sub_comprobante(uuid, text, text, int, text, uuid)',
    'public.srv_sub_pago_crear(uuid, uuid, text, text, bigint, text, text, text, date, text, text, uuid, text, text, int)',
    'public.srv_sub_aprobar(uuid, uuid)',
    'public.srv_sub_rechazar(uuid, uuid, text)',
    'public.srv_sub_cancelar(uuid, uuid, text)',
    'public.srv_sub_cambiar_plan(uuid, text, uuid)',
    'public.srv_sub_dar(uuid, text, int, uuid)',
    'public.srv_sub_comprobante_de(uuid)',
    'public.srv_admin_es(uuid)',
    'public.srv_admin_agregar(uuid, text)',
    'public.srv_admin_pagos(text)',
    'public.srv_admin_suscripciones()',
    'public.srv_admin_negocios()',
    'public.srv_admin_negocio(uuid)',
    'public.srv_admin_planes()',
    'public.srv_admin_plan_guardar(jsonb, uuid)',
    'public.srv_admin_config_guardar(jsonb, uuid)'] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
    execute 'grant execute on function ' || f || ' to service_role';
  end loop;
  -- Con la sesión del usuario.
  foreach f in array array['public.sub_yo()', 'public.sub_puedo(uuid, text)', 'public.negocio_tiene(uuid, text)'] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated, service_role';
  end loop;
  -- Catálogo público.
  execute 'revoke all on function public.sub_catalogo() from public';
  execute 'grant execute on function public.sub_catalogo() to anon, authenticated, service_role';
end $$;
