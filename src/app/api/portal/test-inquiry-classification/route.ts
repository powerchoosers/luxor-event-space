import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getVerifiedTestInquiryIds } from '@/lib/luxorBookingsServer'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from '@/lib/luxorTestLeadPolicy'

export async function POST(request: NextRequest) {
  try {
    if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const body = await request.json().catch(() => null) as { inquiryIds?: unknown; bookingIds?: unknown } | null
    const validIds = (ids: unknown) => Array.isArray(ids) && ids.length <= 2000
      && ids.every((id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    if (!validIds(body?.inquiryIds) || (body?.bookingIds !== undefined && !validIds(body.bookingIds))) {
      return NextResponse.json({ error: 'Invalid inquiry identifiers.' }, { status: 400 })
    }
    const inquiryIds = [...new Set((body!.inquiryIds as string[]).map((id) => id.toLowerCase()))]
    const bookingIds = [...new Set(((body?.bookingIds || []) as string[]).map((id) => id.toLowerCase()))]
    const batches = Array.from({ length: Math.ceil(bookingIds.length / 100) }, (_, i) => bookingIds.slice(i * 100, i * 100 + 100))
    const bookings = (await Promise.all(batches.map((batch) => supabaseRestStrict<Array<{ id: string; inquiry_id: string | null; metadata: Record<string, unknown> | null }>>(
      `luxor_bookings?select=id,inquiry_id,metadata&id=in.(${batch.map(encodeURIComponent).join(',')})`,
    )))).flat()
    const linkedInquiryIds = bookings.map((booking) => booking.inquiry_id).filter((id): id is string => Boolean(id))
    const testInquiryIds = await getVerifiedTestInquiryIds([...inquiryIds, ...linkedInquiryIds])
    const testBookingIds = bookings.filter((booking) => booking.metadata?.is_test_record === true
      || booking.inquiry_id === LUXOR_PERMANENT_TEST_LEAD_ID || Boolean(booking.inquiry_id && testInquiryIds.has(booking.inquiry_id))).map((booking) => booking.id)
    const foundBookingIds = new Set(bookings.map((booking) => booking.id.toLowerCase()))
    const requestedInquiries = new Set(inquiryIds)
    return NextResponse.json({
      testInquiryIds: [...testInquiryIds].filter((id) => requestedInquiries.has(id.toLowerCase())),
      testBookingIds,
      unresolvedBookingIds: bookingIds.filter((id) => !foundBookingIds.has(id)),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Test classification is unavailable.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
