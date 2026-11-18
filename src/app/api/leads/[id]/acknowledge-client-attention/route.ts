import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { acknowledgeLuxorClientAttention } from '@/lib/luxorClientStatusOwnerAlertsServer'
import { luxorLeadNeedsClientAttention } from '@/lib/luxorClientAttention'
import { createNote } from '@/lib/luxorNotesServer'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getLuxorPortalSession()
    if (!session?.email) {
      return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    }

    const { id } = await params
    const inquiry = await getLuxorInquiry(id)
    if (!inquiry) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    }
    if (!luxorLeadNeedsClientAttention(inquiry)) {
      return NextResponse.json({ inquiry, alreadyAcknowledged: true }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const reason = inquiry.client_attention_reason || 'Client status update'
    const updated = await acknowledgeLuxorClientAttention(inquiry, session.email)
    await createNote(
      inquiry.id,
      `Acknowledged client attention: ${reason}`,
      'status_change',
      session.email,
    ).catch((error) => console.error('Client attention acknowledged, but activity log failed:', error))

    return NextResponse.json({ inquiry: updated || inquiry }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to acknowledge client attention.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}