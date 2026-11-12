import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { normalizeTwilioCallStatus, parseTwilioInteger, readTwilioForm, validateTwilioWebhook } from '@/lib/luxorTwilioServer'
import { notifyElenaInboundAnswered } from '@/lib/luxorElenaInboundNotificationServer'
import { startAutomaticElenaRecording } from '@/lib/luxorElenaInboundRecordingServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const CALL_SID = /^CA[0-9a-f]{32}$/i
const SCOPE = 'elena_live_inbound'
const TERMINAL = ['completed', 'busy', 'failed', 'no-answer', 'canceled']
type Call = { twilio_call_sid: string; to_number: string; status: string; outcome: string | null; metadata: Record<string, unknown>; updated_at: string }

async function recoverMissedParent(params: Record<string, string>, number: string, status: string) {
  const [existing] = await supabaseRestStrict<Call[]>(`luxor_calls?select=twilio_call_sid,to_number,status,outcome,metadata,updated_at&twilio_call_sid=eq.${params.CallSid}&limit=1`)
  if (existing) return false
  if (process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED !== 'true' || params.Direction !== 'inbound') return false
  const numberSid = process.env.LUXOR_ELENA_LIVE_NUMBER_SID || ''
  if (!/^PN[0-9a-f]{32}$/i.test(numberSid)) return false
  const selected = await supabaseRestStrict<Array<{ phone_number: string; twilio_number_sid: string }>>('luxor_phone_numbers?select=phone_number,twilio_number_sid&is_public=eq.true&limit=2')
  if (selected.length !== 1 || selected[0].phone_number !== number || selected[0].twilio_number_sid !== numberSid) return false
  const digits = (params.From || '').replace(/\D/g, '')
  const caller = digits.length === 10 ? '+1' + digits : digits.length === 11 && digits.startsWith('1') ? '+' + digits
    : (params.From || '').startsWith('+') && digits.length >= 8 && digits.length <= 15 ? '+' + digits
      : ['anonymous', 'restricted', 'unknown'].includes((params.From || '').toLowerCase()) ? 'anonymous' : null
  if (!caller) return false
  const now = new Date().toISOString()
  // A failed initial insert must not lose the caller if the database recovers
  // by hangup. This signed missed stub never authorizes OpenAI or live tools.
  await supabaseRestStrict('luxor_calls?on_conflict=twilio_call_sid', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ twilio_call_sid: params.CallSid, direction: 'inbound', status,
      from_number: caller, caller_number: caller, to_number: number, callee_number: number,
      started_at: now, ended_at: now, duration_seconds: parseTwilioInteger(params.CallDuration),
      outcome: 'missed', is_read: false, recording_consent_status: 'not_requested', transcription_status: 'not_requested',
      metadata: { scope: SCOPE, ingress_mode: 'programmable_sip', rehearsal_only: false, accepted: false,
        openai_session_id: null, ingress_recovery: true, elena_missed_recorded: true }, updated_at: now }),
  })
  return true
}

/** Only carrier-signed call progress proves a SIP leg answered. */
export async function POST(request: Request) {
  let params
  try { params = await readTwilioForm(request) } catch { return Response.json({ error: 'Invalid callback.' }, { status: 400 }) }
  if (!validateTwilioWebhook(request, params) || params.AccountSid !== process.env.LUXOR_TWILIO_ACCOUNT_SID || !CALL_SID.test(params.CallSid || '')) return Response.json({ error: 'Invalid signature or account.' }, { status: 403 })
  const number = process.env.LUXOR_ELENA_LIVE_NUMBER || ''
  if (!/^\+1\d{10}$/.test(number) || number === '+18176630380') return Response.json({ error: 'Outside live inbound.' }, { status: 403 })
  const query = new URL(request.url).searchParams
  const leg = query.get('leg')
  const child = leg === 'elena' || leg === 'transfer'
  const parent = child ? query.get('parentCallSid') || '' : params.CallSid
  if ((leg !== null && !child) || (child ? !CALL_SID.test(parent) || params.ParentCallSid !== parent || params.CallSid === parent : params.To !== number)) return Response.json({ error: 'Outside live inbound.' }, { status: 403 })
  if (!['queued', 'initiated', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled', 'answered'].includes(params.CallStatus)) return Response.json({ error: 'Invalid status.' }, { status: 400 })
  const status = normalizeTwilioCallStatus(params.CallStatus)
  const terminal = TERMINAL.includes(status)
  if (!child && !terminal) return Response.json({ ok: true, ignored: true })
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [row] = await supabaseRestStrict<Call[]>(`luxor_calls?select=twilio_call_sid,to_number,status,outcome,metadata,updated_at&twilio_call_sid=eq.${parent}&metadata->>scope=eq.${SCOPE}&limit=1`)
      // The dedicated callback can be enabled before any live Elena call exists.
      if (!row) {
        if (!child && attempt === 0 && await recoverMissedParent(params, number, status)) continue
        return Response.json({ ok: true, ignored: true })
      }
      if (row.to_number !== number || row.metadata.ingress_mode !== 'programmable_sip' || row.metadata.rehearsal_only !== false) return Response.json({ error: 'Outside live inbound.' }, { status: 403 })
      const previous = row.metadata
      const prefix = leg === 'transfer' ? 'transfer' : 'sip'
      const childKey = leg === 'transfer' ? 'transfer_call_sid' : 'sip_child_call_sid'
      if (child && ((leg === 'transfer' && previous.transfer_state !== 'attempted') || (previous[childKey] && previous[childKey] !== params.CallSid))) return Response.json({ error: 'Unbound call leg.' }, { status: 403 })
      const version = new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString()
      let patch: Record<string, unknown>
      if (child) {
        const seq = /^\d{1,9}$/.test(params.SequenceNumber || '') ? Number(params.SequenceNumber) : null
        const previousSeq = typeof previous[`${prefix}_last_sequence`] === 'number' ? Number(previous[`${prefix}_last_sequence`]) : -1
        const previousStatus = String(previous[`${prefix}_status`] || '')
        const preserve = (seq !== null && seq < previousSeq) || (TERMINAL.includes(previousStatus) && !terminal)
        const metadata = { ...previous, [childKey]: params.CallSid, [`${prefix}_status`]: preserve ? previousStatus : status,
          [`${prefix}_answered`]: previous[`${prefix}_answered`] === true || status === 'in-progress',
          ...(seq !== null ? { [`${prefix}_last_sequence`]: Math.max(previousSeq, seq) } : {}),
          ...(status === 'in-progress' && !previous[`${prefix}_answered_at`] ? { [`${prefix}_answered_at`]: new Date().toISOString() } : {}) }
        patch = { metadata, ...(leg === 'elena' && status === 'in-progress' && row.outcome === 'missed' ? { outcome: null } : {}), updated_at: version }
      } else {
        const firstMiss = previous.sip_answered !== true && previous.elena_missed_recorded !== true
        patch = { status, ended_at: new Date().toISOString(), duration_seconds: parseTwilioInteger(params.CallDuration),
          ...(firstMiss ? { is_read: false, outcome: 'missed', metadata: { ...previous, elena_missed_recorded: true } } : {}), updated_at: version }
      }
      const changed = await supabaseRestStrict<Call[]>(`luxor_calls?twilio_call_sid=eq.${parent}&metadata->>scope=eq.${SCOPE}&updated_at=eq.${encodeURIComponent(row.updated_at)}&select=twilio_call_sid`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) })
      if (!changed.length) continue
      if (leg === 'elena' && status === 'in-progress' && typeof previous.openai_session_id === 'string') {
        await notifyElenaInboundAnswered({ callSid: parent, sessionId: previous.openai_session_id })
        await startAutomaticElenaRecording(parent, previous.openai_session_id).catch(() => console.warn('[Elena Inbound] Automatic recording awaits an accepted call.'))
      }
      return Response.json({ ok: true })
    }
    return Response.json({ error: 'Call changed; retry callback.' }, { status: 503 })
  } catch { return Response.json({ error: 'Could not record live call status.' }, { status: 503 }) }
}
