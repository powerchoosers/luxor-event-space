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

  const venueCents = cents(venueTotal)
  const eventCents = cents(eventTotal)
  const bookingPaymentCents = selectedCount <= 3
    ? venueCents
    : Math.min(venueCents, Math.max(Math.round(venueCents * 0.25), cents(750)))
  const remainingVenueCents = Math.max(0, venueCents - bookingPaymentCents)
  const eventParts = selectedCount === 2 ? 1 : selectedCount === 3 || selectedCount === 4 ? 2 : 3
  const eventInstallments = splitCents(eventCents, eventParts)
  const rows: LuxorPaymentScheduleRow[] = []
  const addRow = (row: Omit<LuxorPaymentScheduleRow, 'installment_order' | 'due_at'>, order: number) => rows.push({
    ...row,
    installment_order: order,
    due_at: paymentDate(booking, deadline, order - 1, selectedCount),
  })

  if (selectedCount <= 3) {
    addRow({
      label: 'Venue Services',
      description: '100% of Venue Services',
      amount: money(venueCents / 100),
      payment_bucket: 'venue',
      allocation: { venue: money(venueCents / 100), event: 0 },
    }, 1)
  } else {
    addRow({
      label: 'Venue Booking Deposit',
      description: `${Math.round((bookingPaymentCents / Math.max(1, venueCents)) * 100)}% of Venue Services`,
      amount: money(bookingPaymentCents / 100),
      payment_bucket: 'venue',
      allocation: { venue: money(bookingPaymentCents / 100), event: 0 },
    }, 1)
    addRow({
      label: 'Remaining Venue Services',
      description: `${Math.round((remainingVenueCents / Math.max(1, venueCents)) * 100)}% of Venue Services`,
      amount: money(remainingVenueCents / 100),
      payment_bucket: 'venue',
      allocation: { venue: money(remainingVenueCents / 100), event: 0 },
    }, 2)
  }

  const eventStartOrder = selectedCount <= 3 ? 2 : 3
  eventInstallments.forEach((amountCents, index) => {
    const isFinal = index === eventInstallments.length - 1
    const portion = eventParts === 1 ? '100%' : eventParts === 2 ? '50%' : '1/3'
    addRow({
      label: isFinal ? 'Final Event Services Payment' : `Event Services — Payment ${index + 1}`,
      description: `${portion} of Event Services${isFinal ? ' · Final payment due 60 days before the event' : ''}`,
      amount: money(amountCents / 100),
      payment_bucket: 'event',
      allocation: { venue: 0, event: money(amountCents / 100) },
    }, eventStartOrder + index)
  })

  const bookingPayment = money(bookingPaymentCents / 100)
  const remaining = money(total - bookingPayment)

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
