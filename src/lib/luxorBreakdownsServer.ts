import 'server-only'

import { createHash } from 'node:crypto'
import { supabaseRestStrict } from './supabaseRestServer'
import { isLuxorTestInquiry, isLuxorPermanentTestLead, isLuxorInquiryArchived } from './luxorInquiryTypes'
import { getInvoice } from './luxorInvoicesServer'
import { getLuxorInquiry } from './luxorInquiriesServer'
import { getLuxorLeadEventForInquiry } from './luxorLeadEventsServer'
import { calculateLuxorProposal, withLuxorProposalPricingPolicyVersion, type LuxorProposalSelection } from './luxorProposalPricing'
import { assertLuxorWeekdayRentalSelection, getLuxorProposalPricingForInvoice, hasFrozenLegacyCustomTimeProposal, resolveLuxorOriginalProposalCreatedAt, resolveLuxorProposalPromotion, resolveLuxorSameDayBooking } from './luxorProposalPricingServer'
import { buildLuxorProposalBreakdownEmail, isBreakdownPaymentError, luxorProposalBreakdownHasCompletePrices } from './luxorProposalBreakdownEmail'
import { normalizeLuxorProposalPackageTierId } from './luxorProposalPackages'
import { formatCatalogTime } from './luxorPricingCatalog'
import { isLuxorBookingDateWithinLimit } from './publicEventDate'
import { getPublicLuxorPhoneNumber } from './luxorPhoneNumbersServer'
import { sendLuxorZohoEmail } from './zohoMailServer'
import { luxorMailProvider } from './luxorMailConfig'
import { breakdownCanonicalJson, breakdownPricingSignature, breakdownVenueAccessLabel, breakdownEventEndLabel, type LuxorBreakdown, type LuxorBreakdownSummary } from './luxorBreakdownTypes'

type StoredBreakdown = LuxorBreakdown & { request_fingerprint: string; actor_email: string; provider: 'resend' | 'zoho' }
const TABLE = 'luxor_proposal_breakdowns'
const SUMMARY = 'id,inquiry_id,lead_event_id,recipient_email,recipient_name,subject,selection,created_at,delivery_state,sent_at,delivery_started_at,provider_message_id,error_message'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class LuxorBreakdownError extends Error {
  constructor(message: string, public status = 409, public breakdown?: LuxorBreakdown) {
    super(message)
    this.name = 'LuxorBreakdownError'
  }
}

export function isLuxorBreakdownId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function publicRecord(row: StoredBreakdown): LuxorBreakdown {
  const { request_fingerprint: _fingerprint, actor_email: _actor, provider: _provider, ...record } = row
  return record
}

async function getStoredBreakdown(id: string) {
  const [row] = await supabaseRestStrict<StoredBreakdown[]>(`${TABLE}?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
  return row || null
}

export async function getLuxorBreakdown(id: string) {
  const row = await getStoredBreakdown(id)
  return row ? publicRecord(await reconcileAcceptedBreakdown(row)) : null
}

export async function listLuxorBreakdowns(inquiryId: string) {
  // Paginate internally so older immutable records do not silently disappear.
  const rows: LuxorBreakdownSummary[] = []
  for (let offset = 0; ; offset += 200) {
    const page = await supabaseRestStrict<LuxorBreakdownSummary[]>(`${TABLE}?select=${SUMMARY}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc,id.desc&limit=200&offset=${offset}`)
    const recovered = await Promise.all(page.map(async (summary) => {
      if (!['sending', 'delivery_unconfirmed'].includes(summary.delivery_state)) return summary
      const stored = await getStoredBreakdown(summary.id)
      if (!stored) return summary
      const current = await reconcileAcceptedBreakdown(stored)
      return {
        ...summary,
        delivery_state: current.delivery_state,
        sent_at: current.sent_at,
        delivery_started_at: current.delivery_started_at,
        provider_message_id: current.provider_message_id,
        error_message: current.error_message,
      }
    }))
    rows.push(...recovered)
    if (page.length < 200) return rows
  }
}

function clock(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : ''
  return /^\d{1,2}:\d{2}$/.test(raw) ? formatCatalogTime(raw) : raw
}

function deliveryKey(id: string) { return `proposal-breakdown/${id}` }

/** Recover only a durable provider receipt. Never initiate another delivery here. */
async function reconcileAcceptedBreakdown(row: StoredBreakdown) {
  if (row.provider !== 'resend' || !['sending', 'delivery_unconfirmed'].includes(row.delivery_state)) return row
  const [receipt] = await supabaseRestStrict<Array<{ accepted_at: string | null; provider_id: string | null }>>(
    `luxor_mail_messages?select=accepted_at,provider_id&idempotency_key=eq.${encodeURIComponent(deliveryKey(row.id))}&limit=1`,
  )
  if (!receipt?.accepted_at || !receipt.provider_id?.trim()) return row
  const [updated] = await supabaseRestStrict<StoredBreakdown[]>(`${TABLE}?select=*&id=eq.${row.id}&delivery_state=in.(sending,delivery_unconfirmed)`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ delivery_state: 'sent', sent_at: receipt.accepted_at, provider_message_id: receipt.provider_id, error_message: null }),
  })
  return updated || await getStoredBreakdown(row.id) || row
}

export async function sendLuxorBreakdown(input: {
  requestId: string
  inquiryId: string
  leadEventId: string | null
  sourceInvoiceId?: string | null
  recipientEmail: string
  selection: LuxorProposalSelection
  expectedPricing: string
  actorEmail: string
}) {
  if (!isLuxorBreakdownId(input.requestId) || !isLuxorBreakdownId(input.inquiryId)
    || (input.leadEventId !== null && !isLuxorBreakdownId(input.leadEventId))
    || (input.sourceInvoiceId != null && !isLuxorBreakdownId(input.sourceInvoiceId))) {
    throw new LuxorBreakdownError('A valid lead, event, and send request are required.', 400)
  }
  const recipient = input.recipientEmail.trim()
  if (recipient.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)) {
    throw new LuxorBreakdownError('Enter a valid recipient email address.', 400)
  }
  const inquiry = await getLuxorInquiry(input.inquiryId)
  if (!inquiry) throw new LuxorBreakdownError('Lead not found.', 404)
  if (isLuxorTestInquiry(inquiry) || isLuxorPermanentTestLead(inquiry)) throw new LuxorBreakdownError('Real breakdown delivery is disabled for Test Leads. Use the isolated test workflow.')
  if (isLuxorInquiryArchived(inquiry)) throw new LuxorBreakdownError('This lead is archived. Reopen it before sending a breakdown.')
  if (input.leadEventId && !await getLuxorLeadEventForInquiry(input.leadEventId, input.inquiryId)) {
    throw new LuxorBreakdownError('The selected event does not belong to this lead.', 400)
  }
  const fingerprint = createHash('sha256').update(breakdownCanonicalJson({
    inquiryId: input.inquiryId, leadEventId: input.leadEventId, sourceInvoiceId: input.sourceInvoiceId || null, recipientEmail: recipient, selection: input.selection,
  })).digest('hex')
  let row = await getStoredBreakdown(input.requestId)
  if (!row) {
    if (!input.expectedPricing) throw new LuxorBreakdownError('Review the current package prices before sending.', 400)
    if (!isLuxorBookingDateWithinLimit(input.selection.eventDate)) {
      throw new LuxorBreakdownError('Choose an event date within the next 36 months.', 400)
    }
    // Reuse only the builder's read-only pricing source. This comparison never
    // edits, accepts, publishes, or links itself into that proposal's lifecycle.
    const source = input.sourceInvoiceId ? await getInvoice(input.sourceInvoiceId) : null
    if (input.sourceInvoiceId && (!source || source.invoice_kind !== 'event'
      || source.inquiry_id !== input.inquiryId || (source.lead_event_id !== null && source.lead_event_id !== input.leadEventId))) {
      throw new LuxorBreakdownError('The pricing source does not match this lead and event.', 409)
    }
    const savedPolicyVersion = Number(source?.proposal_context?.proposal_pricing_policy_version)
    const pricingPolicyVersion = source ? (savedPolicyVersion >= 4 ? 4 : 3) : 4
    const selection = withLuxorProposalPricingPolicyVersion(input.selection, pricingPolicyVersion)
    const packageId = normalizeLuxorProposalPackageTierId(selection.packageTierId ?? selection.package_tier_id ?? selection.luxorPackageId ?? selection.luxor_package_id)
    if (!packageId) throw new LuxorBreakdownError('Choose a package for the staff-prepared estimate.', 400)
    const createdAt = new Date().toISOString()
    const pricing = await getLuxorProposalPricingForInvoice(source)
    assertLuxorWeekdayRentalSelection(input.selection, pricing.config, false, hasFrozenLegacyCustomTimeProposal(source))
    const promotion = await resolveLuxorProposalPromotion(input.selection, source)
    const originalCreatedAt = await resolveLuxorOriginalProposalCreatedAt(source)
    const sameDayBooking = await resolveLuxorSameDayBooking(input.selection, source, originalCreatedAt)
    const calculation = calculateLuxorProposal(selection, pricing.config, { promotion, sameDayBooking })
    const error = calculation.calculationErrors[0] || calculation.publicationErrors.find((message) => !isBreakdownPaymentError(message))
    if (!calculation.valid || error) throw new LuxorBreakdownError(error || 'The package pricing needs review.')
    const selectedPackage = calculation.packages.find((item) => item.id === packageId)
    if (!selectedPackage || !calculation.packageOptions || !luxorProposalBreakdownHasCompletePrices(calculation.packageOptions, calculation.packages)) {
      throw new LuxorBreakdownError('All four package prices must be available before sending this breakdown.')
    }
    if (breakdownPricingSignature(calculation) !== input.expectedPricing) {
      throw new LuxorBreakdownError('The package prices changed. Refresh the builder and review the current comparison before sending.')
    }
    const context = calculation.proposalContext
    const eventDate = String(context.event_date || selection.eventDate || '')
    const eventEndRaw = String(context.event_end_time || context.eventEndTime || '')
    const guestArrivalRaw = String(context.guest_arrival_time || context.guestArrivalTime || selection.guestArrivalTime || selection.guest_arrival_time || '')
    const rentalStart = String(context.rental_start_time || context.start_time || selection.rentalStartTime || selection.rental_start_time || '')
    const rentalEnd = String(context.rental_end_time || context.end_time || selection.rentalEndTime || selection.rental_end_time || '')
    const email = buildLuxorProposalBreakdownEmail({
      recipientName: inquiry.full_name,
      eventType: String(context.event_type || selection.eventType || 'Event'),
      eventDate, guestCount: Number(context.expected_guest_count || selection.guestCount || 0),
      venueAccess: breakdownVenueAccessLabel(rentalStart, rentalEnd),
      guestArrival: clock(guestArrivalRaw),
      eventEnd: breakdownEventEndLabel(guestArrivalRaw, eventEndRaw),
      selectedPackageId: packageId, selectedPackage, packages: calculation.packages,
      packageOptions: calculation.packageOptions, addOnQuotes: calculation.addOnQuotes,
      phoneNumber: await getPublicLuxorPhoneNumber(), bookingUrl: null,
    })
    const [created] = await supabaseRestStrict<StoredBreakdown[]>(`${TABLE}?on_conflict=id&select=*`, {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({
        id: input.requestId, inquiry_id: input.inquiryId, lead_event_id: input.leadEventId,
        recipient_email: recipient, recipient_name: inquiry.full_name, subject: email.subject, html: email.html,
        selection, pricing_snapshot: { calculation, pricing_config: pricing.config, pricing_config_version: pricing.version, pricing_config_id: pricing.id },
        request_fingerprint: fingerprint, actor_email: input.actorEmail, provider: luxorMailProvider(), created_at: createdAt,
      }),
    })
    row = created || await getStoredBreakdown(input.requestId)
    if (!row) throw new LuxorBreakdownError('The breakdown could not be saved. No email was sent.', 503)
  }
  if (row.request_fingerprint !== fingerprint) throw new LuxorBreakdownError('This send request already belongs to different details. Open its saved history before sending a new breakdown.')
  row = await reconcileAcceptedBreakdown(row)
  if (row.delivery_state === 'sent') return { breakdown: publicRecord(row), alreadyCompleted: true }
  if (row.delivery_state !== 'prepared') {
    throw new LuxorBreakdownError('This breakdown is being sent or its delivery is unconfirmed. Check its saved email history before sending another copy.', 409, publicRecord(row))
  }
  if (row.provider !== luxorMailProvider()) throw new LuxorBreakdownError('The email service changed after this breakdown was prepared. Review the saved record before sending.', 409, publicRecord(row))
  const [claimed] = await supabaseRestStrict<StoredBreakdown[]>(`${TABLE}?select=*&id=eq.${row.id}&delivery_state=eq.prepared`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ delivery_state: 'sending', delivery_started_at: new Date().toISOString() }),
  })
  if (!claimed) {
    const current = await getStoredBreakdown(row.id) || row
    throw new LuxorBreakdownError('This breakdown is already being sent. Check its saved history before sending another copy.', 409, publicRecord(current))
  }
  try {
    const receipt = await sendLuxorZohoEmail({
      to: claimed.recipient_email, subject: claimed.subject, content: claimed.html,
      from: 'booking@luxoratlaspalmas.com', fromName: 'Luxor Event Space',
      retryZohoDelivery: false, idempotencyKey: deliveryKey(claimed.id), metadata: { breakdown_id: claimed.id, inquiry_id: claimed.inquiry_id },
    })
    const providerMessageId = 'providerMessageId' in receipt && typeof receipt.providerMessageId === 'string'
      ? receipt.providerMessageId : typeof receipt.messageId === 'string' ? receipt.messageId : null
    if (!providerMessageId?.trim()) throw new Error('The email service did not return a confirmed message receipt.')
    const [sent] = await supabaseRestStrict<StoredBreakdown[]>(`${TABLE}?select=*&id=eq.${claimed.id}&delivery_state=in.(sending,delivery_unconfirmed)`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ delivery_state: 'sent', sent_at: new Date().toISOString(), provider_message_id: providerMessageId, error_message: null }),
    })
    const completed = sent || await getStoredBreakdown(claimed.id)
    if (!completed || completed.delivery_state !== 'sent') throw new Error('The email receipt could not be saved.')
    return { breakdown: publicRecord(completed), alreadyCompleted: false }
  } catch {
    const message = 'Email delivery could not be confirmed. Check the saved email history before sending another copy.'
    await supabaseRestStrict(`${TABLE}?id=eq.${claimed.id}&delivery_state=eq.sending`, {
      method: 'PATCH', body: JSON.stringify({ delivery_state: 'delivery_unconfirmed', error_message: message }),
    }).catch(() => undefined)
    let current = await getStoredBreakdown(claimed.id).catch(() => null) || claimed
    current = await reconcileAcceptedBreakdown(current).catch(() => current)
    if (current.delivery_state === 'sent') return { breakdown: publicRecord(current), alreadyCompleted: true }
    throw new LuxorBreakdownError(message, 409, publicRecord(current))
  }
}
