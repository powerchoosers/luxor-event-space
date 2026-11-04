import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { createVoiceAccessToken } from '@/lib/luxorTwilioServer'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    }
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'calls')) {
      return NextResponse.json({ error: 'Phone access is not enabled for this account.' }, { status: 403 })
    }

    return NextResponse.json(await createVoiceAccessToken(session.email), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start the Luxor browser phone.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
