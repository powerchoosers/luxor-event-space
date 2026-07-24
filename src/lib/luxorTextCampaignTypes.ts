export type LuxorTextCampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'cancelled'

export type LuxorTextCampaignType =
  | 'customer_care'
  | 'transactional'
  | 'tour'
  | 'event'
  | 'payment'
  | 'invoice'
  | 'elena'

export type LuxorTextJobKind =
  | 'manual_campaign'
  | 'inquiry_confirmation'
  | 'tour_confirmation'
  | 'tour_reminder'
  | 'event_reminder'
  | 'payment_confirmation'
  | 'invoice_due_reminder'
  | 'invoice_overdue_reminder'

export type LuxorTextJobStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'undelivered'
  | 'failed'
  | 'cancelled'
  | 'skipped'

export type LuxorTextCampaign = {
  id: string
  created_at: string
  updated_at: string
  name: string
  body_template: string
  campaign_type: LuxorTextCampaignType
  status: LuxorTextCampaignStatus
  audience_label: string | null
  audience_filter: Record<string, unknown>
  scheduled_for: string | null
  sent_at: string | null
  created_by: string | null
  recipient_count: number
  sent_count: number
  delivered_count: number
  failed_count: number
  reply_count: number
  opt_out_count: number
  estimated_segments: number
  metadata: Record<string, unknown>
}

export type LuxorTextCampaignRecipient = {
  id: string
  created_at: string
  updated_at: string
  campaign_id: string
  text_job_id: string | null
  inquiry_id: string | null
  booking_id: string | null
  invoice_id: string | null
  phone_number: string
  name: string | null
  personalized_body: string
  status: LuxorTextJobStatus
  twilio_message_sid: string | null
  segment_count: number
  sent_at: string | null
  delivered_at: string | null
  replied_at: string | null
  opted_out_at: string | null
  error_code: string | null
  error_message: string | null
  metadata: Record<string, unknown>
}

export type LuxorTextJob = {
  id: string
  created_at: string
  updated_at: string
  campaign_id: string | null
  campaign_recipient_id: string | null
  inquiry_id: string | null
  booking_id: string | null
  invoice_id: string | null
  job_type: LuxorTextJobKind
  status: LuxorTextJobStatus
  recipient_phone: string
  recipient_name: string | null
  body: string
  segment_count: number
  scheduled_for: string
  sent_at: string | null
  attempts: number
  twilio_message_sid: string | null
  last_error: string | null
  automation_key: string | null
  metadata: Record<string, unknown>
}

export type LuxorTextAudienceRecipient = {
  inquiryId: string
  phone: string
  name: string
  eventType: string | null
  status: string
  targetDate: string | null
  tourDate: string | null
  tourTime: string | null
}

export type LuxorTextAudienceFilter = {
  inquiryIds?: string[]
  statuses?: string[]
  eventTypes?: string[]
}
