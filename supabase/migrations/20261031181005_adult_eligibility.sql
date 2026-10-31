-- Explicit adult self-attestation, not identity or age verification; no DOB collected.
create table public.adult_eligibility (
 user_id uuid primary key references auth.users(id) on delete cascade,
 confirmed_adult boolean not null check(confirmed_adult),
 policy_version integer not null default 1 check(policy_version=1),
 confirmed_at timestamptz not null default now()
);
alter table public.adult_eligibility enable row level security;
revoke all on public.adult_eligibility from anon,authenticated;
grant select,insert on public.adult_eligibility to authenticated;
grant all on public.adult_eligibility to service_role;
create policy adult_eligibility_read on public.adult_eligibility for select to authenticated
using(user_id=(select auth.uid()) and (select app_private.mfa_access_allowed()));
create policy adult_eligibility_confirm on public.adult_eligibility for insert to authenticated
with check(user_id=(select auth.uid()) and confirmed_adult and policy_version=1 and (select app_private.mfa_access_allowed()));
