import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'
import type { LuxorFinanceAllocationRow } from '@/lib/luxorFinanceReporting'

async function readAll<T>(path: string, identity: (row: T) => string): Promise<T[]> {
  const count = await supabaseRestCount(path)
  const rows: T[] = []
  for (let offset = 0; offset < count; offset += 500) {
    const page = await supabaseRestStrict<T[]>(`${path}&limit=500&offset=${offset}`)
    if (page.length < Math.min(500, count - offset)) throw new Error('Incomplete financial source')
    rows.push(...page)
  }
  const keys = rows.map(identity)
  if (rows.length !== count || keys.some((key) => !key) || new Set(keys).size !== count || await supabaseRestCount(path) !== count) throw new Error('Financial source changed while loading')
  return rows
}

export async function GET() {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
  const [allocations, bills] = await Promise.allSettled([
    readAll<LuxorFinanceAllocationRow>('luxor_payment_installment_allocations?select=payment_id,installment_id,amount&order=payment_id.asc,installment_id.asc', (row) => row.payment_id && row.installment_id ? JSON.stringify([row.payment_id, row.installment_id]) : ''),
    readAll<LuxorBill>('luxor_bills?select=*&order=due_date.asc,id.asc', (row) => row.id),
  ])
  return NextResponse.json({ allocations: allocations.status === 'fulfilled' ? allocations.value : null, bills: bills.status === 'fulfilled' ? bills.value : null }, { headers: { 'Cache-Control': 'no-store' } })
}
