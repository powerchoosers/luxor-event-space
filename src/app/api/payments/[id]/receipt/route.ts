import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import type { LuxorPayment } from '@/lib/luxorInquiryTypes'

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

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
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([612, 792])
    const regular = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const serif = await pdf.embedFont(StandardFonts.TimesRoman)
    const ink = rgb(0.18, 0.14, 0.11)
    const muted = rgb(0.43, 0.37, 0.31)
    const gold = rgb(0.68, 0.48, 0.18)
    const pale = rgb(0.98, 0.96, 0.92)
    const draw = (text: string, x: number, y: number, size = 11, font = regular, color = ink) => page.drawText(text.slice(0, 100), { x, y, size, font, color, maxWidth: 484 })
    page.drawRectangle({ x: 0, y: 720, width: 612, height: 72, color: pale })
    draw('LUXOR AT LAS PALMAS EVENTS', 54, 755, 12, bold, gold)
    draw('PAYMENT RECEIPT', 54, 704, 23, serif, ink)
    page.drawLine({ start: { x: 54, y: 688 }, end: { x: 558, y: 688 }, thickness: 1, color: gold })
    draw(`Receipt ${payment.id.slice(0, 8).toUpperCase()}`, 54, 659, 12, bold)
    draw(`Received ${new Date(payment.paid_at || payment.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`, 54, 638, 10, regular, muted)
    page.drawRectangle({ x: 54, y: 548, width: 504, height: 66, color: pale })
    draw(money(Number(payment.amount || 0)), 72, 574, 25, serif, ink)
    draw('AMOUNT RECEIVED', 72, 558, 8, bold, muted)
    const rows: Array<[string, string]> = [
      ['Client', inquiry?.full_name || booking?.client_name || 'Not recorded'],
      ['Event', [invoice?.event_type || booking?.event_type, booking?.event_date ? new Date(`${booking.event_date}T12:00:00`).toLocaleDateString('en-US', { dateStyle: 'long' }) : null].filter(Boolean).join(' · ') || 'Not recorded'],
      ['Payment method', payment.payment_method || 'Not recorded'],
      ['Applied to', String(payment.metadata?.payment_kind || payment.metadata?.description || invoice?.description || 'Event payment').replaceAll('_', ' ')],
      ['Transaction reference', payment.processor_reference || payment.id],
      ['Invoice', invoice ? invoice.id.slice(0, 8).toUpperCase() : 'Not linked'],
    ]
    let y = 510
    rows.forEach(([label, value]) => {
      draw(label.toUpperCase(), 54, y, 8, bold, muted)
      draw(value, 220, y, 11, regular, ink)
      page.drawLine({ start: { x: 54, y: y - 12 }, end: { x: 558, y: y - 12 }, thickness: 0.5, color: rgb(0.91, 0.87, 0.81) })
      y -= 42
    })
    draw('This receipt confirms the recorded transaction above. It does not create a new payment obligation.', 54, 214, 9, regular, muted)
    draw('Luxor at Las Palmas Events · 9800 N 103rd Ave, Peoria, AZ 85345', 54, 68, 8, regular, muted)

    const bytes = await pdf.save()
    const disposition = request.nextUrl.searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment'
    return new NextResponse(new Uint8Array(bytes), {
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
