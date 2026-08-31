alter table public.luxor_portal_members
  add column if not exists recovery_email text,
  add column if not exists auth_user_id uuid,
  add column if not exists password_set_at timestamptz,
  add column if not exists password_reset_sent_at timestamptz,
  add column if not exists sessions_revoked_at timestamptz;

alter table public.luxor_portal_members
  drop constraint if exists luxor_portal_members_login_domain_check;
alter table public.luxor_portal_members
  add constraint luxor_portal_members_login_domain_check
  check (email ~ '^[a-z0-9][a-z0-9._-]*@luxoratlaspalmas\.com$');

alter table public.luxor_portal_members
  drop constraint if exists luxor_portal_members_recovery_email_check;
alter table public.luxor_portal_members
  add constraint luxor_portal_members_recovery_email_check
  check (recovery_email is null or recovery_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');

create unique index if not exists luxor_portal_members_auth_user_id_idx
  on public.luxor_portal_members(auth_user_id) where auth_user_id is not null;

alter table public.luxor_portal_invites
  add column if not exists purpose text not null default 'activation';
alter table public.luxor_portal_invites
  drop constraint if exists luxor_portal_invites_purpose_check;
alter table public.luxor_portal_invites
  add constraint luxor_portal_invites_purpose_check
  check (purpose in ('activation', 'password_reset'));

create index if not exists luxor_portal_invites_purpose_idx
  on public.luxor_portal_invites(member_id, purpose, expires_at desc)
  where used_at is null;

revoke all on public.luxor_portal_members, public.luxor_portal_invites from public, anon, authenticated;
grant select, insert, update on public.luxor_portal_members, public.luxor_portal_invites to service_role;
