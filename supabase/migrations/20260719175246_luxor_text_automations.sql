alter table public.luxor_phone_routing_settings
  add column if not exists missed_call_text_enabled boolean not null default false,
  add column if not exists missed_call_text_body text not null default 'Luxor Event Space: Sorry we missed your call. Reply with your name, event date, and event type, and we will get back to you. Reply STOP to opt out.',
  add column if not exists inbound_text_reply_enabled boolean not null default false,
  add column if not exists inbound_text_reply_body text not null default 'Luxor Event Space: Thanks for your message. We received it and will respond as soon as possible. Reply STOP to opt out.',
  add column if not exists inbound_text_reply_cooldown_hours integer not null default 12 check (inbound_text_reply_cooldown_hours between 1 and 168),
  add constraint luxor_phone_routing_missed_text_length check (char_length(missed_call_text_body) between 1 and 480),
  add constraint luxor_phone_routing_reply_text_length check (char_length(inbound_text_reply_body) between 1 and 480);

create table if not exists public.luxor_sms_consents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  phone_number text not null unique check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'unknown' check (status in ('unknown', 'opted_in', 'opted_out')),
  source text,
  opted_in_at timestamptz,
  opted_out_at timestamptz
);

create table if not exists public.luxor_text_automation_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  automation_type text not null check (automation_type in ('missed_call', 'inbound_acknowledgment')),
  source_id text not null,
  recipient_number text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  twilio_message_sid text,
  error_message text,
  unique (automation_type, source_id)
);

create index if not exists luxor_sms_consents_status_idx on public.luxor_sms_consents (status, updated_at desc);
create index if not exists luxor_text_automation_events_recipient_idx on public.luxor_text_automation_events (recipient_number, created_at desc);

alter table public.luxor_sms_consents enable row level security;
alter table public.luxor_text_automation_events enable row level security;
revoke all on table public.luxor_sms_consents from public, anon, authenticated;
revoke all on table public.luxor_text_automation_events from public, anon, authenticated;
grant all on table public.luxor_sms_consents to service_role;
grant all on table public.luxor_text_automation_events to service_role;

create policy "Service role can manage Luxor SMS consent"
  on public.luxor_sms_consents for all to service_role
  using ((select current_setting('role'::text, true)) = 'service_role'::text)
  with check ((select current_setting('role'::text, true)) = 'service_role'::text);

create policy "Service role can manage Luxor text automation events"
  on public.luxor_text_automation_events for all to service_role
  using ((select current_setting('role'::text, true)) = 'service_role'::text)
  with check ((select current_setting('role'::text, true)) = 'service_role'::text);
