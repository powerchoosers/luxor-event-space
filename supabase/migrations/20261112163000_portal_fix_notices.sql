-- One active portal fix notice. The banner title is the short line. The window reads the same row.
create table public.luxor_portal_fix_notices (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default false,
  banner_label text not null check (char_length(banner_label) between 1 and 80 and banner_label = btrim(banner_label)),
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  summary jsonb not null,
  fixed_text text not null check (char_length(fixed_text) between 1 and 500 and fixed_text = btrim(fixed_text)),
  unchanged_text text not null check (char_length(unchanged_text) between 1 and 500 and unchanged_text = btrim(unchanged_text)),
  steps jsonb not null,
  if_stuck text not null check (char_length(if_stuck) between 1 and 500 and if_stuck = btrim(if_stuck)),
  commit_sha text check (commit_sha is null or (char_length(commit_sha) between 7 and 64 and commit_sha = btrim(commit_sha))),
  created_at timestamptz not null default now(),
  constraint luxor_portal_fix_notices_summary_check check (jsonb_typeof(summary) = 'array' and jsonb_array_length(summary) between 1 and 8),
  constraint luxor_portal_fix_notices_steps_check check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 12)
);

create function public.luxor_portal_fix_notices_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item text;
  step jsonb;
begin
  for item in select jsonb_array_elements_text(new.summary) loop
    if item is null or char_length(btrim(item)) < 1 or char_length(item) > 800 or item <> btrim(item) then
      raise exception 'Invalid fix notice summary' using errcode = '23514';
    end if;
  end loop;
  for step in select jsonb_array_elements(new.steps) loop
    if jsonb_typeof(step) <> 'object'
      or not (step ? 'title' and step ? 'text')
      or jsonb_typeof(step->'title') <> 'string'
      or jsonb_typeof(step->'text') <> 'string'
      or char_length(btrim(step->>'title')) not between 1 and 120
      or (step->>'title') <> btrim(step->>'title')
      or char_length(btrim(step->>'text')) not between 1 and 400
      or (step->>'text') <> btrim(step->>'text') then
      raise exception 'Invalid fix notice steps' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

create trigger luxor_portal_fix_notices_validate
  before insert or update on public.luxor_portal_fix_notices
  for each row execute function public.luxor_portal_fix_notices_validate();

create unique index luxor_portal_fix_notices_one_active
  on public.luxor_portal_fix_notices (is_active)
  where is_active;

alter table public.luxor_portal_fix_notices enable row level security;
revoke all on public.luxor_portal_fix_notices from public, anon, authenticated;
grant select, insert, update on public.luxor_portal_fix_notices to service_role;
revoke all on function public.luxor_portal_fix_notices_validate() from public, anon, authenticated;
