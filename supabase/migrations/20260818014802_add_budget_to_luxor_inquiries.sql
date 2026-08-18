alter table public.luxor_inquiries
  add column if not exists budget text;

comment on column public.luxor_inquiries.budget is 'Customer-provided planning budget range from a public inquiry or tour form.';

update public.luxor_proposal_pricing
set config = jsonb_set(config, '{tables_and_chairs_setup,retail}', '0'::jsonb),
    version = version + 1,
    updated_at = now()
where is_default = true;
