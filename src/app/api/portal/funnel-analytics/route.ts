import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession, getVerifiedLuxorPortalSession, isAuthorizedLuxorPortalEmail } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getFunnelPeriod, getFunnelPeriodFromRange } from '@/lib/luxorFunnelPeriods'
import { getFunnelAnalytics } from '@/lib/luxorFunnelAnalyticsServer'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  try {
    const verified = await getVerifiedLuxorPortalSession(), session = verified ? await getLuxorPortalSession() : null
    if (!verified || !session || verified.email !== session.email || !isAuthorizedLuxorPortalEmail(session.email)) return NextResponse.json({ error: 'Authorized staff session required.' }, { status: 401, headers })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'leads')) return NextResponse.json({ error: 'Active staff with lead access required.' }, { status: 403, headers })
    const start = request.nextUrl.searchParams.get('start'), end = request.nextUrl.searchParams.get('end')
    const kind = request.nextUrl.searchParams.get('kind') || 'weekly', anchor = request.nextUrl.searchParams.get('anchor') || undefined
    let period
    if (start || end) {
      if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return NextResponse.json({ error: 'Invalid period.' }, { status: 400, headers })
      try { period = getFunnelPeriodFromRange(start, end) } catch { return NextResponse.json({ error: 'Invalid calendar date.' }, { status: 400, headers }) }
    } else {
      if (!['weekly', 'monthly', 'quarterly'].includes(kind) || anchor && !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return NextResponse.json({ error: 'Invalid period.' }, { status: 400, headers })
      try { period = getFunnelPeriod(kind as 'weekly' | 'monthly' | 'quarterly', anchor) } catch { return NextResponse.json({ error: 'Invalid calendar date.' }, { status: 400, headers }) }
    }
    const result = await getFunnelAnalytics(period)
    if (!memberCan(member, 'finances')) { result.metrics.revenue = null; result.issues.push('Finance permission is required to view revenue.') }
    return NextResponse.json(result, { headers })
  } catch { return NextResponse.json({ error: 'The underlying records or staff access could not be verified. No estimates are shown.' }, { status: 503, headers }) }
}
