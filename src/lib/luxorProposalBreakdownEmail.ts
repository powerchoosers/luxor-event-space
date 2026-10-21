import type { LuxorInvoiceLineItem } from './luxorInquiryTypes'
import { LUXOR_PROPOSAL_PACKAGE_IDS, type LuxorProposalPackageTierId, type LuxorProposalPackageOption } from './luxorProposalPackages'

type BreakdownPackage = {
  id: string
  name?: string
  description?: string
  inclusions?: string[]
  finalEventPrice?: number | null
  subtotal?: number
  discountAmount?: number
  taxAmount?: number
  taxRate?: number
  lineItems?: LuxorInvoiceLineItem[]
  refundableSecurityDeposit?: number
  amountDueToBook?: number | null
}

type BreakdownAddOn = {
  id?: string
  label?: string
  category?: string
  description?: string
  unitPrice?: number
  quantity?: number
  selectedQuantity?: number
  minimumQuantity?: number
  unit?: string
  pricingUnit?: string
  state?: 'included' | 'selected' | 'available'
  total?: number | null
  available?: boolean
  error?: string
}

export type LuxorProposalBreakdownEmailInput = {
  recipientName: string
  eventType: string
  eventDate: string
  guestCount: number
  venueAccess: string
  guestArrival: string
  eventEnd: string
  selectedPackageId: LuxorProposalPackageTierId
  packageOptions: LuxorProposalPackageOption[]
  packages: BreakdownPackage[]
  selectedPackage: BreakdownPackage
  addOnQuotes: BreakdownAddOn[]
  phoneNumber?: string | null
  bookingUrl?: string | null
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function money(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : 'Pricing needs review'
}

export function luxorProposalBreakdownHasCompletePrices(options: LuxorProposalPackageOption[], packages: BreakdownPackage[]) {
  if (options.length !== LUXOR_PROPOSAL_PACKAGE_IDS.length || packages.length !== LUXOR_PROPOSAL_PACKAGE_IDS.length) return false
  const optionIds = new Set(options.map((option) => option.id))
  const packageById = new Map(packages.map((item) => [item.id, item]))
  return LUXOR_PROPOSAL_PACKAGE_IDS.every((id) => {
    const result = packageById.get(id)
    return optionIds.has(id) && Number.isFinite(Number(result?.finalEventPrice)) && Number(result?.finalEventPrice) >= 0
  })
}

function optionalLineItems(value: unknown) {
  return Array.isArray(value) ? value as LuxorInvoiceLineItem[] : []
}

function lineItemRows(items: LuxorInvoiceLineItem[]) {
  return items.map((item) => {
    const detail = item.detail ? `<p style="margin:4px 0 0;color:#8a7965;font-size:11px;line-height:1.5">${escapeHtml(item.detail)}</p>` : ''
    const quantity = Number(item.quantity) > 1 ? ` × ${escapeHtml(item.quantity)}` : ''
    const amount = Number(item.total) > 0 ? money(item.total) : 'Included'
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #e9e0d2;color:#30271e;font-size:12px;line-height:1.5">${escapeHtml(item.description)}${quantity}${detail}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #e9e0d2;color:#30271e;font-size:12px;white-space:nowrap">${amount}</td></tr>`
  }).join('')
}

function packageCards(input: LuxorProposalBreakdownEmailInput) {
  return input.packageOptions.map((option) => {
    const calculated = input.packages.find((candidate) => candidate.id === option.id)
    const selected = option.id === input.selectedPackageId
    const price = calculated?.finalEventPrice ?? null
    const inclusionList = (calculated?.inclusions?.length ? calculated.inclusions : option.inclusions || [])
      .slice(0, 8)
      .map((item) => `<li style="margin:0 0 5px;color:#63584b;font-size:10px;line-height:1.45">${escapeHtml(item)}</li>`).join('')
    const linkLabel = selected ? 'Selected for Book Now' : 'Comparison only'
    return `<td valign="top" width="50%" style="width:50%;padding:6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:100%;border-collapse:separate;border-spacing:0;background:${selected ? '#f4ead4' : '#fffdf9'};border:1px solid ${selected ? '#caa24c' : '#e8dfd1'};border-radius:12px"><tr><td style="padding:14px 14px 12px"><p style="margin:0;color:#92713d;font-size:9px;font-weight:800;letter-spacing:.16em;text-transform:uppercase">${escapeHtml(option.positioning)}</p><p style="margin:7px 0 0;color:#211a13;font-family:Georgia,'Times New Roman',serif;font-size:18px">${escapeHtml(option.name)}</p><p style="margin:7px 0 0;color:#675b4e;font-size:10px;line-height:1.5">${escapeHtml(option.summary || option.description)}</p><p style="margin:12px 0 0;color:#1f1912;font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:700">${money(price)}</p><p style="margin:4px 0 0;color:#92713d;font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">${linkLabel}</p>${inclusionList ? `<ul style="margin:10px 0 0;padding-left:16px">${inclusionList}</ul>` : ''}</td></tr></table></td>`
  }).reduce((rows, _card, index, cards) => {
    if (index % 2 !== 0) return rows
    return [...rows, `<tr>${cards[index]}${cards[index + 1] || '<td width="50%" style="width:50%;padding:6px"></td>'}</tr>`]
  }, [] as string[]).join('')
}

function addOnRows(quotes: BreakdownAddOn[]) {
  if (!quotes.length) return '<tr><td colspan="2" style="padding:12px 0;color:#675b4e;font-size:12px">No additional catalog options are configured for this event.</td></tr>'
  return quotes.map((quote) => {
    const unit = quote.unit || quote.pricingUnit || 'each'
    const unitPrice = quote.unitPrice === undefined ? 'Price on request' : `${money(quote.unitPrice)} / ${escapeHtml(unit)}`
    const quantity = Number(quote.selectedQuantity ?? quote.quantity ?? 0)
    const selected = quote.state === 'selected' && quantity > 0
    const status = quote.available === false ? 'Currently unavailable' : selected ? `Selected · ${quantity} ${escapeHtml(unit)} · ${money(quote.total)}` : 'Available to add'
    const note = quote.description || quote.error || ''
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #e9e0d2;color:#30271e;font-size:11px;line-height:1.45"><strong>${escapeHtml(quote.label)}</strong><span style="display:block;margin-top:3px;color:#8a7965;font-size:10px">${escapeHtml(quote.category)}${note ? ` · ${escapeHtml(note)}` : ''}</span></td><td align="right" style="padding:10px 0;border-bottom:1px solid #e9e0d2;color:#30271e;font-size:10px;white-space:nowrap">${unitPrice}<span style="display:block;margin-top:4px;color:#8a7965">${status}</span></td></tr>`
  }).join('')
}

/** Renders the same server-calculated package and add-on details for preview and delivery. */
export function buildLuxorProposalBreakdownEmail(input: LuxorProposalBreakdownEmailInput) {
  const firstName = input.recipientName.trim().split(/\s+/)[0] || 'there'
  const selected = input.selectedPackage
  const items = optionalLineItems(selected.lineItems)
  const bookingLink = input.bookingUrl
    ? `<a href="${escapeHtml(input.bookingUrl)}" target="_blank" style="display:inline-block;padding:15px 25px;border:1px solid #dfc16e;border-radius:6px;background:#caa24c;color:#21190d;text-decoration:none;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">Book Now</a>`
    : '<span style="display:inline-block;padding:13px 18px;border:1px solid #d9c9a9;border-radius:6px;color:#695a43;font-size:11px;font-weight:700">Secure Book Now link appears after sending</span>'
  const phone = input.phoneNumber
    ? `<a href="tel:${escapeHtml(input.phoneNumber)}" style="color:#b08a43;text-decoration:none">${escapeHtml(input.phoneNumber)}</a>`
    : ''
  const subject = `Proposal Breakdown: ${input.eventType || 'Your Luxor event'}`
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:24px 10px;background:#201a14;color:#211a13;font-family:Arial,'Helvetica Neue',sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center"><table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:680px;border-collapse:separate;border-spacing:0;background:#fffdf9;border-radius:14px;overflow:hidden"><tr><td align="center" style="padding:24px 28px 20px;background:#17120e;border-bottom:4px solid #caa24c"><p style="margin:0;color:#d2aa57;font-family:Georgia,'Times New Roman',serif;font-size:30px;letter-spacing:.21em;text-transform:uppercase">LUXOR</p><p style="margin:6px 0 0;color:#b2a18a;font-size:8px;font-weight:700;letter-spacing:.32em;text-transform:uppercase">At Las Palmas Events</p></td></tr><tr><td style="padding:28px 28px 18px"><p style="margin:0;color:#9b773a;font-size:9px;font-weight:800;letter-spacing:.2em;text-transform:uppercase">Proposal Breakdown</p><h1 style="margin:9px 0 0;color:#241c14;font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:500;line-height:1.22">A clear view of your celebration options</h1><p style="margin:12px 0 0;color:#675b4e;font-size:13px;line-height:1.65">Hi ${escapeHtml(firstName)}, here is the package comparison and selected event breakdown for your Luxor event.</p></td></tr><tr><td style="padding:0 28px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #e9e0d2;border-bottom:1px solid #e9e0d2"><tr><td width="50%" style="padding:13px 10px 13px 0;vertical-align:top"><p style="margin:0;color:#92713d;font-size:8px;font-weight:800;letter-spacing:.13em;text-transform:uppercase">Event details</p><p style="margin:6px 0 0;color:#30271e;font-size:11px;line-height:1.6">${escapeHtml(input.eventType || 'Event')}<br>${escapeHtml(input.eventDate || 'Date to be confirmed')} · ${escapeHtml(input.guestCount)} guests</p></td><td width="50%" style="padding:13px 0 13px 10px;vertical-align:top"><p style="margin:0;color:#92713d;font-size:8px;font-weight:800;letter-spacing:.13em;text-transform:uppercase">Venue timing</p><p style="margin:6px 0 0;color:#30271e;font-size:11px;line-height:1.6">Access ${escapeHtml(input.venueAccess || 'To be confirmed')}<br>Guests ${escapeHtml(input.guestArrival || 'To be confirmed')} · Event ends ${escapeHtml(input.eventEnd || 'To be confirmed')}</p></td></tr></table></td></tr><tr><td style="padding:4px 22px 20px"><h2 style="margin:0 0 5px;padding:0 6px;color:#92713d;font-size:9px;font-weight:800;letter-spacing:.18em;text-transform:uppercase">Compare the four packages</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${packageCards(input)}</table><p style="margin:5px 6px 0;color:#8a7965;font-size:9px;line-height:1.5">The other package prices are for comparison. Book Now opens the selected package shown below.</p></td></tr><tr><td style="padding:0 28px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td colspan="2" style="padding:14px 15px;border:1px solid #ddc78e;border-bottom:0;border-radius:10px 10px 0 0;background:#f7f0e2"><p style="margin:0;color:#92713d;font-size:8px;font-weight:800;letter-spacing:.16em;text-transform:uppercase">Selected package · ${escapeHtml(selected.name)}</p><p style="margin:6px 0 0;color:#211a13;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700">${money(selected.finalEventPrice)}</p></td></tr><tr><td colspan="2" style="padding:0 15px;border-left:1px solid #ddc78e;border-right:1px solid #ddc78e;background:#fffdf9"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${lineItemRows(items)}</table></td></tr><tr><td style="padding:12px 15px;border:1px solid #ddc78e;border-top:0;border-radius:0 0 10px 10px;background:#fffdf9"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:4px 0;color:#675b4e;font-size:11px">Subtotal</td><td align="right" style="padding:4px 0;color:#30271e;font-size:11px">${money(selected.subtotal)}</td></tr>${Number(selected.discountAmount || 0) > 0 ? `<tr><td style="padding:4px 0;color:#675b4e;font-size:11px">Promotion</td><td align="right" style="padding:4px 0;color:#346b4a;font-size:11px">−${money(selected.discountAmount)}</td></tr>` : ''}${Number(selected.taxAmount || 0) > 0 ? `<tr><td style="padding:4px 0;color:#675b4e;font-size:11px">Sales tax${Number(selected.taxRate || 0) ? ` (${(Number(selected.taxRate) * 100).toFixed(2)}%)` : ''}</td><td align="right" style="padding:4px 0;color:#30271e;font-size:11px">${money(selected.taxAmount)}</td></tr>` : ''}<tr><td style="padding:9px 0 2px;border-top:1px solid #e9e0d2;color:#211a13;font-size:11px;font-weight:800">Final event price</td><td align="right" style="padding:9px 0 2px;border-top:1px solid #e9e0d2;color:#211a13;font-size:14px;font-weight:800">${money(selected.finalEventPrice)}</td></tr><tr><td style="padding:5px 0 0;color:#675b4e;font-size:10px">Refundable security deposit · collected separately</td><td align="right" style="padding:5px 0 0;color:#30271e;font-size:10px">${money(selected.refundableSecurityDeposit)}</td></tr></table></td><td style="width:0;padding:0"></td></tr></table></td></tr><tr><td style="padding:0 28px 22px"><h2 style="margin:0 0 8px;color:#92713d;font-size:9px;font-weight:800;letter-spacing:.18em;text-transform:uppercase">Available add-ons</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${addOnRows(input.addOnQuotes)}</table></td></tr><tr><td align="center" style="padding:20px 28px 26px;border-top:1px solid #e9e0d2"><p style="margin:0 0 13px;color:#675b4e;font-size:11px;line-height:1.6">Selecting the chosen package opens its secure proposal page. Luxor sends the Event Agreement after the package is selected; payment follows the signed agreement.</p>${bookingLink}<p style="margin:13px 0 0;color:#675b4e;font-size:10px">Questions? ${phone ? `${phone} · ` : ''}<a href="mailto:booking@luxoratlaspalmas.com" style="color:#b08a43;text-decoration:none">booking@luxoratlaspalmas.com</a></p></td></tr><tr><td align="center" style="padding:17px 22px;background:#17120e;color:#b2a18a;font-size:9px;line-height:1.6">Luxor at Las Palmas Events<br>For the selected package shown above only.</td></tr></table></td></tr></table></body></html>`
  return { subject, html }
}
