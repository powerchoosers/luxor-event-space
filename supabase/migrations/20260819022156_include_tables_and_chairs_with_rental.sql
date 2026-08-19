-- Tables and chairs are now included with every venue rental at no additional
-- charge. This only changes the active pricing configuration used for new
-- drafts; locked invoice/proposal snapshots are intentionally untouched.
update public.luxor_proposal_pricing
set config = jsonb_set(
  jsonb_set(
    jsonb_set(
      config,
      '{tables_and_chairs_setup,retail}',
      '0'::jsonb,
      true
    ),
    '{tables_and_chairs_setup,all_inclusive}',
    '0'::jsonb,
    true
  ),
  '{tables_and_chairs_setup,required_for_packages}',
  '[]'::jsonb,
  true
),
version = version + 1,
updated_at = now()
where is_default = true;
