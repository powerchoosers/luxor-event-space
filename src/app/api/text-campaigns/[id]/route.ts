import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { cancelTextCampaign, getTextCampaignDetail } from '@/lib/luxorTextCampaignsServer'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await getLuxorPortalSession()) {
    return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  }
  const { id } = await params
  const detail = await getTextCampaignDetail(id)
  return detail
    ? NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } })
    : NextResponse.json({ error: 'Text campaign not found.' }, { status: 404 })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await getLuxorPortalSession()) {
    return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  }
  try {
    const body = await request.json() as { action?: string }
    const { id } = await params
    if (body.action !== 'cancel') {
      return NextResponse.json({ error: 'Unsupported text campaign action.' }, { status: 400 })
    }
    const campaign = await cancelTextCampaign(id)
    return campaign
      ? NextResponse.json({ campaign })
      : NextResponse.json({ error: 'Text campaign not found.' }, { status: 404 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update text campaign.' },
      { status: 400 },
    )
  }
}
