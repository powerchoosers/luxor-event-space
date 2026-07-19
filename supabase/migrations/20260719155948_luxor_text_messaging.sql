create table if not exists public.luxor_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  twilio_message_sid text not null unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null default 'received' check (status in ('accepted', 'queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'received')),
  from_number text not null,
  to_number text not null,
  body text not null default '',
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  contact_name text,
  owner_email text,
  error_code text,
  error_message text,
  media_urls jsonb not null default '[]'::jsonb,
  is_read boolean not null default false
);

create index if not exists luxor_messages_created_at_idx on public.luxor_messages (created_at desc);
create index if not exists luxor_messages_inquiry_created_idx on public.luxor_messages (inquiry_id, created_at desc);
create index if not exists luxor_messages_unread_inbound_idx on public.luxor_messages (created_at desc) where direction = 'inbound' and is_read = false;

alter table public.luxor_messages enable row level security;
revoke all on table public.luxor_messages from public, anon, authenticated;
grant all on table public.luxor_messages to service_role;

create policy "Service role can manage Luxor messages"
  on public.luxor_messages for all to service_role
  using ((select current_setting('role'::text, true)) = 'service_role'::text)
  with check ((select current_setting('role'::text, true)) = 'service_role'::text);
