import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  createTextCampaign,
  getTextCampaignDashboard,
} from '@/lib/luxorTextCampaignsServer'
import type { LuxorTextAudienceFilter, LuxorTextCampaignType } from '@/lib/luxorTextCampaignTypes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!await getLuxorPortalSession()) {
    return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  }
  try {
    return NextResponse.json(await getTextCampaignDashboard(), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load text campaigns.' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) {
    return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  }
  try {
    const body = await request.json() as {
      name?: unknown
      bodyTemplate?: unknown
      campaignType?: unknown
      audienceFilter?: LuxorTextAudienceFilter
      audienceLabel?: unknown
      scheduledFor?: unknown
      source?: unknown
    }
    const detail = await createTextCampaign({
      name: String(body.name || 'Untitled text campaign'),
      bodyTemplate: String(body.bodyTemplate || ''),
      campaignType: String(body.campaignType || 'customer_care') as LuxorTextCampaignType,
      audienceFilter: body.audienceFilter || {},
      audienceLabel: typeof body.audienceLabel === 'string' ? body.audienceLabel : null,
      scheduledFor: typeof body.scheduledFor === 'string' && body.scheduledFor ? body.scheduledFor : null,
      createdBy: session.email,
      metadata: {
        source: typeof body.source === 'string' ? body.source : 'portal_text_builder',
      },
    })
    return NextResponse.json(detail, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create text campaign.' },
      { status: 400 },
    )
  }
}
