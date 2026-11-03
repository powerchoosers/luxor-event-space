alter table public.luxor_financial_audit
  drop constraint if exists luxor_financial_audit_action_check;
alter table public.luxor_financial_audit
  add constraint luxor_financial_audit_action_check check (action in (
    'draft_invoice_deleted',
    'invoice_voided',
    'payment_received_date_corrected',
    'legacy_package_reconciliation_v1'
  ));

-- Serialize reminder inserts against installment-date corrections. A worker
-- may have read an older schedule before the reconciliation locks the row;
-- the FOR UPDATE below makes its eventual insert wait and validate against the
-- committed schedule instead of creating a stale date-keyed reminder.
create or replace function public.luxor_validate_installment_reminder_schedule()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  installment public.luxor_payment_installments%rowtype;
  installment_id_text text;
  milestone text;
  due_date date;
  expected_scheduled_for timestamptz;
begin
  if new.job_type is distinct from 'installment_payment_reminder' or new.test_run_id is not null then
    return new;
  end if;

  installment_id_text := new.metadata->>'installment_id';
  milestone := new.metadata->>'milestone';
  if new.booking_id is null or installment_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Installment reminder must reference a valid booking installment.' using errcode = '23514';
  end if;

  select p.* into installment
  from public.luxor_payment_installments p
  where p.id = installment_id_text::uuid
  for update;
  if not found then
    raise exception 'Installment reminder references an unavailable installment.' using errcode = '23503';
  end if;

  due_date := (installment.due_at at time zone 'UTC')::date;
  if installment.booking_id <> new.booking_id
    or installment.invoice_id is null
    or installment.installment_order not between 2 and 5
    or installment.status in ('paid', 'void')
    or due_date is null
    or coalesce(milestone, '') not in ('installment_7_days_before', 'installment_1_day_overdue')
    or new.metadata->>'installment_order' is distinct from installment.installment_order::text
    or new.metadata->>'invoice_id' is distinct from installment.invoice_id::text
    or new.metadata->>'due_date' is distinct from due_date::text
    or new.metadata->>'timezone' is distinct from 'America/Chicago'
    or new.metadata->>'automation_key' is distinct from ('installment:' || new.booking_id::text || ':' || installment.id::text || ':' || due_date::text || ':' || milestone)
    or position(due_date::text in coalesce(new.body, '')) = 0 then
    raise exception 'Installment reminder does not match the current installment schedule.' using errcode = '23514';
  end if;

  if milestone = 'installment_7_days_before' then
    expected_scheduled_for := (((due_date - 7)::timestamp + time '10:00:00') at time zone 'America/Chicago');
  else
    expected_scheduled_for := (((due_date + 1)::timestamp + time '10:00:00') at time zone 'America/Chicago');
  end if;
  if new.scheduled_for is distinct from expected_scheduled_for then
    raise exception 'Installment reminder send time does not match the current installment schedule.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_installment_reminder_schedule_guard on public.luxor_email_jobs;
create trigger luxor_installment_reminder_schedule_guard
before insert or update of metadata, booking_id, job_type on public.luxor_email_jobs
for each row execute function public.luxor_validate_installment_reminder_schedule();
revoke all on function public.luxor_validate_installment_reminder_schedule() from public, anon, authenticated;
grant execute on function public.luxor_validate_installment_reminder_schedule() to service_role;

create or replace function public.luxor_reconcile_legacy_package_booking(
  p_booking_id uuid,
  p_actor_email text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking public.luxor_bookings%rowtype;
  master_invoice public.luxor_invoices%rowtype;
  draft_invoice public.luxor_invoices%rowtype;
  old_proposal public.luxor_invoices%rowtype;
  signed_request public.luxor_signature_requests%rowtype;
  audit_row public.luxor_financial_audit%rowtype;
  v_payment_count integer;
  v_security_count integer;
  v_installment_count integer;
  v_reminder_total_count integer;
  v_reminder_count integer;
  v_reminder_bad_count integer;
  v_reminder_updated_count integer;
  v_candidate_count integer;
  v_operation_key text;
  v_now timestamptz := now();
  v_before jsonb;
  v_after jsonb;
  v_context jsonb;
  v_plan jsonb;
  v_next_plan jsonb;
  v_selection jsonb;
  v_selection_plan jsonb;
  v_next_rows jsonb;
begin
  if p_booking_id is null or nullif(btrim(p_actor_email), '') is null then
    raise exception 'Booking and authenticated actor are required.' using errcode = '22023';
  end if;
  if p_booking_id is distinct from '614f6326-5c9a-46de-ae73-cb8d857fc2f8'::uuid then
    raise exception 'This reconciliation is limited to its approved booking.' using errcode = '42501';
  end if;

  select * into booking
  from public.luxor_bookings b
  where b.id = p_booking_id
  for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  v_operation_key := 'legacy_package_reconciliation_v1:' || booking.id::text;
  select * into master_invoice
  from public.luxor_invoices i
  where i.id = booking.invoice_id
  for update;
  if not found then
    raise exception 'Accepted master proposal not found.' using errcode = 'P0002';
  end if;

  select * into audit_row
  from public.luxor_financial_audit a
  where a.invoice_id = master_invoice.id
    and a.action = 'legacy_package_reconciliation_v1'
    and a.details->>'operation_key' = v_operation_key
  order by a.occurred_at desc
  limit 1;
  if found then
    if not exists (
      select 1 from public.luxor_invoices i
      where i.id = nullif(audit_row.details->>'draft_invoice_id', '')::uuid
        and i.booking_id = booking.id and i.parent_invoice_id = master_invoice.id
        and i.invoice_kind = 'final_balance' and i.status = 'draft'
        and abs(coalesce(i.total, 0) - 3256.28) < 0.005
        and abs(coalesce(i.subtotal, 0) - 3256.28) < 0.005
        and i.due_date = date '2027-03-30'
    ) or not exists (
      select 1 from public.luxor_invoices i
      where i.id = nullif(audit_row.details->>'superseded_proposal_id', '')::uuid
        and i.status = 'sent' and i.offer_status = 'withdrawn'
        and i.proposal_accepted_at is null
    ) or not exists (
      select 1 from public.luxor_proposal_activity a
      where a.invoice_id = nullif(audit_row.details->>'superseded_proposal_id', '')::uuid
        and a.event_type = 'superseded'
        and a.activity_key = v_operation_key || ':superseded'
    ) or master_invoice.proposal_context->'payment_plan'->>'booking_date' is distinct from '2026-10-31'
      or master_invoice.proposal_context->>'luxor_services_total' is distinct from '3756.28'
      or master_invoice.proposal_context->>'planner_services_total' is distinct from '0'
      or master_invoice.proposal_context->'payment_plan' is distinct from audit_row.after_state->'master_invoice'->'payment_plan'
      or (select jsonb_agg(jsonb_build_object('id', p.id, 'invoice_id', p.invoice_id, 'amount', p.amount, 'status', p.status, 'paid_at', p.paid_at, 'received_date', p.received_date, 'created_at', p.created_at) order by p.created_at)
          from public.luxor_payments p where p.booking_id = booking.id and p.status = 'paid' and abs(p.amount - 500) < 0.005)
         is distinct from audit_row.after_state->'payment'
      or (select jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status, 'total', i.total, 'due_date', i.due_date, 'parent_invoice_id', i.parent_invoice_id) order by i.created_at)
          from public.luxor_invoices i where i.booking_id = booking.id and i.parent_invoice_id = master_invoice.id and i.invoice_kind = 'security_deposit')
         is distinct from audit_row.after_state->'security_invoice'
      or (select count(*) from public.luxor_payment_installments p
          where p.booking_id = booking.id and p.invoice_id = master_invoice.id and p.installment_order between 1 and 6) <> 6
      or (select jsonb_agg(jsonb_build_object('id', p.id, 'order', p.installment_order, 'due_at', p.due_at, 'status', p.status, 'amount', p.amount, 'paid_at', p.paid_at, 'metadata', p.metadata) order by p.installment_order)
          from public.luxor_payment_installments p where p.booking_id = booking.id and p.invoice_id = master_invoice.id and p.installment_order between 1 and 6)
         is distinct from audit_row.after_state->'installments'
      or (select count(*) from public.luxor_email_jobs j
          where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder' and j.test_run_id is null) <> 8
      or exists (
        select 1 from public.luxor_email_jobs j
        left join public.luxor_payment_installments p on p.id::text = j.metadata->>'installment_id'
        where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder' and j.test_run_id is null
          and (p.id is null or p.installment_order not between 2 and 5
            or coalesce(j.metadata->>'milestone', '') not in ('installment_7_days_before','installment_1_day_overdue')
            or j.metadata->>'due_date' is distinct from (p.due_at at time zone 'UTC')::date::text
            or j.metadata->>'automation_key' is distinct from ('installment:' || booking.id::text || ':' || p.id::text || ':' || (p.due_at at time zone 'UTC')::date::text || ':' || coalesce(j.metadata->>'milestone', ''))
            or position(((p.due_at at time zone 'UTC')::date::text) in coalesce(j.body, '')) = 0
            or j.scheduled_for is distinct from ((((p.due_at at time zone 'UTC')::date + case j.metadata->>'milestone' when 'installment_7_days_before' then -7 else 1 end)::timestamp + time '16:00:00') at time zone 'UTC'))
      )
      or exists (
        select 1 from public.luxor_payment_installments p
        where p.booking_id = booking.id and p.invoice_id = master_invoice.id and p.installment_order between 2 and 5
          and (select count(*) from public.luxor_email_jobs j where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder' and j.test_run_id is null and j.metadata->>'installment_id' = p.id::text) <> 2
      ) or exists (
        select 1 from public.luxor_payment_installments p
        where p.booking_id = booking.id and p.invoice_id = master_invoice.id and p.installment_order between 2 and 5
          and (select count(distinct j.metadata->>'milestone') from public.luxor_email_jobs j where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder' and j.test_run_id is null and j.metadata->>'installment_id' = p.id::text) <> 2
      ) then
      raise exception 'A prior reconciliation receipt exists, but its records have since changed.' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'changed', false,
      'audit_id', audit_row.id,
      'operation_key', v_operation_key,
      'booking_id', booking.id,
      'master_invoice_id', master_invoice.id,
      'draft_invoice_id', audit_row.details->>'draft_invoice_id',
      'superseded_proposal_id', audit_row.details->>'superseded_proposal_id',
      'expected_active_reminders', 8,
      'reminders_updated', 8,
      'sent_reminder_count', 0,
      'message', 'This approved reconciliation was already applied.'
    );
  end if;

  if booking.status not in ('tentative', 'confirmed')
    or booking.contract_status <> 'signed'
    or booking.invoice_id is null
    or abs(coalesce(booking.contract_total, 0) - 3756.28) >= 0.005
    or abs(coalesce(booking.deposit_required, 0) - 500) >= 0.005
    or booking.security_deposit_status <> 'held'
    or abs(coalesce(booking.security_deposit_amount, 0) - 750) >= 0.005
    or booking.final_payment_due_date <> date '2027-03-30' then
    raise exception 'Booking terms changed; no reconciliation was applied.' using errcode = '40001';
  end if;

  if master_invoice.invoice_kind <> 'event'
    or master_invoice.status <> 'sent'
    or master_invoice.proposal_accepted_at is null
    or master_invoice.booking_id <> booking.id
    or abs(coalesce(master_invoice.total, 0) - 3756.28) >= 0.005
    or master_invoice.proposal_context->>'luxor_services_total' is distinct from '3756.28'
    or master_invoice.proposal_context->>'planner_services_total' is distinct from '0'
    or master_invoice.proposal_context->>'payment_collection_scope' is distinct from 'luxor_services_only'
    or master_invoice.proposal_context->'payment_plan'->>'schedule_anchor_policy' is distinct from 'first_deposit_paid_at_v1'
    or master_invoice.proposal_context->'payment_plan'->>'booking_date' is distinct from '2026-11-01' then
    raise exception 'Accepted master proposal changed; no reconciliation was applied.' using errcode = '40001';
  end if;

  select * into signed_request
  from public.luxor_signature_requests s
  where s.booking_id = booking.id and s.status = 'signed'
  order by s.signed_at desc
  limit 1
  for update;
  if not found
    or signed_request.metadata->'claim_booking_terms'->'final_proposal_context'->>'luxor_services_total' is distinct from '3756.28'
    or signed_request.metadata->'claim_booking_terms'->'final_proposal_context'->>'planner_services_total' is distinct from '0'
    or signed_request.metadata->'claim_booking_terms'->'final_proposal_context'->'payment_plan'->>'booking_date' is distinct from '2026-10-31'
    or (select array_agg(r.value->>'due_at' order by (r.value->>'installment_order')::integer)
        from jsonb_array_elements(signed_request.metadata->'claim_booking_terms'->'final_proposal_context'->'payment_plan'->'schedule_rows') r(value))
       is distinct from array['2026-10-31','2026-11-30','2026-12-31','2027-01-31','2027-02-28','2027-03-30']::text[] then
    raise exception 'Signed proposal snapshot does not match the approved reconciliation.' using errcode = '40001';
  end if;

  select count(*) into v_candidate_count
  from public.luxor_invoices i
  where i.booking_id = booking.id and i.parent_invoice_id = master_invoice.id
    and i.invoice_kind = 'final_balance' and i.status = 'draft'
    and abs(coalesce(i.total, 0) - 1524.28) < 0.005;
  if v_candidate_count <> 1 then
    raise exception 'Expected one unissued legacy final-balance draft; no reconciliation was applied.' using errcode = '40001';
  end if;
  select * into draft_invoice
  from public.luxor_invoices i
  where i.booking_id = booking.id and i.parent_invoice_id = master_invoice.id
    and i.invoice_kind = 'final_balance' and i.status = 'draft'
    and abs(coalesce(i.total, 0) - 1524.28) < 0.005
  for update;
  if draft_invoice.due_date <> date '2027-03-30'
    or abs(coalesce(draft_invoice.subtotal, 0) - 1524.28) >= 0.005
    or abs(coalesce(draft_invoice.tax_rate, 0)) >= 0.0001
    or abs(coalesce(draft_invoice.discount_percent, 0)) >= 0.005
    or abs(coalesce(draft_invoice.discount_amount, 0)) >= 0.005
    or draft_invoice.discount_type <> 'percent'
    or jsonb_array_length(coalesce(draft_invoice.line_items, '[]'::jsonb)) <> 1
    or draft_invoice.line_items->0->>'description' <> 'Remaining Luxor-Controlled Services Balance'
    or draft_invoice.line_items->0->>'total' <> '1524.28'
    or draft_invoice.line_items->0->>'unitPrice' <> '1524.28'
    or draft_invoice.line_items->0->>'category' <> 'Final Balance'
    or draft_invoice.line_items->0->>'paymentBucket' <> 'event'
    or draft_invoice.line_items->0->>'quantity' <> '1'
    or draft_invoice.notes not like '%planner-managed total: 1732.00%' then
    raise exception 'Legacy draft contents changed; no reconciliation was applied.' using errcode = '40001';
  end if;

  select count(*) into v_candidate_count
  from public.luxor_invoices i
  where i.inquiry_id = booking.inquiry_id
    and i.invoice_kind = 'event'
    and i.booking_id is null
    and i.status = 'sent'
    and i.offer_status = 'active'
    and i.proposal_accepted_at is null
    and i.supersedes_invoice_id is null
    and not exists (select 1 from public.luxor_invoices child where child.supersedes_invoice_id = i.id and child.invoice_kind = 'event')
    and abs(coalesce(i.total, 0) - 3431.53) < 0.005;
  if v_candidate_count <> 1 then
    raise exception 'Expected one active, unaccepted legacy proposal; no reconciliation was applied.' using errcode = '40001';
  end if;
  select * into old_proposal
  from public.luxor_invoices i
  where i.inquiry_id = booking.inquiry_id
    and i.invoice_kind = 'event'
    and i.booking_id is null
    and i.status = 'sent'
    and i.offer_status = 'active'
    and i.proposal_accepted_at is null
    and i.supersedes_invoice_id is null
    and not exists (select 1 from public.luxor_invoices child where child.supersedes_invoice_id = i.id and child.invoice_kind = 'event')
    and abs(coalesce(i.total, 0) - 3431.53) < 0.005
  for update;
  if not found then
    raise exception 'Legacy proposal changed; no reconciliation was applied.' using errcode = '40001';
  end if;

  perform p.id from public.luxor_payments p
  where p.booking_id = booking.id and p.status = 'paid'
    and abs(coalesce(p.amount, 0) - 500) < 0.005
    and p.received_date = date '2026-10-31'
    and p.paid_at::date = date '2026-11-01'
  for update;
  select count(*) into v_payment_count
  from public.luxor_payments p
  where p.booking_id = booking.id and p.status = 'paid'
    and abs(coalesce(p.amount, 0) - 500) < 0.005
    and p.received_date = date '2026-10-31'
    and p.paid_at::date = date '2026-11-01';
  if v_payment_count <> 1 then
    raise exception 'The audited $500 payment is not in its approved state; no reconciliation was applied.' using errcode = '40001';
  end if;

  perform i.id from public.luxor_invoices i
  where i.booking_id = booking.id and i.parent_invoice_id = master_invoice.id
    and i.invoice_kind = 'security_deposit' and i.status = 'draft'
    and abs(coalesce(i.total, 0) - 750) < 0.005
    and i.due_date = date '2027-04-29'
  for update;
  select count(*) into v_security_count
  from public.luxor_invoices i
  where i.booking_id = booking.id and i.parent_invoice_id = master_invoice.id
    and i.invoice_kind = 'security_deposit' and i.status = 'draft'
    and abs(coalesce(i.total, 0) - 750) < 0.005
    and i.due_date = date '2027-04-29';
  if v_security_count <> 1 then
    raise exception 'Separate security-deposit invoice changed; no reconciliation was applied.' using errcode = '40001';
  end if;

  perform p.id from public.luxor_payment_installments p
  where p.booking_id = booking.id and p.invoice_id = master_invoice.id
    and p.installment_order between 1 and 6 and p.status <> 'void'
  for update;
  select count(*) into v_installment_count
  from public.luxor_payment_installments p
  where p.booking_id = booking.id and p.invoice_id = master_invoice.id
    and p.installment_order between 1 and 6 and p.status <> 'void';
  if v_installment_count <> 6
    or exists (
      select 1 from public.luxor_payment_installments p
      where p.booking_id = booking.id and p.invoice_id = master_invoice.id and p.installment_order between 1 and 6
        and (p.metadata->>'schedule_anchor_policy' is distinct from 'first_deposit_paid_at_v1'
          or p.metadata->>'schedule_anchor_date' is distinct from '2026-11-01'
          or (p.installment_order = 1 and (p.status <> 'paid' or (p.due_at at time zone 'UTC')::date <> date '2026-11-01' or abs(p.amount - 500) >= 0.005))
          or (p.installment_order between 2 and 5 and (p.status <> 'scheduled' or (p.due_at at time zone 'UTC')::date <> (array[date '2026-12-01',date '2027-01-01',date '2027-02-01',date '2027-03-01'])[p.installment_order - 1] or abs(p.amount - 651.25) >= 0.005))
          or (p.installment_order = 6 and (p.status <> 'scheduled' or (p.due_at at time zone 'UTC')::date <> date '2027-03-30' or abs(p.amount - 651.28) >= 0.005)))
    ) then
    raise exception 'Installment schedule changed; no reconciliation was applied.' using errcode = '40001';
  end if;

  perform j.id from public.luxor_email_jobs j
  where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder'
    and j.test_run_id is null
  for update;
  select count(*) into v_reminder_total_count
  from public.luxor_email_jobs j
  where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder' and j.test_run_id is null;
  select count(*) into v_reminder_count
  from public.luxor_email_jobs j
  where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder'
    and j.test_run_id is null and j.status = 'queued';
  select count(*) into v_reminder_bad_count
  from public.luxor_email_jobs j
  where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder'
    and j.test_run_id is null and j.status = 'queued'
    and (j.status <> 'queued' or j.sent_at is not null or j.attempts <> 0
      or j.metadata->>'installment_id' is null
      or coalesce(j.metadata->>'milestone', '') not in ('installment_7_days_before','installment_1_day_overdue'));
  if v_reminder_total_count <> 8 or v_reminder_count <> 8 or v_reminder_bad_count <> 0 or exists (
    select 1 from public.luxor_email_jobs j
    where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder'
      and j.test_run_id is null and (j.status <> 'queued' or j.sent_at is not null or j.attempts > 0)
  ) or exists (
    select 1 from public.luxor_payment_installments p
    where p.booking_id = booking.id and p.invoice_id = master_invoice.id and p.installment_order between 2 and 5
      and (select count(*) from public.luxor_email_jobs j
           where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder' and j.test_run_id is null
             and j.status = 'queued' and j.metadata->>'installment_id' = p.id::text
             and j.metadata->>'milestone' in ('installment_7_days_before','installment_1_day_overdue')) <> 2
  ) or exists (
    select 1 from public.luxor_payment_installments p
    where p.booking_id = booking.id and p.invoice_id = master_invoice.id and p.installment_order between 2 and 5
      and (select count(*) from public.luxor_email_jobs j
           where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder' and j.test_run_id is null
             and j.status = 'queued' and j.metadata->>'installment_id' = p.id::text) <> 2
  ) or exists (
    select 1 from public.luxor_email_jobs j
    left join public.luxor_payment_installments p on p.id::text = j.metadata->>'installment_id'
    where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder' and j.test_run_id is null
      and j.status = 'queued'
      and (p.id is null or p.booking_id <> booking.id or p.invoice_id <> master_invoice.id
        or p.installment_order not between 2 and 5
        or j.metadata->>'due_date' is distinct from (p.due_at at time zone 'UTC')::date::text
        or j.metadata->>'automation_key' is distinct from ('installment:' || booking.id::text || ':' || p.id::text || ':' || (p.due_at at time zone 'UTC')::date::text || ':' || coalesce(j.metadata->>'milestone', ''))
        or position(((p.due_at at time zone 'UTC')::date::text) in coalesce(j.body, '')) = 0
        or j.scheduled_for is distinct from ((((p.due_at at time zone 'UTC')::date + case j.metadata->>'milestone' when 'installment_7_days_before' then -7 else 1 end)::timestamp + time '16:00:00') at time zone 'UTC'))
  ) then
    raise exception 'Reminder queue changed or has already been attempted; no reconciliation was applied.' using errcode = '40001';
  end if;

  v_before := jsonb_build_object(
    'master_invoice', jsonb_build_object('id', master_invoice.id, 'total', master_invoice.total, 'payment_plan', master_invoice.proposal_context->'payment_plan'),
    'draft_invoice', jsonb_build_object('id', draft_invoice.id, 'status', draft_invoice.status, 'total', draft_invoice.total, 'subtotal', draft_invoice.subtotal, 'original_subtotal', draft_invoice.original_subtotal, 'original_total', draft_invoice.original_total, 'line_items', draft_invoice.line_items, 'notes', draft_invoice.notes, 'due_date', draft_invoice.due_date, 'parent_invoice_id', draft_invoice.parent_invoice_id),
    'old_proposal', jsonb_build_object('id', old_proposal.id, 'status', old_proposal.status, 'offer_status', old_proposal.offer_status, 'supersedes_invoice_id', old_proposal.supersedes_invoice_id, 'total', old_proposal.total),
    'payment', (select jsonb_agg(jsonb_build_object('id', p.id, 'invoice_id', p.invoice_id, 'amount', p.amount, 'status', p.status, 'paid_at', p.paid_at, 'received_date', p.received_date, 'created_at', p.created_at) order by p.created_at) from public.luxor_payments p where p.booking_id = booking.id and p.status = 'paid' and abs(p.amount - 500) < 0.005),
    'security_invoice', (select jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status, 'total', i.total, 'due_date', i.due_date, 'parent_invoice_id', i.parent_invoice_id) order by i.created_at) from public.luxor_invoices i where i.booking_id = booking.id and i.parent_invoice_id = master_invoice.id and i.invoice_kind = 'security_deposit'),
    'installments', (select jsonb_agg(jsonb_build_object('id', p.id, 'order', p.installment_order, 'due_at', p.due_at, 'status', p.status, 'amount', p.amount, 'paid_at', p.paid_at, 'metadata', p.metadata) order by p.installment_order) from public.luxor_payment_installments p where p.booking_id = booking.id and p.invoice_id = master_invoice.id and p.installment_order between 1 and 6),
    'reminders', (select jsonb_agg(jsonb_build_object('id', j.id, 'status', j.status, 'scheduled_for', j.scheduled_for, 'attempts', j.attempts, 'sent_at', j.sent_at, 'metadata', j.metadata) order by j.scheduled_for) from public.luxor_email_jobs j where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder' and j.test_run_id is null and j.status = 'queued')
  );

  v_context := master_invoice.proposal_context;
  v_plan := v_context->'payment_plan';
  select jsonb_agg(
    case (r.value->>'installment_order')::integer
      when 1 then jsonb_set(r.value, '{due_at}', to_jsonb('2026-11-01'::text), true)
      when 2 then jsonb_set(r.value, '{due_at}', to_jsonb('2026-11-30'::text), true)
      when 3 then jsonb_set(r.value, '{due_at}', to_jsonb('2026-12-31'::text), true)
      when 4 then jsonb_set(r.value, '{due_at}', to_jsonb('2027-01-31'::text), true)
      when 5 then jsonb_set(r.value, '{due_at}', to_jsonb('2027-02-28'::text), true)
      when 6 then jsonb_set(r.value, '{due_at}', to_jsonb('2027-03-30'::text), true)
      else r.value
    end order by (r.value->>'installment_order')::integer
  ) into v_next_rows
  from jsonb_array_elements(v_plan->'schedule_rows') r(value);
  if jsonb_array_length(coalesce(v_next_rows, '[]'::jsonb)) <> 6 then
    raise exception 'Master schedule snapshot changed; no reconciliation was applied.' using errcode = '40001';
  end if;
  v_next_plan := jsonb_set(v_plan, '{booking_date}', to_jsonb('2026-10-31'::text), true);
  v_next_plan := jsonb_set(v_next_plan, '{schedule_rows}', v_next_rows, true);
  v_selection := coalesce(v_context->'pricing_selection', '{}'::jsonb);
  v_selection_plan := coalesce(v_selection->'paymentPlan', '{}'::jsonb) || v_next_plan;
  v_selection := jsonb_set(v_selection, '{paymentPlan}', v_selection_plan, true);
  v_context := jsonb_set(v_context, '{payment_plan}', v_next_plan, true);
  v_context := jsonb_set(v_context, '{pricing_selection}', v_selection, true);

  update public.luxor_invoices
  set line_items = jsonb_set(jsonb_set(draft_invoice.line_items, '{0,total}', to_jsonb(3256.28), true), '{0,unitPrice}', to_jsonb(3256.28), true),
      subtotal = 3256.28,
      total = 3256.28,
      original_subtotal = 3256.28,
      original_total = 3256.28,
      notes = 'Internal collection note: this draft collects the remaining balance of the accepted Luxor services total. Accepted Luxor services: $3,756.28; less the $500.00 booking payment received October 31, 2026; remaining balance: $3,256.28. The separate refundable $750.00 security deposit is not included.',
      updated_at = v_now
  where id = draft_invoice.id;

  update public.luxor_invoices
  set offer_status = 'withdrawn', updated_at = v_now
  where id = old_proposal.id;

  insert into public.luxor_proposal_activity(
    proposal_family_id, invoice_id, inquiry_id, event_type, actor_type, actor_email,
    occurred_at, activity_key, details
  ) values (
    old_proposal.proposal_family_id, old_proposal.id, old_proposal.inquiry_id,
    'superseded', 'administrator', lower(btrim(p_actor_email)), v_now,
    v_operation_key || ':superseded',
    jsonb_build_object('replaced_by_invoice_id', master_invoice.id, 'reason', 'The later accepted and signed Luxor package proposal replaced this unaccepted proposal; the original proposal and delivery history are retained.')
  ) on conflict (activity_key) do nothing;

  update public.luxor_payment_installments p
  set due_at = case p.installment_order
        when 2 then timestamptz '2026-11-30 12:00:00+00'
        when 3 then timestamptz '2026-12-31 12:00:00+00'
        when 4 then timestamptz '2027-01-31 12:00:00+00'
        when 5 then timestamptz '2027-02-28 12:00:00+00'
        else p.due_at
      end,
      metadata = p.metadata || jsonb_build_object('schedule_anchor_date', '2026-10-31'),
      updated_at = v_now
  where p.booking_id = booking.id and p.invoice_id = master_invoice.id and p.installment_order between 1 and 6;

  with reminder_remap as (
    select
      j.id as job_id,
      j.metadata->>'milestone' as milestone,
      case p.installment_order
        when 2 then date '2026-12-01'
        when 3 then date '2027-01-01'
        when 4 then date '2027-02-01'
        when 5 then date '2027-03-01'
      end as old_due_date,
      (p.due_at at time zone 'UTC')::date as new_due_date,
      case j.metadata->>'milestone'
        when 'installment_7_days_before' then (((p.due_at at time zone 'UTC')::date - 7)::timestamp + time '10:00:00') at time zone 'America/Chicago'
        when 'installment_1_day_overdue' then (((p.due_at at time zone 'UTC')::date + 1)::timestamp + time '10:00:00') at time zone 'America/Chicago'
      end as new_scheduled_for
    from public.luxor_email_jobs j
    join public.luxor_payment_installments p
      on p.id::text = j.metadata->>'installment_id'
    where j.booking_id = booking.id
      and j.job_type = 'installment_payment_reminder'
      and j.test_run_id is null
      and j.status = 'queued'
      and j.attempts = 0
      and j.sent_at is null
      and p.booking_id = booking.id
      and p.invoice_id = master_invoice.id
      and p.installment_order between 2 and 5
  )
  update public.luxor_email_jobs j
  set scheduled_for = r.new_scheduled_for,
      body = replace(j.body, r.old_due_date::text, r.new_due_date::text),
      metadata = j.metadata || jsonb_build_object(
        'due_date', r.new_due_date::text,
        'automation_key', 'installment:' || booking.id::text || ':' || (j.metadata->>'installment_id') || ':' || r.new_due_date::text || ':' || r.milestone
      ),
      updated_at = v_now
  from reminder_remap r
  where j.id = r.job_id
    and r.new_scheduled_for is not null
    and position(r.old_due_date::text in coalesce(j.body, '')) > 0;
  get diagnostics v_reminder_updated_count = row_count;
  if v_reminder_updated_count <> 8
    or (select count(*) from public.luxor_email_jobs j where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder' and j.test_run_id is null and j.status = 'queued') <> 8
    or exists (
      select 1 from public.luxor_email_jobs j
      left join public.luxor_payment_installments p on p.id::text = j.metadata->>'installment_id'
      where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder' and j.test_run_id is null and j.status = 'queued'
        and (p.id is null or p.installment_order not between 2 and 5
          or j.sent_at is not null or j.attempts <> 0
          or j.metadata->>'due_date' is distinct from (p.due_at at time zone 'UTC')::date::text
          or j.metadata->>'automation_key' is distinct from ('installment:' || booking.id::text || ':' || p.id::text || ':' || (p.due_at at time zone 'UTC')::date::text || ':' || coalesce(j.metadata->>'milestone', ''))
          or position(((p.due_at at time zone 'UTC')::date::text) in coalesce(j.body, '')) = 0
          or j.scheduled_for is distinct from ((((p.due_at at time zone 'UTC')::date + case j.metadata->>'milestone' when 'installment_7_days_before' then -7 else 1 end)::timestamp + time '16:00:00') at time zone 'UTC'))
    ) then
    raise exception 'Queued reminder rows could not be updated atomically; no reconciliation was applied.' using errcode = '40001';
  end if;

  update public.luxor_invoices
  set proposal_context = v_context, updated_at = v_now
  where id = master_invoice.id;

  v_after := jsonb_build_object(
    'master_invoice', jsonb_build_object('id', master_invoice.id, 'total', master_invoice.total, 'payment_plan', v_next_plan),
    'draft_invoice', jsonb_build_object('id', draft_invoice.id, 'status', draft_invoice.status, 'total', 3256.28, 'subtotal', 3256.28, 'original_subtotal', 3256.28, 'original_total', 3256.28, 'line_items', jsonb_set(jsonb_set(draft_invoice.line_items, '{0,total}', to_jsonb(3256.28), true), '{0,unitPrice}', to_jsonb(3256.28), true), 'notes', 'Internal collection note: this draft collects the remaining balance of the accepted Luxor services total. Accepted Luxor services: $3,756.28; less the $500.00 booking payment received October 31, 2026; remaining balance: $3,256.28. The separate refundable $750.00 security deposit is not included.', 'due_date', draft_invoice.due_date, 'parent_invoice_id', draft_invoice.parent_invoice_id),
    'old_proposal', jsonb_build_object('id', old_proposal.id, 'status', old_proposal.status, 'offer_status', 'withdrawn', 'supersedes_invoice_id', old_proposal.supersedes_invoice_id, 'total', old_proposal.total, 'history_event', 'superseded', 'replaced_by_invoice_id', master_invoice.id),
    'payment', (select jsonb_agg(jsonb_build_object('id', p.id, 'invoice_id', p.invoice_id, 'amount', p.amount, 'status', p.status, 'paid_at', p.paid_at, 'received_date', p.received_date, 'created_at', p.created_at) order by p.created_at) from public.luxor_payments p where p.booking_id = booking.id and p.status = 'paid' and abs(p.amount - 500) < 0.005),
    'security_invoice', (select jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status, 'total', i.total, 'due_date', i.due_date, 'parent_invoice_id', i.parent_invoice_id) order by i.created_at) from public.luxor_invoices i where i.booking_id = booking.id and i.parent_invoice_id = master_invoice.id and i.invoice_kind = 'security_deposit'),
    'installments', (select jsonb_agg(jsonb_build_object('id', p.id, 'order', p.installment_order, 'due_at', p.due_at, 'status', p.status, 'amount', p.amount, 'paid_at', p.paid_at, 'metadata', p.metadata) order by p.installment_order) from public.luxor_payment_installments p where p.booking_id = booking.id and p.invoice_id = master_invoice.id and p.installment_order between 1 and 6),
    'reminders', (select jsonb_agg(jsonb_build_object('id', j.id, 'status', j.status, 'scheduled_for', j.scheduled_for, 'attempts', j.attempts, 'sent_at', j.sent_at, 'metadata', j.metadata) order by j.scheduled_for) from public.luxor_email_jobs j where j.booking_id = booking.id and j.job_type = 'installment_payment_reminder' and j.test_run_id is null)
  );

  insert into public.luxor_financial_audit(action, actor_email, invoice_id, occurred_at, reason, before_state, after_state, details)
  values (
    'legacy_package_reconciliation_v1', lower(btrim(p_actor_email)), master_invoice.id, v_now,
    'Owner-approved correction of the legacy official Luxor package ownership split and signed installment anchor.',
    v_before, v_after,
    jsonb_build_object('operation_key', v_operation_key, 'booking_id', booking.id, 'draft_invoice_id', draft_invoice.id, 'superseded_proposal_id', old_proposal.id, 'signed_snapshot_anchor', '2026-10-31', 'reminder_queue_reconciliation', 'updated atomically; no reminder was sent')
  ) returning * into audit_row;

  return jsonb_build_object(
    'changed', true,
    'audit_id', audit_row.id,
    'operation_key', v_operation_key,
    'booking_id', booking.id,
    'master_invoice_id', master_invoice.id,
    'draft_invoice_id', draft_invoice.id,
    'superseded_proposal_id', old_proposal.id,
    'expected_active_reminders', 8,
    'reminders_updated', v_reminder_updated_count,
    'sent_reminder_count', 0
  );
end;
$$;

revoke all on function public.luxor_reconcile_legacy_package_booking(uuid, text) from public, anon, authenticated;
grant execute on function public.luxor_reconcile_legacy_package_booking(uuid, text) to service_role;

notify pgrst, 'reload schema';
