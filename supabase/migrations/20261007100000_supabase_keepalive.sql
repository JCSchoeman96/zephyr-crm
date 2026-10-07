begin;

create function public.keepalive()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
	select true;
$function$;

revoke all on function public.keepalive() from public, anon, authenticated, service_role;
grant execute on function public.keepalive() to anon;

commit;
