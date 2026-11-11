import { NextResponse } from 'next/server'
import { requireElenaVoiceManager } from '@/lib/luxorElenaVoiceSandboxServer'
import { getElenaInboundSettings, saveElenaInboundSettings, type ElenaInboundSettings } from '@/lib/luxorElenaInboundSettingsServer'
import { getElenaInboundRouting } from '@/lib/luxorElenaInboundRoutingServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireElenaVoiceManager()
  if (auth.error) return auth.error
  try {
    const [settings, routing] = await Promise.all([getElenaInboundSettings(), getElenaInboundRouting()])
    return NextResponse.json({ ...settings, routing }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Elena call settings could not load.' }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireElenaVoiceManager()
  if (auth.error) return auth.error
  try {
    const raw = await request.text()
    if (raw.length > 1000) return NextResponse.json({ error: 'Request is too large.' }, { status: 413 })
    const body: unknown = JSON.parse(raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid call settings.' }, { status: 400 })
    const input = body as Record<string, unknown>
    if (Object.keys(input).some((key) => !['voice', 'ariannaAvailable'].includes(key)) || Object.keys(input).length === 0 || ('voice' in input && input.voice !== 'brise' && input.voice !== 'nira') || ('ariannaAvailable' in input && typeof input.ariannaAvailable !== 'boolean')) return NextResponse.json({ error: 'Choose Brise or Nira and a valid availability setting.' }, { status: 400 })
    const patch: Partial<ElenaInboundSettings> = {}
    if (input.voice === 'brise' || input.voice === 'nira') patch.voice = input.voice
    if (typeof input.ariannaAvailable === 'boolean') patch.ariannaAvailable = input.ariannaAvailable
    return NextResponse.json(await saveElenaInboundSettings(patch, auth.session.email), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof SyntaxError ? 'Invalid call settings.' : 'Elena call settings could not be saved.' }, { status: error instanceof SyntaxError ? 400 : 503 })
  }
}
