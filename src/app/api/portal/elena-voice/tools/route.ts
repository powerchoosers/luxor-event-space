import { NextResponse } from 'next/server'
import { answerElenaPracticeRequest, parseElenaPracticeMessages, requireElenaVoiceManager } from '@/lib/luxorElenaVoiceSandboxServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireElenaVoiceManager()
  if (auth.error) return auth.error
  try {
    const raw = await request.text()
    if (raw.length > 65_000) return NextResponse.json({ error: 'Practice request is too large.' }, { status: 413 })
    const body = JSON.parse(raw) as { transcript?: unknown; messages?: unknown }
    if (typeof body.transcript !== 'string' || !body.transcript.trim() || body.transcript.length > 6000) return NextResponse.json({ error: 'Please repeat the request.' }, { status: 400 })
    const messages = parseElenaPracticeMessages(body.messages)
    return NextResponse.json(await answerElenaPracticeRequest(body.transcript.trim(), messages), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const status = error instanceof SyntaxError || (error instanceof Error && error.message === 'Invalid conversation history.') ? 400 : 502
    return NextResponse.json({ error: status === 400 ? 'Invalid practice request.' : error instanceof Error ? error.message : 'Elena could not check that request.' }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
}
