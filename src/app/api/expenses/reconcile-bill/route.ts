import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { authorizeLuxorExpenseRequest, isExpenseUuid, toExpenseErrorResponse } from '@/lib/luxorExpensesServer'
import { supabaseRestStrict, SupabaseRestError } from '@/lib/supabaseRestServer'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { session } = await authorizeLuxorExpenseRequest()
    if (!await getOperationsSession()) return NextResponse.json({ error: 'Operations access required.' }, { status: 403 })
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Choose a bill and expected period.' }, { status: 400 })
    const value = body as Record<string, unknown>
    if (!isExpenseUuid(value.bill_id) || !isExpenseUuid(value.occurrence_id) || !isExpenseUuid(value.expense_id) || typeof value.occurrence_updated_at !== 'string' || !Number.isFinite(Date.parse(value.occurrence_updated_at)) || typeof value.expense_updated_at !== 'string' || !Number.isFinite(Date.parse(value.expense_updated_at)) || value.confirmed !== true) return NextResponse.json({ error: 'Review and confirm the bill and expected period.' }, { status: 400 })
    const result = await supabaseRestStrict<Record<string, unknown>>('rpc/luxor_reconcile_bill_occurrence', { method: 'POST', body: JSON.stringify({ p_bill_id: value.bill_id, p_occurrence_id: value.occurrence_id, p_bill_expense_id: value.expense_id, p_expected_occurrence_updated_at: value.occurrence_updated_at, p_expected_expense_updated_at: value.expense_updated_at, p_actor: session.email }) })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof SupabaseRestError && ['40001', '55000', '23505'].includes(error.code || '')) return NextResponse.json({ error: error.code === '23505' ? 'This bill expense is already matched to a period.' : error.message }, { status: 409 })
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Bill reconciliation could not be completed:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}
