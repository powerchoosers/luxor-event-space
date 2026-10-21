import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorMarketingOverview } from '@/lib/luxorMarketingOverviewServer'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const rawDays = request.nextUrl.searchParams.get('days')
    const days = rawDays === null ? 30 : Number(rawDays)
    if (days !== 7 && days !== 30 && days !== 90) {
      return NextResponse.json({ error: 'Choose a 7, 30, or 90 day range.' }, { status: 400 })
    }

    const overview = await getLuxorMarketingOverview(days)
    return NextResponse.json(overview, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load the marketing overview.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
