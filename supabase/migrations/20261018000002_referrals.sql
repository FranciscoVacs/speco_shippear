-- Spec 021 · referrals (D-015). A person shares a link; when the person invited gets a first result, both companies receive credits (spec 020).
-- Nobody can read who referred whom: the tables are closed and the people only see counts through `referral_summary`.

insert into public.plan_settings (key, value) values
  ('referral_reward', 20), ('referral_monthly_cap', 10), ('referral_expiry_months', 6), ('referral_window_hours', 24),
  ('referral_held_months', 12), ('referrals_enabled', 1);

create table public.referral_codes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now()
);

create table public.referrals (
  id               uuid primary key default gen_random_uuid(),
  referrer_id      uuid not null references auth.users (id) on delete cascade,
  referee_id       uuid not null unique references auth.users (id) on delete cascade,     -- a person is invited at most once
  created_at       timestamptz not null default now(),
  rewarded_at      timestamptz,
  referee_org      uuid references public.organizations (id) on delete set null,
  referrer_org     uuid references public.organizations (id) on delete set null,
  referrer_credits int not null default 0,
  referrer_held    boolean not null default false,                                          -- due, but the referrer owns no company yet (FR-013)
  check (referrer_id <> referee_id)
);
create index referrals_referrer_idx on public.referrals (referrer_id);

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
revoke all on public.referral_codes, public.referrals from anon, authenticated;
grant all on public.referral_codes, public.referrals to service_role;

-- ---------------------------------------------------------------------------------------------- the person's own code (FR-001)
create function public.my_referral_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  if private.is_agent() then
    raise exception 'agents cannot decide: only a person can' using errcode = '42501';
  end if;
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  insert into public.referral_codes (user_id, code) values (auth.uid(), substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
    on conflict (user_id) do nothing;
  select code into v_code from public.referral_codes where user_id = auth.uid();
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------------------------- recording a referral (FR-003, FR-004, FR-007, FR-011)
-- Returns whether it was recorded. The account must be NEW: created within the window and with no company yet (the time the link was
-- opened comes from the browser, so it is not trusted).
create function public.claim_referral(p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_referrer uuid;
  v_created timestamptz;
  v_my_phone text;
  v_their_phone text;
begin
  if private.is_agent() or auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if private.setting('referrals_enabled') = 0 then
    return false;
  end if;
  select user_id into v_referrer from public.referral_codes where code = p_code;
  if not found or v_referrer = auth.uid() then
    return false;
  end if;
  select created_at, phone into v_created, v_my_phone from auth.users where id = auth.uid();
  select phone into v_their_phone from auth.users where id = v_referrer;
  if v_created is null or v_created < now() - make_interval(hours => private.setting('referral_window_hours'))
     or exists (select 1 from public.memberships where user_id = auth.uid())
     or (coalesce(v_my_phone, '') <> '' and v_my_phone = v_their_phone) then
    return false;
  end if;
  insert into public.referrals (referrer_id, referee_id) values (v_referrer, auth.uid()) on conflict (referee_id) do nothing;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------------------------- the reward (FR-005, FR-006, FR-008, FR-009, FR-012, FR-013)
-- Called by the service when a company records its first result. Idempotent: a referral is rewarded once, and a grant has one cause.
create function public.referral_activate(p_org uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  v_reward int := private.setting('referral_reward');
  v_expires timestamptz := now() + make_interval(months => private.setting('referral_expiry_months'));
  v_target uuid;
  v_eligible boolean;
  v_count int := 0;
begin
  for r in select f.* from public.referrals f join public.memberships m on m.user_id = f.referee_id and m.org_id = p_org and m.role = 'owner'
            where f.rewarded_at is null for update of f loop
    insert into public.credit_grants (org_id, source, amount, expires_at, ref) values (p_org, 'referral', v_reward, v_expires, r.id::text)
      on conflict (org_id, source, ref) where ref is not null do nothing;
    -- the person who invited is capped per calendar month; the person invited is rewarded either way
    v_eligible := (select count(*) from public.referrals where referrer_id = r.referrer_id and referrer_credits > 0 and rewarded_at >= private.month_start())
                  < private.setting('referral_monthly_cap');
    v_target := null;
    if v_eligible then
      select m.org_id into v_target from public.memberships m join public.organizations o on o.id = m.org_id
       where m.user_id = r.referrer_id and m.role = 'owner' order by o.created_at limit 1;
      if v_target is not null then
        insert into public.credit_grants (org_id, source, amount, expires_at, ref) values (v_target, 'referral', v_reward, v_expires, r.id::text)
          on conflict (org_id, source, ref) where ref is not null do nothing;
      end if;
      insert into public.notices (user_id, org_id, kind, body, period)
        values (r.referrer_id, v_target, 'referral_reward', jsonb_build_object('credits', v_reward, 'held', v_target is null), r.id::text)
        on conflict (user_id, kind, period) do nothing;
    end if;
    update public.referrals set rewarded_at = now(), referee_org = p_org, referrer_org = v_target,
           referrer_credits = case when v_eligible then v_reward else 0 end, referrer_held = v_eligible and v_target is null
     where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- a reward that was due while the person who invited owned no company goes to the first one they create (FR-013)
create function private.release_held_referrals() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
begin
  for r in select * from public.referrals where referrer_id = new.user_id and referrer_held
              and rewarded_at > now() - make_interval(months => private.setting('referral_held_months')) for update loop
    insert into public.credit_grants (org_id, source, amount, expires_at, ref)
      values (new.org_id, 'referral', r.referrer_credits, now() + make_interval(months => private.setting('referral_expiry_months')), r.id::text)
      on conflict (org_id, source, ref) where ref is not null do nothing;
    update public.referrals set referrer_held = false, referrer_org = new.org_id where id = r.id;
  end loop;
  return null;
end;
$$;
create trigger memberships_release_held_referrals after insert on public.memberships
  for each row when (new.role = 'owner') execute function private.release_held_referrals();

-- ---------------------------------------------------------------------------------------------- what a person sees (FR-010): counts, never names
create function public.referral_summary() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cap int := private.setting('referral_monthly_cap');
  v_used int;
begin
  if private.is_agent() or auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select count(*) into v_used from public.referrals where referrer_id = auth.uid() and referrer_credits > 0 and rewarded_at >= private.month_start();
  return jsonb_build_object(
    'code', public.my_referral_code(),
    'signed_up', (select count(*) from public.referrals where referrer_id = auth.uid()),
    'activated', (select count(*) from public.referrals where referrer_id = auth.uid() and rewarded_at is not null),
    'credits_earned', (select coalesce(sum(referrer_credits), 0) from public.referrals where referrer_id = auth.uid()),
    'held', (select count(*) from public.referrals where referrer_id = auth.uid() and referrer_held),
    'reward', private.setting('referral_reward'),
    'monthly_cap', v_cap,
    'cap_left', greatest(v_cap - v_used, 0));
end;
$$;

revoke all on function public.my_referral_code(), public.claim_referral(text), public.referral_activate(uuid), public.referral_summary() from public, anon, authenticated;
grant execute on function public.my_referral_code(), public.claim_referral(text), public.referral_summary() to authenticated;
grant execute on function public.referral_activate(uuid) to service_role;
