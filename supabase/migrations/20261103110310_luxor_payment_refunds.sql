create table if not exists public.luxor_payment_refunds (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  source_payment_id uuid not null references public.luxor_payments(id) on delete restrict,
  booking_id uuid not null references public.luxor_bookings(id) on delete restrict,
  invoice_id uuid not null references public.luxor_invoices(id) on delete restrict,
  inquiry_id uuid references public.luxor_inquiries(id) on delete restrict,
  refund_kind text not null check (refund_kind in ('security_deposit')),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'usd' check (currency = lower(currency) and currency = 'usd'),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'uncertain')),
  processor text not null default 'stripe' check (processor = 'stripe'),
  processor_payment_intent_id text not null,
  processor_refund_id text,
  idempotency_key text not null unique,
  requested_by text not null,
  requested_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz,
  failure_code text,
  livemode boolean not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint luxor_payment_refunds_booking_invoice_kind_unique unique (booking_id, invoice_id, refund_kind),
  constraint luxor_payment_refunds_processor_refund_id_unique unique (processor, processor_refund_id)
);

create index if not exists luxor_payment_refunds_booking_created_idx
  on public.luxor_payment_refunds (booking_id, created_at desc);
create index if not exists luxor_payment_refunds_inquiry_created_idx
  on public.luxor_payment_refunds (inquiry_id, created_at desc);
create index if not exists luxor_payment_refunds_source_idx
  on public.luxor_payment_refunds (source_payment_id);

create or replace function public.luxor_reserve_payment_refund(
  p_source_payment_id uuid,
  p_booking_id uuid,
  p_invoice_id uuid,
  p_inquiry_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_processor_payment_intent_id text,
  p_requested_by text,
  p_livemode boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.luxor_payments%rowtype;
  v_existing public.luxor_payment_refunds%rowtype;
  v_refund public.luxor_payment_refunds%rowtype;
begin
  perform 1 from public.luxor_bookings b where b.id = p_booking_id for update;
  if not found then raise exception 'Booking not found.' using errcode = 'P0002'; end if;

  select * into v_payment from public.luxor_payments p
    where p.id = p_source_payment_id for update;
  if not found then raise exception 'Source payment not found.' using errcode = 'P0002'; end if;
  if v_payment.status <> 'paid'
    or v_payment.booking_id is distinct from p_booking_id
    or v_payment.invoice_id is distinct from p_invoice_id
    or v_payment.inquiry_id is distinct from p_inquiry_id
    or p_amount is null
    or p_amount <= 0 or p_amount > v_payment.amount
    or p_idempotency_key is null or length(trim(p_idempotency_key)) < 16
    or p_processor_payment_intent_id is null or p_requested_by is null or p_livemode is null then
    raise exception 'The source payment or refund request failed validation.' using errcode = '23514';
  end if;

  select * into v_existing from public.luxor_payment_refunds r
    where r.booking_id = p_booking_id and r.invoice_id = p_invoice_id and r.refund_kind = 'security_deposit';
  if found then
    if v_existing.source_payment_id is distinct from p_source_payment_id
      or v_existing.amount is distinct from p_amount
      or v_existing.idempotency_key is distinct from p_idempotency_key
      or v_existing.processor_payment_intent_id is distinct from p_processor_payment_intent_id
      or v_existing.livemode is distinct from p_livemode then
      raise exception 'A different refund request already exists for this booking invoice.' using errcode = '23505';
    end if;
    return to_jsonb(v_existing) || jsonb_build_object('created', false);
  end if;

  insert into public.luxor_payment_refunds (
    source_payment_id, booking_id, invoice_id, inquiry_id, refund_kind, amount,
    idempotency_key, processor_payment_intent_id, requested_by, livemode
  ) values (
    p_source_payment_id, p_booking_id, p_invoice_id, p_inquiry_id, 'security_deposit', p_amount,
    p_idempotency_key, p_processor_payment_intent_id, p_requested_by, p_livemode
  ) returning * into v_refund;
  return to_jsonb(v_refund) || jsonb_build_object('created', true);
end;
$$;

create or replace function public.luxor_record_payment_refund_result(
  p_refund_id uuid,
  p_status text,
  p_processor_refund_id text default null,
  p_failure_code text default null,
  p_livemode boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.luxor_payment_refunds%rowtype;
  v_target text;
begin
  if p_status not in ('pending', 'succeeded', 'failed', 'uncertain') then
    raise exception 'Invalid refund status.' using errcode = '22023';
  end if;
  select * into v_refund from public.luxor_payment_refunds r
    where r.id = p_refund_id for update;
  if not found then raise exception 'Refund request not found.' using errcode = 'P0002'; end if;
  if p_livemode is not null and v_refund.livemode is distinct from p_livemode then
    raise exception 'Refund environment does not match the recorded request.' using errcode = '23514';
  end if;
  if p_processor_refund_id is not null and v_refund.processor_refund_id is not null
    and v_refund.processor_refund_id is distinct from p_processor_refund_id then
    raise exception 'Refund request is already linked to a different Stripe refund.' using errcode = '23505';
  end if;

  v_target := v_refund.status;
  if v_refund.status <> 'succeeded' then
    if p_status = 'succeeded' then v_target := 'succeeded';
    elsif v_refund.status = 'pending' and p_status in ('failed', 'uncertain') then v_target := p_status;
    elsif v_refund.status = 'uncertain' and p_status = 'failed' then v_target := 'failed';
    elsif v_refund.status = 'failed' and p_status = 'uncertain' then v_target := 'uncertain';
    end if;
  end if;

  update public.luxor_payment_refunds r
    set status = v_target,
        processor_refund_id = coalesce(r.processor_refund_id, p_processor_refund_id),
        failure_code = case when v_target = 'failed' then coalesce(p_failure_code, r.failure_code) else null end,
        completed_at = case when v_target in ('succeeded', 'failed') then coalesce(r.completed_at, timezone('utc'::text, now())) else null end,
        updated_at = timezone('utc'::text, now())
    where r.id = p_refund_id returning * into v_refund;

  if v_refund.status = 'succeeded' then
    update public.luxor_bookings b
      set security_deposit_status = 'refunded',
          metadata = coalesce(b.metadata, '{}'::jsonb) || jsonb_build_object(
            'security_deposit_refunded_at', v_refund.completed_at,
            'security_deposit_refund_id', v_refund.processor_refund_id,
            'security_deposit_refund_amount', v_refund.amount
          ),
          updated_at = timezone('utc'::text, now())
      where b.id = v_refund.booking_id;
  end if;
  return to_jsonb(v_refund);
end;
$$;

alter table public.luxor_payment_refunds enable row level security;
revoke all on table public.luxor_payment_refunds from public, anon, authenticated;
grant select, insert, update on table public.luxor_payment_refunds to service_role;
drop policy if exists "Service role can manage Luxor payment refunds" on public.luxor_payment_refunds;
create policy "Service role can manage Luxor payment refunds"
  on public.luxor_payment_refunds for all to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');
revoke all on function public.luxor_reserve_payment_refund(uuid, uuid, uuid, uuid, numeric, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.luxor_reserve_payment_refund(uuid, uuid, uuid, uuid, numeric, text, text, text, boolean) to service_role;
revoke all on function public.luxor_record_payment_refund_result(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.luxor_record_payment_refund_result(uuid, text, text, text, boolean) to service_role;
