export type LuxorInquiryStatus =
  | 'new'
  | 'contacted'
  | 'tour_requested'
  | 'tour_confirmed'
  | 'proposal_sent'
  | 'booked'
  | 'closed_lost'

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
  attendeeCount?: string
  pagePath?: string
  referrer?: string
  metadata?: Record<string, unknown>
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

export type LuxorInvoiceLineItem = {
  description: string
  quantity: number
  unitPrice: number
  total: number
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
  status: LuxorInvoiceStatus
  due_date: string | null
  paid_at: string | null
  notes: string | null
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

export type LuxorEmailJobStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled'
export type LuxorEmailJobKind = 'tour_confirmation' | 'tour_reminder' | 'tour_no_show_reschedule' | 'contract_signature' | 'marketing_campaign'

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
