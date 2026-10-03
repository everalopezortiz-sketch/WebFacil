-- Make catalogue entries explicitly distinguishable as products or services.
alter table public.products
  add column if not exists item_type text not null default 'product';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_item_type_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_item_type_check
      check (item_type in ('product', 'service'));
  end if;
end
$$;

comment on column public.products.item_type is
  'Catalogue entry type. Services share the product catalogue form but do not track stock.';

-- Return payroll lines using the business timezone, not UTC day boundaries.
-- The generated commission_amount column is the source of truth:
-- round(net_amount * commission_percent / 100).
create or replace function public.get_booking_staff_earnings(
  p_user_id uuid,
  p_staff_id uuid,
  p_date_from date,
  p_date_to date,
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_timezone text := 'America/Asuncion';
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if p_staff_id is null or not exists (
    select 1 from public.booking_staff
    where id = p_staff_id and user_id = p_user_id
  ) then
    raise exception 'staff not found';
  end if;

  if p_date_from is null or p_date_to is null or p_date_to < p_date_from
     or p_date_to - p_date_from > 366 then
    raise exception 'invalid earnings period';
  end if;

  if p_status is not null and p_status not in ('pending', 'paid') then
    raise exception 'invalid settlement status';
  end if;

  select coalesce(timezone, 'America/Asuncion')
    into v_timezone
  from public.booking_settings
  where user_id = p_user_id;
  v_timezone := coalesce(v_timezone, 'America/Asuncion');

  begin
    perform now() at time zone v_timezone;
  exception when invalid_parameter_value then
    v_timezone := 'America/Asuncion';
  end;

  with earnings as (
    select
      i.id,
      i.sale_id,
      i.service_id,
      i.staff_id,
      i.service_name_snapshot as service_name,
      i.staff_name_snapshot as staff_name,
      i.quantity,
      i.unit_price,
      i.discount_amount,
      i.net_amount,
      i.commission_percent,
      i.commission_amount,
      s.sale_number,
      s.completed_at,
      s.customer_name,
      case when si.sale_item_id is null then 'pending' else 'paid' end as settlement_status
    from public.booking_service_sale_items i
    join public.booking_service_sales s
      on s.id = i.sale_id and s.user_id = i.user_id
    left join public.booking_staff_settlement_items si
      on si.sale_item_id = i.id and si.user_id = i.user_id
    where i.user_id = p_user_id
      and i.staff_id = p_staff_id
      and s.status = 'completed'
      and (s.completed_at at time zone v_timezone)::date between p_date_from and p_date_to
  ), filtered as (
    select *
    from earnings
    where p_status is null or settlement_status = p_status
  ), paged as (
    select *
    from filtered
    order by completed_at desc, id desc
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(paged) order by completed_at desc, id desc) from paged), '[]'::jsonb),
    'limit', v_limit,
    'offset', v_offset,
    'total', (select count(*) from filtered),
    'summary', jsonb_build_object(
      'serviceTotal', coalesce((select sum(net_amount) from earnings), 0),
      'commissionTotal', coalesce((select sum(commission_amount) from earnings), 0),
      'pendingServiceTotal', coalesce((select sum(net_amount) from earnings where settlement_status = 'pending'), 0),
      'pendingCommissionTotal', coalesce((select sum(commission_amount) from earnings where settlement_status = 'pending'), 0),
      'pendingCount', (select count(*) from earnings where settlement_status = 'pending'),
      'paidCommissionTotal', coalesce((select sum(commission_amount) from earnings where settlement_status = 'paid'), 0)
    )
  ) into v_result;

  return v_result;
end
$$;

-- Preview the exact amount that the payment RPC will create. Salary is prorated
-- by uncovered calendar days; commissions are pending service lines only.
create or replace function public.preview_booking_staff_pending(
  p_user_id uuid,
  p_staff_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_staff public.booking_staff%rowtype;
  v_timezone text := 'America/Asuncion';
  v_service_total numeric(14,2) := 0;
  v_commission_total numeric(14,2) := 0;
  v_base_salary numeric(14,2) := 0;
  v_gross numeric(14,2) := 0;
  v_advances_available numeric(14,2) := 0;
  v_advances_total numeric(14,2) := 0;
  v_item_count integer := 0;
begin
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start
     or p_period_end - p_period_start > 366 then
    raise exception 'invalid settlement period';
  end if;

  select * into v_staff
  from public.booking_staff
  where id = p_staff_id and user_id = p_user_id;

  if not found then
    raise exception 'staff not found';
  end if;

  select coalesce(timezone, 'America/Asuncion')
    into v_timezone
  from public.booking_settings
  where user_id = p_user_id;
  v_timezone := coalesce(v_timezone, 'America/Asuncion');

  begin
    perform now() at time zone v_timezone;
  exception when invalid_parameter_value then
    v_timezone := 'America/Asuncion';
  end;

  select count(*)::integer,
         coalesce(sum(i.net_amount), 0),
         coalesce(sum(i.commission_amount), 0)
    into v_item_count, v_service_total, v_commission_total
  from public.booking_service_sale_items i
  join public.booking_service_sales s
    on s.id = i.sale_id and s.user_id = i.user_id
  where i.user_id = p_user_id
    and i.staff_id = p_staff_id
    and s.status = 'completed'
    and (s.completed_at at time zone v_timezone)::date between p_period_start and p_period_end
    and not exists (
      select 1
      from public.booking_staff_settlement_items previous
      where previous.sale_item_id = i.id
    );

  if v_staff.compensation_type in ('salary', 'mixed') then
    select coalesce(sum(
      case v_staff.pay_frequency
        when 'weekly' then v_staff.salary_amount / 7.0
        else v_staff.salary_amount /
          extract(day from (date_trunc('month', work_day) + interval '1 month - 1 day'))
      end
    ), 0)
      into v_base_salary
    from generate_series(p_period_start, p_period_end, interval '1 day') as work_day
    where not exists (
      select 1
      from public.booking_staff_settlements paid
      where paid.user_id = p_user_id
        and paid.staff_id = p_staff_id
        and paid.status = 'paid'
        and paid.base_salary_amount > 0
        and work_day::date between paid.period_start and paid.period_end
    );
  end if;

  v_base_salary := round(coalesce(v_base_salary, 0), 2);
  v_gross := v_base_salary + v_commission_total;

  select coalesce(sum(amount - applied_amount), 0)
    into v_advances_available
  from public.booking_staff_advances
  where user_id = p_user_id
    and staff_id = p_staff_id
    and status in ('pending', 'partial')
    and advance_date <= p_period_end
    and applied_amount < amount;

  v_advances_total := least(v_gross, v_advances_available);

  return jsonb_build_object(
    'staffId', p_staff_id,
    'periodStart', p_period_start,
    'periodEnd', p_period_end,
    'serviceItemCount', v_item_count,
    'serviceTotal', v_service_total,
    'baseSalaryAmount', v_base_salary,
    'commissionTotal', v_commission_total,
    'grossAmount', v_gross,
    'advancesAvailable', v_advances_available,
    'advancesTotal', v_advances_total,
    'netPaid', v_gross - v_advances_total
  );
end
$$;

-- Atomic payment using the exact same rules as the preview above.
create or replace function public.pay_booking_staff_pending(
  p_user_id uuid,
  p_staff_id uuid,
  p_period_start date,
  p_period_end date,
  p_payment_method text,
  p_paid_at timestamp with time zone default now(),
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_staff public.booking_staff%rowtype;
  v_settlement public.booking_staff_settlements%rowtype;
  v_preview jsonb;
  v_timezone text := 'America/Asuncion';
  v_item_count integer := 0;
  v_commission_total numeric(14,2) := 0;
  v_base_salary numeric(14,2) := 0;
  v_gross numeric(14,2) := 0;
  v_advances_total numeric(14,2) := 0;
  v_remaining_to_offset numeric(14,2) := 0;
  v_apply numeric(14,2) := 0;
  v_advance record;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_user_id and business_type = 'booking'
  ) then
    raise exception 'operation not allowed' using errcode = '42501';
  end if;

  if p_period_start is null or p_period_end is null or p_period_end < p_period_start
     or p_period_end - p_period_start > 366 then
    raise exception 'invalid settlement period';
  end if;

  if p_payment_method not in ('cash', 'transfer', 'card', 'mixed', 'other') then
    raise exception 'invalid payment method';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_staff_id::text, 0)
  );

  select * into v_staff
  from public.booking_staff
  where id = p_staff_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'staff not found';
  end if;

  select coalesce(timezone, 'America/Asuncion')
    into v_timezone
  from public.booking_settings
  where user_id = p_user_id;
  v_timezone := coalesce(v_timezone, 'America/Asuncion');

  begin
    perform now() at time zone v_timezone;
  exception when invalid_parameter_value then
    v_timezone := 'America/Asuncion';
  end;

  v_preview := public.preview_booking_staff_pending(
    p_user_id, p_staff_id, p_period_start, p_period_end
  );
  v_base_salary := coalesce((v_preview ->> 'baseSalaryAmount')::numeric, 0);

  insert into public.booking_staff_settlements (
    user_id, staff_id, period_start, period_end,
    compensation_type_snapshot, pay_frequency_snapshot,
    base_salary_amount, commission_total, advances_total, net_paid,
    payment_method, paid_at, notes, created_by
  ) values (
    p_user_id, p_staff_id, p_period_start, p_period_end,
    v_staff.compensation_type, v_staff.pay_frequency,
    0, 0, 0, 0,
    p_payment_method, coalesce(p_paid_at, now()), nullif(btrim(p_notes), ''), p_user_id
  ) returning * into v_settlement;

  with inserted as (
    insert into public.booking_staff_settlement_items (
      settlement_id, sale_item_id, user_id, commission_amount_snapshot
    )
    select
      v_settlement.id,
      i.id,
      p_user_id,
      i.commission_amount
    from public.booking_service_sale_items i
    join public.booking_service_sales s
      on s.id = i.sale_id and s.user_id = i.user_id
    where i.user_id = p_user_id
      and i.staff_id = p_staff_id
      and s.status = 'completed'
      and (s.completed_at at time zone v_timezone)::date between p_period_start and p_period_end
      and not exists (
        select 1 from public.booking_staff_settlement_items previous
        where previous.sale_item_id = i.id
      )
    on conflict (sale_item_id) do nothing
    returning commission_amount_snapshot
  )
  select count(*)::integer, coalesce(sum(commission_amount_snapshot), 0)
    into v_item_count, v_commission_total
  from inserted;

  v_gross := v_base_salary + v_commission_total;
  if v_gross <= 0 then
    raise exception 'nothing pending for settlement';
  end if;

  update public.booking_staff_settlements
  set base_salary_amount = v_base_salary,
      commission_total = v_commission_total,
      net_paid = v_gross
  where id = v_settlement.id and user_id = p_user_id;

  v_remaining_to_offset := v_gross;
  for v_advance in
    select a.id, a.amount, a.applied_amount, (a.amount - a.applied_amount) as remaining_amount
    from public.booking_staff_advances a
    where a.user_id = p_user_id
      and a.staff_id = p_staff_id
      and a.status in ('pending', 'partial')
      and a.advance_date <= p_period_end
      and a.applied_amount < a.amount
    order by a.advance_date, a.created_at, a.id
    for update
  loop
    exit when v_remaining_to_offset <= 0;
    v_apply := least(v_advance.remaining_amount, v_remaining_to_offset);

    insert into public.booking_staff_settlement_advances (
      settlement_id, advance_id, user_id, amount_applied
    ) values (
      v_settlement.id, v_advance.id, p_user_id, v_apply
    );

    update public.booking_staff_advances
    set applied_amount = applied_amount + v_apply,
        status = case when applied_amount + v_apply >= amount then 'applied' else 'partial' end
    where id = v_advance.id and user_id = p_user_id;

    v_advances_total := v_advances_total + v_apply;
    v_remaining_to_offset := v_remaining_to_offset - v_apply;
  end loop;

  update public.booking_staff_settlements
  set advances_total = v_advances_total,
      net_paid = v_gross - v_advances_total
  where id = v_settlement.id and user_id = p_user_id
  returning * into v_settlement;

  return jsonb_build_object(
    'settlementId', v_settlement.id,
    'settlementNumber', v_settlement.settlement_number,
    'periodStart', v_settlement.period_start,
    'periodEnd', v_settlement.period_end,
    'serviceItemCount', v_item_count,
    'baseSalaryAmount', v_settlement.base_salary_amount,
    'commissionTotal', v_settlement.commission_total,
    'advancesTotal', v_settlement.advances_total,
    'netPaid', v_settlement.net_paid,
    'paidAt', v_settlement.paid_at
  );
end
$$;

revoke execute on function public.get_booking_staff_earnings(uuid, uuid, date, date, text, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.preview_booking_staff_pending(uuid, uuid, date, date)
  from public, anon, authenticated;
revoke execute on function public.pay_booking_staff_pending(uuid, uuid, date, date, text, timestamp with time zone, text)
  from public, anon, authenticated;

grant execute on function public.get_booking_staff_earnings(uuid, uuid, date, date, text, integer, integer)
  to service_role;
grant execute on function public.preview_booking_staff_pending(uuid, uuid, date, date)
  to service_role;
grant execute on function public.pay_booking_staff_pending(uuid, uuid, date, date, text, timestamp with time zone, text)
  to service_role;
