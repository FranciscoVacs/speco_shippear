-- Spec 013 part 3: auditable approvals in the database. Same idea as the repo's `.specreview/approvals.jsonl` (spec 010):
-- who decided what, on which version of the spec, chained by hash so any edit or deletion shows (FR-003..FR-006, FR-008).

create type public.approval_decision as enum ('approved', 'approved_with_conditions', 'rejected', 'delegated');

create table public.approvals (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  seq         bigint not null,                    -- position in the organization's chain, assigned by the trigger
  feature_id  uuid not null,
  snapshot_id uuid not null,
  decision    public.approval_decision not null,
  reason      text not null default '',
  conditions  jsonb not null default '[]'::jsonb,
  delegate_to uuid references auth.users (id),
  override    boolean not null default false,     -- approved while blockers were open
  by_user     uuid not null references auth.users (id),
  at          timestamptz not null default now(),
  prev_hash   text not null,
  entry_hash  text not null,
  unique (org_id, seq),
  foreign key (org_id, feature_id)  references public.features (org_id, id)       on delete cascade,
  foreign key (org_id, snapshot_id) references public.spec_snapshots (org_id, id) on delete cascade,
  -- anything but a plain approval needs a reason (FR-006)
  check (decision = 'approved' or length(trim(reason)) > 0),
  check (decision <> 'delegated' or (delegate_to is not null and delegate_to <> by_user)),
  check (override = false or length(trim(reason)) > 0)
);
create index approvals_feature_idx on public.approvals (org_id, feature_id, seq desc);

-- Canonical text of an entry: every field that matters, in a fixed order and format.
create function private.approval_digest(a public.approvals) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(concat_ws('|',
    a.org_id, a.seq, a.feature_id, a.snapshot_id, a.decision, a.reason, a.conditions::text,
    coalesce(a.delegate_to::text, ''), a.override, a.by_user,
    to_char(a.at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), a.prev_hash), 'utf8')), 'hex');
$$;

-- Assigns the position and chains the entry to the previous one. The advisory lock serializes writers per organization,
-- so two approvals cannot claim the same position.
create function private.chain_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_last public.approvals;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text, 0));
  select * into v_last from public.approvals a where a.org_id = new.org_id order by a.seq desc limit 1;
  new.seq := coalesce(v_last.seq, 0) + 1;
  new.prev_hash := coalesce(v_last.entry_hash, repeat('0', 64));
  new.at := coalesce(new.at, now());
  new.entry_hash := private.approval_digest(new);
  if new.decision = 'delegated' and not exists (
       select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.delegate_to and m.role in ('owner', 'admin', 'approver')) then
    raise exception 'the delegate must be someone who can approve' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger approvals_chain before insert on public.approvals for each row execute function private.chain_approval();

-- Append-only (FR-005): not even the service can edit or delete an approval.
create function private.approvals_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'approvals are append-only' using errcode = '42501';
end;
$$;
create trigger approvals_no_change before update or delete on public.approvals for each row execute function private.approvals_append_only();
create trigger approvals_no_truncate before truncate on public.approvals for each statement execute function private.approvals_append_only();

alter table public.approvals enable row level security;
create policy approvals_select on public.approvals for select to authenticated using (private.is_member(org_id));
-- only owners, admins and approvers decide, and only as themselves (FR-003)
create policy approvals_insert on public.approvals for insert to authenticated
  with check (by_user = auth.uid() and private.has_role(org_id, array['owner', 'admin', 'approver']::public.org_role[]));

revoke all on public.approvals from anon, authenticated;
grant select on public.approvals to authenticated;
grant insert (org_id, feature_id, snapshot_id, decision, reason, conditions, delegate_to, override, by_user) on public.approvals to authenticated;
-- Supabase gives service_role everything on new tables by default: take back what append-only forbids
revoke all on public.approvals from service_role;
grant select, insert on public.approvals to service_role;

-- Walks the chain and reports the first entry that does not match (FR-008). Runs as the caller: RLS limits it to their organization.
create function public.verify_approvals(p_org uuid) returns table (ok boolean, broken_at bigint, checked bigint)
language plpgsql stable set search_path = '' as $$
declare
  a public.approvals;
  v_prev text := repeat('0', 64);
  v_seq bigint := 0;
  v_n bigint := 0;
begin
  for a in select * from public.approvals x where x.org_id = p_org order by x.seq loop
    v_n := v_n + 1;
    v_seq := v_seq + 1;
    if a.seq <> v_seq or a.prev_hash <> v_prev or a.entry_hash <> private.approval_digest(a) then
      return query select false, a.seq, v_n;
      return;
    end if;
    v_prev := a.entry_hash;
  end loop;
  return query select true, null::bigint, v_n;
end;
$$;
revoke all on function public.verify_approvals(uuid) from public, anon;
grant execute on function public.verify_approvals(uuid) to authenticated, service_role;
