-- Spec 014 · Initial portrait of business rules: what the software does today, as rules a person confirms (D-009).
-- A model (or a parser of implemented specs) only PROPOSES; a rule becomes the company's baseline when an approver confirms it.

-- consent to analyze a repository's CODE with a model (NFR-001): granted by an owner/admin, who and when are kept
alter table public.repositories add column code_consent_by uuid references auth.users (id), add column code_consent_at timestamptz;
alter table public.repositories add constraint code_consent_pair check ((code_consent_by is null) = (code_consent_at is null));

create function public.set_code_consent(p_repo uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.repositories where id = p_repo;
  if v_org is null or not private.has_role(v_org, array['owner', 'admin']::public.org_role[]) then
    raise exception 'only owners and admins decide whether code is analyzed' using errcode = '42501';
  end if;
  update public.repositories set code_consent_by = case when p_on then auth.uid() end, code_consent_at = case when p_on then now() end where id = p_repo;
end;
$$;
revoke all on function public.set_code_consent(uuid, boolean) from public, anon;
grant execute on function public.set_code_consent(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------- inventory (FR-001)
create table public.repo_inventory (
  repo_id     uuid primary key,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  commit_sha  text not null,
  counts      jsonb not null,                       -- {"specs": 3, "docs": 10, "api": 1, "tests": 40, "database": 6, "config": 4, "code": 120, "other": 9}
  total_files int not null,
  updated_at  timestamptz not null default now(),
  foreign key (org_id, repo_id) references public.repositories (org_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------------------------- rules
create table public.business_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  repo_id       uuid not null,
  seq           bigint not null,
  code          text not null,                      -- BR-001, per company
  statement     text not null check (length(trim(statement)) between 8 and 600),
  statement_key text not null,                      -- normalized hash: the same rule found twice is one rule (FR-012)
  category      text not null check (category in ('money', 'permissions', 'limits', 'notifications', 'data', 'other')),
  risk          text not null check (risk in ('high', 'medium', 'low')),
  origin        text not null check (origin in ('spec', 'code')),
  confidence    text not null check (confidence in ('low', 'medium', 'high')),
  status        text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected')),
  proposed_by   text not null,
  commit_sha    text not null,
  decided_by    uuid references auth.users (id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, seq),
  unique (repo_id, statement_key),
  foreign key (org_id, repo_id) references public.repositories (org_id, id) on delete cascade,
  -- a rule read from code is a hypothesis: never "high" until a person confirms it (D-009)
  check (origin = 'spec' or status = 'confirmed' or confidence in ('low', 'medium')),
  check ((status = 'proposed') = (decided_by is null))
);
create index business_rules_queue_idx on public.business_rules (org_id, status, risk);

create function private.number_rule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('rule:' || new.org_id::text, 0));
  select coalesce(max(seq), 0) + 1 into new.seq from public.business_rules where org_id = new.org_id;
  new.code := 'BR-' || lpad(new.seq::text, 3, '0');
  return new;
end;
$$;
create trigger business_rules_number before insert on public.business_rules for each row execute function private.number_rule();

create table public.rule_evidence (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  rule_id      uuid not null,
  path         text not null,
  start_line   int not null check (start_line >= 1),
  end_line     int not null,
  excerpt      text not null check (length(excerpt) <= 600),
  snippet_hash text not null,                       -- hash of the lines at commit_sha: what drift detection compares (FR-010)
  commit_sha   text not null,
  check (end_line >= start_line),
  foreign key (org_id, rule_id) references public.business_rules (org_id, id) on delete cascade
);
create index rule_evidence_rule_idx on public.rule_evidence (rule_id);

-- the person's decisions about rules: append-only, like approvals (FR-007)
create table public.rule_decisions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  rule_id            uuid not null,
  action             text not null check (action in ('confirm', 'correct', 'reject')),
  by_user            uuid not null references auth.users (id),
  previous_statement text not null,
  new_statement      text not null,
  note               text not null default '',
  at                 timestamptz not null default now(),
  check (action <> 'reject' or length(trim(note)) > 0),
  foreign key (org_id, rule_id) references public.business_rules (org_id, id) on delete cascade
);
create trigger rule_decisions_no_change before update or delete on public.rule_decisions for each row execute function private.approvals_append_only();
create trigger rule_decisions_no_truncate before truncate on public.rule_decisions for each statement execute function private.approvals_append_only();

create function public.decide_rule(p_rule uuid, p_action text, p_statement text default null, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.business_rules;
  v_new text;
begin
  select * into r from public.business_rules where id = p_rule for update;
  if not found or not private.has_role(r.org_id, array['owner', 'admin', 'approver']::public.org_role[]) then
    raise exception 'not allowed to decide this rule' using errcode = '42501';
  end if;
  if p_action not in ('confirm', 'correct', 'reject') then
    raise exception 'unknown action %', p_action using errcode = '22023';
  end if;
  v_new := case when p_action = 'correct' then trim(coalesce(p_statement, '')) else r.statement end;
  if p_action = 'correct' and v_new = '' then
    raise exception 'a corrected rule needs its new statement' using errcode = '23514';
  end if;
  update public.business_rules
     set statement = v_new,
         statement_key = case when p_action = 'correct' then encode(sha256(convert_to(lower(regexp_replace(v_new, '\s+', ' ', 'g')), 'utf8')), 'hex') else statement_key end,
         status = case when p_action = 'reject' then 'rejected' else 'confirmed' end,
         decided_by = auth.uid(), decided_at = now(),
         confidence = case when p_action = 'reject' then confidence else 'high' end
   where id = p_rule;
  insert into public.rule_decisions (org_id, rule_id, action, by_user, previous_statement, new_statement, note)
    values (r.org_id, r.id, p_action, auth.uid(), r.statement, v_new, coalesce(p_note, ''));
end;
$$;
revoke all on function public.decide_rule(uuid, text, text, text) from public, anon;
grant execute on function public.decide_rule(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------- baseline (FR-009)
create table public.baselines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  note        text not null default '',
  frozen_by   uuid not null references auth.users (id),
  frozen_at   timestamptz not null default now(),
  rules       jsonb not null,                       -- every confirmed rule with its evidence, as it was when frozen
  rules_count int not null check (rules_count > 0),
  hash        text not null,
  unique (org_id, id)
);
create trigger baselines_no_change before update or delete on public.baselines for each row execute function private.approvals_append_only();
create trigger baselines_no_truncate before truncate on public.baselines for each statement execute function private.approvals_append_only();

create function public.freeze_baseline(p_org uuid, p_name text, p_note text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_rules jsonb;
  v_n int;
  v_id uuid;
begin
  if not private.has_role(p_org, array['owner', 'admin', 'approver']::public.org_role[]) then
    raise exception 'not allowed to freeze the baseline' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', r.code, 'statement', r.statement, 'category', r.category, 'risk', r.risk, 'repo_id', r.repo_id,
           'evidence', (select coalesce(jsonb_agg(jsonb_build_object('path', e.path, 'start_line', e.start_line, 'end_line', e.end_line, 'snippet_hash', e.snippet_hash) order by e.path, e.start_line), '[]'::jsonb)
                          from public.rule_evidence e where e.rule_id = r.id)) order by r.seq), '[]'::jsonb),
         count(*)
    into v_rules, v_n
    from public.business_rules r where r.org_id = p_org and r.status = 'confirmed';
  if v_n = 0 then
    raise exception 'there are no confirmed rules to freeze' using errcode = '23514';
  end if;
  insert into public.baselines (org_id, name, note, frozen_by, rules, rules_count, hash)
    values (p_org, p_name, coalesce(p_note, ''), auth.uid(), v_rules, v_n, encode(sha256(convert_to(v_rules::text, 'utf8')), 'hex'))
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.freeze_baseline(uuid, text, text) from public, anon;
grant execute on function public.freeze_baseline(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------- drift (FR-010, FR-011)
create table public.drift_findings (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  rule_id           uuid not null,
  commit_sha        text not null,
  kind              text not null check (kind in ('evidence_changed', 'evidence_removed')),
  detail            text not null,
  status            text not null default 'open' check (status in ('open', 'acknowledged')),
  created_at        timestamptz not null default now(),
  acknowledged_by   uuid references auth.users (id),
  acknowledged_at   timestamptz,
  acknowledge_note  text,
  unique (rule_id, kind, commit_sha),
  foreign key (org_id, rule_id) references public.business_rules (org_id, id) on delete cascade,
  check ((status = 'open') = (acknowledged_by is null))
);
create index drift_open_idx on public.drift_findings (org_id) where status = 'open';

create function public.acknowledge_drift(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f public.drift_findings;
begin
  select * into f from public.drift_findings where id = p_id for update;
  if not found or not private.has_role(f.org_id, array['owner', 'admin', 'approver']::public.org_role[]) then
    raise exception 'not allowed to acknowledge this finding' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'say why this change is fine' using errcode = '23514';
  end if;
  update public.drift_findings set status = 'acknowledged', acknowledged_by = auth.uid(), acknowledged_at = now(), acknowledge_note = p_note where id = p_id;
end;
$$;
revoke all on function public.acknowledge_drift(uuid, text) from public, anon;
grant execute on function public.acknowledge_drift(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------- RLS and privileges
alter table public.repo_inventory  enable row level security;
alter table public.business_rules  enable row level security;
alter table public.rule_evidence   enable row level security;
alter table public.rule_decisions  enable row level security;
alter table public.baselines       enable row level security;
alter table public.drift_findings  enable row level security;

create policy inventory_select on public.repo_inventory  for select to authenticated using (private.is_member(org_id));
create policy rules_select     on public.business_rules  for select to authenticated using (private.is_member(org_id));
create policy evidence_select  on public.rule_evidence   for select to authenticated using (private.is_member(org_id));
create policy decisions_select on public.rule_decisions  for select to authenticated using (private.is_member(org_id));
create policy baselines_select on public.baselines       for select to authenticated using (private.is_member(org_id));
create policy drift_select     on public.drift_findings  for select to authenticated using (private.is_member(org_id));

revoke all on public.repo_inventory, public.business_rules, public.rule_evidence, public.rule_decisions, public.baselines, public.drift_findings from anon, authenticated;
grant select on public.repo_inventory, public.business_rules, public.rule_evidence, public.rule_decisions, public.baselines, public.drift_findings to authenticated;
-- the service proposes and detects; it can never decide, freeze or rewrite history
revoke all on public.rule_decisions, public.baselines from service_role;
grant select on public.rule_decisions, public.baselines to service_role;
grant all on public.repo_inventory, public.rule_evidence to service_role;
-- ...and it cannot even INSERT a rule as already confirmed: status, decided_by and the numbering are not insertable columns
revoke all on public.business_rules from service_role;
grant select on public.business_rules to service_role;
grant insert (org_id, repo_id, statement, statement_key, category, risk, origin, confidence, proposed_by, commit_sha) on public.business_rules to service_role;
revoke all on public.drift_findings from service_role;
grant select, insert on public.drift_findings to service_role;
