import { formatWeekdayCustomRentalDuration, formatWeekdayCustomRentalPriceBreakdown, getWeekdayCustomRentalSnapshot, type LuxorWeekdayCustomRentalSnapshot } from './luxorWeekdayRental'
import { formatLuxorCustomTimeRentalPriceBreakdownV4, getLuxorCustomTimeRentalSnapshotV4, type LuxorCustomTimeRentalSnapshotV4 } from './luxorCustomTimeRentalV4'

export type LuxorCustomRentalSnapshot = LuxorWeekdayCustomRentalSnapshot | LuxorCustomTimeRentalSnapshotV4

export function getLuxorCustomRentalSnapshot(value: unknown): LuxorCustomRentalSnapshot | null {
  return getLuxorCustomTimeRentalSnapshotV4(value) ?? getWeekdayCustomRentalSnapshot(value)
}

export function formatLuxorCustomRentalDuration(snapshot: LuxorCustomRentalSnapshot) {
  return formatWeekdayCustomRentalDuration(snapshot.duration_minutes)
}

export function formatLuxorCustomRentalPriceBreakdown(snapshot: LuxorCustomRentalSnapshot) {
  return snapshot.version === 4
    ? formatLuxorCustomTimeRentalPriceBreakdownV4(snapshot)
    : formatWeekdayCustomRentalPriceBreakdown(snapshot)
}
