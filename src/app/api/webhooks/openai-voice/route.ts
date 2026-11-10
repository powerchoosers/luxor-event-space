import { after } from 'next/server'
import { acceptElenaPhoneTestEvent, elenaPhoneTestReady, verifyOpenAiVoiceSignature, greetElenaPhoneTest } from '@/lib/luxorElenaPhoneTestServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export function GET() {
  const configured = elenaPhoneTestReady()
  return Response.json({ service: 'luxor-elena-phone-test', configured, ready: configured, bookingMode: 'rehearsal', carrierCallVerified: false, greetingPlaybackVerified: false }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  if (!elenaPhoneTestReady()) return Response.json({ error: 'Phone test is disabled or incomplete.' }, { status: 503 })
  const raw = await request.text()
  if (raw.length > 64_000) return Response.json({ error: 'Request too large.' }, { status: 413 })
  if (!verifyOpenAiVoiceSignature(raw, request.headers, process.env.OPENAI_VOICE_WEBHOOK_SECRET || '')) return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  try {
    const result = await acceptElenaPhoneTestEvent(JSON.parse(raw))
    if (result.accepted && result.sessionId && result.callSid) {
      after(async () => {
        await greetElenaPhoneTest(result.sessionId!, result.callSid!).catch(() => console.warn('[Elena Phone Test] Opening greeting was not verified'))
      })
    }
    return Response.json({ accepted: result.accepted === true, duplicate: result.duplicate === true, ignored: result.ignored === true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    // Provider errors can contain caller metadata; record only a fixed event and safe error class.
    console.warn('[Elena Phone Test] Incoming call could not be accepted', { kind: error instanceof SyntaxError ? 'invalid_json' : 'acceptance_failed' })
    return Response.json({ error: 'The phone test could not accept this call.' }, { status: error instanceof SyntaxError ? 400 : 503 })
  }
}
