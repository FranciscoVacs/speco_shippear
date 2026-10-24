-- Spec 019: the tables named after GitHub become provider neutral. The product is not launched, so nothing keeps the old shape.
-- A connection is what a company authorizes at a code host (a GitHub App installation, a Bitbucket workspace); a repository belongs to a
-- connection and is either available (found, not read), active (read) or removed.

alter table public.github_installations rename to connections;
alter table public.connections rename column installation_id to external_id;
alter table public.connections alter column external_id type text using external_id::text;
alter table public.connections add column provider text;
update public.connections set provider = 'github';
alter table public.connections alter column provider set not null;
alter table public.connections add constraint connections_provider_check check (provider in ('github', 'bitbucket'));
alter table public.connections drop constraint github_installations_installation_id_key;
alter table public.connections add constraint connections_provider_external_key unique (provider, external_id);
alter table public.connections drop constraint github_installations_account_type_check;
alter table public.connections add constraint connections_account_type_check check (account_type in ('Organization', 'User', 'Workspace'));
alter table public.connections add column details jsonb not null default '{}';        -- what the person may see: {"webhook": true} ...
alter policy installations_select on public.connections rename to connections_select;

alter table public.repositories rename column installation_id to connection_id;
alter table public.repositories rename column github_repo_id to external_id;
alter table public.repositories alter column external_id type text using external_id::text;
alter table public.repositories drop constraint repositories_org_id_github_repo_id_key;
alter table public.repositories add constraint repositories_connection_external_key unique (org_id, connection_id, external_id);
alter table public.repositories drop constraint repositories_status_check;
alter table public.repositories add constraint repositories_status_check check (status in ('available', 'active', 'removed'));

-- what opens the code of a company: only the service can read it (FR-008). RLS is on and there is deliberately no policy and no grant.
create table public.connection_secrets (
  connection_id  uuid primary key,
  org_id         uuid not null references public.organizations (id) on delete cascade,
  credentials    text not null,                    -- encrypted by the service with a key that is not in the database
  webhook_secret text,                             -- encrypted as well
  created_at     timestamptz not null default now(),
  foreign key (org_id, connection_id) references public.connections (org_id, id) on delete cascade
);
alter table public.connection_secrets enable row level security;
revoke all on public.connection_secrets from anon, authenticated, service_role;
grant select, insert, update, delete on public.connection_secrets to service_role;
