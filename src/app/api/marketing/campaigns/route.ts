import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  createMarketingCampaign,
  listMarketingCampaigns,
  parseMarketingRecipients,
} from '@/lib/luxorMarketingServer'

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const campaigns = await listMarketingCampaigns(30)
    return NextResponse.json({ campaigns })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load campaigns.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const recipients = Array.isArray(body.recipients)
      ? body.recipients
          .map((recipient: { email?: unknown; name?: unknown }) => ({
            email: String(recipient.email || '').trim().toLowerCase(),
            name: typeof recipient.name === 'string' ? recipient.name.trim() : null,
          }))
          .filter((recipient: { email: string }) => recipient.email)
      : parseMarketingRecipients(String(body.recipientsText || ''))

    const detail = await createMarketingCampaign({
      name: String(body.name || body.subject || 'Untitled Campaign'),
      subject: String(body.subject || ''),
      htmlBody: String(body.htmlBody || ''),
      recipients,
      scheduledFor: typeof body.scheduledFor === 'string' && body.scheduledFor ? body.scheduledFor : null,
      audienceLabel: typeof body.audienceLabel === 'string' ? body.audienceLabel : null,
      createdBy: session.email,
    })

    return NextResponse.json(detail)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create campaign.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
