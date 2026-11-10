import { NextRequest, NextResponse } from 'next/server'
import { authorizeLuxorExpenseRequest, isExpenseUuid, LuxorExpenseRequestError, toExpenseErrorResponse } from '@/lib/luxorExpensesServer'
import { SupabaseRestError, supabaseRestStrict } from '@/lib/supabaseRestServer'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'

export const dynamic = 'force-dynamic'
type Bill = { id: string; provider: string; service: string; due_date: string | null; amount: number; amount_state: string; updated_at: string }
type Link = { bill_id: string; template_id: string }
async function template(id: string) {
  if (!isExpenseUuid(id)) throw new LuxorExpenseRequestError('Choose a valid recurring cost.')
  const [row] = await supabaseRestStrict<Array<{ id: string; updated_at: string; is_active: boolean }>>(`luxor_expense_templates?select=id,updated_at,is_active&id=eq.${encodeURIComponent(id)}&limit=1`)
  if (!row || !row.is_active) throw new LuxorExpenseRequestError('Recurring cost is unavailable.', 404)
  return row
}
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authorizeLuxorExpenseRequest()
    if (!await getOperationsSession()) throw new LuxorExpenseRequestError('Operations access required.', 403)
    const { id } = await context.params
    const row = await template(id)
    const links = await supabaseRestStrict<Link[]>(`luxor_recurring_cost_bill_links?select=bill_id,template_id&template_id=eq.${encodeURIComponent(id)}&order=confirmed_at.desc&limit=101`)
    const linkedIds = links.slice(0, 100).map(link => link.bill_id).filter(isExpenseUuid)
    const fields = 'id,provider,service,due_date,amount,amount_state,updated_at'
    const [bills, linkedBills] = await Promise.all([
      supabaseRestStrict<Bill[]>(`luxor_bills?select=${fields}&archived_at=is.null&extraction_status=eq.ready&payment_ready_at=not.is.null&duplicate_of_bill_id=is.null&order=created_at.desc&limit=101`),
      linkedIds.length ? supabaseRestStrict<Bill[]>(`luxor_bills?select=${fields}&id=in.(${linkedIds.join(',')})&archived_at=is.null&extraction_status=eq.ready&payment_ready_at=not.is.null&duplicate_of_bill_id=is.null&order=created_at.desc`) : Promise.resolve([]),
    ])
    const candidateIds = bills.slice(0,100).map(bill => bill.id).filter(isExpenseUuid)
    const assigned = candidateIds.length ? await supabaseRestStrict<Link[]>(`luxor_recurring_cost_bill_links?select=bill_id,template_id&bill_id=in.(${candidateIds.join(',')})`) : []
    const assignedIds = new Set(assigned.map(link => link.bill_id))
    return NextResponse.json({ linkedBills, candidates: bills.slice(0,100).filter(bill => !assignedIds.has(bill.id)), templateUpdatedAt: row.updated_at, hasMoreCandidates: bills.length > 100, hasMoreLinkedBills: links.length > 100 }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { const result = toExpenseErrorResponse(error); return NextResponse.json({ error: result.message }, { status: result.status }) }
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { session } = await authorizeLuxorExpenseRequest()
    if (!await getOperationsSession()) throw new LuxorExpenseRequestError('Operations access required.', 403)
    const { id } = await context.params
    if (!isExpenseUuid(id)) throw new LuxorExpenseRequestError('Choose a valid recurring cost.')
    const body = await request.json() as { bill_id?: unknown; expected_bill_updated_at?: unknown; expected_template_updated_at?: unknown }
    if (typeof body.bill_id !== 'string' || !isExpenseUuid(body.bill_id) || typeof body.expected_bill_updated_at !== 'string' || typeof body.expected_template_updated_at !== 'string') throw new LuxorExpenseRequestError('Refresh and review the bill first.')
    const result = await supabaseRestStrict<{ ok: boolean }>('rpc/luxor_confirm_recurring_profile_bill', { method: 'POST', body: JSON.stringify({ p_template_id: id, p_bill_id: body.bill_id, p_template_updated_at: body.expected_template_updated_at, p_bill_updated_at: body.expected_bill_updated_at, p_actor: session.email }) })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SupabaseRestError && error.code === '23505') return NextResponse.json({ error: 'This bill already belongs to another cost profile. Refresh to see the latest details.' }, { status: 409 })
    if (error instanceof SupabaseRestError && error.code === '40001') return NextResponse.json({ error: 'The bill or recurring cost changed. Refresh and review again.' }, { status: 409 })
    if (error instanceof SupabaseRestError && error.code === '55000') return NextResponse.json({ error: 'This bill is unavailable or is associated with a different cost or event.' }, { status: 409 })
    const result = toExpenseErrorResponse(error); return NextResponse.json({ error: result.message }, { status: result.status })
  }
}
