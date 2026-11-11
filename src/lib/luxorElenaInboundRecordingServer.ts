import 'server-only'

import { randomUUID } from 'node:crypto'
import twilio from 'twilio'
import { getLuxorTwilioConfig } from './luxorTwilioServer'
import { supabaseRestStrict } from './supabaseRestServer'

const BASE = 'https://www.luxoratlaspalmas.com'
const SID = /^CA[0-9a-f]{32}$/i
type Call = { twilio_call_sid: string; direction: string; to_number: string; status: string; recording_consent_status: string; metadata: Record<string, unknown>; updated_at: string }

async function readBoundCall(callSid: string, sessionId: string) {
  if (!SID.test(callSid) || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,180}$/.test(sessionId)) throw new Error('Invalid live call.')
  const [row] = await supabaseRestStrict<Call[]>(`luxor_calls?select=twilio_call_sid,direction,to_number,status,recording_consent_status,metadata,updated_at&twilio_call_sid=eq.${callSid}&limit=1`)
  if (!row || row.direction !== 'inbound' || row.to_number !== process.env.LUXOR_ELENA_LIVE_NUMBER
    || !['ringing', 'in-progress'].includes(row.status) || row.metadata.scope !== 'elena_live_inbound'
    || row.metadata.rehearsal_only !== false || row.metadata.accepted !== true || row.metadata.openai_session_id !== sessionId) throw new Error('Live call is unavailable.')
  return row
}

async function update(row: Call, values: Record<string, unknown>, metadata: Record<string, unknown>, condition = '') {
  const [result] = await supabaseRestStrict<Call[]>(`luxor_calls?twilio_call_sid=eq.${row.twilio_call_sid}&updated_at=eq.${encodeURIComponent(row.updated_at)}&metadata->>scope=eq.elena_live_inbound${condition}&select=twilio_call_sid,direction,to_number,status,recording_consent_status,metadata,updated_at`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...values, metadata: { ...row.metadata, ...metadata }, updated_at: new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString() }),
  })
  return result || null
}

/** No recording starts until a later caller turn explicitly agrees. */
export async function prepareElenaRecording(callSid: string, sessionId: string) {
  const row = await readBoundCall(callSid, sessionId)
  if (row.recording_consent_status !== 'not_requested') throw new Error('Recording consent has already been decided for this call.')
  const nonce = randomUUID(), expiresAt = new Date(Date.now() + 120_000).toISOString()
  const saved = await update(row, {}, { recording_pending: { nonce, expires_at: expiresAt } }, '&recording_consent_status=eq.not_requested')
  if (!saved) throw new Error('The call changed. Ask about recording again.')
  return { nonce, expiresAt, question: 'May I record and transcribe the rest of this call so the Luxor team can review it? You can say no and we can still continue.' }
}

/** Caller affirmation and the signed session-bound nonce must be validated by the tool handler. */
export async function confirmElenaRecording(callSid: string, sessionId: string, nonce: string, consented: boolean) {
  const row = await readBoundCall(callSid, sessionId)
  const pending = row.metadata.recording_pending as { nonce?: string; expires_at?: string } | undefined
  if (row.recording_consent_status !== 'not_requested' || pending?.nonce !== nonce || !pending.expires_at || !Number.isFinite(Date.parse(pending.expires_at)) || Date.parse(pending.expires_at) <= Date.now()) throw new Error('A current recording consent question is required.')
  const next = await update(row, { recording_consent_status: consented ? 'consented' : 'declined', recording_consent_at: new Date().toISOString(), transcription_status: consented ? 'pending' : 'not_requested' }, { recording_pending: null, recording_consent_source: 'caller_voice_confirmation', recording_start_status: consented ? 'starting' : 'declined', transcription_start_status: consented ? 'starting' : 'declined' }, '&recording_consent_status=eq.not_requested')
  if (!next) throw new Error('Recording consent was already handled or the call changed.')
  if (!consented) return { consented: false, recordingStarted: false, transcriptionStarted: false }
  const config = getLuxorTwilioConfig()
  const client = twilio(config.accountSid, config.authToken, { timeout: 8000, autoRetry: false })
  let recordingStarted = false, transcriptionStarted = false, recordingSid: string | null = null, transcriptionSid: string | null = null
  try {
    const parent = await client.calls(callSid).fetch()
    if (parent.accountSid !== config.accountSid || parent.to !== process.env.LUXOR_ELENA_LIVE_NUMBER || parent.direction !== 'inbound' || parent.status !== 'in-progress') throw new Error('Call ended.')
    const recording = await client.calls(callSid).recordings.create({ recordingChannels: 'dual', recordingStatusCallback: `${BASE}/api/twilio/recording-status?recordCallSid=${callSid}`, recordingStatusCallbackMethod: 'POST', recordingStatusCallbackEvent: ['completed', 'absent'] })
    if (!/^RE[0-9a-f]{32}$/i.test(recording.sid)) throw new Error('Recording identifier unavailable.')
    recordingSid = recording.sid
    recordingStarted = true
  } catch { console.warn('[Elena Inbound] Recording did not start.') }
  if (recordingStarted) {
    try {
      const transcription = await client.calls(callSid).transcriptions.create({ name: `Luxor ${callSid}`, statusCallbackUrl: `${BASE}/api/twilio/transcriptions?recordCallSid=${callSid}`, statusCallbackMethod: 'POST', track: 'both_tracks', inboundTrackLabel: 'caller', outboundTrackLabel: 'luxor_agent', transcriptionEngine: 'google', speechModel: 'telephony', partialResults: false, enableProviderData: true })
      if (!/^GT[0-9a-f]{32}$/i.test(transcription.sid)) throw new Error('Transcription identifier unavailable.')
      transcriptionSid = transcription.sid
      transcriptionStarted = true
    } catch { console.warn('[Elena Inbound] Transcription did not start.') }
  }
  // Preserve callbacks and concurrent call metadata using optimistic updates.
  let metadataSaved = false
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [current] = await supabaseRestStrict<Call[]>(`luxor_calls?select=twilio_call_sid,direction,to_number,status,recording_consent_status,metadata,updated_at&twilio_call_sid=eq.${callSid}&limit=1`)
      if (!current || current.metadata.scope !== 'elena_live_inbound' || current.metadata.openai_session_id !== sessionId) break
      const saved = await update(current, transcriptionStarted ? {} : { transcription_status: 'failed' }, { recording_start_status: recordingStarted ? 'started' : 'failed', transcription_start_status: transcriptionStarted ? 'started' : 'failed', live_recording_sid: recordingSid, live_transcription_sid: transcriptionSid })
      if (saved) { metadataSaved = true; break }
    }
  } catch { console.warn('[Elena Inbound] Recording identifiers could not be saved.') }
  if (!metadataSaved) {
    // Without the bound identifiers we cannot honor a later stop request.
    // Stop any sessions whose identifiers are known and report uncertainty.
    if (recordingSid) await client.calls(callSid).recordings(recordingSid).update({ status: 'stopped' }).catch(() => undefined)
    if (transcriptionSid) await client.calls(callSid).transcriptions(transcriptionSid).update({ status: 'stopped' }).catch(() => undefined)
    return { consented: true, recordingStarted: false, transcriptionStarted: false, message: 'Recording could not be confirmed; continue without promising a recording or transcript.' }
  }
  return { consented: true, recordingStarted, transcriptionStarted, message: recordingStarted ? 'Recording has started for the rest of this call. Playback and transcript will be available only if processing succeeds.' : 'Recording could not be confirmed; continue the call without promising a recording or transcript.' }
}

/** Stop only the recording and transcription created for this bound live call. */
export async function stopElenaRecording(callSid: string, sessionId: string) {
  const row = await readBoundCall(callSid, sessionId)
  if (row.recording_consent_status !== 'consented') return { stopped: true, message: 'There is no active consented recording to stop.' }
  const recordingSid = row.metadata.live_recording_sid, transcriptionSid = row.metadata.live_transcription_sid
  const recordingNeeded = row.metadata.recording_start_status === 'started'
  const transcriptionNeeded = row.metadata.transcription_start_status === 'started'
  if ((recordingNeeded && (typeof recordingSid !== 'string' || !/^RE[0-9a-f]{32}$/i.test(recordingSid))) || (transcriptionNeeded && (typeof transcriptionSid !== 'string' || !/^GT[0-9a-f]{32}$/i.test(transcriptionSid))) || row.metadata.recording_start_status === 'starting') return { stopped: false, message: 'I could not confirm that recording and transcription have both stopped.' }
  const config = getLuxorTwilioConfig(), client = twilio(config.accountSid, config.authToken, { timeout: 8000, autoRetry: false })
  let recordingStopped = !recordingNeeded && row.metadata.recording_start_status !== 'failed', transcriptionStopped = !transcriptionNeeded && row.metadata.transcription_start_status !== 'failed'
  if (recordingNeeded && typeof recordingSid === 'string') {
    try { await client.calls(callSid).recordings(recordingSid).update({ status: 'stopped' }); recordingStopped = true } catch { console.warn('[Elena Inbound] Recording stop could not be confirmed.') }
  }
  if (transcriptionNeeded && typeof transcriptionSid === 'string') {
    try { await client.calls(callSid).transcriptions(transcriptionSid).update({ status: 'stopped' }); transcriptionStopped = true } catch { console.warn('[Elena Inbound] Transcription stop could not be confirmed.') }
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [current] = await supabaseRestStrict<Call[]>(`luxor_calls?select=twilio_call_sid,direction,to_number,status,recording_consent_status,metadata,updated_at&twilio_call_sid=eq.${callSid}&limit=1`)
    if (!current || current.metadata.scope !== 'elena_live_inbound' || current.metadata.openai_session_id !== sessionId) break
    const saved = await update(current, {}, { ...(recordingStopped ? { recording_start_status: 'stopped' } : {}), ...(transcriptionStopped ? { transcription_start_status: 'stopped' } : {}), recording_stop_requested_at: new Date().toISOString() })
    if (saved) break
  }
  const stopped = recordingStopped && transcriptionStopped
  return { stopped, message: stopped ? 'Recording and transcription have stopped. The portion already recorded may still be processed.' : 'I could not confirm that recording and transcription have both stopped.' }
}
