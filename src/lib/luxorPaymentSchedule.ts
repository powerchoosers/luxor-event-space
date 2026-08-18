import type { LuxorProposalPaymentPlan } from './luxorInquiryTypes'

export type LuxorPaymentCadence = 'evenly_spaced' | 'biweekly' | 'monthly'

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
  payment_count: number
  payment_cadence: LuxorPaymentCadence
  booking_date: string
  final_payment_due_date: string
  security_deposit_due_date: string
  booking_payment: number
  remaining_event_balance: number
  venue_services_total: number
  event_services_total: number
  rows: LuxorPaymentScheduleRow[]
  available_counts: number[]
  warnings: string[]
}

const MINIMUM_PAYMENT_COUNT = 2
const MAXIMUM_PAYMENT_COUNT = 24
// Two weeks is the shortest standard interval. This lets Arianna offer a plan
// that follows a client's paydays while ensuring every due date still lands on
// or before the final-payment deadline.
const MINIMUM_PAYMENT_INTERVAL_DAYS = 14

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

export function availablePaymentCounts(bookingDate: string, eventDate: string): number[] {
  const booking = parseDate(bookingDate)
  const deadline = finalPaymentDate(eventDate)
  const finalDate = deadline ? parseDate(deadline) : null
  if (!booking || !finalDate) return []
  const days = daysBetween(booking, finalDate)
  if (days < MINIMUM_PAYMENT_INTERVAL_DAYS) return []

  const maximum = Math.min(MAXIMUM_PAYMENT_COUNT, Math.floor(days / MINIMUM_PAYMENT_INTERVAL_DAYS) + 1)
  return Array.from({ length: Math.max(0, maximum - MINIMUM_PAYMENT_COUNT + 1) }, (_, index) => MINIMUM_PAYMENT_COUNT + index)
}

function validCadence(value: unknown): value is LuxorPaymentCadence {
  return value === 'evenly_spaced' || value === 'biweekly' || value === 'monthly'
}

function cadencePaymentCount(days: number, cadence: LuxorPaymentCadence) {
  if (cadence === 'evenly_spaced') return null
  const interval = cadence === 'biweekly' ? 14 : 30
  return Math.min(MAXIMUM_PAYMENT_COUNT, Math.max(MINIMUM_PAYMENT_COUNT, Math.ceil(days / interval) + 1))
}

function paymentDate(booking: Date, deadline: Date, index: number, count: number) {
  const span = deadline.getTime() - booking.getTime()
  return iso(new Date(booking.getTime() + Math.round(span * (index / (count - 1)))))
}

function splitCents(total: number, parts: number) {
  const safeParts = Math.max(1, parts)
  const base = Math.floor(total / safeParts)
  return Array.from({ length: safeParts }, (_, index) => index === safeParts - 1 ? total - (base * (safeParts - 1)) : base)
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
  paymentCadence?: LuxorPaymentCadence
  bookingPaymentAmount?: number | null
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
  const spanDays = daysBetween(booking, deadline)
  const cadence = validCadence(input.paymentCadence) ? input.paymentCadence : 'evenly_spaced'
  const requested = Number(input.paymentCount)
  const requestedCount = Number.isInteger(requested) && requested >= MINIMUM_PAYMENT_COUNT && requested <= MAXIMUM_PAYMENT_COUNT ? requested : 4
  const cadenceCount = cadencePaymentCount(spanDays, cadence)
  const count = cadenceCount ?? requestedCount
  const selectedCount = available.includes(count) ? count : available[available.length - 1]
  if (!selectedCount) return null

  const venueCents = cents(venueTotal)
  const eventCents = cents(eventTotal)
  const defaultBookingPaymentCents = Math.min(venueCents, Math.max(Math.round(venueCents * 0.25), cents(750)))
  const requestedBookingPayment = Number(input.bookingPaymentAmount)
  const hasNegotiatedBookingPayment = Number.isFinite(requestedBookingPayment) && requestedBookingPayment >= 0.5
  const bookingPaymentCents = Math.min(venueCents, hasNegotiatedBookingPayment ? cents(requestedBookingPayment) : defaultBookingPaymentCents)
  const remainingVenueCents = Math.max(0, venueCents - bookingPaymentCents)
  const remainingPaymentAmounts = splitCents(Math.max(0, venueCents + eventCents - bookingPaymentCents), selectedCount - 1)
  const rows: LuxorPaymentScheduleRow[] = []
  const addRow = (row: Omit<LuxorPaymentScheduleRow, 'installment_order' | 'due_at'>, order: number) => rows.push({
    ...row,
    installment_order: order,
    due_at: paymentDate(booking, deadline, order - 1, selectedCount),
  })

  addRow({
    label: 'Booking Payment',
    description: hasNegotiatedBookingPayment
      ? 'Owner-approved booking payment applied to Venue Services'
      : `${Math.round((bookingPaymentCents / Math.max(1, venueCents)) * 100)}% of Venue Services`,
    amount: money(bookingPaymentCents / 100),
    payment_bucket: 'venue',
    allocation: { venue: money(bookingPaymentCents / 100), event: 0 },
  }, 1)

  let outstandingVenueCents = remainingVenueCents
  remainingPaymentAmounts.forEach((amountCents, index) => {
    const isFinal = index === remainingPaymentAmounts.length - 1
    const venueAllocation = Math.min(outstandingVenueCents, amountCents)
    const eventAllocation = amountCents - venueAllocation
    outstandingVenueCents -= venueAllocation
    const label = isFinal ? 'Final Payment' : venueAllocation > 0 && eventAllocation > 0 ? `Payment ${index + 2} — Venue & Event Services` : venueAllocation > 0 ? `Payment ${index + 2} — Venue Services` : `Payment ${index + 2} — Event Services`
    addRow({
      label,
      description: isFinal
        ? 'Remaining balance due 60 days before the event'
        : cadence === 'biweekly' ? 'Biweekly payment' : cadence === 'monthly' ? 'Monthly payment' : 'Scheduled payment',
      amount: money(amountCents / 100),
      payment_bucket: venueAllocation > 0 ? 'venue' : 'event',
      allocation: { venue: money(venueAllocation / 100), event: money(eventAllocation / 100) },
    }, index + 2)
  })

  const bookingPayment = money(bookingPaymentCents / 100)
  const remaining = money(total - bookingPayment)

  return {
    payment_count: selectedCount,
    payment_cadence: cadence,
    booking_date: iso(booking),
    final_payment_due_date: deadlineString as string,
    security_deposit_due_date: securityDue,
    booking_payment: bookingPayment,
    remaining_event_balance: remaining,
    venue_services_total: venueTotal,
    event_services_total: eventTotal,
    rows,
    available_counts: available,
    warnings: [
      ...(selectedCount !== count ? [`${count} payments cannot fit before the 60-day deadline; ${selectedCount} payments selected instead.`] : []),
      ...(hasNegotiatedBookingPayment && cents(requestedBookingPayment) > venueCents ? ['The negotiated booking payment was capped at the Venue Services balance.'] : []),
    ],
  }
}

export function paymentPlanFromSchedule(schedule: LuxorPaymentSchedule): LuxorProposalPaymentPlan {
  return {
    mode: 'deposit_and_balance',
    booking_payment_percent: schedule.venue_services_total > 0 ? money(schedule.booking_payment / schedule.venue_services_total * 100) : 0,
    final_payment_due_days_before_event: 60,
    payment_count: schedule.payment_count,
    payment_cadence: schedule.payment_cadence,
    ...(schedule.booking_payment !== Math.min(schedule.venue_services_total, Math.max(schedule.venue_services_total * 0.25, 750)) ? { booking_payment_amount: schedule.booking_payment } : {}),
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
