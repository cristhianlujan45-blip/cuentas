-- =====================================================================
--  Lo mínimo de Supabase sobre un PostgreSQL 16 normal, para probar las migraciones de verdad.
--  Lo aplica supabase-local.js ANTES de supabase/migrations/*.sql (en una base de prueba desechable).
--  Imita:
--    • roles anon / authenticated / service_role (service_role salta RLS, como en Supabase)
--    • esquema auth: auth.users, auth.uid(), auth.jwt(), auth.role(), auth.email()
--      (leen request.jwt.claims, que el servidor de prueba pone en cada petición)
--    • esquema extensions con pgcrypto (como Supabase)
--    • permisos por defecto del esquema public (Supabase da todo a anon/authenticated/service_role;
--      por eso las migraciones deben revocar y usar RLS)
--    • publicación supabase_realtime (la usa la migración de pagos)
--    • esquema storage mínimo (buckets / objects) para el bucket privado «comprobantes»
--  Se puede volver a correr: todo es «if not exists» / «or replace».
-- =====================================================================

-- ---------- Roles (son de todo el servidor PostgreSQL: se crean una vez) ----------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
alter role service_role bypassrls;

-- ---------- Extensiones (Supabase las pone en el esquema «extensions») ----------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------- Permisos por defecto como en Supabase ----------
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ---------- auth ----------
create schema if not exists auth;
create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  aud                 text default 'authenticated',
  role                text default 'authenticated',
  email               text,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  raw_app_meta_data   jsonb not null default '{"provider":"email","providers":["email"]}'::jsonb,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  last_sign_in_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists users_email_uq on auth.users (lower(email)) where email is not null;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), auth.jwt() ->> 'sub'), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.jwt() ->> 'role')
$$;
create or replace function auth.email() returns text language sql stable as $$
  select auth.jwt() ->> 'email'
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant all on auth.users to service_role;

-- ---------- Tiempo real (solo la publicación; el servidor de prueba no transmite cambios) ----------
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- ---------- storage (mínimo) ----------
create schema if not exists storage;
create table if not exists storage.buckets (
  id                  text primary key,
  name                text not null unique,
  owner               uuid,
  public              boolean not null default false,
  file_size_limit     bigint,
  allowed_mime_types  text[],
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets(id),
  name        text not null,
  owner       uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to service_role;
