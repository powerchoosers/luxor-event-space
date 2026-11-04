import { NextRequest, NextResponse } from 'next/server'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'calls') || !memberCan(member, 'leads')) {
      return NextResponse.json({ error: 'Call and lead access are required.' }, { status: 403 })
    }

    const id = request.nextUrl.searchParams.get('id') || ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid lead identifier.' }, { status: 400 })
    }

    const inquiry = await getLuxorInquiry(id)
    if (!inquiry) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })

    return NextResponse.json({
      id: inquiry.id,
      fullName: inquiry.full_name,
      email: inquiry.email,
      phone: inquiry.phone,
      eventType: inquiry.event_type,
      targetDate: inquiry.target_date,
      guestCount: inquiry.guest_count,
      packageInterest: inquiry.package_interest,
      status: inquiry.status,
      pipelineStage: inquiry.pipeline_stage ?? null,
      preferredTourDate: inquiry.preferred_tour_date,
      preferredTourTime: inquiry.preferred_tour_time,
      message: inquiry.message,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Unable to load call lead context:', error)
    return NextResponse.json({ error: 'Unable to load lead details.' }, { status: 500 })
  }
}
