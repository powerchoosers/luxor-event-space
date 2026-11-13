import { NextRequest, NextResponse } from 'next/server'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const inquiryId = request.nextUrl.searchParams.get('inquiryId')?.trim() || ''
  if (!UUID_RE.test(inquiryId)) {
    return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })
  }

  const inquiry = await getLuxorInquiry(inquiryId)
  if (!inquiry || inquiry.flow !== 'packages_event_inquiry' || inquiry.source !== 'website_packages') {
    return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })
  }

  const parts = (inquiry.full_name || '').trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0] || ''
  const lastName = parts.slice(1).join(' ')

  return NextResponse.json({
    inquiryId: inquiry.id,
    firstName,
    lastName,
    fullName: inquiry.full_name,
    email: inquiry.email,
    phone: inquiry.phone,
    eventType: inquiry.event_type,
    targetDate: inquiry.target_date,
    guestCount: inquiry.guest_count,
    packageInterest: inquiry.package_interest,
  })
}
