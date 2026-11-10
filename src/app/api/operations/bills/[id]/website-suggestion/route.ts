import { NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { findProviderWebsite } from '@/lib/luxorProviderWebsiteServer'
import { suggestsRecurringBill } from '@/lib/luxorRecurringBillSuggestion'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const categories = new Set(['Rent', 'Utilities', 'Maintenance', 'Supplies', 'Marketing'])

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 403 })
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
  const { id } = await context.params
  if (!uuid.test(id)) return NextResponse.json({ error: 'Invalid bill.' }, { status: 400 })
  if (!process.env.OPEN_ROUTER_API_KEY) return NextResponse.json({ error: 'Website lookup is not configured.' }, { status: 503 })
  try {
    const [bill] = await supabaseRestStrict<LuxorBill[]>(`luxor_bills?id=eq.${id}&select=*&limit=1`)
    if (!bill || bill.vendor_id || !suggestsRecurringBill(bill)) return NextResponse.json({ error: 'Provider suggestion is unavailable.' }, { status: 404 })
    const name = (bill.provider || '').trim()
    // Sender addresses can be used as a fallback provider label. Do not send them to search.
    if (!name || name.length > 120 || /[@\r\n]|https?:\/\//i.test(name) || /^unknown(?: provider)?$/i.test(name)) return NextResponse.json({ website: null }, { headers: { 'Cache-Control': 'no-store' } })
    const proposedCategory = bill.bill_category || bill.extracted_fields?.category_suggestion
    const category = typeof proposedCategory === 'string' && categories.has(proposedCategory) ? proposedCategory : null
    return NextResponse.json(await findProviderWebsite(name, category, bill.service), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Website lookup could not be completed.' }, { status: 503 })
  }
}
