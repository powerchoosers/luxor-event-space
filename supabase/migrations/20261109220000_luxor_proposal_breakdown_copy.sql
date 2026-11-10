create table public.luxor_proposal_breakdown_copy_settings (
  key text primary key check (key = 'breakdown'),
  copy_override jsonb,
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.luxor_proposal_breakdown_copy_settings (key) values ('breakdown');
alter table public.luxor_proposal_breakdown_copy_settings enable row level security;
revoke all on public.luxor_proposal_breakdown_copy_settings from public, anon, authenticated;
grant select, insert, update, delete on public.luxor_proposal_breakdown_copy_settings to service_role;
