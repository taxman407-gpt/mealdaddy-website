begin;
insert into auth.users(id,email,created_at,email_confirmed_at) values
('00000000-0000-4000-8000-00000000c101','registered@example.invalid','2026-10-22','2026-10-22'),
('00000000-0000-4000-8000-00000000c102','trial@example.invalid','2026-10-22','2026-10-22'),
('00000000-0000-4000-8000-00000000c103','free-active@example.invalid','2026-10-22','2026-10-22'),
('00000000-0000-4000-8000-00000000c104','paid@example.invalid','2026-10-22','2026-10-22'),
('00000000-0000-4000-8000-00000000c105','checkout@example.invalid','2026-10-22',null);
set local role service_role;
insert into public.subscriptions(user_id,plan_key,status,stripe_subscription_id) values
('00000000-0000-4000-8000-00000000c102','core','trialing','sub_trial_fixture'),
('00000000-0000-4000-8000-00000000c103','core','active','sub_free_fixture'),
('00000000-0000-4000-8000-00000000c104','core','active','sub_paid_fixture');
insert into public.billing_payment_evidence(invoice_id,user_id,stripe_subscription_id,amount_paid_cents,currency,paid_at,stripe_event_id) values
('in_fixture','00000000-0000-4000-8000-00000000c104','sub_paid_fixture',999,'usd','2026-10-22','evt_fixture');
insert into public.stripe_checkout_sessions(checkout_session_id,user_id,status) values ('cs_fixture_1','00000000-0000-4000-8000-00000000c105','expired'),('cs_fixture_2','00000000-0000-4000-8000-00000000c105','expired');
do $$ declare report jsonb; begin
 if (select conversion_status from public.owner_registration_report where email='registered@example.invalid')<>'registered_no_linked_subscription' then raise exception 'Registered user wrongly classified';end if;
 if (select conversion_status from public.owner_registration_report where email='trial@example.invalid')<>'active_trial' then raise exception 'Trial wrongly classified';end if;
 if (select conversion_status from public.owner_registration_report where email='free-active@example.invalid')<>'unknown_reconciliation' then raise exception 'Unproven payment wrongly classified';end if;
 if (select conversion_status from public.owner_registration_report where email='paid@example.invalid')<>'paid_active' then raise exception 'Paid user wrongly classified';end if;
 if (select conversion_status from public.owner_registration_report where email='checkout@example.invalid')<>'incomplete_checkout' then raise exception 'Expired checkout wrongly classified';end if;
 if exists(select 1 from public.owner_registration_report where marketing_preference<>'unknown') then raise exception 'Invented marketing consent';end if;
 report:=public.owner_conversion_report('2026-10-22','2026-10-23',null,null,null,0,2);
 if (report->'summary'->>'registrations')::int<>5 or (report->'summary'->>'paid_conversions')::int<>1 or jsonb_array_length(report->'rows')<>2 then raise exception 'Wrong counts or pagination';end if;
 report:=public.owner_conversion_report(null,null,null,'unverified','unknown',0,100);
 if (report->'summary'->>'registrations')::int<>1 then raise exception 'Wrong verification/consent filters';end if;
 if has_table_privilege('authenticated','public.owner_registration_report','SELECT') or has_function_privilege('authenticated','public.owner_conversion_report(timestamptz,timestamptz,text,text,text,integer,integer)','EXECUTE') then raise exception 'Client reporting access';end if;
end $$;
rollback;
