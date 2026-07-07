import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listMarketingActivityEvents } from '@/lib/luxorMarketingServer'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const since = request.nextUrl.searchParams.get('since')
    const limit = Number.parseInt(request.nextUrl.searchParams.get('limit') || '25', 10)
    const events = await listMarketingActivityEvents({
      since,
      limit: Number.isFinite(limit) ? limit : 25,
    })

    return NextResponse.json({ events })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load marketing events.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
