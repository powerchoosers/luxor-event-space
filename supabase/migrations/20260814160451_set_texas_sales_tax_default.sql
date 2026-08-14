-- Luxor operates in Texas. The default proposal rate is the state's maximum
-- combined state/local sales-tax rate. Owners can still override a proposal
-- when the applicable local jurisdiction or exemption requires it.
update public.luxor_proposal_pricing
set config = jsonb_set(
  coalesce(config, '{}'::jsonb),
  '{taxes_and_processing_fees,sales_tax_rate}',
  to_jsonb(0.0825::numeric),
  true
),
updated_at = now(),
version = version + 1
where is_default
  and coalesce(config #>> '{taxes_and_processing_fees,sales_tax_rate}', '') <> '0.0825';
