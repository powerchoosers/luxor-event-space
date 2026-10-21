create table public.luxor_mail_message_stars (
  portal_email text not null,
  mail_message_id uuid not null references public.luxor_mail_messages(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint luxor_mail_message_stars_email_normalized
    check (portal_email = lower(btrim(portal_email)) and portal_email <> ''),
  primary key (portal_email, mail_message_id)
);

create index luxor_mail_message_stars_message_id_idx
  on public.luxor_mail_message_stars (mail_message_id);

alter table public.luxor_mail_message_stars enable row level security;

revoke all on table public.luxor_mail_message_stars from public, anon, authenticated, service_role;
grant select, insert, delete on table public.luxor_mail_message_stars to service_role;

create policy luxor_mail_message_stars_service_role_only
  on public.luxor_mail_message_stars
  for all
  to service_role
  using (true)
  with check (true);
