import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { LuxorInquiry, LuxorInvoice } from './luxorInquiryTypes'

const money = (value: number) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function buildLuxorInvoicePdf(invoice: LuxorInvoice, inquiry?: LuxorInquiry | null) {
  const pdf = await PDFDocument.create()
  let page = pdf.addPage([612, 792])
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const gold = rgb(0.73, 0.54, 0.24)
  const ink = rgb(0.12, 0.11, 0.1)
  const muted = rgb(0.42, 0.4, 0.37)
  const margin = 54
  let y = 728

  const draw = (text: string, x: number, size = 10, font = regular, color = ink) => {
    page.drawText(text, { x, y, size, font, color })
  }
  const newPage = () => {
    page = pdf.addPage([612, 792])
    y = 730
  }

  draw('LUXOR', margin, 26, bold, gold)
  y -= 22
  draw('EVENT SPACE', margin, 9, bold, muted)
  draw(invoice.status === 'draft' ? 'PROPOSAL' : 'INVOICE', 455, 18, bold, ink)
  y -= 42
  page.drawLine({ start: { x: margin, y }, end: { x: 558, y }, thickness: 1, color: gold })
  y -= 30
  draw('PREPARED FOR', margin, 8, bold, muted)
  draw('DOCUMENT', 360, 8, bold, muted)
  y -= 17
  draw(invoice.client_name, margin, 13, bold)
  draw(`#${invoice.id.slice(0, 8).toUpperCase()}`, 360, 10, regular)
  y -= 17
  draw(inquiry?.email || '', margin, 10, regular, muted)
  draw(`Created ${new Date(invoice.created_at).toLocaleDateString('en-US')}`, 360, 10, regular, muted)
  y -= 17
  draw([invoice.event_type, inquiry?.target_date].filter(Boolean).join(' - '), margin, 10, regular, muted)
  if (invoice.due_date) draw(`Due ${new Date(invoice.due_date).toLocaleDateString('en-US')}`, 360, 10, regular, muted)
  y -= 38

  draw('SERVICE', margin, 8, bold, muted)
  draw('QTY', 400, 8, bold, muted)
  draw('PRICE', 455, 8, bold, muted)
  draw('TOTAL', 520, 8, bold, muted)
  y -= 12
  page.drawLine({ start: { x: margin, y }, end: { x: 558, y }, thickness: 0.6, color: rgb(0.8, 0.79, 0.76) })
  y -= 22

  for (const item of invoice.line_items || []) {
    if (y < 120) newPage()
    const label = item.description.length > 56 ? `${item.description.slice(0, 53)}...` : item.description
    draw(label, margin, 10, regular)
    draw(String(item.quantity), 405, 10, regular)
    draw(money(item.unitPrice), 455, 10, regular)
    draw(money(item.total), 515, 10, bold)
    y -= 25
  }

  y -= 8
  page.drawLine({ start: { x: 360, y }, end: { x: 558, y }, thickness: 0.6, color: rgb(0.8, 0.79, 0.76) })
  y -= 22
  draw('Subtotal', 400, 10, regular, muted)
  draw(money(invoice.subtotal), 510, 10, regular)
  y -= 20
  draw(`Tax (${(Number(invoice.tax_rate || 0) * 100).toFixed(2)}%)`, 400, 10, regular, muted)
  draw(money(invoice.total - invoice.subtotal), 510, 10, regular)
  y -= 25
  draw('TOTAL', 400, 11, bold)
  draw(money(invoice.total), 510, 12, bold, gold)

  if (invoice.notes) {
    y -= 48
    draw('NOTES', margin, 8, bold, muted)
    y -= 18
    for (const line of invoice.notes.match(/.{1,88}(?:\s|$)/g) || [invoice.notes]) {
      draw(line.trim(), margin, 9, regular, muted)
      y -= 14
    }
  }

  page.drawText('Luxor Event Space - 1934 Pendleton Dr, Garland, TX 75041', { x: margin, y: 36, size: 8, font: regular, color: muted })
  return pdf.save()
}
