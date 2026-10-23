begin;
insert into auth.users(id,email,email_confirmed_at) values
('00000000-0000-4000-8000-00000000be01','beta-one@example.invalid',now()),
('00000000-0000-4000-8000-00000000be02','beta-two@example.invalid',now()),
('00000000-0000-4000-8000-00000000be03','beta-outsider@example.invalid',now());
insert into app_private.beta_invitations(email,plan_key) values('beta-one@example.invalid','byo'),('beta-two@example.invalid','core');
update app_private.beta_sponsor_settings set enabled=true,daily_global_requests=2,daily_user_requests=1,total_requests=2;
set local role service_role;
do $$ begin
 if public.beta_access_for_user('00000000-0000-4000-8000-00000000be03') is not null then raise exception 'Uninvited account admitted'; end if;
 if public.reserve_beta_sponsored_request('00000000-0000-4000-8000-00000000be03','anthropic') then raise exception 'Uninvited spend accepted'; end if;
 if not public.reserve_beta_sponsored_request('00000000-0000-4000-8000-00000000be01','anthropic') then raise exception 'Invited request rejected'; end if;
 if public.reserve_beta_sponsored_request('00000000-0000-4000-8000-00000000be01','gemini') then raise exception 'Per-tester cap bypassed with provider switch'; end if;
 if not public.reserve_beta_sponsored_request('00000000-0000-4000-8000-00000000be02','gemini') then raise exception 'Second tester rejected'; end if;
 update app_private.beta_invitations set active=false where email='beta-one@example.invalid';
 if public.beta_access_for_user('00000000-0000-4000-8000-00000000be01') is not null then raise exception 'Revocation ignored'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000be02","role":"authenticated"}',true);
do $$ begin
 if public.beta_access()->>'plan'<>'core' then raise exception 'Wrong caller invitation'; end if;
 begin perform public.reserve_beta_sponsored_request('00000000-0000-4000-8000-00000000be02','gemini');raise exception 'Client reserved sponsor use directly';exception when insufficient_privilege then null;end;
 begin perform public.beta_access_for_user('00000000-0000-4000-8000-00000000be01');raise exception 'Client inspected another invitation';exception when insufficient_privilege then null;end;
end $$;
rollback;
