import 'server-only'

import crypto from 'node:crypto'
import Stripe from 'stripe'
import type { LuxorBooking, LuxorInquiry, LuxorInvoice } from './luxorInquiryTypes'
import { getInvoice, listPaidPaymentsByInvoice, updateInvoice } from './luxorInvoicesServer'
import { getLuxorBooking } from './luxorBookingsServer'
import { getLuxorInquiry } from './luxorInquiriesServer'
import { supabaseRest } from './supabaseRestServer'
import { isLuxorOfferExpired, luxorOfferSnapshot } from './luxorOffer'
import { assertLuxorSameDayPaymentAllowed, sameDayTermsFingerprint } from './luxorSameDayBookingServer'
import { sameDayBookingPromotion } from './luxorSameDayBooking'
import { assertLuxorProductionSideEffectsAllowed } from './luxorTestLeadServer'
import { assertLuxorBookingDepositAvailable } from './luxorDepositMaintenanceServer'

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
  if (invoice.invoice_kind === 'deposit') assertLuxorBookingDepositAvailable()
  await assertLuxorProductionSideEffectsAllowed(inquiry.id)
  const master = await assertLuxorSameDayPaymentAllowed(invoice, booking)
  const comparison = invoice.proposal_context?.proposal_record_type === 'proposal_breakdown' ? invoice : master?.proposal_context?.proposal_record_type === 'proposal_breakdown' ? master : null
  if (comparison && (!comparison.proposal_accepted_at || booking.contract_status !== 'signed')) {
    throw new Error('Informational proposal comparisons cannot be used for checkout.')
  }
  const sameDay = master?.same_day_booking_status !== 'eligible' ? sameDayBookingPromotion(master) : null
  const fingerprint = sameDay?.coverage_amount && master ? sameDayTermsFingerprint(master, booking) : ''
  if (inquiry.status === 'closed_lost') {
    throw new Error('This deal is closed lost, so a new Stripe checkout link cannot be created.')
  }
  if (booking.status === 'cancelled') {
    throw new Error('This booking is cancelled, so a new Stripe checkout link cannot be created.')
  }
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

  if (invoice.invoice_kind !== 'deposit' && invoice.invoice_kind !== 'final_balance' && invoice.invoice_kind !== 'security_deposit') {
    throw new Error('Stripe checkout can be created only for a scheduled booking-payment invoice.')
  }

  // Both scheduled invoices are exact, locked amounts. The deposit child
  // invoice contains only the initial booking payment; the separate $750
  // security hold has its own invoice and payment flow.
  // Never let a UI caller create an ad hoc partial payment from either one.
  const isInitialBookingPayment = invoice.invoice_kind === 'deposit'
  const isSecurityDeposit = invoice.invoice_kind === 'security_deposit'
  if (isInitialBookingPayment && invoice.line_items.some((item) =>
    item.paymentBucket === 'security_deposit' ||
    item.category === 'Security Deposit' ||
    /refundable\s+security\s+deposit/i.test(item.description || ''),
  )) {
    throw new Error('The initial booking payment cannot include the refundable security deposit.')
  } else if (!isInitialBookingPayment && !isSecurityDeposit && invoice.line_items.some((item) =>
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
    throw new Error('The Stripe payment must equal the approved invoice balance.')
  }
  const paymentAmount = balanceDue
  if (paymentAmount < 0.5 || paymentAmount > balanceDue) {
    throw new Error(`Payment must be between $0.50 and $${balanceDue.toFixed(2)}.`)
  }

  const paymentLabel = isSecurityDeposit
    ? 'Refundable Security Deposit - Luxor at Las Palmas Events'
    : isInitialBookingPayment
    ? 'Initial Booking Payment - Luxor at Las Palmas Events'
    : 'Remaining Final Event Price Balance'
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe is not connected. Add STRIPE_SECRET_KEY before contract payment links can be delivered.')

  const stripe = new Stripe(secretKey)
  const origin = input.origin.replace(/\/$/, '')
  const verifyCurrentSameDayState = async (checkoutId: string) => {
    if (!sameDayBookingPromotion(master)?.coverage_amount) return
    const [currentInvoice, currentBooking, currentInquiry, paid, pendingReceipts] = await Promise.all([
      getInvoice(invoice.id), getLuxorBooking(booking.id), getLuxorInquiry(inquiry.id), listPaidPaymentsByInvoice(invoice.id),
      supabaseRest<Array<{ id: string }>>(`luxor_payments?select=id&invoice_id=eq.${encodeURIComponent(invoice.id)}&status=eq.pending&metadata->>receipt_received=eq.true&limit=1`),
    ])
    if (!currentInvoice || !currentBooking || !currentInquiry || currentInvoice.status === 'cancelled' || currentInquiry.status === 'closed_lost' || currentBooking.contract_status !== 'signed' || paid.length || pendingReceipts.length ||
      currentInvoice.total !== invoice.total || (currentInvoice.stripe_checkout_session_id && currentInvoice.stripe_checkout_session_id !== invoice.stripe_checkout_session_id && currentInvoice.stripe_checkout_session_id !== checkoutId)) throw new Error('This payment request changed while the link was being prepared. Refresh; do not pay from a stale link.')
    const currentMaster = await assertLuxorSameDayPaymentAllowed(currentInvoice, currentBooking)
    if (fingerprint && (!currentMaster || currentMaster.same_day_booking_status === 'eligible' || sameDayTermsFingerprint(currentMaster, currentBooking) !== fingerprint)) throw new Error('The same-day booking payment was received or its agreement changed. No additional link is available.')
  }
  const offer = luxorOfferSnapshot(invoice)
  // Proposal totals are already final and price-locked before the scheduled
  // child invoices are made. A promotion is part of that final price; it must
  // never be recreated as a Stripe coupon or Checkout discount.
  //
  // Older records may still contain this legacy reference. Clearing it only
  // removes our stale pointer--it does not delete the Stripe coupon itself.
  // A previously-open Checkout that used one is expired below instead of
  // reused, so every new post-contract link charges the exact child invoice
  // total once.
  if (invoice.stripe_coupon_id) {
    await updateInvoice(invoice.id, { stripe_coupon_id: null })
  }
  const nowSeconds = Math.floor(Date.now() / 1000)
  const maximumSessionExpiry = nowSeconds + (23 * 60 * 60) + (55 * 60)
  const expiresAt = sameDay?.coverage_amount ? sameDay.expires_at : offer.expiresAt
  const offerExpirySeconds = expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : null
  const checkoutExpiry = offerExpirySeconds ? Math.min(offerExpirySeconds, maximumSessionExpiry) : undefined
  let previousSessionMarker = invoice.stripe_checkout_session_id || 'first'
  if (invoice.stripe_checkout_session_id) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(invoice.stripe_checkout_session_id)
      const existingHasStripeDiscount =
        Number(existing.total_details?.amount_discount || 0) > 0 ||
        Boolean(existing.discounts?.length) ||
        Boolean(existing.metadata?.stripe_coupon_id)
      const sameRequest = existing.status === 'open' &&
        !existingHasStripeDiscount &&
        Number(existing.amount_total || 0) === Math.round(paymentAmount * 100) &&
        existing.metadata?.invoice_id === invoice.id &&
        existing.metadata?.booking_id === booking.id &&
        existing.metadata?.payment_label === paymentLabel &&
        (!fingerprint || existing.metadata?.same_day_fingerprint === fingerprint) &&
        Number(existing.expires_at || 0) > nowSeconds &&
        (!checkoutExpiry || Number(existing.expires_at || 0) <= checkoutExpiry)
      if (sameRequest && existing.url) {
        try { await verifyCurrentSameDayState(existing.id) } catch (error) { await stripe.checkout.sessions.expire(existing.id); throw error }
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

  // Reuse a previously capped session even in the final 30 minutes. A fresh
  // session must never extend the original promotion deadline.
  if (checkoutExpiry && checkoutExpiry < Math.floor(Date.now() / 1000) + (30 * 60)) {
    throw new Error(sameDay?.coverage_amount
      ? 'A new discounted card link cannot be created within 30 minutes of midnight. An existing valid link may still be used before midnight. Contact Luxor for verified Cash/Zelle payment or revised pricing and a fresh agreement.'
      : 'This offer expires in less than 30 minutes, so Stripe cannot safely create a checkout link. Extend the offer or send an updated proposal.')
  }
  if (fingerprint) await updateInvoice(invoice.id, { proposal_context: { ...invoice.proposal_context, version: invoice.proposal_context?.version || 1, same_day_payment_fingerprint: fingerprint } })
  const disclosedBenefit = sameDayBookingPromotion(master)
  const taxDisclosure = disclosedBenefit?.coverage_amount && master
    ? `Original proposal sales tax: $${Number(master.proposal_context?.pricing_snapshot && (master.proposal_context.pricing_snapshot as Record<string, unknown>).tax_amount || disclosedBenefit.coverage_amount).toFixed(2)}. LUXOR pays $${disclosedBenefit.coverage_amount.toFixed(2)} of that sales tax${master.same_day_booking_status === 'eligible' ? '; the booking qualified on its original proposal day' : ` only if agreement and required initial payment complete before ${disclosedBenefit.expires_at} (midnight America/Chicago)`}. This invoice collects the locked scheduled payment only.`
    : ''

  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    integration_identifier: `luxor-post-contract-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
    customer_email: inquiry.email || booking.email || undefined,
    client_reference_id: invoice.id,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(paymentAmount * 100),
      product_data: { name: paymentLabel, ...(taxDisclosure ? { description: taxDisclosure } : {}) },
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
      offer_percent: '0',
      offer_savings: '0',
      offer_expires_at: offer.expiresAt || '',
      stripe_coupon_id: '',
      ...(fingerprint ? { same_day_fingerprint: fingerprint, same_day_deadline: sameDay!.expires_at, proposal_version: String(master!.proposal_version || 1) } : {}),
    },
    ...(fingerprint ? { payment_intent_data: { metadata: { workflow: 'luxor_same_day_booking', invoice_id: invoice.id,
      master_invoice_id: master!.id, booking_id: booking.id, same_day_fingerprint: fingerprint, same_day_deadline: sameDay!.expires_at } } } : {}),
    ...(checkoutExpiry ? { expires_at: checkoutExpiry } : {}),
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `${paymentLabel}${booking.event_type ? ` for ${booking.event_type}` : ''}${booking.event_date ? ` on ${booking.event_date}` : ''}${taxDisclosure ? '. ' + taxDisclosure : ''}`,
        metadata: {
          luxor_invoice_id: invoice.id,
          luxor_booking_id: booking.id,
          luxor_invoice_kind: invoice.invoice_kind || 'event',
          luxor_offer_percent: '0',
          luxor_offer_expires_at: offer.expiresAt || '',
          stripe_coupon_id: '',
        },
      },
    },
    success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/payment/cancelled`,
  }, {
    idempotencyKey: `luxor-${invoice.invoice_kind || 'event'}-${booking.id}-${invoice.id}-${Math.round(paymentAmount * 100)}-${Math.round(paidTotal * 100)}-${previousSessionMarker}`,
  })
  if (!checkout.url) throw new Error('Stripe did not return a checkout link.')
  try { await verifyCurrentSameDayState(checkout.id) } catch (error) { await stripe.checkout.sessions.expire(checkout.id); throw error }
  await updateInvoice(invoice.id, {
    payment_requested_at: new Date().toISOString(),
    payment_requested_amount: Number(checkout.amount_total || Math.round(paymentAmount * 100)) / 100,
    payment_requested_label: paymentLabel,
    stripe_checkout_session_id: checkout.id,
    stripe_checkout_url: checkout.url,
  })
  try { await verifyCurrentSameDayState(checkout.id) } catch (error) { await stripe.checkout.sessions.expire(checkout.id); throw error }

  const actualPaymentAmount = Number(checkout.amount_total || Math.round(paymentAmount * 100)) / 100
  if (Math.abs(actualPaymentAmount - paymentAmount) > 0.01) {
    await stripe.checkout.sessions.expire(checkout.id)
    throw new Error('Stripe calculated an amount that does not match the approved proposal. No payment link was sent.')
  }
  return { checkoutId: checkout.id, checkoutUrl: checkout.url, paymentAmount: actualPaymentAmount, paymentLabel, balanceDue, paidTotal, reused: false }
}
