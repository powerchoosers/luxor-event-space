import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorBooking, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorPayment } from '@/lib/luxorInquiryTypes'
import { getInvoiceByBookingAndKind } from '@/lib/luxorInvoicesServer'

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({})) as { bookingId?: string; invoiceId?: string; refundAmount?: number }
    const bookingId = body.bookingId
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required.' }, { status: 400 })
    }

    const booking = await getLuxorBooking(bookingId)
    if (!booking) {
      return NextResponse.json({ error: 'Booking record not found.' }, { status: 404 })
    }

    const finalInvoice = await getInvoiceByBookingAndKind(booking.id, 'final_balance')
    const securityDepositLine = finalInvoice?.line_items.find((item) => item.category === 'Security Deposit' || /refundable security deposit/i.test(item.description))
    const refundAmount = Math.round(Number(securityDepositLine?.total || 0) * 100) / 100
    if (refundAmount <= 0) {
      return NextResponse.json({ error: 'No refundable security-deposit line item was found on this booking’s final invoice.' }, { status: 409 })
    }

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'Stripe is not connected. Add STRIPE_SECRET_KEY before issuing refunds.' }, { status: 503 })
    }

    const payments = await supabaseRest<LuxorPayment[]>(
      `luxor_payments?booking_id=eq.${encodeURIComponent(booking.id)}&status=eq.paid&order=created_at.desc`,
    ).catch(() => [])

    const invoicePayments = finalInvoice
      ? await supabaseRest<LuxorPayment[]>(`luxor_payments?invoice_id=eq.${encodeURIComponent(finalInvoice.id)}&status=eq.paid&order=created_at.desc`).catch(() => [])
      : []

    const allPayments = [...invoicePayments, ...payments]
    const stripePayment = allPayments.find(
      (p) => p.processor === 'stripe' || p.payment_method === 'stripe_checkout' || Boolean(p.processor_reference),
    )

    const stripe = new Stripe(secretKey)
    let paymentIntentId: string | null = null

    if (stripePayment) {
      const meta = stripePayment.metadata || {}
      if (typeof meta.payment_intent === 'string' && meta.payment_intent) {
        paymentIntentId = meta.payment_intent
      } else if (stripePayment.processor_reference) {
        try {
          const checkoutSession = await stripe.checkout.sessions.retrieve(stripePayment.processor_reference)
          if (typeof checkoutSession.payment_intent === 'string') {
            paymentIntentId = checkoutSession.payment_intent
          } else if (checkoutSession.payment_intent?.id) {
            paymentIntentId = checkoutSession.payment_intent.id
          }
        } catch (sessionErr) {
          console.warn('Could not retrieve Stripe checkout session:', sessionErr)
        }
      }
    }

    let refund: Stripe.Refund | null = null

    if (paymentIntentId) {
      refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: Math.round(refundAmount * 100),
        reason: 'requested_by_customer',
        metadata: {
          booking_id: booking.id,
          inquiry_id: booking.inquiry_id || '',
          security_deposit_refund: 'true',
          refunded_by: session.email,
        },
      })
    } else {
      return NextResponse.json({ error: 'The final invoice payment cannot be matched to Stripe, so no refund was issued.' }, { status: 409 })
    }

    const now = new Date().toISOString()

    await supabaseRest('luxor_payments', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        booking_id: booking.id,
        invoice_id: finalInvoice?.id || null,
        inquiry_id: booking.inquiry_id || null,
        amount: -refundAmount,
        status: 'refunded',
        payment_method: 'stripe_refund',
        paid_at: now,
        processor: 'stripe',
        processor_reference: refund.id,
        notes: `Refunded $${refundAmount.toFixed(2)} refundable security deposit via Stripe`,
        metadata: {
          refund_id: refund.id,
          payment_intent: paymentIntentId,
          refunded_by: session.email,
          payment_kind: 'security_deposit_refund',
        },
      }),
    })

    const updatedBooking = await updateLuxorBooking(booking.id, {
      security_deposit_status: 'refunded',
      metadata: {
        ...booking.metadata,
        security_deposit_refunded_at: now,
        security_deposit_refund_id: refund.id,
        security_deposit_refund_amount: refundAmount,
      },
    })

    if (booking.inquiry_id) {
      await createNote(
        booking.inquiry_id,
        `Refunded $${refundAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} security deposit to ${booking.client_name} via Stripe (Refund ID: ${refund.id}).`,
        'status_change',
        session.email,
      )
    }

    return NextResponse.json({
      success: true,
      refundId: refund.id,
      amountRefunded: refundAmount,
      booking: updatedBooking,
    })
  } catch (error) {
    console.error('Failed to refund security deposit via Stripe:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refund security deposit.' },
      { status: 500 },
    )
  }
}
