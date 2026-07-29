-- Saved marketing lists are first-class records. The previous implementation
-- used luxor_marketing_list.source as both the acquisition source and the list
-- name, which made campaign audiences ambiguous.
create table if not exists public.luxor_marketing_lists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  name text not null check (name = trim(name) and char_length(name) between 1 and 120),
  description text,
  is_builtin boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists luxor_marketing_lists_name_uidx
  on public.luxor_marketing_lists (lower(name));

create index if not exists luxor_marketing_lists_updated_idx
  on public.luxor_marketing_lists (is_builtin desc, updated_at desc);

alter table public.luxor_marketing_lists enable row level security;
revoke all on table public.luxor_marketing_lists from anon, authenticated;
grant select, insert, update, delete on table public.luxor_marketing_lists to service_role;

drop policy if exists "Service role can manage Luxor marketing lists" on public.luxor_marketing_lists;
create policy "Service role can manage Luxor marketing lists"
  on public.luxor_marketing_lists
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

-- Marketing is the permanent master email audience. Existing source buckets
-- remain available as saved imported lists, with readable names.
insert into public.luxor_marketing_lists (name, description, is_builtin, metadata)
select 'Marketing', 'All contacts who can receive Luxor marketing email.', true,
       '{"system_key":"marketing"}'::jsonb
where not exists (
  select 1 from public.luxor_marketing_lists where lower(name) = 'marketing'
);

insert into public.luxor_marketing_lists (name, description, is_builtin, metadata)
select distinct
  case source
    when 'squarespace' then 'Squarespace Subscribers'
    when 'grand_opening_rsvp' then 'Grand Opening RSVPs'
    when 'visit_page' then 'Visit Page Leads'
    else trim(source)
  end,
  'Imported from ' || trim(source) || '.',
  false,
  jsonb_build_object('legacy_source', trim(source))
from public.luxor_marketing_list legacy
where trim(source) <> ''
  and not exists (
    select 1
    from public.luxor_marketing_lists lists
    where lower(lists.name) = lower(
      case legacy.source
        when 'squarespace' then 'Squarespace Subscribers'
        when 'grand_opening_rsvp' then 'Grand Opening RSVPs'
        when 'visit_page' then 'Visit Page Leads'
        else trim(legacy.source)
      end
    )
  );

alter table public.luxor_marketing_list
  add column if not exists list_id uuid;

update public.luxor_marketing_list member
set list_id = lists.id
from public.luxor_marketing_lists lists
where member.list_id is null
  and lower(lists.name) = lower(
    case member.source
      when 'squarespace' then 'Squarespace Subscribers'
      when 'grand_opening_rsvp' then 'Grand Opening RSVPs'
      when 'visit_page' then 'Visit Page Leads'
      else trim(member.source)
    end
  );

-- Every existing subscriber also belongs to the built-in Marketing list. Keep
-- the original acquisition source in metadata for display and attribution.
insert into public.luxor_marketing_list (email, full_name, source, metadata, list_id, created_at)
select distinct on (member.email)
  member.email,
  member.full_name,
  'Marketing',
  member.metadata || jsonb_build_object('contact_source', member.source),
  lists.id,
  member.created_at
from public.luxor_marketing_list member
cross join public.luxor_marketing_lists lists
where lower(lists.name) = 'marketing'
  and not exists (
    select 1
    from public.luxor_marketing_list existing
    where existing.email = member.email and existing.list_id = lists.id
  )
order by member.email, member.created_at asc;

alter table public.luxor_marketing_list
  alter column list_id set not null;

alter table public.luxor_marketing_list
  add constraint luxor_marketing_list_list_id_fkey
    foreign key (list_id) references public.luxor_marketing_lists(id) on delete cascade,
  add constraint luxor_marketing_list_email_list_key unique (email, list_id);

-- The currently deployed application still sends inserts without list_id and
-- upserts on (email, source). Keep that path working until every deployment is
-- on the normalized list API. New code always supplies list_id explicitly.
create or replace function public.set_default_luxor_marketing_list_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marketing_list_id uuid;
  existing_source text;
begin
  if new.list_id is null then
    select id into marketing_list_id
    from public.luxor_marketing_lists
    where metadata ->> 'system_key' = 'marketing'
    limit 1;

    select source into existing_source
    from public.luxor_marketing_list
    where email = new.email and list_id = marketing_list_id
    limit 1;

    new.list_id := marketing_list_id;
    if existing_source is not null then new.source := existing_source; end if;
  end if;
  return new;
end;
$$;

revoke all on function public.set_default_luxor_marketing_list_id() from public, anon, authenticated;
grant execute on function public.set_default_luxor_marketing_list_id() to service_role;

drop trigger if exists set_default_luxor_marketing_list_id on public.luxor_marketing_list;
create trigger set_default_luxor_marketing_list_id
  before insert on public.luxor_marketing_list
  for each row execute function public.set_default_luxor_marketing_list_id();

create index if not exists luxor_marketing_list_list_created_idx
  on public.luxor_marketing_list (list_id, created_at desc);

grant select, insert, update, delete on table public.luxor_marketing_list to service_role;

notify pgrst, 'reload schema';
