import 'server-only'

import { generateLuxorCallSummaryForCall } from './luxorCallSummaryServer'
import { supabaseRestStrict } from './supabaseRestServer'

type LiveCall = { twilio_call_sid: string; answered_at: string | null; metadata: Record<string, unknown>; updated_at: string }

const SCOPE = 'elena_live_inbound'

export async function syncElenaInboundAnsweredAt(callSid: string) {
  const [row] = await supabaseRestStrict<LiveCall[]>(`luxor_calls?select=twilio_call_sid,answered_at,metadata,updated_at&twilio_call_sid=eq.${encodeURIComponent(callSid)}&metadata->>scope=eq.${SCOPE}&limit=1`)
  if (!row || row.answered_at) return row?.answered_at || null
  const answeredAt = typeof row.metadata.elena_answered_at === 'string' && Number.isFinite(Date.parse(row.metadata.elena_answered_at))
    ? row.metadata.elena_answered_at
    : typeof row.metadata.sip_answered_at === 'string' && Number.isFinite(Date.parse(row.metadata.sip_answered_at))
      ? row.metadata.sip_answered_at
      : null
  if (!answeredAt) return null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const changed = await supabaseRestStrict<LiveCall[]>(`luxor_calls?twilio_call_sid=eq.${encodeURIComponent(callSid)}&metadata->>scope=eq.${SCOPE}&answered_at=is.null&updated_at=eq.${encodeURIComponent(row.updated_at)}&select=twilio_call_sid`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ answered_at: answeredAt, updated_at: new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString() }),
    })
    if (changed.length) return answeredAt
    const [latest] = await supabaseRestStrict<LiveCall[]>(`luxor_calls?select=twilio_call_sid,answered_at,metadata,updated_at&twilio_call_sid=eq.${encodeURIComponent(callSid)}&limit=1`)
    if (latest?.answered_at) return latest.answered_at
    if (!latest) return null
    Object.assign(row, latest)
  }
  return null
}

export async function finalizeElenaInboundCall(callSid: string) {
  await syncElenaInboundAnsweredAt(callSid).catch(() => undefined)
  return generateLuxorCallSummaryForCall(callSid, { allowPartialTranscript: true })
}