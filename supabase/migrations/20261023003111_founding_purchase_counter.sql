create or replace function public.founding_license_availability() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('capacity',2000,'counterVisible',p.counter_visible,'remaining',case when p.counter_visible then greatest(0,2000-(select count(*) from app_private.founding_license_slots where state='purchased')) else null end,'soldOut',p.sales_closed,'nearLimit',(select count(*) from app_private.founding_license_slots where state='purchased')>=1800)
 from app_private.founding_license_policy p where singleton;
$$;
revoke all on function public.founding_license_availability() from public,anon,authenticated;
grant execute on function public.founding_license_availability() to service_role;
