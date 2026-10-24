-- Spec 013 · Multi-tenant backend, part 1: organizations, memberships, roles and row level security.
-- Isolation is enforced HERE, in the database (NFR-001): a bug in the API must not be able to leak another company's rows.
-- Runs on Supabase (auth.uid(), roles anon / authenticated / service_role come from the platform).

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create type public.org_role as enum ('owner', 'admin', 'approver', 'member', 'viewer');

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  plan        text not null default 'hobby' check (plan in ('hobby', 'pro', 'team')),
  created_at  timestamptz not null default now()
);

create table public.memberships (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.org_role not null,
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------------------------- helpers
-- SECURITY DEFINER so the policies can ask "is this person a member?" without recursing into memberships' own policies.
create function private.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid());
$$;

create function private.has_role(p_org uuid, p_roles public.org_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid() and m.role = any (p_roles));
$$;

-- ---------------------------------------------------------------------------------------------- creating an organization (FR-001)
-- Direct inserts are not allowed (nobody is a member yet), so creation goes through this function.
create function public.create_organization(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  insert into public.organizations (name, slug) values (p_name, p_slug) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------------------------- never without an owner (FR-007)
create function private.guard_memberships() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := coalesce(old.org_id, new.org_id);
begin
  -- only an owner can hand out or take away the owner role
  if tg_op in ('INSERT', 'UPDATE') and new.role = 'owner' and auth.uid() is not null
     and not exists (select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = auth.uid() and m.role = 'owner')
     and not (tg_op = 'INSERT' and not exists (select 1 from public.memberships m where m.org_id = new.org_id)) then
    raise exception 'only an owner can grant the owner role' using errcode = '42501';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner' and auth.uid() is not null
     and not exists (select 1 from public.memberships m where m.org_id = old.org_id and m.user_id = auth.uid() and m.role = 'owner') then
    raise exception 'only an owner can change an owner' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger memberships_guard before insert or update or delete on public.memberships
  for each row execute function private.guard_memberships();

create function private.require_an_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- when the whole organization is deleted the cascade removes every owner: that is fine
  if exists (select 1 from public.organizations o where o.id = old.org_id)
     and old.role = 'owner'
     and not exists (select 1 from public.memberships m where m.org_id = old.org_id and m.role = 'owner') then
    raise exception 'an organization must keep at least one owner' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger memberships_require_owner after update or delete on public.memberships
  deferrable initially immediate for each row execute function private.require_an_owner();

-- ---------------------------------------------------------------------------------------------- row level security
alter table public.organizations enable row level security;
alter table public.memberships   enable row level security;

create policy organizations_select on public.organizations for select to authenticated
  using (private.is_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (private.has_role(id, array['owner', 'admin']::public.org_role[]))
  with check (private.has_role(id, array['owner', 'admin']::public.org_role[]));

create policy memberships_select on public.memberships for select to authenticated
  using (private.is_member(org_id));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (private.has_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy memberships_update on public.memberships for update to authenticated
  using (private.has_role(org_id, array['owner', 'admin']::public.org_role[]))
  with check (private.has_role(org_id, array['owner', 'admin']::public.org_role[]));
-- anybody can leave; owners and admins can remove others
create policy memberships_delete on public.memberships for delete to authenticated
  using (user_id = auth.uid() or private.has_role(org_id, array['owner', 'admin']::public.org_role[]));

-- ---------------------------------------------------------------------------------------------- privileges (explicit, least)
revoke all on all tables in schema public from anon, authenticated;
grant select on public.organizations, public.memberships to authenticated;
grant update (name) on public.organizations to authenticated;
grant insert, delete on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;
grant select on public.organizations, public.memberships to service_role;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
