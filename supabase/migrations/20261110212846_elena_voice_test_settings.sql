-- Isolated voice selection for the approved test line, never public Elena settings.
create table public.luxor_elena_voice_test_settings (
  id smallint primary key default 1 check (id = 1),
  voice text not null default 'marin' check (voice in ('alloy','ash','ballad','beacon','bossa','brise','calandria','cedar','cinder','compas','coral','delta','destello','echo','flitz','gleam','halo','harema','hornero','juni','luciernaga','marin','meridian','nira','noeul','nuri','pearl','quartz','ripple','sage','shida','shimmer','sillage','stone','tempo','verse','vesper','willow')),
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.luxor_elena_voice_test_settings enable row level security;
revoke all on public.luxor_elena_voice_test_settings from public, anon, authenticated;
grant select, insert, update on public.luxor_elena_voice_test_settings to service_role;
insert into public.luxor_elena_voice_test_settings (id, voice) values (1, 'marin');
