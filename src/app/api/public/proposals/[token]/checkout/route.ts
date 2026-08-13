import { NextResponse } from 'next/server'
import { getInvoiceByPublicToken, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorBooking, listLuxorBookingsByInquiry } from '@/lib/luxorBookingsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createLuxorPostContractCheckout } from '@/lib/luxorStripeCheckoutServer'
import { isLuxorOfferExpired } from '@/lib/luxorOffer'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await getInvoiceByPublicToken(token)
  if (!invoice || invoice.status === 'cancelled') {
    return NextResponse.redirect(new URL('/payment/cancelled', _request.url))
  }
  if (isLuxorOfferExpired(invoice)) {
    await updateInvoice(invoice.id, { offer_status: 'expired', stripe_checkout_session_id: null, stripe_checkout_url: null })
    return NextResponse.redirect(new URL(`/proposal/${encodeURIComponent(token)}?payment=offer-expired`, _request.url))
  }

  const bookings = invoice.inquiry_id ? await listLuxorBookingsByInquiry(invoice.inquiry_id) : []
  const booking = invoice.booking_id
    ? await getLuxorBooking(invoice.booking_id)
    : bookings.find((item) => item.invoice_id === invoice.id)
  if (!booking || booking.contract_status !== 'signed') {
    return NextResponse.redirect(new URL(`/proposal/${encodeURIComponent(token)}?payment=contract-required`, _request.url))
  }
  if (invoice.invoice_kind !== 'deposit' && invoice.invoice_kind !== 'final_balance') {
    return NextResponse.redirect(new URL(`/proposal/${encodeURIComponent(token)}?payment=payment-link-required`, _request.url))
  }

  const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
  if (!inquiry || inquiry.status === 'closed_lost') return NextResponse.redirect(new URL('/payment/cancelled', _request.url))

  const origin = new URL(_request.url).origin
  const checkout = await createLuxorPostContractCheckout({
    invoice,
    inquiry,
    booking,
    origin,
    paymentAmount: Number(invoice.payment_requested_amount || invoice.total),
    paymentLabel: invoice.payment_requested_label || (invoice.invoice_kind === 'deposit' ? 'Reservation payment and refundable security deposit' : 'Final event balance'),
    masterInvoiceId: invoice.parent_invoice_id || booking.invoice_id || undefined,
  })
  if (!checkout) return NextResponse.redirect(new URL('/payment/success', _request.url))

  let checkoutUrl: URL
  try {
    checkoutUrl = new URL(checkout.checkoutUrl)
  } catch {
    return NextResponse.redirect(new URL('/payment/cancelled', _request.url))
  }

  if (checkoutUrl.protocol !== 'https:' || (checkoutUrl.hostname !== 'stripe.com' && !checkoutUrl.hostname.endsWith('.stripe.com'))) {
    return NextResponse.redirect(new URL('/payment/cancelled', _request.url))
  }

  if (!invoice.stripe_checkout_opened_at) {
    await updateInvoice(invoice.id, { stripe_checkout_opened_at: new Date().toISOString() })
  }

  return NextResponse.redirect(checkoutUrl)
}
