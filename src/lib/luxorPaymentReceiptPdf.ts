import 'server-only'

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { LuxorBooking, LuxorInquiry, LuxorInvoice, LuxorPayment } from './luxorInquiryTypes'
import { LUXOR_TOUR_LOCATION } from './luxorTourPlanningServer'

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
const pdfText = (value: unknown) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[\u2010-\u2015\u2212]/g, '-')
  .replace(/\u00B7/g, '-')
  .replace(/[^\x20-\x7E]/g, '')

function appliedTo(payment: LuxorPayment, invoice: LuxorInvoice | null) {
  const allocations = payment.metadata?.installment_allocations
  if (Array.isArray(allocations) && allocations.length) {
    const detail = allocations.map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const label = String(row.label || (row.installment_order ? `Installment ${row.installment_order}` : 'Installment'))
      const amount = Number(row.amount)
      return `${label}${Number.isFinite(amount) ? ` (${money(amount)})` : ''}`
    })
    return detail.join(', ')
  }
  const kind = String(payment.metadata?.payment_kind || '').replaceAll('_', ' ').trim()
  return kind || invoice?.description || 'Event payment'
}

export async function buildLuxorPaymentReceiptPdf(input: {
  payment: LuxorPayment
  booking: LuxorBooking | null
  inquiry: LuxorInquiry | null
  invoice: LuxorInvoice | null
}) {
  const { payment, booking, inquiry, invoice } = input
  if (payment.status !== 'paid') throw new Error('A receipt can only be created for a confirmed paid transaction.')
  const pdf = await PDFDocument.create()
  const receivedAt = new Date(payment.received_date ? `${payment.received_date}T12:00:00Z` : payment.paid_at || payment.created_at)
  pdf.setCreationDate(receivedAt)
  pdf.setModificationDate(receivedAt)
  pdf.setProducer('Luxor at Las Palmas Events')
  pdf.setCreator('Luxor at Las Palmas Events')
  const page = pdf.addPage([612, 792])
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const ink = rgb(0.18, 0.14, 0.11)
  const muted = rgb(0.43, 0.37, 0.31)
  const gold = rgb(0.68, 0.48, 0.18)
  const pale = rgb(0.98, 0.96, 0.92)
  const draw = (text: string, x: number, y: number, size = 11, font = regular, color = ink) =>
    page.drawText(pdfText(text).slice(0, 100), { x, y, size, font, color, maxWidth: 484 })

  page.drawRectangle({ x: 0, y: 720, width: 612, height: 72, color: pale })
  draw('LUXOR AT LAS PALMAS EVENTS', 54, 755, 12, bold, gold)
  draw('PAYMENT RECEIPT', 54, 704, 23, serif, ink)
  page.drawLine({ start: { x: 54, y: 688 }, end: { x: 558, y: 688 }, thickness: 1, color: gold })
  draw(`Receipt ${payment.id.slice(0, 8).toUpperCase()}`, 54, 659, 12, bold)
  draw(`Received ${payment.received_date || new Date(payment.paid_at || payment.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' })}`, 54, 638, 10, regular, muted)
  page.drawRectangle({ x: 54, y: 548, width: 504, height: 66, color: pale })
  draw(money(Number(payment.amount || 0)), 72, 574, 25, serif, ink)
  draw('AMOUNT RECEIVED', 72, 558, 8, bold, muted)
  const rows: Array<[string, string]> = [
    ['Client', inquiry?.full_name || booking?.client_name || 'Not recorded'],
    ['Event', [invoice?.event_type || booking?.event_type, booking?.event_date ? new Date(`${booking.event_date}T12:00:00`).toLocaleDateString('en-US', { dateStyle: 'long' }) : null].filter(Boolean).join(' - ') || 'Not recorded'],
    ['Payment method', payment.payment_method || 'Not recorded'],
    ['Applied to', appliedTo(payment, invoice)],
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
  draw(LUXOR_TOUR_LOCATION, 54, 68, 8, regular, muted)
  return new Uint8Array(await pdf.save())
}
