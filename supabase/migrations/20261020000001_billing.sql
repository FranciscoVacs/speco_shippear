-- Spec 023 · billing and plan upgrades (D-017). What a plan costs and gives lives in data; what a company pays for lives in `subscriptions`; every attempt to
-- charge leaves an `invoices` row. Only the service writes. The payment provider is outside the database: the service charges FIRST and calls start_plan
-- only when the charge was accepted, so a plan never changes without money (or a comp) behind it. A card number never reaches this schema.

alter table public.credit_grants drop constraint credit_grants_source_check;
alter table public.credit_grants add constraint credit_grants_source_check check (source in ('welcome', 'monthly', 'referral', 'plan'));

-- ---------------------------------------------------------------------------------------------- the catalog (FR-001)
create table public.plan_catalog (
  plan           text primary key check (plan in ('hobby', 'pro', 'team')),
  rank           int not null unique,
  price_cents    int not null check (price_cents >= 0),
  currency       text not null default 'USD',
  period_credits int not null check (period_credits >= 0),
  daily_cap      int check (daily_cap > 0),                -- null: the cap of the free plan (plan_settings.daily_cap)
  check (plan = 'hobby' or (period_credits > 0 and price_cents > 0 and daily_cap is not null))
);
insert into public.plan_catalog (plan, rank, price_cents, period_credits, daily_cap) values
  ('hobby', 0, 0, 0, null), ('pro', 1, 2900, 600, 120), ('team', 2, 9900, 2400, 480);
alter table public.plan_catalog enable row level security;
revoke all on public.plan_catalog from anon, authenticated;
grant select on public.plan_catalog to authenticated;
grant all on public.plan_catalog to service_role;
create policy plan_catalog_select on public.plan_catalog for select to authenticated using (true);

insert into public.plan_settings (key, value) values ('billing_grace_days', 3);

-- ---------------------------------------------------------------------------------------------- what a company pays for (a row exists only while it is on a paid plan)
create table public.subscriptions (
  org_id          uuid primary key references public.organizations (id) on delete cascade,
  plan            text not null references public.plan_catalog (plan) check (plan <> 'hobby'),
  status          text not null default 'active' check (status in ('active', 'past_due')),
  provider        text not null,                           -- 'simulated', a real provider later, or 'manual' (a plan given by the operator: renews without a charge)
  period_start    timestamptz not null,
  period_end      timestamptz not null check (period_end > period_start),
  scheduled_plan  text references public.plan_catalog (plan),   -- applied when the period ends; 'hobby' means cancel (FR-007)
  last_attempt_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create sequence public.invoice_numbers;
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  number          text not null unique,
  kind            text not null check (kind in ('upgrade', 'renewal')),
  plan            text not null references public.plan_catalog (plan),
  amount_cents    int not null check (amount_cents >= 0),
  currency        text not null default 'USD',
  status          text not null check (status in ('paid', 'failed')),
  failure         text,
  provider        text not null,
  provider_ref    text,
  simulated       boolean not null,                        -- FR-012: a simulated invoice is never a real charge
  period_start    timestamptz not null,
  period_end      timestamptz not null,
  idempotency_key text,
  created_at      timestamptz not null default now()
);
create index invoices_org_idx on public.invoices (org_id, created_at desc);
create unique index invoices_one_paid_per_key on public.invoices (org_id, idempotency_key) where status = 'paid' and idempotency_key is not null;   -- FR-014

alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
revoke all on public.subscriptions, public.invoices from anon, authenticated;
grant select on public.subscriptions, public.invoices to authenticated;
grant all on public.subscriptions, public.invoices to service_role;
grant usage on sequence public.invoice_numbers to service_role;
create policy subscriptions_select on public.subscriptions for select to authenticated using (private.has_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy invoices_select on public.invoices for select to authenticated using (private.has_role(org_id, array['owner', 'admin']::public.org_role[]));

-- ---------------------------------------------------------------------------------------------- the functions the service calls
-- A charge was accepted (or a plan is given with amount 0): the plan changes, the period opens, the invoice is written and the credits of the period are
-- granted, all or nothing. Calling it again with the same key returns the invoice of the first call and changes nothing (FR-014).
-- A renewal also ends the credits left from the period before (FR-006). The credits of a period outlive it by the grace days, so a late renewal does not cut access.
create function public.start_plan(
  p_org uuid, p_plan text, p_kind text, p_amount_cents int, p_provider text, p_ref text, p_simulated boolean, p_key text,
  p_period_start timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_cat public.plan_catalog;
  v_inv uuid;
  v_end timestamptz;
begin
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'no such company' using errcode = '23503';
  end if;
  select id into v_inv from public.invoices where org_id = p_org and idempotency_key = p_key and status = 'paid';
  if found then
    return v_inv;
  end if;
  select * into v_cat from public.plan_catalog where plan = p_plan;
  if not found or p_plan = 'hobby' then
    raise exception 'not a paid plan' using errcode = '22023';
  end if;
  v_end := p_period_start + interval '1 month';
  insert into public.invoices (org_id, number, kind, plan, amount_cents, currency, status, provider, provider_ref, simulated, period_start, period_end, idempotency_key)
    values (p_org, case when p_simulated then 'SIM-' else 'INV-' end || lpad(nextval('public.invoice_numbers')::text, 6, '0'), p_kind, p_plan, p_amount_cents,
            v_cat.currency, 'paid', p_provider, p_ref, p_simulated, p_period_start, v_end, p_key)
    returning id into v_inv;
  if p_kind = 'renewal' then
    update public.credit_grants set expires_at = least(expires_at, now()) where org_id = p_org and source = 'plan' and expires_at > now();
  end if;
  insert into public.subscriptions (org_id, plan, status, provider, period_start, period_end, last_attempt_at)
    values (p_org, p_plan, 'active', p_provider, p_period_start, v_end, p_period_start)
    on conflict (org_id) do update set plan = excluded.plan, status = 'active', provider = excluded.provider, period_start = excluded.period_start,
      period_end = excluded.period_end, scheduled_plan = null, last_attempt_at = excluded.last_attempt_at, updated_at = now();
  update public.organizations set plan = p_plan where id = p_org;
  insert into public.credit_grants (org_id, source, amount, ref, expires_at)
    values (p_org, 'plan', v_cat.period_credits, v_inv::text, v_end + make_interval(days => private.setting('billing_grace_days')));
  return v_inv;
end;
$$;

-- A charge that was declined: the attempt is recorded and nothing else changes, except that a renewal puts the subscription in grace and tells the owners once (FR-003, FR-008).
create function public.record_failed_payment(
  p_org uuid, p_plan text, p_kind text, p_amount_cents int, p_provider text, p_simulated boolean, p_failure text, p_period_start timestamptz, p_period_end timestamptz,
  p_at timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv uuid;
  v_sub public.subscriptions;
begin
  insert into public.invoices (org_id, number, kind, plan, amount_cents, status, failure, provider, simulated, period_start, period_end)
    values (p_org, case when p_simulated then 'SIM-' else 'INV-' end || lpad(nextval('public.invoice_numbers')::text, 6, '0'), p_kind, p_plan, p_amount_cents,
            'failed', p_failure, p_provider, p_simulated, p_period_start, p_period_end)
    returning id into v_inv;
  if p_kind = 'renewal' then
    update public.subscriptions set status = 'past_due', last_attempt_at = p_at, updated_at = now() where org_id = p_org returning * into v_sub;
    insert into public.notices (user_id, org_id, kind, body, period)
      select m.user_id, p_org, 'payment_failed', jsonb_build_object('plan', p_plan, 'until', v_sub.period_end + make_interval(days => private.setting('billing_grace_days'))),
             p_org::text || ':' || v_sub.period_end::text
        from public.memberships m where m.org_id = p_org and m.role = 'owner'
      on conflict (user_id, kind, period) do nothing;
  end if;
  return v_inv;
end;
$$;

-- The plan or the cancellation that takes effect when the period ends; null undoes it (FR-007).
create function public.schedule_plan(p_org uuid, p_plan text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.subscriptions set scheduled_plan = p_plan, updated_at = now() where org_id = p_org;
  if not found then
    raise exception 'the company has no paid plan' using errcode = '22023';
  end if;
end;
$$;

-- Back to the free plan: the subscription ends and what is left of the plan's credits ends with it (FR-007, FR-008).
create function public.end_subscription(p_org uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_plan text;
begin
  perform 1 from public.organizations where id = p_org for update;
  delete from public.subscriptions where org_id = p_org returning plan into v_plan;
  if v_plan is null then
    return;
  end if;
  update public.organizations set plan = 'hobby' where id = p_org;
  update public.credit_grants set expires_at = least(expires_at, now()) where org_id = p_org and source = 'plan' and expires_at > now();
  insert into public.notices (user_id, org_id, kind, body, period)
    select m.user_id, p_org, 'plan_ended', jsonb_build_object('plan', v_plan, 'reason', p_reason), p_org::text || ':' || now()::text
      from public.memberships m where m.org_id = p_org and m.role = 'owner'
    on conflict (user_id, kind, period) do nothing;
end;
$$;

revoke all on function public.start_plan(uuid, text, text, int, text, text, boolean, text, timestamptz),
  public.record_failed_payment(uuid, text, text, int, text, boolean, text, timestamptz, timestamptz, timestamptz),
  public.schedule_plan(uuid, text), public.end_subscription(uuid, text) from public, anon, authenticated;
grant execute on function public.start_plan(uuid, text, text, int, text, text, boolean, text, timestamptz),
  public.record_failed_payment(uuid, text, text, int, text, boolean, text, timestamptz, timestamptz, timestamptz),
  public.schedule_plan(uuid, text), public.end_subscription(uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------- the gate now meters paid companies too (FR-005)
-- Same as spec 020 with two differences: the daily cap comes from the plan, and the monthly budget protects only the free plan.
create or replace function public.reserve_credits(p_org uuid, p_amount int, p_kind text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_plan text;
  v_left int := p_amount;
  v_take int;
  v_parts jsonb := '[]'::jsonb;
  v_day int;
  v_month int;
  v_cap int;
  v_id uuid;
  g record;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'a reservation needs a positive amount' using errcode = '22023';
  end if;
  select plan into v_plan from public.organizations where id = p_org for update;
  if not found then
    raise exception 'no such company' using errcode = '23503';
  end if;
  v_cap := coalesce((select daily_cap from public.plan_catalog where plan = v_plan), private.setting('daily_cap'));
  select coalesce(sum(coalesce(charged, reserved)), 0) into v_day from public.credit_reservations
   where org_id = p_org and status <> 'released' and created_at >= private.day_start();
  if v_day + p_amount > v_cap then
    raise exception 'daily cap of model use reached' using errcode = 'CR002';
  end if;
  if v_plan = 'hobby' then
    select coalesce(sum(coalesce(r.charged, r.reserved)), 0) into v_month
      from public.credit_reservations r join public.organizations o on o.id = r.org_id and o.plan = 'hobby'
     where r.status <> 'released' and r.created_at >= private.month_start();
    if v_month + p_amount > private.setting('monthly_budget') then
      raise exception 'the free plan budget for this month is used' using errcode = 'CR003';
    end if;
  end if;
  for g in select id, amount - used as free from public.credit_grants
            where org_id = p_org and expires_at > now() and used < amount order by expires_at, granted_at, id for update loop
    v_take := least(g.free, v_left);
    update public.credit_grants set used = used + v_take where id = g.id;
    v_parts := v_parts || jsonb_build_object('grant', g.id, 'amount', v_take);
    v_left := v_left - v_take;
    exit when v_left = 0;
  end loop;
  if v_left > 0 then
    raise exception 'not enough credits' using errcode = 'CR001';
  end if;
  insert into public.credit_reservations (org_id, kind, reserved, parts) values (p_org, p_kind, p_amount, v_parts) returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------- companies that already were on a paid plan keep working (FR-015)
-- They get a subscription of the operator ('manual': it renews without a charge) and the credits of their plan for this month.
insert into public.subscriptions (org_id, plan, provider, period_start, period_end)
  select id, plan, 'manual', private.month_start(), private.next_month_start() from public.organizations where plan <> 'hobby'
  on conflict (org_id) do nothing;
insert into public.credit_grants (org_id, source, amount, ref, expires_at)
  select o.id, 'plan', c.period_credits, 'legacy:' || o.id::text, private.next_month_start() + make_interval(days => private.setting('billing_grace_days'))
    from public.organizations o join public.plan_catalog c on c.plan = o.plan where o.plan <> 'hobby'
  on conflict (org_id, source, ref) where ref is not null do nothing;
