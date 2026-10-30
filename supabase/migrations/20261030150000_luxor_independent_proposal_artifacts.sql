-- Keep each sent final proposal and package breakdown as its own immutable artifact.
-- Reuse the existing service-role-only, append-only activity ledger so no new
-- database permission surface is introduced.

alter table public.luxor_proposal_activity
  drop constraint if exists luxor_proposal_activity_event_type_check;
alter table public.luxor_proposal_activity
  add constraint luxor_proposal_activity_event_type_check check (event_type in (
    'created', 'edited', 'send_started', 'send_failed', 'sent', 'resent',
    'delivered', 'viewed', 'accepted', 'declined', 'expired', 'superseded',
    'artifact_saved'
  ));

create or replace function public.luxor_complete_proposal_send(
  p_attempt_id uuid,
  p_provider_message_id text,
  p_sent_at timestamptz default now()
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  attempt public.luxor_proposal_send_attempts%rowtype;
  family public.luxor_proposal_families%rowtype;
  invoice public.luxor_invoices%rowtype;
  v_sent_at timestamptz := coalesce(p_sent_at, now());
  event_type text;
  is_breakdown boolean;
  artifact_type text;
  artifact_snapshot jsonb;
  artifact_status text;
  activity_details jsonb;
begin
  select * into attempt from public.luxor_proposal_send_attempts a where a.id = p_attempt_id for update;
  if not found then raise exception 'Proposal send attempt not found.' using errcode = 'P0001'; end if;
  select * into invoice from public.luxor_invoices i where i.id = attempt.invoice_id for update;
  if not found then raise exception 'Proposal no longer exists.' using errcode = 'P0001'; end if;
  if attempt.state in ('sent', 'delivered', 'bounced') then return to_jsonb(invoice); end if;
  if attempt.state not in ('preparing', 'sending', 'delivery_unconfirmed') then
    raise exception 'Only an active proposal send can be completed.' using errcode = 'P0001';
  end if;
  select * into family from public.luxor_proposal_families f where f.id = attempt.proposal_family_id for update;
  if not found then raise exception 'Proposal family not found.' using errcode = 'P0001'; end if;

  is_breakdown := invoice.proposal_context ->> 'proposal_record_type' = 'proposal_breakdown';
  if not is_breakdown then
    if family.proposal_number is null then
      update public.luxor_proposal_families f set proposal_number = attempt.proposed_number,
        first_sent_at = v_sent_at, latest_sent_at = v_sent_at, updated_at = now()
      where f.id = family.id and f.proposal_number is null;
    elsif family.proposal_number is distinct from attempt.proposed_number then
      raise exception 'Proposal numbering changed during send; delivery needs review.' using errcode = 'P0001';
    else
      update public.luxor_proposal_families f set latest_sent_at = greatest(coalesce(f.latest_sent_at, v_sent_at), v_sent_at), updated_at = now()
      where f.id = family.id;
    end if;
    select * into family from public.luxor_proposal_families f where f.id = attempt.proposal_family_id;
    update public.luxor_invoices i set
      proposal_number = family.proposal_number,
      proposal_first_sent_at = family.first_sent_at,
      proposal_latest_sent_at = family.latest_sent_at
    where i.proposal_family_id = family.id;
  end if;

  update public.luxor_invoices i set status = 'sent', proposal_sent_at = v_sent_at,
    proposal_first_sent_at = case when is_breakdown then i.proposal_first_sent_at else family.first_sent_at end,
    proposal_latest_sent_at = case when is_breakdown then i.proposal_latest_sent_at else family.latest_sent_at end,
    proposal_number = case when is_breakdown then family.proposal_number else family.proposal_number end,
    updated_at = greatest(i.updated_at, v_sent_at)
  where i.id = invoice.id returning i.* into invoice;

  update public.luxor_proposal_send_attempts a set state = 'sent', sent_at = v_sent_at,
    provider_message_id = nullif(left(p_provider_message_id, 500), ''), updated_at = now()
  where a.id = attempt.id returning * into attempt;

  event_type := case when not is_breakdown and attempt.attempt_number > 1 and family.first_sent_at < v_sent_at then 'resent' else 'sent' end;
  perform public.luxor_append_proposal_activity(invoice.id, event_type, 'administrator', attempt.actor_email,
    attempt.recipient_email, attempt.provider, attempt.provider_message_id, v_sent_at,
    'send-completed:' || attempt.id::text,
    jsonb_build_object('attempt_id', attempt.id, 'proposal_number', coalesce(family.proposal_number, attempt.proposed_number),
      'proposal_version', invoice.proposal_version, 'channel', attempt.channel));

  artifact_type := case when is_breakdown then 'proposal_breakdown_email' when attempt.channel = 'in_person' then 'in_person' else 'proposal_email' end;
  artifact_snapshot := case
    when artifact_type = 'proposal_breakdown_email' then invoice.proposal_context #> '{delivery_snapshot,proposal_breakdown_email}'
    when artifact_type = 'proposal_email' then invoice.proposal_context #> '{delivery_snapshot,proposal_email}'
    else invoice.proposal_context #> '{delivery_snapshot,in_person}'
  end;
  artifact_status := case when attempt.state = 'sent' then 'sent' else attempt.state end;
  activity_details := jsonb_build_object('artifact', jsonb_build_object(
    'id', invoice.id::text || ':' || coalesce(invoice.proposal_version, 1)::text || ':' || artifact_type || ':' || attempt.id::text,
    'type', artifact_type,
    'invoice_id', invoice.id,
    'inquiry_id', invoice.inquiry_id,
    'proposal_family_id', invoice.proposal_family_id,
    'related_proposal_invoice_id', invoice.proposal_context ->> 'related_proposal_invoice_id',
    'proposal_number', coalesce(family.proposal_number, attempt.proposed_number),
    'proposal_version', invoice.proposal_version,
    'send_attempt_id', attempt.id,
    'status', artifact_status,
    'sent_at', v_sent_at,
    'recipient_email', attempt.recipient_email,
    'provider_message_id', attempt.provider_message_id,
    'content', coalesce(artifact_snapshot, '{}'::jsonb)
  ));
  perform public.luxor_append_proposal_activity(invoice.id, 'artifact_saved', 'system', attempt.actor_email,
    attempt.recipient_email, attempt.provider, attempt.provider_message_id, v_sent_at,
    'artifact-saved:' || attempt.id::text, activity_details);

  return to_jsonb(invoice);
end;
$$;

-- Reconstruct separate artifact records for legacy rows that already contain
-- independently saved variant snapshots and a matching successful attempt.
with variants as (
  select i.id as invoice_id, i.inquiry_id, i.proposal_family_id, i.proposal_number, i.proposal_version,
    i.proposal_context ->> 'related_proposal_invoice_id' as related_proposal_invoice_id,
    v.variant, v.snapshot,
    nullif(v.snapshot ->> 'proposal_send_attempt_id', '') as attempt_id
  from public.luxor_invoices i
  cross join lateral (values
    ('proposal_email', i.proposal_context #> '{delivery_snapshot,proposal_email}'),
    ('proposal_breakdown_email', i.proposal_context #> '{delivery_snapshot,proposal_breakdown_email}')
  ) as v(variant, snapshot)
  where i.invoice_kind = 'event' and i.inquiry_id is not null and i.proposal_family_id is not null
), reliable as (
  select v.*, a.state, a.sent_at, a.recipient_email, a.provider, a.provider_message_id
  from variants v
  join public.luxor_proposal_send_attempts a on a.id::text = v.attempt_id and a.invoice_id = v.invoice_id
  where jsonb_typeof(v.snapshot) = 'object' and a.state in ('sent', 'delivered', 'bounced') and a.sent_at is not null
)
insert into public.luxor_proposal_activity(
  proposal_family_id, invoice_id, inquiry_id, event_type, actor_type,
  recipient_email, provider, provider_message_id, occurred_at, activity_key, details
)
select r.proposal_family_id, r.invoice_id, r.inquiry_id, 'artifact_saved', 'system',
  r.recipient_email, r.provider, r.provider_message_id, r.sent_at,
  'artifact-legacy:' || r.invoice_id::text || ':' || coalesce(r.proposal_version, 1)::text || ':' || r.variant,
  jsonb_build_object('artifact', jsonb_build_object(
    'id', r.invoice_id::text || ':' || coalesce(r.proposal_version, 1)::text || ':' || r.variant || ':' || r.attempt_id::text,
    'type', r.variant,
    'invoice_id', r.invoice_id,
    'inquiry_id', r.inquiry_id,
    'proposal_family_id', r.proposal_family_id,
    'related_proposal_invoice_id', r.related_proposal_invoice_id,
    'proposal_number', r.proposal_number,
    'proposal_version', r.proposal_version,
    'send_attempt_id', r.attempt_id,
    'status', r.state,
    'sent_at', r.sent_at,
    'recipient_email', r.recipient_email,
    'provider_message_id', r.provider_message_id,
    'content', r.snapshot
  ))
from reliable r
on conflict (activity_key) do nothing;
