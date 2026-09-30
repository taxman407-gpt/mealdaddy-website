create table if not exists public.email_contact_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  opted_in boolean not null default false,
  consent_source text not null default 'account' check (consent_source in ('account', 'signup')),
  consent_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_contact_preferences enable row level security;

create policy "Members can view their email contact preference"
on public.email_contact_preferences for select
using (auth.uid() = user_id);

create policy "Members can create their email contact preference"
on public.email_contact_preferences for insert
with check (auth.uid() = user_id);

create policy "Members can update their email contact preference"
on public.email_contact_preferences for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

comment on table public.email_contact_preferences is
  'Revocable Meal Daddy email-update preference recorded during setup or changed later from the account screen.';
