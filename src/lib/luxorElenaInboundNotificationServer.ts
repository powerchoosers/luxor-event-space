import 'server-only'

import { ELENA_ANSWERED_NOTIFICATION_BODY, ELENA_ANSWERED_NOTIFICATION_TITLE } from './luxorElenaInboundNotification'
import { supabaseRestStrict } from './supabaseRestServer'
import { sendLuxorWebPush } from './luxorWebPushServer'

const OWNER_EMAIL = 'a.patterson@luxoratlaspalmas.com'
const SCOPE = 'elena_live_inbound'
const CALL_SID = /^CA[0-9a-f]{32}$/i
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,180}$/
type LiveCall = { twilio_call_sid: string; direction: string; to_number: string; status: string; metadata: Record<string, unknown>; updated_at: string }
type NoticeResult = { status: 'skipped' | 'duplicate' | 'accepted' | 'unavailable' | 'failed'; accepted: number; failed: number }

async function readCall(callSid: string) {
  const [row] = await supabaseRestStrict<LiveCall[]>(`luxor_calls?select=twilio_call_sid,direction,to_number,status,metadata,updated_at&twilio_call_sid=eq.${callSid}&limit=1`)
  return row || null
}

function matchesSession(row: LiveCall | null, number: string, sessionId: string): row is LiveCall {
  return Boolean(row && row.direction === 'inbound' && row.to_number === number
    && row.metadata?.scope === SCOPE && row.metadata.ingress_mode === 'programmable_sip'
    && row.metadata.accepted === true && row.metadata.openai_session_id === sessionId
    && row.metadata.sip_answered === true && typeof row.metadata.sip_child_call_sid === 'string'
    && CALL_SID.test(row.metadata.sip_child_call_sid) && row.metadata.sip_child_call_sid !== row.twilio_call_sid
    && typeof row.metadata.sip_answered_at === 'string' && Number.isFinite(Date.parse(row.metadata.sip_answered_at))
    && Number.isFinite(Date.parse(row.updated_at)))
}

function nextVersion(row: LiveCall) {
  return new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString()
}

async function recordPushResult(callSid: string, number: string, sessionId: string, claimedAt: string, result: NoticeResult) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await readCall(callSid)
    if (!matchesSession(row, number, sessionId) || row.metadata.elena_answered_notification_claimed_at !== claimedAt) return
    const changed = await supabaseRestStrict<LiveCall[]>(`luxor_calls?twilio_call_sid=eq.${callSid}&updated_at=eq.${encodeURIComponent(row.updated_at)}&metadata->>scope=eq.${SCOPE}&metadata->>openai_session_id=eq.${encodeURIComponent(sessionId)}&select=twilio_call_sid`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ metadata: { ...row.metadata, elena_answered_push_result: { ...result, attempted_at: claimedAt } }, updated_at: nextVersion(row) }),
    })
    if (changed.length) return
  }
}

/** Durable portal notice first; optional owner push is attempted at most once per accepted live call. */
export async function notifyElenaInboundAnswered(input: { callSid: string; sessionId: string }): Promise<NoticeResult> {
  const skipped: NoticeResult = { status: 'skipped', accepted: 0, failed: 0 }
  const number = process.env.LUXOR_ELENA_LIVE_NUMBER || ''
  const numberSid = process.env.LUXOR_ELENA_LIVE_NUMBER_SID || ''
  if (process.env.LUXOR_ELENA_LIVE_INBOUND_ENABLED !== 'true' || !/^\+1\d{10}$/.test(number)
    || number === '+18176630380' || !/^PN[0-9a-f]{32}$/i.test(numberSid)
    || !CALL_SID.test(input.callSid) || !SESSION_ID.test(input.sessionId)) return skipped
  try {
    const selected = await supabaseRestStrict<Array<{ phone_number: string; twilio_number_sid: string; is_public: boolean }>>(`luxor_phone_numbers?select=phone_number,twilio_number_sid,is_public&is_public=eq.true&limit=2`)
    if (selected.length !== 1 || selected[0].phone_number !== number || selected[0].twilio_number_sid !== numberSid || selected[0].is_public !== true) return skipped
    let claimedAt: string | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = await readCall(input.callSid)
      if (!matchesSession(row, number, input.sessionId)) return skipped
      if (row.metadata.elena_answered_notification_claimed_at) return { status: 'duplicate', accepted: 0, failed: 0 }
      const now = new Date().toISOString()
      const changed = await supabaseRestStrict<LiveCall[]>(`luxor_calls?twilio_call_sid=eq.${input.callSid}&direction=eq.inbound&to_number=eq.${encodeURIComponent(number)}&updated_at=eq.${encodeURIComponent(row.updated_at)}&metadata->>scope=eq.${SCOPE}&metadata->>ingress_mode=eq.programmable_sip&metadata->>accepted=eq.true&metadata->>sip_answered=eq.true&metadata->>openai_session_id=eq.${encodeURIComponent(input.sessionId)}&metadata->>elena_answered_notification_claimed_at=is.null&select=twilio_call_sid`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          is_read: false,
          answered_at: row.metadata.sip_answered_at,
          metadata: { ...row.metadata, elena_answered_at: row.metadata.sip_answered_at, elena_answered_notification_claimed_at: now },
          updated_at: nextVersion(row),
        }),
      })
      if (changed.length) { claimedAt = now; break }
    }
    if (!claimedAt) return skipped
    let result: NoticeResult
    try {
      const push = await sendLuxorWebPush('call', {
        title: ELENA_ANSWERED_NOTIFICATION_TITLE, body: ELENA_ANSWERED_NOTIFICATION_BODY,
        url: '/portal/calls', tag: `elena-answer-${input.callSid}`,
      }, { userEmail: OWNER_EMAIL })
      result = { status: push.sent > 0 ? 'accepted' : push.failed > 0 ? 'failed' : 'unavailable', accepted: push.sent, failed: push.failed }
    } catch {
      result = { status: 'failed', accepted: 0, failed: 1 }
      console.warn('[Elena Inbound] The optional answered-call push could not be accepted.')
    }
    await recordPushResult(input.callSid, number, input.sessionId, claimedAt, result).catch(() => {
      console.warn('[Elena Inbound] The optional push result could not be recorded.')
    })
    return result
  } catch {
    console.warn('[Elena Inbound] The answered-call notification could not be prepared.')
    return { status: 'failed', accepted: 0, failed: 0 }
  }
}
