import { NextResponse } from 'next/server'
import { getInvoiceByPublicToken, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorBooking, listLuxorBookingsByInquiry } from '@/lib/luxorBookingsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createLuxorPostContractCheckout } from '@/lib/luxorStripeCheckoutServer'
import { isLuxorOfferExpired } from '@/lib/luxorOffer'
import { isLuxorBookingDepositPaused } from '@/lib/luxorDepositMaintenanceServer'

export const dynamic = 'force-dynamic'

type PublicInvoice = NonNullable<Awaited<ReturnType<typeof getInvoiceByPublicToken>>>

async function openExistingNonDepositCheckout(request: Request, token: string, invoice: PublicInvoice) {
  if (isLuxorOfferExpired(invoice)) {
    await updateInvoice(invoice.id, { offer_status: 'expired', stripe_checkout_session_id: null, stripe_checkout_url: null })
    return NextResponse.redirect(new URL(`/proposal/${encodeURIComponent(token)}?payment=offer-expired`, request.url))
  }

  const bookings = invoice.inquiry_id ? await listLuxorBookingsByInquiry(invoice.inquiry_id) : []
  const booking = invoice.booking_id
    ? await getLuxorBooking(invoice.booking_id)
    : bookings.find((item) => item.invoice_id === invoice.id)
  if (invoice.proposal_context?.proposal_record_type === 'proposal_breakdown' && (!invoice.proposal_accepted_at || booking?.contract_status !== 'signed')) return NextResponse.redirect(new URL('/payment/cancelled', request.url))
  if (!booking || booking.contract_status !== 'signed') {
    return NextResponse.redirect(new URL(`/proposal/${encodeURIComponent(token)}?payment=contract-required`, request.url))
  }
  if (invoice.invoice_kind !== 'deposit' && invoice.invoice_kind !== 'final_balance' && invoice.invoice_kind !== 'security_deposit') {
    return NextResponse.redirect(new URL(`/proposal/${encodeURIComponent(token)}?payment=payment-link-required`, request.url))
  }

  const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
  if (!inquiry || inquiry.status === 'closed_lost' || inquiry.is_test) return NextResponse.redirect(new URL('/payment/cancelled', request.url))

  const checkout = await createLuxorPostContractCheckout({
    invoice,
    inquiry,
    booking,
    origin: new URL(request.url).origin,
    paymentAmount: Number(invoice.payment_requested_amount || invoice.total),
    paymentLabel: invoice.payment_requested_label || (invoice.invoice_kind === 'security_deposit' ? 'Refundable security deposit' : 'Final event balance'),
    masterInvoiceId: invoice.parent_invoice_id || booking.invoice_id || undefined,
  })
  if (!checkout) return NextResponse.redirect(new URL('/payment/success', request.url))

  let checkoutUrl: URL
  try {
    checkoutUrl = new URL(checkout.checkoutUrl)
  } catch {
    return NextResponse.redirect(new URL('/payment/cancelled', request.url))
  }
  if (checkoutUrl.protocol !== 'https:' || (checkoutUrl.hostname !== 'stripe.com' && !checkoutUrl.hostname.endsWith('.stripe.com'))) {
    return NextResponse.redirect(new URL('/payment/cancelled', request.url))
  }
  if (!invoice.stripe_checkout_opened_at) await updateInvoice(invoice.id, { stripe_checkout_opened_at: new Date().toISOString() })
  return NextResponse.redirect(checkoutUrl)
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await getInvoiceByPublicToken(token)
  if (!invoice || invoice.status === 'cancelled') {
    return NextResponse.redirect(new URL('/payment/cancelled', request.url))
  }
  if (invoice.invoice_kind !== 'deposit') return openExistingNonDepositCheckout(request, token, invoice)
  if (isLuxorBookingDepositPaused()) return new Response('Booking deposit payments are temporarily unavailable. Please contact Luxor before attempting payment.', { status: 503, headers: { 'cache-control': 'no-store' } })
  const action = `/api/public/proposals/${encodeURIComponent(token)}/checkout`
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Secure payment | Luxor Event Space</title></head><body style="font-family:Arial,sans-serif;background:#faf8f3;color:#242018;margin:0;padding:2rem"><main style="max-width:36rem;margin:10vh auto;background:white;padding:2rem;border:1px solid #e9dec8"><h1 style="font-family:Georgia,serif">Continue to secure payment</h1><p>When you are ready to pay, continue to Stripe. Your date is confirmed after the booking payment is received.</p><form method="post" action="${action}"><button type="submit" style="background:#b99558;color:#17120c;border:0;padding:1rem 1.5rem;font-weight:bold;cursor:pointer">Continue to payment</button></form></main></body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' },
  })
}

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const redirect = (url: URL) => NextResponse.redirect(url, 303)
  const { token } = await params
  const invoice = await getInvoiceByPublicToken(token)
  if (!invoice || invoice.status === 'cancelled') {
    return redirect(new URL('/payment/cancelled', _request.url))
  }
  if (invoice.invoice_kind !== 'deposit') return new Response('Only booking deposit payments can be opened from this form.', { status: 405, headers: { 'cache-control': 'no-store' } })
  if (invoice.invoice_kind === 'deposit' && isLuxorBookingDepositPaused()) return new Response('Booking deposit payments are temporarily unavailable. Please contact Luxor before attempting payment.', { status: 503, headers: { 'cache-control': 'no-store' } })
  if (isLuxorOfferExpired(invoice)) {
    // An offer deadline does not prove that a provider session is unpaid or
    // terminal. Keep its identity for reconciliation.
    await updateInvoice(invoice.id, { offer_status: 'expired' })
    return redirect(new URL(`/proposal/${encodeURIComponent(token)}?payment=offer-expired`, _request.url))
  }

  const bookings = invoice.inquiry_id ? await listLuxorBookingsByInquiry(invoice.inquiry_id) : []
  const booking = invoice.booking_id
    ? await getLuxorBooking(invoice.booking_id)
    : bookings.find((item) => item.invoice_id === invoice.id)
  if (invoice.proposal_context?.proposal_record_type === 'proposal_breakdown' && (!invoice.proposal_accepted_at || booking?.contract_status !== 'signed')) return redirect(new URL('/payment/cancelled', _request.url))
  if (!booking || booking.contract_status !== 'signed') {
    return redirect(new URL(`/proposal/${encodeURIComponent(token)}?payment=contract-required`, _request.url))
  }
  if (invoice.invoice_kind !== 'deposit' && invoice.invoice_kind !== 'final_balance' && invoice.invoice_kind !== 'security_deposit') {
    return redirect(new URL(`/proposal/${encodeURIComponent(token)}?payment=payment-link-required`, _request.url))
  }

  const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
  if (!inquiry || inquiry.status === 'closed_lost' || inquiry.is_test) return redirect(new URL('/payment/cancelled', _request.url))

  const origin = new URL(_request.url).origin
  let checkout
  try {
    checkout = await createLuxorPostContractCheckout({
      invoice,
      inquiry,
      booking,
      origin,
      paymentAmount: Number(invoice.payment_requested_amount || invoice.total),
      paymentLabel: invoice.payment_requested_label || (invoice.invoice_kind === 'deposit' ? 'Initial booking payment' : invoice.invoice_kind === 'security_deposit' ? 'Refundable security deposit' : 'Final event balance'),
      masterInvoiceId: invoice.parent_invoice_id || booking.invoice_id || undefined,
    })
  } catch (error) {
    console.error('Could not open secure booking payment:', error)
    return new Response('We could not open the secure payment. Please contact Luxor before trying again.', {
      status: 409, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
  if (!checkout) return redirect(new URL('/payment/success', _request.url))

  let checkoutUrl: URL
  try {
    checkoutUrl = new URL(checkout.checkoutUrl)
  } catch {
    return redirect(new URL('/payment/cancelled', _request.url))
  }

  if (checkoutUrl.protocol !== 'https:' || (checkoutUrl.hostname !== 'stripe.com' && !checkoutUrl.hostname.endsWith('.stripe.com'))) {
    return redirect(new URL('/payment/cancelled', _request.url))
  }

  if (!invoice.stripe_checkout_opened_at) {
    await updateInvoice(invoice.id, { stripe_checkout_opened_at: new Date().toISOString() })
  }

  return redirect(checkoutUrl)
}
