\set ON_ERROR_STOP on
-- Run ONLY in the disposable CI PostgreSQL service, never in a customer database.
create role authenticated nologin;
create role anon nologin;
create table public.ledger_entries (
  id text primary key,
  user_id text not null,
  description text not null,
  kind text not null,
  status text not null,
  nutrition_estimate jsonb
);
alter table public.ledger_entries enable row level security;
grant usage on schema public to authenticated;
grant select, insert, update on public.ledger_entries to authenticated;
create policy self_only on public.ledger_entries to authenticated
  using (user_id = current_setting('test.user_id', true))
  with check (user_id = current_setting('test.user_id', true));
\ir ../../supabase/patches/meal_edit_replacement.sql
insert into public.ledger_entries values
 ('own', 'member-a', 'Full salad with dressing and extra greens', 'meal', 'estimated', '{"calories":900,"components":[{"name":"old dressing","calories":200}]}'),
 ('other', 'member-b', 'Other member meal', 'meal', 'estimated', '{"calories":100}');
set role authenticated;
set test.user_id = 'member-a';
update public.ledger_entries
set description = '50% salad with chicken, no dressing', status = 'pending_estimate',
 nutrition_estimate = '{"calories":900,"components":[{"name":"old dressing"}],"photo_path":"member-a/old.jpg","favorite_origin":{"id":"favorite-1"}}'
where id = 'own';
do $$ declare n jsonb; begin
 select nutrition_estimate into n from public.ledger_entries where id='own';
 if n ? 'calories' or n ? 'components' then raise exception 'Old calculation survived edit'; end if;
 if n ->> 'input_authority' <> 'edited_text' then raise exception 'Edited description is not authoritative'; end if;
 if coalesce(n ->> 'edit_revision', '') = '' then raise exception 'Edit revision missing'; end if;
 if n ->> 'photo_path' <> 'member-a/old.jpg' then raise exception 'Reference path lost'; end if;
 if n #>> '{favorite_origin,id}' <> 'favorite-1' then raise exception 'Favorite origin lost'; end if;
 if (select count(*) from public.ledger_entries) <> 1 then raise exception 'Account isolation failed'; end if;
end $$;
update public.ledger_entries set description='Attack', status='pending_estimate' where id='other';
reset role;
do $$ begin
 if (select description from public.ledger_entries where id='other') <> 'Other member meal' then raise exception 'Other account modified'; end if;
 if (select count(*) from public.ledger_entries) <> 2 then raise exception 'Edit duplicated or deleted an entry'; end if;
end $$;
-- An older snapshot must not match the edited version.
with attempted as (
 update public.ledger_entries set nutrition_estimate='{"calories":900}', status='estimated'
 where id='own' and description='Full salad with dressing and extra greens'
 returning id
) select case when count(*)=0 then 'Older snapshot correctly rejected' else 'ERROR' end from attempted;
-- A trusted server response may populate the current revision without erasing it.
update public.ledger_entries set nutrition_estimate=nutrition_estimate || '{"calories":200,"components":[{"name":"new salad"}]}', status='estimated' where id='own';
set role authenticated;
-- Reviewed saved-food values are intentional; do not replace them with AI.
update public.ledger_entries set description='Reviewed favorite', nutrition_estimate='{"calories":123,"source":"saved_food"}', status='estimated' where id='own';
do $$ begin
 if (select nutrition_estimate ->> 'calories' from public.ledger_entries where id='own') <> '123' then raise exception 'Reviewed values replaced'; end if;
end $$;
-- A drink edit retains fluid ounces but drops the former meal and its photo.
update public.ledger_entries set description='Coffee with cream, 12 oz', kind='hydration', status='pending_estimate', nutrition_estimate='{"ounces":12,"calories":999,"components":[{"name":"old meal"}],"photo_path":"member-a/old.jpg"}' where id='own';
do $$ declare n jsonb; begin
 select nutrition_estimate into n from public.ledger_entries where id='own';
 if n ->> 'ounces' <> '12' or n ? 'calories' or n ? 'components' or n ? 'photo_path' then raise exception 'Drink reset failed'; end if;
end $$;
reset role;
select 'Database replacement, source preservation, no duplicates, and RLS isolation checks passed.' as result;
