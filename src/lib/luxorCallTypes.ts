export type LuxorCallDirection = 'inbound' | 'outbound'

export type LuxorCallStatus =
  | 'queued'
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'busy'
  | 'failed'
  | 'no-answer'
  | 'canceled'

export type LuxorCall = {
  id: string
  created_at: string
  updated_at: string
  twilio_call_sid: string
  child_call_sid: string | null
  direction: LuxorCallDirection
  status: LuxorCallStatus
  from_number: string
  to_number: string
  caller_number: string
  callee_number: string
  inquiry_id: string | null
  contact_name: string | null
  owner_email: string | null
  started_at: string
  answered_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  outcome: string | null
  notes: string | null
  recording_sid: string | null
  recording_url: string | null
  recording_duration_seconds: number | null
  is_voicemail: boolean
  is_read: boolean
  last_sequence_number: number
  metadata: Record<string, unknown>
}

export const LUXOR_CALL_STATUSES: LuxorCallStatus[] = [
  'queued',
  'initiated',
  'ringing',
  'in-progress',
  'completed',
  'busy',
  'failed',
  'no-answer',
  'canceled',
]

export const TERMINAL_LUXOR_CALL_STATUSES: LuxorCallStatus[] = [
  'completed',
  'busy',
  'failed',
  'no-answer',
  'canceled',
]

