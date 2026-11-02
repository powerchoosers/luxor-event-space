import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import { buildLuxorPaymentReceiptPdf } from '@/lib/luxorPaymentReceiptPdf'
import type { LuxorPayment } from '@/lib/luxorInquiryTypes'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const { id } = await params
    const [payment] = await supabaseRest<LuxorPayment[]>(`luxor_payments?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
    if (!payment) return NextResponse.json({ error: 'Payment record not found.' }, { status: 404 })
    if (payment.status !== 'paid') return NextResponse.json({ error: 'A receipt can only be created for a confirmed paid transaction.' }, { status: 409 })

    const [booking, inquiry, invoice] = await Promise.all([
      payment.booking_id ? getLuxorBooking(payment.booking_id) : Promise.resolve(null),
      payment.inquiry_id ? getLuxorInquiry(payment.inquiry_id) : Promise.resolve(null),
      payment.invoice_id ? getInvoice(payment.invoice_id) : Promise.resolve(null),
    ])
    const bytes = await buildLuxorPaymentReceiptPdf({ payment, booking, inquiry, invoice })
    const disposition = request.nextUrl.searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment'
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="Luxor-Receipt-${payment.id.slice(0, 8).toUpperCase()}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Receipt could not be created.' }, { status: 500 })
  }
}
