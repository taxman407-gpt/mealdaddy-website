begin;

create table if not exists public.owner_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.owner_accounts enable row level security;

-- Browser roles cannot inspect the registry. Trusted server code may read it,
-- but the only insert path is the constrained bootstrap function below.
revoke all on table public.owner_accounts from public, anon, authenticated, service_role;
grant select on table public.owner_accounts to service_role;

comment on table public.owner_accounts is
  'Immutable registry of owner user IDs; readable only by trusted server code.';

create or replace function public.prevent_owner_account_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Owner account registrations are immutable.';
end
$$;

revoke all on function public.prevent_owner_account_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists prevent_owner_account_mutation_trigger
  on public.owner_accounts;

create trigger prevent_owner_account_mutation_trigger
before update or delete on public.owner_accounts
for each row execute function public.prevent_owner_account_mutation();

-- Serialize the empty-registry check so concurrent first-owner requests cannot
-- register different users. The Edge Function performs the live MFA and legacy
-- email checks before this service-role-only function is called.
create or replace function public.bootstrap_owner_account(requested_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if requested_user_id is null then
    return false;
  end if;

  lock table public.owner_accounts in exclusive mode;

  if exists (select 1 from public.owner_accounts) then
    return exists (
      select 1
      from public.owner_accounts as owner_account
      where owner_account.user_id = requested_user_id
    );
  end if;

  insert into public.owner_accounts (user_id)
  values (requested_user_id);

  return true;
end
$$;

revoke all on function public.bootstrap_owner_account(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.bootstrap_owner_account(uuid) to service_role;

comment on function public.bootstrap_owner_account(uuid) is
  'Atomically registers only the first owner ID; subsequent calls succeed only for that registered owner.';

notify pgrst, 'reload schema';

commit;
