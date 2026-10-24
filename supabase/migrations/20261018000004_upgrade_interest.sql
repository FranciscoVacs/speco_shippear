-- Spec 020 · who asked to upgrade, and from where. There is no payment yet (out of scope): this records the intention so we can measure
-- the willingness to pay (experiment E7 of docs/24-growth-gtm.md) and tell the person as soon as paid plans exist. Service only.
create table public.upgrade_interest (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  source     text not null check (source in ('pill', 'chat_warning', 'chat_limit', 'usage')),
  day        date not null default (now() at time zone 'UTC')::date,
  created_at timestamptz not null default now(),
  unique (org_id, user_id, source, day)                 -- pressing the button twice in a day counts once
);
alter table public.upgrade_interest enable row level security;
revoke all on public.upgrade_interest from anon, authenticated;
grant select, insert on public.upgrade_interest to service_role;
