-- Optional diagnostics contain enumerated technical fields only; never request bodies.
create table public.diagnostic_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 consent_version integer not null default 1 check(consent_version=1),
 updated_at timestamptz not null default now()
);
create table public.optional_diagnostic_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 feature text not null check(feature in ('estimate-entry','analyze-food-photo','analyze-leftovers','restaurant-guide','recipe-recreation')),
 outcome text not null check(outcome in ('success','failure')),
 duration_band text not null check(duration_band in ('under_5s','5_to_20s','20_to_60s','over_60s')),
 app_version text not null check(app_version='20261031'),
 created_at timestamptz not null default now()
);
create index optional_diagnostic_user_date on public.optional_diagnostic_events(user_id,created_at);
alter table public.diagnostic_preferences enable row level security;
alter table public.optional_diagnostic_events enable row level security;
revoke all on public.diagnostic_preferences,public.optional_diagnostic_events from anon,authenticated;
grant select,insert,update,delete on public.diagnostic_preferences to authenticated;
grant select,insert,delete on public.optional_diagnostic_events to authenticated;
grant all on public.diagnostic_preferences,public.optional_diagnostic_events to service_role;
create policy diagnostic_preferences_own on public.diagnostic_preferences for all to authenticated
using(user_id=(select auth.uid()) and (select app_private.mfa_access_allowed()))
with check(user_id=(select auth.uid()) and (select app_private.mfa_access_allowed()));
create policy diagnostic_events_read on public.optional_diagnostic_events for select to authenticated
using(user_id=(select auth.uid()) and (select app_private.mfa_access_allowed()));
create policy diagnostic_events_delete on public.optional_diagnostic_events for delete to authenticated
using(user_id=(select auth.uid()) and (select app_private.mfa_access_allowed()));
create policy diagnostic_events_insert on public.optional_diagnostic_events for insert to authenticated
with check(user_id=(select auth.uid()) and (select app_private.mfa_access_allowed()) and exists
(select 1 from public.diagnostic_preferences p where p.user_id=optional_diagnostic_events.user_id and p.enabled));
create function app_private.guard_optional_diagnostic() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare permitted boolean;
begin
 -- Lock consent against concurrent withdrawal, then serialize bounded writes per account.
 select enabled into permitted from public.diagnostic_preferences where user_id=new.user_id for share;
 if permitted is distinct from true then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,1431));
 new.created_at:=now();
 if (select count(*) from public.optional_diagnostic_events where user_id=new.user_id and created_at>=now()-interval '1 day')>=100 then return null; end if;
 return new;
end $$;
revoke all on function app_private.guard_optional_diagnostic() from public,anon,authenticated;
create trigger optional_diagnostic_guard before insert on public.optional_diagnostic_events for each row execute function app_private.guard_optional_diagnostic();
