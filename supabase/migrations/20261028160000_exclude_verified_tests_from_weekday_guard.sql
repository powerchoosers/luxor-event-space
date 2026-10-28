-- Preserve the existing scheduling guard, excluding only verified test records.
-- CREATE OR REPLACE retains its owner, privileges, invoker mode and trigger.
create or replace function public.luxor_guard_weekday_booking_schedule()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  candidate_context jsonb;
  candidate_snapshot jsonb;
  other_context jsonb;
  other_snapshot jsonb;
  other public.luxor_bookings%rowtype;
  candidate_start timestamp;
  candidate_end timestamp;
  other_start timestamp;
  other_end timestamp;
begin
  if tg_op = 'UPDATE' and new.event_date is not distinct from old.event_date
     and new.start_time is not distinct from old.start_time and new.end_time is not distinct from old.end_time
     and new.status is not distinct from old.status and new.invoice_id is not distinct from old.invoice_id
     and new.inquiry_id is not distinct from old.inquiry_id
     and new.metadata -> 'is_test_record' is not distinct from old.metadata -> 'is_test_record' then
    return new;
  end if;
  if new.status not in ('tentative', 'confirmed') and (tg_op <> 'UPDATE' or old.status not in ('tentative', 'confirmed')) then return new; end if;
  -- Volatile function queries take a fresh snapshot after waiting at READ
  -- COMMITTED. Older transaction snapshots cannot safely enforce this rule.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'LUXOR_WEEKDAY_INVALID: Scheduling writes require READ COMMITTED isolation.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(2147483000, 400);
  if new.status not in ('tentative', 'confirmed') then return new; end if;
  select i.proposal_context into candidate_context from public.luxor_invoices i where i.id = new.invoice_id;
  candidate_snapshot := public.luxor_validate_weekday_rental_context(candidate_context);
  if candidate_snapshot is not null then
    if new.event_date::text is distinct from candidate_snapshot ->> 'event_date'
       or new.start_time is null or new.end_time is null
       or new.start_time::time is distinct from (candidate_snapshot ->> 'start_time')::time
       or new.end_time::time is distinct from (candidate_snapshot ->> 'end_time')::time then
      raise exception 'LUXOR_WEEKDAY_INVALID: Booking timing differs from its locked proposal.' using errcode = 'P0001';
    end if;
    candidate_start := new.event_date::date + (candidate_snapshot ->> 'start_time')::time;
    candidate_end := new.event_date::date + (candidate_snapshot ->> 'end_time')::time;
    if (candidate_snapshot ->> 'end_time')::time < time '06:00' then candidate_end := candidate_end + interval '1 day'; end if;
    candidate_end := candidate_end + make_interval(mins => (candidate_snapshot ->> 'cleanup_buffer_minutes')::integer);
  elsif new.event_date is not null then
    -- All historical agreements reserve their date exclusively, regardless of
    -- whether old clock-time columns happen to be populated.
    candidate_start := new.event_date::date + time '06:00';
    candidate_end := new.event_date::date + interval '1 day 1 hour';
  end if;
  for other in
    select b.* from public.luxor_bookings b
    where b.status in ('tentative', 'confirmed') and b.id is distinct from new.id
      and b.inquiry_id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid
      and b.metadata -> 'is_test_record' is distinct from 'true'::jsonb
      and not exists (
        select 1 from public.luxor_inquiries inquiry
        where inquiry.id = b.inquiry_id
          and (inquiry.is_test is true or inquiry.metadata -> 'is_test_record' = 'true'::jsonb)
      )
      and not exists (
        select 1 from public.luxor_test_identifier_collision_exemptions exemption
        where exemption.inquiry_id = b.inquiry_id and exemption.reason = 'owner_confirmed_legacy_test'
      )
  loop
    select i.proposal_context into other_context from public.luxor_invoices i where i.id = other.invoice_id;
    other_snapshot := public.luxor_validate_weekday_rental_context(other_context);
    if candidate_snapshot is null and other_snapshot is null then continue; end if;
    if other.event_date is null or new.event_date is null then
      raise exception 'LUXOR_WEEKDAY_CONFLICT: An active reservation has unverified timing.' using errcode = 'P0001';
    end if;
    if new.event_date = other.event_date and (
      candidate_snapshot is null or other_snapshot is null
      or candidate_snapshot ->> 'booking_policy' = 'one_per_date'
      or other_snapshot ->> 'booking_policy' = 'one_per_date'
    ) then
      raise exception 'LUXOR_WEEKDAY_CONFLICT: This date is exclusively reserved.' using errcode = 'P0001';
    end if;
    if other_snapshot is null then
      other_start := other.event_date::date + time '06:00';
      other_end := other.event_date::date + interval '1 day 1 hour';
    else
      if other.event_date::text is distinct from other_snapshot ->> 'event_date'
         or other.start_time is null or other.end_time is null
         or other.start_time::time is distinct from (other_snapshot ->> 'start_time')::time
         or other.end_time::time is distinct from (other_snapshot ->> 'end_time')::time then
        raise exception 'LUXOR_WEEKDAY_CONFLICT: An active custom reservation has unverified timing.' using errcode = 'P0001';
      end if;
      other_start := other.event_date::date + (other_snapshot ->> 'start_time')::time;
      other_end := other.event_date::date + (other_snapshot ->> 'end_time')::time;
      if (other_snapshot ->> 'end_time')::time < time '06:00' then other_end := other_end + interval '1 day'; end if;
      other_end := other_end + make_interval(mins => (other_snapshot ->> 'cleanup_buffer_minutes')::integer);
    end if;
    if candidate_start < other_end and other_start < candidate_end then
      raise exception 'LUXOR_WEEKDAY_CONFLICT: Rental access or cleanup overlaps an active reservation.' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;
