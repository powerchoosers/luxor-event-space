import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listLuxorBookedAttributionInquiryIds } from '@/lib/luxorLeadAttributionServer'

export async function GET() {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  try {
    const inquiryIds = await listLuxorBookedAttributionInquiryIds()
    return NextResponse.json({ inquiryIds }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load booked attribution records.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}