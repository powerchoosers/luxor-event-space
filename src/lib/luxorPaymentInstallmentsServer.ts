import 'server-only'

import type { LuxorBooking, LuxorInvoice, LuxorPaymentInstallment } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'
import { calculateLuxorPaymentSchedule } from './luxorPaymentSchedule'

/** Creates or refreshes only unpaid scheduled event installments. */
export async function syncLuxorPaymentInstallments(input: { booking: LuxorBooking; invoice: LuxorInvoice }) {
  const context = (input.invoice.proposal_context || {}) as Record<string, unknown>
  const plan = context.payment_plan as Record<string, unknown> | null | undefined
  const eventDate = typeof context.event_date === 'string' ? context.event_date : input.booking.event_date
  const bookingDate = input.booking.created_at.slice(0, 10)
  const venue = Number(context.venue_services_total || 0)
  const scheduledVenue = Math.min(venue, Number(input.invoice.total || 0))
  const event = Math.max(0, Number(input.invoice.total || 0) - scheduledVenue)
  const count = plan && typeof plan === 'object' && Number.isInteger(Number(plan.payment_count)) ? Number(plan.payment_count) : 4
  const cadence = plan && typeof plan === 'object' && (plan.payment_cadence === 'biweekly' || plan.payment_cadence === 'monthly' || plan.payment_cadence === 'evenly_spaced')
    ? plan.payment_cadence
    : 'evenly_spaced'
  const bookingPaymentAmount = plan && typeof plan === 'object' && Number.isFinite(Number(plan.booking_payment_amount))
    ? Number(plan.booking_payment_amount)
    : undefined
  if (!eventDate || !Number.isFinite(venue) || !Number.isFinite(event)) return []
  const schedule = calculateLuxorPaymentSchedule({ eventDate, bookingDate, venueServicesTotal: scheduledVenue, eventServicesTotal: event, paymentCount: count, paymentCadence: cadence, bookingPaymentAmount })
  if (!schedule) return []
  const existing = await supabaseRest<LuxorPaymentInstallment[]>(`luxor_payment_installments?select=*&booking_id=eq.${encodeURIComponent(input.booking.id)}&order=installment_order.asc`)
  const rows: LuxorPaymentInstallment[] = []
  for (const row of schedule.rows) {
    const current = existing.find((item) => item.installment_order === row.installment_order && item.status !== 'void')
    if (current?.status === 'paid' || current?.status === 'partial') { rows.push(current); continue }
    const payload = {
      booking_id: input.booking.id,
      invoice_id: input.invoice.id,
      inquiry_id: input.invoice.inquiry_id,
      label: row.label,
      installment_order: row.installment_order,
      amount: row.amount,
      due_at: `${row.due_at}T12:00:00.000Z`,
      status: 'scheduled',
      metadata: { payment_bucket: row.payment_bucket, allocation: row.allocation, schedule_version: 1 },
      updated_at: new Date().toISOString(),
    }
    if (current) {
      const [updated] = await supabaseRest<LuxorPaymentInstallment[]>(`luxor_payment_installments?id=eq.${encodeURIComponent(current.id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) })
      if (updated) rows.push(updated)
    } else {
      const [created] = await supabaseRest<LuxorPaymentInstallment[]>('luxor_payment_installments?select=*', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) })
      if (created) rows.push(created)
    }
  }
  return rows
}
