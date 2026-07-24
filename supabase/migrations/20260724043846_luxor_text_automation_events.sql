create table if not exists public.luxor_text_automation_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  automation_type text not null check (automation_type in ('missed_call', 'inbound_acknowledgment')),
  source_id text not null,
  recipient_number text not null check (recipient_number ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  twilio_message_sid text,
  error_message text,
  unique (automation_type, source_id)
);

create index if not exists luxor_text_automation_events_recent_idx
  on public.luxor_text_automation_events (recipient_number, automation_type, status, created_at desc);

alter table public.luxor_text_automation_events enable row level security;
revoke all on table public.luxor_text_automation_events from public, anon, authenticated;
grant all on table public.luxor_text_automation_events to service_role;

drop policy if exists "Service role can manage Luxor text automation events"
  on public.luxor_text_automation_events;
create policy "Service role can manage Luxor text automation events"
  on public.luxor_text_automation_events for all to service_role
  using ((select current_setting('role'::text, true)) = 'service_role'::text)
  with check ((select current_setting('role'::text, true)) = 'service_role'::text);

notify pgrst, 'reload schema';
