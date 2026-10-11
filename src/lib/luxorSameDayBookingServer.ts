import 'server-only'
import { createHash } from 'node:crypto'
import Stripe from 'stripe'
import type { LuxorBooking, LuxorInvoice, LuxorPayment, LuxorInquiry } from './luxorInquiryTypes'
import { getInvoice, listInvoicesByBooking, listPaidPaymentsByInvoice, ensureLuxorFinalBalanceInvoice, luxorFinalPaymentDueDate } from './luxorInvoicesServer'
import { getLuxorBookingByInvoice } from './luxorBookingsServer'
import { getLuxorInquiry } from './luxorInquiriesServer'
import { supabaseRest } from './supabaseRestServer'
import { sameDayBookingPromotion, sameDayBookingRequiresRevision } from './luxorSameDayBooking'

export const SAME_DAY_REVISION_MESSAGE = 'The same-day tax benefit has expired. Luxor must prepare revised pricing and a fresh agreement before a new payment. Your signed price has not been changed.'

export function sameDayTermsFingerprint(master: LuxorInvoice, booking: LuxorBooking) {
  return createHash('sha256').update(JSON.stringify({ invoiceId: master.id, version: master.proposal_version || 1,
    bookingId: booking.id, total: master.total, initialPayment: booking.deposit_required,
    lineItems: master.line_items, benefit: sameDayBookingPromotion(master) })).digest('hex')
}

export async function assertLuxorSameDayPaymentAllowed(invoice: LuxorInvoice, booking: LuxorBooking) {
  const master = invoice.invoice_kind === 'event' ? invoice : invoice.parent_invoice_id ? await getInvoice(invoice.parent_invoice_id) : null
  if (!master || !sameDayBookingPromotion(master)?.coverage_amount) return master
  if (booking.invoice_id !== master.id || master.booking_id !== booking.id || master.status === 'cancelled' || booking.status === 'cancelled' || booking.status === 'completed') throw new Error('This booking is closed or its proposal has changed. No new payment link is available; contact Luxor for review.')
  if (master.same_day_booking_status === 'eligible') return master
  if (invoice.invoice_kind !== 'deposit') throw new Error('Complete and verify the initial same-day booking payment before requesting another payment.')
  if (sameDayBookingRequiresRevision(master)) throw new Error(master.same_day_booking_status === 'review' ? 'A received payment is awaiting Luxor review. Do not pay again.' : SAME_DAY_REVISION_MESSAGE)
  return master
}

/** Reconcile every linked Stripe session before allowing a replacement price. */
export async function assertLuxorSameDayRevisionSafe(prior: LuxorInvoice) {
  if (!sameDayBookingRequiresRevision(prior) || prior.same_day_booking_status === 'eligible') throw new Error('This proposal is not eligible for an expired same-day revision.')
  const booking = await getLuxorBookingByInvoice(prior.id)
  const invoices = [prior, ...(booking ? await listInvoicesByBooking(booking.id) : [])]
  const evidence = await supabaseRest<Array<{ payment_id: string }>>(`luxor_same_day_payment_evidence?select=payment_id&master_invoice_id=eq.${encodeURIComponent(prior.id)}&limit=1`)
  if (evidence.length) throw new Error('A payment receipt is awaiting review. Do not issue another payment link or revised price until it is reconciled.')
  for (const invoice of invoices) {
    if ((await listPaidPaymentsByInvoice(invoice.id)).length) throw new Error('A payment has already been received. Luxor must review it before issuing revised pricing or another payment link.')
    if (!invoice.stripe_checkout_session_id) continue
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('Stripe must be connected to reconcile the previous payment links before revision.')
    const stripe = new Stripe(key)
    // Unknown/missing provider state is intentionally not treated as unpaid.
    const session = await stripe.checkout.sessions.retrieve(invoice.stripe_checkout_session_id)
    if (session.status === 'open') {
      const expired = await stripe.checkout.sessions.expire(session.id)
      if (expired.status !== 'expired') throw new Error('The old payment link could not be safely closed. Refresh before revising.')
    } else if (session.status !== 'expired' || session.payment_status === 'paid') {
      throw new Error('Stripe has received or is processing a payment. Luxor must reconcile it before revised pricing or another payment link.')
    }
  }
}

export async function recordLuxorSameDayPayment(input: {
  invoice: LuxorInvoice; master: LuxorInvoice; booking: LuxorBooking; amount: number
  paidAt: string | null; processor: 'stripe' | 'manual'; reference: string; paymentMethod: string
  eventId: string; timingVerified: boolean; fingerprint: string; metadata: Record<string, unknown>
}) {
  return supabaseRest<{ payment: LuxorPayment; eligibility: 'pending' | 'eligible' | 'review'; duplicate: boolean }>('rpc/luxor_record_same_day_payment', {
    method: 'POST', body: JSON.stringify({ p_invoice_id: input.invoice.id, p_booking_id: input.booking.id,
      p_amount: input.amount, p_paid_at: input.paidAt, p_processor: input.processor, p_reference: input.reference,
      p_method: input.paymentMethod, p_event_id: input.eventId, p_timing_verified: input.timingVerified,
      p_fingerprint: input.fingerprint, p_metadata: input.metadata }),
  })
}

export async function recordLuxorSameDayScheduledPayment(input: {
  invoice: LuxorInvoice; booking: LuxorBooking; amount: number; paidAt: string | null;
  processor: 'stripe' | 'manual'; reference: string; paymentMethod: string; eventId: string;
  timingVerified: boolean; metadata: Record<string, unknown>
}) {
  return supabaseRest<{ payment: LuxorPayment; reviewRequired: boolean; duplicate: boolean }>('rpc/luxor_record_same_day_scheduled_payment', {
    method: 'POST', body: JSON.stringify({ p_invoice_id: input.invoice.id, p_booking_id: input.booking.id, p_amount: input.amount,
      p_paid_at: input.paidAt, p_processor: input.processor, p_reference: input.reference, p_method: input.paymentMethod,
      p_event_id: input.eventId, p_timing_verified: input.timingVerified, p_metadata: input.metadata }),
  })
}

/** The database rechecks current owner state and merges only changed metadata. */
export async function finalizeLuxorSameDayBooking(booking: LuxorBooking, patch: Partial<LuxorBooking>, inquiry: LuxorInquiry | null, inquiryPatch: Partial<LuxorInquiry> = {}, requireEligible = true) {
  const changed = (next: Record<string, unknown> | undefined, previous: Record<string, unknown> | undefined) => Object.fromEntries(
    Object.entries(next || {}).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(previous?.[key])))
  return supabaseRest<{ applied: boolean; booking: LuxorBooking; inquiry: LuxorInquiry | null }>('rpc/luxor_finalize_same_day_booking', {
    method: 'POST', body: JSON.stringify({ p_booking_id: booking.id, p_booking_patch: { ...patch, metadata: changed(patch.metadata, booking.metadata) },
      p_inquiry_patch: { ...inquiryPatch, metadata: changed(inquiryPatch.metadata, inquiry?.metadata) }, p_require_eligible: requireEligible }),
  })
}

/** Recheck an already received, verified payment after signing; never collect again. */
export async function reconcileLuxorSameDayReceipts(bookingId: string) {
  const bookingRows = await supabaseRest<LuxorBooking[]>(`luxor_bookings?select=*&id=eq.${encodeURIComponent(bookingId)}&limit=1`)
  const booking = bookingRows[0]
  const master = booking?.invoice_id ? await getInvoice(booking.invoice_id) : null
  if (!booking || !master || !sameDayBookingPromotion(master)?.coverage_amount) return
  const receipts = await supabaseRest<Array<{ payment_id: string; successful_at: string | null; timing_verified: boolean; terms_fingerprint: string; event_id: string }>>(`luxor_same_day_payment_evidence?select=*&master_invoice_id=eq.${encodeURIComponent(master.id)}`)
  for (const evidence of receipts) {
    if (!evidence.timing_verified) continue
    const [payment] = await supabaseRest<LuxorPayment[]>(`luxor_payments?select=*&id=eq.${encodeURIComponent(evidence.payment_id)}&limit=1`)
    const invoice = payment?.invoice_id ? await getInvoice(payment.invoice_id) : null
    if (!payment || !invoice || (payment.processor !== 'manual' && payment.processor !== 'stripe')) continue
    const result = await recordLuxorSameDayPayment({ invoice, master, booking, amount: payment.amount, paidAt: evidence.successful_at,
      processor: payment.processor, reference: payment.processor_reference!, paymentMethod: payment.payment_method || 'Payment',
      eventId: evidence.event_id, timingVerified: true, fingerprint: evidence.terms_fingerprint, metadata: payment.metadata || {} })
    if (result.eligibility === 'eligible' && booking.contract_status === 'signed' && booking.status !== 'cancelled' && booking.status !== 'completed') {
      const inquiry = master.inquiry_id ? await getLuxorInquiry(master.inquiry_id) : null
      if (inquiry?.status === 'closed_lost') continue
      const dueDate = booking.final_payment_due_date || luxorFinalPaymentDueDate(booking.event_date)
      const finalInvoice = dueDate ? await ensureLuxorFinalBalanceInvoice({ masterInvoice: master, bookingId: booking.id, dueDate, depositPaid: booking.deposit_required, securityDepositAmount: 750 }) : null
      await finalizeLuxorSameDayBooking(booking, { status: 'confirmed', metadata: { ...booking.metadata,
        deposit_paid_at: result.payment.paid_at, reservation_confirmed_at: booking.metadata?.reservation_confirmed_at || new Date().toISOString(),
        reservation_state: 'confirmed', same_day_payment_review: false, same_day_payment_review_reason: null,
        ...(finalInvoice ? { final_balance_invoice_id: finalInvoice.id } : { final_payment_schedule_configuration_required_at: booking.metadata?.final_payment_schedule_configuration_required_at || new Date().toISOString() }) } }, inquiry,
        { status: 'booked', pipeline_stage: 'planning', metadata: { ...inquiry?.metadata, latest_payment_at: result.payment.paid_at, latest_paid_invoice_id: invoice.id } })
    }
  }
}

/** A paid original event object is required; never combine old completion time with a later paid retrieval. */
export async function stripeSuccessfulPaymentEvidence(stripe: Stripe, session: Stripe.Checkout.Session, event: Stripe.Event) {
  const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  if (!intentId) return null
  if (event.type === 'payment_intent.succeeded' && event.data.object.id === intentId) {
    return { paidAt: new Date(event.created * 1000).toISOString(), eventId: event.id }
  }
  let after: string | undefined
  for (let page = 0; page < 5; page++) {
    const events = await stripe.events.list({ type: 'payment_intent.succeeded', limit: 100,
      created: { gte: session.created }, ...(after ? { starting_after: after } : {}) })
    const success = events.data.find(candidate => candidate.type === 'payment_intent.succeeded' && candidate.data.object.id === intentId)
    if (success) return { paidAt: new Date(success.created * 1000).toISOString(), eventId: success.id }
    if (!events.has_more || !events.data.length) break
    after = events.data[events.data.length - 1].id
  }
  return null
}
