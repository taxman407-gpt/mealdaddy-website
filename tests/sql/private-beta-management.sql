begin;
insert into auth.users(id,email,email_confirmed_at) values
('00000000-0000-4000-8000-00000000bd01','beta-owner@example.invalid',now()),
('00000000-0000-4000-8000-00000000bd02','beta-member@example.invalid',now()),
('00000000-0000-4000-8000-00000000bd03','beta-unconfirmed@example.invalid',null);
insert into public.owner_accounts(user_id) values('00000000-0000-4000-8000-00000000bd01');
set local role service_role;
do $$ begin
 perform public.manage_beta_invitation('00000000-0000-4000-8000-00000000bd01',' BETA-MEMBER@example.invalid ','byo',true);
 if public.accept_beta_invitation('00000000-0000-4000-8000-00000000bd02')->>'plan'<>'byo' then raise exception 'Wrong complimentary plan'; end if;
 if not exists(select 1 from public.complimentary_access_grants where user_id='00000000-0000-4000-8000-00000000bd02' and status='active' and access_type='beta' and plan_key='byo') then raise exception 'Grant missing'; end if;
 perform public.manage_beta_invitation('00000000-0000-4000-8000-00000000bd01','beta-member@example.invalid','core',true);
 if public.accept_beta_invitation('00000000-0000-4000-8000-00000000bd02')->>'plan'<>'core' then raise exception 'Plan change ignored'; end if;
 perform public.manage_beta_invitation('00000000-0000-4000-8000-00000000bd01','beta-member@example.invalid','core',false);
 if public.accept_beta_invitation('00000000-0000-4000-8000-00000000bd02') is not null then raise exception 'Revoked invitation accepted'; end if;
 if not exists(select 1 from public.complimentary_access_grants where user_id='00000000-0000-4000-8000-00000000bd02' and status='revoked') then raise exception 'Grant not revoked'; end if;
 perform public.manage_beta_invitation('00000000-0000-4000-8000-00000000bd01','beta-unconfirmed@example.invalid','byo',true);
 if public.accept_beta_invitation('00000000-0000-4000-8000-00000000bd03') is not null then raise exception 'Unconfirmed email admitted'; end if;
 if exists(select 1 from public.subscriptions where user_id in ('00000000-0000-4000-8000-00000000bd02','00000000-0000-4000-8000-00000000bd03')) then raise exception 'Beta created a subscription'; end if;
 if (select count(*) from app_private.beta_access_audit where actor_id='00000000-0000-4000-8000-00000000bd01')<>4 then raise exception 'Audit missing'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform public.beta_owner_dashboard(); raise exception 'Client inspected owner dashboard'; exception when insufficient_privilege then null; end;
 begin perform public.accept_beta_invitation('00000000-0000-4000-8000-00000000bd02'); raise exception 'Client accepted for another user'; exception when insufficient_privilege then null; end;
 begin perform public.manage_beta_invitation('00000000-0000-4000-8000-00000000bd01','outsider@example.invalid','byo',true); raise exception 'Client granted access'; exception when insufficient_privilege then null; end;
end $$;
rollback;
