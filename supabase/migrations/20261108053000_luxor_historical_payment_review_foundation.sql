begin;

-- This is a review journal only. It never determines whether evidence proves
-- settlement, creates a payment, or changes an expense, bill, or balance.
create table public.luxor_historical_payment_reviews (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.luxor_booking_expenses(id) on delete restrict,
  request_id uuid not null unique,
  supersedes_id uuid unique references public.luxor_historical_payment_reviews(id) on delete restrict,
  claimed_evidence_reference text not null check (char_length(btrim(claimed_evidence_reference)) between 1 and 1000),
  claimed_evidence_version text not null check (char_length(btrim(claimed_evidence_version)) between 1 and 500),
  -- These are unverified claims, not proof the bytes exist, match the digest,
  -- or are retained immutably. This journal never fetches or verifies them.
  claimed_evidence_sha256 text not null check (claimed_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  review_note text not null check (char_length(btrim(review_note)) between 1 and 4000),
  recorded_by text not null check (char_length(btrim(recorded_by)) between 1 and 320),
  recorded_at timestamptz not null default clock_timestamp(),
  expense_snapshot jsonb not null,
  payment_snapshot jsonb not null
);
create index luxor_historical_payment_reviews_expense_idx
  on public.luxor_historical_payment_reviews(expense_id, recorded_at, id);
create unique index luxor_historical_payment_reviews_one_root_idx
  on public.luxor_historical_payment_reviews(expense_id) where supersedes_id is null;

alter table public.luxor_historical_payment_reviews enable row level security;
revoke all on public.luxor_historical_payment_reviews from public, anon, authenticated, service_role;
grant select on public.luxor_historical_payment_reviews to service_role;

create function public.luxor_prevent_historical_payment_review_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Historical payment reviews are append-only.' using errcode = '55000';
end;
$$;
create trigger luxor_historical_payment_reviews_append_only
  before update or delete on public.luxor_historical_payment_reviews
  for each row execute function public.luxor_prevent_historical_payment_review_mutation();
revoke all on function public.luxor_prevent_historical_payment_review_mutation() from public, anon, authenticated;

-- The same expense lock as payment/correction writes makes the snapshots
-- consistent with those operations. Corrections append a successor, never edit.
create function public.luxor_record_historical_payment_review(
  p_expense_id uuid, p_request_id uuid, p_supersedes_id uuid,
  p_evidence_reference text, p_evidence_version text, p_evidence_sha256 text,
  p_review_note text, p_actor text, p_session_issued_at_ms bigint,
  p_session_expires_at_ms bigint
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_expense public.luxor_booking_expenses%rowtype;
  v_existing public.luxor_historical_payment_reviews%rowtype;
  v_prior public.luxor_historical_payment_reviews%rowtype;
  v_result public.luxor_historical_payment_reviews%rowtype;
  v_payments jsonb;
  v_member public.luxor_portal_members%rowtype;
  v_now_ms numeric;
begin
  if p_expense_id is null or p_request_id is null
     or char_length(btrim(coalesce(p_evidence_reference,''))) not between 1 and 1000
     or char_length(btrim(coalesce(p_evidence_version,''))) not between 1 and 500
     or coalesce(p_evidence_sha256,'') !~ '^[0-9a-f]{64}$'
     or char_length(btrim(coalesce(p_review_note,''))) not between 1 and 4000
     or char_length(btrim(coalesce(p_actor,''))) not between 1 and 320 then
    raise exception 'A review requires an expense, request, evidence reference, version, digest, note, and actor.' using errcode = '22023';
  end if;
  -- Membership changes update this row. Holding a shared row lock through the
  -- insert orders this transaction with revocation and permission changes.
  -- The trusted server must authenticate the signed cookie before passing its
  -- claims: the service role and this RPC cannot verify that signature.
  select * into v_member from public.luxor_portal_members
    where email = lower(btrim(p_actor)) for share;
  v_now_ms := floor(extract(epoch from clock_timestamp()) * 1000);
  if not found or v_member.status <> 'active'
     or not (v_member.role = 'owner' or (jsonb_typeof(v_member.permissions) = 'array'
       and v_member.permissions ? 'operations' and v_member.permissions ? 'finances'))
     or p_session_issued_at_ms is null or p_session_expires_at_ms is null
     or p_session_issued_at_ms <= 0 or p_session_issued_at_ms > v_now_ms
     or p_session_expires_at_ms <= v_now_ms
     or p_session_expires_at_ms::numeric - p_session_issued_at_ms::numeric > 604800000
     or (v_member.sessions_revoked_at is not null and p_session_issued_at_ms <= floor(extract(epoch from v_member.sessions_revoked_at) * 1000)) then
    raise exception 'Authorized portal session required.' using errcode = '42501';
  end if;
  select * into v_expense from public.luxor_booking_expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found.' using errcode = 'P0002'; end if;
  -- The expense lock may have waited until after the cookie expired.
  if p_session_expires_at_ms <= floor(extract(epoch from clock_timestamp()) * 1000) then
    raise exception 'Authorized portal session required.' using errcode = '42501';
  end if;

  select * into v_existing from public.luxor_historical_payment_reviews where request_id = p_request_id;
  if found then
    if v_existing.expense_id is distinct from p_expense_id
       or v_existing.supersedes_id is distinct from p_supersedes_id
       or v_existing.claimed_evidence_reference is distinct from btrim(p_evidence_reference)
       or v_existing.claimed_evidence_version is distinct from btrim(p_evidence_version)
       or v_existing.claimed_evidence_sha256 is distinct from p_evidence_sha256
       or v_existing.review_note is distinct from btrim(p_review_note)
       or v_existing.recorded_by is distinct from lower(btrim(p_actor)) then
      raise exception 'Review request was already used for different details.' using errcode = '23505';
    end if;
    return jsonb_build_object('review', to_jsonb(v_existing), 'replayed', true);
  end if;
  if p_supersedes_id is null and exists(select 1 from public.luxor_historical_payment_reviews where expense_id = p_expense_id) then
    raise exception 'This expense already has a review; correct the latest version.' using errcode = '55000';
  end if;
  if p_supersedes_id is not null then
    select * into v_prior from public.luxor_historical_payment_reviews where id = p_supersedes_id;
    if not found or v_prior.expense_id <> p_expense_id then
      raise exception 'The prior review must belong to this expense.' using errcode = '22023';
    end if;
    if exists(select 1 from public.luxor_historical_payment_reviews where supersedes_id = p_supersedes_id) then
      raise exception 'This review has already been corrected; review the latest version.' using errcode = '55000';
    end if;
  end if;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at, p.id), '[]'::jsonb)
    into v_payments from public.luxor_expense_payments p where p.expense_id = p_expense_id;
  if p_session_expires_at_ms <= floor(extract(epoch from clock_timestamp()) * 1000) then
    raise exception 'Authorized portal session required.' using errcode = '42501';
  end if;
  insert into public.luxor_historical_payment_reviews
    (expense_id, request_id, supersedes_id, claimed_evidence_reference, claimed_evidence_version,
     claimed_evidence_sha256, review_note, recorded_by, expense_snapshot, payment_snapshot)
  values (p_expense_id, p_request_id, p_supersedes_id, btrim(p_evidence_reference),
    btrim(p_evidence_version), p_evidence_sha256, btrim(p_review_note), lower(btrim(p_actor)),
    to_jsonb(v_expense), v_payments) returning * into v_result;
  return jsonb_build_object('review', to_jsonb(v_result), 'replayed', false);
end;
$$;
revoke all on function public.luxor_record_historical_payment_review(uuid,uuid,uuid,text,text,text,text,text,bigint,bigint) from public, anon, authenticated;
-- The service role is trusted infrastructure; it cannot independently verify a
-- portal cookie. Server callers must derive p_actor from an authorized session.
grant execute on function public.luxor_record_historical_payment_review(uuid,uuid,uuid,text,text,text,text,text,bigint,bigint) to service_role;

commit;
