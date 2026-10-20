-- Seed the approved owner-editable decor catalog for new V4 proposals.
-- Keep the legacy official_decor map and every saved proposal snapshot intact.
-- This migration changes one default pricing JSON key and does not alter schema,
-- RLS, grants, package fees, venue charges, or historical invoices.
do $$
declare
  catalog_id uuid;
  catalog_config jsonb;
  decor_catalog jsonb := $catalog$
  {
    "schema_version": 1,
    "items": [
      {"id":"tablecloths","name":"Tablecloths","description":"Any color tablecloths, up to 2 colors.","category":"signature_package_add_ons","amount":125,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["signature","luxor"],"display_order":1},
      {"id":"silverware","name":"Silverware","description":"","category":"signature_package_add_ons","amount":75,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["signature","luxor"],"display_order":2},
      {"id":"sofa_throne_chair","name":"Sofa or Throne Chair","description":"","category":"signature_package_add_ons","amount":175,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["signature","luxor"],"display_order":3},
      {"id":"centerpieces","name":"Centerpieces","description":"","category":"signature_package_add_ons","amount":300,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["signature","luxor"],"display_order":4},
      {"id":"napkins","name":"Napkins","description":"","category":"signature_package_add_ons","amount":50,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["signature","luxor"],"display_order":5},
      {"id":"uplighting","name":"Uplighting","description":"","category":"signature_package_add_ons","amount":200,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["signature","luxor"],"display_order":6},
      {"id":"table_runners","name":"Table Runners","description":"","category":"luxor_package_add_ons","amount":75,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["luxor"],"display_order":1},
      {"id":"glasses","name":"Glasses","description":"","category":"luxor_package_add_ons","amount":100,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["luxor"],"display_order":2},
      {"id":"arch_backdrop","name":"Arch Backdrop","description":"","category":"luxor_package_add_ons","amount":250,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["luxor"],"display_order":3},
      {"id":"shimmer_wall","name":"Shimmer Wall","description":"","category":"luxor_package_add_ons","amount":300,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["luxor"],"display_order":4},
      {"id":"led_sign","name":"LED Sign","description":"","category":"luxor_package_add_ons","amount":125,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["luxor"],"display_order":5},
      {"id":"custom_vinyl","name":"Custom Vinyl","description":"","category":"luxor_package_add_ons","amount":100,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["luxor"],"display_order":6},
      {"id":"chafing_dishes","name":"Chafing Dishes","description":"","category":"luxor_package_add_ons","amount":100,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["luxor"],"display_order":7},
      {"id":"charger_plates","name":"Charger Plates","description":"","category":"luxor_package_add_ons","amount":125,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["luxor"],"display_order":8},
      {"id":"display_pedestal_set","name":"Display Pedestal Set","description":"","category":"luxor_package_add_ons","amount":100,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["luxor"],"display_order":9},
      {"id":"balloon_garland","name":"Balloon Garland","description":"","category":"luxor_package_add_ons","amount":300,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["luxor"],"display_order":10},
      {"id":"floral_arch","name":"Floral Arch","description":"","category":"luxor_package_add_ons","amount":400,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["luxor"],"display_order":11},
      {"id":"digital_photobooth_4_hours","name":"Digital Photobooth (4 Hours)","description":"","category":"luxor_package_add_ons","amount":450,"pricing_unit":"order","minimum_quantity":1,"active":true,"included_in_packages":["luxor"],"display_order":12},
      {"id":"custom_photo_board","name":"Custom Photo Board","description":"","category":"premium_add_ons","amount":250,"pricing_unit":"each","minimum_quantity":1,"active":true,"included_in_packages":[],"display_order":1},
      {"id":"marquee_letters_4ft","name":"4-ft Marquee Letters","description":"","category":"premium_add_ons","amount":40,"pricing_unit":"letter","minimum_quantity":2,"active":true,"included_in_packages":[],"display_order":2},
      {"id":"balloon_arch_21ft","name":"21-ft Balloon Arch (up to 3 colors)","description":"","category":"premium_add_ons","amount":250,"pricing_unit":"arch","minimum_quantity":1,"active":true,"included_in_packages":[],"display_order":3}
    ]
  }
  $catalog$::jsonb;
begin
  if (select count(*) from public.luxor_proposal_pricing where is_default = true) <> 1 then
    raise exception 'Expected exactly one active Luxor pricing catalog.';
  end if;

  select id, config into catalog_id, catalog_config
  from public.luxor_proposal_pricing
  where is_default = true
  for update;

  if catalog_config->>'pricing_mode' is distinct from 'venue_plus_preferred_vendor_estimates'
    or jsonb_typeof(catalog_config->'luxor_costs') is distinct from 'object' then
    raise exception 'The active Luxor pricing catalog has an unexpected structure.';
  end if;

  if catalog_config#>'{luxor_costs,official_decor_catalog_v2}' is not null then
    if catalog_config#>'{luxor_costs,official_decor_catalog_v2}' = decor_catalog then
      return;
    end if;
    raise exception 'The V4 decor catalog already exists; review owner changes before applying this migration.';
  end if;

  update public.luxor_proposal_pricing
  set config = jsonb_set(config, '{luxor_costs,official_decor_catalog_v2}', decor_catalog, true),
      version = version + 1,
      updated_at = now()
  where id = catalog_id and is_default = true;
end;
$$;
