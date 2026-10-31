begin;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000000d101','privacy-one@example.invalid'),
('00000000-0000-4000-8000-00000000d102','privacy-two@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000d101","role":"authenticated","aal":"aal1"}',true);
do $$ declare u uuid:='00000000-0000-4000-8000-00000000d101'; begin
 insert into public.optional_diagnostic_events(user_id,feature,outcome,duration_band,app_version)
 values(u,'estimate-entry','success','under_5s','20261031');
 if exists(select 1 from public.optional_diagnostic_events) then raise exception 'Collected before consent'; end if;
 insert into public.diagnostic_preferences(user_id,enabled) values(u,true);
 insert into public.optional_diagnostic_events(user_id,feature,outcome,duration_band,app_version,created_at)
 values(u,'estimate-entry','success','under_5s','20261031','2000-01-01');
 if not exists(select 1 from public.optional_diagnostic_events where created_at>now()-interval '1 minute') then raise exception 'Timestamp spoof accepted or event missing'; end if;
 begin
 insert into public.optional_diagnostic_events(user_id,feature,outcome,duration_band,app_version) values(u,'secret meal text','failure','under_5s','20261031');
 raise exception 'Unapproved field value accepted';
 exception when check_violation then null; end;
 update public.diagnostic_preferences set enabled=false where user_id=u;
 insert into public.optional_diagnostic_events(user_id,feature,outcome,duration_band,app_version) values(u,'estimate-entry','failure','under_5s','20261031');
 if (select count(*) from public.optional_diagnostic_events)<>1 then raise exception 'Collected after withdrawal'; end if;
 update public.diagnostic_preferences set enabled=true where user_id=u;
 insert into public.optional_diagnostic_events(user_id,feature,outcome,duration_band,app_version)
 select u,'estimate-entry','success','under_5s','20261031' from generate_series(1,110);
 if (select count(*) from public.optional_diagnostic_events)<>100 then raise exception 'Daily cap failed'; end if;
 insert into public.adult_eligibility(user_id,confirmed_adult) values(u,true);
 if not exists(select 1 from public.adult_eligibility where user_id=u and policy_version=1) then raise exception 'Confirmation missing'; end if;
 begin
 insert into public.adult_eligibility(user_id,confirmed_adult) values('00000000-0000-4000-8000-00000000d102',true);
 raise exception 'Cross-account confirmation accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000d102","role":"authenticated","aal":"aal1"}',true);
do $$ begin
 if exists(select 1 from public.adult_eligibility) or exists(select 1 from public.diagnostic_preferences) then raise exception 'Cross-account read'; end if;
 begin
 insert into public.adult_eligibility(user_id,confirmed_adult) values('00000000-0000-4000-8000-00000000d102',false);
 raise exception 'False adult affirmation accepted';
 exception when check_violation or insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: consent defaults/withdrawal, technical allowlist, server timestamp, 100/day cap, adult attestation and account isolation; rolled back' as result;
