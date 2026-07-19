import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { createVoiceAccessToken } from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    }

    return NextResponse.json(await createVoiceAccessToken(session.email), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start the Luxor browser phone.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
