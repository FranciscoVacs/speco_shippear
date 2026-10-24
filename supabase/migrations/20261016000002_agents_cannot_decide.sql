-- Spec 018 · agents cannot decide (D-012, FR-011). An access token that Supabase issues to an OAuth client (an AI agent connected through MCP)
-- carries a `client_id` claim and, per Supabase, the same reach as the person's own session. Without this migration such a token could call
-- the decision functions directly. With it, the DATABASE refuses every write that is a decision, whatever the route (our API, the tools, or
-- Supabase's own REST). Reads are untouched: an agent sees exactly what the person sees.

create function private.is_agent() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'client_id', '') <> '';
$$;
grant execute on function private.is_agent() to authenticated, service_role;

create or replace function public.create_organization(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if private.is_agent() then
    raise exception 'agents cannot decide: only a person can' using errcode = '42501';
  end if;
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  insert into public.organizations (name, slug) values (p_name, p_slug) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  return v_org;
end;
$$;

create or replace function public.decide_rule(p_rule uuid, p_action text, p_statement text default null, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.business_rules;
  v_new text;
begin
  if private.is_agent() then
    raise exception 'agents cannot decide: only a person can' using errcode = '42501';
  end if;
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

create or replace function public.freeze_baseline(p_org uuid, p_name text, p_note text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_rules jsonb;
  v_n int;
  v_id uuid;
begin
  if private.is_agent() then
    raise exception 'agents cannot decide: only a person can' using errcode = '42501';
  end if;
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

create or replace function public.acknowledge_drift(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f public.drift_findings;
begin
  if private.is_agent() then
    raise exception 'agents cannot decide: only a person can' using errcode = '42501';
  end if;
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

create or replace function public.set_code_consent(p_repo uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if private.is_agent() then
    raise exception 'agents cannot decide: only a person can' using errcode = '42501';
  end if;
  select org_id into v_org from public.repositories where id = p_repo;
  if v_org is null or not private.has_role(v_org, array['owner', 'admin']::public.org_role[]) then
    raise exception 'only owners and admins decide whether code is analyzed' using errcode = '42501';
  end if;
  update public.repositories set code_consent_by = case when p_on then auth.uid() end, code_consent_at = case when p_on then now() end where id = p_repo;
end;
$$;

-- direct table writes: restrictive policies are ANDed with the permissive ones that already exist
create policy no_agents_organizations on public.organizations as restrictive for update to authenticated using (not private.is_agent()) with check (not private.is_agent());
create policy no_agents_memberships_i on public.memberships  as restrictive for insert to authenticated with check (not private.is_agent());
create policy no_agents_memberships_u on public.memberships  as restrictive for update to authenticated using (not private.is_agent()) with check (not private.is_agent());
create policy no_agents_memberships_d on public.memberships  as restrictive for delete to authenticated using (not private.is_agent());
create policy no_agents_approvals     on public.approvals    as restrictive for insert to authenticated with check (not private.is_agent());
