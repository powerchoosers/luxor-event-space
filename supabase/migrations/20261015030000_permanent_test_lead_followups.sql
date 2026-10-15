create or replace function public.luxor_record_test_brochure_follow_up_actions(
  p_test_run_id uuid,
  p_actions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initial_run public.luxor_test_runs;
  v_settings public.luxor_test_settings;
  v_lead public.luxor_inquiries;
  v_run public.luxor_test_runs;
  v_action jsonb;
  v_details jsonb;
  v_step_key text;
  v_channel text;
  v_status text;
  v_scheduled_at timestamptz;
  v_recorded integer := 0;
begin
  if p_test_run_id is null or jsonb_typeof(p_actions) <> 'array'
    or jsonb_array_length(p_actions) > 9 then
    raise exception 'Provide up to nine run-scoped brochure follow-up actions.' using errcode = '22023';
  end if;

  -- Match the test lifecycle's shared settings -> lead -> run lock order.
  select * into v_initial_run from public.luxor_test_runs where id=p_test_run_id;
  if not found then raise exception 'Test run not found.' using errcode='P0002'; end if;
  select * into v_settings from public.luxor_test_settings where id=1 for update;
  if not found or not v_settings.enabled
    or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com'
    or v_settings.email_recipient_confirmed_at is null then
    raise exception 'Test workflow is disabled or the verified test inbox is not confirmed.' using errcode='55000';
  end if;
  select * into v_lead from public.luxor_inquiries
  where id=v_initial_run.test_lead_id and is_test is true for update;
  if not found or v_lead.id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid then
    raise exception 'The permanent test lead is not provisioned.' using errcode='55000';
  end if;
  select * into v_run from public.luxor_test_runs
  where id=p_test_run_id and test_lead_id=v_lead.id for update;
  if not found or v_run.status <> 'in_progress' then
    raise exception 'Only the active permanent test run can record follow-up actions.' using errcode='55000';
  end if;

  for v_action in select value from jsonb_array_elements(p_actions)
  loop
    v_step_key := nullif(trim(coalesce(v_action->>'step_key','')),'');
    v_channel := v_action->>'channel';
    v_status := v_action->>'status';
    v_details := coalesce(v_action->'details','{}'::jsonb);
    begin
      v_scheduled_at := nullif(v_action->>'scheduled_at','')::timestamptz;
    exception when others then
      raise exception 'A follow-up action has an invalid scheduled time.' using errcode='22023';
    end;
    if v_step_key is null or length(v_step_key)>80
      or v_channel not in ('email','phone','sms')
      or v_status not in ('queued','existing_delivery','task_simulated','skipped','suppressed')
      or v_scheduled_at is null or jsonb_typeof(v_details)<>'object' then
      raise exception 'A follow-up action has invalid step, channel, status, schedule, or details.' using errcode='22023';
    end if;

    if not exists (
      select 1 from public.luxor_test_run_activity
      where test_run_id=v_run.id and event_type='test_brochure_follow_up_step'
        and details->>'step_key'=v_step_key
    ) then
      insert into public.luxor_test_run_activity (test_run_id,event_type,status,source,details)
      values (v_run.id,'test_brochure_follow_up_step',v_status,'test_brochure_follow_up',
        v_details || jsonb_build_object('step_key',v_step_key,'channel',v_channel,
          'scheduled_at',v_scheduled_at,'simulation_only',true,'external_task_created',false));
      v_recorded := v_recorded + 1;
    end if;
  end loop;

  return jsonb_build_object('test_run_id',v_run.id,'recorded',v_recorded,'simulation_only',true);
end;
$$;

revoke all on function public.luxor_record_test_brochure_follow_up_actions(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.luxor_record_test_brochure_follow_up_actions(uuid,jsonb) to service_role;
