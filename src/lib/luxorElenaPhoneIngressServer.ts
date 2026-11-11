import 'server-only'

import { normalizePhoneNumber } from './luxorCallsServer'
import { ELENA_PHONE_TEST_NUMBER } from './luxorElenaPhoneTestServer'
import { deriveElenaIngressToken, hashElenaIngressToken } from './luxorElenaPhoneIngressProof'
import { supabaseRestStrict } from './supabaseRestServer'
import {
  createTwilioVoiceResponse, forbiddenTwimlResponse, getLuxorTwilioConfig,
  readTwilioForm, twimlResponse, validateTwilioWebhook, type TwilioForm,
} from './luxorTwilioServer'

const PUBLIC_BASE = 'https://www.luxoratlaspalmas.com'
const CALL_SID = /^CA[0-9a-f]{32}$/i
const SCOPE = 'elena_phone_test'
const INGRESS_MODE = 'programmable_sip'
type IngressCall = { twilio_call_sid: string; to_number: string; status: string; metadata: Record<string, unknown>; updated_at: string }

function hangupResponse() {
  const response = createTwilioVoiceResponse()
  response.hangup()
  return twimlResponse(response)
}

function unavailableResponse() {
  const response = createTwilioVoiceResponse()
  response.say('Elena’s test line is temporarily unavailable. Please try again shortly.')
  response.hangup()
  return twimlResponse(response)
}

async function readVerifiedForm(request: Request, incoming: boolean): Promise<TwilioForm | null> {
  try {
    const params = await readTwilioForm(request)
    const config = getLuxorTwilioConfig()
    if (!validateTwilioWebhook(request, params) || params.AccountSid !== config.accountSid
      || normalizePhoneNumber(params.To) !== ELENA_PHONE_TEST_NUMBER || !CALL_SID.test(params.CallSid || '')
      || (incoming && params.Direction !== 'inbound')) return null
    return params
  } catch { return null }
}

async function readIngressCall(callSid: string) {
  const [row] = await supabaseRestStrict<IngressCall[]>(`luxor_calls?select=twilio_call_sid,to_number,status,metadata,updated_at&twilio_call_sid=eq.${callSid}&limit=1`)
  return row || null
}

function isIngressCall(row: IngressCall | null): row is IngressCall {
  return Boolean(row && row.to_number === ELENA_PHONE_TEST_NUMBER && row.metadata.scope === SCOPE && row.metadata.ingress_mode === INGRESS_MODE)
}

async function assertNonPublicTestNumber() {
  const selected = await supabaseRestStrict<Array<{ phone_number: string; is_public: boolean }>>('luxor_phone_numbers?select=phone_number,is_public&or=(is_active.eq.true,is_public.eq.true)')
  if (selected.some((row) => row.phone_number === ELENA_PHONE_TEST_NUMBER && row.is_public)) {
    throw new Error('A public Luxor number cannot be used for the Elena test.')
  }
}

/** Authenticate the PSTN parent before issuing any OpenAI SIP call. */
export async function handleElenaPhoneIncoming(request: Request) {
  const params = await readVerifiedForm(request, true)
  if (!params) return forbiddenTwimlResponse()
  try {
    if (process.env.LUXOR_ELENA_PHONE_TEST_ENABLED !== 'true' || process.env.LUXOR_ELENA_TEST_NUMBER !== ELENA_PHONE_TEST_NUMBER) return unavailableResponse()
    const projectId = process.env.OPENAI_PROJECT_ID || ''
    const secret = process.env.OPENAI_VOICE_WEBHOOK_SECRET || ''
    if (!/^proj_[A-Za-z0-9_-]+$/.test(projectId) || !secret.startsWith('whsec_') || secret.length < 32) return unavailableResponse()
    await assertNonPublicTestNumber()
    const from = normalizePhoneNumber(params.From)
    if (!from && !['anonymous', 'restricted', 'unknown'].includes(String(params.From || '').toLowerCase())) return forbiddenTwimlResponse()
    const caller = from || 'anonymous'
    const token = deriveElenaIngressToken(params.CallSid, secret)
    const tokenHash = hashElenaIngressToken(token, secret)
    const now = Date.now()
    // A carrier retry must not replace a ticket or reset a session already claimed.
    await supabaseRestStrict('luxor_calls?on_conflict=twilio_call_sid', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        twilio_call_sid: params.CallSid, direction: 'inbound', status: 'ringing',
        from_number: caller, to_number: ELENA_PHONE_TEST_NUMBER, caller_number: caller, callee_number: ELENA_PHONE_TEST_NUMBER,
        contact_name: 'Elena phone test', started_at: new Date(now).toISOString(), is_read: true,
        recording_consent_status: 'not_requested', transcription_status: 'not_requested',
        metadata: { scope: SCOPE, ingress_mode: INGRESS_MODE, ingress_token_hash: tokenHash,
          ingress_expires_at: new Date(now + 120_000).toISOString(), openai_session_id: null, accepted: false,
          transfer_state: 'none', rehearsal_only: true }, updated_at: new Date(now).toISOString(),
      }),
    })
    const row = await readIngressCall(params.CallSid)
    if (isIngressCall(row) && (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(row.status)
      || row.metadata.accepted === true || (typeof row.metadata.openai_session_id === 'string' && row.metadata.openai_session_id.length > 0))) {
      return hangupResponse()
    }
    if (!isIngressCall(row) || row.metadata.ingress_token_hash !== tokenHash
      || typeof row.metadata.ingress_expires_at !== 'string' || Date.parse(row.metadata.ingress_expires_at) <= Date.now()
      || !Number.isFinite(Date.parse(row.metadata.ingress_expires_at))) return unavailableResponse()
    const uri = `sip:${projectId}@sip.api.openai.com;transport=tls;secure=true?X-Luxor-Ingress=${token}`
    if (uri.length >= 255) return unavailableResponse()
    const response = createTwilioVoiceResponse()
    response.dial({ answerOnBridge: true, timeout: 30, callerId: ELENA_PHONE_TEST_NUMBER,
      action: `${PUBLIC_BASE}/api/elena-phone-test/complete`, method: 'POST' }).sip(uri)
    return twimlResponse(response)
  } catch {
    // Do not log the SIP URI or the caller's transient ingress ticket.
    console.warn('[Elena Phone Test] The signed phone ingress could not be prepared.')
    return unavailableResponse()
  }
}

async function recordDialCompletion(callSid: string, params: TwilioForm) {
  const childSid = CALL_SID.test(params.DialCallSid || '') ? params.DialCallSid : null
  const statuses = ['completed', 'busy', 'no-answer', 'failed', 'canceled']
  const status = statuses.includes(params.DialCallStatus || '') ? params.DialCallStatus : null
  const duration = /^\d{1,7}$/.test(params.DialCallDuration || '') ? Number(params.DialCallDuration) : null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await readIngressCall(callSid)
    if (!isIngressCall(row)) return false
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString()
    const updated = await supabaseRestStrict<IngressCall[]>(`luxor_calls?twilio_call_sid=eq.${callSid}&updated_at=eq.${encodeURIComponent(row.updated_at)}&metadata->>scope=eq.${SCOPE}&metadata->>ingress_mode=eq.${INGRESS_MODE}&select=twilio_call_sid,to_number,metadata,updated_at`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ metadata: { ...row.metadata, sip_dial_status: status, sip_child_call_sid: childSid,
        sip_dial_duration_seconds: duration }, updated_at: updatedAt }),
    })
    if (updated.length) return true
  }
  return false
}

/** Dial completion does not send texts, record audio, or overwrite parent-call status. */
export async function handleElenaPhoneComplete(request: Request) {
  const params = await readVerifiedForm(request, false)
  if (!params) return forbiddenTwimlResponse()
  try {
    if (!await recordDialCompletion(params.CallSid, params)) return forbiddenTwimlResponse()
  } catch { return unavailableResponse() }
  const response = createTwilioVoiceResponse()
  if (['busy', 'no-answer', 'failed', 'canceled'].includes(params.DialCallStatus || '')) response.say('Elena’s test call could not connect. Please try again shortly.')
  response.hangup()
  return twimlResponse(response)
}

/** The carrier can invoke fallback before the incoming route has persisted a row. */
export async function handleElenaPhoneFallback(request: Request) {
  const params = await readVerifiedForm(request, false)
  if (!params) return forbiddenTwimlResponse()
  return unavailableResponse()
}
