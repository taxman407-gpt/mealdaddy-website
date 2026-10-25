-- Owner-only template management. Does not enable delivery or alter queued payloads.
create table public.welcome_email_templates (
 channel text primary key check(channel in ('live','beta')),
 revision integer not null default 1,
 draft_subject text not null check(length(btrim(draft_subject)) between 1 and 160 and draft_subject !~ E'[\r\n]'),
 draft_body text not null check(length(btrim(draft_body)) between 1 and 10000 and position('{{signInUrl}}' in draft_body)>0),
 active_subject text not null,
 active_body text not null,
 active_version integer not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid
);
create table public.welcome_template_history (
 channel text not null, revision integer not null, action text not null,
 subject text not null, body text not null, owner_id uuid not null,
 created_at timestamptz not null default now(), primary key(channel,revision)
);
alter table public.welcome_email_templates enable row level security;
alter table public.welcome_template_history enable row level security;
revoke all on public.welcome_email_templates,public.welcome_template_history from public,anon,authenticated;
grant all on public.welcome_email_templates,public.welcome_template_history to service_role;
insert into public.welcome_email_templates(channel,draft_subject,draft_body,active_subject,active_body)
select channel,subject,body,subject,body from (values ('live'),('beta')) channels(channel)
cross join (values ($subject$Welcome to MealDaddy™ — Let's Get Started!$subject$,$body$Welcome to MealDaddy! We're glad you're here.

Complete your profile, log your first meal (description or photo), explore your nutrition and hydration dashboard, and save favorite foods.

Sign in: {{signInUrl}}

MealDaddy Team.
General wellness guidance; not medical advice.$body$)) defaults(subject,body);
create function public.edit_welcome_template(requested_channel text,requested_action text,expected_revision integer,requested_subject text,requested_body text,requested_owner uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare current_template public.welcome_email_templates%rowtype;
begin
 if requested_action not in ('save_draft','publish') or requested_owner is null then raise exception 'Invalid template action';end if;
 select * into current_template from public.welcome_email_templates where channel=requested_channel for update;
 if not found or current_template.revision<>expected_revision then return null;end if;
 if requested_action='save_draft' then
  update public.welcome_email_templates set draft_subject=requested_subject,draft_body=requested_body,revision=revision+1,updated_at=now(),updated_by=requested_owner where channel=requested_channel returning * into current_template;
 else
  if requested_subject<>current_template.draft_subject or requested_body<>current_template.draft_body then return null;end if;
  update public.welcome_email_templates set active_subject=draft_subject,active_body=draft_body,active_version=active_version+1,revision=revision+1,updated_at=now(),updated_by=requested_owner where channel=requested_channel returning * into current_template;
 end if;
 insert into public.welcome_template_history(channel,revision,action,subject,body,owner_id) values(requested_channel,current_template.revision,requested_action,current_template.draft_subject,current_template.draft_body,requested_owner);
 return to_jsonb(current_template);
end $$;
revoke all on function public.edit_welcome_template(text,text,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.edit_welcome_template(text,text,integer,text,text,uuid) to service_role;
alter table public.welcome_email_deliveries add column template_snapshot jsonb;
create or replace function public.enqueue_verified_welcome() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare settings public.welcome_email_settings%rowtype; template public.welcome_email_templates%rowtype;
begin
 if new.email_confirmed_at is null or new.email is null then return new;end if;
 if tg_op='UPDATE' and old.email_confirmed_at is not null then return new;end if;
 select * into settings from public.welcome_email_settings where id;
 if not settings.enabled or settings.started_at is null or new.created_at<settings.started_at then return new;end if;
 select * into template from public.welcome_email_templates where channel='live';
 insert into public.welcome_email_deliveries(user_id,event_id,verified_at,template_version,template_snapshot)
 values(new.id,'verified:'||new.id::text,new.email_confirmed_at,'welcome-'||template.active_version::text,jsonb_build_object('subject',template.active_subject,'body',template.active_body)) on conflict(user_id) do nothing;
 return new;
end $$;
revoke all on function public.enqueue_verified_welcome() from public,anon,authenticated,service_role;
