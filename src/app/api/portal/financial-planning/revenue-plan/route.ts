import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { revenueConfirmationMatches, validateRevenueSnapshot, validateRevenueWrite } from '@/lib/luxorFinancialRevenuePlan'
import { readPlanningJson } from '@/lib/luxorFinancialPlanningRequest'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
// The existing monthly target editor is not yet guarded by the same CAS path.
// Keep writes disabled until that shared writer is coordinated and tested.
const REVENUE_WRITES_COORDINATED = false
async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) return null
  const member = await getLuxorPortalMember(session.email)
  return member && member.status === 'active' && memberCan(member, 'finances') ? member : null
}
export async function GET(request: NextRequest) {
  try {
    const member = await authorize()
    if (!member) return NextResponse.json({ error: 'Finance access required.' }, { status: 403, headers })
    const year = request.nextUrl.searchParams.get('year') || ''
    if (!/^\d{4}$/.test(year) || Number(year) < 1900) return NextResponse.json({ error: 'Choose a valid year.' }, { status: 400, headers })
    const snapshot = await supabaseRestStrict<unknown>('rpc/luxor_read_revenue_plan', { method: 'POST', body: JSON.stringify({ p_year: Number(year) }) })
    if (!validateRevenueSnapshot(snapshot) || snapshot.plan.year !== Number(year)) throw new Error('Invalid target snapshot')
    return NextResponse.json({ principalScope: member.id, snapshot, writeAvailable: REVENUE_WRITES_COORDINATED }, { headers })
  } catch {
    return NextResponse.json({ error: 'Revenue plan is unavailable.' }, { status: 503, headers })
  }
}
export async function POST(request: NextRequest) {
  let member
  try { member = await authorize() } catch { return NextResponse.json({ error: 'Finance access could not be verified.' }, { status: 503, headers }) }
  if (!member) return NextResponse.json({ error: 'Finance access required.' }, { status: 403, headers })
  if (request.headers.get('origin') !== new URL(request.url).origin || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return NextResponse.json({ error: 'Same-origin JSON request required.' }, { status: 403, headers })
  const parsed = await readPlanningJson(request)
  if (!parsed.ok) return NextResponse.json({ error: parsed.reason === 'too_large' ? 'Request is too large.' : 'Invalid request.', code: 'rejected_before_write' }, { status: parsed.reason === 'too_large' ? 413 : 400, headers })
  const body = parsed.value
  if (!validateRevenueWrite(body)) return NextResponse.json({ error: 'Check the targets and allocations.', code: 'rejected_before_write' }, { status: 400, headers })
  if (body.principalScope !== member.id) return NextResponse.json({ error: 'The signed-in member changed.', code: 'principal_changed' }, { status: 403, headers })
  if (!REVENUE_WRITES_COORDINATED) return NextResponse.json({ error: 'Annual plan saving is not available yet.', code: 'rejected_before_write' }, { status: 501, headers })
  try {
    const result = await supabaseRestStrict<unknown>('rpc/luxor_write_revenue_plan', { method: 'POST', body: JSON.stringify({ p_actor: member.id, p_operation_id: body.operationId, p_expected_revision: body.expectedRevision, p_plan: body.plan, p_baseline: body.baseline }) })
    if (result && typeof result === 'object' && (result as { status?: unknown }).status === 'conflict') return NextResponse.json({ status: 'conflict' }, { status: 409, headers })
    if (!revenueConfirmationMatches(body, result)) throw new Error('Unconfirmed target write')
    return NextResponse.json(result, { headers })
  } catch {
    return NextResponse.json({ error: 'Save status is unknown. Retry with the same request ID.', retrySameOperation: true }, { status: 503, headers })
  }
}
