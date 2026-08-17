import 'server-only'

import crypto from 'crypto'
import fontkit from '@pdf-lib/fontkit'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from 'pdf-lib'
import type { LuxorBooking, LuxorSignatureRequest } from './luxorInquiryTypes'
import { LUXOR_VENUE_ADDRESS } from './luxorVenue'
import type { LuxorContractSignaturePlacement } from './luxorSignaturePlacement'
import { formatLuxorDate } from './luxorDateFormatting'

const gold = rgb(0.67, 0.47, 0.20)
const paleGold = rgb(0.92, 0.85, 0.72)
const ink = rgb(0.13, 0.11, 0.09)
const muted = rgb(0.42, 0.38, 0.32)
const cream = rgb(0.985, 0.972, 0.945)
const soft = rgb(0.955, 0.93, 0.885)
const margin = 52
const pageWidth = 612
const pageHeight = 792
const contentWidth = 508

type UnknownRecord = Record<string, unknown>

type ContractProposalLine = {
  category: string | null
  description: string
  quantity: number
}

type ContractPromotion = {
  name: string
  amount: number
}

type ContractProposalSummary = {
  lines: ContractProposalLine[]
  subtotal: number | null
  discount: number
  tax: number | null
  finalEventPrice: number
  promotion: ContractPromotion | null
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function recordFrom(value: unknown) {
  return isRecord(value) ? value : null
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function moneyValue(value: unknown) {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : null
}

function recordValue(record: UnknownRecord | null, ...keys: string[]) {
  if (!record) return undefined
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return undefined
}

function promotionFromContext(context: UnknownRecord, metadata: UnknownRecord, discount: number): ContractPromotion | null {
  if (discount <= 0.004) return null
  const pricingSnapshot = recordFrom(context.pricing_snapshot)
  const pricingSelection = recordFrom(context.pricing_selection)
  const candidates = [
    recordFrom(context.promotion_snapshot),
    recordFrom(context.promotionSnapshot),
    recordFrom(context.promotion),
    recordFrom(pricingSnapshot?.promotion_snapshot),
    recordFrom(pricingSnapshot?.promotionSnapshot),
    recordFrom(pricingSnapshot?.promotion),
    recordFrom(pricingSelection?.promotion_snapshot),
    recordFrom(pricingSelection?.promotionSnapshot),
    recordFrom(pricingSelection?.promotion),
    recordFrom(metadata.proposalPromotion),
    recordFrom(metadata.proposal_promotion),
  ]
  const promotion = candidates.find((candidate): candidate is UnknownRecord => Boolean(candidate)) ?? null
  const name = textValue(recordValue(promotion, 'name', 'promotion_name', 'promotionName'))
    ?? textValue(recordValue(context, 'promotion_name', 'promotionName'))
    ?? 'Promotion discount'
  return { name, amount: discount }
}

/**
 * Contracts only receive the booking record, so the accepted immutable
 * proposal context is carried in booking metadata. This reader intentionally
 * avoids live pricing records and keeps the signed agreement aligned with the
 * exact proposal the client accepted.
 */
function proposalSummaryForBooking(booking: LuxorBooking): ContractProposalSummary {
  const metadata = recordFrom(booking.metadata) || {}
  const context = recordFrom(metadata.final_proposal_context)
    ?? recordFrom(metadata.finalProposalContext)
    ?? {}
  const pricingSnapshot = recordFrom(context.pricing_snapshot)
    ?? recordFrom(context.pricingSnapshot)
    ?? {}
  const rawLines = Array.isArray(pricingSnapshot.line_items)
    ? pricingSnapshot.line_items
    : Array.isArray(metadata.proposalLineItems)
      ? metadata.proposalLineItems
      : []
  const lines = rawLines.flatMap((value): ContractProposalLine[] => {
    const line = recordFrom(value)
    if (!line) return []
    const description = textValue(line.description)
    if (!description) return []
    const category = textValue(line.category)
    const pricingRole = textValue(line.pricingRole)?.toLowerCase() || ''
    const paymentBucket = textValue(line.paymentBucket)?.toLowerCase() || ''
    const searchable = `${category || ''} ${description}`.toLowerCase()
    const hiddenLine = pricingRole === 'discount' || pricingRole === 'tax' || paymentBucket === 'security_deposit'
      || /refundable\s+security\s+deposit|(^|\s)(sales\s+)?tax($|\s)|discount|credit|promotion/.test(searchable)
    if (hiddenLine) return []
    const rawQuantity = moneyValue(line.quantity)
    return [{ category, description, quantity: rawQuantity === null || rawQuantity < 1 ? 1 : rawQuantity }]
  })
  const discount = moneyValue(pricingSnapshot.discount_amount ?? pricingSnapshot.discountAmount ?? context.discount_amount ?? context.discountAmount) ?? 0
  const subtotal = moneyValue(pricingSnapshot.subtotal ?? pricingSnapshot.original_subtotal ?? context.original_subtotal ?? context.subtotal)
  const tax = moneyValue(pricingSnapshot.tax_amount ?? pricingSnapshot.taxAmount ?? context.tax_amount ?? context.taxAmount)
  const finalEventPrice = Math.max(0, Number(booking.contract_total || context.final_event_price || 0))
  return {
    lines,
    subtotal,
    discount,
    tax,
    finalEventPrice,
    promotion: promotionFromContext(context, metadata, discount),
  }
}

function money(value: number) {
  return `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function displayDate(value?: string | null) {
  if (!value) return 'To be confirmed'
  return formatLuxorDate(value) || value
}

function displaySignatureDate(value: string) {
  const formatted = formatLuxorDate(value)
  if (!formatted) throw new Error('A valid signature timestamp is required.')
  return formatted
}

function displayTime(value?: string | null) {
  if (!value) return 'To be confirmed'
  const [hoursText, minutesText = '00'] = value.split(':')
  const hours = Number(hoursText)
  if (!Number.isFinite(hours)) return value
  const suffix = hours >= 12 ? 'PM' : 'AM'
  return `${hours % 12 || 12}:${minutesText.slice(0, 2)} ${suffix}`
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

async function loadLogo(pdf: PDFDocument) {
  try {
    const bytes = await fs.readFile(path.join(process.cwd(), 'public', 'luxor-portal-mark-gold-tight.png'))
    return await pdf.embedPng(bytes)
  } catch {
    return null
  }
}

async function createWriter(documentLabel: string) {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic)
  const logo = await loadLogo(pdf)
  let page: PDFPage
  let y = 0

  const drawHeader = (target: PDFPage) => {
    target.drawRectangle({ x: 0, y: 734, width: pageWidth, height: 58, color: ink })
    if (logo) target.drawImage(logo, { x: margin, y: 746, width: 34, height: 34 })
    target.drawText('LUXOR', { x: logo ? 96 : margin, y: 760, size: 15, font: bold, color: paleGold })
    target.drawText('AT LAS PALMAS EVENTS', { x: logo ? 96 : margin, y: 749, size: 6.5, font: bold, color: cream })
    const labelWidth = bold.widthOfTextAtSize(documentLabel, 7)
    target.drawText(documentLabel, { x: pageWidth - margin - labelWidth, y: 755, size: 7, font: bold, color: paleGold })
  }

  const addPage = () => {
    page = pdf.addPage([pageWidth, pageHeight])
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: cream })
    drawHeader(page)
    y = 704
    return page
  }
  addPage()

  const ensure = (height = 50) => {
    if (y < 66 + height) addPage()
  }

  const title = (text: string, subtitle?: string) => {
    page!.drawText(text, { x: margin, y, size: 25, font: serifBold, color: ink })
    y -= 21
    if (subtitle) {
      page!.drawText(subtitle.toUpperCase(), { x: margin, y, size: 7.5, font: bold, color: gold })
      y -= 18
    }
    page!.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: gold })
    y -= 22
  }

  const heading = (text: string) => {
    ensure(34)
    page!.drawText(text.toUpperCase(), { x: margin, y, size: 9.6, font: bold, color: gold })
    y -= 20
  }

  const subheading = (text: string) => {
    ensure(28)
    page!.drawText(text, { x: margin, y, size: 11.6, font: serifBold, color: ink })
    y -= 19
  }

  const paragraph = (text: string, options: { bold?: boolean; size?: number; gap?: number; indent?: number } = {}) => {
    const font = options.bold ? bold : regular
    const size = options.size || 9.7
    const x = margin + (options.indent || 0)
    const lines = wrap(text, font, size, pageWidth - margin - x)
    ensure(lines.length * 14 + 9)
    for (const line of lines) {
      page!.drawText(line, { x, y, size, font, color: ink })
      y -= 14
    }
    y -= options.gap ?? 7
  }

  const bullet = (text: string) => {
    const lines = wrap(text, regular, 9.35, contentWidth - 16)
    ensure(lines.length * 13.5 + 6)
    page!.drawCircle({ x: margin + 3, y: y + 3, size: 1.6, color: gold })
    for (const line of lines) {
      page!.drawText(line, { x: margin + 14, y, size: 9.35, font: regular, color: ink })
      y -= 13.5
    }
    y -= 4
  }

  const checklistItem = (text: string) => {
    const lines = wrap(text, regular, 9.35, contentWidth - 26)
    ensure(lines.length * 13.5 + 6)
    page!.drawLine({ start: { x: margin + 1, y: y + 1 }, end: { x: margin + 4, y: y - 2 }, thickness: 1.1, color: gold })
    page!.drawLine({ start: { x: margin + 4, y: y - 2 }, end: { x: margin + 10, y: y + 4 }, thickness: 1.1, color: gold })
    for (const line of lines) {
      page!.drawText(line, { x: margin + 17, y, size: 9.35, font: regular, color: ink })
      y -= 13.5
    }
    y -= 4
  }

  const fieldPair = (leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) => {
    ensure(48)
    const half = 242
    for (const [x, label, value] of [[margin, leftLabel, leftValue], [318, rightLabel, rightValue]] as const) {
      page!.drawText(label.toUpperCase(), { x, y, size: 6.8, font: bold, color: muted })
      page!.drawText(value || 'Not provided', { x, y: y - 17, size: 10.4, font: regular, color: ink, maxWidth: half })
      page!.drawLine({ start: { x, y: y - 21 }, end: { x: x + half, y: y - 21 }, thickness: 0.45, color: paleGold })
    }
    y -= 46
  }

  const feeRow = (label: string, value: string) => {
    ensure(27)
    page!.drawText(label, { x: margin, y, size: 8.6, font: regular, color: ink, maxWidth: 330 })
    const valueWidth = bold.widthOfTextAtSize(value, 8.6)
    page!.drawText(value, { x: pageWidth - margin - valueWidth, y, size: 8.6, font: bold, color: ink })
    page!.drawLine({ start: { x: margin, y: y - 8 }, end: { x: pageWidth - margin, y: y - 8 }, thickness: 0.35, color: paleGold })
    y -= 27
  }

  const note = (text: string) => {
    const lines = wrap(text, regular, 9.15, contentWidth - 24)
    ensure(lines.length * 12 + 24)
    const height = lines.length * 12 + 18
    page!.drawRectangle({ x: margin, y: y - height + 7, width: contentWidth, height, color: soft, borderColor: paleGold, borderWidth: 0.5 })
    let lineY = y - 7
    for (const line of lines) {
      page!.drawText(line, { x: margin + 12, y: lineY, size: 9.15, font: regular, color: ink })
      lineY -= 12
    }
    y -= height + 5
  }

  const finish = async () => {
    const pages = pdf.getPages()
    pages.forEach((target, index) => {
      target.drawLine({ start: { x: margin, y: 43 }, end: { x: pageWidth - margin, y: 43 }, thickness: 0.45, color: paleGold })
      target.drawText(`Luxor Event Space  |  ${LUXOR_VENUE_ADDRESS}`, { x: margin, y: 25, size: 7.2, font: regular, color: muted })
      const pageText = `${index + 1} / ${pages.length}`
      target.drawText(pageText, { x: pageWidth - margin - regular.widthOfTextAtSize(pageText, 7.2), y: 25, size: 7.2, font: regular, color: muted })
    })
    return pdf.save({ useObjectStreams: false })
  }

  return {
    pdf,
    regular,
    bold,
    serif,
    serifBold,
    script,
    logo: logo as PDFImage | null,
    get page() { return page! },
    get y() { return y },
    set y(value: number) { y = value },
    addPage,
    ensure,
    title,
    heading,
    subheading,
    paragraph,
    bullet,
    checklistItem,
    fieldPair,
    feeRow,
    note,
    finish,
  }
}

export async function buildLuxorContractPdf(booking: LuxorBooking, requestId: string, agreementDate = new Date().toISOString()) {
  const finalPaymentDueDate = typeof booking.final_payment_due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(booking.final_payment_due_date)
    ? booking.final_payment_due_date
    : null
  if (!finalPaymentDueDate) {
    throw new Error('Configure the final payment due date in the approved payment plan before generating an Event Agreement.')
  }
  const names = parseClientName(booking.client_name)
  const balance = Math.max(0, Number(booking.contract_total || 0) - Number(booking.deposit_required || 0))
  const proposalSummary = proposalSummaryForBooking(booking)
  const securityDeposit = Math.max(0, Number(booking.security_deposit_amount ?? 750))
  const w = await createWriter('BOOKING AGREEMENT')

  // Page 1 - Parties and event details
  w.title('Booking Agreement', `Agreement ${requestId.slice(0, 8).toUpperCase()}`)
  w.note('This Booking Agreement incorporates the Luxor Venue Policies & Guest Guide. By signing, the Client acknowledges receipt of the Guide and agrees to ensure that guests and vendors comply with it.')
  w.y -= 14
  w.heading('1. Client information')
  w.fieldPair('Client / contract holder', names.fullName, 'Email', booking.email || 'Not provided')
  w.y -= 10
  w.fieldPair('Phone', booking.phone || 'Not provided', 'Additional named party', names.additionalNames.join(', ') || 'None')
  w.y -= 18
  w.heading('2. Event information')
  w.fieldPair('Agreement date', displayDate(agreementDate), 'Event date', displayDate(booking.event_date))
  w.fieldPair('Event type', booking.event_type || 'Private event', 'Email', booking.email || 'Not provided')
  w.y -= 10
  w.fieldPair('Event time', `${displayTime(booking.start_time)} - ${displayTime(booking.end_time)}`, 'Expected guest count', `${booking.guest_count || 'To be confirmed'} (maximum 200)`)
  w.y -= 10
  w.fieldPair('Package', booking.package_name || 'Custom venue booking', 'Event purpose', booking.event_type || 'Private celebration')
  w.y -= 14
  w.paragraph('The Event may be conducted only for the purpose shown above. Any material change in event type, purpose, attendance, or public admission requires Luxor\'s prior written approval and may require updated pricing, insurance, security, permits, or a revised agreement.')
  w.paragraph('The approved rental period covers all client and vendor access. Guest arrival, entertainment, service, cleanup, and removal must remain within the start and end times shown above unless Luxor approves a written change.')

  // Page 2 - Pricing and payment
  w.addPage()
  w.title('Package, pricing & payment', 'Financial terms')
  w.heading('3. Contract price')
  w.subheading('Final event price')
  const displaySubtotal = proposalSummary.subtotal ?? Math.max(0, proposalSummary.finalEventPrice - (proposalSummary.tax || 0) + proposalSummary.discount)
  w.feeRow('Package subtotal', money(displaySubtotal))
  if (proposalSummary.discount > 0.004) w.feeRow(proposalSummary.promotion?.name || 'Promotion discount', `-${money(proposalSummary.discount)}`)
  if (proposalSummary.tax !== null) w.feeRow('Sales tax', money(proposalSummary.tax))
  w.feeRow('Final Event Price', money(proposalSummary.finalEventPrice))
  w.fieldPair('Initial booking payment', money(booking.deposit_required), 'Remaining balance', money(balance))
  w.fieldPair('Final payment due', displayDate(finalPaymentDueDate), 'Payment timing', 'After agreement signature')
  w.fieldPair('Refundable security deposit', money(securityDeposit), 'Security deposit due', 'Separate payment after signed agreement')
  if (proposalSummary.promotion) w.paragraph(`${proposalSummary.promotion.name} is already reflected in the locked Final Event Price for this Agreement. The secure booking-payment link is sent only after this Agreement is signed.`)
  if (proposalSummary.lines.length) {
    w.subheading('Accepted package')
    for (const item of proposalSummary.lines) {
      const quantity = item.quantity > 1 ? ` (Qty ${Number.isInteger(item.quantity) ? item.quantity : item.quantity.toLocaleString('en-US', { maximumFractionDigits: 2 })})` : ''
      w.checklistItem(`${item.category ? `${item.category}: ` : ''}${item.description}${quantity}`)
    }
  }
  w.paragraph(`The event date is not reserved until the initial booking payment and separate refundable security deposit have been received after this Agreement has been fully executed. The remaining event balance is due by ${displayDate(finalPaymentDueDate)} as shown above.`)
  w.paragraph('Luxor accepts the payment methods shown on the invoice or payment request. Returned checks are subject to a $35.00 fee.')
  w.paragraph('Payments not received by the due date may incur a late fee equal to five percent (5%) of the overdue amount or $50.00, whichever is greater. Nonpayment may suspend planning services or result in cancellation of the Event.')
  w.paragraph('The Client agrees not to initiate a chargeback for amounts properly due under this Agreement. An unauthorized chargeback is a material breach, and the Client remains responsible for unpaid balances, chargeback fees, and reasonable collection costs to the extent permitted by Texas law.')
  w.heading('Security deposit')
  w.paragraph(`Client shall pay the separate ${money(securityDeposit)} refundable security deposit after this Agreement is signed. It is a separate payment from the initial booking payment. The security deposit is held throughout the event period and secures Client obligations under this Agreement. It may be applied toward authorized charges, including property damage, excessive cleaning, missing or damaged Venue property, overtime, false alarm or emergency-response charges, prohibited materials, policy violations, and other authorized Event-related costs.`)
  w.paragraph('Luxor may inspect and document the Premises and Venue property before, during, and after the Event. If deductions are necessary, Luxor may provide Client with an itemized statement. Any undisputed remaining security-deposit balance will be returned within fourteen (14) business days following the Event, subject to any pending damage, repair, insurance, or other authorized claim that reasonably requires additional time to determine. If authorized charges exceed the security deposit, Client remains responsible for the full remaining balance; the security deposit does not limit Client liability.')
  w.heading('Overtime and additional charges')
  w.paragraph('Overtime is not guaranteed and depends on venue availability. If approved or incurred because the Client, guests, vendors, equipment, or property remain after the contracted rental period, overtime is billed at $150.00 per 30-minute increment and is due upon invoice.')
  w.paragraph('Excessive cleaning, damage, repairs, replacement costs, false alarm charges, administrative fees, and other authorized charges may be deducted from the security deposit or invoiced separately. The Guest Guide fee schedule provides common examples; actual repair or replacement cost controls when it is higher.')
  w.paragraph('Any balance remaining after the Event, including overtime, damage, cleaning, missing property, or other authorized charges, is due when invoiced. The security deposit does not limit the Client\'s responsibility for amounts that exceed it.')

  // Page 3 - Cancellation and risk
  w.addPage()
  w.title('Cancellation, liability & insurance', 'Client responsibilities')
  w.heading('4. Cancellation and rescheduling')
  w.paragraph('All payments applied to the Event Price under this Agreement, including the initial booking payment, are non-refundable. The separate refundable security deposit is governed by the Security deposit section above. Luxor reserves the event date exclusively for the Client and may decline other booking opportunities for that date.')
  w.y -= 8
  w.paragraph('Rescheduling requests must be submitted in writing and are subject to Luxor approval and date availability. An approved reschedule is subject to a $250.00 administrative fee, and the Client is responsible for any increase in pricing for the new date. Approval is not guaranteed.')
  w.y -= 8
  w.paragraph('If Luxor cannot host the Event for reasons within its reasonable control, Luxor may reschedule the Event or refund payments received, less amounts for services already performed or expenses already incurred for the Client.')
  w.y -= 18
  w.heading('5. Liability and insurance')
  w.paragraph('The Client is responsible for the conduct of all guests, vendors, contractors, entertainers, and invitees, and for damage, injury, loss, overtime, or additional cleaning resulting from their actions, except to the extent caused by Luxor.')
  w.y -= 8
  w.paragraph('The Client must obtain special event liability insurance with minimum coverage of $1,000,000 per occurrence and provide proof of coverage no later than fourteen (14) days before the Event. When alcoholic beverages will be present or served, the policy must provide coverage applicable to alcohol-related exposure, including host liquor liability or equivalent coverage when available and applicable. Luxor may require additional coverage, endorsements, or certificates from Client or vendors based on the nature, size, or risk of the Event.')
  w.y -= 8
  w.paragraph('Luxor is not responsible for loss, theft, or damage to personal property, vehicles, vendor equipment, rentals, or items left at the Venue. The Client is responsible for coordinating delivery, setup, removal, and return of all outside property.')
  w.y -= 8
  w.paragraph('To the extent permitted by law, the Client agrees to protect and reimburse Luxor from third-party claims, losses, or reasonable costs caused by the Client, guests, invitees, or vendors, except to the extent caused by Luxor\'s own negligence or willful misconduct.')
  w.y -= 18
  w.note('The Guest Guide contains the detailed access, vendor, decoration, alcohol, entertainment, damage, cleaning, and enforcement policies incorporated into this Agreement.')

  // Page 4 - Venue operations
  w.addPage()
  w.title('Venue operations', 'Rules incorporated from the Guest Guide')
  w.heading('6. Access, use and occupancy')
  w.bullet('The contracted rental period includes vendor load-in, setup, decorating, event time, cleanup, and breakdown unless Luxor approves otherwise in writing.')
  w.bullet('Maximum permitted occupancy is 200 persons total, including guests, Client representatives, vendors, contractors, entertainers, bartenders, security personnel, photographers, DJs, Venue personnel, and all other persons present, unless a lower limit is required by law, fire code, property management, or an applicable authority. Client must ensure the limit is not exceeded; Luxor may limit admission, require persons to leave, pause, or terminate the Event to maintain lawful and safe occupancy.')
  w.bullet('Children must be supervised. Fire lanes, exits, sidewalks, hallways, and neighboring business access must remain clear.')
  w.bullet('Illegal activity, illegal gambling, unsafe conduct, indoor smoking or vaping, illegal drugs, prohibited weapons, and unapproved ticket sales are not permitted.')
  w.heading('7. Vendors, decorations and entertainment')
  w.bullet('The Client must coordinate vendors and ensure they comply with arrival, insurance, safety, cleanup, and removal requirements. Luxor may deny access to a vendor who creates a legal, safety, or property concern.')
  w.bullet('Nails, screws, staples, tacks, tape, adhesive hooks, glue, glitter, confetti, fireworks, and unapproved special effects are prohibited. Hanging installations, cold sparks, fog, haze, inflatables, stages, truss systems, specialty lighting, and similar equipment require prior written approval.')
  w.bullet('Music and amplified sound must remain at a reasonable level and end at the approved time. Luxor may require volume, bass, speaker placement, or performance changes to protect guests, neighboring businesses, and lease compliance.')
  w.heading('8. BYOB, alcohol, damage and cleanup')
  w.bullet('Luxor is a private BYOB venue and does not sell, furnish, or provide alcohol. Because of Venue zoning restrictions, Luxor does not operate a cash bar or permit alcohol sales for on-premises consumption. Client/Event Host must provide all alcohol. Alcohol may not be sold, resold, exchanged for money, admission, donations, drink tickets, cover charges, tips conditioned on alcohol, or other compensation.')
  w.bullet('All alcohol must be distributed by a qualified bartender meeting Luxor requirements and any applicable legal or regulatory requirements, including current TABC seller/server certification when required by Luxor. Client arranges bartender service unless included in writing. Bartender compensation and voluntary gratuities are for labor only and may not be required, solicited, conditioned upon, or calculated from alcohol consumption or receipt.')
  w.bullet('The Client is responsible for lawful alcohol service and must not permit service to minors or visibly intoxicated persons. Luxor may immediately stop alcohol service, require alcohol removal, remove a bartender or person, require corrective action, contact property management or law enforcement, suspend, or terminate the Event when alcohol creates a safety, legal, insurance, or property risk.')
  w.bullet('The Client must remove personal property, decorations, food, beverages, rentals, and vendor equipment before the rental period ends. Excessive cleaning, damage, missing property, and false alarm costs may be charged to the Client.')
  w.note('Luxor may stop an unsafe or unlawful activity, remove a person or vendor, end alcohol service, or terminate the Event for a serious or repeated violation. Ending an Event does not cancel unpaid balances or responsibility for damage and cleanup.')
  w.heading('Venue operations, emergencies & documentation')
  w.paragraph('Luxor does not guarantee uninterrupted utilities, HVAC, lighting, Wi-Fi, audiovisual systems, parking, or other Venue services when interruption results from circumstances beyond Luxor’s reasonable control. Luxor will make reasonable efforts to address service interruptions within its control. Nothing in this provision limits any responsibility imposed on Luxor by applicable law for its own negligence or willful misconduct.')
  w.paragraph('Client, guests, vendors, contractors, entertainers, and invitees must immediately comply with reasonable instructions from Luxor staff, property management, shopping-center security, law enforcement, fire personnel, emergency medical personnel, and other emergency responders. Luxor may pause, relocate, evacuate, suspend, or terminate the Event when reasonably necessary to protect persons or property, address an emergency, comply with law, or follow emergency or property-management instructions. Client remains responsible for applicable Event-related costs caused by Client, guests, vendors, contractors, entertainers, or invitees to the extent permitted by law.')
  w.paragraph('Luxor may photograph, video, inspect, inventory, and otherwise document the condition of the Premises, furniture, fixtures, equipment, decorations, and Venue property before, during, and after the Event for operational, safety, insurance, damage assessment, policy enforcement, billing, and dispute-resolution purposes. Client is encouraged to photograph the Premises before setup and after removal of Client property.')

  // Page 5 - Legal and acknowledgements
  w.addPage()
  w.title('Legal terms & acknowledgements', 'Complete agreement')
  w.heading('9. Force majeure and legal terms')
  w.paragraph('Neither party is in breach for delay or nonperformance caused by severe weather, natural disaster, fire, utility outage, government order, public health emergency, civil unrest, terrorism, labor dispute, or another circumstance beyond reasonable control. Luxor will make reasonable efforts to reschedule, subject to availability, but is not responsible for third-party vendor, travel, lodging, or other indirect losses.')
  w.y -= 10
  w.paragraph('Texas law governs this Agreement. This Agreement, the Venue Policies & Guest Guide, accepted proposal, invoices, payment schedule, and attached addenda form the complete agreement and supersede prior discussions. If documents conflict, this Agreement controls unless a later written amendment signed by both parties states otherwise.')
  w.y -= 10
  w.paragraph('Changes must be in writing and signed by both parties. The Client may not assign this Agreement without Luxor\'s written consent. If one provision is invalid or unenforceable, the remaining provisions continue in effect. Electronic records, notices, and signatures have the same force as originals.')
  w.y -= 10
  w.paragraph('Notices and approvals may be delivered through the Client\'s Luxor email thread or another written channel accepted by both parties. Verbal discussions do not change this Agreement unless confirmed in a signed writing.')
  w.y -= 24
  w.heading('Client acknowledgements')
  w.bullet('I received and agree to the Venue Policies & Guest Guide incorporated into this Agreement.')
  w.y -= 6
  w.bullet('I understand the reservation payment and all other payments are subject to the cancellation and refund terms above.')
  w.y -= 6
  w.bullet('I will not exceed the maximum occupancy of 200 persons.')
  w.y -= 6
  w.bullet('I understand setup, event time, cleanup, and breakdown must fit within the contracted rental period and overtime may apply.')
  w.y -= 6
  w.bullet('I understand Luxor operates under a private BYOB policy and I am responsible for lawful alcohol service.')
  w.y -= 6
  w.bullet('I am responsible for guests and vendors, and for resulting damage, cleaning, overtime, and other authorized charges.')
  w.y -= 6
  w.bullet('I will obtain the required special event liability insurance and provide proof before the Event.')
  w.y -= 6
  w.bullet('I understand force majeure events are governed by this Agreement.')

  // Capture this page after all agreement clauses are laid out. The saved
  // placement moves with the document if later edits add or remove pages.
  w.addPage()
  w.title('Signatures', 'Electronic execution')
  w.paragraph('By signing below, the Client confirms that they have read, understood, and agree to this Booking Agreement, the Venue Policies & Guest Guide, and all incorporated proposals, invoices, schedules, exhibits, and addenda.')
  w.paragraph(`Client signer: ${names.fullName || 'To be completed'}  |  Email: ${booking.email || 'To be completed'}`)
  if (names.additionalNames.length) w.paragraph(`Additional named party${names.additionalNames.length > 1 ? 'ies' : ''}: ${names.additionalNames.join(', ')}`)

  const signatureY = 496
  w.page.drawLine({ start: { x: margin, y: signatureY }, end: { x: 280, y: signatureY }, thickness: 0.8, color: muted })
  w.page.drawLine({ start: { x: 330, y: signatureY }, end: { x: 560, y: signatureY }, thickness: 0.8, color: muted })
  w.page.drawText('CLIENT ELECTRONIC SIGNATURE', { x: margin, y: 480, size: 7.2, font: w.bold, color: muted })
  w.page.drawText('AUTHORIZED VENUE SIGNATURE', { x: 330, y: 480, size: 7.2, font: w.bold, color: muted })
  w.page.drawText(names.fullName, { x: margin, y: 458, size: 8.5, font: w.regular, color: ink, maxWidth: 228 })
  w.page.drawText('Patterson Elite Enterprises LLC', { x: 330, y: 458, size: 8.5, font: w.regular, color: ink, maxWidth: 230 })
  w.page.drawText('d/b/a Luxor at Las Palmas Events', { x: 330, y: 445, size: 8, font: w.regular, color: muted, maxWidth: 230 })
  w.page.drawLine({ start: { x: margin, y: 420 }, end: { x: 280, y: 420 }, thickness: 0.5, color: paleGold })
  w.page.drawLine({ start: { x: 330, y: 420 }, end: { x: 560, y: 420 }, thickness: 0.5, color: paleGold })
  w.page.drawText('DATE', { x: margin, y: 406, size: 6.8, font: w.bold, color: muted })
  w.page.drawText('DATE', { x: 330, y: 406, size: 6.8, font: w.bold, color: muted })
  w.page.drawText('Electronic signatures and electronic acceptance have the same legal force and effect as original handwritten signatures. The Client signs once in the secure portal; the signature is applied to this page and throughout the Agreement, and Luxor countersigns automatically.', { x: margin, y: 338, size: 8.8, font: w.regular, color: ink, maxWidth: contentWidth, lineHeight: 13 })
  w.page.drawRectangle({ x: margin, y: 236, width: contentWidth, height: 58, color: soft, borderColor: paleGold, borderWidth: 0.5 })
  w.page.drawText('DOCUMENT DELIVERY', { x: margin + 14, y: 276, size: 7, font: w.bold, color: gold })
  w.page.drawText('After execution, the Client receives a clean signed PDF. Luxor retains a separate audit copy', { x: margin + 14, y: 258, size: 8.4, font: w.regular, color: ink })
  w.page.drawText('containing the document hash and signing timeline.', { x: margin + 14, y: 245, size: 8.4, font: w.regular, color: ink })

  const signaturePlacement = {
    pageIndex: w.pdf.getPages().indexOf(w.page),
    client: { x: 52, y: 500, width: 228, height: 42 },
    owner: { x: 330, y: 500, width: 230, height: 42 },
  }
  return { pdf: await w.finish(), signaturePlacement }
}

const guestGuideSections = [
  {
    number: '1',
    title: 'Venue access & event operations',
    intro: 'The contracted rental period includes setup, decorating, vendor load-in, event time, cleanup, and breakdown unless the Booking Agreement says otherwise. Early, extended, or after-hours access requires written approval and may involve additional fees.',
    items: [
      ['Venue access', 'Clients, guests, and vendors may enter only during the contracted period. Luxor may access all areas for safety, security, maintenance, emergencies, or policy enforcement.'],
      ['Setup and breakdown', 'All setup, cleanup, and removal must finish before the rental period expires. Items left behind may be discarded, donated, stored, or removed at the Client\'s expense.'],
      ['Deliveries and loading', 'The Client coordinates vendor arrivals, deliveries, pickups, and load-out. Use designated entrances and keep fire lanes, sidewalks, exits, hallways, and common areas clear. Luxor is not responsible for accepting or storing deliveries.'],
      ['Overtime and final walkthrough', 'Remaining on the Premises after the contracted period triggers overtime at $150.00 per 30 minutes. Luxor may inspect for damage, excessive cleaning, missing property, and policy violations after the Event.'],
    ],
  },
  {
    number: '2',
    title: 'Event rules',
    intro: 'The Client is responsible for the behavior and compliance of all guests, vendors, contractors, entertainers, and invitees.',
    items: [
      ['Guest conduct and children', 'Disorderly, disruptive, illegal, dangerous, or abusive behavior is prohibited. Minors must be supervised by a responsible adult at all times. Luxor may remove individuals or end an Event for serious violations.'],
      ['Parking and neighboring businesses', 'Park only in designated areas. Do not block fire lanes, entrances, exits, loading areas, sidewalks, or neighboring businesses. Unauthorized vehicles may be towed at the owner\'s expense.'],
      ['Smoking, drugs and weapons', 'Smoking, vaping, electronic cigarettes, marijuana, and illegal drugs are prohibited indoors. Prohibited weapons, explosives, and dangerous items are not permitted except as required by applicable Texas law.'],
      ['Occupancy and event purpose', 'Maximum occupancy is 200 persons total, including guests, Client representatives, vendors, contractors, entertainers, bartenders, security personnel, photographers, DJs, Venue personnel, and all other persons present, unless a lower legal limit applies. Client must ensure this limit is not exceeded. Luxor may limit admission, require persons to leave, pause, or terminate the Event to maintain lawful and safe occupancy. Ticket sales, cover charges, public admission, or a material change in event type require prior written approval.'],
    ],
  },
  {
    number: '3',
    title: 'Vendors',
    intro: 'The Client selects, coordinates, and supervises all vendors. Preferred-vendor suggestions are a convenience and are not a guarantee of availability, pricing, quality, or performance.',
    items: [
      ['Outside vendors', 'Outside vendors are welcome unless the Booking Agreement says otherwise. Luxor may deny access to a vendor who fails to follow policies or creates a safety, legal, insurance, or property concern.'],
      ['Insurance and certificates', 'Luxor may require vendors to maintain commercial general liability insurance and submit a current Certificate of Insurance before the Event. The Client is responsible for obtaining requested certificates.'],
      ['Rentals and specialty equipment', 'The Client is responsible for outside furniture, linens, decor, staging, lighting, dance floors, audiovisual equipment, and rentals. Inflatables, rides, large equipment, or specialty installations require prior written approval and an appropriately insured vendor.'],
      ['Cleanup', 'Vendors must clean their work areas and remove equipment and materials before the rental period ends. The Client remains responsible for vendor-caused damage, overtime, excessive cleaning, and policy violations.'],
    ],
  },
  {
    number: '4',
    title: 'Decorations',
    intro: 'Decor should be beautiful, safe, removable, and protective of the Venue. Luxor may request plans or installation details and may remove anything that risks damage, blocks life-safety equipment, or violates fire code.',
    items: [
      ['Attachment methods', 'Do not use nails, screws, staples, tacks, push pins, tape, adhesive hooks, glue, or putty on walls, ceilings, floors, windows, furniture, columns, or fixtures. Nothing may attach to chandeliers, sprinklers, alarms, exit signs, cameras, televisions, speakers, or HVAC equipment without approval.'],
      ['Prohibited materials and flames', 'Loose glitter, confetti, artificial snow, powder or foam cannons, balloon or lantern releases, fireworks, pyrotechnics, handheld sparklers, smoke bombs, and open flames are prohibited. Enclosed candles require approval.'],
      ['Special effects and installations', 'Cold sparks, fog, haze, bubbles, hanging florals, ceiling installations, draping, arches, backdrops, stages, truss systems, specialty lighting, vehicles, and animals other than service animals require prior written approval.'],
      ['Removal', 'Remove all decor, florals, signs, rentals, and personal property before the contracted period ends. The Client is responsible for damage, false alarm charges, emergency response, and excessive cleaning caused by decor or special effects.'],
    ],
  },
  {
    number: '5',
    title: 'Private BYOB alcohol policy',
    intro: 'Luxor at Las Palmas Events is a private BYOB venue. Because of applicable Venue zoning restrictions, Luxor does not sell, furnish, distribute, or provide alcohol and does not operate a cash bar or other alcohol-sales service. Client/Event Host provides all alcohol for private Events and must comply with all laws, regulations, Venue requirements, and property rules.',
    items: [
      ['No alcohol sales', 'Alcohol may not be sold, resold, exchanged for money, admission, donations, drink tickets, cover charges, or other compensation. Luxor does not purchase, sell, furnish, or provide alcohol for Events.'],
      ['Required bartender', 'All alcohol must be distributed by a qualified bartender who meets Luxor requirements and applicable legal or regulatory requirements, including current TABC seller/server certification when required by Luxor. Client provides the bartender unless bartender service is included in the selected package or separately provided in writing. Luxor may require credentials before the Event.'],
      ['Bartender compensation & gratuity', 'Bartender compensation is for bartending and beverage-service labor only, not alcohol. Voluntary gratuities may be accepted for bartending labor, but cannot be required, solicited, conditioned upon, or calculated based on alcohol purchase, receipt, or consumption.'],
      ['Lawful alcohol service', 'Alcohol may not be served to minors or visibly intoxicated persons. The bartender must follow applicable alcohol-service requirements and may refuse service when appropriate. Client remains responsible for ensuring lawful, responsible service.'],
      ['Alcohol storage & service', 'Alcohol must remain within approved Event areas and may not be consumed in shopping-center common areas, parking areas, sidewalks, or other prohibited areas. Client and bartender must follow all Venue instructions regarding alcohol storage, service areas, cleanup, and removal.'],
      ['Enforcement', 'Luxor may immediately stop alcohol service, require alcohol removal, remove a bartender or person, require corrective action, contact property management or law enforcement, suspend, or terminate the Event when alcohol is sold, unlawfully provided, improperly served, or creates a safety, legal, insurance, or property risk. Client remains responsible for permitted alcohol-related damages, costs, penalties, emergency-response expenses, and cleaning.'],
    ],
  },
  {
    number: '6',
    title: 'Music & entertainment',
    intro: 'DJs, bands, musicians, performers, and audiovisual providers must work safely, professionally, and within the contracted rental period.',
    items: [
      ['Sound and bass', 'Music must remain at a reasonable level. Because Luxor is in a multi-tenant center, excessive bass, vibration, interference with neighboring businesses, and ordinance violations are prohibited. Luxor may require immediate volume or speaker-placement changes.'],
      ['End time', 'All music and entertainment must end at the approved time or earlier when required by law, shopping-center rules, an emergency, or Venue operations. Failure to follow a volume request may end the performance or Event.'],
      ['Equipment', 'Clients and vendors provide, operate, test, and safely maintain their own sound, lighting, projectors, televisions, cords, adapters, and other equipment unless included in writing. Luxor is not responsible for vendor equipment failures or compatibility issues.'],
      ['Performer conduct', 'Performances may not block exits, create unsafe conditions, damage property, interfere with Venue operations, or violate law. Luxor may require any performance to stop.'],
    ],
  },
  {
    number: '7',
    title: 'Damage & cleaning',
    intro: 'Leave the Venue in substantially the condition provided, ordinary wear excepted. The Client is responsible for the actions of guests and vendors and for resulting damage, excessive cleaning, repair, or replacement.',
    items: [
      ['Standard and excessive cleaning', 'Luxor performs routine post-event cleaning. The Client must remove belongings, decor, rentals, food, beverages, and vendor equipment and place trash in designated receptacles. Extra charges may apply for stains, bodily fluids, smoke residue, prohibited materials, adhesive residue, abandoned decor, or unusual trash.'],
      ['Damage and property', 'Repair or replacement costs may be deducted from the security deposit or invoiced separately. Venue furniture, decor, fixtures, and equipment may not be removed. The Client is responsible for damaged, broken, lost, stolen, or missing Venue property.'],
      ['False alarms and lost items', 'The Client is responsible for emergency-response costs caused by event activities, cooking equipment, smoke, fog, haze, or special effects. Luxor is not responsible for lost or abandoned property and may dispose of unclaimed items.'],
      ['Security deposit & post-event inspection', 'Luxor may inspect and document the Premises before, during, and after the Event through photographs, video, written reports, inventory checks, and other reasonable records. Luxor may apply the security deposit toward authorized damage, excessive cleaning, overtime, missing property, false alarm or emergency-response costs, prohibited materials, policy violations, and other charges allowed by the Booking Agreement. Luxor may provide an itemized deduction statement. Any undisputed remaining balance is returned under the Booking Agreement, generally within 14 business days after the Event; Client remains responsible if charges exceed the deposit.'],
      ['Venue condition documentation', 'Luxor may photograph, video, inspect, inventory, and otherwise document the condition of the Premises, furniture, fixtures, equipment, decorations, and Venue property for operational, safety, insurance, damage assessment, policy enforcement, billing, and dispute-resolution purposes. Clients are encouraged to photograph the space before setup and after removing their property.'],
    ],
  },
  {
    number: '8',
    title: 'Venue rights & policy enforcement',
    intro: 'Luxor aims to resolve issues calmly, but must protect guests, staff, property, neighboring businesses, and legal compliance.',
    items: [
      ['Event termination', 'Luxor may suspend or terminate an Event without refund for material or repeated policy violations, illegal or violent conduct, property risk, occupancy violations, unpaid required balances, unsafe alcohol service, or refusal to follow reasonable staff instructions.'],
      ['Removal and emergency response', 'Luxor may remove disruptive, unsafe, unlawful, abusive, or intoxicated persons and contact law enforcement, fire personnel, emergency medical services, property management, or shopping-center security when reasonably necessary.'],
      ['Emergency procedures', 'Client, guests, vendors, contractors, entertainers, and invitees must immediately follow reasonable instructions from Luxor staff, property management, shopping-center security, law enforcement, fire personnel, emergency medical personnel, and other responders. Luxor may pause, relocate, evacuate, suspend, or terminate an Event when reasonably necessary to protect people or property, respond to an emergency, comply with law, or follow responder or property-management instructions.'],
      ['Financial remedies', 'Termination does not remove responsibility for unpaid balances, damage, cleaning, overtime, or other authorized charges. Luxor may deduct authorized amounts from the security deposit, issue an invoice, deny future bookings, or pursue remedies available under Texas law.'],
    ],
  },
] as const

export async function buildLuxorGuestGuidePdf(booking: LuxorBooking) {
  const w = await createWriter('VENUE POLICIES & GUEST GUIDE')
  const names = parseClientName(booking.client_name)
  w.title('Venue Policies & Guest Guide', `${booking.event_type || 'Private event'} at Luxor Event Space`)
  w.note('This Guide is incorporated into the Luxor Booking Agreement. By signing the Agreement, the Client acknowledges receipt of this Guide and accepts responsibility for ensuring that guests, vendors, contractors, entertainers, and invitees comply with it.')
  w.heading('Your event at a glance')
  w.fieldPair('Client', names.fullName, 'Event date', displayDate(booking.event_date))
  w.fieldPair('Event type', booking.event_type || 'Private event', 'Expected guests', booking.guest_count ? String(booking.guest_count) : 'To be confirmed')
  w.fieldPair('Event time', `${displayTime(booking.start_time)} - ${displayTime(booking.end_time)}`, 'Package', booking.package_name || 'Custom venue booking')
  w.fieldPair('Refundable security deposit', money(Number(booking.security_deposit_amount ?? 750)), 'Due date', 'Separate payment after signed agreement')
  w.note(`Separate refundable security deposit required for all bookings. Deposit is held throughout the event period and is returned following the post-event inspection, subject to the terms of the Event Agreement. Luxor may inspect and document the Premises before, during, and after the Event. Authorized deductions may include damage, excessive cleaning, overtime, missing property, emergency-response costs, prohibited materials, and policy violations. Luxor may provide an itemized statement; any undisputed remaining balance is returned within fourteen (14) business days after the Event.`)
  w.heading('How to use this guide')
  w.paragraph('Share the relevant sections with your planner, family, vendors, bartender, DJ, decorator, and rental companies before the Event. Clear timing and expectations are the best way to prevent delays, policy issues, and unexpected charges.')
  w.paragraph('If you are unsure whether a decoration, vendor setup, special effect, entertainment plan, or service is permitted, contact Luxor before purchasing or scheduling it. Written approval protects both the Client and the Venue.')

  w.addPage()
  for (const [sectionIndex, section] of guestGuideSections.entries()) {
    if ([2, 4, 6].includes(sectionIndex)) w.addPage()
    w.heading(`Section ${section.number} - ${section.title}`)
    w.paragraph(section.intro)
    for (const [itemTitle, body] of section.items) {
      w.subheading(itemTitle)
      w.paragraph(body)
    }
    if (sectionIndex === guestGuideSections.length - 1) {
      w.note('Planning note: Share these requirements with the people responsible for the Event and confirm any exception or approval with Luxor in writing before the Event.')
    }
  }

  w.addPage()
  w.title('Damage & fee schedule', 'Common additional charges')
  w.paragraph('These are common charges that may apply when additional services, policy violations, damage, or extraordinary cleaning occur. Actual repair or replacement cost controls when it exceeds a listed amount.')
  const fees = [
    ['Overtime - per 30 minutes', '$150.00'],
    ['Excessive cleaning', 'Starting at $250.00'],
    ['Deep cleaning', 'Starting at $500.00'],
    ['Trash removal', 'Starting at $100.00'],
    ['False fire alarm / emergency response', 'Actual cost'],
    ['Wall, floor, fixture, door, window or restroom repair', 'Actual cost'],
    ['Furniture repair', 'Actual cost'],
    ['Furniture, chair or table replacement', 'Actual replacement cost'],
    ['Lost or missing Venue property', 'Actual replacement cost'],
    ['Audiovisual equipment damage', 'Actual repair / replacement cost'],
    ['Administrative rescheduling fee', '$250.00'],
    ['Returned check fee', '$35.00'],
    ['Collection costs and attorney fees', 'As permitted by law'],
  ]
  for (const [label, value] of fees) w.feeRow(label, value)
  w.note('The Client remains responsible for charges that exceed the security deposit. This schedule does not limit Luxor\'s right to recover the actual cost of repair, replacement, cleaning, or other event-related losses.')
  w.y -= 16
  w.heading(names.firstName ? `Thank you, ${names.firstName}` : 'Thank you')
  w.paragraph('We are honored to host your celebration. Following this Guide helps the Event run smoothly and helps us care for the Venue for every family that celebrates here.', { gap: 4 })
  w.paragraph('For questions or written approvals, reply to your Luxor email thread or contact booking@luxoratlaspalmas.com.', { gap: 0 })

  return w.finish()
}

export async function buildExecutedLuxorContract(input: {
  original: Uint8Array
  signature: LuxorSignatureRequest
  clientName: string
  clientEmail: string
  clientSignedAt: string
  clientSignatureDataUrl: string
  signaturePlacement: LuxorContractSignaturePlacement
  ownerName: string
  ownerEmail: string
  ownerSignedAt: string
  events: Array<{ created_at: string; event_type: string; ip_address?: string | null; user_agent?: string | null }>
}) {
  const originalHash = crypto.createHash('sha256').update(input.original).digest('hex')
  const executionAt = input.clientSignedAt
  const addCertificate = async (detailed: boolean) => {
    const pdf = await PDFDocument.load(input.original)
    pdf.registerFontkit(fontkit)
    const regular = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const signatureFontBytes = await fs.readFile(path.join(
      process.cwd(),
      'node_modules',
      '@fontsource',
      'alex-brush',
      'files',
      'alex-brush-latin-400-normal.woff',
    ))
    const script = await pdf.embedFont(signatureFontBytes, { subset: true })

    const signatureBytes = Buffer.from(input.clientSignatureDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
    const clientSignature = await pdf.embedPng(signatureBytes)
    const signaturePage = pdf.getPages()[input.signaturePlacement.pageIndex]
    if (!signaturePage) throw new Error('The contract signature page is missing.')

    const clientBox = input.signaturePlacement.client
    const clientScale = Math.min(clientBox.width / clientSignature.width, clientBox.height / clientSignature.height)
    const clientWidth = clientSignature.width * clientScale
    const clientHeight = clientSignature.height * clientScale
    signaturePage.drawImage(clientSignature, {
      x: clientBox.x + (clientBox.width - clientWidth) / 2,
      y: clientBox.y + (clientBox.height - clientHeight) / 2,
      width: clientWidth,
      height: clientHeight,
    })

    const ownerBox = input.signaturePlacement.owner
    const originalPageOwnerSignatureSize = Math.min(23, ownerBox.width / script.widthOfTextAtSize(input.ownerName, 1))
    signaturePage.drawText(input.ownerName, {
      x: ownerBox.x,
      y: ownerBox.y + 10,
      size: originalPageOwnerSignatureSize,
      font: script,
      color: ink,
      maxWidth: ownerBox.width,
    })
    signaturePage.drawText(displaySignatureDate(executionAt), {
      x: clientBox.x,
      y: clientBox.y - 74,
      size: 8.5,
      font: bold,
      color: ink,
    })
    signaturePage.drawText(displaySignatureDate(executionAt), {
      x: ownerBox.x,
      y: ownerBox.y - 74,
      size: 8.5,
      font: bold,
      color: ink,
    })

    const page = pdf.addPage([pageWidth, pageHeight])
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: cream })
    page.drawRectangle({ x: 0, y: 734, width: pageWidth, height: 58, color: ink })
    page.drawText('LUXOR  |  EXECUTION CERTIFICATE', { x: margin, y: 756, size: 15, font: bold, color: paleGold })
    page.drawText('This certificate is part of the fully executed Booking Agreement.', { x: margin, y: 700, size: 10, font: regular, color: ink })
    const clientSignatureSize = Math.min(24, 205 / script.widthOfTextAtSize(input.clientName, 1))
    const ownerSignatureSize = Math.min(24, 205 / script.widthOfTextAtSize(input.ownerName, 1))
    page.drawText(input.clientName, { x: margin, y: 636, size: clientSignatureSize, font: script, color: ink })
    page.drawLine({ start: { x: margin, y: 624 }, end: { x: 280, y: 624 }, thickness: 0.8, color: muted })
    page.drawText(`Client | ${input.clientEmail}`, { x: margin, y: 606, size: 8.5, font: regular, color: muted })
    page.drawText(`Executed ${displaySignatureDate(executionAt)}`, { x: margin, y: 590, size: 8.5, font: regular, color: muted })
    page.drawText(input.ownerName, { x: 330, y: 636, size: ownerSignatureSize, font: script, color: ink })
    page.drawLine({ start: { x: 330, y: 624 }, end: { x: 560, y: 624 }, thickness: 0.8, color: muted })
    page.drawText(`Owner, Luxor Event Space | ${input.ownerEmail}`, { x: 330, y: 606, size: 8.5, font: regular, color: muted })
    page.drawText(`Executed ${displaySignatureDate(executionAt)}`, { x: 330, y: 590, size: 8.5, font: regular, color: muted })
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
      for (const wrapped of wrap(line, regular, 7.8, contentWidth)) { page.drawText(wrapped, { x: margin, y, size: 7.8, font: regular, color: ink }); y -= 13 }
      y -= 5
    }
    // The draft agreement is numbered before this certificate exists. Redraw the
    // footer after adding it so every customer-facing page uses the true total.
    const executedPages = pdf.getPages()
    executedPages.forEach((target, index) => {
      target.drawRectangle({ x: 0, y: 0, width: pageWidth, height: 52, color: cream })
      target.drawLine({ start: { x: margin, y: 43 }, end: { x: pageWidth - margin, y: 43 }, thickness: 0.45, color: paleGold })
      target.drawText(index === executedPages.length - 1
        ? 'Electronic signatures apply to the entire agreement and all signature locations.'
        : `Luxor Event Space  |  ${LUXOR_VENUE_ADDRESS}`, { x: margin, y: 25, size: 7.4, font: regular, color: muted })
      const pageText = `${index + 1} / ${executedPages.length}`
      target.drawText(pageText, { x: pageWidth - margin - regular.widthOfTextAtSize(pageText, 7.2), y: 25, size: 7.2, font: regular, color: muted })
    })
    const bytes = await pdf.save({ useObjectStreams: false })
    return { bytes, hash: crypto.createHash('sha256').update(bytes).digest('hex'), originalHash }
  }
  return { customer: await addCertificate(false), audit: await addCertificate(true) }
}
