import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorNotificationChannelName } from '@/lib/luxorZohoWebhookServer'

/** Returns only the opaque channel name required for private portal updates. */
export async function GET() {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  return NextResponse.json({ realtimeChannel: getLuxorNotificationChannelName() }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
