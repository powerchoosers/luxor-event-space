-- Make the customer-facing rate sheet the initial approved catalog.
-- Existing add-ons, required fees, package rules, tax, and deposits are preserved.
with public_rate_sheet as (
  select
    '{
      "morning": {"start": "09:00", "end": "15:00", "hours": 6},
      "evening": {"start": "17:00", "end": "23:00", "hours": 6},
      "full_day": {"start": "09:00", "end": "23:00", "hours": 14},
      "full_decor_or_all_inclusive": {
        "event_access_hours": 8,
        "setup_and_breakdown_hours": 4,
        "total_venue_access_hours": 12,
        "display_note": "8 hours of event access plus 4 hours for setup and breakdown"
      }
    }'::jsonb as rental_access,
    '{
      "monday_thursday": {"morning": 1200, "evening": 1200, "full_day": 1600},
      "friday": {"morning": 1000, "evening": 1700, "full_day": 2500},
      "saturday": {"morning": 1900, "evening": 2100, "full_day": 3500},
      "sunday": {"morning": 1400, "evening": 1200, "full_day": 1600}
    }'::jsonb as rental_rates,
    '{
      "monday_thursday": {
        "morning": {"public": true, "pricing_type": "hourly", "hourly_rate": 400, "minimum_hours": 3},
        "evening": {"public": false, "pricing_type": "fixed"},
        "full_day": {"public": true, "pricing_type": "fixed"}
      },
      "friday": {
        "morning": {"public": true, "pricing_type": "fixed"},
        "evening": {"public": true, "pricing_type": "fixed"},
        "full_day": {"public": true, "pricing_type": "fixed"}
      },
      "saturday": {
        "morning": {"public": true, "pricing_type": "fixed"},
        "evening": {"public": true, "pricing_type": "fixed"},
        "full_day": {"public": true, "pricing_type": "fixed"}
      },
      "sunday": {
        "morning": {"public": true, "pricing_type": "fixed"},
        "evening": {"public": true, "pricing_type": "fixed"},
        "full_day": {"public": true, "pricing_type": "fixed"}
      }
    }'::jsonb as rental_rate_rules,
    '{"monday_thursday": 200, "friday": 350}'::jsonb as additional_time_rates
)
update public.luxor_proposal_pricing as pricing
set
  config = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(pricing.config, '{rental_access}', rate_sheet.rental_access, true),
        '{rental_rates}', rate_sheet.rental_rates, true
      ),
      '{rental_rate_rules}', rate_sheet.rental_rate_rules, true
    ),
    '{additional_time_rates}', rate_sheet.additional_time_rates, true
  ),
  version = pricing.version + 1,
  updated_at = timezone('utc', now())
from public_rate_sheet as rate_sheet
where pricing.is_default = true
  and (
    pricing.config -> 'rental_access' is distinct from rate_sheet.rental_access
    or pricing.config -> 'rental_rates' is distinct from rate_sheet.rental_rates
    or pricing.config -> 'rental_rate_rules' is distinct from rate_sheet.rental_rate_rules
    or pricing.config -> 'additional_time_rates' is distinct from rate_sheet.additional_time_rates
  );
