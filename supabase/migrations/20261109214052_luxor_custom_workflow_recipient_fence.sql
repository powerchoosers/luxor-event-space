-- Require the queued destination to match the current contact at provider authorization.
CREATE OR REPLACE FUNCTION public.luxor_custom_workflow_authorize_message_job_at(p_job_id uuid, p_channel text, p_pre_send_at timestamp with time zone)
 RETURNS TABLE(allowed boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  run public.luxor_custom_workflow_step_runs%rowtype;
  enrollment public.luxor_custom_workflow_enrollments%rowtype;
  workflow public.luxor_custom_workflows%rowtype;
  inquiry_id uuid;
  job_status text;
  linked_run_id uuid;
  recipient text;
  current_email text;
  current_phone text;
begin
  if not public.luxor_custom_workflow_runtime_enabled() then
    return query select false,'custom_workflow_execution_disabled'::text;
    return;
  end if;
  if p_channel='email' then
    select j.custom_workflow_step_run_id,j.inquiry_id,j.status,j.recipient_email into linked_run_id,inquiry_id,job_status,recipient
      from public.luxor_email_jobs as j where j.id=p_job_id and j.job_type='custom_workflow' for update of j;
  elsif p_channel='text' then
    select j.custom_workflow_step_run_id,j.inquiry_id,j.status,j.recipient_phone into linked_run_id,inquiry_id,job_status,recipient
      from public.luxor_text_jobs as j where j.id=p_job_id and j.job_type='custom_workflow' for update of j;
  else
    return query select false,'unsupported_channel'::text; return;
  end if;
  if linked_run_id is null then return query select false,'job_not_linked'::text; return; end if;
  select * into run from public.luxor_custom_workflow_step_runs where id=linked_run_id for update;
  select * into enrollment from public.luxor_custom_workflow_enrollments where id=run.enrollment_id for update;
  select * into workflow from public.luxor_custom_workflows where id=enrollment.workflow_id for update;
  if job_status <> 'sending' or run.status <> 'sending' or run.channel <> p_channel
    or enrollment.current_step_id is distinct from run.step_id then
    return query select false,'claim_or_current_step_changed'::text; return;
  end if;
  if p_channel='text' and not public.luxor_custom_workflow_is_within_sms_send_window(p_pre_send_at) then
    update public.luxor_text_jobs set status='queued',attempts=greatest(0,attempts-1),last_error=null,updated_at=now() where id=p_job_id;
    update public.luxor_custom_workflow_step_runs set status='queued',last_error=null,updated_at=now() where id=run.id;
    return query select false,'outside_sms_send_window'::text; return;
  end if;
  if run.scheduled_for>now() or enrollment.next_run_at>now() then
    if p_channel='email' then
      update public.luxor_email_jobs set status='queued',attempts=greatest(0,attempts-1),last_error=null,updated_at=now() where id=p_job_id;
    else
      update public.luxor_text_jobs set status='queued',attempts=greatest(0,attempts-1),last_error=null,updated_at=now() where id=p_job_id;
    end if;
    update public.luxor_custom_workflow_step_runs set status='queued',last_error=null,updated_at=now() where id=run.id;
    return query select false,'not_due'::text; return;
  end if;
  if workflow.status='paused' or enrollment.status='paused' then
    if p_channel='email' then
      update public.luxor_email_jobs set status='queued',attempts=greatest(0,attempts-1),last_error=null,updated_at=now() where id=p_job_id;
    else
      update public.luxor_text_jobs set status='queued',attempts=greatest(0,attempts-1),last_error=null,updated_at=now() where id=p_job_id;
    end if;
    update public.luxor_custom_workflow_step_runs set status='queued',last_error=null,updated_at=now() where id=run.id;
    return query select false,'workflow_paused'::text; return;
  end if;
  -- The queue snapshot may be older than the contact's current destination.
  -- Read it again at the final authorization boundary; never send a stale
  -- message to a former address or number even if current consent is valid.
  select i.email,i.phone into current_email,current_phone from public.luxor_inquiries i where i.id=inquiry_id for update;
  if enrollment.status <> 'active' or workflow.status <> 'active'
    or inquiry_id is distinct from enrollment.inquiry_id
    or (p_channel='email' and (nullif(btrim(coalesce(current_email,'')),'') is null or lower(btrim(coalesce(recipient,''))) <> lower(btrim(current_email))))
    or (p_channel='text' and (public.luxor_workflow_normalize_phone(current_phone) is null or coalesce(recipient,'') <> public.luxor_workflow_normalize_phone(current_phone)))
    or not public.luxor_custom_workflow_enrollment_is_eligible(enrollment.id,p_channel) then
    perform public.luxor_custom_workflow_stop_step(run.id,'Eligibility, consent, or workflow status changed before provider dispatch.');
    return query select false,'recipient_or_workflow_no_longer_eligible'::text; return;
  end if;
  return query select true,null::text;
end;
$function$;

revoke all on function public.luxor_custom_workflow_authorize_message_job_at(uuid,text,timestamptz) from public,anon,authenticated,service_role;

-- Created last so application code never advertises the trigger when only the
-- outbox or consumer has been installed. The authenticated route also checks
-- the separate authoring, activation and execution controls.
create function public.luxor_custom_workflow_attended_tour_capability()
returns boolean language sql stable security definer set search_path = '' as $$
  select true;
$$;
revoke all on function public.luxor_custom_workflow_attended_tour_capability() from public,anon,authenticated;
grant execute on function public.luxor_custom_workflow_attended_tour_capability() to service_role;
