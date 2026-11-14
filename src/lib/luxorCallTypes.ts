export type LuxorCallDirection = 'inbound' | 'outbound'

// Transcription runs on the customer-facing leg for both incoming and outgoing calls.
// Twilio's inbound track is audio received from that leg; outbound is audio sent to it.
// Elena live inbound uses a programmable SIP bridge, so inbound/outbound tracks are reversed.
export function luxorElenaLiveInboundTranscriptUsesSipBridge(metadata: Record<string, unknown> | null | undefined) {
  return metadata?.scope === 'elena_live_inbound'
}

export function luxorTranscriptSpeaker(track: string, options: { elenaSipBridge?: boolean } = {}): 'caller' | 'luxor' | 'unknown' {
  const lower = track.toLowerCase()
  if (options.elenaSipBridge) {
    if (lower === 'inbound_track' || lower === 'inbound') return 'luxor'
    if (lower === 'outbound_track' || lower === 'outbound') return 'caller'
  }
  switch (lower) {
    case 'inbound_track':
    case 'caller':
    case 'customer':
      return 'caller'
    case 'outbound_track':
    case 'luxor_agent':
    case 'agent':
      return 'luxor'
    default:
      return 'unknown'
  }
}

export function luxorTranscriptStorageTrack(track: string, metadata: Record<string, unknown> | null | undefined) {
  if (!luxorElenaLiveInboundTranscriptUsesSipBridge(metadata)) return track
  const lower = track.toLowerCase()
  if (lower === 'inbound_track' || lower === 'inbound') return 'luxor_agent'
  if (lower === 'outbound_track' || lower === 'outbound') return 'caller'
  return track
}

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
  recording_storage_path?: string | null
  recording_started_at?: string | null
  recording_consent_status?: 'not_requested' | 'consented' | 'declined' | 'automatic'
  recording_consent_at?: string | null
  transcription_status?: 'not_requested' | 'pending' | 'processing' | 'completed' | 'failed'
  transcript_segments?: Array<{ id: string; text: string; originalText?: string; spokenLanguages?: string[]; translationStatus?: string; track: string; timestamp: string; final: boolean; startSeconds?: number | null }>
  summary_status?: 'not_generated' | 'generating' | 'completed' | 'failed'
  summary_text?: string | null
  summary_generated_at?: string | null
  summary_model?: string | null
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

