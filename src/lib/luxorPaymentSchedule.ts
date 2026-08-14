import type { LuxorProposalPaymentPlan } from './luxorInquiryTypes'

export type LuxorPaymentScheduleRow = {
  installment_order: number
  label: string
  description: string
  amount: number
  due_at: string
  payment_bucket: 'venue' | 'event'
  allocation: { venue: number; event: number }
}

export type LuxorPaymentSchedule = {
  payment_count: 2 | 3 | 4 | 5
  booking_date: string
  final_payment_due_date: string
  security_deposit_due_date: string
  booking_payment: number
  remaining_event_balance: number
  venue_services_total: number
  event_services_total: number
  rows: LuxorPaymentScheduleRow[]
  available_counts: Array<2 | 3 | 4 | 5>
  warnings: string[]
}

const COUNTS: Array<2 | 3 | 4 | 5> = [2, 3, 4, 5]

function cents(value: number) { return Math.round(value * 100) }
function money(value: number) { return Math.round(value * 100) / 100 }
function iso(date: Date) { return date.toISOString().slice(0, 10) }
function parseDate(value: string) {
  const match = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
  if (!match) return null
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}
function daysBetween(start: Date, end: Date) { return Math.floor((end.getTime() - start.getTime()) / 86400000) }
function addDays(value: Date, days: number) { const next = new Date(value); next.setUTCDate(next.getUTCDate() + days); return next }

export function finalPaymentDate(eventDate: string) {
  const event = parseDate(eventDate)
  return event ? iso(addDays(event, -60)) : null
}

export function securityDepositDueDate(eventDate: string) {
  const event = parseDate(eventDate)
  return event ? iso(addDays(event, -30)) : null
}

export function availablePaymentCounts(bookingDate: string, eventDate: string): Array<2 | 3 | 4 | 5> {
  const booking = parseDate(bookingDate)
  const deadline = finalPaymentDate(eventDate)
  const finalDate = deadline ? parseDate(deadline) : null
  if (!booking || !finalDate) return []
  const days = daysBetween(booking, finalDate)
  if (days <= 0) return []
  if (days < 120) return [2]
  if (days < 180) return [2, 3]
  if (days < 240) return [2, 3, 4]
  return COUNTS
}

function paymentDate(booking: Date, deadline: Date, index: number, count: number) {
  const span = deadline.getTime() - booking.getTime()
  return iso(new Date(booking.getTime() + Math.round(span * (index / (count - 1)))))
}

/**
 * Calculates the owner-approved event payment schedule. The refundable
 * security deposit is intentionally not returned as a schedule row.
 */
export function calculateLuxorPaymentSchedule(input: {
  eventDate: string
  bookingDate: string
  venueServicesTotal: number
  eventServicesTotal: number
  paymentCount?: number
}): LuxorPaymentSchedule | null {
  const event = parseDate(input.eventDate)
  const booking = parseDate(input.bookingDate)
  const deadlineString = finalPaymentDate(input.eventDate)
  const securityDue = securityDepositDueDate(input.eventDate)
  const deadline = deadlineString ? parseDate(deadlineString) : null
  if (!event || !booking || !deadline || !securityDue) return null

  const venueTotal = Math.max(0, money(input.venueServicesTotal))
  const eventTotal = Math.max(0, money(input.eventServicesTotal))
  const total = money(venueTotal + eventTotal)
  const available = availablePaymentCounts(input.bookingDate, input.eventDate)
  const requested = Number(input.paymentCount)
  const count = (COUNTS.includes(requested as 2 | 3 | 4 | 5) ? requested : 4) as 2 | 3 | 4 | 5
  const selectedCount = (available.includes(count) ? count : available[available.length - 1]) as 2 | 3 | 4 | 5 | undefined
  if (!selectedCount) return null

  const bookingPayment = Math.min(venueTotal, money(Math.max(venueTotal * 0.25, 750)))
  const remaining = money(total - bookingPayment)
  const remainingCents = cents(remaining)
  const laterCount = selectedCount - 1
  const base = Math.floor(remainingCents / laterCount)
  let venueOutstanding = Math.max(0, cents(venueTotal - bookingPayment))
  const rows: LuxorPaymentScheduleRow[] = [{
    installment_order: 1,
    label: 'Booking deposit',
    description: 'Secure your date',
    amount: bookingPayment,
    due_at: iso(booking),
    payment_bucket: 'venue',
    allocation: { venue: bookingPayment, event: 0 },
  }]

  for (let index = 1; index < selectedCount; index += 1) {
    const amountCents = index === selectedCount - 1 ? remainingCents - base * (laterCount - 1) : base
    const venueAllocation = Math.min(venueOutstanding, amountCents)
    const eventAllocation = amountCents - venueAllocation
    venueOutstanding -= venueAllocation
    rows.push({
      installment_order: index + 1,
      label: index === selectedCount - 1 ? 'Final payment' : `Payment ${index + 1}`,
      description: venueAllocation > 0 && eventAllocation > 0 ? 'Venue and Event Services payment' : venueAllocation > 0 ? 'Venue Services payment' : 'Event Services payment',
      amount: money(amountCents / 100),
      due_at: paymentDate(booking, deadline, index, selectedCount),
      payment_bucket: venueAllocation > 0 ? 'venue' : 'event',
      allocation: { venue: money(venueAllocation / 100), event: money(eventAllocation / 100) },
    })
  }

  return {
    payment_count: selectedCount,
    booking_date: iso(booking),
    final_payment_due_date: deadlineString as string,
    security_deposit_due_date: securityDue,
    booking_payment: bookingPayment,
    remaining_event_balance: remaining,
    venue_services_total: venueTotal,
    event_services_total: eventTotal,
    rows,
    available_counts: available as Array<2 | 3 | 4 | 5>,
    warnings: selectedCount !== count ? [`${count} payments cannot fit before the 60-day deadline; ${selectedCount} payments selected instead.`] : [],
  }
}

export function paymentPlanFromSchedule(schedule: LuxorPaymentSchedule): LuxorProposalPaymentPlan {
  return {
    mode: 'deposit_and_balance',
    booking_payment_percent: schedule.venue_services_total > 0 ? money(schedule.booking_payment / schedule.venue_services_total * 100) : 0,
    final_payment_due_days_before_event: 60,
    payment_count: schedule.payment_count,
    booking_date: schedule.booking_date,
    final_payment_due_date: schedule.final_payment_due_date,
    security_deposit_due_date: schedule.security_deposit_due_date,
    schedule_rows: schedule.rows.map((row) => ({
      installment_order: row.installment_order,
      label: row.label,
      description: row.description,
      amount: row.amount,
      due_at: row.due_at,
      payment_bucket: row.payment_bucket,
    })),
  }
}
