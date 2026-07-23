import 'server-only'

import crypto from 'crypto'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { LuxorBooking, LuxorSignatureRequest } from './luxorInquiryTypes'
import { LUXOR_VENUE_ADDRESS } from './luxorVenue'

const gold = rgb(0.73, 0.54, 0.24)
const ink = rgb(0.12, 0.105, 0.09)
const muted = rgb(0.42, 0.38, 0.32)
const cream = rgb(0.97, 0.94, 0.88)
const margin = 52

function money(value: number) {
  return `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function displayDate(value?: string | null) {
  if (!value) return 'To be confirmed'
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function parseClientName(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  const people = normalized.split(/\s+(?:&|and)\s+|\s*\/\s*|\s*;\s*/i).map((name) => name.trim()).filter(Boolean)
  const primary = people[0] || normalized
  const parts = primary.split(' ').filter(Boolean)
  return {
    fullName: normalized,
    firstName: parts[0] || normalized,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
    additionalNames: people.slice(1),
  }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate
    else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

async function createWriter(title: string, subtitle: string) {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic)
  let page: PDFPage
  let y = 0
  const addPage = () => {
    page = pdf.addPage([612, 792])
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: cream })
    page.drawRectangle({ x: 0, y: 756, width: 612, height: 36, color: ink })
    page.drawText('LUXOR', { x: margin, y: 768, size: 15, font: bold, color: gold })
    page.drawText('AT LAS PALMAS EVENTS', { x: 442, y: 770, size: 6.5, font: bold, color: cream })
    page.drawText('Luxor Event Space  |  ' + LUXOR_VENUE_ADDRESS, { x: margin, y: 24, size: 7.5, font: regular, color: muted })
    y = 716
    return page
  }
  addPage()
  page!.drawText(title, { x: margin, y, size: 26, font: serif, color: ink })
  y -= 22
  page!.drawText(subtitle.toUpperCase(), { x: margin, y, size: 8, font: bold, color: gold })
  y -= 28
  page!.drawLine({ start: { x: margin, y }, end: { x: 560, y }, thickness: 1, color: gold })
  y -= 24

  const ensure = (height = 50) => { if (y < 55 + height) addPage() }
  const heading = (text: string) => {
    ensure(34)
    page!.drawText(text.toUpperCase(), { x: margin, y, size: 9, font: bold, color: gold })
    y -= 18
  }
  const paragraph = (text: string, options: { bold?: boolean; indent?: number; size?: number } = {}) => {
    const font = options.bold ? bold : regular
    const size = options.size || 9.5
    const x = margin + (options.indent || 0)
    const lines = wrap(text, font, size, 560 - x)
    ensure(lines.length * 14 + 10)
    for (const line of lines) {
      page!.drawText(line, { x, y, size, font, color: ink })
      y -= 14
    }
    y -= 7
  }
  const field = (label: string, value: string, x: number, width: number) => {
    page!.drawText(label.toUpperCase(), { x, y, size: 7, font: bold, color: muted })
    page!.drawText(value || 'Not provided', { x, y: y - 16, size: 10, font: regular, color: ink, maxWidth: width })
  }
  return { pdf, regular, bold, serif, script, get page() { return page! }, get y() { return y }, set y(value: number) { y = value }, addPage, ensure, heading, paragraph, field }
}

export async function buildLuxorContractPdf(booking: LuxorBooking, requestId: string) {
  const names = parseClientName(booking.client_name)
  const w = await createWriter('Event Space Agreement', `Agreement ${requestId.slice(0, 8).toUpperCase()}`)
  w.field('Client', names.fullName, margin, 230)
  w.field('Event date', displayDate(booking.event_date), 330, 210)
  w.y -= 44
  w.field('Event type', booking.event_type || 'Private event', margin, 230)
  w.field('Estimated guests', booking.guest_count ? String(booking.guest_count) : 'To be confirmed', 330, 210)
  w.y -= 50

  w.heading('1. Reservation and event details')
  w.paragraph(`Luxor Event Space agrees to reserve the venue for ${names.fullName} for the event described above, subject to this agreement, the attached package details, and venue rules. Event access, setup, event, and cleanup times must remain within the times approved in the booking record.`)
  w.heading('2. Price and payment')
  w.paragraph(`The current contract total is ${money(booking.contract_total)}. The reservation deposit is ${money(booking.deposit_required)}. The event date is not secured until Luxor confirms receipt of the required deposit. Remaining balances and any refundable security deposit are due on the dates shown in the client invoice or payment schedule.`)
  w.heading('3. Guest count and use of space')
  w.paragraph(`The current estimate is ${booking.guest_count || 'not yet confirmed'} guests. The client is responsible for an accurate final count, lawful conduct, and compliance with posted capacity, safety, alcohol, smoking, decoration, vendor, and cleanup rules. No illegal activity, weapons, open flame, or unapproved alterations are permitted.`)
  w.heading('4. Vendors, damage, and cleanup')
  w.paragraph('Outside vendors must follow Luxor access instructions and provide required licenses or insurance when requested. The client is responsible for damage, extraordinary cleaning, missing property, overtime, and rule violations caused by the client, guests, or vendors, except for ordinary wear and conditions caused by Luxor.')
  w.heading('5. Changes, cancellation, and force majeure')
  w.paragraph('Date, time, package, or scope changes require written approval. Cancellation, rescheduling, refund, and credit terms shown in the accepted proposal or payment schedule become part of this agreement. Neither party is liable for delay or nonperformance caused by events beyond reasonable control; the parties will work in good faith on a reasonable reschedule or other written resolution.')
  w.heading('6. Electronic signatures and complete agreement')
  w.paragraph('The parties consent to electronic records and signatures. The client signature applies everywhere a client signature or initials would otherwise be required in this agreement. Luxor countersigns automatically after the client signs. This agreement, the accepted proposal, payment schedule, and Guest Guide form the complete event agreement; later changes must be in writing.')

  w.addPage()
  w.heading('Signature authorization')
  w.paragraph(`Client signer: ${names.fullName}  |  Email: ${booking.email || 'Not provided'}`)
  if (names.additionalNames.length) w.paragraph(`Additional named party${names.additionalNames.length > 1 ? 'ies' : ''}: ${names.additionalNames.join(', ')}`)
  w.paragraph('By selecting "Sign & complete agreement" in the secure portal, the client adopts the entered legal name as an electronic signature throughout this agreement. Luxor then applies Arianna’s authorized countersignature and creates the final execution certificate.')
  w.y -= 28
  w.page.drawLine({ start: { x: margin, y: w.y }, end: { x: 280, y: w.y }, thickness: 0.8, color: muted })
  w.page.drawLine({ start: { x: 330, y: w.y }, end: { x: 560, y: w.y }, thickness: 0.8, color: muted })
  w.y -= 18
  w.page.drawText('CLIENT ELECTRONIC SIGNATURE', { x: margin, y: w.y, size: 7.5, font: w.bold, color: muted })
  w.page.drawText('ARIANNA | LUXOR EVENT SPACE', { x: 330, y: w.y, size: 7.5, font: w.bold, color: muted })
  w.y -= 54
  w.heading('What happens next')
  w.paragraph('1. The client signs once in the secure portal.  2. Luxor countersigns automatically.  3. The client receives a clean executed PDF with a concise execution certificate.  4. Luxor receives an internal copy with the detailed audit timeline.')
  return w.pdf.save({ useObjectStreams: false })
}

export async function buildLuxorGuestGuidePdf(booking: LuxorBooking) {
  const w = await createWriter('Your Guest Guide', `${booking.event_type || 'Private event'} at Luxor Event Space`)
  w.paragraph(`Welcome, ${parseClientName(booking.client_name).firstName}. Keep this guide and share the practical sections with anyone helping coordinate your event.`)
  const sections = [
    ['Before your event', 'Confirm your final guest count, event timeline, vendor list, floor plan, decor plan, and remaining payments by the dates given by your coordinator. Send updates in writing so the booking record stays accurate.'],
    ['Arrival and access', 'Use only the arrival, setup, and loading times confirmed by Luxor. Vendors should know the venue address, a day-of contact, and where to unload. Do not block entrances, exits, fire lanes, or neighboring businesses.'],
    ['Decor and setup', 'Use venue-safe, removable materials. Confetti, glitter, nails, screws, staples, open flame, and anything that marks walls or floors require written approval. All decor and personal property must leave with your party.'],
    ['Food, beverage, and alcohol', 'Coordinate caterers and bar service in advance. Alcohol service must follow applicable licensing, age-verification, and service rules. Luxor may stop unsafe or unlawful service.'],
    ['Music, conduct, and safety', 'Follow venue volume, occupancy, and end-time requirements. Children must be supervised. Keep exits and safety equipment clear. Report spills, hazards, injuries, or damage immediately.'],
    ['Cleanup and departure', 'Remove personal items, decor, food, and vendor equipment within the approved time. Leave the space in the agreed condition. Overtime, damage, or extraordinary cleanup may result in additional charges.'],
    ['Questions or changes', 'Reply to your Luxor email thread so the full team can see the request. For time-sensitive event-day changes, contact the coordinator listed in your final timeline.'],
  ]
  for (const [heading, body] of sections) { w.heading(heading); w.paragraph(body) }
  w.heading('Event snapshot')
  w.paragraph(`Event date: ${displayDate(booking.event_date)}  |  Event type: ${booking.event_type || 'Private event'}  |  Estimated guests: ${booking.guest_count || 'TBD'}`)
  w.paragraph('This guide is a practical summary. The signed agreement, accepted proposal, and written coordinator instructions control if there is a conflict.')
  return w.pdf.save({ useObjectStreams: false })
}

export async function buildExecutedLuxorContract(input: {
  original: Uint8Array
  signature: LuxorSignatureRequest
  clientName: string
  clientEmail: string
  clientSignedAt: string
  ownerName: string
  ownerEmail: string
  ownerSignedAt: string
  events: Array<{ created_at: string; event_type: string; ip_address?: string | null; user_agent?: string | null }>
}) {
  const originalHash = crypto.createHash('sha256').update(input.original).digest('hex')
  const addCertificate = async (detailed: boolean) => {
    const pdf = await PDFDocument.load(input.original)
    const regular = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const script = await pdf.embedFont(StandardFonts.TimesRomanItalic)
    const page = pdf.addPage([612, 792])
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: cream })
    page.drawRectangle({ x: 0, y: 736, width: 612, height: 56, color: ink })
    page.drawText('LUXOR  |  EXECUTION CERTIFICATE', { x: margin, y: 758, size: 15, font: bold, color: gold })
    page.drawText('This certificate is part of the fully executed Event Space Agreement.', { x: margin, y: 700, size: 10, font: regular, color: ink })
    const clientSignatureSize = Math.min(24, 205 / script.widthOfTextAtSize(input.clientName, 1))
    const ownerSignatureSize = Math.min(24, 205 / script.widthOfTextAtSize(input.ownerName, 1))
    page.drawText(input.clientName, { x: margin, y: 636, size: clientSignatureSize, font: script, color: ink })
    page.drawLine({ start: { x: margin, y: 624 }, end: { x: 280, y: 624 }, thickness: 0.8, color: muted })
    page.drawText(`Client | ${input.clientEmail}`, { x: margin, y: 606, size: 8.5, font: regular, color: muted })
    page.drawText(`Signed ${new Date(input.clientSignedAt).toISOString()}`, { x: margin, y: 590, size: 8.5, font: regular, color: muted })
    page.drawText(input.ownerName, { x: 330, y: 636, size: ownerSignatureSize, font: script, color: ink })
    page.drawLine({ start: { x: 330, y: 624 }, end: { x: 560, y: 624 }, thickness: 0.8, color: muted })
    page.drawText(`Owner, Luxor Event Space | ${input.ownerEmail}`, { x: 330, y: 606, size: 8.5, font: regular, color: muted })
    page.drawText(`Countersigned ${new Date(input.ownerSignedAt).toISOString()}`, { x: 330, y: 590, size: 8.5, font: regular, color: muted })
    page.drawText('DOCUMENT VERIFICATION', { x: margin, y: 530, size: 9, font: bold, color: gold })
    const hashLines = [`Request ID: ${input.signature.id}`, `Original SHA-256: ${originalHash.slice(0, 32)}`, `                 ${originalHash.slice(32)}`]
    hashLines.forEach((line, index) => page.drawText(line, { x: margin, y: 505 - index * 18, size: 8.5, font: regular, color: ink }))
    let y = 444
    page.drawText(detailed ? 'DETAILED AUDIT TIMELINE' : 'EXECUTION TIMELINE', { x: margin, y, size: 9, font: bold, color: gold })
    y -= 22
    const events = detailed ? input.events : input.events.filter((event) => ['sent', 'viewed', 'signed', 'owner_countersigned', 'completed'].includes(event.event_type))
    for (const event of events.slice(0, detailed ? 8 : 5)) {
      const detail = detailed ? ` | IP ${event.ip_address || 'not captured'} | ${(event.user_agent || 'device not captured').slice(0, 58)}` : ''
      const line = `${new Date(event.created_at).toISOString()}  ${event.event_type.replaceAll('_', ' ').toUpperCase()}${detail}`
      for (const wrapped of wrap(line, regular, 7.8, 508)) { page.drawText(wrapped, { x: margin, y, size: 7.8, font: regular, color: ink }); y -= 13 }
      y -= 5
    }
    page.drawText('Electronic signatures apply to the entire agreement and all signature locations.', { x: margin, y: 54, size: 8, font: regular, color: muted })
    const bytes = await pdf.save({ useObjectStreams: false })
    return { bytes, hash: crypto.createHash('sha256').update(bytes).digest('hex'), originalHash }
  }
  return { customer: await addCertificate(false), audit: await addCertificate(true) }
}
