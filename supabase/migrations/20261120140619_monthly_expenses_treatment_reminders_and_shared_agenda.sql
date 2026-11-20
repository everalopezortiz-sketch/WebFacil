create function public.webfacil_booking_timezone(p_user_id uuid)
returns text language sql stable set search_path = ''
as $$
  select coalesce(
    (select s.timezone from public.booking_settings s
     where s.user_id = p_user_id
       and exists (select 1 from pg_catalog.pg_timezone_names t where t.name = s.timezone)),
    'America/Asuncion'
  );
$$;

-- Only explicitly configured or paid months need a stored plan.
alter table public.finance_expense_templates
  add column recurring_start_month date,
  add column monthly_payment_count smallint not null default 1 check (monthly_payment_count between 1 and 24);

create table public.finance_recurring_expense_months (
  user_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid not null references public.finance_expense_templates(id) on delete cascade,
  month_start date not null check (extract(day from month_start) = 1),
  amount_per_payment numeric(14, 2) not null check (amount_per_payment > 0),
  expected_payments integer not null check (expected_payments > 0),
  primary key (user_id, template_id, month_start)
);
alter table public.finance_recurring_expense_months enable row level security;
revoke all on public.finance_recurring_expense_months from anon, authenticated, public;
grant select, insert, update on public.finance_recurring_expense_months to service_role;

alter table public.finance_expenses
  add column recurring_month date check (extract(day from recurring_month) = 1),
  add column recurring_request_id uuid;

create unique index finance_recurring_expense_request
  on public.finance_expenses (user_id, recurring_request_id) where recurring_request_id is not null;
create index finance_recurring_expense_lookup
  on public.finance_expenses (user_id, (coalesce(recurring_month, date_trunc('month', expense_date::timestamp)::date)), template_id)
  where template_id is not null and status = 'posted';

create function public.save_monthly_expense_template(
  p_user_id uuid, p_template_id uuid, p_category_id uuid, p_name text, p_default_amount numeric,
  p_payment_method text, p_supplier text, p_notes text, p_is_active boolean, p_month date, p_payment_count integer
)
returns uuid language plpgsql set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_month is null or extract(day from p_month) <> 1 or coalesce(p_payment_count, 0) not between 1 and 24 then
    raise exception 'invalid recurring plan' using errcode = '22023';
  end if;

  v_id := public.save_business_expense_template(
    p_user_id, p_template_id, p_category_id, p_name, p_default_amount, p_payment_method,
    p_supplier, p_notes, p_is_active
  );

  update public.finance_expense_templates
  set monthly_payment_count = p_payment_count,
      recurring_start_month = case when p_template_id is null then p_month
        else least(p_month, coalesce(recurring_start_month, date_trunc('month', created_at at time zone public.webfacil_booking_timezone(p_user_id))::date))
      end
  where id = v_id and user_id = p_user_id;

  insert into public.finance_recurring_expense_months (user_id, template_id, month_start, amount_per_payment, expected_payments)
  values (p_user_id, v_id, p_month, p_default_amount, p_payment_count)
  on conflict (user_id, template_id, month_start) do update
  set amount_per_payment = excluded.amount_per_payment, expected_payments = excluded.expected_payments;

  return v_id;
end;
$$;

create function public.get_monthly_recurring_expenses(p_user_id uuid, p_month date)
returns jsonb language sql stable set search_path = ''
as $$
  with clock as (
    select public.webfacil_booking_timezone(p_user_id) as tz
  ), paid as (
    select e.template_id, count(*) as paid_count, sum(e.amount) as paid_amount,
      jsonb_agg(jsonb_build_object('id', e.id, 'date', e.expense_date, 'amount', e.amount)
        order by e.expense_date, e.created_at, e.id) as payments
    from public.finance_expenses e
    where e.user_id = p_user_id and e.template_id is not null and e.status = 'posted'
      and coalesce(e.recurring_month, date_trunc('month', e.expense_date::timestamp)::date) = p_month
    group by e.template_id
  )
  select jsonb_build_object(
    'today', (now() at time zone clock.tz)::date,
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'categoryId', t.category_id, 'categoryName', c.name,
        'paymentMethod', t.payment_method, 'supplier', t.supplier, 'notes', t.notes, 'isActive', t.is_active,
        'amountPerPayment', coalesce(m.amount_per_payment, t.default_amount),
        'plannedPayments', coalesce(m.expected_payments, t.monthly_payment_count),
        'expectedPayments', greatest(coalesce(m.expected_payments, t.monthly_payment_count), coalesce(p.paid_count, 0)),
        'paidAmount', coalesce(p.paid_amount, 0), 'payments', coalesce(p.payments, '[]'::jsonb)
      ) order by t.is_active desc, lower(t.name), t.id)
      from public.finance_expense_templates t
      left join public.finance_expense_categories c on c.id = t.category_id and c.user_id = t.user_id
      left join public.finance_recurring_expense_months m on m.user_id = t.user_id and m.template_id = t.id and m.month_start = p_month
      left join paid p on p.template_id = t.id
      where t.user_id = p_user_id and (
        (t.is_active and coalesce(t.recurring_start_month, date_trunc('month', t.created_at at time zone clock.tz)::date) <= p_month)
        or m.template_id is not null or p.template_id is not null
      )
    ), '[]'::jsonb)
  )
  from clock;
$$;

create function public.set_monthly_recurring_expense_payment(
  p_user_id uuid, p_template_id uuid, p_month date, p_paid_count integer, p_payment_date date,
  p_amount numeric, p_request_id uuid, p_undo_expense_id uuid
)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  v_template public.finance_expense_templates%rowtype;
  v_paid integer;
  v_amount numeric;
  v_plan_count integer;
  v_expense_id uuid;
  v_result jsonb;
begin
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'invalid recurring month' using errcode = '22023';
  end if;

  select * into v_template
  from public.finance_expense_templates
  where user_id = p_user_id and id = p_template_id
  for update;
  if not found then
    raise exception 'template not found' using errcode = 'P0002';
  end if;

  select coalesce(m.amount_per_payment, v_template.default_amount),
    coalesce(m.expected_payments, v_template.monthly_payment_count)
  into v_amount, v_plan_count
  from (select 1) seed
  left join public.finance_recurring_expense_months m
    on m.user_id = p_user_id and m.template_id = p_template_id and m.month_start = p_month;

  select count(*) into v_paid from public.finance_expenses e
  where e.user_id = p_user_id and e.template_id = p_template_id and e.status = 'posted'
    and coalesce(e.recurring_month, date_trunc('month', e.expense_date::timestamp)::date) = p_month;

  if p_undo_expense_id is not null then
    select e.id into v_expense_id from public.finance_expenses e
    where e.user_id = p_user_id and e.template_id = p_template_id and e.id = p_undo_expense_id
      and coalesce(e.recurring_month, date_trunc('month', e.expense_date::timestamp)::date) = p_month
    for update;
    if not found then
      raise exception 'recurring payment not found' using errcode = 'P0002';
    end if;

    v_result := public.void_business_expense(p_user_id, v_expense_id, 'Pago desmarcado en el control mensual');
  else
    if p_request_id is null or p_payment_date is null or coalesce(p_amount, 0) <= 0
      or p_payment_date > (now() at time zone public.webfacil_booking_timezone(p_user_id))::date then
      raise exception 'invalid recurring payment' using errcode = '22023';
    end if;
    select e.id into v_expense_id from public.finance_expenses e
    where e.user_id = p_user_id and e.template_id = p_template_id and e.recurring_request_id = p_request_id
      and e.recurring_month = p_month;
    if found then return jsonb_build_object('id', v_expense_id); end if;

    if not v_template.is_active then
      raise exception 'inactive recurring expense' using errcode = 'P0002';
    end if;
    if p_paid_count is distinct from v_paid then
      raise exception 'payment count changed' using errcode = '40001';
    end if;

    v_result := public.quick_add_business_expense(p_user_id, p_template_id, p_payment_date, p_amount, null);
    update public.finance_expenses
    set recurring_month = p_month, recurring_request_id = p_request_id
    where user_id = p_user_id and id = (v_result->>'id')::uuid;
    v_paid := v_paid + 1;
  end if;

  insert into public.finance_recurring_expense_months (user_id, template_id, month_start, amount_per_payment, expected_payments)
  values (p_user_id, p_template_id, p_month, v_amount, greatest(v_plan_count, v_paid))
  on conflict (user_id, template_id, month_start) do update
  set expected_payments = greatest(finance_recurring_expense_months.expected_payments, excluded.expected_payments);

  return v_result;
end;
$$;

-- A reminder belongs to a completed service sale. Older dated follow-ups use their original IDs.
alter table public.booking_service_sales add column checkout_request_id uuid;
create unique index booking_service_sale_checkout_request
  on public.booking_service_sales (user_id, checkout_request_id) where checkout_request_id is not null;

create table public.booking_treatment_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sale_id uuid unique references public.booking_service_sales(id) on delete cascade,
  customer_name text not null,
  customer_phone text,
  due_on date not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'contacted', 'dismissed', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.booking_treatment_reminders enable row level security;
revoke all on public.booking_treatment_reminders from anon, authenticated, public;
grant select, insert, update on public.booking_treatment_reminders to service_role;
create index booking_treatment_due_by_user
  on public.booking_treatment_reminders (user_id, due_on, id)
  where status in ('pending', 'contacted');

insert into public.booking_treatment_reminders
  (id, user_id, customer_name, customer_phone, due_on, notes, status, created_at, updated_at)
select r.id, r.user_id, coalesce(nullif(c.full_name, ''), nullif(r.client_full_name_snapshot, ''), 'Cliente'),
  coalesce(nullif(c.phone, ''), r.client_phone_snapshot), r.next_check_date, r.next_session_notes, r.next_treatment_status,
  r.created_at, r.updated_at
from public.diagnostic_records r
join public.profiles p on p.id = r.user_id and p.business_type = 'booking'
left join public.clients c on c.id = r.client_id and c.user_id = r.user_id
where r.status <> 'archived' and r.next_check_date is not null
on conflict (id) do nothing;

-- Keep the customer directory and link its service history independently of diagnostics.
insert into public.clients (user_id, full_name, phone)
select distinct on (s.user_id, lower(btrim(s.customer_name)), regexp_replace(coalesce(s.customer_phone, ''), '[^0-9]', '', 'g'))
  s.user_id, btrim(s.customer_name), btrim(coalesce(s.customer_phone, ''))
from public.booking_service_sales s
where s.status = 'completed' and s.client_id is null and nullif(btrim(s.customer_name), '') is not null
  and not exists (
    select 1 from public.clients c where c.user_id = s.user_id and lower(btrim(c.full_name)) = lower(btrim(s.customer_name))
      and coalesce(c.phone_normalized, '') = regexp_replace(coalesce(s.customer_phone, ''), '[^0-9]', '', 'g')
  )
order by s.user_id, lower(btrim(s.customer_name)), regexp_replace(coalesce(s.customer_phone, ''), '[^0-9]', '', 'g'),
  s.completed_at desc, s.id;

with matches as (
  select s.id, s.user_id, (
    select c.id from public.clients c
    where c.user_id = s.user_id and lower(btrim(c.full_name)) = lower(btrim(s.customer_name))
      and coalesce(c.phone_normalized, '') = regexp_replace(coalesce(s.customer_phone, ''), '[^0-9]', '', 'g')
    order by c.is_active desc, c.created_at, c.id limit 1
  ) as client_id
  from public.booking_service_sales s
  where s.status = 'completed' and s.client_id is null and nullif(btrim(s.customer_name), '') is not null
)
update public.booking_service_sales s set client_id = matches.client_id
from matches
where s.id = matches.id and s.user_id = matches.user_id and s.client_id is null and matches.client_id is not null;

create index booking_service_sales_client_history
  on public.booking_service_sales (user_id, client_id, completed_at desc) where client_id is not null;

create function public.get_booking_clients(p_user_id uuid, p_query text, p_offset integer, p_limit integer)
returns setof public.clients language sql stable set search_path = ''
as $$
  select c.*
  from public.clients c
  where c.user_id = p_user_id and c.is_active and (
    nullif(btrim(p_query), '') is null
    or strpos(lower(c.full_name), lower(btrim(p_query))) > 0
    or strpos(c.phone_normalized, nullif(regexp_replace(p_query, '[^0-9]', '', 'g'), '')) > 0
  )
  order by c.created_at desc, c.id desc
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 50);
$$;

create function public.create_booking_service_sale_with_reminder(
  p_user_id uuid, p_items jsonb, p_appointment_id uuid, p_client_id uuid, p_customer_name text, p_customer_phone text,
  p_mark_paid boolean, p_payment_method text, p_completed_at timestamptz, p_notes text,
  p_request_id uuid, p_due_on date, p_reminder_notes text
)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  v_result jsonb;
  v_sale public.booking_service_sales%rowtype;
  v_due_on date;
  v_client_id uuid;
  v_name_key text;
  v_phone_key text;
begin
  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_request_id::text, 0));
    select * into v_sale from public.booking_service_sales
    where user_id = p_user_id and checkout_request_id = p_request_id;
    if found then
      select r.due_on into v_due_on from public.booking_treatment_reminders r where r.sale_id = v_sale.id;
      return jsonb_build_object('saleId', v_sale.id, 'saleNumber', v_sale.sale_number,
        'totalAmount', v_sale.total_amount, 'paymentStatus', v_sale.payment_status,
        'completedAt', v_sale.completed_at, 'alreadyExisted', true, 'reminderDate', v_due_on);
    end if;
  end if;

  v_result := public.create_booking_service_sale(p_user_id, p_items, p_appointment_id, p_client_id,
    p_customer_name, p_customer_phone, p_mark_paid, p_payment_method, p_completed_at, p_notes);
  select * into strict v_sale from public.booking_service_sales
  where user_id = p_user_id and id = (v_result->>'saleId')::uuid;

  if (v_result->>'alreadyExisted')::boolean then
    select r.due_on into v_due_on from public.booking_treatment_reminders r where r.sale_id = v_sale.id;
    return v_result || jsonb_build_object('reminderDate', v_due_on);
  end if;

  if p_request_id is not null then
    update public.booking_service_sales set checkout_request_id = p_request_id
    where id = v_sale.id and user_id = p_user_id;
  end if;

  if v_sale.client_id is null and nullif(btrim(v_sale.customer_name), '') is not null then
    v_name_key := lower(btrim(v_sale.customer_name));
    v_phone_key := regexp_replace(coalesce(v_sale.customer_phone, ''), '[^0-9]', '', 'g');
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || v_name_key || ':' || v_phone_key, 1));
    select c.id into v_client_id
    from public.clients c
    where c.user_id = p_user_id and lower(btrim(c.full_name)) = v_name_key
      and coalesce(c.phone_normalized, '') = v_phone_key
    order by c.is_active desc, c.created_at, c.id limit 1;

    if v_client_id is null then
      insert into public.clients (user_id, full_name, phone)
      values (p_user_id, btrim(v_sale.customer_name), btrim(coalesce(v_sale.customer_phone, '')))
      returning id into v_client_id;
    end if;
    update public.booking_service_sales set client_id = v_client_id
    where id = v_sale.id and user_id = p_user_id;
  end if;

  if p_due_on is not null then
    if nullif(btrim(v_sale.customer_name), '') is null then
      raise exception 'REMINDER_CUSTOMER_REQUIRED' using errcode = '22023';
    end if;
    if p_due_on < (v_sale.completed_at at time zone public.webfacil_booking_timezone(p_user_id))::date then
      raise exception 'REMINDER_DATE_BEFORE_SERVICE' using errcode = '22023';
    end if;

    insert into public.booking_treatment_reminders (user_id, sale_id, customer_name, customer_phone, due_on, notes)
    values (p_user_id, v_sale.id, v_sale.customer_name, v_sale.customer_phone, p_due_on, nullif(btrim(p_reminder_notes), ''));

    v_result := v_result || jsonb_build_object('reminderDate', p_due_on);
  end if;

  return v_result;
end;
$$;

create function public.get_booking_treatment_reminders(p_user_id uuid, p_limit integer)
returns jsonb language sql stable set search_path = ''
as $$
  with clock as (
    select (now() at time zone public.webfacil_booking_timezone(p_user_id))::date as today
  ), due as (
    select r.id, r.customer_name, r.customer_phone, r.due_on, r.notes, r.status,
      case when r.due_on < clock.today then 'overdue' when r.due_on = clock.today then 'today' else 'tomorrow' end as kind
    from public.booking_treatment_reminders r
    cross join clock
    left join public.booking_service_sales s on s.id = r.sale_id and s.user_id = r.user_id
    where r.user_id = p_user_id and r.status in ('pending', 'contacted')
      and r.due_on <= clock.today + 1 and (r.sale_id is null or s.status <> 'voided')
  )
  select jsonb_build_object(
    'total', (select count(*) from due),
    'overdueCount', (select count(*) from due where kind = 'overdue'),
    'todayCount', (select count(*) from due where kind = 'today'),
    'tomorrowCount', (select count(*) from due where kind = 'tomorrow'),
    'reminders', coalesce((
      select jsonb_agg(to_jsonb(first_due) order by due_on, id)
      from (select * from due order by due_on, id limit least(greatest(p_limit, 1), 100)) first_due
    ), '[]'::jsonb)
  );
$$;

-- Availability uses the same slots as the reservation flow. Equivalent services
-- for a professional share one RPC call per day.
create function public.get_booking_shared_calendar(p_user_id uuid, p_date date, p_month boolean, p_view text)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare
  v_timezone text := public.webfacil_booking_timezone(p_user_id);
  v_today date := (now() at time zone v_timezone)::date;
  v_last date;
  v_start date;
  v_end date;
  v_days jsonb;
begin
  if not exists (
    select 1 from public.profiles p where p.id = p_user_id and p.is_active
      and p.business_type = 'booking' and not coalesce(p.maintenance_mode, false)
  ) then
    raise exception 'calendar not found' using errcode = 'P0002';
  end if;

  v_last := v_today + coalesce((select s.max_advance_days from public.booking_settings s where s.user_id = p_user_id), 60);
  if p_view = 'booked' then
    select greatest(v_last, (max(a.end_at - interval '1 microsecond') at time zone v_timezone)::date)
    into v_last from public.appointments a where a.user_id = p_user_id and a.status in ('pending', 'confirmed');
  end if;

  p_date := coalesce(p_date, v_today);
  v_start := greatest(v_today, case when p_month then date_trunc('month', p_date::timestamp)::date else p_date end);
  v_end := least(v_last, case when p_month then (date_trunc('month', p_date::timestamp) + interval '1 month - 1 day')::date else p_date end);

  if p_view = 'available' then
    with eligible as (
      select distinct on (st.id, s.duration_minutes, s.buffer_before_minutes, s.buffer_after_minutes)
        st.id as staff_id, s.id as service_id
      from public.booking_staff st
      join public.booking_staff_services ss on ss.staff_id = st.id and ss.user_id = st.user_id
      join public.booking_services s on s.id = ss.service_id and s.user_id = st.user_id
      where st.user_id = p_user_id and st.is_active and st.is_bookable and s.is_active
      order by st.id, s.duration_minutes, s.buffer_before_minutes, s.buffer_after_minutes, s.id
    ), scheduled as materialized (
      select v_start + d.n as day, e.staff_id, e.service_id
      from generate_series(0, v_end - v_start) d(n)
      cross join eligible e
      where exists (
        select 1 from public.booking_availability a
        where a.user_id = p_user_id and a.staff_id = e.staff_id and a.is_active
          and a.day_of_week = extract(isodow from v_start + d.n)
      )
    ), visible as (
      select sch.day, to_char(slot.slot_start at time zone v_timezone, 'HH24:MI') as starts
      from scheduled sch
      cross join lateral public.get_booking_available_slots(p_user_id, sch.staff_id, array[sch.service_id], sch.day) slot
      group by sch.day, starts
    ), grouped as (
      select day, jsonb_agg(jsonb_build_object('start', starts) order by starts) as slots
      from visible group by day
    )
    select jsonb_agg(jsonb_build_object('date', day, 'slots', slots) order by day) into v_days from grouped;
  elsif p_view = 'booked' then
    with days as (
      select v_start + d.n as day, ((v_start + d.n)::timestamp at time zone v_timezone) as opens,
        ((v_start + d.n + 1)::timestamp at time zone v_timezone) as closes
      from generate_series(0, v_end - v_start) d(n)
    ), visible as (
      select distinct d.day, to_char(greatest(a.start_at, d.opens) at time zone v_timezone, 'HH24:MI') as starts,
        case when a.end_at >= d.closes then '24:00'
          else to_char(a.end_at at time zone v_timezone, 'HH24:MI') end as ends
      from days d
      join public.appointments a on a.user_id = p_user_id and a.start_at < d.closes and a.end_at > d.opens
      where a.status in ('pending', 'confirmed')
    ), grouped as (
      select day, jsonb_agg(jsonb_build_object('start', starts, 'end', ends) order by starts, ends) as slots
      from visible group by day
    )
    select jsonb_agg(jsonb_build_object('date', day, 'slots', slots) order by day) into v_days from grouped;
  else
    raise exception 'invalid calendar view' using errcode = '22023';
  end if;

  return jsonb_build_object('date', p_date, 'today', v_today, 'lastDate', v_last, 'days', coalesce(v_days, '[]'::jsonb));
end;
$$;

revoke execute on function
  public.webfacil_booking_timezone(uuid),
  public.save_monthly_expense_template(uuid, uuid, uuid, text, numeric, text, text, text, boolean, date, integer),
  public.get_monthly_recurring_expenses(uuid, date),
  public.set_monthly_recurring_expense_payment(uuid, uuid, date, integer, date, numeric, uuid, uuid),
  public.create_booking_service_sale_with_reminder(uuid, jsonb, uuid, uuid, text, text, boolean, text, timestamptz, text, uuid, date, text),
  public.get_booking_treatment_reminders(uuid, integer),
  public.get_booking_clients(uuid, text, integer, integer),
  public.get_booking_shared_calendar(uuid, date, boolean, text)
from public, anon, authenticated;
grant execute on function
  public.webfacil_booking_timezone(uuid),
  public.save_monthly_expense_template(uuid, uuid, uuid, text, numeric, text, text, text, boolean, date, integer),
  public.get_monthly_recurring_expenses(uuid, date),
  public.set_monthly_recurring_expense_payment(uuid, uuid, date, integer, date, numeric, uuid, uuid),
  public.create_booking_service_sale_with_reminder(uuid, jsonb, uuid, uuid, text, text, boolean, text, timestamptz, text, uuid, date, text),
  public.get_booking_treatment_reminders(uuid, integer),
  public.get_booking_clients(uuid, text, integer, integer),
  public.get_booking_shared_calendar(uuid, date, boolean, text)
to service_role;
