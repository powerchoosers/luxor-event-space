import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { normalizeTwilioCallStatus, parseTwilioInteger, readTwilioForm, validateTwilioWebhook } from '@/lib/luxorTwilioServer'
import { ELENA_PHONE_TEST_NUMBER } from '@/lib/luxorElenaPhoneTestServer'

export const runtime = 'nodejs'

/** Test call completion only. Never starts transcription, recording, texts or customer workflows. */
export async function POST(request: Request) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) return Response.json({ error: 'Invalid signature.' }, { status: 403 })
  if (!/^CA[0-9a-f]{32}$/i.test(params.CallSid || '') || params.AccountSid !== process.env.LUXOR_TWILIO_ACCOUNT_SID || params.To !== ELENA_PHONE_TEST_NUMBER) return Response.json({ error: 'Outside phone test.' }, { status: 403 })
  try {
    const status = normalizeTwilioCallStatus(params.CallStatus)
    const terminal = ['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(status)
    if (!terminal) return Response.json({ ok: true, ignored: true })
    const [row] = await supabaseRestStrict<Array<{ updated_at: string }>>(`luxor_calls?select=updated_at&twilio_call_sid=eq.${params.CallSid}&metadata->>scope=eq.elena_phone_test&limit=1`)
    if (!row) return Response.json({ ok: true, ignored: true })
    const updatedAt = new Date(Math.max(Date.now(), new Date(row.updated_at).getTime() + 1)).toISOString()
    const changed = await supabaseRestStrict<Array<{ twilio_call_sid: string }>>(`luxor_calls?twilio_call_sid=eq.${params.CallSid}&metadata->>scope=eq.elena_phone_test&updated_at=eq.${encodeURIComponent(row.updated_at)}&select=twilio_call_sid`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status, ended_at: new Date().toISOString(), duration_seconds: parseTwilioInteger(params.CallDuration), updated_at: updatedAt }),
    })
    if (!changed.length) return Response.json({ error: 'Call status changed; retry callback.' }, { status: 503 })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Could not record test call status.' }, { status: 503 })
  }
}
