-- Which GitHub account a person signed in with. auth.identities is written by Supabase Auth only; user_metadata is editable by the
-- person, so it proves nothing. The service uses it to check that whoever links an installation is the one who installed it.
create or replace function public.github_account_id(uid uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select i.provider_id::bigint from auth.identities i where i.user_id = uid and i.provider = 'github' limit 1
$$;
revoke all on function public.github_account_id(uuid) from public, anon, authenticated;
grant execute on function public.github_account_id(uuid) to service_role;
