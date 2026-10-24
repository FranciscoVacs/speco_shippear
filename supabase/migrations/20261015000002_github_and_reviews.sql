-- Spec 013 part 2: what GitHub gives us and what we compute from it, always under exactly one organization (FR-009).
-- Only the service (webhook handler / worker, role service_role) writes here; people in an organization can read.
-- Composite foreign keys (org_id, x_id) make it impossible for a row of organization A to point at a row of organization B.

create table public.github_installations (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  installation_id      bigint not null unique,
  account_login        text not null,
  account_type         text not null check (account_type in ('Organization', 'User')),
  repository_selection text not null default 'selected' check (repository_selection in ('all', 'selected')),
  status               text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  created_at           timestamptz not null default now(),
  unique (org_id, id)
);

create table public.repositories (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  installation_id uuid not null,
  github_repo_id  bigint not null,
  full_name       text not null,
  default_branch  text not null default 'main',
  status          text not null default 'active' check (status in ('active', 'removed')),
  last_sha        text,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, github_repo_id),
  foreign key (org_id, installation_id) references public.github_installations (org_id, id) on delete cascade
);
create index repositories_org_idx on public.repositories (org_id);

create table public.features (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  repo_id    uuid not null,
  key        text not null,                       -- folder name under specs/, e.g. 003-team-invitations
  title      text,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (repo_id, key),
  foreign key (org_id, repo_id) references public.repositories (org_id, id) on delete cascade
);
create index features_org_idx on public.features (org_id);

-- one row per version of a feature's spec files; the hash is the same canonical one the CLI uses for approvals
create table public.spec_snapshots (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  feature_id uuid not null,
  commit_sha text not null,
  files_hash text not null,
  files      jsonb not null,                      -- {"spec.md": "...", "plan.md": "...", "tasks.md": "..."}
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (feature_id, files_hash),
  foreign key (org_id, feature_id) references public.features (org_id, id) on delete cascade
);
create index spec_snapshots_org_idx on public.spec_snapshots (org_id);

create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  snapshot_id    uuid not null,
  verdict        text not null check (verdict in ('ready', 'needs_work', 'blocked', 'needs_decision')),
  summary        jsonb not null,                  -- {"blocker": n, "warning": n, "suggestion": n}
  report         jsonb not null,                  -- the engine's full report
  engine_version text not null,
  created_at     timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, snapshot_id) references public.spec_snapshots (org_id, id) on delete cascade
);
create index reviews_org_idx on public.reviews (org_id);

-- GitHub retries deliveries: the delivery id makes processing idempotent (FR-010). Payloads may carry code or
-- private names, so nobody signed in can read them (FR-011): RLS is on and there is deliberately no policy.
create table public.webhook_events (
  id           bigint generated always as identity primary key,
  delivery_id  text not null unique,
  event        text not null,
  org_id       uuid references public.organizations (id) on delete set null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  outcome      text,                              -- ok | queued | ignored | unlinked
  error        text
);

-- ---------------------------------------------------------------------------------------------- RLS: members read, the service writes
alter table public.github_installations enable row level security;
alter table public.repositories         enable row level security;
alter table public.features             enable row level security;
alter table public.spec_snapshots       enable row level security;
alter table public.reviews              enable row level security;
alter table public.webhook_events       enable row level security;

create policy installations_select on public.github_installations for select to authenticated using (private.is_member(org_id));
create policy repositories_select  on public.repositories         for select to authenticated using (private.is_member(org_id));
create policy features_select      on public.features             for select to authenticated using (private.is_member(org_id));
create policy snapshots_select     on public.spec_snapshots       for select to authenticated using (private.is_member(org_id));
create policy reviews_select       on public.reviews              for select to authenticated using (private.is_member(org_id));

revoke all on public.github_installations, public.repositories, public.features, public.spec_snapshots, public.reviews, public.webhook_events from anon, authenticated;
grant select on public.github_installations, public.repositories, public.features, public.spec_snapshots, public.reviews to authenticated;
grant all on public.github_installations, public.repositories, public.features, public.spec_snapshots, public.reviews, public.webhook_events to service_role;
