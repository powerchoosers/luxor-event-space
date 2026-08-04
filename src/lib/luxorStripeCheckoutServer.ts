import 'server-only'

import Stripe from 'stripe'
import type { LuxorBooking, LuxorInquiry, LuxorInvoice } from './luxorInquiryTypes'
import { listPaidPaymentsByInvoice, updateInvoice } from './luxorInvoicesServer'

export async function createLuxorPostContractCheckout(input: {
  invoice: LuxorInvoice
  inquiry: LuxorInquiry
  booking: LuxorBooking
  origin: string
  paymentAmount?: number
  paymentLabel?: string
  allowPreContract?: boolean
}) {
  const { invoice, inquiry, booking } = input
  const paidPayments = await listPaidPaymentsByInvoice(invoice.id)
  const paidTotal = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const balanceDue = Math.max(0, Math.round((Number(invoice.total) - paidTotal) * 100) / 100)
  if (balanceDue <= 0) return null

  if (!input.allowPreContract && booking.contract_status !== 'signed') {
    throw new Error('The agreement must be signed before Stripe checkout can be created.')
  }

  const requestedDeposit = Math.max(0, Number(booking.deposit_required || 0) - paidTotal)
  const requestedAmount = Number(input.paymentAmount)
  const paymentAmount = Number.isFinite(requestedAmount)
    ? Math.round(requestedAmount * 100) / 100
    : Math.min(balanceDue, requestedDeposit > 0 ? requestedDeposit : balanceDue)
  if (paymentAmount < 0.5 || paymentAmount > balanceDue) {
    throw new Error(`Payment must be between $0.50 and $${balanceDue.toFixed(2)}.`)
  }

  const paymentLabel = String(input.paymentLabel || (requestedDeposit > 0 ? 'Event deposit' : 'Remaining event balance')).trim().slice(0, 80)
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe is not connected. Add STRIPE_SECRET_KEY before contract payment links can be delivered.')

  const stripe = new Stripe(secretKey)
  const origin = input.origin.replace(/\/$/, '')
  let previousSessionMarker = invoice.stripe_checkout_session_id || 'first'
  if (invoice.stripe_checkout_session_id) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(invoice.stripe_checkout_session_id)
      const sameRequest = existing.status === 'open' &&
        Number(existing.amount_total || 0) === Math.round(paymentAmount * 100) &&
        existing.metadata?.invoice_id === invoice.id &&
        existing.metadata?.booking_id === booking.id &&
        existing.metadata?.payment_label === paymentLabel
      if (sameRequest && existing.url) {
        return { checkoutId: existing.id, checkoutUrl: existing.url, paymentAmount, paymentLabel, balanceDue, paidTotal, reused: true }
      }
      if (existing.status === 'open') await stripe.checkout.sessions.expire(existing.id)
      if (existing.status === 'complete' || existing.payment_status === 'paid') {
        throw new Error('Stripe has already received or is processing this payment. Refresh before sending another request.')
      }
      previousSessionMarker = existing.id
    } catch (error) {
      if (error instanceof Error && /already received or is processing this payment/.test(error.message)) throw error
      const stripeCode = typeof error === 'object' && error && 'code' in error ? String(error.code || '') : ''
      if (stripeCode !== 'resource_missing') throw error
      previousSessionMarker = invoice.stripe_checkout_session_id
    }
  }

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
    idempotencyKey: `signed-contract-${booking.id}-${Math.round(paymentAmount * 100)}-${Math.round(paidTotal * 100)}-${previousSessionMarker}`,
  })
  if (!checkout.url) throw new Error('Stripe did not return a checkout link.')

  await updateInvoice(invoice.id, {
    payment_requested_at: new Date().toISOString(),
    payment_requested_amount: paymentAmount,
    payment_requested_label: paymentLabel,
    stripe_checkout_session_id: checkout.id,
    stripe_checkout_url: checkout.url,
  })

  return { checkoutId: checkout.id, checkoutUrl: checkout.url, paymentAmount, paymentLabel, balanceDue, paidTotal, reused: false }
}
