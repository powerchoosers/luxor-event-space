create table if not exists public.luxor_zoho_webhook_config (
  provider text primary key,
  secret_ciphertext text not null,
  initialized_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint luxor_zoho_webhook_config_provider_check check (provider = 'mail')
);

create table if not exists public.luxor_email_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  message_id text,
  sender_email text,
  sender_name text,
  recipient_email text,
  subject text not null default '(No subject)',
  received_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists luxor_email_events_received_at_idx
  on public.luxor_email_events (received_at desc);

alter table public.luxor_zoho_webhook_config enable row level security;
alter table public.luxor_email_events enable row level security;

revoke all on table public.luxor_zoho_webhook_config from anon, authenticated;
revoke all on table public.luxor_email_events from anon, authenticated;

grant select, insert, update, delete on table public.luxor_zoho_webhook_config to service_role;
grant select, insert, update, delete on table public.luxor_email_events to service_role;
