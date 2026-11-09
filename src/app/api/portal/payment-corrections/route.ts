import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
  const body = await request.json().catch(() => null) as { paymentId?: unknown; installmentId?: unknown; expectedUpdatedAt?: unknown; reason?: unknown } | null
  if (!body || typeof body.paymentId !== 'string' || !UUID.test(body.paymentId) || typeof body.installmentId !== 'string' || !UUID.test(body.installmentId)
    || typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt)) || typeof body.reason !== 'string'
    || body.reason.trim().length < 3 || body.reason.trim().length > 500) return NextResponse.json({ error: 'Choose a payment and provide a reason for the correction.' }, { status: 400 })
  try {
    const result = await supabaseRestStrict<{ corrected: boolean }>('rpc/luxor_correct_manual_installment_payment', {
      method: 'POST', body: JSON.stringify({ p_payment_id: body.paymentId, p_installment_id: body.installmentId, p_expected_updated_at: body.expectedUpdatedAt, p_actor_email: session.email, p_reason: body.reason.trim() }),
    })
    if (!result?.corrected) throw new Error('Correction could not be confirmed.')
    return NextResponse.json({ corrected: true })
  } catch (error) {
    console.error('Manual payment correction failed', error)
    const message = error instanceof Error ? error.message : ''
    const known = message.includes('A receipt email exists') ? 'A receipt email exists for this payment. Review it before correcting the entry.'
      : message.includes('refunds that require review') ? 'This payment has a refund or allocation that needs review before it can be corrected.'
      : message.includes('legacy balance') || message.includes('Multiple receipts') || message.includes('allocations disagree') ? 'This installment needs reconciliation before this payment can be corrected.'
      : 'The correction could not be confirmed. Refresh and review the payment before trying again.'
    return NextResponse.json({ error: known }, { status: 409 })
  }
}
