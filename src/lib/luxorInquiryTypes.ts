export type LuxorInquiryStatus =
  | 'new'
  | 'contacted'
  | 'tour_requested'
  | 'tour_confirmed'
  | 'proposal_sent'
  | 'booked'
  | 'closed_lost'

export const LUXOR_EVENT_TYPES = [
  'Wedding',
  'Quinceañera',
  'Baby shower',
  'Birthday',
  'Anniversary',
  'Corporate event',
  'Private celebration',
  'Other',
] as const

export type LuxorEventType = (typeof LUXOR_EVENT_TYPES)[number]

export type LuxorPipelineStage =
  | 'inquiry'
  | 'tour'
  | 'proposal'
  | 'contract'
  | 'deposit'
  | 'planning'
  | 'final_payment'
  | 'event'
  | 'closing'
  | 'closed_lost'

export type LuxorTourAttendanceStatus = 'pending' | 'attended' | 'no_show' | 'rescheduled' | 'cancelled'

export type LuxorGrandOpeningAttendee = {
  id: string
  created_at: string
  updated_at: string
  campaign_key: string
  inquiry_id: string | null
  invited_by_inquiry_id: string | null
  full_name: string
  phone: string | null
  attendee_type: 'rsvp' | 'guest'
  checked_in_at: string
  checked_in_by: 'self' | 'staff'
  marketing_opt_in: boolean
  eligible: boolean
  winner_at: string | null
  prize_label: string | null
  disqualified_at: string | null
  disqualification_reason: string | null
  metadata: Record<string, unknown>
}

export type LuxorInquiryInput = {
  fullName: string
  email?: string
  phone?: string
  eventType?: string
  targetDate?: string
  guestCount?: string
  preferredTourDate?: string
  preferredTourTime?: string
  packageInterest?: string
  message?: string
  source?: string
  flow?: string
  campaignKey?: string
  rsvpStatus?: 'attending' | 'not_attending' | 'maybe'
  marketingOptIn?: boolean
  smsOptIn?: boolean
  smsMarketingOptIn?: boolean
  website?: string
  formStartedAt?: number
  sessionId?: string
  attribution?: LuxorPublicAttribution
  attendeeCount?: string
  pagePath?: string
  referrer?: string
  metadata?: Record<string, unknown>
}

export type LuxorPublicAttribution = {
  landingPage?: string
  initialReferrer?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
  gclid?: string
  fbclid?: string
}

export type LuxorInquiry = {
  id: string
  created_at: string
  updated_at: string
  status: LuxorInquiryStatus
  source: string
  flow: string
  campaign_key: string | null
  rsvp_status: 'attending' | 'not_attending' | 'maybe' | null
  marketing_opt_in: boolean
  attendee_count: number | null
  full_name: string
  email: string | null
  phone: string | null
  event_type: string | null
  target_date: string | null
  guest_count: number | null
  preferred_tour_date: string | null
  preferred_tour_time: string | null
  package_interest: string | null
  message: string | null
  page_path: string | null
  referrer: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  pipeline_stage?: LuxorPipelineStage | null
  tour_attendance_status?: LuxorTourAttendanceStatus | null
  tour_confirmed_at?: string | null
  tour_reminder_sent_at?: string | null
  tour_no_show_email_sent_at?: string | null
  tour_response_token?: string | null
}

export type LuxorLeadEvent = {
  id: string
  created_at: string
  updated_at: string
  inquiry_id: string
  event_type: string | null
  target_date: string | null
  guest_count: number | null
  package_interest: string | null
  status: LuxorInquiryStatus
  pipeline_stage: LuxorPipelineStage
  notes: string | null
  metadata: Record<string, unknown>
  is_primary: boolean
}

export function compactText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export function parseGuestCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value))
  }

  if (typeof value !== 'string') return null

  const parsed = Number.parseInt(value.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null
}

// --- Invoice Types ---
export type LuxorInvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
export type LuxorInvoiceKind = 'event' | 'deposit' | 'final_balance' | 'security_deposit'

export type LuxorPromotion = {
  id: string
  created_at: string
  updated_at: string
  name: string
  code: string
  discount_type: 'percent' | 'fixed'
  value: number
  active: boolean
  metadata: Record<string, unknown>
}

/**
 * Immutable promotion terms copied into a proposal when it is calculated.
 * The live promotion may later be edited or deactivated; a published proposal
 * must still display and charge the exact terms the owner selected.
 */
export type LuxorProposalPromotionSnapshot = {
  id: string
  name: string
  code: string
  discount_type: 'percent' | 'fixed'
  value: number
  amount: number
}

/**
 * Owner-facing pricing evidence for calculated service rows. It keeps a
 * per-guest rate and a minimum charge visible without changing the true line
 * total used by the signed proposal.
 */
export type LuxorProposalPriceBreakdown = {
  quantity: number
  unit_price: number
  subtotal: number
  per_guest_rate?: number
  minimum?: number
  applied_minimum?: boolean
  replacement_of?: string
}

export type LuxorPaymentInstallment = {
  id: string
  created_at: string
  updated_at: string
  booking_id: string
  invoice_id: string | null
  inquiry_id: string | null
  label: string
  installment_order: number
  amount: number
  due_at: string | null
  status: 'scheduled' | 'sent' | 'partial' | 'paid' | 'void'
  payment_method: 'card' | 'cash' | 'check' | 'ACH' | 'Zelle' | null
  reference: string | null
  paid_at: string | null
  metadata: Record<string, unknown>
}

export type LuxorInvoiceLineItem = {
  id?: string
  catalogId?: string
  category?: string
  included?: boolean
  /** How this line reached the proposal. Keeps the owner audit trail clear. */
  pricingRole?: 'required' | 'included' | 'add_on' | 'discount' | 'tax' | 'custom'
  /** The pricing rule/version that produced this exact, locked line. */
  pricingRuleId?: string
  /** Used for the clear three-bucket payment summary. */
  paymentBucket?: 'venue' | 'event' | 'security_deposit'
  /** Required lines cannot be removed by a prospect or normal staff editing. */
  required?: boolean
  /** Client-safe supporting copy for a service or package inclusion. */
  detail?: string
  /** Owner-facing calculation evidence; optional for older immutable rows. */
  quoteBreakdown?: LuxorProposalPriceBreakdown
  /** A checklist-only inclusion, not a standalone priceable service. */
  isChecklistItem?: boolean
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export type LuxorProposalPaymentPlan = {
  mode: 'deposit_and_balance' | 'pay_in_full'
  booking_payment_percent: number
  final_payment_due_days_before_event: number
  /** Number of event-price payments, including the booking payment. */
  payment_count?: 2 | 3 | 4 | 5
  /** The contract/Stripe booking date used to anchor installment dates. */
  booking_date?: string
  /** Event date minus the approved final-payment lead time. */
  final_payment_due_date?: string
  /** Event date minus 30 days; never included in event-price math. */
  security_deposit_due_date?: string
  /** Frozen schedule rows for accepted/signed proposals. */
  schedule_rows?: Array<{
    installment_order: number
    label: string
    description?: string
    amount: number
    due_at: string
    payment_bucket: 'venue' | 'event' | 'security_deposit'
    status?: 'scheduled' | 'sent' | 'partial' | 'paid' | 'void'
  }>
}

export type LuxorProposalContext = {
  version: number
  pricing_config_version?: number
  package_id?: string
  package_name?: string
  event_type?: string
  event_date?: string
  start_time?: string
  end_time?: string
  expected_guest_count?: number
  rental_period?: 'morning' | 'evening' | 'full_day'
  event_access?: string
  venue_services_total?: number
  event_services_total?: number
  final_event_price?: number
  refundable_security_deposit?: number
  /** Legacy record retained for historic proposals; no longer required to publish. */
  payment_policy_acknowledged?: boolean
  amount_due_to_book?: number | null
  payment_plan?: LuxorProposalPaymentPlan
  /** Immutable promotion terms, if a saved promotion was selected. */
  promotion?: LuxorProposalPromotionSnapshot
  pricing_selection?: Record<string, unknown>
  calculation_warnings?: string[]
  calculation_errors?: string[]
  /** Items that must be completed before a calculated draft can be published. */
  publication_errors?: string[]
  [key: string]: unknown
}

export type LuxorInvoice = {
  id: string
  created_at: string
  updated_at: string
  inquiry_id: string | null
  client_name: string
  event_type: string | null
  description: string | null
  line_items: LuxorInvoiceLineItem[]
  subtotal: number
  tax_rate: number
  total: number
  original_subtotal?: number | null
  original_total?: number | null
  discount_percent?: number | null
  discount_amount?: number | null
  discount_type?: 'percent' | 'fixed' | null
  discount_value?: number | null
  /** Live saved-promotion relationship for editable proposal drafts. */
  promotion_id?: string | null
  /** Immutable saved-promotion terms used by this proposal version. */
  promotion_snapshot?: LuxorProposalPromotionSnapshot | Record<string, never> | null
  offer_expires_at?: string | null
  offer_status?: 'active' | 'redeemed' | 'expired' | 'withdrawn' | null
  offer_redeemed_at?: string | null
  stripe_coupon_id?: string | null
  stripe_promotion_code_id?: string | null
  status: LuxorInvoiceStatus
  due_date: string | null
  paid_at: string | null
  notes: string | null
  booking_id?: string | null
  lead_event_id?: string | null
  parent_invoice_id?: string | null
  invoice_kind?: LuxorInvoiceKind
  public_token?: string | null
  proposal_sent_at?: string | null
  proposal_viewed_at?: string | null
  payment_requested_at?: string | null
  payment_requested_amount?: number | null
  payment_requested_label?: string | null
  stripe_checkout_session_id?: string | null
  stripe_checkout_url?: string | null
  stripe_checkout_opened_at?: string | null
  stripe_invoice_id?: string | null
  /** Immutable pricing and payment snapshot used by the email, PDF, client page, and contract. */
  proposal_context?: LuxorProposalContext | null
  proposal_accepted_at?: string | null
  proposal_accepted_ip?: string | null
  proposal_accepted_user_agent?: string | null
  price_locked_at?: string | null
  supersedes_invoice_id?: string | null
  proposal_version?: number | null
}

export type LuxorDocumentType = 'proposal' | 'invoice' | 'contract' | 'guest_guide' | 'executed_contract' | 'contract_audit'

export type LuxorDocument = {
  id: string
  created_at: string
  updated_at: string
  inquiry_id: string | null
  invoice_id: string | null
  document_type: LuxorDocumentType
  title: string
  file_name: string
  storage_path: string
  content_type: string
  size_bytes: number
  created_by: string | null
}

export type LuxorBillStatus = 'paid' | 'unpaid' | 'overdue'

export type LuxorBill = {
  id: string
  created_at: string
  updated_at: string
  service: string
  frequency: string
  provider: string
  amount: number
  status: LuxorBillStatus
  due_date: string | null
}

// --- Note Types ---
export type LuxorNoteType = 'note' | 'call_log' | 'email_log' | 'status_change'

export type LuxorNote = {
  id: string
  created_at: string
  inquiry_id: string
  author: string
  content: string
  note_type: LuxorNoteType
}

// --- Task Types ---
export type LuxorTaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type LuxorTaskStatus = 'pending' | 'completed' | 'cancelled'

export type LuxorTask = {
  id: string
  created_at: string
  inquiry_id: string
  title: string
  description: string | null
  due_date: string | null
  completed_at: string | null
  priority: LuxorTaskPriority
  status: LuxorTaskStatus
}

export type LuxorBookingStatus = 'draft' | 'tentative' | 'confirmed' | 'completed' | 'cancelled'
export type LuxorContractStatus = 'not_sent' | 'sent' | 'viewed' | 'signed' | 'needs_follow_up' | 'void'

export type LuxorBooking = {
  id: string
  created_at: string
  updated_at: string
  inquiry_id: string | null
  invoice_id: string | null
  lead_event_id?: string | null
  client_name: string
  email: string | null
  phone: string | null
  event_type: string | null
  event_date: string | null
  start_time: string | null
  end_time: string | null
  guest_count: number | null
  package_name: string | null
  status: LuxorBookingStatus
  booked_at: string | null
  contract_total: number
  deposit_required: number
  security_deposit_amount?: number | null
  final_payment_due_date: string | null
  contract_status?: LuxorContractStatus | null
  contract_sent_at?: string | null
  contract_signed_at?: string | null
  security_deposit_status?: string | null
  notes: string | null
  metadata: Record<string, unknown>
}

export type LuxorPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'void'

export type LuxorPayment = {
  id: string
  created_at: string
  updated_at: string
  booking_id: string | null
  invoice_id: string | null
  inquiry_id: string | null
  amount: number
  status: LuxorPaymentStatus
  payment_method: string | null
  paid_at: string | null
  processor: string | null
  processor_reference: string | null
  notes: string | null
  metadata: Record<string, unknown>
}

export type LuxorBookingExpenseStatus = 'planned' | 'incurred' | 'paid' | 'cancelled'

export type LuxorBookingExpense = {
  id: string
  created_at: string
  updated_at: string
  booking_id: string | null
  category: string
  description: string | null
  vendor_name: string | null
  amount: number
  incurred_on: string | null
  status: LuxorBookingExpenseStatus
  notes: string | null
  metadata: Record<string, unknown>
}

export type LuxorDepositType = 'solidify_date' | 'non_refundable_booking'

export type LuxorEmailJobStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled'
export type LuxorEmailJobKind =
  | 'tour_confirmation'
  | 'tour_reminder'
  | 'tour_no_show_reschedule'
  | 'proposal_view_reminder'
  | 'proposal_payment_reminder'
  | 'contract_signature'
  | 'contract_view_reminder'
  | 'contract_signature_reminder'
  | 'booking_package'
  | 'deposit_payment_confirmation'
  | 'unpaid_invoice_reminder'
  | 'sixty_day_payment_reminder'
  | 'final_payment_request'
  | 'final_payment_reminder'
  | 'event_details_reminder'
  | 'event_day_reminder'
  | 'post_event_follow_up'
  | 'marketing_campaign'
  | 'grand_opening_rsvp_confirmation'


export type LuxorEmailJob = {
  id: string
  created_at: string
  updated_at: string
  inquiry_id: string | null
  booking_id: string | null
  signature_request_id: string | null
  job_type: LuxorEmailJobKind
  status: LuxorEmailJobStatus
  recipient_email: string
  subject: string
  body: string
  scheduled_for: string
  sent_at: string | null
  last_error: string | null
  attempts: number
  metadata: Record<string, unknown>
}

export type LuxorSignatureStatus = 'draft' | 'sent' | 'viewed' | 'signed' | 'void'

export type LuxorSignatureRequest = {
  id: string
  created_at: string
  updated_at: string
  booking_id: string
  inquiry_id: string | null
  client_name: string
  client_email: string
  token: string
  status: LuxorSignatureStatus
  contract_title: string
  contract_body: string
  signed_name: string | null
  signed_at: string | null
  client_first_name?: string | null
  client_last_name?: string | null
  owner_name?: string | null
  owner_email?: string | null
  owner_signed_at?: string | null
  contract_document_path?: string | null
  guest_guide_path?: string | null
  executed_document_path?: string | null
  audit_document_path?: string | null
  document_hash?: string | null
  signer_ip: string | null
  signer_user_agent: string | null
  expires_at: string | null
  metadata: Record<string, unknown>
}

export type LuxorMarketingCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'
export type LuxorMarketingRecipientStatus = 'queued' | 'sent' | 'failed' | 'cancelled'
export type LuxorMarketingEventType = 'open' | 'click' | 'unsubscribe'

export type LuxorMarketingCampaign = {
  id: string
  created_at: string
  updated_at: string
  name: string
  subject: string
  html_body: string
  status: LuxorMarketingCampaignStatus
  audience_label: string | null
  scheduled_for: string | null
  sent_at: string | null
  created_by: string | null
  recipient_count: number
  metadata: Record<string, unknown>
}

export type LuxorMarketingRecipient = {
  id: string
  created_at: string
  updated_at: string
  campaign_id: string
  email_job_id: string | null
  email: string
  name: string | null
  status: LuxorMarketingRecipientStatus
  tracking_token: string
  sent_at: string | null
  last_error: string | null
  open_count: number
  click_count: number
  first_opened_at: string | null
  last_opened_at: string | null
  last_clicked_at: string | null
  metadata: Record<string, unknown>
}

export type LuxorMarketingEvent = {
  id: string
  created_at: string
  campaign_id: string
  recipient_id: string
  event_type: LuxorMarketingEventType
  url: string | null
  ip_address: string | null
  user_agent: string | null
  device_type: string | null
  metadata: Record<string, unknown>
}

export type LuxorMarketingTemplate = {
  id: string
  created_at: string
  updated_at: string
  name: string
  subject: string
  description: string | null
  category: string
  blocks: Record<string, unknown>[]
  preview_color: string
  created_by: string | null
  last_used_at: string | null
  metadata: Record<string, unknown>
}

export type LuxorMarketingSuppression = {
  id: string
  created_at: string
  email: string
  reason: string
  source: string | null
  metadata: Record<string, unknown>
}

export type LuxorVendor = {
  id: string
  created_at: string
  updated_at: string
  vendor_type: string
  name: string
  email: string | null
  phone: string | null
  rating: string | null
  coi_active: boolean
}
