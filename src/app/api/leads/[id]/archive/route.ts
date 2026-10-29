import { NextRequest, NextResponse } from 'next/server'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { isLuxorInquiryArchived, type LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { supabaseRest } from '@/lib/supabaseRestServer'

export const runtime = 'nodejs'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const { id } = await params
    const current = await getLuxorInquiry(id)
    if (!current) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    if (current.is_test) return NextResponse.json({ error: 'The permanent test lead can only be changed through its run lifecycle controls.' }, { status: 409 })
    if (isLuxorInquiryArchived(current)) return NextResponse.json({ lead: current, archived: true, alreadyArchived: true })

    const [lead] = await supabaseRest<LuxorInquiry[]>(
      `luxor_inquiries?select=*&id=eq.${encodeURIComponent(id)}&archived_at=is.null&status=neq.closed_lost&pipeline_stage=neq.closed_lost`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ archived_at: new Date().toISOString(), archived_by: session.email }),
      },
    )
    if (lead) return NextResponse.json({ lead, archived: true, alreadyArchived: false })

    // Another owner may have archived the record between the read and write.
    const latest = await getLuxorInquiry(id)
    if (latest && isLuxorInquiryArchived(latest)) return NextResponse.json({ lead: latest, archived: true, alreadyArchived: true })
    return NextResponse.json({ error: 'This lead changed before it could be archived. Refresh and try again.' }, { status: 409 })
  } catch (error) {
    console.error('[lead-archive] failed', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to archive this lead.' }, { status: 500 })
  }
}
