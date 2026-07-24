create table if not exists public.luxor_user_preferences (
  email text primary key,
  theme text not null default 'light' check (theme in ('light', 'dark')),
  notification_emails text not null default 'booking@luxoratlaspalmas.com',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.luxor_user_preferences
  add column if not exists display_name text,
  add column if not exists role_title text,
  add column if not exists avatar_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'luxor_user_preferences_email_normalized') then
    alter table public.luxor_user_preferences
      add constraint luxor_user_preferences_email_normalized check (email = lower(trim(email)));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'luxor_user_preferences_display_name_length') then
    alter table public.luxor_user_preferences
      add constraint luxor_user_preferences_display_name_length check (display_name is null or char_length(display_name) between 1 and 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'luxor_user_preferences_role_title_length') then
    alter table public.luxor_user_preferences
      add constraint luxor_user_preferences_role_title_length check (role_title is null or char_length(role_title) between 1 and 120);
  end if;
end $$;

alter table public.luxor_user_preferences enable row level security;

revoke all on table public.luxor_user_preferences from anon, authenticated;

insert into public.luxor_user_preferences (
  email,
  theme,
  notification_emails,
  display_name,
  role_title
)
values (
  'booking@luxoratlaspalmas.com',
  'light',
  'booking@luxoratlaspalmas.com',
  'Arianna Patterson',
  'Owner & Managing Director'
)
on conflict (email) do update
set
  display_name = coalesce(public.luxor_user_preferences.display_name, excluded.display_name),
  role_title = coalesce(public.luxor_user_preferences.role_title, excluded.role_title),
  updated_at = timezone('utc', now());
