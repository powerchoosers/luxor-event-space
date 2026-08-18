import { NextRequest, NextResponse } from 'next/server'
import { getLuxorBooking } from '@/lib/luxorBookingsServer'
import { ensureLuxorDepositInvoice, getInvoice, listPaidPaymentsByInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { createLuxorPostContractCheckout } from '@/lib/luxorStripeCheckoutServer'

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { bookingId } = await request.json().catch(() => ({})) as { bookingId?: string }
    const booking = bookingId ? await getLuxorBooking(bookingId) : null
    if (!booking || booking.contract_status !== 'signed' || booking.status === 'cancelled') return NextResponse.json({ error: 'A signed active booking is required before opening card payment.' }, { status: 409 })
    const [masterInvoice, inquiry] = await Promise.all([booking.invoice_id ? getInvoice(booking.invoice_id) : null, booking.inquiry_id ? getLuxorInquiry(booking.inquiry_id) : null])
    if (!masterInvoice || !inquiry || inquiry.status === 'closed_lost') return NextResponse.json({ error: 'This booking no longer has an active payment record.' }, { status: 409 })
    const invoice = await ensureLuxorDepositInvoice({ masterInvoice, bookingId: booking.id, reservationDepositAmount: booking.deposit_required })
    const paid = await listPaidPaymentsByInvoice(invoice.id)
    const paidTotal = paid.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    if (paidTotal + 0.005 >= Number(invoice.total || 0)) return NextResponse.json({ error: 'The initial booking payment is already recorded.' }, { status: 409 })
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, '')
    const checkout = await createLuxorPostContractCheckout({ invoice, inquiry, booking, origin, masterInvoiceId: masterInvoice.id })
    if (!checkout) return NextResponse.json({ error: 'No booking payment remains.' }, { status: 409 })
    return NextResponse.json({ checkoutUrl: checkout.checkoutUrl, amount: checkout.paymentAmount, label: checkout.paymentLabel })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to open secure card payment.' }, { status: 500 })
  }
}
