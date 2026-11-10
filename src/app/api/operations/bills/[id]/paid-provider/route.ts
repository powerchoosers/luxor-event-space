import { NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { luxorTimestampIsKnown } from '@/lib/luxorTimestamp'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 403 })
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
  const { id } = await context.params
  if (!uuid.test(id)) return NextResponse.json({ error: 'Invalid bill.' }, { status: 400 })
  const body = await request.json().catch(() => null) as { vendorId?: unknown; expectedUpdatedAt?: unknown; confirmed?: unknown } | null
  if (!body || typeof body.vendorId !== 'string' || !uuid.test(body.vendorId) || typeof body.expectedUpdatedAt !== 'string' || !luxorTimestampIsKnown(body.expectedUpdatedAt) || body.confirmed !== true) {
    return NextResponse.json({ error: 'Review the provider and confirm the current bill before linking.' }, { status: 400 })
  }
  try {
    const result = await supabaseRestStrict('rpc/luxor_link_paid_bill_provider', { method: 'POST', body: JSON.stringify({ p_bill_id: id, p_expected_updated_at: body.expectedUpdatedAt, p_vendor_id: body.vendorId, p_actor_email: session.email }) })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'The bill or provider may have changed, or a recurring schedule may have a different provider. Refresh and review before trying again.' }, { status: 409 })
  }
}
