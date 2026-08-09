alter table public.ledger_entries enable row level security;
alter table public.profiles enable row level security;
grant select, insert, update, delete
  on table public.ledger_entries
  to authenticated;
grant select, insert, update, delete
  on table public.profiles
  to authenticated;
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own
      on public.profiles
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_insert_own'
  ) then
    create policy profiles_insert_own
      on public.profiles
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own
      on public.profiles
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ledger_entries'
      and policyname = 'ledger_entries_select_own'
  ) then
    create policy ledger_entries_select_own
      on public.ledger_entries
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ledger_entries'
      and policyname = 'ledger_entries_insert_own'
  ) then
    create policy ledger_entries_insert_own
      on public.ledger_entries
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ledger_entries'
      and policyname = 'ledger_entries_update_own'
  ) then
    create policy ledger_entries_update_own
      on public.ledger_entries
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ledger_entries'
      and policyname = 'ledger_entries_delete_own'
  ) then
    create policy ledger_entries_delete_own
      on public.ledger_entries
      for delete
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;
