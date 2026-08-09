create table if not exists public.complimentary_access_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_type text not null default 'family' check (access_type in ('family')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.complimentary_access_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('granted', 'revoked')),
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists complimentary_access_events_user_created_idx
  on public.complimentary_access_events (user_id, created_at desc);
alter table public.complimentary_access_grants enable row level security;
alter table public.complimentary_access_events enable row level security;
drop policy if exists "complimentary_grants_readable_by_user"
  on public.complimentary_access_grants;
create policy "complimentary_grants_readable_by_user"
  on public.complimentary_access_grants for select
  using (auth.uid() = user_id);
revoke all on table public.complimentary_access_grants from anon, authenticated;
revoke all on table public.complimentary_access_events from anon, authenticated;
grant select on table public.complimentary_access_grants to authenticated;
grant select, insert, update, delete on table public.complimentary_access_grants to service_role;
grant select, insert, update, delete on table public.complimentary_access_events to service_role;
grant usage, select on sequence public.complimentary_access_events_id_seq to service_role;
create or replace function public.set_complimentary_family_access(
  requested_user_id uuid,
  requested_action text,
  requested_by uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  if requested_action not in ('grant', 'revoke') then
    raise exception 'Unknown complimentary access action';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('complimentary-family:' || requested_user_id::text, 0));

  if requested_action = 'grant' then
    if exists (
      select 1
        from public.subscriptions
       where user_id = requested_user_id
         and status in ('trialing', 'active', 'past_due', 'unpaid')
    ) then
      raise exception 'A current Stripe membership already exists';
    end if;

    insert into public.complimentary_access_grants (
      user_id,
      access_type,
      status,
      granted_by,
      granted_at,
      revoked_at,
      updated_at
    )
    values (
      requested_user_id,
      'family',
      'active',
      requested_by,
      now(),
      null,
      now()
    )
    on conflict (user_id) do update
      set access_type = 'family',
          status = 'active',
          granted_by = excluded.granted_by,
          granted_at = now(),
          revoked_at = null,
          updated_at = now();

    insert into public.complimentary_access_events (user_id, action, performed_by)
    values (requested_user_id, 'granted', requested_by);
    return 'active';
  end if;

  select status into current_status
    from public.complimentary_access_grants
   where user_id = requested_user_id
   for update;
  if current_status is distinct from 'active' then
    raise exception 'Complimentary family access is not active';
  end if;

  update public.complimentary_access_grants
     set status = 'revoked',
         revoked_at = now(),
         updated_at = now()
   where user_id = requested_user_id;

  insert into public.complimentary_access_events (user_id, action, performed_by)
  values (requested_user_id, 'revoked', requested_by);
  return 'revoked';
end;
$$;
revoke all on function public.set_complimentary_family_access(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.set_complimentary_family_access(uuid, text, uuid)
  to service_role;
