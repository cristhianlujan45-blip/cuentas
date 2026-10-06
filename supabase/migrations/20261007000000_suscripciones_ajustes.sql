-- =====================================================================
--  Suscripciones · ajustes de la revisión de seguridad
--  1. Una sola prueba gratis por DUEÑO. Antes cada negocio nuevo traía 15 días de PRO, así que bastaba con
--     «subir otra vez el negocio a la nube» para no pagar nunca. Ahora, si quien creó el negocio ya tiene otro
--     negocio con suscripción (de prueba o pagada), el nuevo arranca en el plan Gratis.
--     Los negocios que ya existían antes de la beta (creados antes de billing_config.trial_desde) conservan su prueba.
--  2. La cola de pagos del panel (en revisión) muestra los 500 MÁS VIEJOS: con mucha basura en la cola los pagos
--     reales más antiguos ya no desaparecen.
--  Idempotente: se puede volver a correr.
-- =====================================================================

-- ¿Este negocio puede estrenar prueba gratis?
create or replace function public.sub_prueba_permitida(p_negocio uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((
    select n.creado_en < c.trial_desde
        or not exists (select 1 from subscriptions s join negocios o on o.id = s.business_id
                        where o.creado_por = n.creado_por and o.id <> n.id)
    from negocios n cross join billing_config c
    where n.id = p_negocio and c.id = 1), false)
$$;
revoke all on function public.sub_prueba_permitida(uuid) from public, anon, authenticated;
grant execute on function public.sub_prueba_permitida(uuid) to service_role;

create or replace function public.sub_plan_de(p_negocio uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((
    select case
      when s.id is null then case when c.trial_days > 0 and sub_prueba_permitida(n.id) and greatest(n.creado_en, c.trial_desde) + c.trial_days * interval '1 day' > now() then sub_plan_prueba() else 'free' end
      when s.status = 'active' and s.expiry_date > now() then s.plan_id
      else 'free' end
    from negocios n left join subscriptions s on s.business_id = n.id cross join billing_config c
    where n.id = p_negocio and c.id = 1), 'free')
$$;

create or replace function public.srv_sub_estado(p_negocio uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare n negocios%rowtype; s subscriptions%rowtype; c billing_config%rowtype; v_ef text; v_pend jsonb; v_ult jsonb; v_permitida boolean;
begin
  select * into n from negocios where id = p_negocio;
  if not found then raise exception 'no_existe'; end if;
  select * into c from billing_config where id = 1;
  perform srv_sub_vencer(p_negocio);
  select * into s from subscriptions where business_id = p_negocio;
  if not found and coalesce(c.trial_days, 0) > 0 then
    v_permitida := sub_prueba_permitida(p_negocio);
    insert into subscriptions(user_id, business_id, plan_id, status, source, start_date, expiry_date)
      values (n.creado_por, p_negocio, sub_plan_prueba(),
              case when v_permitida and greatest(n.creado_en, c.trial_desde) + c.trial_days * interval '1 day' > now() then 'active' else 'expired' end,
              'trial', case when v_permitida then greatest(n.creado_en, c.trial_desde) else now() end,
              case when v_permitida then greatest(n.creado_en, c.trial_desde) + c.trial_days * interval '1 day' else now() end)
      on conflict (business_id) do nothing
      returning * into s;
    if found then
      insert into payment_events(subscription_id, business_id, type, data)
        values (s.id, p_negocio, 'trial_started', jsonb_build_object('plan', s.plan_id, 'dias', case when v_permitida then c.trial_days else 0 end, 'hasta', s.expiry_date, 'ya_tuvo_prueba', not v_permitida));
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
    order by case when coalesce(p_status, 'review') = 'review' then p.created_at end asc nulls last, p.created_at desc
    limit 500) x
$$;
