import { NextResponse } from 'next/server'
import { getLuxorPhoneRoutingSettings, saveLuxorPhoneRoutingSettings } from '@/lib/luxorPhoneRoutingServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export const runtime = 'nodejs'

export async function GET() {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  try {
    return NextResponse.json(await getLuxorPhoneRoutingSettings(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  try {
    const body = await request.json() as { ringToNumber?: string | null; outboundMode?: string; ringBrowser?: boolean; ringPhone?: boolean }
    return NextResponse.json(await saveLuxorPhoneRoutingSettings({ ...body, ownerEmail: session.email }))
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 })
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to save phone routing settings.'
}
