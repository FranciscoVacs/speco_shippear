-- Spec 025 · value delivered (docs/27-metrics-playbook.md §8). The value of a spec review is the problem caught BEFORE code exists. Two pieces:
--   1. metrics.finding_lifecycle: DERIVED from reviews. A finding (identified by the engine's fingerprint) is "resolved" when it appeared in a review of a
--      feature and the LATEST review of that same feature no longer has it. Nothing new is recorded for this.
--   2. public.finding_outcomes: the one thing no table can know, the counterfactual. When a finding is resolved, a member says whether it would have
--      reached code without Speco. Service only, like the rest of the metrics (spec 022 FR-011).

create table public.finding_outcomes (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  feature_id  uuid not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{12}$'),
  user_id     uuid not null references auth.users (id) on delete cascade,
  answer      text not null check (answer in ('yes', 'probably', 'no')),     -- "would this have reached code without Speco?"
  created_at  timestamptz not null default now(),
  primary key (feature_id, fingerprint),                                       -- the first answer wins
  foreign key (org_id, feature_id) references public.features (org_id, id) on delete cascade
);

alter table public.finding_outcomes enable row level security;
revoke all on public.finding_outcomes from anon, authenticated;
grant all on public.finding_outcomes to service_role;

create view metrics.finding_lifecycle as
with r as (
  select rv.org_id, s.feature_id, rv.id as review_id, rv.created_at, rv.report
    from public.reviews rv
    join public.spec_snapshots s on s.org_id = rv.org_id and s.id = rv.snapshot_id
   where rv.org_id not in (select org_id from public.metrics_excluded_orgs)
), f as (
  select r.org_id, r.feature_id, r.review_id, r.created_at,
         x ->> 'fingerprint' as fingerprint, x ->> 'rule' as rule, x ->> 'severity' as severity, x ->> 'message' as message
    from r cross join lateral jsonb_array_elements(coalesce(r.report -> 'findings', '[]'::jsonb)) x
), first_seen as (
  select org_id, feature_id, fingerprint,
         min(created_at) as first_seen_at,
         (array_agg(rule order by created_at))[1] as rule,
         (array_agg(severity order by created_at))[1] as severity,
         (array_agg(message order by created_at))[1] as message
    from f where fingerprint is not null group by 1, 2, 3
), latest as (
  select distinct on (feature_id) org_id, feature_id, review_id, created_at from r order by feature_id, created_at desc
)
select fs.org_id, fs.feature_id, fs.fingerprint, fs.rule, fs.severity, fs.message, fs.first_seen_at,
       case when l.created_at > fs.first_seen_at
             and not exists (select 1 from f where f.review_id = l.review_id and f.fingerprint = fs.fingerprint)
            then l.created_at end as resolved_at,
       o.answer
  from first_seen fs
  join latest l on l.feature_id = fs.feature_id
  left join public.finding_outcomes o on o.feature_id = fs.feature_id and o.fingerprint = fs.fingerprint;

-- the first review of every feature: what a spec looks like before Speco has said anything (the trend of spec quality is read from here)
create view metrics.first_reviews as
select distinct on (s.feature_id) rv.org_id, s.feature_id, rv.created_at,
       coalesce((rv.summary ->> 'blocker')::int, 0) as blockers, coalesce((rv.summary ->> 'warning')::int, 0) as warnings
  from public.reviews rv
  join public.spec_snapshots s on s.org_id = rv.org_id and s.id = rv.snapshot_id
 where rv.org_id not in (select org_id from public.metrics_excluded_orgs)
 order by s.feature_id, rv.created_at;

revoke all on all tables in schema metrics from public, anon, authenticated;
grant select on all tables in schema metrics to service_role;
