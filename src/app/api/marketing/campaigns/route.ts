import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  createMarketingCampaign,
  getMarketingListById,
  listMarketingCampaigns,
  parseMarketingRecipients,
  sendMarketingCampaignNow,
} from '@/lib/luxorMarketingServer'

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
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
      return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    let recipients = Array.isArray(body.recipients)
      ? body.recipients
          .map((recipient: { email?: unknown; name?: unknown; eventType?: unknown }) => ({
            email: String(recipient.email || '').trim().toLowerCase(),
            name: typeof recipient.name === 'string' ? recipient.name.trim() : null,
            eventType: typeof recipient.eventType === 'string' ? recipient.eventType.trim() : null,
          }))
          .filter((recipient: { email: string }) => recipient.email)
      : parseMarketingRecipients(String(body.recipientsText || ''))

    const marketingListId = typeof body.marketingListId === 'string' ? body.marketingListId.trim() : ''
    const selectedList = marketingListId ? await getMarketingListById(marketingListId) : null
    if (marketingListId && !selectedList) {
      return NextResponse.json({ error: 'The selected marketing list no longer exists.' }, { status: 400 })
    }
    if (selectedList) {
      recipients = selectedList.members.map((member) => ({
        email: member.email,
        name: member.full_name,
        eventType: typeof member.metadata?.event_type === 'string' ? member.metadata.event_type : null,
      }))
    }

    let detail = await createMarketingCampaign({
      name: String(body.name || body.subject || 'Untitled Campaign'),
      subject: String(body.subject || ''),
      htmlBody: String(body.htmlBody || ''),
      recipients,
      scheduledFor: typeof body.scheduledFor === 'string' && body.scheduledFor ? body.scheduledFor : null,
      audienceLabel: selectedList?.name || (typeof body.audienceLabel === 'string' ? body.audienceLabel : null),
      createdBy: session.email,
      senderFrom: typeof body.senderFrom === 'string' ? body.senderFrom : undefined,
      senderName: typeof body.senderName === 'string' ? body.senderName : undefined,
      metadata: selectedList ? { marketing_list_id: selectedList.id } : {},
    })

    if (body.sendNow === true && detail?.campaign?.id) {
      const result = await sendMarketingCampaignNow(detail.campaign.id)
      detail = result.detail || detail
      return NextResponse.json({ ...detail, sendNow: result })
    }

    return NextResponse.json(detail)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create campaign.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
