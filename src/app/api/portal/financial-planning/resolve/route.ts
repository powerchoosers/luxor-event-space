import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { readPlanningJson } from '@/lib/luxorFinancialPlanningRequest'
import { resolvePlanningReceipt, validatePlanningResolutionRequest } from '@/lib/luxorFinancialPlanningResolution'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Finance access required.' }, { status: 403, headers })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403, headers })
    if (request.headers.get('origin') !== new URL(request.url).origin || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return NextResponse.json({ error: 'Same-origin JSON request required.' }, { status: 403, headers })
    const parsed = await readPlanningJson(request)
    if (!parsed.ok || !validatePlanningResolutionRequest(parsed.value)) return NextResponse.json({ error: 'Invalid receipt request.' }, { status: 400, headers })
    if (parsed.value.principalScope !== member.id) return NextResponse.json({ error: 'The signed-in member changed.' }, { status: 403, headers })
    // The actor is derived from the verified member, never the request body.
    const path = `luxor_financial_planning_operations?select=request,result&actor=eq.${encodeURIComponent(member.id)}&operation_id=eq.${encodeURIComponent(parsed.value.operationId)}&limit=2`
    const rows = await supabaseRestStrict<unknown[]>(path)
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('Receipt unavailable')
    if (!rows.length) return NextResponse.json({ status: 'not_found' }, { headers })
    return NextResponse.json({ status: resolvePlanningReceipt(parsed.value, rows[0]) }, { headers })
  } catch {
    return NextResponse.json({ error: 'Save status could not be verified.' }, { status: 503, headers })
  }
}
