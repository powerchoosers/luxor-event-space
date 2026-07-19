import { NextRequest, NextResponse } from 'next/server'
import { findLuxorInquiryByPhone } from '@/lib/luxorCallsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!await getLuxorPortalSession()) {
    return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  }

  const phoneNumber = request.nextUrl.searchParams.get('phone')
  if (!phoneNumber) return NextResponse.json({ match: null })

  try {
    const inquiry = await findLuxorInquiryByPhone(phoneNumber)
    return NextResponse.json({
      match: inquiry ? {
        id: inquiry.id,
        fullName: inquiry.full_name,
        eventType: inquiry.event_type,
        phoneNumber: inquiry.phone,
      } : null,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to look up that phone number.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
