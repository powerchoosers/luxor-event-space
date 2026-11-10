-- Record scheduling work in the booking transaction so an interrupted API
-- call cannot permanently lose a planning transition or date change.
create table if not exists public.luxor_event_email_reconciliation (
  booking_id uuid primary key references public.luxor_bookings(id) on delete cascade,
  generation uuid not null default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now()
);
alter table public.luxor_event_email_reconciliation add column if not exists next_attempt_at timestamptz not null default now();
alter table public.luxor_event_email_reconciliation enable row level security;
revoke all on public.luxor_event_email_reconciliation from public,anon,authenticated;
grant select,update,delete on public.luxor_event_email_reconciliation to service_role;

create or replace function public.luxor_record_event_email_reconciliation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.inquiry_id is null or new.event_date is null or new.status in ('cancelled','completed')
    or nullif(new.metadata->>'planning_completed_at','') is null
    or nullif(new.metadata->>'event_completed_at','') is not null then return new; end if;
  if tg_op = 'UPDATE' and new.event_date is not distinct from old.event_date
    and new.metadata->>'planning_completed_at' is not distinct from old.metadata->>'planning_completed_at'
    and new.status is not distinct from old.status then return new; end if;
  insert into public.luxor_event_email_reconciliation(booking_id,generation,requested_at,next_attempt_at)
    values(new.id,gen_random_uuid(),now(),now())
    on conflict (booking_id) do update set generation=excluded.generation,requested_at=excluded.requested_at,next_attempt_at=excluded.next_attempt_at;
  return new;
end;
$$;
revoke all on function public.luxor_record_event_email_reconciliation() from public,anon,authenticated;
drop trigger if exists luxor_event_email_reconciliation_trigger on public.luxor_bookings;
create trigger luxor_event_email_reconciliation_trigger after insert or update of event_date,metadata,status on public.luxor_bookings
for each row execute function public.luxor_record_event_email_reconciliation();
