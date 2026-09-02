-- New proposals have one confirmed Luxor venue price and separate planning-only
-- preferred-vendor estimates. Existing invoice/proposal snapshots are untouched.
with active_catalog as (
  select id, config
  from public.luxor_proposal_pricing
  where is_default = true
  for update
), migrated as (
  select
    id,
    jsonb_strip_nulls(jsonb_build_object(
      'schema_version', 2,
      'currency', config->'currency',
      'pricing_mode', 'venue_plus_preferred_vendor_estimates',
      'luxor_costs', jsonb_build_object(
        'guest_count', config->'guest_count',
        'rental_access', config->'rental_access',
        'rental_rates', config->'rental_rates',
        'rental_rate_rules', config->'rental_rate_rules',
        'additional_time_rates', config->'additional_time_rates',
        'required_fees', jsonb_build_object(
          'cleaning', jsonb_build_object('retail', config#>'{required_fees,cleaning,retail}'),
          'security', jsonb_build_object('retail', config#>'{required_fees,security,retail}')
        ),
        'tables_and_chairs_setup', config->'tables_and_chairs_setup',
        'security_deposit', config->'security_deposit',
        'taxes_and_processing_fees', config->'taxes_and_processing_fees',
        'discounts', config->'discounts'
      ),
      'preferred_vendor_estimates', jsonb_build_object(
        'decor', jsonb_build_object(
          'essential', jsonb_build_object('starting_investment', config#>'{decor,essential,retail}'),
          'full_decor_and_planning', jsonb_build_object('starting_investment', config#>'{decor,full_decor_and_planning,retail}')
        ),
        'catering', jsonb_build_object(
          'buffet', jsonb_build_object('starting_per_guest', config#>'{catering,buffet,retail_per_guest}'),
          'plated', jsonb_build_object('starting_per_guest', config#>'{catering,plated,retail_per_guest}')
        ),
        'dj', jsonb_build_object('hours', config#>'{dj,hours}', 'starting_investment', config#>'{dj,retail}'),
        'photo_booth', jsonb_build_object(
          'signature_experience', jsonb_build_object('starting_investment', config#>'{photo_booth,signature_experience,retail}'),
          'celebration_experience', jsonb_build_object('starting_investment', config#>'{photo_booth,celebration_experience,retail}'),
          'forever_experience', jsonb_build_object('starting_investment', config#>'{photo_booth,forever_experience,retail}')
        ),
        'bartending', jsonb_build_object(
          'staffing', config#>'{bartending,retail,staffing}',
          'additional_hour_per_bartender', config#>'{bartending,retail,additional_hour_per_bartender}',
          'bars', jsonb_build_object(
            'signature_byob', jsonb_build_object('starting_per_guest', config#>'{bartending,retail,bars,signature_byob,per_guest}', 'minimum', config#>'{bartending,retail,bars,signature_byob,minimum}'),
            'premium_byob', jsonb_build_object('starting_per_guest', config#>'{bartending,retail,bars,premium_byob,per_guest}', 'minimum', config#>'{bartending,retail,bars,premium_byob,minimum}'),
            'non_alcoholic', jsonb_build_object('starting_per_guest', config#>'{bartending,retail,bars,non_alcoholic,per_guest}', 'minimum', config#>'{bartending,retail,bars,non_alcoholic,minimum}')
          )
        )
      ),
      'vendor_pricing_disclaimer', 'Vendor Pricing Disclaimer: Venue rental pricing is provided directly by Luxor and represents the official venue rental cost. Pricing for third-party vendor services is provided as an estimate for planning purposes only and is not a guaranteed quote. Final pricing, availability, services, and payment arrangements must be confirmed directly with the individual vendor.'
    )) as config
  from active_catalog
)
update public.luxor_proposal_pricing target
set config = migrated.config,
    version = target.version + 1,
    updated_at = timezone('utc', now())
from migrated
where target.id = migrated.id;
