-- Save and publish the permanent test lead's real proposal calculation without
-- creating an invoice, changing the lead pipeline, or touching booking tables.
create or replace function public.luxor_save_test_proposal(
  p_test_run_id uuid,
  p_action text,
  p_details jsonb,
  p_email_subject text default null,
  p_email_body text default null,
  p_pdf_base64 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.luxor_test_runs;
  v_settings public.luxor_test_settings;
  v_existing public.luxor_test_run_artifacts;
  v_artifact public.luxor_test_run_artifacts;
  v_job public.luxor_email_jobs;
  v_email public.luxor_test_run_emails;
begin
  if p_test_run_id is null or p_action is null or p_action not in ('save', 'publish') then
    raise exception 'A valid test run and proposal action are required.' using errcode = '22023';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object'
      or jsonb_typeof(p_details -> 'invoice') <> 'object'
      or jsonb_typeof(p_details -> 'selection') <> 'object' then
    raise exception 'A calculated proposal snapshot is required.' using errcode = '22023';
  end if;

  select * into v_settings from public.luxor_test_settings where id = 1 for update;
  select * into v_run from public.luxor_test_runs
    where id = p_test_run_id
      and test_lead_id = '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid
      and status = 'in_progress'
    for update;
  if not found then
    raise exception 'Only the active permanent test lead run can save a proposal.' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.luxor_test_run_artifacts
    where test_run_id = v_run.id and artifact_type = 'tour' and status = 'completed'
  ) then
    raise exception 'Complete the simulated tour before saving a test proposal.' using errcode = '22023';
  end if;

  select * into v_existing from public.luxor_test_run_artifacts
    where test_run_id = v_run.id and artifact_type = 'proposal' for update;
  if found and v_existing.status not in ('simulated', 'drafted') then
    raise exception 'This test proposal has already been published. Start a new test run to create another.' using errcode = '55000';
  end if;

  if p_action = 'publish' then
    if not coalesce(v_settings.enabled, false)
       or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com'
       or v_settings.email_recipient_confirmed_at is null then
      raise exception 'Test proposal email is unavailable until the exact test inbox is enabled and confirmed.' using errcode = '55000';
    end if;
    if length(trim(coalesce(p_email_subject, ''))) not between 1 and 200
       or length(trim(coalesce(p_email_body, ''))) not between 1 and 50000
       or length(coalesce(p_pdf_base64, '')) > 1400000 then
      raise exception 'The prepared test email or proposal attachment is invalid.' using errcode = '22023';
    end if;

    insert into public.luxor_email_jobs (
      inquiry_id, job_type, status, recipient_email, subject, body, scheduled_for,
      metadata, test_run_id
    ) values (
      v_run.test_lead_id, 'test_notification', 'queued', 'luxoratlaspalmas@gmail.com',
      trim(p_email_subject), p_email_body, now(),
      jsonb_build_object(
        'test_email', 'true',
        'test_category', 'proposal',
        'test_source', 'portal_test_proposal',
        'test_attachment_filename', coalesce(nullif(p_details #>> '{pdf,filename}', ''), 'Luxor-Test-Proposal.pdf'),
        'test_attachment_base64', p_pdf_base64
      ), v_run.id
    ) returning * into v_job;

    insert into public.luxor_test_run_emails (
      test_run_id, email_job_id, category, status, actual_recipient,
      provider_status, delivery_status, details
    ) values (
      v_run.id, v_job.id, 'proposal', 'queued', 'luxoratlaspalmas@gmail.com',
      'not_attempted', 'unknown', jsonb_build_object('subject', left(p_email_subject, 200), 'source', 'portal_test_proposal')
    ) returning * into v_email;
  end if;

  insert into public.luxor_test_run_artifacts(test_run_id, artifact_type, status, details, updated_at)
  values (
    v_run.id, 'proposal', case when p_action = 'publish' then 'sent' else 'drafted' end,
    p_details || jsonb_build_object(
      'simulation_only', true,
      'published_email_id', case when p_action = 'publish' then v_email.id else null end,
      'email_recipient', case when p_action = 'publish' then 'luxoratlaspalmas@gmail.com' else null end
    ), now()
  )
  on conflict (test_run_id, artifact_type) do update set
    status = excluded.status,
    details = excluded.details,
    updated_at = now()
  returning * into v_artifact;

  insert into public.luxor_test_run_activity(test_run_id, event_type, status, recipient_email, details)
  values (
    v_run.id,
    case when p_action = 'publish' then 'test_proposal_published' else 'test_proposal_saved' end,
    case when p_action = 'publish' then 'sent' else 'drafted' end,
    case when p_action = 'publish' then 'luxoratlaspalmas@gmail.com' else null end,
    jsonb_build_object('artifact_id', v_artifact.id, 'email_id', case when p_action = 'publish' then v_email.id else null end, 'simulation_only', true)
  );

  return jsonb_build_object(
    'artifact', to_jsonb(v_artifact),
    'email', case when p_action = 'publish' then to_jsonb(v_email) else null end,
    'recipient', case when p_action = 'publish' then 'luxoratlaspalmas@gmail.com' else null end,
    'simulation_only', true
  );
end;
$$;

revoke all on function public.luxor_save_test_proposal(uuid, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.luxor_save_test_proposal(uuid, text, jsonb, text, text, text) to service_role;
