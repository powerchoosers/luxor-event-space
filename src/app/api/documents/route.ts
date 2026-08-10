import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listLuxorDocumentsByInquiry } from '@/lib/luxorDocumentsServer'

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  const inquiryId = request.nextUrl.searchParams.get('inquiryId')
  if (!inquiryId) return NextResponse.json({ error: 'inquiryId is required.' }, { status: 400 })
  try {
    return NextResponse.json(await listLuxorDocumentsByInquiry(inquiryId))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load documents.' }, { status: 500 })
  }
}
