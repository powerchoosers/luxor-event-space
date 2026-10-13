import type { LuxorWeekdayCustomRentalPolicy, LuxorWeekdayCustomRentalSnapshot } from './luxorWeekdayRental'

/**
 * Compare the catalog policy with the persisted quote schema. V2 snapshots
 * predate minimum_price/additional_hour_rate, so those V3-only values must not
 * be inferred from the v2 policy defaults or required on historical records.
 */
export function weekdayRentalPolicyMatchesSnapshot(
  policy: LuxorWeekdayCustomRentalPolicy,
  snapshot: LuxorWeekdayCustomRentalSnapshot,
) {
  const commonFieldsMatch = policy.pricing_version === snapshot.version &&
    policy.hourly_rate === snapshot.hourly_rate &&
    policy.minimum_hours === snapshot.minimum_hours &&
    policy.time_increment_minutes === snapshot.time_increment_minutes &&
    policy.reset_window_policy === snapshot.reset_window_policy &&
    policy.booking_policy === snapshot.booking_policy &&
    policy.cleanup_buffer_minutes === snapshot.cleanup_buffer_minutes &&
    policy.security_hours_policy === snapshot.security_hours_policy &&
    policy.selection_surface === snapshot.selection_surface

  if (!commonFieldsMatch) return false
  if (policy.pricing_version === 2) return snapshot.minimum_price === undefined && snapshot.additional_hour_rate === undefined
  return policy.minimum_price === snapshot.minimum_price && policy.additional_hour_rate === snapshot.additional_hour_rate
}
