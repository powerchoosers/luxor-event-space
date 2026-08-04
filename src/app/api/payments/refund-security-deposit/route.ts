import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorBooking, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorPayment } from '@/lib/luxorInquiryTypes'

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

    const refundAmount = body.refundAmount && Number.isFinite(body.refundAmount) && body.refundAmount > 0
      ? Math.round(body.refundAmount * 100) / 100
      : 750

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'Stripe is not connected. Add STRIPE_SECRET_KEY before issuing refunds.' }, { status: 503 })
    }

    const payments = await supabaseRest<LuxorPayment[]>(
      `luxor_payments?booking_id=eq.${encodeURIComponent(booking.id)}&status=eq.paid&order=created_at.desc`,
    ).catch(() => [])

    const invoicePayments = booking.invoice_id
      ? await supabaseRest<LuxorPayment[]>(`luxor_payments?invoice_id=eq.${encodeURIComponent(booking.invoice_id)}&status=eq.paid&order=created_at.desc`).catch(() => [])
      : []

    const allPayments = [...payments, ...invoicePayments]
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
      // Fallback: charge refund or customer refund if payment_intent is missing
      const recentCharges = await stripe.charges.list({ limit: 10 })
      const matchingCharge = recentCharges.data.find(
        (c) => c.customer === booking.email || c.billing_details?.email === booking.email,
      )
      if (!matchingCharge) {
        return NextResponse.json(
          { error: 'No matching Stripe payment found for this booking. Confirm the client paid via Stripe before issuing a refund.' },
          { status: 404 },
        )
      }
      refund = await stripe.refunds.create({
        charge: matchingCharge.id,
        amount: Math.round(refundAmount * 100),
        reason: 'requested_by_customer',
        metadata: {
          booking_id: booking.id,
          security_deposit_refund: 'true',
        },
      })
    }

    const now = new Date().toISOString()

    await supabaseRest('luxor_payments', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        booking_id: booking.id,
        invoice_id: booking.invoice_id || null,
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
