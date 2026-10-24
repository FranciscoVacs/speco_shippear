-- The few things Supabase gives a project for free, reproduced so the migrations run on a plain Postgres in tests.
create extension if not exists pgcrypto;
do $$ begin
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, phone text unique, created_at timestamptz not null default now());
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id), provider text not null, provider_id text not null);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Supabase grants everything on new public tables to these roles by default; the migrations must not depend on that
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
