import type { LuxorBooking, LuxorInvoice, LuxorLeadEvent } from '@/lib/luxorInquiryTypes'

export type ProposalCardActivity = {
  event_type: string
  details?: Record<string, unknown>
}

export type ProposalCardState = {
  label: 'Accepted' | 'Paid' | 'Overdue' | 'Superseded' | 'Declined' | 'Withdrawn' | 'Cancelled' | 'Expired' | 'Sending' | 'Viewed' | 'Delivered' | 'Sent' | 'Draft'
  isAccepted: boolean
  isSigned: boolean
  canEditDraft: boolean
  canRevise: boolean
  canResend: boolean
  canDuplicate: boolean
}

export type SavedProposalPricingSummary = {
  subtotal: number
  discountAmount: number
  taxRate: number
  taxAmount: number | null
  packageName: string
  paymentPlan: Record<string, unknown> | null
  amountDueToBook: number | null
  lineItems: LuxorInvoice['line_items']
}

export type ProposalWorkflowDisplayState = {
  status: string
  pipelineStage: string
  proposalAccepted: boolean
}

/** Derives display state from proposal acceptance and its exact linked booking without writing source records. */
export function getProposalWorkflowDisplayState(input: {
  currentStatus: string
  currentPipelineStage: string
  proposalAcceptedAt?: string | null
  proposalInvoiceId?: string | null
  bookingInvoiceId?: string | null
  contractStatus?: string | null
}): ProposalWorkflowDisplayState {
  const proposalId = typeof input.proposalInvoiceId === 'string' ? input.proposalInvoiceId.trim() : ''
  const linkedInvoiceId = typeof input.bookingInvoiceId === 'string' ? input.bookingInvoiceId.trim() : ''
  const hasMatchingBooking = Boolean(proposalId && linkedInvoiceId && proposalId === linkedInvoiceId)
  const proposalAccepted = Boolean(input.proposalAcceptedAt || hasMatchingBooking)
  const status = input.contractStatus === 'signed'
    ? 'contract_signed'
    : input.contractStatus === 'viewed'
      ? 'contract_opened'
      : proposalAccepted
        ? 'proposal_accepted'
        : input.currentStatus
  return {
    status,
    pipelineStage: proposalAccepted ? 'contract' : input.currentPipelineStage,
    proposalAccepted,
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Reads persisted proposal pricing evidence only; it never recalculates tax or line totals. */
export function getSavedProposalPricingSummary(invoice: LuxorInvoice): SavedProposalPricingSummary {
  const context = record(invoice.proposal_context) || {}
  const snapshot = record(context.pricing_snapshot) || {}
  const selectedPackage = record(snapshot.selected_package) || {}
  const lines = Array.isArray(invoice.line_items) ? invoice.line_items : []
  const savedTax = finiteNumber(selectedPackage.tax_amount ?? snapshot.tax_amount)
  const taxLine = lines
    .filter((line) => line.pricingRole === 'tax' || line.category?.toLowerCase() === 'tax')
    .reduce((sum, line) => sum + Number(line.total || 0), 0)
  const rate = finiteNumber(invoice.tax_rate) ?? 0
  const amountDueToBook = finiteNumber(context.amount_due_to_book)

  return {
    subtotal: finiteNumber(invoice.original_subtotal ?? selectedPackage.subtotal ?? snapshot.subtotal ?? invoice.subtotal ?? invoice.total) ?? 0,
    discountAmount: finiteNumber(invoice.discount_amount ?? selectedPackage.discount_amount ?? snapshot.discount_amount) ?? 0,
    taxRate: rate > 1 ? rate / 100 : rate,
    taxAmount: savedTax ?? (taxLine > 0 ? taxLine : rate === 0 ? 0 : null),
    packageName: String(context.package_name || selectedPackage.name || context.package_id || 'Package not recorded'),
    paymentPlan: record(context.payment_plan),
    amountDueToBook,
    lineItems: lines,
  }
}

export function getLeadClientProposals(invoices: LuxorInvoice[]): LuxorInvoice[] {
  return invoices
    .filter((invoice) => !invoice.invoice_kind || invoice.invoice_kind === 'event')
    .sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at))
}

/** Resolve only explicit or unambiguous event links; never borrow the selected event for an older quote. */
export function findProposalLeadEvent(
  invoice: LuxorInvoice,
  events: LuxorLeadEvent[],
  bookings: LuxorBooking[],
): LuxorLeadEvent | null {
  const linkedBooking = bookings.find((booking) => booking.invoice_id === invoice.id || booking.id === invoice.booking_id)
  const eventId = invoice.lead_event_id || linkedBooking?.lead_event_id || null
  if (eventId) return events.find((event) => event.id === eventId) || null

  const context = invoice.proposal_context
  const contextEventDate = context?.event_date ?? context?.eventDate
  const eventDate = typeof contextEventDate === 'string' ? contextEventDate.slice(0, 10) : ''
  const eventType = String(context?.event_type || invoice.event_type || '').trim().toLocaleLowerCase()
  if (!eventDate || !eventType) return null
  const matches = events.filter((event) =>
    (event.target_date || '').slice(0, 10) === eventDate &&
    String(event.event_type || '').trim().toLocaleLowerCase() === eventType,
  )
  return matches.length === 1 ? matches[0] : null
}

export function getProposalCardState(input: {
  invoice: LuxorInvoice
  activities: ProposalCardActivity[]
  hasLinkedBooking?: boolean
  hasSignedAgreement?: boolean
  hasSupersedingProposal?: boolean
  hasActiveSend?: boolean
  proposalHistoryEnabled?: boolean
  now?: number
}): ProposalCardState {
  const { invoice, activities } = input
  const eventTypes = new Set(activities.map((activity) => activity.event_type))
  const hasLinkedBooking = Boolean(input.hasLinkedBooking || invoice.booking_id)
  const isSigned = Boolean(input.hasSignedAgreement)
  const isAccepted = Boolean(invoice.proposal_accepted_at || eventTypes.has('accepted') || hasLinkedBooking)
  const hasSupersedingActivity = activities.some((activity) =>
    activity.event_type === 'superseded' && Boolean(String(activity.details?.replaced_by_invoice_id || '').trim()),
  )
  const isSuperseded = Boolean(input.hasSupersedingProposal || hasSupersedingActivity)
  const isDeclined = eventTypes.has('declined')
  const isWithdrawn = invoice.offer_status === 'withdrawn'
  const isCancelled = invoice.status === 'cancelled'
  const isPaid = invoice.status === 'paid'
  const isOverdue = invoice.status === 'overdue'
  const expiry = invoice.offer_expires_at ? Date.parse(invoice.offer_expires_at) : Number.NaN
  const isExpired = invoice.offer_status === 'expired' || eventTypes.has('expired') || (Number.isFinite(expiry) && expiry <= (input.now ?? Date.now()))
  const isBlocked = isAccepted || isSigned || isSuperseded || isWithdrawn || isCancelled || isPaid
  const isPublished = Boolean(invoice.proposal_sent_at || ['sent', 'paid', 'overdue'].includes(invoice.status) || invoice.price_locked_at)
  const label = isAccepted ? 'Accepted'
    : isSuperseded ? 'Superseded'
      : isDeclined ? 'Declined'
        : isWithdrawn ? 'Withdrawn'
          : isCancelled ? 'Cancelled'
            : isPaid ? 'Paid'
              : isOverdue ? 'Overdue'
                : isExpired ? 'Expired'
                  : input.hasActiveSend ? 'Sending'
                    : invoice.proposal_latest_viewed_at || invoice.proposal_viewed_at || eventTypes.has('viewed') ? 'Viewed'
                      : eventTypes.has('delivered') ? 'Delivered'
                        : isPublished ? 'Sent' : 'Draft'

  return {
    label,
    isAccepted,
    isSigned,
    canEditDraft: !isBlocked && !isPublished && invoice.status === 'draft',
    canRevise: !isBlocked && isPublished,
    canResend: !isBlocked && !isDeclined && !isExpired && invoice.status === 'sent' && input.proposalHistoryEnabled === true,
    canDuplicate: !isBlocked,
  }
}
