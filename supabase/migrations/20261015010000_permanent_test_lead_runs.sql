alter table public.luxor_inquiries
  add column if not exists is_test boolean not null default false;

-- Mark only the owner-verified permanent test lead. UUID, exact sentinel, and
-- exact historical name must all match; ordinary contact data is never used.
update public.luxor_inquiries
set is_test = true
where id = '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid
  and is_test = false
  and metadata ->> 'is_test_record' = 'true'
  and full_name = 'Luxor Flow Test - Do Not Contact';

update public.luxor_inquiries
set full_name = 'Luxor Test Lead',
    email = 'luxoratlaspalmas@gmail.com',
    phone = '214-960-0276',
    status = 'new',
    pipeline_stage = 'inquiry',
    updated_at = now()
where id = '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid
  and is_test is true
  and metadata ->> 'is_test_record' = 'true'
  and full_name = 'Luxor Flow Test - Do Not Contact';

do $$
begin
  if not exists (
    select 1 from public.luxor_inquiries
    where id = '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid
      and is_test is true
      and metadata ->> 'is_test_record' = 'true'
      and full_name = 'Luxor Test Lead'
  ) then
    raise exception 'Verified permanent test lead could not be provisioned safely; migration stopped.' using errcode = '55000';
  end if;
end;
$$;

create unique index if not exists luxor_inquiries_single_permanent_test_lead_idx
  on public.luxor_inquiries ((true))
  where is_test;

create table if not exists public.luxor_test_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  identification_email text not null default 'luxoratlaspalmas@gmail.com',
  identification_phone text not null default '2149600276',
  email_recipient text,
  email_recipient_confirmed_at timestamptz,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint luxor_test_settings_email_format check (identification_email = lower(trim(identification_email))),
  constraint luxor_test_settings_phone_format check (identification_phone ~ '^[0-9]{10}$'),
  constraint luxor_test_settings_recipient_normalized check (email_recipient is null or email_recipient = lower(trim(email_recipient)))
);

insert into public.luxor_test_settings (
  id, enabled, identification_email, identification_phone,
  email_recipient, email_recipient_confirmed_at, updated_by
)
values (
  1, false, 'luxoratlaspalmas@gmail.com', '2149600276',
  'luxoratlaspalmas@gmail.com', now(), 'owner-confirmed-by-verified-email-2026-10-14'
)
on conflict (id) do nothing;

-- Exact legacy records confirmed by the owner as tests are exempted by ID
-- only. Populate this list from the verified collision review before enabling
-- the workflow; new matching records continue to block configuration.
create table if not exists public.luxor_test_identifier_collision_exemptions (
  inquiry_id uuid primary key references public.luxor_inquiries(id) on delete restrict,
  reason text not null check (reason = 'owner_confirmed_legacy_test'),
  reviewed_at timestamptz not null default now()
);

create or replace function public.luxor_test_identifier_exemption_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Reviewed test identifier exemptions are append-only.' using errcode = '55000';
end;
$$;

drop trigger if exists luxor_test_identifier_exemption_append_only on public.luxor_test_identifier_collision_exemptions;
create trigger luxor_test_identifier_exemption_append_only
before update or delete on public.luxor_test_identifier_collision_exemptions
for each row execute function public.luxor_test_identifier_exemption_append_only();

insert into public.luxor_test_identifier_collision_exemptions (inquiry_id, reason) values
  ('ce4a7a94-abd7-402f-bac4-156af405ffb1', 'owner_confirmed_legacy_test'),
  ('450c26e7-7f8e-4bba-af82-fe4a73b6cb9a', 'owner_confirmed_legacy_test'),
  ('74f02e2a-6142-41f5-a5a6-4580207379f4', 'owner_confirmed_legacy_test'),
  ('6ea7d1c2-75b9-4d1a-a56f-4439c7b672c7', 'owner_confirmed_legacy_test'),
  ('b3b0d161-d75e-4333-bfa6-651e971d967a', 'owner_confirmed_legacy_test'),
  ('3b2853a1-61ee-450f-950a-b368be146ac7', 'owner_confirmed_legacy_test'),
  ('974ec2b3-73e8-42c9-b871-c3ba000853bf', 'owner_confirmed_legacy_test'),
  ('b8f02c54-fc29-4016-aeef-9805330a76c8', 'owner_confirmed_legacy_test'),
  ('3256392c-3121-40d3-bc41-11e7c79a9ff3', 'owner_confirmed_legacy_test'),
  ('be741147-f87a-4d8c-8815-2809139be29e', 'owner_confirmed_legacy_test')
on conflict (inquiry_id) do nothing;

create or replace function public.luxor_prevent_test_identifier_customer_collision()
returns trigger language plpgsql set search_path=public as $$
declare
  v_settings public.luxor_test_settings;
  v_email text;
  v_phone text;
begin
  if new.id='00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid and new.is_test is true then return new; end if;
  if tg_op='UPDATE' and new.email is not distinct from old.email and new.phone is not distinct from old.phone then return new; end if;
  select * into v_settings from public.luxor_test_settings where id=1;
  if not found or not v_settings.enabled then return new; end if;
  v_email := lower(trim(coalesce(new.email,'')));
  v_phone := regexp_replace(coalesce(new.phone,''),'[^0-9]','','g');
  if (v_email=v_settings.identification_email or v_phone=v_settings.identification_phone)
    and not exists (select 1 from public.luxor_test_identifier_collision_exemptions e where e.inquiry_id=new.id) then
    raise exception 'This contact matches a protected permanent test identifier; do not create or modify a customer record with it.' using errcode='23505';
  end if;
  return new;
end;
$$;
drop trigger if exists luxor_prevent_test_identifier_customer_collision on public.luxor_inquiries;
create trigger luxor_prevent_test_identifier_customer_collision
before insert or update of email,phone on public.luxor_inquiries
for each row execute function public.luxor_prevent_test_identifier_customer_collision();

create table if not exists public.luxor_test_runs (
  id uuid primary key default gen_random_uuid(),
  test_lead_id uuid not null references public.luxor_inquiries(id) on delete restrict,
  idempotency_key text not null,
  source text not null,
  submitted_email text,
  submitted_phone text,
  submitted_details jsonb not null default '{}'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'reset', 'failed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  reset_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_lead_id, idempotency_key)
);

create unique index if not exists luxor_test_runs_one_active_per_lead_idx
  on public.luxor_test_runs (test_lead_id)
  where status = 'in_progress';

create index if not exists luxor_test_runs_lead_history_idx
  on public.luxor_test_runs (test_lead_id, started_at desc);

create table if not exists public.luxor_test_run_activity (
  id bigint generated by default as identity primary key,
  test_run_id uuid not null references public.luxor_test_runs(id) on delete restrict,
  event_type text not null,
  status text,
  source text,
  details jsonb not null default '{}'::jsonb,
  recipient_email text,
  provider text,
  provider_message_id text,
  provider_status text,
  delivery_status text not null default 'unknown' check (delivery_status in ('unknown', 'delivered', 'bounced', 'complained', 'deferred')),
  delivered_at timestamptz,
  error_message text,
  attempt integer,
  created_at timestamptz not null default now()
);

create index if not exists luxor_test_run_activity_history_idx
  on public.luxor_test_run_activity (test_run_id, created_at, id);

-- Isolated lifecycle artifacts never enter production tours, invoices,
-- bookings, payment, SMS, or marketing tables.
create table if not exists public.luxor_test_run_artifacts (
  id uuid primary key default gen_random_uuid(),
  test_run_id uuid not null references public.luxor_test_runs(id) on delete restrict,
  artifact_type text not null check (artifact_type in ('tour','proposal','contract','invoice','booking','payment','sms')),
  status text not null default 'simulated' check (status in ('simulated','requested','scheduled','confirmed','completed','drafted','prepared','sent','accepted','signed','issued','paid','pending','queued','tentative','cancelled','delivered','failed','reset')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_run_id, artifact_type)
);

create index if not exists luxor_test_run_artifacts_history_idx
  on public.luxor_test_run_artifacts (test_run_id, created_at, artifact_type);

create table if not exists public.luxor_test_run_emails (
  id uuid primary key default gen_random_uuid(),
  test_run_id uuid not null references public.luxor_test_runs(id) on delete restrict,
  category text not null check (category in ('form_confirmation','brochure','tour_confirmation','tour_reminder','follow_up','proposal','contract','booking_confirmation','payment_reminder','planning','event_notification','post_event','review_request','direct_message','other')),
  status text not null default 'simulated' check (status in ('simulated','queued','provider_accepted','delivered','bounced','failed','blocked','reset')),
  actual_recipient text not null check (actual_recipient = 'luxoratlaspalmas@gmail.com'),
  provider text,
  provider_message_id text,
  provider_status text,
  delivery_status text not null default 'unknown' check (delivery_status in ('unknown','delivered','bounced','complained','deferred')),
  error_message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists luxor_test_run_emails_history_idx
  on public.luxor_test_run_emails (test_run_id, created_at, category);

alter table public.luxor_test_run_emails
  add column if not exists email_job_id uuid references public.luxor_email_jobs(id) on delete restrict;
create unique index if not exists luxor_test_run_emails_email_job_idx
  on public.luxor_test_run_emails (email_job_id) where email_job_id is not null;

alter table public.luxor_email_jobs drop constraint if exists luxor_email_jobs_job_type_check;
alter table public.luxor_email_jobs add constraint luxor_email_jobs_job_type_check check (job_type in (
  'tour_confirmation','tour_reminder','tour_no_show_reschedule','proposal_view_reminder',
  'proposal_payment_reminder','contract_signature','contract_view_reminder','contract_signature_reminder',
  'booking_package','deposit_payment_confirmation','unpaid_invoice_reminder','sixty_day_payment_reminder',
  'final_payment_request','final_payment_reminder','event_details_reminder','event_day_reminder',
  'post_event_follow_up','marketing_campaign','grand_opening_rsvp_confirmation','layout_review',
  'calendar_invitation','inquiry_notification','transactional_notice','test_notification'
));

create or replace function public.luxor_test_run_activity_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Test run activity is append-only.' using errcode = '55000';
end;
$$;

drop trigger if exists luxor_test_run_activity_append_only on public.luxor_test_run_activity;
create trigger luxor_test_run_activity_append_only
before update or delete on public.luxor_test_run_activity
for each row execute function public.luxor_test_run_activity_append_only();

alter table public.luxor_email_jobs
  add column if not exists test_run_id uuid references public.luxor_test_runs(id) on delete restrict;
alter table public.luxor_email_jobs
  add column if not exists test_claim_token uuid,
  add column if not exists test_authorized_at timestamptz;

create index if not exists luxor_email_jobs_test_run_status_idx
  on public.luxor_email_jobs (test_run_id, status, scheduled_for)
  where test_run_id is not null;

create or replace function public.luxor_save_test_settings(
  p_identification_email text,
  p_identification_phone text,
  p_email_recipient text,
  p_email_recipient_confirmed boolean,
  p_enabled boolean,
  p_updated_by text
)
returns public.luxor_test_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_identification_email, '')));
  v_phone text := regexp_replace(coalesce(p_identification_phone, ''), '[^0-9]', '', 'g');
  v_recipient text := lower(trim(coalesce(p_email_recipient, '')));
  v_conflicts integer := 0;
  v_settings public.luxor_test_settings;
begin
  select * into v_settings from public.luxor_test_settings where id = 1 for update;
  if exists (select 1 from public.luxor_email_jobs where test_run_id is not null and status in ('sending', 'claimed')) then
    raise exception 'Test email delivery is in flight; retry settings changes after its provider outcome is recorded.' using errcode = '55000';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid test identification email.' using errcode = '22023';
  end if;
  if v_phone !~ '^[0-9]{10}$' then
    raise exception 'Test phone must normalize to exactly 10 digits.' using errcode = '22023';
  end if;
  if v_email <> 'luxoratlaspalmas@gmail.com' or v_phone <> '2149600276' or v_recipient <> 'luxoratlaspalmas@gmail.com' then
    raise exception 'Permanent test identifiers and inbox are fixed to their owner-verified values.' using errcode = '22023';
  end if;
  if v_recipient <> '' and v_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid test email recipient.' using errcode = '22023';
  end if;
  if p_enabled and (v_recipient = '' or p_email_recipient_confirmed is not true) then
    raise exception 'Test workflow cannot be enabled until the exact email recipient is confirmed.' using errcode = '22023';
  end if;

  if p_enabled then
    select count(*) into v_conflicts
    from public.luxor_inquiries inquiry
    where inquiry.is_test is not true
      and (lower(trim(coalesce(inquiry.email, ''))) = v_email
        or regexp_replace(coalesce(inquiry.phone, ''), '[^0-9]', '', 'g') = v_phone)
      and not exists (
        select 1 from public.luxor_test_identifier_collision_exemptions exemption
        where exemption.inquiry_id = inquiry.id and exemption.reason = 'owner_confirmed_legacy_test'
      );
    if v_conflicts > 0 then
      raise exception 'Test identifiers conflict with % unflagged customer records; choose identifiers with no real-customer matches.' , v_conflicts using errcode = '23505';
    end if;
  end if;

  insert into public.luxor_test_settings (
    id, enabled, identification_email, identification_phone,
    email_recipient, email_recipient_confirmed_at, updated_by, updated_at
  ) values (
    1, p_enabled, v_email, v_phone,
    nullif(v_recipient, ''),
    case when p_email_recipient_confirmed is true and v_recipient <> '' then now() else null end,
    nullif(trim(coalesce(p_updated_by, '')), ''), now()
  )
  on conflict (id) do update set
    enabled = excluded.enabled,
    identification_email = excluded.identification_email,
    identification_phone = excluded.identification_phone,
    email_recipient = excluded.email_recipient,
    email_recipient_confirmed_at = excluded.email_recipient_confirmed_at,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into v_settings;

  return v_settings;
end;
$$;

create or replace function public.luxor_start_test_run(
  p_idempotency_key text,
  p_source text,
  p_submitted_email text,
  p_submitted_phone text,
  p_submitted_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.luxor_test_settings;
  v_lead public.luxor_inquiries;
  v_previous public.luxor_test_runs;
  v_existing public.luxor_test_runs;
  v_run public.luxor_test_runs;
  v_email text := lower(trim(coalesce(p_submitted_email, '')));
  v_phone text := regexp_replace(coalesce(p_submitted_phone, ''), '[^0-9]', '', 'g');
  v_conflicts integer := 0;
begin
  if length(trim(coalesce(p_idempotency_key, ''))) < 8 or length(p_idempotency_key) > 160 then
    raise exception 'A valid test submission idempotency key is required.' using errcode = '22023';
  end if;
  select * into v_lead from public.luxor_inquiries where id='00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid and is_test = true;
  if found then
    select * into v_existing from public.luxor_test_runs
    where test_lead_id = v_lead.id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'lead', jsonb_build_object('id', v_lead.id),
        'run', jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'source', v_existing.source, 'started_at', v_existing.started_at),
        'replayed', true
      );
    end if;
  end if;
  select * into v_settings from public.luxor_test_settings where id = 1 for update;
  if not found or not v_settings.enabled then
    raise exception 'Test workflow is disabled pending identifier and recipient validation.' using errcode = '55000';
  end if;
  if not ((v_email <> '' and v_email = v_settings.identification_email)
      or (v_phone <> '' and v_phone = v_settings.identification_phone)) then
    raise exception 'Submission does not match a configured test identifier.' using errcode = '22023';
  end if;
  if v_settings.email_recipient is null or v_settings.email_recipient_confirmed_at is null then
    raise exception 'Test email recipient is not confirmed; test workflow is blocked.' using errcode = '55000';
  end if;
  select count(*) into v_conflicts
  from public.luxor_inquiries inquiry
  where inquiry.is_test is not true
    and (lower(trim(coalesce(inquiry.email, ''))) = v_settings.identification_email
      or regexp_replace(coalesce(inquiry.phone, ''), '[^0-9]', '', 'g') = v_settings.identification_phone)
    and not exists (
      select 1 from public.luxor_test_identifier_collision_exemptions exemption
      where exemption.inquiry_id = inquiry.id and exemption.reason = 'owner_confirmed_legacy_test'
    );
  if v_conflicts > 0 then
    raise exception 'Test identifiers now conflict with unflagged customer records.' using errcode = '23505';
  end if;
  select * into v_lead from public.luxor_inquiries where id='00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid and is_test = true for update;
  if not found then
    raise exception 'The permanent explicitly flagged test lead is not provisioned.' using errcode = '55000';
  end if;
  select * into v_existing from public.luxor_test_runs
  where test_lead_id = v_lead.id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'lead', jsonb_build_object('id', v_lead.id),
      'run', jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'source', v_existing.source, 'started_at', v_existing.started_at),
      'replayed', true
    );
  end if;

  select * into v_previous from public.luxor_test_runs
  where test_lead_id = v_lead.id and status = 'in_progress'
  order by started_at desc limit 1 for update;
  if found then
    if exists (select 1 from public.luxor_email_jobs where test_run_id = v_previous.id and status in ('sending', 'claimed')) then
      raise exception 'A test email is in flight. Retry starting this run after its provider outcome is recorded.' using errcode = '55000';
    end if;
    update public.luxor_email_jobs set status = 'cancelled', last_error = 'Superseded by a newer test run.', updated_at = now()
    where test_run_id = v_previous.id and status = 'queued';
    update public.luxor_test_runs set status = 'cancelled', completed_at = now(), updated_at = now()
    where id = v_previous.id returning * into v_previous;
    insert into public.luxor_test_run_activity (test_run_id, event_type, status, details)
    values (v_previous.id, 'run_cancelled', 'cancelled', jsonb_build_object('reason', 'superseded_by_new_run'));
  end if;

  update public.luxor_inquiries set status = 'new', pipeline_stage = 'inquiry', updated_at = now()
  where id = v_lead.id and is_test = true returning * into v_lead;
  insert into public.luxor_test_runs (
    test_lead_id, idempotency_key, source, submitted_email, submitted_phone,
    submitted_details, status
  ) values (
    v_lead.id, trim(p_idempotency_key), left(trim(coalesce(p_source, 'unknown')), 120),
    nullif(v_email, ''), nullif(v_phone, ''), coalesce(p_submitted_details, '{}'::jsonb), 'in_progress'
  ) returning * into v_run;
  insert into public.luxor_test_run_activity (test_run_id, event_type, status, source, details)
  values (v_run.id, 'run_started', 'in_progress', v_run.source, jsonb_build_object('lead_stage', 'inquiry'));
  insert into public.luxor_test_run_activity (test_run_id, event_type, status, source, details)
  values (v_run.id, 'workflow_started', 'in_progress', v_run.source,
    jsonb_build_object('simulation_only', true, 'production_records_created', false));
  insert into public.luxor_test_run_artifacts (test_run_id, artifact_type, status, details)
  values
    (v_run.id, 'tour', 'simulated', jsonb_build_object('label', 'Simulated venue tour', 'production_calendar_event', false)),
    (v_run.id, 'proposal', 'simulated', jsonb_build_object('label', 'Simulated proposal', 'production_invoice', false)),
    (v_run.id, 'contract', 'simulated', jsonb_build_object('label', 'Simulated contract', 'legal_effect', false)),
    (v_run.id, 'invoice', 'simulated', jsonb_build_object('label', 'Simulated invoice', 'payment_obligation', false)),
    (v_run.id, 'booking', 'simulated', jsonb_build_object('label', 'Simulated booking', 'inventory_reserved', false)),
    (v_run.id, 'payment', 'simulated', jsonb_build_object('label', 'Simulated payment', 'money_moved', false)),
    (v_run.id, 'sms', 'simulated', jsonb_build_object('label', 'Simulated SMS', 'provider_called', false));
  insert into public.luxor_test_run_emails (test_run_id, category, actual_recipient, status, delivery_status, details)
  select v_run.id, category, v_settings.email_recipient, 'simulated', 'unknown',
    jsonb_build_object('simulation_only', true, 'provider_called', false, 'delivery_claimed', false)
  from unnest(array['form_confirmation','brochure','tour_confirmation','tour_reminder','follow_up','proposal','contract','booking_confirmation','payment_reminder','planning','event_notification','post_event','review_request','other']) as category;
  return jsonb_build_object(
    'lead', jsonb_build_object('id', v_lead.id),
    'run', jsonb_build_object('id', v_run.id, 'status', v_run.status, 'source', v_run.source, 'started_at', v_run.started_at),
    'replayed', false
  );
end;
$$;

create or replace function public.luxor_reset_test_run(p_test_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.luxor_test_runs;
  v_lead public.luxor_inquiries;
begin
  -- Lock the permanent lead before the run, matching start-run lock order.
  -- This avoids a reset/start deadlock under concurrent submissions.
  select run.* into v_run from public.luxor_test_runs run where run.id = p_test_run_id;
  if not found then raise exception 'Test run not found.' using errcode = 'P0002'; end if;
  select * into v_lead from public.luxor_inquiries where id = v_run.test_lead_id and is_test is true for update;
  if not found then raise exception 'The permanent test lead is not provisioned.' using errcode = '55000'; end if;
  select * into v_run from public.luxor_test_runs where id = p_test_run_id for update;
  if not found or v_run.test_lead_id <> v_lead.id then raise exception 'Test run changed while reset began.' using errcode = '40001'; end if;
  if v_run.status = 'reset' then
    return jsonb_build_object('run', jsonb_build_object('id', v_run.id, 'status', v_run.status), 'replayed', true);
  end if;
  if v_run.status <> 'in_progress' then
    raise exception 'Only the active test run can be reset.' using errcode = '55000';
  end if;
  -- A worker that claimed first holds the run row until its atomic claim is
  -- committed; refuse reset while the provider send is in flight.
  if exists (select 1 from public.luxor_email_jobs where test_run_id = v_run.id and status in ('sending', 'claimed')) then
    raise exception 'A test email is in flight. Retry reset after its provider outcome is recorded.' using errcode = '55000';
  end if;
  update public.luxor_email_jobs set status = 'cancelled', last_error = 'Cancelled by test pipeline reset.', updated_at = now()
  where test_run_id = v_run.id and status = 'queued';
  update public.luxor_test_run_artifacts set status = 'reset', updated_at = now()
  where test_run_id = v_run.id and status <> 'reset';
  update public.luxor_test_run_emails set status = 'reset', updated_at = now()
  where test_run_id = v_run.id and status in ('simulated','queued');
  update public.luxor_test_runs set status = 'reset', completed_at = now(), reset_at = now(), updated_at = now()
  where id = v_run.id returning * into v_run;
  update public.luxor_inquiries set status = 'new', pipeline_stage = 'inquiry', updated_at = now()
  where id = v_run.test_lead_id and is_test = true returning * into v_lead;
  insert into public.luxor_test_run_activity (test_run_id, event_type, status, details)
  values (v_run.id, 'pipeline_reset', 'reset', jsonb_build_object('lead_stage', 'inquiry'));
  return jsonb_build_object('run', jsonb_build_object('id', v_run.id, 'status', v_run.status), 'replayed', false);
end;
$$;

create or replace function public.luxor_advance_test_artifact(
  p_test_run_id uuid,
  p_artifact_type text,
  p_status text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.luxor_test_runs;
  v_artifact public.luxor_test_run_artifacts;
  v_allowed text[];
  v_current_status text;
  v_next_status text;
begin
  select * into v_run from public.luxor_test_runs where id = p_test_run_id for update;
  if not found or v_run.status <> 'in_progress' then
    raise exception 'Only the active test run can advance simulated workflow records.' using errcode = '55000';
  end if;
  if p_artifact_type not in ('tour','proposal','contract','invoice','booking','payment','sms') then
    raise exception 'Unsupported simulated workflow type.' using errcode = '22023';
  end if;
  v_allowed := case p_artifact_type
    when 'tour' then array['simulated','requested','scheduled','confirmed','completed','failed']
    when 'proposal' then array['simulated','drafted','sent','accepted','failed']
    when 'contract' then array['simulated','prepared','sent','signed','failed']
    when 'invoice' then array['simulated','issued','paid','failed']
    when 'booking' then array['simulated','tentative','confirmed','cancelled','failed']
    when 'payment' then array['simulated','pending','paid','failed']
    when 'sms' then array['simulated','queued','sent','delivered','failed']
    else array['simulated']
  end;
  if p_status <> all(v_allowed) then
    raise exception 'Status is not valid for this simulated workflow type.' using errcode = '22023';
  end if;
  select status into v_current_status from public.luxor_test_run_artifacts
  where test_run_id=v_run.id and artifact_type=p_artifact_type for update;
  if not found then v_current_status := 'simulated'; end if;
  v_next_status := case p_artifact_type
    when 'tour' then case v_current_status when 'simulated' then 'requested' when 'requested' then 'scheduled' when 'scheduled' then 'confirmed' when 'confirmed' then 'completed' else null end
    when 'proposal' then case v_current_status when 'simulated' then 'drafted' when 'drafted' then 'sent' when 'sent' then 'accepted' else null end
    when 'contract' then case v_current_status when 'simulated' then 'prepared' when 'prepared' then 'sent' when 'sent' then 'signed' else null end
    when 'invoice' then case v_current_status when 'simulated' then 'issued' when 'issued' then 'paid' else null end
    when 'booking' then case v_current_status when 'simulated' then 'tentative' when 'tentative' then 'confirmed' when 'confirmed' then 'cancelled' else null end
    when 'payment' then case v_current_status when 'simulated' then 'pending' when 'pending' then 'paid' else null end
    when 'sms' then case v_current_status when 'simulated' then 'queued' when 'queued' then 'sent' when 'sent' then 'delivered' else null end
  end;
  if p_status <> 'failed' and p_status is distinct from v_next_status then
    raise exception 'Workflow transition is out of sequence; expected next state: %.', coalesce(v_next_status, 'terminal') using errcode = '22023';
  end if;
  if p_status = 'failed' and v_current_status in ('completed','accepted','signed','paid','cancelled','delivered','failed','reset') then
    raise exception 'A completed simulated workflow cannot be marked failed.' using errcode = '22023';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'Simulated workflow details must be a JSON object.' using errcode = '22023';
  end if;
  insert into public.luxor_test_run_artifacts (test_run_id, artifact_type, status, details, updated_at)
  values (v_run.id, p_artifact_type, p_status, p_details || jsonb_build_object('simulation_only', true), now())
  on conflict (test_run_id, artifact_type) do update set
    status = excluded.status,
    details = public.luxor_test_run_artifacts.details || excluded.details,
    updated_at = now()
  returning * into v_artifact;
  insert into public.luxor_test_run_activity (test_run_id, event_type, status, details)
  values (v_run.id, 'simulated_' || p_artifact_type, p_status,
    jsonb_build_object('artifact_id', v_artifact.id, 'simulation_only', true, 'details', p_details));
  return jsonb_build_object('artifact', to_jsonb(v_artifact), 'simulation_only', true);
end;
$$;

create or replace function public.luxor_record_test_email_simulation(
  p_test_lead_id uuid,
  p_category text,
  p_subject text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.luxor_test_runs;
  v_settings public.luxor_test_settings;
  v_email public.luxor_test_run_emails;
begin
  if p_test_lead_id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid then
    raise exception 'Only the verified permanent test lead can receive simulated test email.' using errcode = '22023';
  end if;
  select * into v_settings from public.luxor_test_settings where id = 1;
  if not found or not v_settings.enabled or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com' then
    raise exception 'Test email simulation is unavailable while test workflows are disabled or the recipient is not the verified inbox.' using errcode = '55000';
  end if;
  select * into v_run from public.luxor_test_runs
  where test_lead_id = p_test_lead_id and status = 'in_progress'
  order by started_at desc limit 1 for update;
  if not found then raise exception 'No active test run exists for this test email.' using errcode = '55000'; end if;
  if p_category not in ('form_confirmation','brochure','tour_confirmation','tour_reminder','follow_up','proposal','contract','booking_confirmation','payment_reminder','planning','event_notification','post_event','review_request','direct_message','other') then
    raise exception 'Unsupported test email category.' using errcode = '22023';
  end if;
  insert into public.luxor_test_run_emails (test_run_id, category, status, actual_recipient, details)
  values (v_run.id, p_category, 'simulated', 'luxoratlaspalmas@gmail.com', jsonb_build_object(
    'simulation_only', true, 'provider_called', false, 'provider_status', 'not_attempted',
    'delivery_status', 'unknown', 'subject', left(coalesce(p_subject, ''), 200), 'source', left(coalesce(p_source, ''), 120)
  )) returning * into v_email;
  insert into public.luxor_test_run_activity (test_run_id, event_type, status, source, recipient_email, provider_status, delivery_status, details)
  values (v_run.id, 'email_simulated', 'simulated', left(coalesce(p_source, ''), 120), 'luxoratlaspalmas@gmail.com', 'not_attempted', 'unknown',
    jsonb_build_object('email_id', v_email.id, 'category', p_category, 'simulation_only', true));
  return jsonb_build_object('email', to_jsonb(v_email), 'test_run_id', v_run.id, 'recipient', 'luxoratlaspalmas@gmail.com', 'simulated', true);
end;
$$;

create or replace function public.luxor_enqueue_test_email(
  p_test_run_id uuid,
  p_category text,
  p_subject text,
  p_body text,
  p_source text default 'portal_test_lead'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.luxor_test_settings;
  v_run public.luxor_test_runs;
  v_job public.luxor_email_jobs;
  v_email public.luxor_test_run_emails;
begin
  if p_test_run_id is null then raise exception 'A test run is required.' using errcode='22023'; end if;
  select * into v_settings from public.luxor_test_settings where id = 1 for update;
  if not found or not v_settings.enabled or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com'
      or v_settings.email_recipient_confirmed_at is null then
    raise exception 'Test email delivery is disabled or the verified test inbox is not confirmed.' using errcode = '55000';
  end if;
  select * into v_run from public.luxor_test_runs where id = p_test_run_id for update;
  if not found or v_run.test_lead_id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid or v_run.status <> 'in_progress' then
    raise exception 'Only the active test run can enqueue test email.' using errcode = '55000';
  end if;
  if p_category not in ('form_confirmation','brochure','tour_confirmation','tour_reminder','follow_up','proposal','contract','booking_confirmation','payment_reminder','planning','event_notification','post_event','review_request','direct_message','other') then
    raise exception 'Unsupported test email category.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_subject,''))) not between 1 and 200 or length(trim(coalesce(p_body,''))) not between 1 and 50000 then
    raise exception 'Test email subject or body has an invalid length.' using errcode = '22023';
  end if;

  insert into public.luxor_email_jobs (
    inquiry_id, job_type, status, recipient_email, subject, body, scheduled_for,
    metadata, test_run_id
  ) values (
    v_run.test_lead_id, 'test_notification', 'queued', 'luxoratlaspalmas@gmail.com',
    trim(p_subject), p_body, now(),
    jsonb_build_object('test_email','true','test_category',p_category,'test_source',left(coalesce(p_source,''),120)),
    v_run.id
  ) returning * into v_job;
  insert into public.luxor_test_run_emails (
    test_run_id, email_job_id, category, status, actual_recipient,
    delivery_status, details
  ) values (
    v_run.id, v_job.id, p_category, 'queued', 'luxoratlaspalmas@gmail.com', 'unknown',
    jsonb_build_object('simulation_only',false,'provider_called',false,'delivery_status','unknown','source',left(coalesce(p_source,''),120))
  ) returning * into v_email;
  insert into public.luxor_test_run_activity (test_run_id,event_type,status,source,recipient_email,details)
  values (v_run.id,'test_email_queued','queued',left(coalesce(p_source,''),120),'luxoratlaspalmas@gmail.com',
    jsonb_build_object('email_id',v_email.id,'email_job_id',v_job.id,'category',p_category));
  return jsonb_build_object('email',to_jsonb(v_email),'job_id',v_job.id,'test_run_id',v_run.id,'recipient','luxoratlaspalmas@gmail.com');
end;
$$;

create or replace function public.luxor_record_test_sms_simulation(
  p_test_lead_id uuid,
  p_body text,
  p_source text default 'portal_test_lead'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.luxor_test_settings;
  v_run public.luxor_test_runs;
  v_artifact public.luxor_test_run_artifacts;
begin
  if p_test_lead_id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid then
    raise exception 'Only the verified permanent test lead can receive simulated SMS.' using errcode='22023';
  end if;
  select * into v_settings from public.luxor_test_settings where id = 1;
  if not found or not v_settings.enabled or v_settings.identification_phone is distinct from '2149600276' then
    raise exception 'Test SMS simulation is disabled or the verified test number is not configured.' using errcode = '55000';
  end if;
  if length(trim(coalesce(p_body,''))) not between 1 and 1600 then
    raise exception 'Test SMS body has an invalid length.' using errcode = '22023';
  end if;
  select * into v_run from public.luxor_test_runs
  where test_lead_id=p_test_lead_id and status='in_progress'
  order by started_at desc limit 1 for update;
  if not found then raise exception 'No active test run exists for SMS simulation.' using errcode='55000'; end if;
  insert into public.luxor_test_run_artifacts(test_run_id,artifact_type,status,details,updated_at)
  values(v_run.id,'sms','delivered',jsonb_build_object(
    'simulation_only',true,'provider_called',false,'delivery_status','simulated',
    'recipient','214-960-0276','body',left(p_body,1600),'source',left(coalesce(p_source,''),120)
  ),now())
  on conflict(test_run_id,artifact_type) do update set status='delivered',
    details=public.luxor_test_run_artifacts.details || excluded.details,updated_at=now()
  returning * into v_artifact;
  insert into public.luxor_test_run_activity(test_run_id,event_type,status,source,details)
  values(v_run.id,'sms_simulated','delivered',left(coalesce(p_source,''),120),
    jsonb_build_object('artifact_id',v_artifact.id,'simulation_only',true,'provider_called',false,'recipient','214-960-0276','body',left(p_body,1600)));
  return jsonb_build_object('artifact',to_jsonb(v_artifact),'test_run_id',v_run.id,'simulated',true,'provider_called',false);
end;
$$;

drop function if exists public.luxor_authorize_test_email_job(uuid);
create or replace function public.luxor_authorize_test_email_job(p_job_id uuid, p_claim_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.luxor_email_jobs;
  v_run public.luxor_test_runs;
  v_settings public.luxor_test_settings;
begin
  -- Lock settings first (the same order as run start/settings updates), then
  -- lock run before job (the same order as reset), avoiding cross-boundary deadlocks.
  select * into v_settings from public.luxor_test_settings where id = 1 for update;
  if not found then return jsonb_build_object('eligible', false, 'reason', 'test_settings_missing'); end if;
  select * into v_job from public.luxor_email_jobs where id = p_job_id;
  if not found then return jsonb_build_object('eligible', false, 'reason', 'missing_job'); end if;
  if v_job.inquiry_id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid or v_job.job_type <> 'test_notification'
    or coalesce(v_job.metadata ->> 'test_email', 'false') <> 'true' then
    return jsonb_build_object('eligible', false, 'reason', 'unsafe_or_already_claimed_test_job');
  end if;
  if v_job.test_run_id is null then
    select * into v_run from public.luxor_test_runs
    where test_lead_id = v_job.inquiry_id and status = 'in_progress'
    order by started_at desc limit 1 for update;
    if not found then return jsonb_build_object('eligible', false, 'reason', 'missing_active_test_run'); end if;
    update public.luxor_email_jobs set test_run_id = v_run.id
    where id = v_job.id and test_run_id is null returning * into v_job;
    if not found then return jsonb_build_object('eligible', false, 'reason', 'job_claim_race'); end if;
  else
    select * into v_run from public.luxor_test_runs where id = v_job.test_run_id for update;
    if not found then return jsonb_build_object('eligible', false, 'reason', 'missing_test_run'); end if;
  end if;
  select * into v_job from public.luxor_email_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'sending' or p_claim_token is null
    or v_job.test_claim_token is distinct from p_claim_token or v_job.test_authorized_at is not null then
    return jsonb_build_object('eligible', false, 'reason', 'unsafe_or_already_claimed_test_job');
  end if;
  if v_run.status <> 'in_progress' or v_run.test_lead_id <> v_job.inquiry_id then
    return jsonb_build_object('eligible', false, 'reason', 'stale_test_run');
  end if;
  if not v_settings.enabled or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com' or v_settings.email_recipient_confirmed_at is null then
    return jsonb_build_object('eligible', false, 'reason', 'recipient_unconfirmed');
  end if;
  update public.luxor_email_jobs set test_authorized_at=now(), updated_at=now()
    where id=v_job.id and status='sending' and test_claim_token=p_claim_token and test_authorized_at is null;
  if not found then return jsonb_build_object('eligible', false, 'reason', 'job_already_authorized'); end if;
  return jsonb_build_object('eligible', true, 'recipient', 'luxoratlaspalmas@gmail.com', 'test_run_id', v_run.id);
end;
$$;

create or replace function public.luxor_claim_due_test_email_jobs(job_limit integer default 1)
returns setof public.luxor_email_jobs
language plpgsql security invoker set search_path = public
as $$
declare
  v_settings public.luxor_test_settings;
  v_run public.luxor_test_runs;
  v_job public.luxor_email_jobs;
  v_limit integer := greatest(1, least(coalesce(job_limit,1),25));
  v_count integer := 0;
begin
  select * into v_settings from public.luxor_test_settings where id=1 for update;
  if not found or not v_settings.enabled or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com'
    or v_settings.email_recipient_confirmed_at is null then return; end if;
  -- A worker crash leaves an unknown provider outcome. Mark the attempt failed
  -- after the safety window, never auto-resend it, and let reset proceed.
  for v_run in
    select * from public.luxor_test_runs where status='in_progress'
    order by started_at for update skip locked
  loop
    for v_job in
      update public.luxor_email_jobs set status='failed',
        last_error='Worker interrupted; provider outcome is unknown. Check delivery history before retrying.',
        updated_at=now()
      where test_run_id=v_run.id and job_type='test_notification' and status='sending'
        and updated_at<now()-interval '15 minutes'
      returning *
    loop
      update public.luxor_test_run_emails set status='failed', provider_status='outcome_unknown',
        delivery_status='unknown', error_message='Worker interrupted; provider outcome is unknown.',
        updated_at=now() where email_job_id=v_job.id and status in ('queued','provider_accepted');
      insert into public.luxor_test_run_activity (test_run_id,event_type,status,provider_status,delivery_status,error_message,attempt,details)
      values (v_run.id,'test_email_worker_stale','failed','outcome_unknown','unknown',
        'Worker interrupted; no automatic resend was attempted.',v_job.attempts,
        jsonb_build_object('email_job_id',v_job.id,'provider_called_may_be_true',true));
    end loop;
  end loop;
  for v_run in
    select * from public.luxor_test_runs where status='in_progress'
    order by started_at for update skip locked
  loop
    exit when v_count >= v_limit;
    select * into v_job from public.luxor_email_jobs
    where test_run_id=v_run.id and inquiry_id=v_run.test_lead_id and job_type='test_notification'
      and status='queued' and scheduled_for<=now()
    order by scheduled_for,created_at,id limit 1 for update skip locked;
    if found then
      update public.luxor_email_jobs set status = 'sending', attempts = coalesce(attempts,0)+1,
        test_claim_token = gen_random_uuid(), test_authorized_at = null, updated_at = now()
      where id=v_job.id returning * into v_job;
      v_count := v_count + 1;
      return next v_job;
    end if;
  end loop;
end;
$$;

-- Test jobs have their own run-before-job claim; exclude them from the generic
-- queue to keep resets and delivery claims ordered on the same run fence.
create or replace function public.luxor_claim_due_email_jobs(job_limit integer default 1)
returns setof public.luxor_email_jobs language plpgsql security invoker set search_path='' as $$
begin
  job_limit := greatest(1,least(coalesce(job_limit,1),100));
  update public.luxor_email_jobs set status=case when attempts>=3 then 'failed' else 'queued' end,
    scheduled_for=case when attempts>=3 then scheduled_for else now()+interval '5 minutes' end,
    last_error=case when attempts>=3 then coalesce(last_error,'Delivery worker stopped before completing the job.')
      else coalesce(last_error,'Delivery worker interrupted; automatically queued for retry.') end,updated_at=now()
    where automation_enrollment_id is null
      and job_type not in ('inquiry_notification','transactional_notice','test_notification')
      and status='sending' and updated_at<now()-interval '15 minutes';
  return query with due as (
    select id from public.luxor_email_jobs where automation_enrollment_id is null
      and job_type not in ('inquiry_notification','transactional_notice','test_notification') and status='queued' and scheduled_for<=now()
      and not exists(select 1 from public.luxor_email_jobs recent where recent.automation_enrollment_id is null
        and recent.job_type not in ('inquiry_notification','transactional_notice','test_notification')
        and recent.status in ('sending','sent') and coalesce(recent.sent_at,recent.updated_at)>now()-interval '60 seconds')
    order by scheduled_for,created_at,id for update skip locked limit job_limit
  ), claimed as (
    update public.luxor_email_jobs j set status='sending',attempts=j.attempts+1,updated_at=now()
      from due where j.id=due.id returning j.*
  ) select * from claimed order by scheduled_for,created_at,id;
end;
$$;
revoke all on function public.luxor_claim_due_test_email_jobs(integer) from public,anon,authenticated;
grant execute on function public.luxor_claim_due_test_email_jobs(integer) to service_role;
revoke all on function public.luxor_claim_due_email_jobs(integer) from public,anon,authenticated;
grant execute on function public.luxor_claim_due_email_jobs(integer) to service_role;

create or replace function public.luxor_prevent_permanent_test_lead_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.is_test is true then
    raise exception 'The permanent test lead cannot be deleted or demoted.' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.is_test is true and new.is_test is not true then
    raise exception 'The permanent test lead cannot be deleted or demoted.' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.is_test is true and new.id <> old.id then
    raise exception 'The permanent test lead ID is stable and cannot be changed.' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists luxor_prevent_permanent_test_lead_delete on public.luxor_inquiries;
create trigger luxor_prevent_permanent_test_lead_delete
before delete or update on public.luxor_inquiries
for each row execute function public.luxor_prevent_permanent_test_lead_delete();

alter table public.luxor_test_settings enable row level security;
alter table public.luxor_test_identifier_collision_exemptions enable row level security;
alter table public.luxor_test_runs enable row level security;
alter table public.luxor_test_run_activity enable row level security;
alter table public.luxor_test_run_artifacts enable row level security;
alter table public.luxor_test_run_emails enable row level security;
revoke all on public.luxor_test_settings, public.luxor_test_identifier_collision_exemptions, public.luxor_test_runs, public.luxor_test_run_activity, public.luxor_test_run_artifacts, public.luxor_test_run_emails from anon, authenticated;
-- Managed public-schema default ACLs can be broad; grant only the rights used below.
revoke all on public.luxor_test_settings, public.luxor_test_identifier_collision_exemptions, public.luxor_test_runs, public.luxor_test_run_activity, public.luxor_test_run_artifacts, public.luxor_test_run_emails from public, anon, authenticated, service_role;
grant select on public.luxor_test_settings, public.luxor_test_runs to service_role;
grant select, insert on public.luxor_test_run_activity to service_role;
grant select on public.luxor_test_run_artifacts to service_role;
grant select, update on public.luxor_test_run_emails to service_role;
revoke all on sequence public.luxor_test_run_activity_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.luxor_test_run_activity_id_seq to service_role;
revoke all on function public.luxor_save_test_settings(text, text, text, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.luxor_start_test_run(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.luxor_reset_test_run(uuid) from public, anon, authenticated;
revoke all on function public.luxor_authorize_test_email_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.luxor_advance_test_artifact(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.luxor_record_test_email_simulation(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.luxor_enqueue_test_email(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.luxor_record_test_sms_simulation(uuid, text, text) from public, anon, authenticated;
revoke all on function public.luxor_claim_due_test_email_jobs(integer) from public, anon, authenticated;
grant execute on function public.luxor_save_test_settings(text, text, text, boolean, boolean, text) to service_role;
grant execute on function public.luxor_start_test_run(text, text, text, text, jsonb) to service_role;
grant execute on function public.luxor_reset_test_run(uuid) to service_role;
grant execute on function public.luxor_authorize_test_email_job(uuid, uuid) to service_role;
grant execute on function public.luxor_advance_test_artifact(uuid, text, text, jsonb) to service_role;
grant execute on function public.luxor_record_test_email_simulation(uuid, text, text, text) to service_role;
grant execute on function public.luxor_enqueue_test_email(uuid, text, text, text, text) to service_role;
grant execute on function public.luxor_record_test_sms_simulation(uuid, text, text) to service_role;
grant execute on function public.luxor_claim_due_test_email_jobs(integer) to service_role;
