import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { LuxorInquiry, LuxorInvoice } from './luxorInquiryTypes'
import { LUXOR_VENUE_ADDRESS } from './luxorVenue'
import { formatLuxorOfferExpiry, hasLuxorOffer, luxorOfferSnapshot } from './luxorOffer'
import { getLuxorProposalPricingSummary } from './luxorProposalEmailServer'

const money = (value: number) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pageWidth = 612
const pageHeight = 792
const margin = 54
const contentRight = pageWidth - margin

function displayDate(value: string) {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function displayQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function safePdfText(value: unknown) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function safeMoney(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : fallback
}

export async function buildLuxorInvoicePdf(invoice: LuxorInvoice, inquiry?: LuxorInquiry | null) {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const paper = rgb(0.97, 0.955, 0.925)
  const ink = rgb(0.12, 0.105, 0.09)
  const muted = rgb(0.4, 0.36, 0.31)
  const paleMuted = rgb(0.62, 0.56, 0.47)
  const gold = rgb(0.72, 0.51, 0.2)
  const darkGold = rgb(0.48, 0.31, 0.1)
  const softGold = rgb(0.91, 0.84, 0.69)
  const white = rgb(0.99, 0.98, 0.95)
  const line = rgb(0.78, 0.72, 0.63)
  const summary = getLuxorProposalPricingSummary(invoice)
  const isFinalProposal = invoice.invoice_kind === 'event'
  const documentLabel = isFinalProposal ? 'FINAL EVENT PROPOSAL' : 'PAYMENT INVOICE'
  const invoiceTotal = Math.max(0, safeMoney(invoice.total, summary.finalEventPrice))
  let page = pdf.addPage([pageWidth, pageHeight])
  let pageNumber = 1
  let y = 674

  const text = (value: string, x: number, yPosition: number, size = 10, font = regular, color = ink) => {
    page.drawText(safePdfText(value), { x, y: yPosition, size, font, color })
  }

  const rightText = (value: string, right: number, yPosition: number, size = 10, font = regular, color = ink) => {
    const visible = safePdfText(value)
    page.drawText(visible, { x: right - font.widthOfTextAtSize(visible, size), y: yPosition, size, font, color })
  }

  const wrap = (value: string, font = regular, size = 10, width = 200) => {
    const words = safePdfText(value).split(' ').filter(Boolean)
    if (!words.length) return ['']
    const lines: string[] = []
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= width || !current) {
        current = candidate
      } else {
        lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
    return lines
  }

  const drawLines = (lines: string[], x: number, yPosition: number, size = 10, font = regular, color = ink, leading = size + 3) => {
    lines.forEach((lineText, index) => text(lineText, x, yPosition - index * leading, size, font, color))
  }

  const drawChrome = (continuation = false) => {
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: paper })
    page.drawRectangle({ x: 0, y: 704, width: pageWidth, height: 88, color: ink })
    text('LUXOR', margin, 748, 25, serifBold, gold)
    text('AT LAS PALMAS EVENTS', margin + 1, 731, 7.5, bold, softGold)
    rightText(documentLabel, contentRight, 745, 8.5, bold, softGold)
    rightText(continuation ? 'PACKAGE BREAKDOWN CONTINUED' : `PROPOSAL #${invoice.id.slice(0, 8).toUpperCase()}`, contentRight, 728, 7.5, regular, white)
    page.drawLine({ start: { x: margin, y: 55 }, end: { x: contentRight, y: 55 }, thickness: 0.6, color: line })
    text(`Luxor Event Space - ${LUXOR_VENUE_ADDRESS}`, margin, 38, 7.5, regular, muted)
    rightText(`Page ${pageNumber}`, contentRight, 38, 7.5, regular, muted)
    y = 674
  }

  const startNewPage = (continuation = false) => {
    page = pdf.addPage([pageWidth, pageHeight])
    pageNumber += 1
    drawChrome(continuation)
  }

  const ensureSpace = (height: number, continuation = false) => {
    if (y - height < 76) startNewPage(continuation)
  }

  const drawTableHeader = () => {
    page.drawRectangle({ x: margin, y: y - 18, width: contentRight - margin, height: 18, color: rgb(0.88, 0.84, 0.76) })
    text('CATEGORY', margin + 6, y - 12, 7, bold, muted)
    text('SERVICE', 145, y - 12, 7, bold, muted)
    rightText('QTY', 380, y - 12, 7, bold, muted)
    rightText('UNIT PRICE', 459, y - 12, 7, bold, muted)
    rightText('LINE TOTAL', contentRight - 6, y - 12, 7, bold, muted)
    y -= 27
  }

  const drawSummaryRow = (label: string, value: string, options: { accent?: boolean; strong?: boolean; topBorder?: boolean } = {}) => {
    if (options.topBorder) page.drawLine({ start: { x: margin + 16, y: y + 6 }, end: { x: contentRight - 16, y: y + 6 }, thickness: 0.8, color: line })
    const font = options.strong ? bold : regular
    const color = options.accent ? gold : muted
    const amountColor = options.accent ? darkGold : ink
    text(label, margin + 20, y - 7, options.strong ? 10 : 9.5, font, color)
    rightText(value, contentRight - 20, y - 7, options.strong ? 14 : 10, options.strong ? serifBold : bold, amountColor)
    y -= options.strong ? 30 : 22
  }

  drawChrome()

  text(isFinalProposal ? 'A FINAL PACKAGE FOR YOUR CELEBRATION' : 'PAYMENT DETAILS', margin, y, 8, bold, gold)
  y -= 27
  text(isFinalProposal ? 'Your Luxor Event Proposal' : 'Your Luxor Payment Invoice', margin, y, 28, serifBold, ink)
  y -= 25
  const preparedFor = safePdfText(invoice.client_name || inquiry?.full_name || 'Luxor client')
  const eventLine = [invoice.event_type, inquiry?.target_date ? displayDate(inquiry.target_date) : null].filter(Boolean).join(' - ') || 'Private event at Luxor Event Space'
  const leftDetails = [
    { label: 'PREPARED FOR', value: preparedFor },
    { label: 'EVENT', value: eventLine },
  ]
  const rightDetails = [
    { label: 'CREATED', value: displayDate(invoice.created_at) },
    { label: isFinalProposal ? 'SELECTED PACKAGE' : 'INVOICE', value: summary.packageName || `#${invoice.id.slice(0, 8).toUpperCase()}` },
  ]
  const topDetailsY = y
  const drawDetailColumn = (items: Array<{ label: string; value: string }>, x: number, width: number) => {
    let columnY = topDetailsY
    for (const item of items) {
      text(item.label, x, columnY, 7, bold, paleMuted)
      const valueLines = wrap(item.value, regular, 9.5, width)
      drawLines(valueLines, x, columnY - 13, 9.5, regular, ink, 12)
      columnY -= 23 + (valueLines.length - 1) * 12
    }
    return columnY
  }
  const leftBottom = drawDetailColumn(leftDetails, margin, 246)
  const rightBottom = drawDetailColumn(rightDetails, 348, 210)
  y = Math.min(leftBottom, rightBottom) - 11

  if (isFinalProposal && (summary.expectedGuestCount !== null || summary.eventAccess)) {
    ensureSpace(48)
    page.drawRectangle({ x: margin, y: y - 40, width: contentRight - margin, height: 40, color: rgb(0.94, 0.91, 0.84) })
    const guestText = summary.expectedGuestCount === null ? null : `${displayQuantity(summary.expectedGuestCount)} guests`
    const eventAccess = summary.eventAccess || null
    text('EVENT DETAILS', margin + 12, y - 13, 7, bold, paleMuted)
    text([guestText, eventAccess].filter(Boolean).join(' | '), margin + 12, y - 28, 10, regular, ink)
    y -= 58
  }

  ensureSpace(42)
  text(isFinalProposal ? 'FINAL PACKAGE BREAKDOWN' : 'INVOICE BREAKDOWN', margin, y, 8, bold, gold)
  y -= 13
  drawTableHeader()

  if (!summary.lines.length) {
    text('Your finalized package details are available in the secure proposal.', margin, y - 5, 10, regular, muted)
    y -= 31
  }

  for (const item of summary.lines) {
    const categoryLines = wrap(item.category.toUpperCase(), bold, 7.5, 80)
    const serviceLines = wrap(item.service, regular, 9.2, 200)
    const rowHeight = Math.max(categoryLines.length * 10, serviceLines.length * 12, 12) + 16
    if (y - rowHeight < 76) {
      startNewPage(true)
      drawTableHeader()
    }
    drawLines(categoryLines, margin + 6, y - 11, 7.5, bold, muted, 10)
    drawLines(serviceLines, 145, y - 11, 9.2, regular, ink, 12)
    const included = item.included && item.lineTotal === 0
    rightText(displayQuantity(item.quantity), 380, y - 11, 9, regular, muted)
    rightText(included ? 'Included' : money(item.unitPrice), 459, y - 11, 8.6, included ? regular : bold, included ? gold : ink)
    rightText(included ? 'Included' : money(item.lineTotal), contentRight - 6, y - 11, 9, bold, included ? gold : ink)
    page.drawLine({ start: { x: margin, y: y - rowHeight }, end: { x: contentRight, y: y - rowHeight }, thickness: 0.45, color: line })
    y -= rowHeight
  }

  ensureSpace(isFinalProposal ? 245 : 145, true)
  const summaryTop = y
  page.drawRectangle({ x: margin, y: summaryTop - (isFinalProposal ? 121 : 100), width: contentRight - margin, height: isFinalProposal ? 121 : 100, color: rgb(0.93, 0.9, 0.83), borderColor: line, borderWidth: 0.6 })
  text(isFinalProposal ? 'EVENT PRICE SUMMARY' : 'INVOICE SUMMARY', margin + 20, y - 12, 7.5, bold, paleMuted)
  y -= 23
  drawSummaryRow('Package subtotal', money(summary.subtotal))
  drawSummaryRow('Approved discount', summary.approvedDiscount > 0 ? `-${money(summary.approvedDiscount)}` : money(0))
  drawSummaryRow('Sales tax', money(summary.tax))
  drawSummaryRow(isFinalProposal ? 'FINAL EVENT PRICE' : 'INVOICE TOTAL', money(isFinalProposal ? summary.finalEventPrice : invoiceTotal), { accent: true, strong: true, topBorder: true })

  if (isFinalProposal || summary.refundableSecurityDeposit > 0) {
    ensureSpace(116, true)
    const depositTop = y
    page.drawRectangle({ x: margin, y: depositTop - 96, width: contentRight - margin, height: 96, color: rgb(0.16, 0.13, 0.1), borderColor: gold, borderWidth: 0.8 })
    text('REFUNDABLE SECURITY DEPOSIT', margin + 16, depositTop - 20, 8, bold, softGold)
    rightText(money(summary.refundableSecurityDeposit), contentRight - 16, depositTop - 25, 20, serifBold, white)
    const depositCopy = 'Held separately under the event agreement. This refundable deposit is not part of the Final Event Price and is not a service charge.'
    drawLines(wrap(depositCopy, regular, 8.8, 410), margin + 16, depositTop - 44, 8.8, regular, softGold, 11)
    y -= 112
  }

  if (isFinalProposal) {
    ensureSpace(120, true)
    text('PAYMENT SUMMARY', margin, y, 8, bold, gold)
    y -= 18
    page.drawRectangle({ x: margin, y: y - 53, width: contentRight - margin, height: 53, color: rgb(0.94, 0.91, 0.84), borderColor: line, borderWidth: 0.6 })
    text('Final Event Price', margin + 14, y - 18, 9.5, regular, muted)
    rightText(money(summary.finalEventPrice), contentRight - 14, y - 18, 10, bold, ink)
    text('Refundable Security Deposit', margin + 14, y - 36, 9.5, regular, muted)
    rightText(money(summary.refundableSecurityDeposit), contentRight - 14, y - 36, 10, bold, ink)
    y -= 70
    if (summary.amountDueToBook !== null) {
      ensureSpace(37, true)
      page.drawRectangle({ x: margin, y: y - 29, width: contentRight - margin, height: 29, color: rgb(0.16, 0.13, 0.1) })
      text('AMOUNT DUE TO BOOK', margin + 12, y - 19, 8, bold, softGold)
      rightText(money(summary.amountDueToBook), contentRight - 12, y - 20, 12, serifBold, white)
      y -= 44
    } else {
      ensureSpace(36, true)
      drawLines(wrap('No payment is requested with this proposal. Luxor sends the secure payment link after the event agreement is signed.', regular, 8.8, contentRight - margin), margin, y - 5, 8.8, regular, muted, 11)
      y -= 37
    }
  }

  if (hasLuxorOffer(invoice)) {
    ensureSpace(48, true)
    const offer = luxorOfferSnapshot(invoice)
    const offerFinalPrice = isFinalProposal ? summary.finalEventPrice : offer.discountedTotal
    const originalOfferPrice = isFinalProposal ? offerFinalPrice + offer.savings : offer.originalTotal
    text('APPROVED OFFER', margin, y, 8, bold, gold)
    y -= 14
    text(`Original ${money(originalOfferPrice)} | Final ${money(offerFinalPrice)} | Savings ${money(offer.savings)}`, margin, y, 8.5, regular, muted)
    y -= 15
    if (offer.expiresAt) {
      drawLines(wrap(`This final proposal price is secured when the agreement and required payment are complete by ${formatLuxorOfferExpiry(offer.expiresAt) || offer.expiresAt}.`, regular, 8.2, contentRight - margin), margin, y, 8.2, regular, muted, 10)
      y -= 24
    }
  }

  if (invoice.notes) {
    const noteLines = wrap(invoice.notes, regular, 8.8, contentRight - margin)
    ensureSpace(30 + noteLines.length * 11, true)
    text('ADDITIONAL NOTES', margin, y, 8, bold, gold)
    y -= 15
    drawLines(noteLines, margin, y, 8.8, regular, muted, 11)
  }

  return pdf.save()
}
