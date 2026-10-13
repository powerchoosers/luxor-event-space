-- Review copy of supabase/migrations/20261013044133_luxor_weekday_custom_rental_booking_guard.sql.
-- The numbered migration is generated but remains held for final readiness review.
-- Version 2 carries the newly approved schedule and guest-arrival-to-end
-- security basis. Version 1 remains readable for existing snapshots, but the
-- atomic acceptance RPC requires version 2. No customer rows are changed.

create or replace function public.luxor_validate_weekday_rental_context(p_context jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s jsonb := p_context -> 'weekday_custom_rental';
  policy jsonb;
  field text;
  event_day date;
  first_min integer;
  last_min integer;
  duration_min integer;
  increment_min integer;
begin
  if s is null then return null; end if;
  if jsonb_typeof(s) is distinct from 'object' or s -> 'version' not in ('1'::jsonb, '2'::jsonb) or s ->> 'time_zone' is distinct from 'America/Chicago' then
    raise exception 'LUXOR_WEEKDAY_INVALID: Invalid saved rental snapshot.' using errcode = 'P0001';
  end if;
  foreach field in array array['duration_minutes', 'duration_hours', 'hourly_rate', 'rental_total', 'minimum_hours', 'time_increment_minutes', 'cleanup_buffer_minutes'] loop
    if jsonb_typeof(s -> field) is distinct from 'number' then
      raise exception 'LUXOR_WEEKDAY_INVALID: Missing numeric rental terms.' using errcode = 'P0001';
    end if;
  end loop;
  if coalesce(s ->> 'event_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(s ->> 'start_time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or coalesce(s ->> 'end_time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'LUXOR_WEEKDAY_INVALID: Invalid saved rental date or times.' using errcode = 'P0001';
  end if;
  begin
    event_day := (s ->> 'event_date')::date;
  exception when datetime_field_overflow or invalid_datetime_format then
    raise exception 'LUXOR_WEEKDAY_INVALID: Invalid saved rental date.' using errcode = 'P0001';
  end;
  if extract(isodow from event_day) not between 1 and 4 then
    raise exception 'LUXOR_WEEKDAY_INVALID: Custom rentals require Monday through Thursday.' using errcode = 'P0001';
  end if;
  if (s ->> 'hourly_rate')::numeric <> 400
     or (s -> 'version' = '2'::jsonb and (s ->> 'minimum_hours')::numeric <> 3)
     or (s -> 'version' = '2'::jsonb and (s ->> 'time_increment_minutes')::numeric <> 60)
     or (s ->> 'minimum_hours')::numeric <= 0 or (s ->> 'minimum_hours')::numeric > 19
     -- Hours are serialized from JavaScript numbers. Recognize the approved
     -- whole-minute value without rejecting its binary decimal representation.
     or abs((s ->> 'minimum_hours')::numeric * 60 - round((s ->> 'minimum_hours')::numeric * 60)) > 0.000000001
     or (s ->> 'time_increment_minutes')::numeric <= 0 or (s ->> 'time_increment_minutes')::numeric > 1140
     or mod((s ->> 'time_increment_minutes')::numeric, 1) <> 0
     or (s ->> 'cleanup_buffer_minutes')::numeric < 0 or (s ->> 'cleanup_buffer_minutes')::numeric > 1140
     or mod((s ->> 'cleanup_buffer_minutes')::numeric, 1) <> 0
     or (s -> 'version' = '2'::jsonb and coalesce(s ->> 'reset_window_policy', '') <> 'allowed')
     or (s -> 'version' = '2'::jsonb and coalesce(s ->> 'booking_policy', '') <> 'one_per_date')
     or (s -> 'version' = '1'::jsonb and coalesce(s ->> 'reset_window_policy', '') not in ('blocked', 'allowed'))
     or (s -> 'version' = '1'::jsonb and coalesce(s ->> 'booking_policy', '') not in ('one_per_date', 'multiple_per_date'))
     or (s -> 'version' = '2'::jsonb and coalesce(s ->> 'security_hours_policy', '') <> 'arrival_to_end')
     or (s -> 'version' = '1'::jsonb and coalesce(s ->> 'security_hours_policy', '') not in ('rental_duration', 'owner_entered'))
     or (s -> 'version' = '2'::jsonb and coalesce(s ->> 'selection_surface', '') <> 'portal_only')
     or (s -> 'version' = '1'::jsonb and coalesce(s ->> 'selection_surface', '') not in ('portal_only', 'public_and_portal')) then
    raise exception 'LUXOR_WEEKDAY_INVALID: Incomplete approved rental policy.' using errcode = 'P0001';
  end if;
  first_min := split_part(s ->> 'start_time', ':', 1)::integer * 60 + split_part(s ->> 'start_time', ':', 2)::integer;
  last_min := split_part(s ->> 'end_time', ':', 1)::integer * 60 + split_part(s ->> 'end_time', ':', 2)::integer;
  if last_min < 360 then last_min := last_min + 1440; end if;
  duration_min := last_min - first_min;
  increment_min := (s ->> 'time_increment_minutes')::integer;
  if first_min < 360 or last_min > 1500 or duration_min <= 0
     or mod(first_min, increment_min) <> 0 or mod(last_min, increment_min) <> 0
     or duration_min < round((s ->> 'minimum_hours')::numeric * 60)
     or (s -> 'version' = '1'::jsonb and s ->> 'reset_window_policy' = 'blocked' and first_min < 1020 and last_min > 900)
     or (s ->> 'duration_minutes')::numeric <> duration_min
     or abs((s ->> 'duration_hours')::numeric - duration_min::numeric / 60) > 0.000000001
     or (s ->> 'rental_total')::numeric <> round(duration_min::numeric * 400 / 60, 2) then
    raise exception 'LUXOR_WEEKDAY_INVALID: Rental duration and price do not match the saved times.' using errcode = 'P0001';
  end if;
  foreach field in array array['event_date', 'start_time', 'end_time'] loop
    if p_context ->> field is distinct from s ->> field then
      raise exception 'LUXOR_WEEKDAY_INVALID: Canonical rental timing does not match its snapshot.' using errcode = 'P0001';
    end if;
  end loop;
  if (p_context ? 'guest_arrival_time' and p_context ->> 'guest_arrival_time' is distinct from s ->> 'start_time')
     or (p_context ? 'guestArrivalTime' and p_context ->> 'guestArrivalTime' is distinct from s ->> 'start_time')
     or (p_context ? 'event_end_time' and p_context ->> 'event_end_time' is distinct from s ->> 'end_time')
     or (p_context ? 'eventEndTime' and p_context ->> 'eventEndTime' is distinct from s ->> 'end_time') then
    raise exception 'LUXOR_WEEKDAY_INVALID: Display timing conflicts with the canonical rental.' using errcode = 'P0001';
  end if;
  policy := coalesce(
    p_context #> '{pricing_snapshot,pricing_config,luxor_costs,weekday_custom_rental}',
    p_context #> '{pricing_snapshot,pricing_config,weekday_custom_rental}'
  );
  if jsonb_typeof(policy) is distinct from 'object' or policy -> 'enabled' is distinct from 'true'::jsonb then
    raise exception 'LUXOR_WEEKDAY_INVALID: The frozen pricing policy is unavailable.' using errcode = 'P0001';
  end if;
  foreach field in array array['hourly_rate', 'minimum_hours', 'time_increment_minutes', 'cleanup_buffer_minutes'] loop
    if coalesce(jsonb_typeof(policy -> field), '') not in ('number', 'string') then
      raise exception 'LUXOR_WEEKDAY_INVALID: The frozen numeric policy is unavailable.' using errcode = 'P0001';
    end if;
    begin
      if (policy ->> field)::numeric is distinct from (s ->> field)::numeric then
        raise exception 'LUXOR_WEEKDAY_INVALID: Rental policy differs from the frozen approved catalog.' using errcode = 'P0001';
      end if;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'LUXOR_WEEKDAY_INVALID: The frozen numeric policy is invalid.' using errcode = 'P0001';
    end;
  end loop;
  foreach field in array array['reset_window_policy', 'booking_policy', 'security_hours_policy', 'selection_surface'] loop
    if policy -> field is distinct from s -> field then
      raise exception 'LUXOR_WEEKDAY_INVALID: Rental policy differs from the frozen approved catalog.' using errcode = 'P0001';
    end if;
  end loop;
  return s;
end;
$$;

-- All active writers take the same transaction lock, including legacy writers.
-- Legacy-versus-legacy behavior is retained. Every conflict involving a custom
-- rental is authoritative here, including cross-date cleanup boundaries.
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
     and new.status is not distinct from old.status and new.invoice_id is not distinct from old.invoice_id then
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
  for other in select b.* from public.luxor_bookings b where b.status in ('tentative', 'confirmed') and b.id is distinct from new.id loop
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

drop trigger if exists luxor_weekday_booking_schedule_guard on public.luxor_bookings;
create trigger luxor_weekday_booking_schedule_guard before insert or update on public.luxor_bookings
for each row execute function public.luxor_guard_weekday_booking_schedule();

create or replace function public.luxor_claim_weekday_proposal_acceptance(
  p_invoice_id uuid,
  p_booking jsonb,
  p_accepted_at timestamptz,
  p_ip text default null,
  p_user_agent text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  invoice public.luxor_invoices%rowtype;
  booking public.luxor_bookings%rowtype;
  proposed public.luxor_bookings%rowtype;
  snapshot jsonb;
  guest_count integer;
  field text;
  accepted_at timestamptz := coalesce(p_accepted_at, now());
begin
  -- Match existing signature/payment RPC lock ordering: invoice row first.
  -- Booking INSERT takes the venue lock inside the trigger. Taking it here
  -- before the invoice lock would deadlock against same-day finalization.
  select i.* into invoice from public.luxor_invoices i where i.id = p_invoice_id for update;
  if not found or invoice.invoice_kind is distinct from 'event' or invoice.status is distinct from 'sent'
     or invoice.price_locked_at is null or invoice.offer_status = 'withdrawn' or invoice.inquiry_id is null then
    raise exception 'LUXOR_WEEKDAY_INVALID: A published active locked proposal is required.' using errcode = 'P0001';
  end if;
  snapshot := public.luxor_validate_weekday_rental_context(invoice.proposal_context);
  if snapshot is null then raise exception 'LUXOR_WEEKDAY_INVALID: A saved custom rental is required.' using errcode = 'P0001'; end if;
  if snapshot -> 'version' is distinct from '2'::jsonb then
    raise exception 'LUXOR_WEEKDAY_INVALID: Historical custom rental terms require administrator review before acceptance.' using errcode = 'P0001';
  end if;
  if exists(select 1 from public.luxor_inquiries q where q.id = invoice.inquiry_id and q.status = 'closed_lost') then
    raise exception 'LUXOR_WEEKDAY_INVALID: The client opportunity is closed.' using errcode = 'P0001';
  end if;
  select b.* into booking from public.luxor_bookings b where b.invoice_id = invoice.id;
  if found and invoice.proposal_accepted_at is not null then
    if invoice.booking_id is distinct from booking.id then
      raise exception 'LUXOR_WEEKDAY_INVALID: Existing proposal and booking links require review.' using errcode = 'P0001';
    end if;
    return to_jsonb(invoice);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.luxor_bookings'::regclass
      and t.tgname = 'luxor_weekday_booking_schedule_guard'
      and t.tgenabled = 'O'
      and t.tgfoid = 'public.luxor_guard_weekday_booking_schedule()'::regprocedure
  ) then
    raise exception 'LUXOR_WEEKDAY_INVALID: The scheduling guard is unavailable.' using errcode = 'P0001';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'LUXOR_WEEKDAY_INVALID: Scheduling writes require READ COMMITTED isolation.' using errcode = 'P0001';
  end if;
  if invoice.offer_expires_at is not null and invoice.offer_expires_at <= now() then
    raise exception 'LUXOR_WEEKDAY_INVALID: The proposal has expired.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_booking) is distinct from 'object' then raise exception 'LUXOR_WEEKDAY_INVALID: Booking facts are required.' using errcode = 'P0001'; end if;
  proposed := jsonb_populate_record(null::public.luxor_bookings, p_booking);
  foreach field in array array['final_event_price', 'amount_due_to_book', 'refundable_security_deposit'] loop
    if jsonb_typeof(invoice.proposal_context -> field) is distinct from 'number' then
      raise exception 'LUXOR_WEEKDAY_INVALID: Locked financial terms are required.' using errcode = 'P0001';
    end if;
  end loop;
  if invoice.total is null or invoice.total <= 0 or proposed.contract_total is null
     or proposed.deposit_required is null or proposed.security_deposit_amount is null then
    raise exception 'LUXOR_WEEKDAY_INVALID: Valid booking amounts are required.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(invoice.proposal_context -> 'expected_guest_count') is distinct from 'number'
     or (invoice.proposal_context ->> 'expected_guest_count')::numeric not between 1 and 200
     or mod((invoice.proposal_context ->> 'expected_guest_count')::numeric, 1) <> 0 then
    raise exception 'LUXOR_WEEKDAY_INVALID: A valid guest count is required.' using errcode = 'P0001';
  end if;
  guest_count := (invoice.proposal_context ->> 'expected_guest_count')::integer;
  if proposed.invoice_id is distinct from invoice.id or proposed.inquiry_id is distinct from invoice.inquiry_id
     or proposed.lead_event_id is distinct from invoice.lead_event_id
     or proposed.client_name is distinct from invoice.client_name
     or proposed.event_date::text is distinct from snapshot ->> 'event_date'
     or proposed.start_time is null or proposed.end_time is null
     or proposed.start_time::time is distinct from (snapshot ->> 'start_time')::time
     or proposed.end_time::time is distinct from (snapshot ->> 'end_time')::time
     or proposed.guest_count is distinct from guest_count
     or proposed.status is distinct from 'tentative' or proposed.contract_status is distinct from 'not_sent'
     or proposed.security_deposit_status is distinct from 'due'
     or proposed.contract_total is distinct from invoice.total
     or proposed.contract_total is distinct from (invoice.proposal_context ->> 'final_event_price')::numeric
     or proposed.deposit_required is distinct from (invoice.proposal_context ->> 'amount_due_to_book')::numeric
     or proposed.deposit_required < 0.5 or proposed.deposit_required > proposed.contract_total
     or proposed.security_deposit_amount is distinct from (invoice.proposal_context ->> 'refundable_security_deposit')::numeric
     or proposed.security_deposit_amount is distinct from 750::numeric
     or proposed.metadata -> 'final_proposal_context' is distinct from invoice.proposal_context then
    raise exception 'LUXOR_WEEKDAY_INVALID: Booking facts differ from the locked proposal.' using errcode = 'P0001';
  end if;
  if booking.id is not null then
    raise exception 'LUXOR_WEEKDAY_INVALID: A booking without acceptance requires administrator review.' using errcode = 'P0001';
  end if;
  insert into public.luxor_bookings (
    inquiry_id, invoice_id, lead_event_id, client_name, email, phone, event_type,
    event_date, start_time, end_time, guest_count, package_name, status, booked_at,
    contract_total, deposit_required, security_deposit_amount, final_payment_due_date,
    contract_status, security_deposit_status, notes, metadata
  ) values (
    proposed.inquiry_id, proposed.invoice_id, proposed.lead_event_id, proposed.client_name,
    proposed.email, proposed.phone, proposed.event_type, proposed.event_date, proposed.start_time,
    proposed.end_time, proposed.guest_count, proposed.package_name, proposed.status, accepted_at,
    proposed.contract_total, proposed.deposit_required, proposed.security_deposit_amount,
    proposed.final_payment_due_date, proposed.contract_status, proposed.security_deposit_status,
    proposed.notes, proposed.metadata
  ) returning * into booking;
  update public.luxor_invoices i set
    proposal_accepted_at = coalesce(i.proposal_accepted_at, accepted_at),
    proposal_accepted_ip = case when i.proposal_accepted_at is null then left(p_ip, 128) else i.proposal_accepted_ip end,
    proposal_accepted_user_agent = case when i.proposal_accepted_at is null then left(p_user_agent, 1000) else i.proposal_accepted_user_agent end,
    booking_id = booking.id,
    offer_status = 'active',
    updated_at = now()
  where i.id = invoice.id returning i.* into invoice;
  return to_jsonb(invoice);
end;
$$;

revoke all on function public.luxor_validate_weekday_rental_context(jsonb) from public, anon, authenticated;
revoke all on function public.luxor_guard_weekday_booking_schedule() from public, anon, authenticated;
revoke all on function public.luxor_claim_weekday_proposal_acceptance(uuid, jsonb, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.luxor_validate_weekday_rental_context(jsonb) to service_role;
grant execute on function public.luxor_guard_weekday_booking_schedule() to service_role;
grant execute on function public.luxor_claim_weekday_proposal_acceptance(uuid, jsonb, timestamptz, text, text) to service_role;

notify pgrst, 'reload schema';
