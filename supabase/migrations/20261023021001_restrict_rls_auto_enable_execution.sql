-- Internal event-trigger helper: browsers and the service API must not call it.
-- Some isolated projects do not install this platform helper. Preserve that state.
-- Keep any existing event trigger and its owner privileges intact.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke execute on function public.rls_auto_enable() from public,anon,authenticated,service_role;
 end if;
end $$;
