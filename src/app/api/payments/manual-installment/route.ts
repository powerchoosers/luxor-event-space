import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorBooking } from '@/lib/luxorBookingsServer'
import { getInvoice, getInvoiceByBookingAndKind, listPaidPaymentsByInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { listLuxorPaymentInstallments } from '@/lib/luxorPaymentInstallmentsServer'
import { expireLuxorCheckoutForRepricing } from '@/lib/luxorStripeCheckoutServer'
import { assertLuxorProductionSideEffectsAllowed } from '@/lib/luxorTestLeadServer'
import { installmentPaidAmount, isBookingPaymentMilestone } from '@/lib/luxorPaymentDashboardModel'
import { zonedTourDateTimeToUtc } from '@/lib/luxorTourPlanningServer'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { SupabaseRestError, supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { LuxorPayment, LuxorPaymentInstallment } from '@/lib/luxorInquiryTypes'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const roundMoney = (amount: number) => Math.round(amount * 100) / 100

function allocatedTo(installment: LuxorPaymentInstallment, payments: LuxorPayment[]) {
  return roundMoney(installmentPaidAmount(installment, payments))
}

function notRecorded(error: string, status: number, retryWithSameIdempotencyKey = true) {
  return NextResponse.json({ error, paymentOutcome: 'not_recorded', retryWithSameIdempotencyKey }, { status })
}

function unknownOutcome(error: string, status: number, retryWithSameIdempotencyKey = true) {
  return NextResponse.json({ error, paymentOutcome: 'unknown', retryWithSameIdempotencyKey }, { status })
}

export async function POST(request: NextRequest) {
  let rpcStarted = false
  let replayLookupStarted = false
  let replayLookupCompleted = false
  try {
    const session = await getLuxorPortalSession()
    if (!session) return unknownOutcome('Zoho portal login required. Verify the saved payment before retrying.', 401)
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'finances')) {
      return unknownOutcome('Active finance access is required. Verify the saved payment before retrying.', 403)
    }

    const parsed = await request.json().catch(() => ({})) as unknown
    const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as {
      bookingId?: string; installmentId?: string; amount?: number; paidOn?: string; paymentMethod?: string
      reference?: string; notes?: string; idempotencyKey?: string
    } : {}
    if (!UUID.test(body.idempotencyKey || '')) {
      return notRecorded('A valid payment request identifier is required.', 400)
    }
    const bookingId = typeof body.bookingId === 'string' ? body.bookingId : ''
    const installmentId = typeof body.installmentId === 'string' ? body.installmentId : ''
    const rawAmount = Number(body.amount)
    const rawPaidOn = typeof body.paidOn === 'string' ? body.paidOn : null
    const paidOnForFingerprint = rawPaidOn && /^\d{4}-\d{2}-\d{2}$/.test(rawPaidOn)
      ? zonedTourDateTimeToUtc(rawPaidOn, '00:00')
      : null
    const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, 200) : ''
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : ''
    const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod : ''
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
      bookingId, installmentId, amount: rawAmount,
      paidAt: paidOnForFingerprint && Number.isFinite(paidOnForFingerprint.getTime()) ? paidOnForFingerprint.toISOString() : rawPaidOn,
      paymentMethod, reference, notes,
    })).digest('hex')

    replayLookupStarted = true
    const replay = await supabaseRestStrict<{ payment: LuxorPayment | null; allocations: Array<{ installment_id: string; amount: number }>; replayed: boolean }>(
      'rpc/luxor_lookup_manual_installment_payment_replay', {
        method: 'POST', body: JSON.stringify({ p_idempotency_key: body.idempotencyKey, p_request_fingerprint: fingerprint }),
      },
    )
    replayLookupCompleted = true
    if (replay?.replayed && replay.payment?.id) {
      if (replay.payment.status === 'void') return notRecorded('This payment was corrected and is no longer recorded. Start a new entry if funds were received.', 409, false)
      return NextResponse.json({ payment: replay.payment, allocations: replay.allocations, replayed: true })
    }

    if (!UUID.test(bookingId) || !UUID.test(installmentId)) {
      return notRecorded('Booking, installment, and payment request identifiers are required.', 400)
    }
    if (process.env.LUXOR_PAYMENT_INSTALLMENT_ALLOCATIONS_READY !== 'true') {
      return notRecorded('Installment allocation is not enabled yet. Use the existing payment workflow.', 503)
    }
    const amount = rawAmount
    if (!Number.isFinite(amount) || amount <= 0 || roundMoney(amount) !== amount) {
      return notRecorded('Enter a payment amount greater than zero with no more than two decimal places.', 400)
    }
    const paidOn = paidOnForFingerprint
    const todayInVenueTimezone = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    if (!paidOn || !Number.isFinite(paidOn.getTime()) || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(paidOn) !== body.paidOn || body.paidOn > todayInVenueTimezone) {
      return notRecorded('Enter a valid actual payment date that is not in the future.', 400)
    }
    const methods = new Set(['Cash', 'Zelle', 'Check', 'ACH', 'Bank Transfer', 'Other'])
    if (!methods.has(paymentMethod)) return notRecorded('Choose Cash, Zelle, Check, Bank Transfer, ACH, or Other.', 400)
    if (paymentMethod === 'Other' && !notes) return notRecorded('Add a short note describing the other payment method.', 400)

    const booking = await getLuxorBooking(bookingId)
    if (!booking) return notRecorded('Booking record not found.', 404)
    if (booking.status === 'cancelled' || booking.status === 'completed' || booking.contract_status !== 'signed') {
      return notRecorded('A signed, active booking is required to record an installment payment.', 409)
    }
    const contractSignedDate = booking.contract_signed_at
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(booking.contract_signed_at))
      : null
    if (contractSignedDate && body.paidOn < contractSignedDate) {
      return notRecorded('An installment receipt date cannot be earlier than the signed Event Agreement.', 409)
    }
    const inquiry = booking.inquiry_id ? await getLuxorInquiry(booking.inquiry_id) : null
    if (inquiry?.is_test) await assertLuxorProductionSideEffectsAllowed(inquiry.id)
    if (inquiry?.status === 'closed_lost') return notRecorded('Archived bookings cannot receive new payments.', 409)

    const [masterInvoice, invoice, installments] = await Promise.all([
      booking.invoice_id ? getInvoice(booking.invoice_id) : Promise.resolve(null),
      getInvoiceByBookingAndKind(booking.id, 'final_balance'),
      listLuxorPaymentInstallments(booking.id),
    ])
    if (!masterInvoice || masterInvoice.invoice_kind !== 'event' || !invoice || invoice.parent_invoice_id !== masterInvoice.id) {
      return notRecorded('The approved final-balance invoice is unavailable. Review the payment plan before recording funds.', 409)
    }
    const installment = installments.find((row) => row.id === body.installmentId)
    if (!installment || installment.status === 'void' || isBookingPaymentMilestone(installment)
      || (installment.invoice_id && installment.invoice_id !== masterInvoice.id)) {
      return notRecorded('Choose an active monthly installment for this event.', 409)
    }
    if (installment.status === 'partial' && !Number.isFinite(Number(installment.metadata?.paid_amount))) {
      const prior = await listPaidPaymentsByInvoice(invoice.id)
      if (allocatedTo(installment, prior) <= 0) {
        return notRecorded('This installment has an earlier partial status without a matching transaction allocation. Reconcile it before adding more funds.', 409)
      }
    }

    const priorPayments = await listPaidPaymentsByInvoice(invoice.id)
    const previousAllocated = allocatedTo(installment, priorPayments)
    const obligationRemaining = roundMoney(Number(installment.amount) - previousAllocated)
    const invoiceRemaining = roundMoney(Number(invoice.total) - priorPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0))
    if (amount > obligationRemaining || amount > invoiceRemaining) {
      return notRecorded('The amount is greater than the remaining installment or final-invoice balance.', 409)
    }

    // Match the established manual final-payment flow only after all local
    // eligibility and balance checks pass. Reload after expiry; the database
    // RPC checks again while holding the invoice lock.
    if (invoice.stripe_checkout_session_id) {
      await expireLuxorCheckoutForRepricing(invoice)
      const refreshed = await getInvoice(invoice.id)
      if (!refreshed || refreshed.stripe_checkout_session_id) {
        return notRecorded('The existing card payment link needs reconciliation before recording installment funds.', 409)
      }
    }

    const allocations = [{ installment_id: installment.id, amount }]
    rpcStarted = true
    const result = await supabaseRestStrict<{ payment: LuxorPayment; allocations: Array<{ installment_id: string; amount: number }>; replayed: boolean }>(
      'rpc/luxor_record_manual_installment_payment', {
        method: 'POST',
        body: JSON.stringify({
          p_idempotency_key: body.idempotencyKey,
          p_request_fingerprint: fingerprint,
          p_booking_id: booking.id,
          p_invoice_id: invoice.id,
          p_amount: amount,
          p_paid_at: paidOn.toISOString(),
          p_payment_method: paymentMethod,
          p_reference: reference || null,
          p_notes: notes || null,
          p_actor_email: session.email,
          p_allocations: allocations,
        }),
      },
    )
    if (!result?.payment?.id) throw new Error('The saved payment could not be confirmed in the ledger.')
    return NextResponse.json({ payment: result.payment, allocations: result.allocations, replayed: result.replayed })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Installment payment could not be recorded.'
    const keyConflict = /request key was already used with different details/i.test(message)
    const possibleExistingPayment = /possible duplicate manual payment|stripe payment reference already exists|stripe reference already exists|already recorded for this booking|payment transaction reference was already used|different financial details|different currency/i.test(message)
    const rejectedByPostgrest = rpcStarted && error instanceof SupabaseRestError && error.status >= 400 && error.status < 500
    const knownRejected = rejectedByPostgrest || /request key was already used with different details|possible duplicate manual payment|stripe reference already exists|already recorded for this booking|invalid manual installment payment|signed, active booking|archived bookings|approved final-balance invoice|active Stripe checkout|allocation rows must be unique|selected installment is no longer payable|booking payment milestone|obligation allocation|earlier partial installment|allocation exceeds|remaining final-balance invoice|payment exceeds the remaining final-balance invoice|installment payment identity|one or more selected installments/i.test(message)
    if (replayLookupStarted && !replayLookupCompleted) return unknownOutcome(message, keyConflict ? 409 : 500, !keyConflict)
    if (!replayLookupCompleted) return unknownOutcome(message, 500)
    if (!rpcStarted) return NextResponse.json({ error: message, paymentOutcome: 'not_recorded', retryWithSameIdempotencyKey: true }, { status: 500 })
    if (keyConflict || possibleExistingPayment) return unknownOutcome(message, 409, false)
    if (knownRejected) return notRecorded(message, 409, !keyConflict)
    return NextResponse.json({ error: message, paymentOutcome: 'unknown', retryWithSameIdempotencyKey: true }, { status: 500 })
  }
}
