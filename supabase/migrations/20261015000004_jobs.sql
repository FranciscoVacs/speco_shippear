-- Spec 013 part 4: a small work queue in Postgres. Webhooks enqueue, the worker claims. Service-only (no policy for people).
-- A queue in the same database means "record the push" and "schedule the work" commit together, and needs no extra infrastructure yet.

create table public.jobs (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  repo_id    uuid not null,
  kind       text not null check (kind in ('sync_repo', 'portrait')),
  payload    jsonb not null default '{}'::jsonb,
  status     text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts   int not null default 0,
  run_after  timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, repo_id) references public.repositories (org_id, id) on delete cascade
);
-- many pushes before the worker gets to it collapse into one pending job per repository
create unique index jobs_one_pending_per_repo on public.jobs (repo_id, kind) where status = 'pending';
create index jobs_claim_idx on public.jobs (run_after) where status = 'pending';

alter table public.jobs enable row level security;
revoke all on public.jobs from anon, authenticated;
grant all on public.jobs to service_role;

-- Takes the oldest due job. SKIP LOCKED lets several workers run side by side without waiting on each other.
create function public.claim_job() returns setof public.jobs
language sql security invoker set search_path = '' as $$
  update public.jobs j
     set status = 'running', attempts = j.attempts + 1, updated_at = now()
   where j.id = (select id from public.jobs where status = 'pending' and run_after <= now() order by id for update skip locked limit 1)
  returning j.*;
$$;
revoke all on function public.claim_job() from public, anon, authenticated;
grant execute on function public.claim_job() to service_role;
