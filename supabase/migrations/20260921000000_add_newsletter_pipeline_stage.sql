-- Add 'newsletter' to pipeline_stage check constraints on luxor_inquiries and luxor_lead_events,
-- and migrate existing newsletter-origin leads (such as Margaret) to the 'newsletter' pipeline stage.

do $$
declare
  constraint_name name;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.luxor_inquiries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%pipeline_stage%'
  loop
    execute format('alter table public.luxor_inquiries drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.luxor_inquiries
  add constraint luxor_inquiries_pipeline_stage_check
  check (pipeline_stage in ('newsletter', 'inquiry', 'tour', 'proposal', 'contract', 'deposit', 'planning', 'final_payment', 'event', 'closing', 'closed_lost'));

do $$
declare
  constraint_name name;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.luxor_lead_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%pipeline_stage%'
  loop
    execute format('alter table public.luxor_lead_events drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.luxor_lead_events
  add constraint luxor_lead_events_pipeline_stage_check
  check (pipeline_stage in ('newsletter', 'inquiry', 'tour', 'proposal', 'contract', 'deposit', 'planning', 'final_payment', 'event', 'closing', 'closed_lost'));

-- Update existing newsletter leads to 'newsletter' stage
update public.luxor_inquiries
set pipeline_stage = 'newsletter'
where (
  source = 'newsletter'
  or flow = 'newsletter_signup'
  or coalesce(metadata->>'submitted_form', '') ilike '%newsletter%'
  or coalesce(metadata->>'marketing_source', '') = 'newsletter'
)
and pipeline_stage = 'inquiry';

-- Update associated lead events
update public.luxor_lead_events
set pipeline_stage = 'newsletter'
where inquiry_id in (
  select id from public.luxor_inquiries where pipeline_stage = 'newsletter'
)
and pipeline_stage = 'inquiry';
