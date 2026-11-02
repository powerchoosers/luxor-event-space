import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { assertLuxorProductionSideEffectsAllowed } from '@/lib/luxorTestLeadServer'
import { buildLuxorPaymentReceiptPdf } from '@/lib/luxorPaymentReceiptPdf'
import { queueLuxorTransactionalNotice } from '@/lib/luxorTransactionalNoticeServer'
import type { LuxorPayment } from '@/lib/luxorInquiryTypes'

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const { id } = await params
    const [payment] = await supabaseRest<LuxorPayment[]>(`luxor_payments?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
    if (!payment) return NextResponse.json({ error: 'Payment record not found.' }, { status: 404 })
    if (payment.status !== 'paid') return NextResponse.json({ error: 'A receipt can only be emailed for a confirmed paid transaction.' }, { status: 409 })

    const [booking, inquiry, invoice] = await Promise.all([
      payment.booking_id ? getLuxorBooking(payment.booking_id) : Promise.resolve(null),
      payment.inquiry_id ? getLuxorInquiry(payment.inquiry_id) : Promise.resolve(null),
      payment.invoice_id ? getInvoice(payment.invoice_id) : Promise.resolve(null),
    ])
    const resolvedInquiry = inquiry || (booking?.inquiry_id ? await getLuxorInquiry(booking.inquiry_id) : null)
    if (resolvedInquiry?.is_test) await assertLuxorProductionSideEffectsAllowed(resolvedInquiry.id)
    const recipient = resolvedInquiry?.email || booking?.email || null
    if (!recipient) return NextResponse.json({ error: 'No client email is saved for this payment.' }, { status: 409 })

    const pdf = await buildLuxorPaymentReceiptPdf({ payment, booking, inquiry: resolvedInquiry, invoice })
    const clientName = resolvedInquiry?.full_name || booking?.client_name || 'there'
    const greetingName = clientName.split(/\s+/)[0] || 'there'
    const job = await queueLuxorTransactionalNotice({
      kind: 'payment_receipt',
      sourceId: payment.id,
      inquiryId: resolvedInquiry?.id || payment.inquiry_id,
      bookingId: booking?.id || payment.booking_id,
      recipient,
      subject: 'Your Luxor payment receipt',
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#2e261e"><p>Luxor at Las Palmas Events</p><h1>Payment received</h1><p>Hi ${escapeHtml(greetingName)},</p><p>We recorded your payment of <strong>${escapeHtml(money(Number(payment.amount || 0)))}</strong> by ${escapeHtml(payment.payment_method || 'the method on file')} on ${escapeHtml(new Date(payment.paid_at || payment.created_at).toLocaleDateString('en-US', { dateStyle: 'long' }))}.</p><p>Your receipt is attached for your records. Please contact Luxor if you have questions about this transaction.</p></div>`,
      pdf,
      filename: `Luxor-Payment-Receipt-${payment.id.slice(0, 8).toUpperCase()}.pdf`,
      scheduledFor: new Date().toISOString(),
    })
    return NextResponse.json({ job }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment receipt email could not be queued.' }, { status: 500 })
  }
}
