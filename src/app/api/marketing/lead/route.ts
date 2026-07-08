import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLeadMarketingEngagement } from '@/lib/luxorMarketingServer'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const email = request.nextUrl.searchParams.get('email')
    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    const detail = await getLeadMarketingEngagement(email, { eventLimit: 12 })
    return NextResponse.json(detail)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load lead marketing engagement.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
