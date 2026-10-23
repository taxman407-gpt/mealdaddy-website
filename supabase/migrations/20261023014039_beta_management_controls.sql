alter table app_private.beta_invitations add column invited_by uuid references auth.users(id) on delete set null;
create table app_private.beta_access_audit(id bigint generated always as identity primary key,actor_id uuid references auth.users(id) on delete set null,email text not null,action text not null,created_at timestamptz not null default now());
alter table app_private.beta_access_audit enable row level security;
revoke all on app_private.beta_access_audit from public,anon,authenticated;
grant select,insert on app_private.beta_access_audit to service_role;
grant usage,select on sequence app_private.beta_access_audit_id_seq to service_role;
create function public.manage_beta_invitation(requested_actor uuid,requested_email text,requested_plan text,requested_active boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare target uuid; normalized text:=lower(trim(requested_email));
begin
 if normalized is null or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(normalized)>254 or requested_plan is null or requested_plan not in ('core','byo') or requested_active is null then raise exception 'Invalid invitation'; end if;
 if not exists(select 1 from public.owner_accounts where user_id=requested_actor) then raise exception 'Owner required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('beta-invite:'||normalized,0));
 insert into app_private.beta_invitations(email,plan_key,active,invited_by) values(normalized,requested_plan,requested_active,requested_actor)
 on conflict(email) do update set plan_key=excluded.plan_key,active=excluded.active,invited_by=excluded.invited_by;
 select id into target from auth.users where lower(email)=normalized and email_confirmed_at is not null;
 if target is not null then
  if requested_active then
   insert into public.complimentary_access_grants(user_id,access_type,status,plan_key,granted_by) values(target,'beta','active',requested_plan,requested_actor)
   on conflict(user_id) do update set status='active',plan_key=excluded.plan_key,revoked_at=null,updated_at=now() where complimentary_access_grants.access_type='beta';
  else update public.complimentary_access_grants set status='revoked',revoked_at=now(),updated_at=now() where user_id=target and access_type='beta'; end if;
 end if;
 insert into app_private.beta_access_audit(actor_id,email,action) values(requested_actor,normalized,case when requested_active then 'invite_'||requested_plan else 'revoke' end);
 return true;
end $$;
create function public.accept_beta_invitation(requested_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare invitation app_private.beta_invitations;
begin
 select i.* into invitation from app_private.beta_invitations i join auth.users u on lower(u.email)=i.email where u.id=requested_user_id and u.email_confirmed_at is not null and i.active for update of i;
 if not found then return null; end if;
 insert into public.complimentary_access_grants(user_id,access_type,status,plan_key,granted_by) values(requested_user_id,'beta','active',invitation.plan_key,invitation.invited_by)
 on conflict(user_id) do update set status='active',plan_key=excluded.plan_key,revoked_at=null,updated_at=now() where complimentary_access_grants.access_type='beta';
 return jsonb_build_object('plan',invitation.plan_key,'complimentary',true);
end $$;
create function public.beta_owner_dashboard() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('invitations',coalesce((select jsonb_agg(jsonb_build_object('email',email,'plan',plan_key,'active',active,'createdAt',created_at) order by created_at desc) from app_private.beta_invitations),'[]'::jsonb),'limits',(select to_jsonb(s) from app_private.beta_sponsor_settings s where singleton),'usage',jsonb_build_object('total',(select count(*) from app_private.beta_sponsor_requests),'today',(select count(*) from app_private.beta_sponsor_requests where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')));
$$;
create function public.set_beta_sponsor_limits(requested_actor uuid,requested_enabled boolean,requested_user_limit integer,requested_daily_limit integer,requested_total_limit integer)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.owner_accounts where user_id=requested_actor) then raise exception 'Owner required'; end if;
 update app_private.beta_sponsor_settings set enabled=requested_enabled,daily_user_requests=requested_user_limit,daily_global_requests=requested_daily_limit,total_requests=requested_total_limit where singleton;
 insert into app_private.beta_access_audit(actor_id,email,action) values(requested_actor,'',case when requested_enabled then 'sponsor_enabled' else 'sponsor_disabled' end);
 return true;
end $$;
revoke all on function public.manage_beta_invitation(uuid,text,text,boolean),public.accept_beta_invitation(uuid),public.beta_owner_dashboard(),public.set_beta_sponsor_limits(uuid,boolean,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.manage_beta_invitation(uuid,text,text,boolean),public.accept_beta_invitation(uuid),public.beta_owner_dashboard(),public.set_beta_sponsor_limits(uuid,boolean,integer,integer,integer) to service_role;
