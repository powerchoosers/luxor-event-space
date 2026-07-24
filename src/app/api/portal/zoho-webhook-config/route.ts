import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  getLuxorNotificationChannelName,
  getZohoWebhookPathToken,
  getZohoWebhookSecret,
  resetZohoWebhookSecret,
} from '@/lib/luxorZohoWebhookServer'

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  const token = getZohoWebhookPathToken()
  const webhookUrl = new URL(`/api/webhooks/zoho-mail/${token}`, request.nextUrl.origin).toString()
  return NextResponse.json({
    webhookUrl,
    realtimeChannel: getLuxorNotificationChannelName(),
    initialized: Boolean(await getZohoWebhookSecret()),
  })
}

export async function DELETE() {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  await resetZohoWebhookSecret()
  return NextResponse.json({ success: true })
}
