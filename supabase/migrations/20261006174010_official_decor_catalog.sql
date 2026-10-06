-- Add only the approved official Luxor decor offerings to the active catalog.
-- Existing vendor estimates, rental/fee/tax/payment rules, and all invoice
-- snapshots remain untouched. No schema, grants, or RLS policies are changed.
do $$
declare
  catalog_id uuid;
  catalog_config jsonb;
  decor_prices jsonb := '{
    "decor-classic": {"amount": 1395},
    "decor-signature": {"amount": 2295},
    "decor-luxor": {"amount": 3495},
    "decor-cream-sofa": {"amount": 150},
    "decor-balloon-backdrop": {"amount": 500},
    "decor-floral-backdrop": {"amount": 550},
    "decor-balloon-floral-backdrop": {"amount": 750},
    "decor-photoboard": {"amount": 250},
    "decor-balloon-arch": {"amount": 525},
    "decor-marquee-letters": {"amount": 50}
  }'::jsonb;
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

  -- Safe to retry, but never overwrite a later owner-managed price change.
  if catalog_config->'luxor_costs' ? 'official_decor' then
    if catalog_config#>'{luxor_costs,official_decor}' = decor_prices then
      return;
    end if;
    raise exception 'Official decor pricing already exists; review it before applying this migration.';
  end if;

  update public.luxor_proposal_pricing
  set config = jsonb_set(config, '{luxor_costs,official_decor}', decor_prices, true),
      version = version + 1,
      updated_at = now()
  where id = catalog_id and is_default = true;
end;
$$;
