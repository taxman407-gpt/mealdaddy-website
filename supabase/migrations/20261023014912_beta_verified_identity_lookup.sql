-- Service-only, private, exact-match identity lookup. No broad auth.users grant.
create function app_private.beta_verified_identity(requested_id uuid,requested_email text)
returns table(id uuid,email text) language sql stable security definer set search_path='' as $$
 select u.id,u.email::text from auth.users u where u.email_confirmed_at is not null and ((requested_id is not null and requested_email is null and u.id=requested_id) or (requested_id is null and requested_email is not null and lower(u.email)=requested_email));
$$;
revoke all on function app_private.beta_verified_identity(uuid,text) from public,anon,authenticated;
grant execute on function app_private.beta_verified_identity(uuid,text) to service_role;
create or replace function public.beta_access_for_user(target_user_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('plan',i.plan_key,'complimentary',true) from app_private.beta_invitations i join app_private.beta_verified_identity(target_user_id,null) u on lower(u.email)=i.email where i.active;
$$;
create or replace function public.reserve_beta_sponsored_request(requested_user_id uuid,requested_provider text) returns boolean language plpgsql security invoker set search_path='' as $$
declare settings app_private.beta_sponsor_settings; day_start timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
 if requested_provider not in ('anthropic','gemini') then return false; end if;
 perform 1 from app_private.beta_invitations i join app_private.beta_verified_identity(requested_user_id,null) u on lower(u.email)=i.email where i.active for share of i;
 if not found then return false; end if;
 perform pg_advisory_xact_lock(197023,3000);
 select * into settings from app_private.beta_sponsor_settings where singleton;
 if not settings.enabled then return false; end if;
 if (select count(*) from app_private.beta_sponsor_requests)>=settings.total_requests or (select count(*) from app_private.beta_sponsor_requests where created_at>=day_start)>=settings.daily_global_requests or (select count(*) from app_private.beta_sponsor_requests where user_id=requested_user_id and created_at>=day_start)>=settings.daily_user_requests then return false; end if;
 insert into app_private.beta_sponsor_requests(user_id,provider) values(requested_user_id,requested_provider);
 return true;
end $$;
create or replace function public.manage_beta_invitation(requested_actor uuid,requested_email text,requested_plan text,requested_active boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare target uuid; normalized text:=lower(trim(requested_email));
begin
 if normalized is null or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(normalized)>254 or requested_plan is null or requested_plan not in ('core','byo') or requested_active is null then raise exception 'Invalid invitation'; end if;
 if not exists(select 1 from public.owner_accounts where user_id=requested_actor) then raise exception 'Owner required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('beta-invite:'||normalized,0));
 insert into app_private.beta_invitations(email,plan_key,active,invited_by) values(normalized,requested_plan,requested_active,requested_actor)
 on conflict(email) do update set plan_key=excluded.plan_key,active=excluded.active,invited_by=excluded.invited_by;
 select id into target from app_private.beta_verified_identity(null,normalized);
 if target is not null then
  if requested_active then
   insert into public.complimentary_access_grants(user_id,access_type,status,plan_key,granted_by) values(target,'beta','active',requested_plan,requested_actor)
   on conflict(user_id) do update set status='active',plan_key=excluded.plan_key,revoked_at=null,updated_at=now() where complimentary_access_grants.access_type='beta';
  else update public.complimentary_access_grants set status='revoked',revoked_at=now(),updated_at=now() where user_id=target and access_type='beta'; end if;
 end if;
 insert into app_private.beta_access_audit(actor_id,email,action) values(requested_actor,normalized,case when requested_active then 'invite_'||requested_plan else 'revoke' end);
 return true;
end $$;
create or replace function public.accept_beta_invitation(requested_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare invitation app_private.beta_invitations;
begin
 select i.* into invitation from app_private.beta_invitations i join app_private.beta_verified_identity(requested_user_id,null) u on lower(u.email)=i.email where i.active for update of i;
 if not found then return null; end if;
 insert into public.complimentary_access_grants(user_id,access_type,status,plan_key,granted_by) values(requested_user_id,'beta','active',invitation.plan_key,invitation.invited_by)
 on conflict(user_id) do update set status='active',plan_key=excluded.plan_key,revoked_at=null,updated_at=now() where complimentary_access_grants.access_type='beta';
 return jsonb_build_object('plan',invitation.plan_key,'complimentary',true);
end $$;