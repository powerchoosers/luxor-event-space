-- System message copy is independent of delivery controls and queued snapshots.
create table if not exists public.luxor_system_message_templates (
  message_key text primary key,
  body_template text not null check (char_length(btrim(body_template)) between 1 and 300),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.luxor_system_message_templates (message_key, body_template)
values ('inquiry_confirmation', 'Hi {{first_name}}, we received your {{event_type}} inquiry and will follow up with availability and next steps.')
on conflict (message_key) do nothing;

alter table public.luxor_system_message_templates enable row level security;
revoke all on public.luxor_system_message_templates from public, anon, authenticated;
grant select, insert, update, delete on public.luxor_system_message_templates to service_role;
