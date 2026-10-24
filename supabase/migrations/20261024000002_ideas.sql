-- Spec 016 · the second door: a person with an idea and no code decides what they want before an AI tool builds it.
-- An idea belongs to the company, needs no repository, and keeps what the person decided (or said they cannot decide yet).
-- Only people write it: an access token issued to an agent never answers for them (D-012).

create table public.ideas (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  created_by  uuid not null references auth.users (id),
  title       text not null check (length(trim(title)) between 1 and 120),
  need        text not null check (length(trim(need)) between 1 and 2000),
  lang        text not null default 'es' check (lang in ('es', 'en')),
  questions   jsonb not null,                      -- [{id, ask, example}] fixed when the idea is created
  answers     jsonb not null default '{}'::jsonb,  -- {question id: {state: 'answered' | 'unknown', text}}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, id)
);
create index ideas_org_idx on public.ideas (org_id, created_at desc);

alter table public.ideas enable row level security;
create policy ideas_select on public.ideas for select to authenticated using (private.is_member(org_id));
create policy ideas_insert on public.ideas for insert to authenticated
  with check (created_by = auth.uid() and not private.is_agent() and private.has_role(org_id, array['owner', 'admin', 'approver', 'member']::public.org_role[]));
create policy ideas_update on public.ideas for update to authenticated
  using (not private.is_agent() and private.has_role(org_id, array['owner', 'admin', 'approver', 'member']::public.org_role[]))
  with check (not private.is_agent() and private.has_role(org_id, array['owner', 'admin', 'approver', 'member']::public.org_role[]));

revoke all on public.ideas from anon, authenticated;
grant select on public.ideas to authenticated;
grant insert (org_id, created_by, title, need, lang, questions) on public.ideas to authenticated;
grant update (answers, title, updated_at) on public.ideas to authenticated;
grant all on public.ideas to service_role;
