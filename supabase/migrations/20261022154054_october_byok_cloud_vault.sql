-- Optional encrypted account storage; plaintext keys never enter the Data API.
create table public.byok_cloud_credentials (
 user_id uuid primary key references auth.users(id) on delete cascade,
 version integer not null check(version=1),
 provider text not null check(provider in ('openai','anthropic','gemini')),
 model text not null check(length(model) between 2 and 120),
 nonce text not null check(length(nonce)=16),
 ciphertext text not null check(length(ciphertext) between 24 and 4096),
 updated_at timestamptz not null default now()
);
alter table public.byok_cloud_credentials enable row level security;
revoke all on public.byok_cloud_credentials from anon,authenticated;
grant all on public.byok_cloud_credentials to service_role;
