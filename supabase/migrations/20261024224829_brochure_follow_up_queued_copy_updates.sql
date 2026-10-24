-- Allow an explicit, reviewed template save to refresh only matching future
-- brochure follow-up email snapshots. The preview payload binds both the template
-- revision and each exact queued job snapshot; application rechecks eligibility
-- while holding row locks shared with the follow-up claim path.

create or replace function public.luxor_brochure_queued_copy_candidates(p_template_id uuid)
returns table(job_id uuid, snapshot_hash text)
language sql
security invoker
set search_path = ''
as $$
  select job.id,
    pg_catalog.md5(pg_catalog.jsonb_build_object(
      'job', pg_catalog.to_jsonb(job),
      'action', pg_catalog.to_jsonb(action),
      'enrollment', pg_catalog.to_jsonb(enrollment),
      'inquiry', pg_catalog.to_jsonb(inquiry),
      'automation', pg_catalog.to_jsonb(automation),
      'template_shape', pg_catalog.jsonb_build_object(
        'id', template.id,
        'automation_key', template.automation_key,
        'step_key', template.step_key,
        'channel', template.channel,
        'active', template.active,
        'uses_existing_delivery', template.uses_existing_delivery
      )
    )::text) as snapshot_hash
  from public.luxor_email_jobs as job
  join public.luxor_follow_up_enrollments as enrollment
    on enrollment.id = job.automation_enrollment_id
  join public.luxor_follow_up_automations as automation
    on automation.automation_key = enrollment.automation_key
  join public.luxor_follow_up_actions as action
    on action.enrollment_id = enrollment.id
    and action.email_job_id = job.id
    and action.step_key = job.automation_step_key
  join public.luxor_follow_up_templates as template
    on template.id = action.template_id
    and template.id = p_template_id
    and template.step_key = action.step_key
  join public.luxor_inquiries as inquiry
    on inquiry.id = enrollment.inquiry_id
    and inquiry.id = job.inquiry_id
  where template.automation_key = 'brochure_lead'
    and template.channel = 'email'
    and template.step_key in ('email_2', 'email_3', 'email_4', 'email_5')
    and template.active
    and not template.uses_existing_delivery
    and enrollment.automation_key = 'brochure_lead'
    and enrollment.status in ('active', 'paused')
    and enrollment.marketing_consent_at_enrollment
    and enrollment.response_received_at is null
    and enrollment.completed_at is null
    and automation.enabled
    and automation.send_approved
    and automation.timing_configured
    and automation.timezone = 'America/Chicago'
    and action.template_id = template.id
    and action.channel = 'email'
    and action.status in ('email_queued', 'scheduled')
    and action.completed_at is null
    and action.scheduled_at = job.scheduled_for
    and job.job_type = 'marketing_campaign'
    and job.status = 'queued'
    and job.attempts = 0
    and job.sent_at is null
    and job.scheduled_for > pg_catalog.clock_timestamp()
    and job.automation_enrollment_id = enrollment.id
    and job.automation_step_key = template.step_key
    and job.test_run_id is null
    and job.test_claim_token is null
    and job.custom_workflow_step_run_id is null
    and job.metadata->>'automated' = 'true'
    and job.metadata->>'follow_up_sequence' = 'true'
    and job.metadata->>'automation_key' = 'brochure_lead'
    and job.metadata->>'step_key' = template.step_key
    and inquiry.marketing_opt_in
    and inquiry.is_test is false
    and coalesce(inquiry.metadata->>'is_test_record', 'false') <> 'true'
    and (inquiry.flow = 'brochure_lead' or inquiry.source = 'homepage_brochure')
    and inquiry.email is not null
    and pg_catalog.lower(pg_catalog.btrim(inquiry.email)) = pg_catalog.lower(pg_catalog.btrim(job.recipient_email))
    and inquiry.status not in ('tour_confirmed', 'booked', 'closed_lost')
    and (inquiry.follow_up_disposition is null or inquiry.follow_up_disposition = 'no_response')
    and inquiry.id not in (
      'ce4a7a94-abd7-402f-bac4-156af405ffb1'::uuid,
      '450c26e7-7f8e-4bba-af82-fe4a73b6cb9a'::uuid,
      '74f02e2a-6142-41f5-a5a6-4580207379f4'::uuid,
      '6ea7d1c2-75b9-4d1a-a56f-4439c7b672c7'::uuid,
      'b3b0d161-d75e-4333-bfa6-651e971d967a'::uuid,
      '3b2853a1-61ee-450f-950a-b368be146ac7'::uuid,
      '974ec2b3-73e8-42c9-b871-c3ba000853bf'::uuid,
      'b8f02c54-fc29-4016-aeef-9805330a76c8'::uuid,
      '3256392c-3121-40d3-bc41-11e7c79a9ff3'::uuid,
      'be741147-f87a-4d8c-8815-2809139be29e'::uuid
    )
    and not exists (
      select 1
      from public.luxor_mail_messages as mail
      where mail.idempotency_key = 'email-job/' || job.id::text
         or mail.metadata->>'emailJobId' = job.id::text
    );
$$;

create or replace function public.luxor_preview_brochure_follow_up_queue_updates(p_template_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_template public.luxor_follow_up_templates%rowtype;
  eligible_count integer;
  candidates jsonb;
begin
  select template.* into target_template
  from public.luxor_follow_up_templates as template
  where template.id = p_template_id
    and template.automation_key = 'brochure_lead'
    and template.channel = 'email'
    and template.step_key in ('email_2', 'email_3', 'email_4', 'email_5')
    and template.active
    and not template.uses_existing_delivery;

  if not found then
    raise exception 'This saved email step is not eligible for queued-copy review.';
  end if;

  select pg_catalog.count(*)::integer into eligible_count
  from public.luxor_brochure_queued_copy_candidates(p_template_id);

  if eligible_count > 500 then
    return pg_catalog.jsonb_build_object(
      'eligible_count', eligible_count,
      'candidates', '[]'::jsonb,
      'template_updated_at', target_template.updated_at,
      'limit_exceeded', true
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('jobId', candidate.job_id, 'snapshotHash', candidate.snapshot_hash)
    order by candidate.job_id
  ), '[]'::jsonb) into candidates
  from public.luxor_brochure_queued_copy_candidates(p_template_id) as candidate;

  return pg_catalog.jsonb_build_object(
    'eligible_count', eligible_count,
    'candidates', candidates,
    'template_updated_at', target_template.updated_at,
    'limit_exceeded', false
  );
end;
$$;

create or replace function public.luxor_apply_brochure_follow_up_queue_updates(
  p_template_id uuid,
  p_expected_updated_at timestamptz,
  p_updates jsonb,
  p_candidates jsonb,
  p_rendered_jobs jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_template public.luxor_follow_up_templates%rowtype;
  candidate jsonb;
  rendered jsonb;
  job_id uuid;
  current_hash text;
  inquiry_id uuid;
  enrollment_id uuid;
  inquiry_row public.luxor_inquiries%rowtype;
  enrollment_row public.luxor_follow_up_enrollments%rowtype;
  automation_row public.luxor_follow_up_automations%rowtype;
  action_row public.luxor_follow_up_actions%rowtype;
  job_row public.luxor_email_jobs%rowtype;
  updated_count integer := 0;
  skipped_count integer := 0;
  requested_count integer;
begin
  if p_template_id is null
    or p_updates is null or pg_catalog.jsonb_typeof(p_updates) <> 'object'
    or p_updates = '{}'::jsonb
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(p_updates) as keys(key_name)
      where keys.key_name not in ('name', 'subject', 'body', 'cta_text', 'cta_url', 'secondary_cta_text', 'secondary_cta_url')
    )
    or exists (
      select 1 from pg_catalog.jsonb_each(p_updates) as field(key_name, field_value)
      where pg_catalog.jsonb_typeof(field_value) not in ('string', 'null')
    )
    or p_candidates is null or pg_catalog.jsonb_typeof(p_candidates) <> 'array'
    or p_rendered_jobs is null or pg_catalog.jsonb_typeof(p_rendered_jobs) <> 'array'
    or pg_catalog.jsonb_array_length(p_candidates) > 500 then
    raise exception 'Invalid queued-copy update request.';
  end if;

  requested_count := pg_catalog.jsonb_array_length(p_candidates);
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_candidates) as candidate_item(value)
    where pg_catalog.jsonb_typeof(candidate_item.value) <> 'object'
      or pg_catalog.jsonb_object_length(candidate_item.value) <> 2
      or not (candidate_item.value ? 'jobId')
      or not (candidate_item.value ? 'snapshotHash')
      or coalesce(candidate_item.value->>'jobId', '') !~* '^[0-9a-f-]{36}$'
      or coalesce(candidate_item.value->>'snapshotHash', '') !~ '^[0-9a-f]{32}$'
  ) then
    raise exception 'Invalid queued-copy candidate list.';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_candidates) as candidate_item(value)
    group by candidate_item.value->>'jobId' having pg_catalog.count(*) > 1
  ) then
    raise exception 'Duplicate queued-copy candidate.';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_rendered_jobs) as rendered_item(value)
    where pg_catalog.jsonb_typeof(rendered_item.value) <> 'object'
      or pg_catalog.jsonb_object_length(rendered_item.value) <> 4
      or not (rendered_item.value ?& array['jobId', 'snapshotHash', 'subject', 'body'])
      or coalesce(rendered_item.value->>'jobId', '') !~* '^[0-9a-f-]{36}$'
      or coalesce(rendered_item.value->>'snapshotHash', '') !~ '^[0-9a-f]{32}$'
      or pg_catalog.jsonb_typeof(rendered_item.value->'subject') <> 'string'
      or pg_catalog.length(rendered_item.value->>'subject') > 500
      or pg_catalog.jsonb_typeof(rendered_item.value->'body') <> 'string'
      or pg_catalog.length(rendered_item.value->>'body') > 200000
      or not exists (
        select 1 from pg_catalog.jsonb_array_elements(p_candidates) as candidate_item(value)
        where candidate_item.value->>'jobId' = rendered_item.value->>'jobId'
          and candidate_item.value->>'snapshotHash' = rendered_item.value->>'snapshotHash'
      )
  ) then
    raise exception 'Invalid rendered queued-copy payload.';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_rendered_jobs) as rendered_item(value)
    group by rendered_item.value->>'jobId' having pg_catalog.count(*) > 1
  ) then
    raise exception 'Duplicate rendered queued-copy payload.';
  end if;
  if coalesce(p_updates->>'name', '') = '' and p_updates ? 'name'
    or coalesce(p_updates->>'subject', '') = '' and p_updates ? 'subject'
    or coalesce(p_updates->>'body', '') = '' and p_updates ? 'body' then
    raise exception 'Email name, subject, and body cannot be blank.';
  end if;

  select template.* into target_template
  from public.luxor_follow_up_templates as template
  where template.id = p_template_id
  for update;
  if not found then
    raise exception 'Follow-up template not found.';
  end if;
  if target_template.updated_at is distinct from p_expected_updated_at then
    raise exception 'This email changed after it was opened. Review the queued emails again before saving.';
  end if;
  if target_template.automation_key <> 'brochure_lead'
    or target_template.channel <> 'email'
    or target_template.step_key not in ('email_2', 'email_3', 'email_4', 'email_5')
    or not target_template.active
    or target_template.uses_existing_delivery then
    raise exception 'This saved email step is not eligible for queued-copy updates.';
  end if;

  update public.luxor_follow_up_templates as template
  set name = case when p_updates ? 'name' then p_updates->>'name' else template.name end,
      subject = case when p_updates ? 'subject' then p_updates->>'subject' else template.subject end,
      body = case when p_updates ? 'body' then p_updates->>'body' else template.body end,
      cta_text = case when p_updates ? 'cta_text' then p_updates->>'cta_text' else template.cta_text end,
      cta_url = case when p_updates ? 'cta_url' then p_updates->>'cta_url' else template.cta_url end,
      secondary_cta_text = case when p_updates ? 'secondary_cta_text' then p_updates->>'secondary_cta_text' else template.secondary_cta_text end,
      secondary_cta_url = case when p_updates ? 'secondary_cta_url' then p_updates->>'secondary_cta_url' else template.secondary_cta_url end,
      updated_at = pg_catalog.clock_timestamp()
  where template.id = p_template_id
  returning template.* into target_template;

  for candidate in select item.value from pg_catalog.jsonb_array_elements(p_candidates) as item(value) loop
    job_id := (candidate->>'jobId')::uuid;
    inquiry_id := null;
    enrollment_id := null;
    rendered := null;

    select job.inquiry_id, job.automation_enrollment_id
      into inquiry_id, enrollment_id
    from public.luxor_email_jobs as job
    where job.id = job_id;
    if not found or inquiry_id is null or enrollment_id is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    -- Lock eligibility/personalization context before the job. The worker also
    -- locks the job row before changing queued -> sending; SKIP LOCKED avoids
    -- waiting behind a claimed message. The locks prevent consent, recipient,
    -- enrollment, and action changes between recheck and snapshot update.
    select inquiry.* into inquiry_row
    from public.luxor_inquiries as inquiry
    where inquiry.id = inquiry_id
    for share;
    if not found then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select enrollment.* into enrollment_row
    from public.luxor_follow_up_enrollments as enrollment
    where enrollment.id = enrollment_id
    for share;
    if not found then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select automation.* into automation_row
    from public.luxor_follow_up_automations as automation
    where automation.automation_key = 'brochure_lead'
    for share;
    if not found then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select action.* into action_row
    from public.luxor_follow_up_actions as action
    where action.email_job_id = job_id
      and action.enrollment_id = enrollment_id
      and action.template_id = p_template_id
    for share;
    if not found then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select job.* into job_row
    from public.luxor_email_jobs as job
    where job.id = job_id
    for update skip locked;
    if not found then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select candidate_row.snapshot_hash into current_hash
    from public.luxor_brochure_queued_copy_candidates(p_template_id) as candidate_row
    where candidate_row.job_id = job_id;
    if not found or current_hash is distinct from candidate->>'snapshotHash' then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select item.value into rendered
    from pg_catalog.jsonb_array_elements(p_rendered_jobs) as item(value)
    where item.value->>'jobId' = job_id::text
      and item.value->>'snapshotHash' = candidate->>'snapshotHash'
    limit 1;
    if not found then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    update public.luxor_email_jobs as job
    set subject = rendered->>'subject',
        body = rendered->>'body',
        updated_at = pg_catalog.clock_timestamp()
    where job.id = job_id
      and job.status = 'queued'
      and job.attempts = 0
      and job.sent_at is null;
    if found then
      updated_count := updated_count + 1;
    else
      skipped_count := skipped_count + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'requested_count', requested_count,
    'updated_count', updated_count,
    'skipped_count', skipped_count
  );
end;
$$;

revoke all on function public.luxor_brochure_queued_copy_candidates(uuid) from public, anon, authenticated;
revoke all on function public.luxor_preview_brochure_follow_up_queue_updates(uuid) from public, anon, authenticated;
revoke all on function public.luxor_apply_brochure_follow_up_queue_updates(uuid, timestamptz, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.luxor_brochure_queued_copy_candidates(uuid) to service_role;
grant execute on function public.luxor_preview_brochure_follow_up_queue_updates(uuid) to service_role;
grant execute on function public.luxor_apply_brochure_follow_up_queue_updates(uuid, timestamptz, jsonb, jsonb, jsonb) to service_role;
