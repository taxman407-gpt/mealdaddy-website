-- Keep temporary meal-analysis photos private and scoped to the authenticated
-- user's first path segment. This mirrors the client and Edge Function limits.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos',
  'meal-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own meal photos" on storage.objects;
create policy "Users can read their own meal photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload their own meal photos" on storage.objects;
create policy "Users can upload their own meal photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update their own meal photos" on storage.objects;
create policy "Users can update their own meal photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own meal photos" on storage.objects;
create policy "Users can delete their own meal photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Canonicalize existing verified addresses without discarding preferences.
update public.email_contact_preferences as preference
set email = lower(btrim(auth_user.email))
from auth.users as auth_user
where auth_user.id = preference.user_id
  and auth_user.email_confirmed_at is not null
  and auth_user.email is not null
  and char_length(btrim(auth_user.email)) between 3 and 320
  and preference.email is distinct from lower(btrim(auth_user.email));

-- An existing row without a verified account email remains available to its
-- owner, but cannot remain opted in until a verified address is supplied.
update public.email_contact_preferences as preference
set opted_in = false,
    consent_updated_at = clock_timestamp(),
    updated_at = clock_timestamp()
where preference.opted_in
  and not exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = preference.user_id
      and auth_user.email_confirmed_at is not null
      and auth_user.email is not null
      and char_length(btrim(auth_user.email)) between 3 and 320
  );

create or replace function public.enforce_verified_contact_email()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  verified_email text;
  requester_id uuid;
  supplied_email text;
begin
  requester_id := auth.uid();

  if requester_id is not null and requester_id is distinct from new.user_id then
    raise exception using
      errcode = '23514',
      message = 'Email contact preferences require the verified account email.';
  end if;

  select lower(btrim(auth_user.email))
    into verified_email
  from auth.users as auth_user
  where auth_user.id = new.user_id
    and auth_user.email_confirmed_at is not null
    and auth_user.email is not null
    and char_length(btrim(auth_user.email)) between 3 and 320;

  supplied_email := lower(btrim(new.email));

  if verified_email is null or supplied_email is distinct from verified_email then
    raise exception using
      errcode = '23514',
      message = 'Email contact preferences require the verified account email.';
  end if;

  new.email := verified_email;
  return new;
end
$$;

revoke all on function public.enforce_verified_contact_email() from public, anon, authenticated;

drop trigger if exists enforce_verified_contact_email_trigger
  on public.email_contact_preferences;

create trigger enforce_verified_contact_email_trigger
before insert or update on public.email_contact_preferences
for each row execute function public.enforce_verified_contact_email();

comment on function public.enforce_verified_contact_email() is
  'Allows contact preferences only for the canonical, verified email on the referenced auth user.';

-- Clients may supply these fields for backward compatibility, but the database
-- is authoritative for feedback and consent timestamps.
create or replace function public.set_customer_feedback_server_timestamps()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  server_time timestamptz := clock_timestamp();
begin
  if tg_op = 'INSERT' then
    new.created_at := server_time;
    new.updated_at := server_time;
    new.public_consent_updated_at := case
      when new.public_display_consent then server_time
      else null
    end;
    return new;
  end if;

  new.created_at := old.created_at;
  new.updated_at := server_time;

  if new.public_display_consent is distinct from old.public_display_consent then
    new.public_consent_updated_at := case
      when new.public_display_consent then server_time
      else null
    end;
  elsif new.public_display_consent then
    new.public_consent_updated_at := coalesce(old.public_consent_updated_at, server_time);
  else
    new.public_consent_updated_at := null;
  end if;

  return new;
end
$$;

revoke all on function public.set_customer_feedback_server_timestamps() from public, anon, authenticated;

drop trigger if exists set_customer_feedback_server_timestamps_trigger
  on public.customer_feedback;

create trigger set_customer_feedback_server_timestamps_trigger
before insert or update on public.customer_feedback
for each row execute function public.set_customer_feedback_server_timestamps();

-- Capture history with a fresh database timestamp instead of trusting the
-- source row's former client-controlled updated_at. Retry at microsecond
-- increments rather than silently dropping a snapshot on a timestamp collision.
create or replace function public.capture_customer_feedback_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  captured_at timestamptz;
begin
  if tg_op = 'UPDATE'
     and new.rating is not distinct from old.rating
     and new.comment is not distinct from old.comment
     and new.public_display_consent is not distinct from old.public_display_consent then
    return new;
  end if;

  captured_at := clock_timestamp();

  loop
    begin
      insert into public.customer_feedback_history (
        user_id,
        rating,
        comment,
        public_display_consent,
        source_created_at,
        source_updated_at,
        recorded_at
      )
      values (
        new.user_id,
        new.rating,
        new.comment,
        new.public_display_consent,
        new.created_at,
        captured_at,
        captured_at
      );
      exit;
    exception
      when unique_violation then
        captured_at := captured_at + interval '1 microsecond';
    end;
  end loop;

  return new;
end
$$;

revoke all on function public.capture_customer_feedback_history() from public, anon, authenticated;

drop trigger if exists capture_customer_feedback_history_trigger
  on public.customer_feedback;

create trigger capture_customer_feedback_history_trigger
after insert or update on public.customer_feedback
for each row execute function public.capture_customer_feedback_history();

-- Preserve existing feedback while removing any cross-user recipe association.
update public.recipe_beta_feedback as feedback
set saved_recipe_id = null
where feedback.saved_recipe_id is not null
  and not exists (
    select 1
    from public.saved_recipes as recipe
    where recipe.id = feedback.saved_recipe_id
      and recipe.user_id = feedback.user_id
  );

create unique index if not exists saved_recipes_id_user_id_idx
  on public.saved_recipes (id, user_id);

alter table public.recipe_beta_feedback
  drop constraint if exists recipe_beta_feedback_saved_recipe_id_fkey;

alter table public.recipe_beta_feedback
  drop constraint if exists recipe_beta_feedback_saved_recipe_owner_fkey;

alter table public.recipe_beta_feedback
  add constraint recipe_beta_feedback_saved_recipe_owner_fkey
  foreign key (saved_recipe_id, user_id)
  references public.saved_recipes (id, user_id)
  on delete cascade;

drop policy if exists "Users add their own recipe feedback"
  on public.recipe_beta_feedback;

create policy "Users add their own recipe feedback"
  on public.recipe_beta_feedback for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      saved_recipe_id is null
      or exists (
        select 1
        from public.saved_recipes as recipe
        where recipe.id = recipe_beta_feedback.saved_recipe_id
          and recipe.user_id = recipe_beta_feedback.user_id
          and recipe.user_id = (select auth.uid())
      )
    )
  );

comment on constraint recipe_beta_feedback_saved_recipe_owner_fkey
  on public.recipe_beta_feedback is
  'A feedback row may reference only a saved recipe owned by the same user.';

notify pgrst, 'reload schema';
