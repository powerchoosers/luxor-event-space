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

export async function getLuxorCallById(id: string) {
  const [call] = await supabaseRest<LuxorCall[]>(`luxor_calls?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
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

export async function saveLuxorConsent(callSid: string, consented: boolean) {
  const current = await getLuxorCallBySid(callSid)
  if (!current) return null
  if (TERMINAL_LUXOR_CALL_STATUSES.includes(current.status)) return null
  const [call] = await supabaseRest<LuxorCall[]>(`luxor_calls?select=*&id=eq.${encodeURIComponent(current.id)}&recording_consent_status=eq.not_requested&status=not.in.(completed,busy,failed,no-answer,canceled)`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      recording_consent_status: consented ? 'consented' : 'declined',
      recording_consent_at: new Date().toISOString(),
      transcription_status: consented ? 'pending' : 'not_requested',
      updated_at: new Date().toISOString(),
      metadata: { ...current.metadata, recording_consent_source: 'twilio_dtmf', recording_consent_call_sid: callSid },
    }),
  })
  return call ?? current
}

export async function claimLuxorOutboundRecording(callSid: string) {
  const current = await getLuxorCallBySid(callSid)
  if (!current || current.recording_consent_status !== 'consented') return null
  const [claimed] = await supabaseRest<LuxorCall[]>(`luxor_calls?select=*&id=eq.${encodeURIComponent(current.id)}&recording_consent_status=eq.consented&or=(metadata->>recording_start_status.is.null,metadata->>recording_start_status.eq.failed)`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ metadata: { ...current.metadata, recording_start_status: 'starting' }, updated_at: new Date().toISOString() }),
  })
  return claimed ?? null
}

export async function setLuxorOutboundRecordingStart(callSid: string, status: 'started' | 'failed') {
  const current = await getLuxorCallBySid(callSid)
  if (!current) return null
  const [updated] = await supabaseRest<LuxorCall[]>(`luxor_calls?select=*&id=eq.${encodeURIComponent(current.id)}&metadata->>recording_start_status=eq.starting`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ metadata: { ...current.metadata, recording_start_status: status }, updated_at: new Date().toISOString() }),
  })
  return updated ?? current
}

export async function saveLuxorTranscriptEvent(input: {
  callSid: string; event: string; sequenceId: number; transcriptionSid: string; transcriptionData?: string; track?: string; timestamp?: string
}) {
  const call = await getLuxorCallBySid(input.callSid)
  if (!call || call.recording_consent_status !== 'consented') return null
  const previousSequence = Number(call.metadata.transcription_sequence || 0)
  const metadata = input.transcriptionData ? JSON.parse(input.transcriptionData) as Record<string, unknown> : {}
  const alternatives = Array.isArray(metadata.alternatives) ? metadata.alternatives as Array<Record<string, unknown>> : []
  const text = String(metadata.transcript || metadata.text || alternatives[0]?.transcript || '').trim().slice(0, 4000)
  const track = String(metadata.track || input.track || 'both_tracks')
  const final = metadata.is_final === true || metadata.final === true
  let addedSegment = false
  if (text) {
    const eventTime = input.timestamp || new Date().toISOString()
    const eventMs = Date.parse(eventTime)
    const callStartMs = Date.parse(call.answered_at || call.started_at)
    const startSeconds = Number.isFinite(eventMs) && Number.isFinite(callStartMs) ? Math.max(0, (eventMs - callStartMs) / 1000) : null
    const inserted = await supabaseRest<Array<{ id: string }>>('luxor_call_transcript_segments?on_conflict=call_id%2Ctranscription_sid%2Csequence_id%2Ctrack', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ call_id: call.id, transcription_sid: input.transcriptionSid, sequence_id: input.sequenceId, track, segment_start_seconds: startSeconds, segment_text: text, is_final: final, event_timestamp: eventTime }),
    })
    addedSegment = inserted.length > 0
  }
  const isStale = input.sequenceId <= previousSequence
  if (isStale && !addedSegment) return call
  const nextSequence = Math.max(previousSequence, input.sequenceId)
  let status = call.transcription_status || 'pending'
  if (input.event === 'transcription-stopped' && status !== 'failed') status = 'completed'
  else if (input.event === 'transcription-error' && status !== 'completed') status = 'failed'
  else if (input.event === 'transcription-content' && status !== 'completed') status = 'processing'
  else if (input.event === 'transcription-started' && status === 'not_requested') status = 'pending'
  const patch: Partial<LuxorCall> = {
    transcription_status: status as LuxorCall['transcription_status'],
    updated_at: new Date().toISOString(),
  }
  if (addedSegment && (call.summary_status === 'completed' || call.summary_status === 'generating')) {
    patch.summary_status = 'not_generated'
    patch.summary_text = null
    patch.summary_generated_at = null
  }
  patch.metadata = { ...call.metadata, transcription_sequence: nextSequence, transcription_event: input.event }
  const sequenceFilter = previousSequence === 0
    ? 'or=(metadata->>transcription_sequence.is.null,metadata->>transcription_sequence.eq.0)'
    : `metadata->>transcription_sequence=eq.${previousSequence}`
  const filter = isStale ? `transcription_status=eq.${call.transcription_status}` : sequenceFilter
  const [updated] = await supabaseRest<LuxorCall[]>(`luxor_calls?select=*&id=eq.${encodeURIComponent(call.id)}&${filter}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  return updated ?? call
}

export async function saveLuxorRecordingCopy(input: { callSid: string; recordingSid: string; durationSeconds: number | null; recordingUrl: string; voicemail?: boolean }) {
  const call = await getLuxorCallBySid(input.callSid)
  const isVoicemail = input.voicemail === true || call?.is_voicemail === true
  if (!call || (!isVoicemail && call.recording_consent_status !== 'consented')) return null
  if (call.recording_sid === input.recordingSid && call.recording_storage_path) return call
  const configUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const twilioAccountSid = process.env.LUXOR_TWILIO_ACCOUNT_SID?.trim()
  const twilioAuthToken = process.env.LUXOR_TWILIO_AUTH_TOKEN?.trim()
  if (!configUrl || !serviceKey || !twilioAccountSid || !twilioAuthToken) throw new Error('Recording storage or Twilio credentials are not configured.')

  const safeCallSid = call.twilio_call_sid.replace(/[^A-Za-z0-9]/g, '')
  const safeRecordingSid = input.recordingSid.replace(/[^A-Za-z0-9]/g, '')
  if (!/^RE[0-9A-Za-z]{32}$/.test(input.recordingSid) || !/^CA[0-9A-Za-z]{32}$/.test(call.twilio_call_sid)) throw new Error('Invalid Twilio recording identifiers.')
  const media = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Recordings/${safeRecordingSid}.mp3`, {
    headers: { Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')}` }, cache: 'no-store',
  })
  if (!media.ok) throw new Error(`Twilio recording download failed (${media.status}).`)
  const contentLength = Number(media.headers.get('content-length') || 0)
  if (contentLength > 524288000) throw new Error('Recording size is outside the permitted storage limit.')
  const path = `${call.inquiry_id || 'unlinked'}/${safeCallSid}/${safeRecordingSid}.mp3`
  const storageBase = `${configUrl.replace(/\/$/, '')}/storage/v1/object/luxor-call-recordings/${path}`
  const copied = await fetch(storageBase, {
    method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'audio/mpeg', ...(contentLength > 0 ? { 'Content-Length': String(contentLength) } : {}), 'x-upsert': 'true' },
    body: media.body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
  if (!copied.ok) throw new Error(`Private recording copy failed (${copied.status}).`)
  const [updated] = await supabaseRest<LuxorCall[]>(`luxor_calls?select=*&id=eq.${encodeURIComponent(call.id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ recording_sid: input.recordingSid, recording_url: input.recordingUrl, recording_duration_seconds: input.durationSeconds, recording_storage_path: path, is_voicemail: isVoicemail, is_read: isVoicemail ? false : call.is_read, updated_at: new Date().toISOString(), metadata: { ...call.metadata, recording_copy_status: 'stored_private', recording_retention: 'indefinite' } }),
  })
  return updated ?? call
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

  const calls = await supabaseRest<LuxorCall[]>(`luxor_calls?${params.toString()}`)
  if (!calls.length) return calls
  const callIds = calls.map((call) => call.id)
  const rows = await supabaseRest<Array<{ id: string; call_id: string; sequence_id: number; track: string; segment_text: string; event_timestamp: string | null; segment_start_seconds: number | null }>>(
    `luxor_call_transcript_segments?select=id,call_id,sequence_id,track,segment_text,event_timestamp,segment_start_seconds&call_id=in.(${callIds.join(',')})&order=segment_start_seconds.asc.nullsfirst,sequence_id.asc`,
  )
  const segmentsByCall = new Map<string, NonNullable<LuxorCall['transcript_segments']>>()
  for (const row of rows) {
    const segments = segmentsByCall.get(row.call_id) ?? []
    segments.push({ id: row.id, text: row.segment_text, track: row.track, timestamp: row.event_timestamp || '', final: true, startSeconds: row.segment_start_seconds })
    segmentsByCall.set(row.call_id, segments)
  }
  return calls.map((call) => ({ ...call, transcript_segments: segmentsByCall.get(call.id) ?? [] }))
}

export async function getLuxorTranscriptSegments(callId: string) {
  return supabaseRest<Array<{ id: string; track: string; segment_text: string; event_timestamp: string | null; sequence_id: number; segment_start_seconds: number | null }>>(
    `luxor_call_transcript_segments?select=id,track,segment_text,event_timestamp,sequence_id,segment_start_seconds&call_id=eq.${encodeURIComponent(callId)}&order=segment_start_seconds.asc.nullsfirst,sequence_id.asc`,
  )
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
