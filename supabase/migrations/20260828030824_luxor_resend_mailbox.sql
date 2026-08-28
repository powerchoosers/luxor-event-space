-- Provider-neutral, durable mailbox. Portal routes authorize access; browsers
-- never access these tables or the attachment bucket directly.
create table public.luxor_mail_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('resend', 'zoho')),
  provider_id text,
  direction text not null check (direction in ('incoming', 'outgoing')),
  internet_message_id text,
  thread_key text not null,
  from_address text not null,
  to_addresses text[] not null,
  cc_addresses text[] not null default '{}',
  reply_to_addresses text[] not null default '{}',
  reference_ids text[] not null default '{}',
  subject text not null,
  text_body text not null default '',
  html_body text,
  status text not null default 'received',
  idempotency_key text unique,
  payload_hash text,
  created_at timestamptz not null default now(),
  occurred_at timestamptz not null default now(),
  attempted_at timestamptz,
  accepted_at timestamptz,
  read_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}',
  unique(provider, provider_id)
);
create index luxor_mail_messages_date_idx on public.luxor_mail_messages(occurred_at desc);
create index luxor_mail_messages_thread_idx on public.luxor_mail_messages(thread_key, occurred_at);
create index luxor_mail_messages_internet_id_idx on public.luxor_mail_messages(internet_message_id);
create index luxor_mail_messages_to_idx on public.luxor_mail_messages using gin(to_addresses);
create index luxor_mail_messages_from_idx on public.luxor_mail_messages(from_address);

create table public.luxor_mail_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.luxor_mail_messages(id),
  source_key text not null,
  filename text not null,
  content_type text not null,
  content_id text,
  size_bytes bigint not null check (size_bytes >= 0),
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique(message_id, source_key)
);

-- Acknowledging a webhook only after this durable insert allows safe retries.
create table public.luxor_resend_events (
  event_id text primary key,
  event_type text not null,
  provider_email_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  lease_until timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text
);
create index luxor_resend_events_pending_idx on public.luxor_resend_events(next_attempt_at)
  where processed_at is null;

alter table public.luxor_mail_messages enable row level security;
alter table public.luxor_mail_attachments enable row level security;
alter table public.luxor_resend_events enable row level security;
revoke all on public.luxor_mail_messages, public.luxor_mail_attachments, public.luxor_resend_events from public, anon, authenticated;
grant select, insert, update, delete on public.luxor_mail_messages, public.luxor_mail_attachments, public.luxor_resend_events to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('luxor-mail', 'luxor-mail', false, 41943040)
on conflict (id) do nothing;
