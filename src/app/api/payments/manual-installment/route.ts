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
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorPayment, LuxorPaymentInstallment } from '@/lib/luxorInquiryTypes'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const roundMoney = (amount: number) => Math.round(amount * 100) / 100

function allocatedTo(installment: LuxorPaymentInstallment, payments: LuxorPayment[]) {
  return roundMoney(installmentPaidAmount(installment, payments))
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    if (process.env.LUXOR_PAYMENT_INSTALLMENT_ALLOCATIONS_READY !== 'true') {
      return NextResponse.json({ error: 'Installment allocation is not enabled yet. Use the existing payment workflow.' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({})) as {
      bookingId?: string; installmentId?: string; amount?: number; paidOn?: string; paymentMethod?: string
      reference?: string; notes?: string; idempotencyKey?: string
    }
    if (!UUID.test(body.bookingId || '') || !UUID.test(body.installmentId || '') || !UUID.test(body.idempotencyKey || '')) {
      return NextResponse.json({ error: 'Booking, installment, and payment request identifiers are required.' }, { status: 400 })
    }
    const bookingId = body.bookingId as string
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0 || roundMoney(amount) !== amount) {
      return NextResponse.json({ error: 'Enter a payment amount greater than zero with no more than two decimal places.' }, { status: 400 })
    }
    const paidOn = typeof body.paidOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.paidOn)
      ? zonedTourDateTimeToUtc(body.paidOn, '00:00')
      : null
    const todayInVenueTimezone = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    if (!paidOn || !Number.isFinite(paidOn.getTime()) || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(paidOn) !== body.paidOn || body.paidOn > todayInVenueTimezone) {
      return NextResponse.json({ error: 'Enter a valid actual payment date that is not in the future.' }, { status: 400 })
    }
    const methods = new Set(['Cash', 'Zelle', 'Check', 'ACH'])
    const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod : ''
    if (!methods.has(paymentMethod)) return NextResponse.json({ error: 'Choose Cash, Zelle, Check, or ACH.' }, { status: 400 })
    const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, 200) : ''
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : ''
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
      bookingId, installmentId: body.installmentId, amount,
      paidAt: paidOn.toISOString(), paymentMethod, reference, notes,
    })).digest('hex')
    const replay = await supabaseRest<{ payment: LuxorPayment | null; allocations: Array<{ installment_id: string; amount: number }>; replayed: boolean }>(
      'rpc/luxor_lookup_manual_installment_payment_replay', {
        method: 'POST', body: JSON.stringify({ p_idempotency_key: body.idempotencyKey, p_request_fingerprint: fingerprint }),
      },
    )
    if (replay?.replayed && replay.payment?.id) {
      return NextResponse.json({ payment: replay.payment, allocations: replay.allocations, replayed: true })
    }

    const booking = await getLuxorBooking(bookingId)
    if (!booking) return NextResponse.json({ error: 'Booking record not found.' }, { status: 404 })
    if (booking.status === 'cancelled' || booking.status === 'completed' || booking.contract_status !== 'signed') {
      return NextResponse.json({ error: 'A signed, active booking is required to record an installment payment.' }, { status: 409 })
    }
    const contractSignedDate = booking.contract_signed_at
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(booking.contract_signed_at))
      : null
    if (contractSignedDate && body.paidOn < contractSignedDate) {
      return NextResponse.json({ error: 'An installment receipt date cannot be earlier than the signed Event Agreement.' }, { status: 409 })
    }
    const inquiry = booking.inquiry_id ? await getLuxorInquiry(booking.inquiry_id) : null
    if (inquiry?.is_test) await assertLuxorProductionSideEffectsAllowed(inquiry.id)
    if (inquiry?.status === 'closed_lost') return NextResponse.json({ error: 'Archived bookings cannot receive new payments.' }, { status: 409 })

    const [masterInvoice, invoice, installments] = await Promise.all([
      booking.invoice_id ? getInvoice(booking.invoice_id) : Promise.resolve(null),
      getInvoiceByBookingAndKind(booking.id, 'final_balance'),
      listLuxorPaymentInstallments(booking.id),
    ])
    if (!masterInvoice || masterInvoice.invoice_kind !== 'event' || !invoice || invoice.parent_invoice_id !== masterInvoice.id) {
      return NextResponse.json({ error: 'The approved final-balance invoice is unavailable. Review the payment plan before recording funds.' }, { status: 409 })
    }
    const installment = installments.find((row) => row.id === body.installmentId)
    if (!installment || installment.status === 'void' || isBookingPaymentMilestone(installment)
      || (installment.invoice_id && installment.invoice_id !== masterInvoice.id)) {
      return NextResponse.json({ error: 'Choose an active monthly installment for this event.' }, { status: 409 })
    }
    if (installment.status === 'partial' && !Number.isFinite(Number(installment.metadata?.paid_amount))) {
      const prior = await listPaidPaymentsByInvoice(invoice.id)
      if (allocatedTo(installment, prior) <= 0) {
        return NextResponse.json({ error: 'This installment has an earlier partial status without a matching transaction allocation. Reconcile it before adding more funds.' }, { status: 409 })
      }
    }

    const priorPayments = await listPaidPaymentsByInvoice(invoice.id)
    const previousAllocated = allocatedTo(installment, priorPayments)
    const obligationRemaining = roundMoney(Number(installment.amount) - previousAllocated)
    const invoiceRemaining = roundMoney(Number(invoice.total) - priorPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0))
    if (amount > obligationRemaining || amount > invoiceRemaining) {
      return NextResponse.json({ error: 'The amount is greater than the remaining installment or final-invoice balance.' }, { status: 409 })
    }

    // Match the established manual final-payment flow only after all local
    // eligibility and balance checks pass. Reload after expiry; the database
    // RPC checks again while holding the invoice lock.
    if (invoice.stripe_checkout_session_id) {
      await expireLuxorCheckoutForRepricing(invoice)
      const refreshed = await getInvoice(invoice.id)
      if (!refreshed || refreshed.stripe_checkout_session_id) {
        return NextResponse.json({ error: 'The existing card payment link needs reconciliation before recording installment funds.' }, { status: 409 })
      }
    }

    const allocations = [{ installment_id: installment.id, amount }]
    const result = await supabaseRest<{ payment: LuxorPayment; allocations: Array<{ installment_id: string; amount: number }>; replayed: boolean }>(
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
    return NextResponse.json({ error: message }, { status: message.includes('request key was already used with different details') ? 409 : 500 })
  }
}
