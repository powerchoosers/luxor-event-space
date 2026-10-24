-- Qualify apply-RPC locals whose names collide with columns or set-returning
-- function output fields. Keep the invoker-only service-role ACL unchanged.
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
  v_candidate jsonb;
  v_rendered jsonb;
  v_job_id uuid;
  v_current_hash text;
  v_inquiry_id uuid;
  v_enrollment_id uuid;
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
      or case
        when pg_catalog.jsonb_typeof(candidate_item.value) = 'object'
          then (candidate_item.value - array['jobId', 'snapshotHash']) <> '{}'::jsonb
        else false
      end
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
      or case
        when pg_catalog.jsonb_typeof(rendered_item.value) = 'object'
          then (rendered_item.value - array['jobId', 'snapshotHash', 'subject', 'body']) <> '{}'::jsonb
        else false
      end
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

  for v_candidate in select item.value from pg_catalog.jsonb_array_elements(p_candidates) as item(value) loop
    v_job_id := (v_candidate->>'jobId')::uuid;
    v_inquiry_id := null;
    v_enrollment_id := null;
    v_rendered := null;

    select job.inquiry_id, job.automation_enrollment_id
      into v_inquiry_id, v_enrollment_id
    from public.luxor_email_jobs as job
    where job.id = v_job_id;
    if not found or v_inquiry_id is null or v_enrollment_id is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    -- Lock eligibility/personalization context before the job. The worker also
    -- locks the job row before changing queued -> sending; SKIP LOCKED avoids
    -- waiting behind a claimed message. The locks prevent consent, recipient,
    -- enrollment, and action changes between recheck and snapshot update.
    select inquiry.* into inquiry_row
    from public.luxor_inquiries as inquiry
    where inquiry.id = v_inquiry_id
    for share;
    if not found then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select enrollment.* into enrollment_row
    from public.luxor_follow_up_enrollments as enrollment
    where enrollment.id = v_enrollment_id
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
    where action.email_job_id = v_job_id
      and action.enrollment_id = v_enrollment_id
      and action.template_id = p_template_id
    for share;
    if not found then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select job.* into job_row
    from public.luxor_email_jobs as job
    where job.id = v_job_id
    for update skip locked;
    if not found then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select candidate_row.snapshot_hash into v_current_hash
    from public.luxor_brochure_queued_copy_candidates(p_template_id) as candidate_row
    where candidate_row.job_id = v_job_id;
    if not found or v_current_hash is distinct from v_candidate->>'snapshotHash' then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select item.value into v_rendered
    from pg_catalog.jsonb_array_elements(p_rendered_jobs) as item(value)
    where item.value->>'jobId' = v_job_id::text
      and item.value->>'snapshotHash' = v_candidate->>'snapshotHash'
    limit 1;
    if not found then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    update public.luxor_email_jobs as job
    set subject = v_rendered->>'subject',
        body = v_rendered->>'body',
        updated_at = pg_catalog.clock_timestamp()
    where job.id = v_job_id
      and job.status = 'queued'
      and job.attempts = 0
      and job.sent_at is null
      and job.scheduled_for > pg_catalog.clock_timestamp();
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

revoke all on function public.luxor_apply_brochure_follow_up_queue_updates(uuid, timestamptz, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.luxor_apply_brochure_follow_up_queue_updates(uuid, timestamptz, jsonb, jsonb, jsonb) to service_role;


