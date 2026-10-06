-- =====================================================================
--  Suscripciones · lanzamiento sin cortarle nada a nadie
--  La prueba gratis se contaba desde que se creó el negocio. Los negocios que ya usaban Vento antes de
--  lanzar las suscripciones habrían quedado en el plan Gratis al instante (sin voz ni lectura de facturas).
--  Ahora la prueba se cuenta desde la fecha más reciente entre «se creó el negocio» y «empezó la beta»
--  (billing_config.trial_desde, que queda con la fecha en que se aplica esta migración).
--  Idempotente: se puede volver a correr.
-- =====================================================================

alter table public.billing_config add column if not exists trial_desde timestamptz not null default now();
comment on column public.billing_config.trial_desde is
  'Inicio de la beta de suscripciones: los negocios creados antes cuentan su prueba gratis desde esta fecha.';

create or replace function public.sub_plan_de(p_negocio uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((
    select case
      when s.id is null then case when c.trial_days > 0 and greatest(n.creado_en, c.trial_desde) + c.trial_days * interval '1 day' > now() then sub_plan_prueba() else 'free' end
      when s.status = 'active' and s.expiry_date > now() then s.plan_id
      else 'free' end
    from negocios n left join subscriptions s on s.business_id = n.id cross join billing_config c
    where n.id = p_negocio and c.id = 1), 'free')
$$;

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
              case when greatest(n.creado_en, c.trial_desde) + c.trial_days * interval '1 day' > now() then 'active' else 'expired' end,
              'trial', greatest(n.creado_en, c.trial_desde), greatest(n.creado_en, c.trial_desde) + c.trial_days * interval '1 day')
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
