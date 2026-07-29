import 'server-only'

import Stripe from 'stripe'
import type { LuxorBooking, LuxorInquiry, LuxorInvoice } from './luxorInquiryTypes'
import { listPaidPaymentsByInvoice, updateInvoice } from './luxorInvoicesServer'

export async function createLuxorPostContractCheckout(input: {
  invoice: LuxorInvoice
  inquiry: LuxorInquiry
  booking: LuxorBooking
  origin: string
}) {
  const { invoice, inquiry, booking } = input
  const paidPayments = await listPaidPaymentsByInvoice(invoice.id)
  const paidTotal = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const balanceDue = Math.max(0, Math.round((Number(invoice.total) - paidTotal) * 100) / 100)
  if (balanceDue <= 0) return null

  const requestedDeposit = Math.max(0, Number(booking.deposit_required || 0) - paidTotal)
  const paymentAmount = Math.min(balanceDue, requestedDeposit > 0 ? requestedDeposit : balanceDue)
  if (paymentAmount < 0.5) return null

  const paymentLabel = requestedDeposit > 0 ? 'Event deposit' : 'Remaining event balance'
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe is not connected. Add STRIPE_SECRET_KEY before contract payment links can be delivered.')

  const stripe = new Stripe(secretKey)
  const origin = input.origin.replace(/\/$/, '')
  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: inquiry.email || booking.email || undefined,
    client_reference_id: invoice.id,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(paymentAmount * 100),
        product_data: { name: `${paymentLabel} - Luxor Event Space` },
      },
    }],
    metadata: {
      invoice_id: invoice.id,
      inquiry_id: inquiry.id,
      booking_id: booking.id,
      payment_label: paymentLabel,
      contract_signed: 'true',
    },
    success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/payment/cancelled`,
  }, {
    idempotencyKey: `signed-contract-${booking.id}-${Math.round(paymentAmount * 100)}-${Math.round(paidTotal * 100)}`,
  })
  if (!checkout.url) throw new Error('Stripe did not return a checkout link.')

  await updateInvoice(invoice.id, {
    payment_requested_at: new Date().toISOString(),
    payment_requested_amount: paymentAmount,
    payment_requested_label: paymentLabel,
    stripe_checkout_session_id: checkout.id,
    stripe_checkout_url: checkout.url,
  })

  return { checkoutUrl: checkout.url, paymentAmount, paymentLabel, balanceDue, paidTotal }
}
