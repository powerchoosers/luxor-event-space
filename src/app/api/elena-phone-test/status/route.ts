import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { normalizeTwilioCallStatus, parseTwilioInteger, readTwilioForm, validateTwilioWebhook } from '@/lib/luxorTwilioServer'
import { ELENA_PHONE_TEST_NUMBER } from '@/lib/luxorElenaPhoneTestServer'

export const runtime = 'nodejs'

const CALL_SID = /^CA[0-9a-f]{32}$/i
const TERMINAL_STATUSES = ['completed', 'busy', 'failed', 'no-answer', 'canceled']
type TestCallState = { updated_at: string; metadata?: Record<string, unknown> }

/** Signed test-call updates only. Never starts transcription, recording, texts or customer workflows. */
export async function POST(request: Request) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) return Response.json({ error: 'Invalid signature.' }, { status: 403 })
  if (!CALL_SID.test(params.CallSid || '') || params.AccountSid !== process.env.LUXOR_TWILIO_ACCOUNT_SID) return Response.json({ error: 'Outside phone test.' }, { status: 403 })
  const query = new URL(request.url).searchParams
  const transfer = query.get('leg') === 'transfer'
  const parentCallSid = transfer ? query.get('parentCallSid') || '' : params.CallSid
  if (query.has('leg') && !transfer) return Response.json({ error: 'Unknown test call leg.' }, { status: 403 })
  if (transfer ? !CALL_SID.test(parentCallSid) || params.ParentCallSid !== parentCallSid || params.CallSid === parentCallSid : params.To !== ELENA_PHONE_TEST_NUMBER) return Response.json({ error: 'Outside phone test.' }, { status: 403 })
  try {
    const status = normalizeTwilioCallStatus(params.CallStatus)
    if (!['queued', 'initiated', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled', 'answered'].includes(params.CallStatus)) return Response.json({ error: 'Invalid test call status.' }, { status: 400 })
    const terminal = TERMINAL_STATUSES.includes(status)
    if (!transfer && !terminal) return Response.json({ ok: true, ignored: true })
    const [row] = await supabaseRestStrict<TestCallState[]>(`luxor_calls?select=updated_at${transfer ? ',metadata' : ''}&twilio_call_sid=eq.${parentCallSid}&metadata->>scope=eq.elena_phone_test&limit=1`)
    if (!row) return Response.json({ ok: true, ignored: true })
    if (transfer && (row.metadata?.scope !== 'elena_phone_test' || row.metadata.transfer_state !== 'attempted' || (row.metadata.transfer_call_sid && row.metadata.transfer_call_sid !== params.CallSid))) return Response.json({ error: 'Transfer was not authorized for this call.' }, { status: 403 })
    const updatedAt = new Date(Math.max(Date.now(), new Date(row.updated_at).getTime() + 1)).toISOString()
    let patch: Record<string, unknown>
    if (transfer) {
      const previous = row.metadata!
      const sequence = /^\d{1,9}$/.test(params.SequenceNumber || '') ? Number(params.SequenceNumber) : null
      const previousSequence = typeof previous.transfer_last_sequence === 'number' ? previous.transfer_last_sequence : -1
      const previousStatus = String(previous.transfer_status || '')
      const oldStatusWins = (sequence !== null && sequence < previousSequence) || (TERMINAL_STATUSES.includes(previousStatus) && !terminal)
      patch = { metadata: { ...previous, transfer_call_sid: params.CallSid, transfer_status: oldStatusWins ? previousStatus : status, transfer_answered: previous.transfer_answered === true || status === 'in-progress', ...(sequence !== null ? { transfer_last_sequence: Math.max(sequence, previousSequence) } : {}) }, updated_at: updatedAt }
    } else {
      patch = { status, ended_at: new Date().toISOString(), duration_seconds: parseTwilioInteger(params.CallDuration), updated_at: updatedAt }
    }
    const changed = await supabaseRestStrict<Array<{ twilio_call_sid: string }>>(`luxor_calls?twilio_call_sid=eq.${parentCallSid}&metadata->>scope=eq.elena_phone_test${transfer ? '&metadata->>transfer_state=eq.attempted' : ''}&updated_at=eq.${encodeURIComponent(row.updated_at)}&select=twilio_call_sid`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    })
    if (!changed.length) return Response.json({ error: 'Call status changed; retry callback.' }, { status: 503 })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Could not record test call status.' }, { status: 503 })
  }
}
