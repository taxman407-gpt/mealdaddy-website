-- Make Stripe webhook delivery idempotent without treating a merely received
-- event as successfully processed. Existing rows represent completed events.
alter table public.stripe_webhook_events
  alter column processed_at drop not null,
  alter column processed_at drop default;

alter table public.stripe_webhook_events
  add column if not exists status text,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now();

update public.stripe_webhook_events
set status = case when processed_at is not null then 'processed' else 'failed' end,
    updated_at = coalesce(processed_at, updated_at, now())
where status is null;

alter table public.stripe_webhook_events
  alter column status set default 'processing',
  alter column status set not null;

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_status_check,
  drop constraint if exists stripe_webhook_events_attempt_count_check,
  drop constraint if exists stripe_webhook_events_event_id_length_check,
  drop constraint if exists stripe_webhook_events_event_type_length_check,
  drop constraint if exists stripe_webhook_events_state_coherence_check;

alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_status_check
    check (status in ('processing', 'processed', 'failed')),
  add constraint stripe_webhook_events_attempt_count_check
    check (attempt_count between 1 and 1000),
  add constraint stripe_webhook_events_event_id_length_check
    check (char_length(event_id) between 5 and 255),
  add constraint stripe_webhook_events_event_type_length_check
    check (char_length(event_type) between 1 and 255),
  add constraint stripe_webhook_events_state_coherence_check
    check (
      (status = 'processing' and claimed_at is not null and claim_token is not null and processed_at is null)
      or (status = 'processed' and claimed_at is null and claim_token is null and processed_at is not null)
      or (status = 'failed' and claimed_at is null and claim_token is null and processed_at is null)
    );

create index if not exists stripe_webhook_events_status_updated_idx
  on public.stripe_webhook_events (status, updated_at);

create or replace function public.claim_stripe_webhook_event(
  requested_event_id text,
  requested_event_type text
)
returns table(claim_status text, attempt_count integer, claim_token uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_event public.stripe_webhook_events%rowtype;
  next_attempt integer;
  next_claim_token uuid;
begin
  if requested_event_id is null
    or requested_event_id !~ '^evt_[A-Za-z0-9_]+$'
    or char_length(requested_event_id) > 255
    or requested_event_type is null
    or char_length(requested_event_type) not between 1 and 255 then
    raise exception 'INVALID_STRIPE_EVENT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(requested_event_id, 731945));
  select * into current_event
  from public.stripe_webhook_events
  where event_id = requested_event_id
  for update;

  if not found then
    next_claim_token := gen_random_uuid();
    insert into public.stripe_webhook_events (
      event_id, event_type, status, attempt_count, claimed_at, claim_token,
      processed_at, last_error, updated_at
    ) values (
      requested_event_id, requested_event_type, 'processing', 1, now(), next_claim_token,
      null, null, now()
    );
    return query select 'claimed'::text, 1, next_claim_token;
    return;
  end if;

  if current_event.event_type <> requested_event_type then
    raise exception 'STRIPE_EVENT_TYPE_MISMATCH';
  end if;

  if current_event.status = 'processed' then
    return query select 'processed'::text, current_event.attempt_count, null::uuid;
    return;
  end if;

  -- A second delivery must not execute concurrently. A processing claim may be
  -- recovered after ten minutes if a worker terminated without marking failure.
  if current_event.status = 'processing'
    and coalesce(current_event.claimed_at, current_event.updated_at) > now() - interval '10 minutes' then
    return query select 'in_progress'::text, current_event.attempt_count, null::uuid;
    return;
  end if;

  next_attempt := current_event.attempt_count + 1;
  next_claim_token := gen_random_uuid();
  update public.stripe_webhook_events
  set status = 'processing',
      attempt_count = next_attempt,
      claimed_at = now(),
      claim_token = next_claim_token,
      processed_at = null,
      last_error = null,
      updated_at = now()
  where event_id = requested_event_id;

  return query select 'claimed'::text, next_attempt, next_claim_token;
end;
$$;

create or replace function public.complete_stripe_webhook_event(
  requested_event_id text,
  requested_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.stripe_webhook_events
  set status = 'processed',
      processed_at = now(),
      claimed_at = null,
      claim_token = null,
      last_error = null,
      updated_at = now()
  where event_id = requested_event_id
    and status = 'processing'
    and claim_token = requested_claim_token;
  return found;
end;
$$;

create or replace function public.fail_stripe_webhook_event(
  requested_event_id text,
  requested_claim_token uuid,
  requested_error text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.stripe_webhook_events
  set status = 'failed',
      claimed_at = null,
      claim_token = null,
      last_error = left(coalesce(requested_error, 'Webhook processing failed'), 1000),
      updated_at = now()
  where event_id = requested_event_id
    and status = 'processing'
    and claim_token = requested_claim_token;
  return found;
end;
$$;

revoke all on public.stripe_webhook_events from public, anon, authenticated;
revoke insert, update, delete on public.stripe_webhook_events from service_role;
grant select on public.stripe_webhook_events to service_role;

revoke all on function public.claim_stripe_webhook_event(text, text) from public, anon, authenticated;
revoke all on function public.complete_stripe_webhook_event(text, uuid) from public, anon, authenticated;
revoke all on function public.fail_stripe_webhook_event(text, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event(text, text) to service_role;
grant execute on function public.complete_stripe_webhook_event(text, uuid) to service_role;
grant execute on function public.fail_stripe_webhook_event(text, uuid, text) to service_role;

comment on table public.stripe_webhook_events is
  'Private Stripe delivery ledger. Only processed means all event effects completed successfully.';
