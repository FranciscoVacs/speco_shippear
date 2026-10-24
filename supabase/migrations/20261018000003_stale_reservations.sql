-- Spec 020 · a reservation that was never settled (the service died mid-call) must not hold credits forever.
-- Releases every reservation still open after p_minutes, giving its credits back. Returns how many.
create function public.release_stale_reservations(p_minutes int default 30) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_n int := 0;
begin
  for r in select id from public.credit_reservations where status = 'open' and created_at < now() - make_interval(mins => p_minutes) loop
    perform public.settle_credits(r.id, 0);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.release_stale_reservations(int) from public, anon, authenticated;
grant execute on function public.release_stale_reservations(int) to service_role;
