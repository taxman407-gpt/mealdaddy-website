-- Separate 2,000-license campaigns. Preserve the original BYOK aggregate keys.
alter table app_private.founding_license_slots add column plan_key text not null default 'byo' check(plan_key in ('core','byo'));
alter table app_private.founding_license_policy add column core_sales_closed boolean not null default false;
update app_private.founding_license_policy set counter_visible=true;
insert into app_private.founding_license_slots(checkout_session_id,state,plan_key)
select q.checkout_session_id,case when p.status='refunded' then 'refunded' when p.checkout_session_id is not null then 'purchased' when s.status='expired' then 'released' else 'held' end,'core'
from public.lifetime_checkout_quotes q join public.stripe_checkout_sessions s using(checkout_session_id)
left join public.lifetime_payments p using(checkout_session_id)
where q.plan_key='core' and q.kind='purchase' and q.amount_cents=35000;
do $$ begin
 if exists(select plan_key from app_private.founding_license_slots where state in ('held','purchased') group by plan_key having count(*)>2000) then raise exception 'EXISTING_FOUNDING_CAP_EXCEEDED'; end if;
end $$;
update app_private.founding_license_policy set core_sales_closed=(select count(*)>=2000 from app_private.founding_license_slots where plan_key='core' and state='purchased');
create or replace function app_private.hold_founding_license() returns trigger language plpgsql security invoker set search_path='' as $$
declare closed boolean; regular_amount bigint; founding_amount bigint;
begin
 if new.kind<>'purchase' then return new; end if;
 perform pg_advisory_xact_lock(197023,2000);
 if exists(select 1 from app_private.founding_license_slots where checkout_session_id=new.checkout_session_id and plan_key=new.plan_key and state in ('held','purchased')) then
  if tg_op='UPDATE' and (new.plan_key<>old.plan_key or new.amount_cents<>old.amount_cents) then raise exception 'IMMUTABLE_FOUNDING_QUOTE'; end if;
  return new;
 end if;
 select case when new.plan_key='core' then core_sales_closed else sales_closed end into closed from app_private.founding_license_policy where singleton;
 regular_amount:=case when new.plan_key='core' then 39500 else 29500 end;
 founding_amount:=case when new.plan_key='core' then 35000 else 25000 end;
 if closed then
  if new.amount_cents<>regular_amount then raise exception 'REGULAR_LIFETIME_PRICE_REQUIRED'; end if;
  return new;
 end if;
 if new.amount_cents<>founding_amount then raise exception 'FOUNDING_LIFETIME_PRICE_REQUIRED'; end if;
 if (select count(*) from app_private.founding_license_slots where plan_key=new.plan_key and state in ('held','purchased'))>=2000 then raise exception 'FOUNDING_LICENSES_RESERVED' using errcode='23514'; end if;
 insert into app_private.founding_license_slots(checkout_session_id,state,plan_key) values(new.checkout_session_id,'held',new.plan_key) on conflict(checkout_session_id) do update set state='held' where app_private.founding_license_slots.plan_key=excluded.plan_key;
 return new;
end $$;
create or replace function app_private.update_founding_purchase() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.kind<>'purchase' then return new; end if;
 perform pg_advisory_xact_lock(197023,2000);
 if not exists(select 1 from app_private.founding_license_slots where checkout_session_id=new.checkout_session_id and plan_key=new.plan_key and state in ('held','purchased','refunded')) then
  -- Regular lifetime purchases have no Founding slot; a stored regular-price quote is required.
  if exists(select 1 from public.lifetime_checkout_quotes where checkout_session_id=new.checkout_session_id and plan_key=new.plan_key and kind='purchase' and amount_cents=case when new.plan_key='core' then 39500 else 29500 end) then return new; end if;
  raise exception 'FOUNDING_RESERVATION_REQUIRED';
 end if;
 update app_private.founding_license_slots set state=case when new.status='refunded' then 'refunded' else 'purchased' end where checkout_session_id=new.checkout_session_id;
 if (select count(*) from app_private.founding_license_slots where plan_key=new.plan_key and state='purchased')>=2000 then
  if new.plan_key='core' then update app_private.founding_license_policy set core_sales_closed=true where singleton;
  else update app_private.founding_license_policy set sales_closed=true where singleton; end if;
 end if;
 return new;
end $$;
create or replace function public.founding_license_availability() returns jsonb language sql stable security invoker set search_path='' as $$
 with counts as (select count(*) filter(where plan_key='core' and state='purchased') as core_sold,count(*) filter(where plan_key='byo' and state='purchased') as byo_sold from app_private.founding_license_slots),
 states as (select jsonb_build_object('capacity',2000,'counterVisible',true,'remaining',case when p.core_sales_closed then 0 else greatest(0,2000-c.core_sold) end,'soldOut',p.core_sales_closed,'nearLimit',c.core_sold>=1800) as core,
 jsonb_build_object('capacity',2000,'counterVisible',true,'remaining',case when p.sales_closed then 0 else greatest(0,2000-c.byo_sold) end,'soldOut',p.sales_closed,'nearLimit',c.byo_sold>=1800) as byo from app_private.founding_license_policy p cross join counts c where singleton)
 select byo || jsonb_build_object('plans',jsonb_build_object('core',core,'byo',byo)) from states;
$$;
revoke all on function public.founding_license_availability() from public,anon,authenticated;
grant execute on function public.founding_license_availability() to service_role;
