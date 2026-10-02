-- =====================================================================
--  Vento · Integraciones del negocio guardadas en el servidor (por ahora: Google / YouTube).
--  Para que la conexión con Google NO se venza cada hora: el servidor guarda (cifrado) el
--  «refresh token» que entrega Google en el flujo oficial de código de autorización y, cuando
--  la app lo pide, consigue un acceso nuevo. La app nunca ve el refresh token ni el client secret.
-- =====================================================================

create table if not exists public.integraciones (
  negocio_id      uuid not null references public.negocios(id) on delete cascade,
  tipo            text not null check (tipo in ('google')),
  publico         jsonb not null default '{}'::jsonb,   -- client_id, cuenta conectada (nombre del canal), fecha
  secreto         text,                                 -- cifrado por el servidor (client_secret + refresh_token)
  actualizado_por uuid references auth.users(id) on delete set null,
  actualizado_en  timestamptz not null default now(),
  primary key (negocio_id, tipo)
);
alter table public.integraciones enable row level security;
revoke all on public.integraciones from anon, authenticated;
grant all on public.integraciones to service_role;

-- ¿Puede este usuario usar / configurar la integración? (lo llama el servidor con la sesión del usuario)
create or replace function public.integracion_puedo(p_negocio uuid, p_accion text)
returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare r text := public.rol_en(p_negocio);
begin
  if r is null then raise exception 'sin_permiso'; end if;
  if p_accion = 'configurar' and r not in ('dueno','admin') then raise exception 'sin_permiso'; end if;
  return auth.uid()::text || ':' || r;
end $$;

create or replace function public.srv_integracion(p_negocio uuid, p_tipo text)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object('publico', publico, 'secreto', secreto, 'actualizado_en', actualizado_en)
    from integraciones where negocio_id = p_negocio and tipo = p_tipo
$$;

create or replace function public.srv_integracion_guardar(p_negocio uuid, p_tipo text, p_publico jsonb, p_secreto text, p_usuario uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into integraciones(negocio_id, tipo, publico, secreto, actualizado_por, actualizado_en)
    values (p_negocio, p_tipo, coalesce(p_publico, '{}'::jsonb), p_secreto, p_usuario, now())
    on conflict (negocio_id, tipo) do update set publico = excluded.publico,
      secreto = coalesce(excluded.secreto, integraciones.secreto), actualizado_por = excluded.actualizado_por, actualizado_en = now();
  perform vento_auditar(p_negocio, p_usuario, null, 'integracion_guardada', jsonb_build_object('tipo', p_tipo));
end $$;

create or replace function public.srv_integracion_borrar(p_negocio uuid, p_tipo text, p_usuario uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from integraciones where negocio_id = p_negocio and tipo = p_tipo;
  perform vento_auditar(p_negocio, p_usuario, null, 'integracion_borrada', jsonb_build_object('tipo', p_tipo));
end $$;

revoke all on function public.srv_integracion(uuid, text), public.srv_integracion_guardar(uuid, text, jsonb, text, uuid),
  public.srv_integracion_borrar(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.srv_integracion(uuid, text), public.srv_integracion_guardar(uuid, text, jsonb, text, uuid),
  public.srv_integracion_borrar(uuid, text, uuid) to service_role;
revoke all on function public.integracion_puedo(uuid, text) from public, anon;
grant execute on function public.integracion_puedo(uuid, text) to authenticated, service_role;
