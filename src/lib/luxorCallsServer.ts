import 'server-only'

import { LuxorCall, LuxorCallDirection, LuxorCallStatus, TERMINAL_LUXOR_CALL_STATUSES } from './luxorCallTypes'
import { listLuxorInquiries } from './luxorInquiriesServer'
import { supabaseRest } from './supabaseRestServer'

type CreateCallInput = {
  twilioCallSid: string
  direction: LuxorCallDirection
  fromNumber: string
  toNumber: string
  callerNumber: string
  calleeNumber: string
  inquiryId?: string | null
  contactName?: string | null
  ownerEmail?: string | null
  status?: LuxorCallStatus
  isRead?: boolean
  metadata?: Record<string, unknown>
}

type StatusUpdate = {
  status: LuxorCallStatus
  childCallSid?: string | null
  durationSeconds?: number | null
  sequenceNumber?: number | null
  metadata?: Record<string, unknown>
}

export function normalizePhoneNumber(value: string | null | undefined) {
  const raw = String(value || '').trim()
  if (!raw) return null

  const hasLeadingPlus = raw.startsWith('+')
  const digits = raw.replace(/\D/g, '')

  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (hasLeadingPlus && digits.length >= 8 && digits.length <= 15) return `+${digits}`

  return null
}

export function assertAllowedOutboundNumber(value: string | null | undefined) {
  const normalized = normalizePhoneNumber(value)
  if (!normalized) {
    throw new Error('Enter a valid phone number, including area code.')
  }

  const allowedPrefixes = (process.env.LUXOR_TWILIO_ALLOWED_PREFIXES || '+1')
    .split(',')
    .map((prefix) => prefix.trim())
    .filter(Boolean)

  if (!allowedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    throw new Error('That destination is outside the calling regions enabled for Luxor.')
  }

  if (normalized === '+1911' || normalized === '+112') {
    throw new Error('Emergency calling is not supported by the Luxor browser phone.')
  }

  return normalized
}

export async function findLuxorInquiryByPhone(value: string | null | undefined) {
  const normalized = normalizePhoneNumber(value)
  if (!normalized) return null

  const inquiries = await listLuxorInquiries(2000)
  return inquiries.find((inquiry) => normalizePhoneNumber(inquiry.phone) === normalized) ?? null
}

export async function createOrUpdateLuxorCall(input: CreateCallInput) {
  const timestamp = new Date().toISOString()
  const payload = {
    twilio_call_sid: input.twilioCallSid,
    direction: input.direction,
    status: input.status ?? 'initiated',
    from_number: input.fromNumber,
    to_number: input.toNumber,
    caller_number: input.callerNumber,
    callee_number: input.calleeNumber,
    inquiry_id: input.inquiryId ?? null,
    contact_name: input.contactName ?? null,
    owner_email: input.ownerEmail ?? null,
    started_at: timestamp,
    is_read: input.isRead ?? input.direction === 'outbound',
    metadata: input.metadata ?? {},
    updated_at: timestamp,
  }

  const [call] = await supabaseRest<LuxorCall[]>(
    'luxor_calls?on_conflict=twilio_call_sid&select=*',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload),
    },
  )

  return call ?? null
}

export async function getLuxorCallBySid(callSid: string) {
  const [call] = await supabaseRest<LuxorCall[]>(
    `luxor_calls?select=*&or=(twilio_call_sid.eq.${encodeURIComponent(callSid)},child_call_sid.eq.${encodeURIComponent(callSid)})&limit=1`,
  )

  return call ?? null
}

export async function getLuxorCallByRecordingSid(recordingSid: string) {
  const [call] = await supabaseRest<LuxorCall[]>(
    `luxor_calls?select=*&recording_sid=eq.${encodeURIComponent(recordingSid)}&limit=1`,
  )

  return call ?? null
}

export async function updateLuxorCallStatus(recordCallSid: string, update: StatusUpdate) {
  const current = await getLuxorCallBySid(recordCallSid)
  if (!current) return null

  const nextSequence = update.sequenceNumber
  if (typeof nextSequence === 'number' && nextSequence < current.last_sequence_number) {
    return current
  }

  const timestamp = new Date().toISOString()
  const isAnswered = update.status === 'in-progress'
  const isTerminal = TERMINAL_LUXOR_CALL_STATUSES.includes(update.status)
  const payload: Partial<LuxorCall> = {
    status: update.status,
    updated_at: timestamp,
    metadata: {
      ...current.metadata,
      ...(update.metadata ?? {}),
    },
  }

  if (update.childCallSid && update.childCallSid !== current.twilio_call_sid) {
    payload.child_call_sid = update.childCallSid
  }
  if (typeof nextSequence === 'number') payload.last_sequence_number = nextSequence
  if (isAnswered && !current.answered_at) payload.answered_at = timestamp
  if (isTerminal) payload.ended_at = timestamp
  if (typeof update.durationSeconds === 'number') payload.duration_seconds = Math.max(0, update.durationSeconds)

  const [call] = await supabaseRest<LuxorCall[]>(
    `luxor_calls?select=*&id=eq.${encodeURIComponent(current.id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    },
  )

  return call ?? current
}

export async function saveLuxorVoicemail(input: {
  callSid: string
  recordingSid: string
  recordingUrl: string
  recordingDurationSeconds: number | null
  recordingStatus: string
}) {
  const current = await getLuxorCallBySid(input.callSid)
  if (!current) return null

  const [call] = await supabaseRest<LuxorCall[]>(
    `luxor_calls?select=*&id=eq.${encodeURIComponent(current.id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        recording_sid: input.recordingSid,
        recording_url: input.recordingUrl,
        recording_duration_seconds: input.recordingDurationSeconds,
        is_voicemail: true,
        is_read: false,
        updated_at: new Date().toISOString(),
        metadata: {
          ...current.metadata,
          recording_status: input.recordingStatus,
        },
      }),
    },
  )

  return call ?? current
}

export async function listLuxorCalls(options: {
  limit?: number
  inquiryId?: string | null
  unreadOnly?: boolean
} = {}) {
  const params = new URLSearchParams({
    select: '*',
    order: 'created_at.desc',
    limit: String(Math.min(Math.max(options.limit ?? 200, 1), 1000)),
  })

  if (options.inquiryId) params.set('inquiry_id', `eq.${options.inquiryId}`)
  if (options.unreadOnly) {
    params.set('direction', 'eq.inbound')
    params.set('is_read', 'eq.false')
  }

  return supabaseRest<LuxorCall[]>(`luxor_calls?${params.toString()}`)
}

export async function updateLuxorCallDetails(
  id: string,
  updates: { isRead?: boolean; notes?: string | null; outcome?: string | null },
) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof updates.isRead === 'boolean') payload.is_read = updates.isRead
  if (updates.notes !== undefined) payload.notes = updates.notes
  if (updates.outcome !== undefined) payload.outcome = updates.outcome

  const [call] = await supabaseRest<LuxorCall[]>(
    `luxor_calls?select=*&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    },
  )

  return call ?? null
}
