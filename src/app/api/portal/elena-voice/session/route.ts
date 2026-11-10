import { NextResponse } from 'next/server'
import { buildElenaVoiceInstructions, ELENA_TEST_GREETING, ELENA_TEST_VOICES, requireElenaVoiceManager } from '@/lib/luxorElenaVoiceSandboxServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireElenaVoiceManager()
  if (auth.error) return auth.error
  try {
    const raw = await request.text()
    if (raw.length > 70_000) return NextResponse.json({ error: 'Voice request is too large.' }, { status: 413 })
    const body = JSON.parse(raw) as { sdp?: unknown; voice?: unknown }
    if (typeof body.sdp !== 'string' || body.sdp.length > 60_000 || !body.sdp.startsWith('v=0') || typeof body.voice !== 'string' || !ELENA_TEST_VOICES.includes(body.voice)) {
      return NextResponse.json({ error: 'Choose a supported voice and a valid microphone connection.' }, { status: 400 })
    }
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) return NextResponse.json({ error: 'OpenAI voice is not configured.' }, { status: 503 })
    const response = await fetch('https://api.openai.com/v1/live/sessions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: {
        model: 'gpt-live-1', instructions: await buildElenaVoiceInstructions('browser'), store: false,
        input: [{ type: 'message', role: 'developer', content: [{ type: 'input_text', text: `Open with: ${ELENA_TEST_GREETING}` }] }],
        audio: { output: { voice: body.voice } }, delegation: { type: 'client' },
        client: { data_channel: { allowed_client_events: ['session.close', 'session.input_audio.mute', 'session.input_audio.unmute', 'session.commentary.append', 'session.thinking.append'], allowed_server_events: 'all' } },
      }, transport: { type: 'webrtc', sdp: body.sdp } }),
      signal: AbortSignal.timeout(25_000), cache: 'no-store',
    })
    if (!response.ok) {
      const error = response.status === 403 || response.status === 404 ? 'This OpenAI project does not have GPT-Live access.' : response.status === 429 ? 'OpenAI voice capacity or billing is unavailable. Try again shortly.' : 'OpenAI could not connect voice. Please try again.'
      return NextResponse.json({ error }, { status: response.status === 429 ? 429 : 502 })
    }
    const result = await response.json() as { session?: { id?: unknown }; transport?: { sdp?: unknown } }
    if (typeof result.session?.id !== 'string' || typeof result.transport?.sdp !== 'string') return NextResponse.json({ error: 'OpenAI returned an incomplete connection.' }, { status: 502 })
    return NextResponse.json({ session: { id: result.session.id }, transport: { type: 'webrtc', sdp: result.transport.sdp } }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : error instanceof Error && error.name === 'TimeoutError' ? 504 : 500
    return NextResponse.json({ error: status === 400 ? 'Invalid voice request.' : 'Voice could not connect. Please try again.' }, { status })
  }
}
