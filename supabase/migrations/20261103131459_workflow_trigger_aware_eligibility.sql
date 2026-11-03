-- Eligibility follows the immutable workflow trigger, not a contact-form-only assumption.
create or replace function public.luxor_custom_workflow_enrollment_is_eligible(p_enrollment_id uuid, p_channel text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  inquiry public.luxor_inquiries%rowtype;
  trigger_type text;
  inquiry_id uuid;
begin
  select i.id, v.definition->>'trigger' into inquiry_id, trigger_type
    from public.luxor_custom_workflow_enrollments e
    join public.luxor_custom_workflow_versions v on v.id=e.workflow_version_id and v.workflow_id=e.workflow_id
    join public.luxor_inquiries i on i.id=e.inquiry_id
    where e.id=p_enrollment_id;
  if not found then return false; end if;
  select * into inquiry from public.luxor_inquiries where id=inquiry_id;
  if not found or coalesce(inquiry.is_test,false)
    or lower(coalesce(inquiry.metadata->>'is_test_record','false'))='true'
    or inquiry.archived_at is not null or inquiry.status='closed_lost'
    or coalesce(inquiry.follow_up_disposition,'no_response') <> 'no_response' then return false; end if;
  -- Keep the original speed-to-lead sequence cutoff when a tour or booking exists.
  if trigger_type='contact_form_inquiry_created' and p_channel in
    ('follow_up_eligible','email','text','marketing_email_consent','marketing_sms_consent') then
    return public.luxor_custom_workflow_inquiry_is_eligible(inquiry.id,p_channel);
  end if;
  -- Unconnected automatic sources cannot accidentally dispatch via manual enrollment.
  if trigger_type not in ('contact_form_inquiry_created','manual') then return false; end if;
  case p_channel
    when 'follow_up_eligible' then return true;
    when 'email','marketing_email_consent' then
      return inquiry.email is not null and inquiry.marketing_opt_in=true and not exists (
        select 1 from public.luxor_marketing_suppressions s where lower(s.email)=lower(inquiry.email));
    when 'text','marketing_sms_consent' then
      return inquiry.phone is not null and exists (
        select 1 from public.luxor_sms_consents c
        where regexp_replace(c.phone_number,'[^0-9]','','g')=regexp_replace(inquiry.phone,'[^0-9]','','g')
          and c.status='opted_in' and c.consent_scopes @> array['marketing']::text[]);
    when 'tour_scheduled' then
      return inquiry.preferred_tour_date is not null and coalesce(inquiry.tour_attendance_status,'pending')='pending';
    when 'tour_attended' then return inquiry.tour_attendance_status='attended';
    when 'unresponsive' then return coalesce(inquiry.follow_up_disposition,'no_response')='no_response';
    else return false;
  end case;
end;
$$;

revoke all on function public.luxor_custom_workflow_enrollment_is_eligible(uuid,text) from public,anon,authenticated;
grant execute on function public.luxor_custom_workflow_enrollment_is_eligible(uuid,text) to service_role;

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
begin
  if not public.luxor_custom_workflow_runtime_enabled() then
    return query select false,'custom_workflow_execution_disabled'::text;
    return;
  end if;
  if p_channel='email' then
    select j.custom_workflow_step_run_id,j.inquiry_id,j.status into linked_run_id,inquiry_id,job_status
      from public.luxor_email_jobs as j where j.id=p_job_id and j.job_type='custom_workflow' for update of j;
  elsif p_channel='text' then
    select j.custom_workflow_step_run_id,j.inquiry_id,j.status into linked_run_id,inquiry_id,job_status
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
  if enrollment.status <> 'active' or workflow.status <> 'active'
    or not public.luxor_custom_workflow_enrollment_is_eligible(enrollment.id,p_channel) then
    perform public.luxor_custom_workflow_stop_step(run.id,'Eligibility, consent, or workflow status changed before provider dispatch.');
    return query select false,'recipient_or_workflow_no_longer_eligible'::text; return;
  end if;
  return query select true,null::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.luxor_custom_workflow_claim_due_email_jobs(p_limit integer DEFAULT 1)
 RETURNS SETOF luxor_email_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.luxor_custom_workflow_runtime_enabled() then return; end if;
  p_limit := greatest(1,least(coalesce(p_limit,1),10));
  return query with due as (
    select j.id from public.luxor_email_jobs j
    join public.luxor_custom_workflow_step_runs sr on sr.id=j.custom_workflow_step_run_id
    join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
    join public.luxor_custom_workflows w on w.id=e.workflow_id
    where j.job_type='custom_workflow' and j.status='queued' and j.scheduled_for<=now()
      and sr.channel='email' and sr.status='queued' and e.status='active'
      and sr.scheduled_for<=now() and e.current_step_id=sr.step_id and e.next_run_at<=now() and w.status='active'
      and public.luxor_custom_workflow_enrollment_is_eligible(e.id,'email')
      and not exists(
        select 1 from public.luxor_email_jobs recent
        where recent.job_type not in ('inquiry_notification','transactional_notice','test_notification')
          and recent.status in ('sending','sent')
          and coalesce(recent.sent_at,recent.updated_at)>now()-interval '60 seconds'
      )
    order by j.scheduled_for,j.created_at,j.id for update of j,sr,e skip locked limit p_limit
  ), claimed as (
    update public.luxor_email_jobs j set status='sending',attempts=j.attempts+1,updated_at=now()
      from due where j.id=due.id returning j.*
  ), marked as (
    update public.luxor_custom_workflow_step_runs sr set status='sending',started_at=coalesce(sr.started_at,now()),updated_at=now()
      from claimed c where sr.id=c.custom_workflow_step_run_id returning sr.id
  ) select c.* from claimed c join marked m on m.id=c.custom_workflow_step_run_id
    order by c.scheduled_for,c.created_at,c.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.luxor_custom_workflow_claim_due_text_jobs(p_limit integer DEFAULT 10, p_segment_budget integer DEFAULT 100)
 RETURNS SETOF luxor_text_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.luxor_custom_workflow_runtime_enabled() then return; end if;
  if not public.luxor_custom_workflow_is_within_sms_send_window(now()) then return; end if;
  p_limit := greatest(1,least(coalesce(p_limit,10),50));
  p_segment_budget := greatest(0,least(coalesce(p_segment_budget,0),100000));
  return query with due as (
    select j.id from public.luxor_text_jobs j
    join public.luxor_custom_workflow_step_runs sr on sr.id=j.custom_workflow_step_run_id
    join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
    join public.luxor_custom_workflows w on w.id=e.workflow_id
    where j.job_type='custom_workflow' and j.status='queued' and j.scheduled_for<=now()
      and j.segment_count<=p_segment_budget and sr.channel='text' and sr.status='queued'
      and sr.scheduled_for<=now() and e.status='active' and e.current_step_id=sr.step_id and e.next_run_at<=now()
      and w.status='active' and public.luxor_custom_workflow_enrollment_is_eligible(e.id,'text')
    order by j.scheduled_for,j.created_at,j.id for update of j,sr,e skip locked limit p_limit
  ), claimed as (
    update public.luxor_text_jobs j set status='sending',attempts=coalesce(j.attempts,0)+1,updated_at=now()
      from due where j.id=due.id returning j.*
  ), marked as (
    update public.luxor_custom_workflow_step_runs sr set status='sending',started_at=coalesce(sr.started_at,now()),updated_at=now()
      from claimed c where sr.id=c.custom_workflow_step_run_id returning sr.id
  ) select c.* from claimed c join marked m on m.id=c.custom_workflow_step_run_id
    order by c.scheduled_for,c.created_at,c.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.luxor_custom_workflow_enqueue_email_step(p_step_run_id uuid, p_recipient_email text, p_subject text, p_body text, p_preview_text text, p_unsubscribe_token_hash text)
 RETURNS TABLE(job_id uuid, disposition text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  run public.luxor_custom_workflow_step_runs%rowtype;
  enrollment public.luxor_custom_workflow_enrollments%rowtype;
  workflow public.luxor_custom_workflows%rowtype;
  inquiry public.luxor_inquiries%rowtype;
  version_definition jsonb;
  step jsonb;
  existing_job public.luxor_email_jobs%rowtype;
  created_job public.luxor_email_jobs%rowtype;
  sender_from text;
  sender_name text;
  sender_actor text;
begin
  select * into run from public.luxor_custom_workflow_step_runs where id=p_step_run_id for update;
  if not found then return query select null::uuid,'skipped'::text,'step_not_found'::text; return; end if;
  if not public.luxor_custom_workflow_runtime_enabled() then
    return query select null::uuid,'skipped'::text,'custom_workflow_execution_disabled'::text; return;
  end if;
  select * into enrollment from public.luxor_custom_workflow_enrollments where id=run.enrollment_id for update;
  select * into workflow from public.luxor_custom_workflows where id=enrollment.workflow_id for update;
  select definition into version_definition from public.luxor_custom_workflow_versions
    where id=enrollment.workflow_version_id and workflow_id=enrollment.workflow_id;
  step := version_definition->'steps'->run.step_order;
  select * into inquiry from public.luxor_inquiries where id=enrollment.inquiry_id for update;
  select * into existing_job from public.luxor_email_jobs where custom_workflow_step_run_id=run.id;
  if found then return query select existing_job.id,'existing'::text,null::text; return; end if;
  if run.channel <> 'email' or run.status <> 'scheduled' or run.scheduled_for > now() or run.step_id is distinct from step->>'id'
    or enrollment.status <> 'active' or enrollment.current_step_id is distinct from run.step_id
    or enrollment.next_run_at > now() or workflow.status <> 'active'
    or step->>'type' <> 'email' or step->>'mode' <> 'marketing'
    or not public.luxor_custom_workflow_definition_is_runnable(version_definition) then
    return query select null::uuid,'skipped'::text,'workflow_or_step_is_not_dispatchable'::text; return;
  end if;
  if not public.luxor_custom_workflow_enrollment_is_eligible(enrollment.id,'email')
    or lower(coalesce(p_recipient_email,'')) <> lower(coalesce(inquiry.email,'')) then
    perform public.luxor_custom_workflow_stop_step(run.id,'Marketing email consent, eligibility, or recipient changed before queueing.');
    return query select null::uuid,'stopped'::text,'recipient_no_longer_eligible'::text; return;
  end if;
  if p_subject is null or length(btrim(p_subject)) not between 1 and 500 or p_subject ~ E'[\r\n]'
    or p_body is null or length(btrim(p_body))=0 or length(p_body)>100000
    or p_preview_text is null or length(p_preview_text)>500
    or coalesce(p_unsubscribe_token_hash,'') !~ '^[0-9a-f]{64}$' then
    return query select null::uuid,'held'::text,'rendered_email_invalid'::text; return;
  end if;

  -- Sender identity comes from the immutable version. The server pins the
  -- operator from the authenticated session and enforces the mailbox allowlist.
  -- The provider validates that allowlist again at dispatch.
  if version_definition ? 'emailSettings' then
    sender_from := lower(btrim(version_definition->'emailSettings'->>'senderEmail'));
    if version_definition->'emailSettings'->>'senderMode' = 'elena' then
      sender_name := 'Elena';
    else
      sender_actor := lower(btrim(version_definition->'emailSettings'->>'senderActorEmail'));
      select nullif(btrim(display_name),'') into sender_name
        from public.luxor_user_preferences where lower(email) = sender_actor limit 1;
      sender_name := coalesce(sender_name, initcap(regexp_replace(split_part(sender_actor,'@',1),'[._+-]+',' ','g')));
    end if;
  else
    sender_from := 'booking@luxoratlaspalmas.com';
    sender_name := 'Luxor Event Space';
  end if;

  insert into public.luxor_email_jobs(
    inquiry_id,job_type,status,recipient_email,subject,body,scheduled_for,metadata,custom_workflow_step_run_id
  ) values (
    inquiry.id,'custom_workflow','queued',inquiry.email,p_subject,p_body,run.scheduled_for,
    jsonb_build_object('automated',true,'custom_workflow',true,'compliance_scope','marketing',
      'preview_text',p_preview_text,'step_id',run.step_id,
      'sender_from',sender_from,'sender_name',sender_name,
      'generation_mode',coalesce(step->>'generationMode','manual'),
      'email_style',coalesce(step->>'emailStyle','personal')),run.id
  ) on conflict (custom_workflow_step_run_id) where custom_workflow_step_run_id is not null
    do nothing returning * into created_job;
  if created_job.id is null then
    select * into existing_job from public.luxor_email_jobs where custom_workflow_step_run_id=run.id;
    return query select existing_job.id,'existing'::text,null::text; return;
  end if;
  insert into public.luxor_custom_workflow_unsubscribe_tokens(token_hash,step_run_id,inquiry_id,email)
    values(p_unsubscribe_token_hash,run.id,inquiry.id,lower(inquiry.email));
  update public.luxor_custom_workflow_step_runs
    set status='queued',snapshot=snapshot||jsonb_build_object('email_job_id',created_job.id),updated_at=now()
    where id=run.id;
  insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
    values(workflow.id,enrollment.id,run.id,'message_queued',jsonb_build_object('channel','email','job_id',created_job.id));
  return query select created_job.id,'queued'::text,null::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.luxor_custom_workflow_enqueue_text_step(p_step_run_id uuid, p_recipient_phone text, p_body text, p_segment_count integer)
 RETURNS TABLE(job_id uuid, disposition text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  run public.luxor_custom_workflow_step_runs%rowtype;
  enrollment public.luxor_custom_workflow_enrollments%rowtype;
  workflow public.luxor_custom_workflows%rowtype;
  inquiry public.luxor_inquiries%rowtype;
  version_definition jsonb;
  step jsonb;
  existing_job public.luxor_text_jobs%rowtype;
  created_job public.luxor_text_jobs%rowtype;
begin
  select * into run from public.luxor_custom_workflow_step_runs where id=p_step_run_id for update;
  if not found then return query select null::uuid,'skipped'::text,'step_not_found'::text; return; end if;
  if not public.luxor_custom_workflow_runtime_enabled() then
    return query select null::uuid,'skipped'::text,'custom_workflow_execution_disabled'::text; return;
  end if;
  select * into enrollment from public.luxor_custom_workflow_enrollments where id=run.enrollment_id for update;
  select * into workflow from public.luxor_custom_workflows where id=enrollment.workflow_id for update;
  select definition into version_definition from public.luxor_custom_workflow_versions
    where id=enrollment.workflow_version_id and workflow_id=enrollment.workflow_id;
  step := version_definition->'steps'->run.step_order;
  select * into inquiry from public.luxor_inquiries where id=enrollment.inquiry_id for update;
  select * into existing_job from public.luxor_text_jobs where custom_workflow_step_run_id=run.id;
  if found then return query select existing_job.id,'existing'::text,null::text; return; end if;
  if run.channel <> 'text' or run.status <> 'scheduled' or run.scheduled_for > now() or run.step_id is distinct from step->>'id'
    or enrollment.status <> 'active' or enrollment.current_step_id is distinct from run.step_id
    or enrollment.next_run_at > now() or workflow.status <> 'active'
    or step->>'type' <> 'text' or step->>'requiredConsentScope' <> 'marketing'
    or not public.luxor_custom_workflow_definition_is_runnable(version_definition) then
    return query select null::uuid,'skipped'::text,'workflow_or_step_is_not_dispatchable'::text; return;
  end if;
  if not public.luxor_custom_workflow_enrollment_is_eligible(enrollment.id,'text')
    or coalesce(p_recipient_phone,'') !~ '^\+[1-9][0-9]{7,14}$'
    or regexp_replace(coalesce(inquiry.phone,''),'[^0-9]','','g') <> regexp_replace(coalesce(p_recipient_phone,''),'[^0-9]','','g') then
    perform public.luxor_custom_workflow_stop_step(run.id,'Marketing SMS consent, eligibility, or recipient changed before queueing.');
    return query select null::uuid,'stopped'::text,'recipient_no_longer_eligible'::text; return;
  end if;
  if p_body is null or length(btrim(p_body))=0 or length(p_body)>480
    or btrim(p_body) !~* '^(Luxor Event Space|Luxor Events|Luxor at Las Palmas Events|Luxor at Las Palmas)\M' or p_body !~* '\mSTOP\M'
    or p_segment_count not between 1 and 10 then
    return query select null::uuid,'held'::text,'rendered_text_invalid'::text; return;
  end if;
  insert into public.luxor_text_jobs(
    inquiry_id,job_type,status,recipient_phone,recipient_name,body,segment_count,scheduled_for,
    automation_key,metadata,custom_workflow_step_run_id
  ) values (
    inquiry.id,'custom_workflow','queued',p_recipient_phone,inquiry.full_name,p_body,p_segment_count,run.scheduled_for,
    'custom_workflow:'||run.id::text,jsonb_build_object('automated',true,'custom_workflow',true,
      'compliance_scope','marketing','step_id',run.step_id),run.id
  ) on conflict (custom_workflow_step_run_id) where custom_workflow_step_run_id is not null
    do nothing returning * into created_job;
  if created_job.id is null then
    select * into existing_job from public.luxor_text_jobs where custom_workflow_step_run_id=run.id;
    return query select existing_job.id,'existing'::text,null::text; return;
  end if;
  update public.luxor_custom_workflow_step_runs
    set status='queued',snapshot=snapshot||jsonb_build_object('text_job_id',created_job.id),updated_at=now()
    where id=run.id;
  insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
    values(workflow.id,enrollment.id,run.id,'message_queued',jsonb_build_object('channel','text','job_id',created_job.id));
  return query select created_job.id,'queued'::text,null::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.luxor_custom_workflow_reconcile_text_callback(p_message_sid text, p_provider_status text, p_error text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job public.luxor_text_jobs%rowtype; run public.luxor_custom_workflow_step_runs%rowtype; enrollment public.luxor_custom_workflow_enrollments%rowtype;
begin
  select * into job from public.luxor_text_jobs where twilio_message_sid=p_message_sid and custom_workflow_step_run_id is not null limit 1;
  if not found then return false; end if;
  select * into run from public.luxor_custom_workflow_step_runs where id=job.custom_workflow_step_run_id for update;
  select * into enrollment from public.luxor_custom_workflow_enrollments where id=run.enrollment_id for update;
  if run.status='held' and run.last_error like 'provider_outcome_unknown:%'
    and enrollment.status='held' and enrollment.current_step_id=run.step_id then
    if lower(p_provider_status) in ('accepted','queued','sending','sent','delivered','read') then
      update public.luxor_custom_workflow_enrollments set status='active',last_error=null,updated_at=now()
        where id=enrollment.id and exists(select 1 from public.luxor_custom_workflows w where w.id=enrollment.workflow_id and w.status='active')
          and public.luxor_custom_workflow_enrollment_is_eligible(enrollment.id,'text');
      if found then
        update public.luxor_custom_workflow_step_runs set status='sent',completed_at=coalesce(completed_at,now()),
          provider_accepted_at=coalesce(provider_accepted_at,now()),last_error=null,updated_at=now() where id=run.id;
        insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
          values(enrollment.workflow_id,enrollment.id,run.id,'provider_callback_reconciled',jsonb_build_object('status',p_provider_status,'message_sid',p_message_sid));
        perform public.luxor_custom_workflow_schedule_next_step(run.id);
      end if;
    else
      update public.luxor_custom_workflow_step_runs set last_error='provider_outcome_unknown:Twilio later reported '||left(coalesce(p_provider_status,'failure'),100)||'. '||left(coalesce(p_error,''),500),updated_at=now() where id=run.id;
      insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
        values(enrollment.workflow_id,enrollment.id,run.id,'provider_callback_failed',jsonb_build_object('status',p_provider_status,'error',left(coalesce(p_error,''),500),'message_sid',p_message_sid));
    end if;
  else
    insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
      values(enrollment.workflow_id,enrollment.id,run.id,'message_delivery_update',jsonb_build_object('status',p_provider_status,'error',left(coalesce(p_error,''),500),'message_sid',p_message_sid));
  end if;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.luxor_custom_workflow_stop_ineligible_message_steps(p_limit integer DEFAULT 50)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item record; stopped_count integer:=0;
begin
  p_limit:=greatest(1,least(coalesce(p_limit,50),200));
  for item in
    select sr.id,sr.channel
    from public.luxor_custom_workflow_step_runs sr
    join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
    join public.luxor_custom_workflows w on w.id=e.workflow_id
    where sr.channel in ('email','text') and sr.status in ('scheduled','queued')
      and sr.scheduled_for<=now() and e.status='active' and e.current_step_id=sr.step_id
      and w.status='active' and not public.luxor_custom_workflow_enrollment_is_eligible(e.id,sr.channel)
    order by sr.scheduled_for,sr.created_at for update of sr,e skip locked limit p_limit
  loop
    perform public.luxor_custom_workflow_stop_step(item.id,'Consent or inquiry eligibility was withdrawn before provider dispatch.');
    stopped_count:=stopped_count+1;
  end loop;
  return stopped_count;
end;
$function$;
