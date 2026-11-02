import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { correctManualPaymentReceivedDate } from '@/lib/luxorInvoiceLifecycleServer'
import { supabaseRest } from '@/lib/supabaseRestServer'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

type ReceivedDateAuditRow = {
  id: string
  actor_email: string
  occurred_at: string
  reason: string | null
  before_state: Record<string, unknown>
  after_state: Record<string, unknown>
}

function isRealDate(value: string) {
  if (!DATE.test(value)) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

async function authorizedAdmin() {
  const session = await getLuxorPortalSession()
  if (!session) return { response: NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 }) }
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !['owner', 'admin'].includes(member.role) || !memberCan(member, 'finances')) {
    return { response: NextResponse.json({ error: 'Owner or administrator finance access is required.' }, { status: 403 }) }
  }
  return { session }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await authorizedAdmin()
    if (access.response) return access.response
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'A valid payment ID is required.' }, { status: 400 })
    const history = await supabaseRest<ReceivedDateAuditRow[]>(
      `luxor_financial_audit?select=id,actor_email,occurred_at,reason,before_state,after_state&payment_id=eq.${encodeURIComponent(id)}&action=eq.payment_received_date_corrected&order=occurred_at.desc&limit=100`,
    )
    return NextResponse.json({ corrections: history })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Correction history is unavailable.'
    console.error('[payment-received-date-history] failed', { message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await authorizedAdmin()
    if (access.response) return access.response
    const session = access.session!
    const { id } = await params
    if (!UUID.test(id)) return NextResponse.json({ error: 'A valid payment ID is required.' }, { status: 400 })
    const body = await request.json().catch(() => ({})) as { receivedDate?: unknown; expectedReceivedDate?: unknown; reason?: unknown; confirmCorrection?: unknown }
    const receivedDate = typeof body.receivedDate === 'string' ? body.receivedDate : ''
    const expectedReceivedDate = typeof body.expectedReceivedDate === 'string' ? body.expectedReceivedDate : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (body.confirmCorrection !== true || !isRealDate(receivedDate) || !isRealDate(expectedReceivedDate) || reason.length < 8 || reason.length > 1000) {
      return NextResponse.json({ error: 'Confirm the correction, choose a valid received date, and provide a reason between 8 and 1000 characters.' }, { status: 400 })
    }
    const result = await correctManualPaymentReceivedDate(id, receivedDate, expectedReceivedDate, session.email, reason)
    if (!result?.payment_id || !result.received_date) return NextResponse.json({ error: 'Payment received date could not be corrected.' }, { status: 409 })
    return NextResponse.json({ success: true, changed: Boolean(result.changed), receivedDate: result.received_date, paidAt: result.paid_at, createdAt: result.created_at })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to correct payment received date.'
    const status = /not found/i.test(message) ? 404 : /only confirmed paid manual|payment changed while|date changed since/i.test(message) ? 409 : /valid date|reason of at least/i.test(message) ? 400 : 500
    console.error('[payment-received-date] failed', { message })
    return NextResponse.json({ error: message }, { status })
  }
}
