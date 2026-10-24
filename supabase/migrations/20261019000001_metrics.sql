-- Spec 022 · product metrics (docs/27-metrics-playbook.md). Three small tables capture what the existing tables cannot know (where a person came
-- from, how they answer the Sean Ellis question, what was spent to bring them); everything else (activation, time to value, retention, churn,
-- model cost) is DERIVED from tables that already exist, in schema `metrics`. Service only: nobody signed in reads any of this.

create schema if not exists metrics;
revoke all on schema metrics from public, anon, authenticated;
grant usage on schema metrics to service_role;

-- ---------------------------------------------------------------------------------------------- capture
-- First touch wins: where the person came from the first time (a channel like 'pr_footer', 'community:foo', 'referral', 'direct') and which door.
create table public.acquisition (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  channel    text not null check (channel ~ '^[a-z0-9][a-z0-9_:.\-]{0,59}$'),
  door       text check (door in ('code', 'idea')),
  created_at timestamptz not null default now()
);

-- The Sean Ellis question: "How would you feel if you could no longer use Speco?" One answer per person per round (a round is a quarter).
create table public.pmf_responses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  round         text not null check (round ~ '^\d{4}-Q[1-4]$'),
  disappointed  text not null check (disappointed in ('very', 'somewhat', 'not', 'na')),   -- 'na' = "I no longer use it"
  main_benefit  text not null default '' check (length(main_benefit) <= 1000),
  alternative   text not null default '' check (length(alternative) <= 1000),
  created_at    timestamptz not null default now(),
  unique (user_id, round)
);

-- Typed by hand (or imported) per month and channel: the part of CAC that no table can know.
create table public.marketing_spend (
  month       date not null check (month = date_trunc('month', month)::date),
  channel     text not null check (channel ~ '^[a-z0-9][a-z0-9_:.\-]{0,59}$'),
  amount_usd  numeric(12, 2) not null check (amount_usd >= 0),
  note        text not null default '',
  primary key (month, channel)
);

-- Companies that must not count: Speco on Speco (G-12), tests, friends. Left out of every view below.
create table public.metrics_excluded_orgs (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  reason text not null default ''
);

alter table public.acquisition enable row level security;
alter table public.pmf_responses enable row level security;
alter table public.marketing_spend enable row level security;
alter table public.metrics_excluded_orgs enable row level security;
revoke all on public.acquisition, public.pmf_responses, public.marketing_spend, public.metrics_excluded_orgs from anon, authenticated;
grant all on public.acquisition, public.pmf_responses, public.marketing_spend, public.metrics_excluded_orgs to service_role;

-- ---------------------------------------------------------------------------------------------- derived: one row per counted company
-- "First result" is the same moment that rewards a referral (spec 021): the first recorded review or the first finished portrait.
create view metrics.org_facts as
with owner as (
  select distinct on (m.org_id) m.org_id, m.user_id from public.memberships m where m.role = 'owner' order by m.org_id, m.created_at
), result as (
  select org_id, min(at) as first_result_at from (
    select org_id, created_at as at from public.reviews
    union all
    select org_id, updated_at from public.jobs where kind = 'portrait' and status = 'done'
  ) r group by org_id
), reviews_14d as (
  select r.org_id, count(*) as n from public.reviews r join result f on f.org_id = r.org_id
   where r.created_at < f.first_result_at + interval '14 days' group by r.org_id
)
select o.id as org_id, o.created_at as signed_up_at, o.plan, o.free_plan,
       ow.user_id as owner_id,
       coalesce(a.channel, 'unknown') as channel, a.door,
       f.first_result_at,
       extract(epoch from f.first_result_at - o.created_at) / 60.0 as ttv_minutes,
       coalesce(r14.n, 0) >= 3 as habit,                                       -- 3 reviews within 14 days of the first result (docs/24 §6)
       exists (select 1 from public.referrals x where x.referee_org = o.id) as was_referred,
       exists (select 1 from public.upgrade_interest u where u.org_id = o.id) as asked_to_upgrade
  from public.organizations o
  left join owner ow on ow.org_id = o.id
  left join public.acquisition a on a.user_id = ow.user_id
  left join result f on f.org_id = o.id
  left join reviews_14d r14 on r14.org_id = o.id
 where o.id not in (select org_id from public.metrics_excluded_orgs);

-- A company is ACTIVE on a day when something real happened in it. Opening the app is not enough: that is not recorded, and it should not count.
create view metrics.activity as
select distinct org_id, day from (
  select org_id, (created_at at time zone 'UTC')::date as day from public.reviews
  union all select org_id, (updated_at at time zone 'UTC')::date from public.jobs where status = 'done'
  union all select org_id, (at at time zone 'UTC')::date from public.approvals
  union all select org_id, (at at time zone 'UTC')::date from public.rule_decisions
  union all select org_id, (created_at at time zone 'UTC')::date from public.credit_reservations where status = 'settled'
) a where org_id not in (select org_id from public.metrics_excluded_orgs);

-- What the model cost, in credits actually charged (not reserved), per company and month. Credits become dollars in the report, where the price lives.
create view metrics.model_use as
select r.org_id, date_trunc('month', r.created_at)::date as month, sum(r.charged) as credits
  from public.credit_reservations r
 where r.status = 'settled' and r.org_id not in (select org_id from public.metrics_excluded_orgs)
 group by 1, 2;

revoke all on all tables in schema metrics from public, anon, authenticated;
grant select on all tables in schema metrics to service_role;
