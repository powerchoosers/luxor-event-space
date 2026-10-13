import type { LuxorBooking } from '@/lib/luxorInquiryTypes'
import { formatLuxorDate } from '@/lib/luxorDateFormatting'
import { formatCatalogTime } from '@/lib/luxorPricingCatalog'
import { formatLuxorCustomRentalDuration, formatLuxorCustomRentalPriceBreakdown, getLuxorCustomRentalSnapshot } from '@/lib/luxorCustomRentalSnapshot'

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Display the accepted rental facts without consulting current pricing. */
export function WeekdayRentalSummary({ booking }: { booking: Pick<LuxorBooking, 'metadata'> }) {
  const context = booking.metadata?.final_proposal_context
  const snapshot = getLuxorCustomRentalSnapshot(context && typeof context === 'object' && !Array.isArray(context) ? (context as Record<string, unknown>).weekday_custom_rental : null)
  if (!snapshot) return null
  const duration = formatLuxorCustomRentalDuration(snapshot)
  const facts = [
    ['Rental date', formatLuxorDate(snapshot.event_date) || snapshot.event_date],
    ['Rental start', formatCatalogTime(snapshot.start_time)],
    ['Rental end', `${formatCatalogTime(snapshot.end_time)}${Number(snapshot.end_time.slice(0, 2)) < 6 ? ' (next day)' : ''}`],
    ['Duration', duration],
    ['Pricing', formatLuxorCustomRentalPriceBreakdown(snapshot)],
    ['Venue rental', money(snapshot.rental_total)],
  ]
  return <dl aria-label="Custom weekday rental" className="mt-3 grid gap-x-5 gap-y-3 border-t border-[color:var(--portal-border)] pt-3 text-xs sm:grid-cols-3">{facts.map(([label, value]) => <div key={label}><dt className="text-[color:var(--portal-muted)]">{label}</dt><dd className="mt-1 font-semibold text-[color:var(--portal-text)]">{value}</dd></div>)}</dl>
}
