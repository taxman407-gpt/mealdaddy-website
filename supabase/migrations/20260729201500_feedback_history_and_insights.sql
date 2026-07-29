create table if not exists public.customer_feedback_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 2000),
  public_display_consent boolean not null default false,
  source_created_at timestamptz not null,
  source_updated_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (user_id, source_updated_at)
);

create index if not exists customer_feedback_history_user_time_idx
  on public.customer_feedback_history (user_id, source_updated_at desc);

create index if not exists customer_feedback_history_time_idx
  on public.customer_feedback_history (source_updated_at desc);

alter table public.customer_feedback_history enable row level security;

revoke all on table public.customer_feedback_history from anon, authenticated;
grant select on table public.customer_feedback_history to authenticated;

do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'customer_feedback_history'
       and policyname = 'customer_feedback_history_select_own'
  ) then
    create policy customer_feedback_history_select_own
      on public.customer_feedback_history
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;

create or replace function public.capture_customer_feedback_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.rating is not distinct from old.rating
     and new.comment is not distinct from old.comment
     and new.public_display_consent is not distinct from old.public_display_consent then
    return new;
  end if;

  insert into public.customer_feedback_history (
    user_id,
    rating,
    comment,
    public_display_consent,
    source_created_at,
    source_updated_at
  )
  values (
    new.user_id,
    new.rating,
    new.comment,
    new.public_display_consent,
    new.created_at,
    new.updated_at
  )
  on conflict (user_id, source_updated_at) do nothing;

  return new;
end
$$;

revoke all on function public.capture_customer_feedback_history() from public;

drop trigger if exists capture_customer_feedback_history_trigger
  on public.customer_feedback;

create trigger capture_customer_feedback_history_trigger
after insert or update on public.customer_feedback
for each row execute function public.capture_customer_feedback_history();

insert into public.customer_feedback_history (
  user_id,
  rating,
  comment,
  public_display_consent,
  source_created_at,
  source_updated_at
)
select
  user_id,
  rating,
  comment,
  public_display_consent,
  created_at,
  updated_at
from public.customer_feedback
on conflict (user_id, source_updated_at) do nothing;

create table if not exists public.feedback_summary_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  model text not null,
  feedback_count integer not null check (feedback_count >= 0),
  customer_count integer not null check (customer_count >= 0),
  latest_feedback_at timestamptz,
  indicators jsonb not null,
  summary jsonb not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now()
);

create index if not exists feedback_summary_runs_created_at_idx
  on public.feedback_summary_runs (created_at desc);

alter table public.feedback_summary_runs enable row level security;

revoke all on table public.feedback_summary_runs from anon, authenticated;

comment on table public.customer_feedback_history is
  'Append-only snapshots used to understand how customer ratings and comments change over time.';

comment on table public.feedback_summary_runs is
  'Private, service-role-only AI summaries and exact aggregate indicators for authorized Meal Daddy administrators.';
