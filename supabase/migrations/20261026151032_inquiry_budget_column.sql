alter table public.luxor_inquiries
  add column if not exists budget text;

comment on column public.luxor_inquiries.budget is 'Customer-provided planning budget range from a public inquiry or tour form.';
