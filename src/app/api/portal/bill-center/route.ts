import { NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { postgrestSchemaUnavailable } from '@/lib/luxorPostgrestSchema'
import { supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { LuxorBill, LuxorBillIntake, LuxorVendor } from '@/lib/luxorInquiryTypes'
import type { LuxorExpenseTemplate } from '@/lib/luxorExpenseTypes'

type ReceiptLink = { id: string; expense_id: string | null; file_name: string; title: string }
type BookingLabel = { id: string; client_name: string | null; event_type: string | null; event_date: string | null }
async function allRows<T extends { id: string }>(path: string): Promise<T[]> {
  const count = await supabaseRestCount(path)
  const rows: T[] = []
  for (let offset = 0; offset < count; offset += 500) {
    const page = await supabaseRestStrict<T[]>(`${path}&limit=500&offset=${offset}`)
    if (page.length !== Math.min(500, count - offset)) throw new Error('Records changed while loading.')
    rows.push(...page)
  }
  if (rows.length !== count || rows.some((row) => !row.id) || new Set(rows.map((row) => row.id)).size !== count || await supabaseRestCount(path) !== count) throw new Error('Records changed while loading.')
  return rows
}
type Reminder = { bill_id: string; seven_days: boolean; three_days: boolean; due_day: boolean; overdue: boolean }
async function allReminders(): Promise<Reminder[] | null> {
  try {
    await supabaseRestStrict<Reminder[]>('luxor_bill_reminder_preferences?select=bill_id&limit=1')
  } catch (error) {
    if (postgrestSchemaUnavailable(error)) return null
    throw error
  }
  const path = 'luxor_bill_reminder_preferences?select=bill_id,seven_days,three_days,due_day,overdue&order=bill_id.asc'
  const count = await supabaseRestCount(path), rows: Reminder[] = []
  for (let offset = 0; offset < count; offset += 500) { const page = await supabaseRestStrict<Reminder[]>(`${path}&limit=500&offset=${offset}`); if (page.length !== Math.min(500, count-offset)) throw new Error('Reminders changed'); rows.push(...page) }
  if (rows.length !== count || new Set(rows.map((row) => row.bill_id)).size !== count || await supabaseRestCount(path) !== count) throw new Error('Reminders changed')
  return rows
}
export async function GET() {
  const session = await getOperationsSession()
  if (!session) return NextResponse.json({ error: 'Operations access required.' }, { status: 403 })
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
  try {
    const [bills, billIntakes, vendors, receipts, templates, reminders] = await Promise.all([
      allRows<LuxorBill>('luxor_bills?select=*&order=due_date.asc,id.asc'),
      allRows<LuxorBillIntake>('luxor_bill_intakes?select=*&order=received_at.desc,id.asc'),
      allRows<LuxorVendor>('luxor_vendors?select=*&order=name.asc,id.asc'),
      allRows<ReceiptLink>('luxor_documents?select=id,expense_id,file_name,title&document_type=eq.expense_receipt&order=created_at.desc,id.asc'),
      allRows<LuxorExpenseTemplate>('luxor_expense_templates?select=*&order=name.asc,id.asc'),
      allReminders(),
    ])
    let bookings: BookingLabel[] | null = null
    try { bookings = await allRows<BookingLabel>('luxor_bookings?select=id,client_name,event_type,event_date&order=event_date.asc,id.asc') }
    catch { bookings = null }
    return NextResponse.json({ bills, billIntakes, vendors, receipts, templates, reminders, bookings }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Bills and vendor records could not be verified:', error)
    return NextResponse.json({ error: 'Bills and vendor records changed or could not be fully loaded. Please retry.' }, { status: 503 })
  }
}
