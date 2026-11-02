import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { voidUnpaidSentInvoice } from '@/lib/luxorInvoiceLifecycleServer'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !['owner', 'admin'].includes(member.role) || !memberCan(member, 'finances')) {
      return NextResponse.json({ error: 'Owner or administrator finance access is required.' }, { status: 403 })
    }
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'A valid invoice ID is required.' }, { status: 400 })
    const body = await request.json().catch(() => ({})) as { reason?: unknown; confirmVoid?: unknown }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (body.confirmVoid !== true || reason.length < 8 || reason.length > 1000) {
      return NextResponse.json({ error: 'Confirm the cancellation and provide a reason between 8 and 1000 characters.' }, { status: 400 })
    }
    const result = await voidUnpaidSentInvoice(id, session.email, reason)
    if (!result?.voided) return NextResponse.json({ error: 'Invoice could not be voided.' }, { status: 409 })
    return NextResponse.json({ success: true, status: result.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel invoice.'
    const status = /not found/i.test(message) ? 404 : /only unpaid|linked financial|changed while/i.test(message) ? 409 : /reason of at least/i.test(message) ? 400 : 500
    console.error('[invoice-void] failed', { message })
    return NextResponse.json({ error: message }, { status })
  }
}
