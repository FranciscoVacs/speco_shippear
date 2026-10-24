-- Spec 027 · the decision loop in the cloud: what a pull request changes is reviewed, a person decides it in the app, and the PR hears about it.
--
-- 1. A snapshot says where it was first seen: the default branch, or a pull request (so the app lists only what is on the branch,
--    and a person can still open and approve the version a PR proposes).
-- 2. `pull_reviews` remembers, per pull request, which snapshots it proposes and the GitHub check that reports them.
-- 3. `decide_feature` is the only way to record an approval from the API: it refuses agents (D-012) and resolves the version by its hash.

alter table public.spec_snapshots add column source text not null default 'branch' check (source in ('branch', 'pr'));

create table public.pull_reviews (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  repo_id        uuid not null,
  number         integer not null,
  base_sha       text not null,
  head_sha       text not null,
  check_run_id   bigint,                          -- the GitHub check this pull request carries, edited as the decision changes
  comment_id     bigint,                          -- the comment the review left, rewritten when someone decides
  comment_body   text not null default '',
  features       jsonb not null default '[]'::jsonb,    -- [{feature_id, snapshot_id, key, title, files_hash, verdict}] for each feature that waits on a decision
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, id),
  unique (repo_id, number),
  foreign key (org_id, repo_id) references public.repositories (org_id, id) on delete cascade
);
create index pull_reviews_org_idx on public.pull_reviews (org_id);
alter table public.pull_reviews enable row level security;
create policy pull_reviews_select on public.pull_reviews for select to authenticated using (private.is_member(org_id));
revoke all on public.pull_reviews from anon, authenticated;
grant select on public.pull_reviews to authenticated;
grant all on public.pull_reviews to service_role;

-- A person decides one version of one feature. The version is named by the hash of its files (the one the CLI uses), because a pull request's
-- version has no commit on the branch yet. Whoever is not a person who can approve gets a refusal from the database, whatever the route.
create function public.decide_feature(
  p_feature uuid, p_files_hash text, p_decision public.approval_decision, p_reason text default '',
  p_conditions jsonb default '[]'::jsonb, p_delegate uuid default null, p_override boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  f public.features;
  s public.spec_snapshots;
  v_id uuid;
begin
  if private.is_agent() then
    raise exception 'agents cannot decide: only a person can' using errcode = '42501';
  end if;
  select * into f from public.features where id = p_feature;
  if not found or not private.has_role(f.org_id, array['owner', 'admin', 'approver']::public.org_role[]) then
    raise exception 'not allowed to decide this feature' using errcode = '42501';
  end if;
  select * into s from public.spec_snapshots where feature_id = f.id and files_hash = p_files_hash;
  if not found then
    raise exception 'that version of the feature is not known' using errcode = '22023';
  end if;
  insert into public.approvals (org_id, feature_id, snapshot_id, decision, reason, conditions, delegate_to, override, by_user)
  values (f.org_id, f.id, s.id, p_decision, coalesce(p_reason, ''), coalesce(p_conditions, '[]'::jsonb), p_delegate, p_override, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.decide_feature(uuid, text, public.approval_decision, text, jsonb, uuid, boolean) from public, anon;
grant execute on function public.decide_feature(uuid, text, public.approval_decision, text, jsonb, uuid, boolean) to authenticated;

-- The direct insert stays for people, but an access token issued to an agent never decides.
drop policy approvals_insert on public.approvals;
create policy approvals_insert on public.approvals for insert to authenticated
  with check (by_user = auth.uid() and not private.is_agent() and private.has_role(org_id, array['owner', 'admin', 'approver']::public.org_role[]));

-- Who can be named in a decision (a delegate) and how an entry of the log shows its author: the people of one company, for its members only.
create function public.org_people(p_org uuid) returns table (user_id uuid, name text, role public.org_role)
language sql stable security definer set search_path = '' as $$
  select m.user_id, coalesce(nullif(u.email, ''), left(m.user_id::text, 8)), m.role
    from public.memberships m join auth.users u on u.id = m.user_id
   where m.org_id = p_org and private.is_member(p_org)
   order by m.created_at;
$$;
revoke all on function public.org_people(uuid) from public, anon;
grant execute on function public.org_people(uuid) to authenticated;
