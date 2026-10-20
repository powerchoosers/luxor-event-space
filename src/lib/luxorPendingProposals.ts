import type { LuxorBooking, LuxorInvoice } from './luxorInquiryTypes'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from './luxorTestLeadPolicy'

export type PendingProposalSummary = {
  id: string
  inquiryId: string | null
  date: string
  title: string
  rentalPeriod: string
  status: string
  sentAt: string
  href: string | null
}

export type LuxorProposalActivitySummary = {
  invoice_id?: string | null
  proposal_family_id?: string | null
  event_type?: string | null
  occurred_at?: string | null
}

function proposalContext(invoice: LuxorInvoice) {
  return invoice.proposal_context && typeof invoice.proposal_context === 'object'
    ? invoice.proposal_context as Record<string, unknown>
    : {}
}

function eventDate(invoice: LuxorInvoice) {
  const context = proposalContext(invoice)
  const value = context.event_date ?? context.eventDate
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function sentAt(invoice: LuxorInvoice) {
  return invoice.proposal_latest_sent_at || invoice.proposal_sent_at || invoice.proposal_first_sent_at || null
}

function familyKey(invoice: LuxorInvoice, invoicesById: Map<string, LuxorInvoice>) {
  if (invoice.proposal_family_id) return invoice.proposal_family_id
  let current = invoice
  const seen = new Set<string>()
  while (current.supersedes_invoice_id && !seen.has(current.supersedes_invoice_id)) {
    seen.add(current.id)
    const previous = invoicesById.get(current.supersedes_invoice_id)
    if (!previous) break
    current = previous
  }
  return current.proposal_family_id || current.id
}

function testProposal(invoice: LuxorInvoice) {
  const context = proposalContext(invoice)
  return invoice.inquiry_id === LUXOR_PERMANENT_TEST_LEAD_ID
    || context.is_test === true
    || Boolean(context.test_run_id || context.testRunId)
}

function hasConvertedBooking(invoice: LuxorInvoice, bookings: LuxorBooking[]) {
  return Boolean(invoice.booking_id || bookings.some((booking) => booking.invoice_id === invoice.id))
}

function sentTime(invoice: LuxorInvoice) {
  const value = sentAt(invoice)
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : -1
}

function statusLabel(invoice: LuxorInvoice) {
  if (invoice.status === 'overdue') return 'Overdue'
  if (invoice.proposal_latest_viewed_at || invoice.proposal_viewed_at) return 'Viewed'
  return 'Sent'
}

function rentalLabel(invoice: LuxorInvoice) {
  const context = proposalContext(invoice)
  const value = typeof context.rental_period === 'string' ? context.rental_period : ''
  if (value === 'morning') return 'AM'
  if (value === 'evening') return 'PM'
  if (value === 'full_day') return 'Full day'
  if (value === 'custom') {
    const start = typeof context.rental_start_time === 'string' ? context.rental_start_time : ''
    const end = typeof context.rental_end_time === 'string' ? context.rental_end_time : ''
    return start && end ? `Custom ${start}–${end}` : 'Custom'
  }
  return 'Not recorded'
}

function eligibleSentProposal(invoice: LuxorInvoice, bookings: LuxorBooking[], now: number) {
  const sent = sentAt(invoice)
  if (!sent || !['sent', 'overdue'].includes(invoice.status) || !eventDate(invoice) || testProposal(invoice) || hasConvertedBooking(invoice, bookings)) return false
  if (invoice.invoice_kind && invoice.invoice_kind !== 'event') return false
  if (invoice.status === 'cancelled' || invoice.status === 'paid') return false
  if (invoice.offer_status === 'withdrawn' || invoice.offer_status === 'expired' || invoice.offer_status === 'redeemed') return false
  if (invoice.proposal_accepted_at) return false
  const expiration = invoice.offer_expires_at ? Date.parse(invoice.offer_expires_at) : Number.NaN
  if (Number.isFinite(expiration) && expiration <= now) return false
  return true
}

function resolvedAfterLastSend(invoice: LuxorInvoice, family: string, activities: LuxorProposalActivitySummary[]) {
  const sent = sentTime(invoice)
  return activities.some((activity) => {
    if (activity.invoice_id !== invoice.id && activity.proposal_family_id !== family) return false
    if (!['declined', 'withdrawn', 'superseded'].includes(String(activity.event_type || '').toLowerCase())) return false
    const occurredAt = Date.parse(String(activity.occurred_at || ''))
    return Number.isFinite(occurredAt) && occurredAt >= sent
  })
}

/** Counts one currently relevant sent proposal per family, separate from booking availability. */
export function listLuxorPendingProposals(
  invoices: LuxorInvoice[],
  bookings: LuxorBooking[],
  now = Date.now(),
  activities: LuxorProposalActivitySummary[] = [],
): PendingProposalSummary[] {
  const invoicesById = new Map(invoices.map((invoice) => [invoice.id, invoice]))
  const byFamily = new Map<string, LuxorInvoice[]>()
  for (const invoice of invoices) {
    const key = familyKey(invoice, invoicesById)
    byFamily.set(key, [...(byFamily.get(key) || []), invoice])
  }

  const pending: PendingProposalSummary[] = []
  for (const family of byFamily.values()) {
    const latestSent = family
      .filter((invoice) => Boolean(sentAt(invoice)))
      .sort((a, b) => sentTime(b) - sentTime(a) || Number(b.proposal_version || 0) - Number(a.proposal_version || 0))[0]
    const key = latestSent ? familyKey(latestSent, invoicesById) : ''
    if (!latestSent || !eligibleSentProposal(latestSent, bookings, now) || resolvedAfterLastSend(latestSent, key, activities)) continue

    const date = eventDate(latestSent)
    const sent = sentAt(latestSent)
    if (!date || !sent) continue
    const inquiryId = typeof latestSent.inquiry_id === 'string' ? latestSent.inquiry_id : null
    const title = String(latestSent.description || latestSent.event_type || 'Event proposal').trim() || 'Event proposal'
    pending.push({
      id: latestSent.id,
      inquiryId,
      date,
      title,
      rentalPeriod: rentalLabel(latestSent),
      status: statusLabel(latestSent),
      sentAt: sent,
      href: inquiryId ? `/portal/leads/${encodeURIComponent(inquiryId)}?tab=documents&stage=proposal` : null,
    })
  }

  return pending.sort((a, b) => a.date.localeCompare(b.date) || a.sentAt.localeCompare(b.sentAt))
}

export function countLuxorPendingProposalsByDate(proposals: PendingProposalSummary[]) {
  return proposals.reduce<Record<string, number>>((counts, proposal) => {
    counts[proposal.date] = (counts[proposal.date] || 0) + 1
    return counts
  }, {})
}
