-- The approved rate sheet provides bartender service tier prices but does
-- not define how many bartenders each tier staffs. Preserve the exact base
-- amounts while removing inferred headcounts from the live pricing config.
-- Additional-hour bartender pricing remains unavailable until an owner enters
-- a verified staff-count rule in the configuration.

update public.luxor_proposal_pricing as pricing
set config = jsonb_set(
  pricing.config,
  '{bartending,retail,staffing}',
  coalesce((
    select jsonb_agg(tier - 'bartenders' order by ordinality)
    from jsonb_array_elements(pricing.config #> '{bartending,retail,staffing}')
      with ordinality as tiers(tier, ordinality)
  ), '[]'::jsonb),
  false
)
where jsonb_typeof(pricing.config #> '{bartending,retail,staffing}') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(pricing.config #> '{bartending,retail,staffing}') as tiers(tier)
    where tier ? 'bartenders'
  );

update public.luxor_proposal_pricing as pricing
set config = jsonb_set(
  pricing.config,
  '{bartending,all_inclusive,staffing}',
  coalesce((
    select jsonb_agg(tier - 'bartenders' order by ordinality)
    from jsonb_array_elements(pricing.config #> '{bartending,all_inclusive,staffing}')
      with ordinality as tiers(tier, ordinality)
  ), '[]'::jsonb),
  false
)
where jsonb_typeof(pricing.config #> '{bartending,all_inclusive,staffing}') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(pricing.config #> '{bartending,all_inclusive,staffing}') as tiers(tier)
    where tier ? 'bartenders'
  );
