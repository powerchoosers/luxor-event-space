-- Keep final-send family timestamp propagation off independent breakdown records.
-- CREATE OR REPLACE preserves the existing security-invoker mode and ACL.

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

  is_breakdown := coalesce(invoice.proposal_context ->> 'proposal_record_type' = 'proposal_breakdown', false);
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
    where i.proposal_family_id = family.id
      and coalesce(i.proposal_context ->> 'proposal_record_type' = 'proposal_breakdown', false) = false;
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
