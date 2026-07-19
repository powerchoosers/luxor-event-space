export type LuxorMessageDirection = 'inbound' | 'outbound'
export type LuxorMessageStatus = 'accepted' | 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'undelivered' | 'failed' | 'received'

export type LuxorMessage = {
  id: string
  created_at: string
  updated_at: string
  twilio_message_sid: string
  direction: LuxorMessageDirection
  status: LuxorMessageStatus
  from_number: string
  to_number: string
  body: string
  inquiry_id: string | null
  contact_name: string | null
  owner_email: string | null
  error_code: string | null
  error_message: string | null
  media_urls: string[]
  is_read: boolean
}
