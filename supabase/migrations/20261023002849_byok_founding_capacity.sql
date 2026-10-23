-- BYOK Founding Members: 2,000 slots; remaining count appears after 500 paid purchases.
-- Slots deliberately have no user FK: deleting an account must not erase a sale.
create table app_private.founding_license_slots (
 checkout_session_id text primary key,
 state text not null check(state in ('held','purchased','refunded','released'))
);
create table app_private.founding_license_policy (
 singleton boolean primary key default true check(singleton),
 counter_visible boolean not null default false,
 sales_closed boolean not null default false
);
insert into app_private.founding_license_policy(singleton) values(true);
alter table app_private.founding_license_slots enable row level security;
alter table app_private.founding_license_policy enable row level security;
revoke all on app_private.founding_license_slots,app_private.founding_license_policy from public,anon,authenticated;
grant usage on schema app_private to service_role;
grant all on app_private.founding_license_slots,app_private.founding_license_policy to service_role;
-- Preserve existing paid and still-open quotes before enforcing the cap.
insert into app_private.founding_license_slots(checkout_session_id,state)
select q.checkout_session_id,case when p.status='refunded' then 'refunded' when p.checkout_session_id is not null then 'purchased' when s.status='expired' then 'released' else 'held' end
from public.lifetime_checkout_quotes q join public.stripe_checkout_sessions s using(checkout_session_id)
left join public.lifetime_payments p using(checkout_session_id)
where q.plan_key='byo' and q.kind='purchase';
do $$ begin
 if (select count(*) from app_private.founding_license_slots where state in ('held','purchased'))>2000 then raise exception 'EXISTING_FOUNDING_CAP_EXCEEDED'; end if;
end $$;
update app_private.founding_license_policy set counter_visible=true where (select count(*) from app_private.founding_license_slots where state='purchased')>=500;
create function app_private.hold_founding_license() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.plan_key<>'byo' or new.kind<>'purchase' then return new; end if;
 perform pg_advisory_xact_lock(197023,2000);
 if exists(select 1 from app_private.founding_license_slots where checkout_session_id=new.checkout_session_id and state in ('held','purchased')) then return new; end if;
 if (select sales_closed from app_private.founding_license_policy where singleton) or (select count(*) from app_private.founding_license_slots where state in ('held','purchased'))>=2000 then raise exception 'FOUNDING_LICENSES_SOLD_OUT' using errcode='23514'; end if;
 insert into app_private.founding_license_slots values(new.checkout_session_id,'held') on conflict(checkout_session_id) do update set state='held';
 return new;
end $$;
create trigger hold_founding_license before insert or update on public.lifetime_checkout_quotes for each row execute function app_private.hold_founding_license();
create function app_private.update_founding_purchase() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.plan_key<>'byo' or new.kind<>'purchase' then return new; end if;
 perform pg_advisory_xact_lock(197023,2000);
 if not exists(select 1 from app_private.founding_license_slots where checkout_session_id=new.checkout_session_id and state in ('held','purchased','refunded')) then raise exception 'FOUNDING_RESERVATION_REQUIRED'; end if;
 update app_private.founding_license_slots set state=case when new.status='refunded' then 'refunded' else 'purchased' end where checkout_session_id=new.checkout_session_id;
 if (select count(*) from app_private.founding_license_slots where state='purchased')>=500 then update app_private.founding_license_policy set counter_visible=true where singleton; end if;
 if (select count(*) from app_private.founding_license_slots where state='purchased')>=2000 then update app_private.founding_license_policy set sales_closed=true where singleton; end if;
 return new;
end $$;
create trigger update_founding_purchase after insert or update on public.lifetime_payments for each row execute function app_private.update_founding_purchase();
create function app_private.release_founding_checkout() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='expired' then
  perform pg_advisory_xact_lock(197023,2000);
  update app_private.founding_license_slots set state='released' where checkout_session_id=new.checkout_session_id and state='held';
 end if;
 return new;
end $$;
create trigger release_founding_checkout after update on public.stripe_checkout_sessions for each row execute function app_private.release_founding_checkout();
create function public.founding_license_availability() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('capacity',2000,'counterVisible',p.counter_visible,'remaining',case when p.counter_visible then greatest(0,2000-(select count(*) from app_private.founding_license_slots where state in ('held','purchased'))) else null end,'soldOut',p.sales_closed,'nearLimit',(select count(*) from app_private.founding_license_slots where state='purchased')>=1800)
 from app_private.founding_license_policy p where singleton;
$$;
revoke all on function app_private.hold_founding_license(),app_private.update_founding_purchase(),app_private.release_founding_checkout(),public.founding_license_availability() from public,anon,authenticated;
grant execute on function app_private.hold_founding_license(),app_private.update_founding_purchase(),app_private.release_founding_checkout(),public.founding_license_availability() to service_role;
