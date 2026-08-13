-- The supporting package workbook explicitly prices tables and chairs setup
-- at $500 for the Rental Only and Bronze packages. Make that component an
-- auditable configuration rule instead of hiding it inside a package total.

update public.luxor_proposal_pricing
set config = jsonb_set(
  config,
  '{tables_and_chairs_setup}',
  jsonb_build_object(
    'retail', 500,
    'all_inclusive', 0,
    'source', 'Package Breakdown worksheet',
    'required_for_packages', jsonb_build_array('rental_only', 'bronze_essentials')
  ),
  true
),
updated_at = now(),
version = version + 1
where is_default
  and not (config ? 'tables_and_chairs_setup');
