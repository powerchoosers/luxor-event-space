import 'server-only'

import Stripe from 'stripe'
import type { LuxorBooking, LuxorInquiry, LuxorInvoice } from './luxorInquiryTypes'
import { listPaidPaymentsByInvoice, updateInvoice } from './luxorInvoicesServer'
import { hasLuxorOffer, isLuxorOfferExpired, luxorOfferSnapshot, roundLuxorMoney } from './luxorOffer'
import { LUXOR_DEFAULT_SECURITY_DEPOSIT } from './luxorBookingMoney'

/**
 * A checkout URL remains usable even after its reference is removed from our
 * database.  Any quote terms change must therefore expire the Stripe Session
 * itself before issuing a replacement.
 */
export async function expireLuxorCheckoutForRepricing(invoice: LuxorInvoice) {
  if (!invoice.stripe_checkout_session_id) return

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('Stripe must be connected before changing a quote with an active payment link.')
  }

  const stripe = new Stripe(secretKey)
  try {
    const session = await stripe.checkout.sessions.retrieve(invoice.stripe_checkout_session_id)
    if (session.status === 'open') await stripe.checkout.sessions.expire(session.id)
    if (session.status === 'complete' || session.payment_status === 'paid') {
      throw new Error('Stripe has already received or is processing this payment. Refresh before changing the quote.')
    }
  } catch (error) {
    if (error instanceof Error && /already received or is processing this payment/.test(error.message)) throw error
    const stripeCode = typeof error === 'object' && error && 'code' in error ? String(error.code || '') : ''
    if (stripeCode !== 'resource_missing') throw error
  }

  await updateInvoice(invoice.id, { stripe_checkout_session_id: null, stripe_checkout_url: null })
}

export async function createLuxorPostContractCheckout(input: {
  invoice: LuxorInvoice
  inquiry: LuxorInquiry
  booking: LuxorBooking
  origin: string
  paymentAmount?: number
  paymentLabel?: string
  masterInvoiceId?: string
}) {
  const { invoice, inquiry, booking } = input
  if (isLuxorOfferExpired(invoice)) {
    await updateInvoice(invoice.id, { offer_status: 'expired', stripe_checkout_session_id: null, stripe_checkout_url: null })
    throw new Error('This offer has expired. Please contact Luxor for an updated proposal.')
  }
  const paidPayments = await listPaidPaymentsByInvoice(invoice.id)
  const paidTotal = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const balanceDue = Math.max(0, Math.round((Number(invoice.total) - paidTotal) * 100) / 100)
  if (balanceDue <= 0) return null

  // This is intentionally unconditional. A caller must never be able to open
  // Stripe before a completed Event Agreement, including a reservation payment.
  if (booking.contract_status !== 'signed') {
    throw new Error('The agreement must be signed before Stripe checkout can be created.')
  }

  if (invoice.invoice_kind !== 'deposit' && invoice.invoice_kind !== 'final_balance') {
    throw new Error('Stripe checkout can be created only for a scheduled booking-payment invoice.')
  }

  // Both scheduled invoices are exact, locked amounts. The deposit child
  // invoice includes the initial booking payment plus the separate $750
  // security hold; the final invoice contains only the remaining Event Price.
  // Never let a UI caller create an ad hoc partial payment from either one.
  const isInitialBookingPayment = invoice.invoice_kind === 'deposit'
  if (isInitialBookingPayment) {
    const securityDeposit = Number(invoice.line_items.find((item) =>
      item.paymentBucket === 'security_deposit' ||
      item.category === 'Security Deposit' ||
      /refundable\s+security\s+deposit/i.test(item.description || ''),
    )?.total || 0)
    if (Math.abs(securityDeposit - LUXOR_DEFAULT_SECURITY_DEPOSIT) > 0.01) {
      throw new Error('The initial booking invoice must include the separate $750 refundable security deposit.')
    }
  } else if (invoice.line_items.some((item) =>
    item.paymentBucket === 'security_deposit' ||
    item.category === 'Security Deposit' ||
    /refundable\s+security\s+deposit/i.test(item.description || ''),
  )) {
    throw new Error('The final event balance cannot include the refundable security deposit.')
  }
  const requestedAmount = Number(input.paymentAmount)
  const explicitPaymentAmount = Number.isFinite(requestedAmount)
    ? Math.round(requestedAmount * 100) / 100
    : undefined
  if (explicitPaymentAmount !== undefined && Math.abs(explicitPaymentAmount - balanceDue) > 0.01) {
    throw new Error(isInitialBookingPayment
      ? 'The initial booking payment must include the separate refundable security deposit in full.'
      : 'The Stripe payment must equal the remaining Final Event Price balance.')
  }
  const paymentAmount = balanceDue
  if (paymentAmount < 0.5 || paymentAmount > balanceDue) {
    throw new Error(`Payment must be between $0.50 and $${balanceDue.toFixed(2)}.`)
  }

  const paymentLabel = isInitialBookingPayment
    ? 'Initial Booking Payment + Refundable Security Deposit'
    : 'Remaining Final Event Price Balance'
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe is not connected. Add STRIPE_SECRET_KEY before contract payment links can be delivered.')

  const stripe = new Stripe(secretKey)
  const origin = input.origin.replace(/\/$/, '')
  const offer = luxorOfferSnapshot(invoice)
  // Proposal totals are already final and price-locked before child payment
  // invoices are made. Applying an offer in Stripe here would discount them a
  // second time.
  // Checkout is restricted to deposit/final-balance child invoices above.
  // Their totals already reflect the locked final proposal, so applying an
  // offer in Stripe here would discount the customer a second time.
  const appliesStripeDiscount = false
  const discountFactor = 1 - (offer.percent / 100)
  const undiscountedPaymentAmount = appliesStripeDiscount && discountFactor > 0
    ? roundLuxorMoney(paymentAmount / discountFactor)
    : paymentAmount
  if (appliesStripeDiscount && undiscountedPaymentAmount < paymentAmount) {
    throw new Error('The offer pricing could not be safely prepared for Stripe.')
  }
  const nowSeconds = Math.floor(Date.now() / 1000)
  const maximumSessionExpiry = nowSeconds + (23 * 60 * 60) + (55 * 60)
  const offerExpirySeconds = offer.expiresAt ? Math.floor(new Date(offer.expiresAt).getTime() / 1000) : null
  const checkoutExpiry = offerExpirySeconds ? Math.min(offerExpirySeconds, maximumSessionExpiry) : undefined
  if (checkoutExpiry && checkoutExpiry < nowSeconds + (30 * 60)) {
    throw new Error('This offer expires in less than 30 minutes, so Stripe cannot safely create a checkout link. Extend the offer or send an updated proposal.')
  }
  let stripeCouponId = invoice.stripe_coupon_id || null
  let previousSessionMarker = invoice.stripe_checkout_session_id || 'first'
  if (invoice.stripe_checkout_session_id) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(invoice.stripe_checkout_session_id)
      const sameRequest = existing.status === 'open' &&
        Number(existing.amount_total || 0) === Math.round(paymentAmount * 100) &&
        existing.metadata?.invoice_id === invoice.id &&
        existing.metadata?.booking_id === booking.id &&
        existing.metadata?.payment_label === paymentLabel &&
        (!checkoutExpiry || Number(existing.expires_at || 0) <= checkoutExpiry)
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

  if (appliesStripeDiscount && !stripeCouponId) {
    const coupon = await stripe.coupons.create({
      percent_off: offer.percent,
      duration: 'once',
      ...(offerExpirySeconds ? { redeem_by: offerExpirySeconds } : {}),
      name: `Luxor ${offer.percent}% limited-time offer`,
      metadata: {
        luxor_invoice_id: invoice.id,
        luxor_booking_id: booking.id,
        offer_expires_at: offer.expiresAt || '',
      },
    })
    stripeCouponId = coupon.id
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: inquiry.email || booking.email || undefined,
    client_reference_id: invoice.id,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(undiscountedPaymentAmount * 100),
        product_data: { name: `${paymentLabel} - Luxor Event Space` },
      },
    }],
    metadata: {
      // A non-sensitive, human-readable Stripe Dashboard marker. The invoice
      // and booking IDs remain in metadata for server-side reconciliation.
      workflow: 'luxor_post_contract_booking_payment',
      invoice_id: invoice.id,
      master_invoice_id: input.masterInvoiceId || invoice.parent_invoice_id || invoice.id,
      inquiry_id: inquiry.id,
      booking_id: booking.id,
      invoice_kind: invoice.invoice_kind || 'event',
      payment_label: paymentLabel,
      contract_signed: booking.contract_status === 'signed' ? 'true' : 'false',
      offer_percent: appliesStripeDiscount ? String(offer.percent) : '0',
      offer_savings: appliesStripeDiscount ? String(offer.savings) : '0',
      offer_expires_at: offer.expiresAt || '',
      stripe_coupon_id: stripeCouponId || '',
    },
    ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
    ...(checkoutExpiry ? { expires_at: checkoutExpiry } : {}),
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `${paymentLabel} for ${booking.event_type || 'event'}${booking.event_date ? ` on ${booking.event_date}` : ''}`,
        metadata: {
          luxor_invoice_id: invoice.id,
          luxor_booking_id: booking.id,
          luxor_invoice_kind: invoice.invoice_kind || 'event',
          luxor_offer_percent: appliesStripeDiscount ? String(offer.percent) : '0',
          luxor_offer_expires_at: offer.expiresAt || '',
          stripe_coupon_id: stripeCouponId || '',
        },
      },
    },
    success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/payment/cancelled`,
  }, {
    idempotencyKey: `luxor-${invoice.invoice_kind || 'event'}-${booking.id}-${invoice.id}-${Math.round(paymentAmount * 100)}-${Math.round(paidTotal * 100)}-${previousSessionMarker}`,
  })
  if (!checkout.url) throw new Error('Stripe did not return a checkout link.')

  await updateInvoice(invoice.id, {
    payment_requested_at: new Date().toISOString(),
    payment_requested_amount: Number(checkout.amount_total || Math.round(paymentAmount * 100)) / 100,
    payment_requested_label: paymentLabel,
    stripe_checkout_session_id: checkout.id,
    stripe_checkout_url: checkout.url,
    ...(stripeCouponId ? { stripe_coupon_id: stripeCouponId } : {}),
  })

  const actualPaymentAmount = Number(checkout.amount_total || Math.round(paymentAmount * 100)) / 100
  if (Math.abs(actualPaymentAmount - paymentAmount) > 0.01) {
    await stripe.checkout.sessions.expire(checkout.id)
    throw new Error('Stripe calculated an amount that does not match the approved proposal. No payment link was sent.')
  }
  return { checkoutId: checkout.id, checkoutUrl: checkout.url, paymentAmount: actualPaymentAmount, paymentLabel, balanceDue, paidTotal, reused: false }
}
