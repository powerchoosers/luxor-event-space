import { NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { findProviderWebsite } from '@/lib/luxorProviderWebsiteServer'
import type { LuxorExpenseTemplate } from '@/lib/luxorExpenseTypes'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const categories = new Set(['Rent', 'Utilities', 'Maintenance', 'Supplies', 'Marketing'])

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 403 })
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
  const { id } = await context.params
  if (!uuid.test(id)) return NextResponse.json({ error: 'Invalid recurring cost.' }, { status: 400 })
  try {
    const [schedule] = await supabaseRestStrict<LuxorExpenseTemplate[]>(`luxor_expense_templates?id=eq.${id}&select=id,name,vendor_id,vendor_name,category,is_active&limit=1`)
    if (!schedule || schedule.vendor_id || !schedule.is_active) return NextResponse.json({ error: 'Provider suggestion is unavailable.' }, { status: 404 })
    const name = (schedule.vendor_name || '').trim()
    if (!name || name.length > 120 || /[@\r\n]|https?:\/\//i.test(name) || /^unknown(?: provider)?$/i.test(name)) return NextResponse.json({ website: null }, { headers: { 'Cache-Control': 'no-store' } })
    const category = categories.has(schedule.category) ? schedule.category : null
    const input = await request.json().catch(() => ({})) as { retry?: unknown }
    return NextResponse.json(await findProviderWebsite(name, category, schedule.name, input.retry === true), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Website lookup could not be completed.' }, { status: 503 })
  }
}
