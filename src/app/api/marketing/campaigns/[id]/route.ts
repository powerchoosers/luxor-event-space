import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { cancelMarketingCampaign, getMarketingCampaignDetail, sendMarketingCampaignNow } from '@/lib/luxorMarketingServer'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { id } = await params
    const detail = await getMarketingCampaignDetail(id)
    if (!detail) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load campaign.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { id } = await params

    if (body.action === 'cancel') {
      const campaign = await cancelMarketingCampaign(id)
      return NextResponse.json({ campaign })
    }

    if (body.action === 'send-now') {
      const result = await sendMarketingCampaignNow(id)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Unsupported campaign action.' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update campaign.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
