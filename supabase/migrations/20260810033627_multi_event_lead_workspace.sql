create table if not exists public.luxor_lead_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete cascade,
  event_type text,
  target_date text,
  guest_count integer check (guest_count is null or guest_count >= 0),
  package_interest text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'tour_requested', 'tour_confirmed', 'proposal_sent', 'booked', 'closed_lost')),
  pipeline_stage text not null default 'inquiry'
    check (pipeline_stage in ('inquiry', 'tour', 'proposal', 'contract', 'deposit', 'planning', 'final_payment', 'event', 'closing', 'closed_lost')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false
);

create unique index if not exists luxor_lead_events_primary_idx
  on public.luxor_lead_events (inquiry_id)
  where is_primary;

create unique index if not exists luxor_lead_events_id_inquiry_idx
  on public.luxor_lead_events (id, inquiry_id);

create index if not exists luxor_lead_events_inquiry_idx
  on public.luxor_lead_events (inquiry_id, created_at);

alter table public.luxor_bookings
  add column if not exists lead_event_id uuid references public.luxor_lead_events(id) on delete set null;

alter table public.luxor_invoices
  add column if not exists lead_event_id uuid references public.luxor_lead_events(id) on delete set null;

create index if not exists luxor_bookings_lead_event_idx
  on public.luxor_bookings (lead_event_id);

create index if not exists luxor_invoices_lead_event_idx
  on public.luxor_invoices (lead_event_id);

create table if not exists public.luxor_lead_event_preferences (
  portal_email text not null
    check (portal_email = lower(trim(portal_email))),
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete cascade,
  lead_event_id uuid not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (portal_email, inquiry_id),
  foreign key (lead_event_id, inquiry_id)
    references public.luxor_lead_events (id, inquiry_id)
    on delete cascade
);

create or replace function public.luxor_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists luxor_lead_events_set_updated_at on public.luxor_lead_events;
create trigger luxor_lead_events_set_updated_at
  before update on public.luxor_lead_events
  for each row execute function public.luxor_set_updated_at();

drop trigger if exists luxor_lead_event_preferences_set_updated_at on public.luxor_lead_event_preferences;
create trigger luxor_lead_event_preferences_set_updated_at
  before update on public.luxor_lead_event_preferences
  for each row execute function public.luxor_set_updated_at();

insert into public.luxor_lead_events (
  inquiry_id,
  event_type,
  target_date,
  guest_count,
  package_interest,
  status,
  pipeline_stage,
  notes,
  metadata,
  is_primary
)
select
  i.id,
  i.event_type,
  i.target_date,
  i.guest_count,
  i.package_interest,
  i.status,
  coalesce(i.pipeline_stage, 'inquiry'),
  i.message,
  coalesce(i.metadata, '{}'::jsonb),
  true
from public.luxor_inquiries i
where coalesce(i.campaign_key, '') <> 'grand_opening_2026_07_25'
  and coalesce(i.flow, '') <> 'grand_opening_rsvp'
  and coalesce(i.source, '') <> 'grand_opening_rsvp'
  and not exists (
    select 1
    from public.luxor_lead_events e
    where e.inquiry_id = i.id
  );

update public.luxor_bookings b
set lead_event_id = e.id
from public.luxor_lead_events e
where b.lead_event_id is null
  and b.inquiry_id = e.inquiry_id
  and e.is_primary;

update public.luxor_invoices i
set lead_event_id = e.id
from public.luxor_lead_events e
where i.lead_event_id is null
  and i.inquiry_id = e.inquiry_id
  and e.is_primary;

create or replace function public.luxor_create_primary_lead_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.campaign_key, '') <> 'grand_opening_2026_07_25'
     and coalesce(new.flow, '') <> 'grand_opening_rsvp'
     and coalesce(new.source, '') <> 'grand_opening_rsvp' then
    insert into public.luxor_lead_events (
      inquiry_id,
      event_type,
      target_date,
      guest_count,
      package_interest,
      status,
      pipeline_stage,
      notes,
      metadata,
      is_primary
    ) values (
      new.id,
      new.event_type,
      new.target_date,
      new.guest_count,
      new.package_interest,
      new.status,
      coalesce(new.pipeline_stage, 'inquiry'),
      new.message,
      coalesce(new.metadata, '{}'::jsonb),
      true
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_inquiries_create_primary_lead_event on public.luxor_inquiries;
create trigger luxor_inquiries_create_primary_lead_event
  after insert on public.luxor_inquiries
  for each row execute function public.luxor_create_primary_lead_event();

alter table public.luxor_lead_events enable row level security;
alter table public.luxor_lead_event_preferences enable row level security;

revoke all on table public.luxor_lead_events from anon, authenticated;
revoke all on table public.luxor_lead_event_preferences from anon, authenticated;
grant select, insert, update, delete on table public.luxor_lead_events to service_role;
grant select, insert, update, delete on table public.luxor_lead_event_preferences to service_role;

drop policy if exists "Service role can manage Luxor lead events" on public.luxor_lead_events;
create policy "Service role can manage Luxor lead events"
  on public.luxor_lead_events
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor lead event preferences" on public.luxor_lead_event_preferences;
create policy "Service role can manage Luxor lead event preferences"
  on public.luxor_lead_event_preferences
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

revoke all on function public.luxor_create_primary_lead_event() from public, anon, authenticated;
grant execute on function public.luxor_create_primary_lead_event() to service_role;

notify pgrst, 'reload schema';
