create table if not exists public.customer_feedback (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_feedback enable row level security;

grant select, insert, update, delete
  on table public.customer_feedback
  to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_feedback'
      and policyname = 'customer_feedback_select_own'
  ) then
    create policy customer_feedback_select_own
      on public.customer_feedback
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_feedback'
      and policyname = 'customer_feedback_insert_own'
  ) then
    create policy customer_feedback_insert_own
      on public.customer_feedback
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_feedback'
      and policyname = 'customer_feedback_update_own'
  ) then
    create policy customer_feedback_update_own
      on public.customer_feedback
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_feedback'
      and policyname = 'customer_feedback_delete_own'
  ) then
    create policy customer_feedback_delete_own
      on public.customer_feedback
      for delete
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;
