import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { LuxorPayment, LuxorPaymentRefund } from '@/lib/luxorInquiryTypes'
import { getInvoiceByBookingAndKind } from '@/lib/luxorInvoicesServer'
import { LUXOR_DEFAULT_SECURITY_DEPOSIT } from '@/lib/luxorBookingMoney'
import { assertLuxorProductionSideEffectsAllowed } from '@/lib/luxorTestLeadServer'

const MONEY_EPSILON = 0.005
const cents = (amount: number) => Math.round(amount * 100)

function securityDepositAmount(invoice: { line_items: Array<{ paymentBucket?: string; category?: string; description?: string; total?: number }> } | null) {
  const line = invoice?.line_items.find((item) =>
    item.paymentBucket === 'security_deposit' ||
    item.category === 'Security Deposit' ||
    /refundable\s+security\s+deposit/i.test(item.description || ''),
  )
  return Math.round(Number(line?.total || 0) * 100) / 100
}

function stripeRefundStatus(status: string | null | undefined): LuxorPaymentRefund['status'] {
  if (status === 'succeeded') return 'succeeded'
  if (status === 'failed' || status === 'canceled') return 'failed'
  return 'pending'
}

async function recordProviderRefund(refund: Stripe.Refund, request: LuxorPaymentRefund) {
  const paymentIntentId = typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id
  if (paymentIntentId !== request.processor_payment_intent_id || refund.amount !== cents(Number(request.amount)) || refund.currency !== request.currency) {
    throw new Error('Stripe refund does not match the saved request and environment.')
  }
  return supabaseRestStrict<LuxorPaymentRefund>('rpc/luxor_record_payment_refund_result', {
    method: 'POST',
    body: JSON.stringify({
      p_refund_id: request.id,
      p_status: stripeRefundStatus(refund.status),
      p_processor_refund_id: refund.id,
      p_failure_code: refund.failure_reason || null,
      p_livemode: request.livemode,
    }),
  })
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'finances')) {
      return NextResponse.json({ error: 'Active finance access is required to issue a refund.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({})) as { bookingId?: string }
    if (!body.bookingId) return NextResponse.json({ error: 'bookingId is required.' }, { status: 400 })

    const booking = await getLuxorBooking(body.bookingId)
    if (!booking) return NextResponse.json({ error: 'Booking record not found.' }, { status: 404 })
    if (booking.inquiry_id) await assertLuxorProductionSideEffectsAllowed(booking.inquiry_id)
    if (booking.security_deposit_status !== 'held' && booking.security_deposit_status !== 'refunded') {
      return NextResponse.json({ error: 'The refundable security deposit must be held before it can be refunded.' }, { status: 409 })
    }

    const depositInvoice = await getInvoiceByBookingAndKind(booking.id, 'deposit')
    if (!depositInvoice) return NextResponse.json({ error: 'The initial booking invoice could not be verified.' }, { status: 409 })
    if (booking.security_deposit_status === 'refunded') {
      const priorRequest = await supabaseRestStrict<LuxorPaymentRefund[]>(
        `luxor_payment_refunds?select=id&booking_id=eq.${encodeURIComponent(booking.id)}&invoice_id=eq.${encodeURIComponent(depositInvoice.id)}&refund_kind=eq.security_deposit&limit=1`,
      )
      if (!priorRequest.length) return NextResponse.json({ error: 'This security deposit is already marked refunded; its prior refund must be reconciled before another request.' }, { status: 409 })
    }
    const refundAmount = securityDepositAmount(depositInvoice)
    if (Math.abs(refundAmount - LUXOR_DEFAULT_SECURITY_DEPOSIT) >= MONEY_EPSILON) {
      return NextResponse.json({ error: 'The paid initial booking invoice does not contain the required $750 refundable security deposit.' }, { status: 409 })
    }

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) return NextResponse.json({ error: 'Stripe is not connected. Add STRIPE_SECRET_KEY before issuing refunds.' }, { status: 503 })
    const expectedLiveMode = /^(sk|rk)_live_/.test(secretKey) ? true : /^(sk|rk)_test_/.test(secretKey) ? false : null
    if (expectedLiveMode === null) return NextResponse.json({ error: 'Stripe environment cannot be verified.' }, { status: 503 })

    const [bookingPayments, invoicePayments] = await Promise.all([
      supabaseRestStrict<LuxorPayment[]>(`luxor_payments?booking_id=eq.${encodeURIComponent(booking.id)}&status=eq.paid&order=created_at.desc`),
      supabaseRestStrict<LuxorPayment[]>(`luxor_payments?invoice_id=eq.${encodeURIComponent(depositInvoice.id)}&status=eq.paid&order=created_at.desc`),
    ])
    const depositPaidTotal = invoicePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    if (depositPaidTotal + MONEY_EPSILON < Number(depositInvoice.total || 0)) {
      return NextResponse.json({ error: 'The initial booking payment is not fully paid, so the refundable security deposit cannot be returned.' }, { status: 409 })
    }

    const allPayments = [...new Map([...invoicePayments, ...bookingPayments].map((payment) => [payment.id, payment])).values()]
    const stripePayment = allPayments.find((payment) => payment.invoice_id === depositInvoice.id &&
      (payment.processor === 'stripe' || payment.payment_method === 'stripe_checkout'))
    if (!stripePayment || stripePayment.amount <= 0) {
      return NextResponse.json({ error: 'The initial booking payment cannot be matched to Stripe, so no refund was issued.' }, { status: 409 })
    }

    const stripe = new Stripe(secretKey)
    let paymentIntentId: string | null = typeof stripePayment.metadata?.payment_intent === 'string' ? stripePayment.metadata.payment_intent : null
    if (!paymentIntentId) {
      if (!stripePayment.processor_reference) return NextResponse.json({ error: 'The initial booking payment cannot be matched to Stripe, so no refund was issued.' }, { status: 409 })
      const checkoutSession = await stripe.checkout.sessions.retrieve(stripePayment.processor_reference)
      paymentIntentId = typeof checkoutSession.payment_intent === 'string' ? checkoutSession.payment_intent : checkoutSession.payment_intent?.id || null
    }
    if (!paymentIntentId) return NextResponse.json({ error: 'The Stripe payment intent could not be verified.' }, { status: 409 })

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (paymentIntent.status !== 'succeeded' || paymentIntent.currency !== 'usd' || paymentIntent.livemode !== expectedLiveMode ||
      paymentIntent.amount_received < cents(refundAmount)) {
      return NextResponse.json({ error: 'The original Stripe payment does not have verified refundable funds in this environment.' }, { status: 409 })
    }

    const idempotencyKey = `luxor-security-deposit-refund-${booking.id}-${depositInvoice.id}`
    const reserved = await supabaseRestStrict<LuxorPaymentRefund>('rpc/luxor_reserve_payment_refund', {
      method: 'POST',
      body: JSON.stringify({
        p_source_payment_id: stripePayment.id,
        p_booking_id: booking.id,
        p_invoice_id: depositInvoice.id,
        p_inquiry_id: booking.inquiry_id,
        p_amount: refundAmount,
        p_idempotency_key: idempotencyKey,
        p_processor_payment_intent_id: paymentIntentId,
        p_requested_by: session.email,
        p_livemode: expectedLiveMode,
      }),
    })
    if (!reserved?.id) throw new Error('The refund request could not be durably reserved.')

    if (reserved.status === 'succeeded') {
      return NextResponse.json({ success: true, status: 'succeeded', refundId: reserved.processor_refund_id, amountRefunded: reserved.amount, booking: await getLuxorBooking(booking.id) })
    }
    if (reserved.status === 'failed') {
      return NextResponse.json({ success: false, status: 'failed', error: 'The saved Stripe refund request failed and requires owner review before any retry.' }, { status: 409 })
    }

    // Reconcile any prior/uncertain attempt before considering a provider call.
    // Replaying a stored Stripe key after its provider retention window can duplicate money movement.
    let prior: Stripe.Refund | null = null
    for await (const item of stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 })) {
      if (item.metadata?.luxor_refund_request_id === reserved.id ||
        (item.metadata?.booking_id === booking.id && item.metadata?.security_deposit_refund === 'true')) {
        prior = item
        break
      }
    }
    if (prior) {
      const saved = await recordProviderRefund(prior, reserved)
      if (saved.status === 'succeeded') {
        if (booking.inquiry_id) await createNote(booking.inquiry_id,
          `Refunded $${refundAmount.toFixed(2)} security deposit to ${booking.client_name} via Stripe (Refund ID: ${prior.id}).`,
          'status_change', session.email).catch((error) => console.error('Refund succeeded; audit note could not be saved:', error))
        return NextResponse.json({ success: true, status: 'succeeded', refundId: prior.id, amountRefunded: refundAmount, booking: await getLuxorBooking(booking.id) })
      }
      return NextResponse.json({ success: false, status: saved.status, refundId: prior.id, message: 'Stripe has a refund in progress or failed; no additional refund was submitted.' }, { status: 202 })
    }

    if (!reserved.created) {
      return NextResponse.json({ success: false, status: reserved.status, refundRequestId: reserved.id, message: 'The saved refund request has no matching Stripe refund yet. It remains on hold for reconciliation; no second refund was submitted.' }, { status: 202 })
    }

    let stripeRefund: Stripe.Refund
    try {
      stripeRefund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: cents(refundAmount),
        reason: 'requested_by_customer',
        metadata: {
          booking_id: booking.id,
          inquiry_id: booking.inquiry_id || '',
          security_deposit_refund: 'true',
          luxor_refund_request_id: reserved.id,
          refunded_by: session.email,
        },
      }, { idempotencyKey: reserved.idempotency_key })
    } catch (error) {
      await supabaseRestStrict<LuxorPaymentRefund>('rpc/luxor_record_payment_refund_result', {
        method: 'POST',
        body: JSON.stringify({ p_refund_id: reserved.id, p_status: 'uncertain', p_livemode: expectedLiveMode }),
      }).catch((recordError) => console.error('Stripe refund outcome is uncertain and could not be saved locally:', recordError))
      console.error('Stripe refund call returned an uncertain result; no retry was attempted:', error)
      return NextResponse.json({ success: false, status: 'uncertain', refundRequestId: reserved.id, message: 'Stripe did not confirm the outcome. The request is on hold for reconciliation; no second refund was submitted.' }, { status: 202 })
    }

    let saved: LuxorPaymentRefund
    try {
      saved = await recordProviderRefund(stripeRefund, reserved)
    } catch (error) {
      console.error('Stripe refund was created, but local confirmation failed; webhook reconciliation is required:', error)
      return NextResponse.json({ success: false, status: 'uncertain', refundRequestId: reserved.id, refundId: stripeRefund.id, message: 'Stripe returned a refund response, but Luxor could not save its status. Reconciliation is in progress.' }, { status: 202 })
    }
    if (saved.status !== 'succeeded') {
      return NextResponse.json({ success: false, status: saved.status, refundId: stripeRefund.id, message: 'Stripe has not confirmed a successful refund.' }, { status: 202 })
    }

    if (booking.inquiry_id) await createNote(booking.inquiry_id,
      `Refunded $${refundAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} security deposit to ${booking.client_name} via Stripe (Refund ID: ${stripeRefund.id}).`,
      'status_change', session.email).catch((error) => console.error('Refund succeeded; audit note could not be saved:', error))

    const updatedBooking = await getLuxorBooking(booking.id)
    const inquiry = booking.inquiry_id ? await getLuxorInquiry(booking.inquiry_id) : null
    return NextResponse.json({ success: true, status: 'succeeded', refundId: stripeRefund.id, amountRefunded: refundAmount, booking: updatedBooking, inquiry })
  } catch (error) {
    console.error('Failed to process security deposit refund:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to process security deposit refund.' }, { status: 500 })
  }
}
