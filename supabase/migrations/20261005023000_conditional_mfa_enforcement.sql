begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create or replace function app_private.mfa_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    (select auth.uid()) is not null
    and (
      not exists (
        select 1
        from auth.mfa_factors as factor
        where factor.user_id = (select auth.uid())
          and factor.status = 'verified'
      )
      or coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    );
$$;

revoke all on function app_private.mfa_access_allowed() from public, anon, authenticated;
grant execute on function app_private.mfa_access_allowed() to authenticated;

comment on function app_private.mfa_access_allowed() is
  'Allows authenticated access at AAL1 until the current user has a verified MFA factor, then requires AAL2.';

drop policy if exists "Require MFA when enrolled" on public.profiles;
create policy "Require MFA when enrolled"
  on public.profiles
  as restrictive
  for all
  to authenticated
  using ((select app_private.mfa_access_allowed()))
  with check ((select app_private.mfa_access_allowed()));

drop policy if exists "Require MFA when enrolled" on public.ledger_entries;
create policy "Require MFA when enrolled"
  on public.ledger_entries
  as restrictive
  for all
  to authenticated
  using ((select app_private.mfa_access_allowed()))
  with check ((select app_private.mfa_access_allowed()));

drop policy if exists "Require MFA when enrolled" on public.subscriptions;
create policy "Require MFA when enrolled"
  on public.subscriptions
  as restrictive
  for all
  to authenticated
  using ((select app_private.mfa_access_allowed()))
  with check ((select app_private.mfa_access_allowed()));

drop policy if exists "Require MFA when enrolled" on public.complimentary_access_grants;
create policy "Require MFA when enrolled"
  on public.complimentary_access_grants
  as restrictive
  for all
  to authenticated
  using ((select app_private.mfa_access_allowed()))
  with check ((select app_private.mfa_access_allowed()));

drop policy if exists "Require MFA when enrolled" on public.customer_feedback;
create policy "Require MFA when enrolled"
  on public.customer_feedback
  as restrictive
  for all
  to authenticated
  using ((select app_private.mfa_access_allowed()))
  with check ((select app_private.mfa_access_allowed()));

drop policy if exists "Require MFA when enrolled" on public.customer_feedback_history;
create policy "Require MFA when enrolled"
  on public.customer_feedback_history
  as restrictive
  for all
  to authenticated
  using ((select app_private.mfa_access_allowed()))
  with check ((select app_private.mfa_access_allowed()));

drop policy if exists "Require MFA when enrolled" on public.weight_entries;
create policy "Require MFA when enrolled"
  on public.weight_entries
  as restrictive
  for all
  to authenticated
  using ((select app_private.mfa_access_allowed()))
  with check ((select app_private.mfa_access_allowed()));

drop policy if exists "Require MFA when enrolled" on public.saved_foods;
create policy "Require MFA when enrolled"
  on public.saved_foods
  as restrictive
  for all
  to authenticated
  using ((select app_private.mfa_access_allowed()))
  with check ((select app_private.mfa_access_allowed()));

drop policy if exists "Require MFA when enrolled" on public.email_contact_preferences;
create policy "Require MFA when enrolled"
  on public.email_contact_preferences
  as restrictive
  for all
  to authenticated
  using ((select app_private.mfa_access_allowed()))
  with check ((select app_private.mfa_access_allowed()));

drop policy if exists "Require MFA when enrolled" on public.saved_recipes;
create policy "Require MFA when enrolled"
  on public.saved_recipes
  as restrictive
  for all
  to authenticated
  using ((select app_private.mfa_access_allowed()))
  with check ((select app_private.mfa_access_allowed()));

drop policy if exists "Require MFA when enrolled" on public.recipe_beta_feedback;
create policy "Require MFA when enrolled"
  on public.recipe_beta_feedback
  as restrictive
  for all
  to authenticated
  using ((select app_private.mfa_access_allowed()))
  with check ((select app_private.mfa_access_allowed()));

drop policy if exists "Require MFA for private photo buckets when enrolled" on storage.objects;
create policy "Require MFA for private photo buckets when enrolled"
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (
    bucket_id not in ('meal-photos', 'saved-food-photos')
    or (select app_private.mfa_access_allowed())
  )
  with check (
    bucket_id not in ('meal-photos', 'saved-food-photos')
    or (select app_private.mfa_access_allowed())
  );

commit;
