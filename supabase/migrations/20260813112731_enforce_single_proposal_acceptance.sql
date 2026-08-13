-- A public proposal can create exactly one booking. PostgreSQL UNIQUE permits
-- multiple NULLs, so manually-created or legacy bookings that are not linked to
-- an invoice remain valid. The preflight deliberately fails rather than merging
-- records automatically if an environment already contains duplicate links.
do $$
begin
  if exists (
    select 1
    from public.luxor_bookings
    where invoice_id is not null
    group by invoice_id
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce one booking per proposal: duplicate luxor_bookings.invoice_id values exist.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.luxor_bookings'::regclass
      and conname = 'luxor_bookings_invoice_id_key'
  ) then
    alter table public.luxor_bookings
      add constraint luxor_bookings_invoice_id_key unique (invoice_id);
  end if;
end $$;

-- The acceptance flow prepares a draft before it exposes a signing link. This
-- guard makes that preparation a single-writer operation for each booking, so
-- concurrent browser tabs cannot create parallel agreements.
do $$
begin
  if exists (
    select 1
    from public.luxor_signature_requests
    where booking_id is not null
      and status in ('draft', 'sent', 'viewed')
    group by booking_id
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce one active agreement per booking: duplicate active signature requests exist.';
  end if;
end $$;

create unique index if not exists luxor_signature_requests_one_active_booking_idx
  on public.luxor_signature_requests (booking_id)
  where status in ('draft', 'sent', 'viewed');

notify pgrst, 'reload schema';
