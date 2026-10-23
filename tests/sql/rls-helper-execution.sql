begin;
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is null then return; end if;
 if has_function_privilege('anon','public.rls_auto_enable()','execute') or has_function_privilege('authenticated','public.rls_auto_enable()','execute') or has_function_privilege('service_role','public.rls_auto_enable()','execute') then raise exception 'Unexpected helper execution permission'; end if;
 create table public.mealdaddy_rls_security_probe_20261023(id integer);
 if not (select relrowsecurity from pg_class where oid='public.mealdaddy_rls_security_probe_20261023'::regclass) then raise exception 'Automatic RLS stopped working'; end if;
end $$;
rollback;
