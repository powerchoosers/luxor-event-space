import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getInvoice, listPaidPaymentsByInvoice, updateInvoice } from '@/lib/luxorInvoicesServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorBooking, updateLuxorBooking } from '@/lib/luxorBookingsServer'

function paymentKind(label: string | undefined) {
  const normalized = String(label || '').toLowerCase()
  if (normalized.includes('deposit')) return 'deposit'
  if (normalized.includes('remaining') || normalized.includes('balance')) return 'final'
  return 'installment'
}

async function recordPaidCheckoutSession(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoice_id || session.client_reference_id
  if (!invoiceId || session.payment_status !== 'paid') return
  const paidAt = new Date().toISOString()
  const kind = paymentKind(session.metadata?.payment_label)

  await supabaseRest('luxor_payments?on_conflict=processor,processor_reference', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      booking_id: session.metadata?.booking_id || null,
      invoice_id: invoiceId,
      inquiry_id: session.metadata?.inquiry_id || null,
      amount: Number(session.amount_total || 0) / 100,
      status: 'paid',
      payment_method: 'stripe_checkout',
      paid_at: paidAt,
      processor: 'stripe',
      processor_reference: session.id,
      metadata: {
        payment_intent: session.payment_intent || null,
        payment_label: session.metadata?.payment_label || null,
        payment_kind: kind,
      },
    }),
  })

  const [invoice, paidPayments] = await Promise.all([
    getInvoice(invoiceId),
    listPaidPaymentsByInvoice(invoiceId),
  ])
  if (!invoice) return

  const paidTotal = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const isFullyPaid = paidTotal + 0.005 >= Number(invoice.total || 0)
  await updateInvoice(invoiceId, {
    status: isFullyPaid ? 'paid' : 'sent',
    paid_at: isFullyPaid ? paidAt : null,
  })

  const inquiryId = invoice.inquiry_id || session.metadata?.inquiry_id || null
  if (inquiryId) {
    const inquiry = await getLuxorInquiry(inquiryId)
    if (inquiry) {
      await updateLuxorInquiry(inquiry.id, {
        status: ['booked', 'closed_lost'].includes(inquiry.status) ? inquiry.status : 'proposal_sent',
        pipeline_stage: ['booked', 'closed_lost'].includes(inquiry.status) ? inquiry.pipeline_stage : 'proposal',
        metadata: {
          ...inquiry.metadata,
          latest_payment_at: paidAt,
          latest_paid_invoice_id: invoice.id,
        },
      })
    }
  }

  const bookingId = session.metadata?.booking_id || null
  if (bookingId) {
    const booking = await getLuxorBooking(bookingId)
    if (booking) {
      const depositCovered = Number(booking.deposit_required || 0) > 0 && paidTotal + 0.005 >= Number(booking.deposit_required)
      const contractCovered = Number(booking.contract_total || 0) > 0 && paidTotal + 0.005 >= Number(booking.contract_total)
      await updateLuxorBooking(booking.id, {
        security_deposit_status: depositCovered ? 'collected' : booking.security_deposit_status,
        status: depositCovered && booking.status === 'draft' ? 'tentative' : booking.status,
        metadata: {
          ...booking.metadata,
          ...(depositCovered ? { deposit_paid_at: paidAt } : {}),
          ...(contractCovered ? { final_payment_paid_at: paidAt } : {}),
        },
      })
    }
  }
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secretKey || !webhookSecret) return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 503 })

  try {
    const stripe = new Stripe(secretKey)
    const signature = request.headers.get('stripe-signature')
    if (!signature) return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 })
    const event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret)

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await recordPaidCheckoutSession(event.data.object)
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Stripe webhook.' }, { status: 400 })
  }
}
