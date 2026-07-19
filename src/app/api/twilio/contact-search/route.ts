import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listLuxorInquiries } from '@/lib/luxorInquiriesServer'
import { normalizePhoneNumber } from '@/lib/luxorCallsServer'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  const query = request.nextUrl.searchParams.get('q')?.trim() || ''
  if (query.length < 2) return NextResponse.json([])

  try {
    const normalizedQuery = query.toLowerCase()
    const queryDigits = query.replace(/\D/g, '')
    const inquiries = await listLuxorInquiries(2000)
    const results = inquiries
      .filter((inquiry) => {
        if (!inquiry.phone) return false
        const phoneDigits = (normalizePhoneNumber(inquiry.phone) || inquiry.phone).replace(/\D/g, '')
        return inquiry.full_name.toLowerCase().includes(normalizedQuery) || (queryDigits.length >= 2 && phoneDigits.includes(queryDigits))
      })
      .slice(0, 20)
      .map((inquiry) => ({ id: inquiry.id, fullName: inquiry.full_name, phoneNumber: normalizePhoneNumber(inquiry.phone), eventType: inquiry.event_type }))
      .filter((result): result is typeof result & { phoneNumber: string } => Boolean(result.phoneNumber))

    return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to search Luxor contacts.' }, { status: 500 })
  }
}
