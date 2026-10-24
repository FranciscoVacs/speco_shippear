-- Spec 020 · free plan with credits (D-014). Only what a model costs is metered; deterministic work never touches this.
-- Credits are an append-only ledger of grants (welcome, monthly, referral) consumed first-to-expire first. A model action RESERVES its largest
-- possible cost before the call and SETTLES to what it really used. Only the service writes; a balance cannot go below zero.

-- ---------------------------------------------------------------------------------------------- amounts live in data, not in code (assumptions of spec 020)
create table public.plan_settings (
  key   text primary key,
  value int not null check (value >= 0)
);
insert into public.plan_settings (key, value) values
  ('welcome_credits', 20), ('welcome_days', 30), ('monthly_credits', 30), ('daily_cap', 40), ('monthly_budget', 5000);
revoke all on public.plan_settings from anon, authenticated;
grant select, insert, update on public.plan_settings to service_role;

create function private.setting(p_key text) returns int
language sql stable security definer set search_path = '' as $$
  select value from public.plan_settings where key = p_key;
$$;
revoke all on function private.setting(text) from public, anon, authenticated;
grant execute on function private.setting(text) to service_role;

-- ---------------------------------------------------------------------------------------------- one free company per person (FR-010)
alter table public.organizations add column free_plan boolean not null default true;

create table public.free_plan_claims (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  org_id     uuid,
  created_at timestamptz not null default now()
);
revoke all on public.free_plan_claims from anon, authenticated;
grant select, insert on public.free_plan_claims to service_role;

-- companies that already exist: the oldest one of each owner keeps the free plan
insert into public.free_plan_claims (user_id, org_id)
select distinct on (m.user_id) m.user_id, m.org_id from public.memberships m join public.organizations o on o.id = m.org_id
 where m.role = 'owner' order by m.user_id, o.created_at;
update public.organizations o set free_plan = exists (select 1 from public.free_plan_claims c where c.org_id = o.id);

-- ---------------------------------------------------------------------------------------------- the ledger
create table public.credit_grants (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  source     text not null check (source in ('welcome', 'monthly', 'referral')),
  amount     int not null check (amount > 0),
  used       int not null default 0,
  period     text,                                    -- 'YYYY-MM' for monthly grants: one per company per month
  ref        text,                                    -- what earned it (a referral id): one grant per cause
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (used between 0 and amount)
);
create unique index credit_grants_one_per_period on public.credit_grants (org_id, source, period) where period is not null;
create unique index credit_grants_one_per_ref on public.credit_grants (org_id, source, ref) where ref is not null;
create index credit_grants_live_idx on public.credit_grants (org_id, expires_at) where used < amount;

create table public.credit_reservations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  kind       text not null check (kind in ('portrait', 'turn')),
  reserved   int not null check (reserved > 0),
  charged    int check (charged between 0 and reserved),
  status     text not null default 'open' check (status in ('open', 'settled', 'released')),
  parts      jsonb not null default '[]'::jsonb,      -- [{grant, amount}] what was taken from which grant, so a refund goes back to the same place
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index credit_reservations_org_idx on public.credit_reservations (org_id, created_at desc);

create table public.notices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  org_id     uuid references public.organizations (id) on delete cascade,
  kind       text not null,
  body       jsonb not null default '{}'::jsonb,
  period     text not null,                           -- the same notice is told once per period
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  unique (user_id, kind, period)
);

alter table public.credit_grants enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.notices enable row level security;
revoke all on public.credit_grants, public.credit_reservations, public.notices from anon, authenticated;
grant select on public.credit_grants, public.credit_reservations, public.notices to authenticated;
grant update (read_at) on public.notices to authenticated;
grant all on public.credit_grants, public.credit_reservations, public.notices to service_role;

create policy credit_grants_select on public.credit_grants for select to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy credit_reservations_select on public.credit_reservations for select to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy notices_select on public.notices for select to authenticated using (user_id = auth.uid());
create policy notices_update on public.notices for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------------------------- grants when a company is created (FR-001, FR-003, FR-010)
create function private.month_start() returns timestamptz
language sql stable set search_path = '' as $$ select date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' $$;
create function private.next_month_start() returns timestamptz
language sql stable set search_path = '' as $$ select (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC' $$;
create function private.day_start() returns timestamptz
language sql stable set search_path = '' as $$ select date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' $$;
grant execute on function private.month_start(), private.next_month_start(), private.day_start() to service_role, authenticated;

-- decides BEFORE the row exists whether this company is the person's free one; no signed-in person (a service insert) means free
create function private.decide_free_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_claimed uuid;
begin
  new.free_plan := true;
  if auth.uid() is not null then
    insert into public.free_plan_claims (user_id, org_id) values (auth.uid(), new.id) on conflict (user_id) do nothing returning user_id into v_claimed;
    new.free_plan := v_claimed is not null;
  end if;
  return new;
end;
$$;
create trigger organizations_decide_free_plan before insert on public.organizations
  for each row execute function private.decide_free_plan();

create function private.grant_on_creation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.free_plan and new.plan = 'hobby' then
    insert into public.credit_grants (org_id, source, amount, expires_at)
      values (new.id, 'welcome', private.setting('welcome_credits'), now() + make_interval(days => private.setting('welcome_days')));
    insert into public.credit_grants (org_id, source, amount, period, expires_at)
      values (new.id, 'monthly', private.setting('monthly_credits'), to_char(now() at time zone 'UTC', 'YYYY-MM'), private.next_month_start());
  end if;
  return null;
end;
$$;
create trigger organizations_grant_on_creation after insert on public.organizations
  for each row execute function private.grant_on_creation();

-- ---------------------------------------------------------------------------------------------- functions the service calls
-- Monthly credits for every free company; running it again in the same month changes nothing (FR-003).
create function public.grant_monthly_credits() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  insert into public.credit_grants (org_id, source, amount, period, expires_at)
    select o.id, 'monthly', private.setting('monthly_credits'), to_char(now() at time zone 'UTC', 'YYYY-MM'), private.next_month_start()
      from public.organizations o where o.plan = 'hobby' and o.free_plan
    on conflict (org_id, source, period) where period is not null do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Takes p_amount credits, soonest-to-expire first. Refuses with a code the service understands:
--   CR001 not enough credits, CR002 the daily cap of the company, CR003 the monthly budget of the whole free plan.
-- Companies on a paid plan are not metered yet (payment is out of scope of spec 020). The company row is locked, so two requests
-- for the same company are served one after the other and a balance for one action never pays for two (edge case of spec 020).
create function public.reserve_credits(p_org uuid, p_amount int, p_kind text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_plan text;
  v_left int := p_amount;
  v_take int;
  v_parts jsonb := '[]'::jsonb;
  v_day int;
  v_month int;
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
  if v_plan <> 'hobby' then
    return null;
  end if;
  select coalesce(sum(coalesce(charged, reserved)), 0) into v_day from public.credit_reservations
   where org_id = p_org and status <> 'released' and created_at >= private.day_start();
  if v_day + p_amount > private.setting('daily_cap') then
    raise exception 'daily cap of model use reached' using errcode = 'CR002';
  end if;
  select coalesce(sum(coalesce(r.charged, r.reserved)), 0) into v_month
    from public.credit_reservations r join public.organizations o on o.id = r.org_id and o.plan = 'hobby'
   where r.status <> 'released' and r.created_at >= private.month_start();
  if v_month + p_amount > private.setting('monthly_budget') then
    raise exception 'the free plan budget for this month is used' using errcode = 'CR003';
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

-- Charges what was really used (capped at what was reserved) and gives the rest back to the grants it came from. 0 releases it all (FR-005, FR-014).
create function public.settle_credits(p_reservation uuid, p_actual int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.credit_reservations;
  v_actual int;
  v_refund int;
  v_give int;
  part record;
  v_balance int;
  v_granted int;
begin
  select * into r from public.credit_reservations where id = p_reservation for update;
  if not found or r.status <> 'open' then
    return;
  end if;
  v_actual := least(greatest(coalesce(p_actual, 0), 0), r.reserved);
  v_refund := r.reserved - v_actual;
  for part in select (e ->> 'grant')::uuid as grant_id, (e ->> 'amount')::int as amount
                from jsonb_array_elements(r.parts) with ordinality as t(e, ord) order by ord desc loop
    exit when v_refund = 0;
    v_give := least(part.amount, v_refund);
    update public.credit_grants set used = used - v_give where id = part.grant_id;
    v_refund := v_refund - v_give;
  end loop;
  update public.credit_reservations set status = case when v_actual = 0 then 'released' else 'settled' end, charged = v_actual, settled_at = now() where id = r.id;
  -- the owners are told once a month when less than a fifth of what is granted is left (FR-013)
  select coalesce(sum(amount - used), 0), coalesce(sum(amount), 0) into v_balance, v_granted from public.credit_grants where org_id = r.org_id and expires_at > now();
  if v_actual > 0 and v_granted > 0 and v_balance * 5 < v_granted then
    insert into public.notices (user_id, org_id, kind, body, period)
      select m.user_id, r.org_id, 'low_credits', jsonb_build_object('balance', v_balance), r.org_id::text || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM')
        from public.memberships m where m.org_id = r.org_id and m.role = 'owner'
      on conflict (user_id, kind, period) do nothing;
  end if;
end;
$$;

revoke all on function public.grant_monthly_credits(), public.reserve_credits(uuid, int, text), public.settle_credits(uuid, int) from public, anon, authenticated;
grant execute on function public.grant_monthly_credits(), public.reserve_credits(uuid, int, text), public.settle_credits(uuid, int) to service_role;

-- companies that already exist get this month's credits now
select public.grant_monthly_credits();
