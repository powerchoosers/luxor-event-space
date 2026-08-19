import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listLuxorLayoutReviewNotifications } from '@/lib/luxorLayoutReviewsServer'

export async function GET(request: NextRequest) {
  try {
    if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get('limit') || '50', 10)
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 50
    return NextResponse.json({ feedback: await listLuxorLayoutReviewNotifications(limit) }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load layout review notifications.' }, { status: 500 })
  }
}
