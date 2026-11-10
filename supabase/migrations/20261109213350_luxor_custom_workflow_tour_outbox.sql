-- Capture only future, explicit attendance changes. This outbox is separate
-- from the contact-form consumer, which assumes every pending event is an
-- inquiry acknowledgment. No tour trigger is exposed by the application yet.
create table public.luxor_custom_workflow_tour_events (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null,
  workflow_version_id uuid not null,
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete restrict,
  visit_id uuid not null references public.luxor_tour_visits(id) on delete restrict,
  visit_version integer not null check (visit_version > 0),
  occurred_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','consumed','ignored')),
  processed_at timestamptz,
  last_error text,
  foreign key (workflow_id, workflow_version_id)
    references public.luxor_custom_workflow_versions(workflow_id, id) on delete restrict,
  unique (workflow_id, workflow_version_id, visit_id, visit_version),
  check ((status = 'pending') = (processed_at is null))
);
create index luxor_custom_workflow_tour_events_pending_idx
  on public.luxor_custom_workflow_tour_events(occurred_at, id) where status = 'pending';
alter table public.luxor_custom_workflow_tour_events enable row level security;
revoke all on public.luxor_custom_workflow_tour_events from public, anon, authenticated;
grant select, insert, update, delete on public.luxor_custom_workflow_tour_events to service_role;
create policy luxor_custom_workflow_tour_events_service_role on public.luxor_custom_workflow_tour_events
  for all to service_role using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

create function public.luxor_custom_workflow_capture_attended_tour()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tour_attendance_status is distinct from 'attended'
    or old.tour_attendance_status is not distinct from 'attended'
    or new.current_tour_visit_id is null
    or not public.luxor_custom_workflow_runtime_enabled()
    or coalesce(new.is_test,false)
    or lower(coalesce(new.metadata->>'is_test_record','false')) = 'true'
    or new.archived_at is not null or new.status = 'closed_lost' then
    return new;
  end if;
  -- The visit row is updated first by the outcome transaction. Never create an
  -- event from a stale or incomplete inquiry-only attendance update.
  if not exists (select 1 from public.luxor_tour_visits visit
    where visit.id = new.current_tour_visit_id and visit.inquiry_id = new.id
      and visit.version = new.current_tour_visit_version and visit.attendance_status = 'attended') then
    return new;
  end if;
  -- Pin active versions at the moment of the outcome, not when a later worker
  -- happens to run. A workflow activated later must not enroll old visits.
  insert into public.luxor_custom_workflow_tour_events(workflow_id,workflow_version_id,inquiry_id,visit_id,visit_version)
  select workflow.id,version.id,new.id,new.current_tour_visit_id,new.current_tour_visit_version
    from public.luxor_custom_workflows workflow
    join public.luxor_custom_workflow_versions version
      on version.workflow_id = workflow.id and version.id = workflow.current_version_id
    where workflow.status = 'active' and workflow.trigger_type = 'tour_attended'
      and version.definition->>'trigger' = 'tour_attended'
  on conflict (workflow_id,workflow_version_id,visit_id,visit_version) do nothing;
  return new;
end;
$$;
revoke all on function public.luxor_custom_workflow_capture_attended_tour() from public, anon, authenticated;
create trigger luxor_custom_workflow_capture_attended_tour_after_update
  after update of tour_attendance_status on public.luxor_inquiries
  for each row execute function public.luxor_custom_workflow_capture_attended_tour();
