create table public.luxor_elena_inbound_settings (
  id smallint primary key default 1 check (id = 1),
  voice text not null default 'brise' check (voice in ('brise', 'nira')),
  arianna_available boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.luxor_elena_inbound_settings enable row level security;
revoke all on public.luxor_elena_inbound_settings from public, anon, authenticated;
grant select, insert, update on public.luxor_elena_inbound_settings to service_role;
insert into public.luxor_elena_inbound_settings (id, voice, arianna_available) values (1, 'brise', false);
