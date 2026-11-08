import { NextRequest, NextResponse } from 'next/server'
import { postgrestSchemaUnavailable } from '@/lib/luxorPostgrestSchema'
import { supabaseRestStrict, SupabaseRestError } from '@/lib/supabaseRestServer'
import { isDateKey } from '@/lib/luxorExpensesServer'
import { VENDOR_UUID, vendorFinanceSession } from '@/lib/luxorVendorDocumentsServer'
import { luxorTimestampIsKnown, luxorTimestampMs } from '@/lib/luxorTimestamp'

type Plan = { id: string; bill_id: string; expense_id: string; amount: number; planned_date: string; status: 'planned' | 'cancelled'; client_request_id: string; created_at: string }
type Preferences = { bill_id: string; seven_days: boolean; three_days: boolean; due_day: boolean; overdue: boolean; updated_at: string }
async function readPlans(billId: string) {
  return supabaseRestStrict<Plan[]>('rpc/luxor_read_bill_payment_plans', { method: 'POST', body: JSON.stringify({ p_bill_id: billId }) })
}
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await vendorFinanceSession()) return NextResponse.json({ error: 'Operations and finance access required.' }, { status: 403 })
  const { id } = await context.params
  if (!VENDOR_UUID.test(id)) return NextResponse.json({ error: 'Invalid bill.' }, { status: 400 })
  try {
    const [plans, preferences] = await Promise.all([readPlans(id), supabaseRestStrict<Preferences[]>(`luxor_bill_reminder_preferences?select=bill_id,seven_days,three_days,due_day,overdue,updated_at&bill_id=eq.${id}&limit=1`)])
    return NextResponse.json({ plans, preferences: preferences[0] || null }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (postgrestSchemaUnavailable(error)) {
      return NextResponse.json({ unavailable: true, plans: [], preferences: null }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ error: 'Planning is unavailable until the bill planning schema is ready.' }, { status: 503 })
  }
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await vendorFinanceSession()
  if (!session) return NextResponse.json({ error: 'Operations and finance access required.' }, { status: 403 })
  const { id } = await context.params
  if (!VENDOR_UUID.test(id)) return NextResponse.json({ error: 'Invalid bill.' }, { status: 400 })
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    const values = body as Record<string, unknown>
    if (values.action === 'create') {
      const amount = typeof values.amount === 'number' ? values.amount : Number.NaN
      if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99 || Math.abs(Math.round(amount * 100) - amount * 100) > 0.0000001 || !isDateKey(values.plannedDate) || typeof values.requestId !== 'string' || !VENDOR_UUID.test(values.requestId)) return NextResponse.json({ error: 'Enter a positive amount, date, and valid request key.' }, { status: 400 })
      const result = await supabaseRestStrict('rpc/luxor_create_bill_payment_plan', { method: 'POST', body: JSON.stringify({ p_bill_id: id, p_amount: amount, p_date: values.plannedDate, p_request_id: values.requestId, p_actor: session.email }) })
      return NextResponse.json(result)
    }
    if (values.action === 'cancel' || values.action === 'reviewed') {
      if (typeof values.planId !== 'string' || !VENDOR_UUID.test(values.planId)) return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 })
      const [plan] = await supabaseRestStrict<Array<{ id: string }>>(`luxor_bill_payment_plans?select=id&id=eq.${values.planId}&bill_id=eq.${id}&limit=1`)
      if (!plan) return NextResponse.json({ error: 'Plan not found.' }, { status: 404 })
      const result = await supabaseRestStrict('rpc/luxor_cancel_bill_payment_plan', { method: 'POST', body: JSON.stringify({ p_plan_id: plan.id, p_actor: session.email, p_reason: values.action === 'reviewed' ? 'reviewed' : 'cancelled' }) })
      return NextResponse.json(result)
    }
    if (values.action === 'preferences') {
      const keys = ['seven_days', 'three_days', 'due_day', 'overdue'] as const
      if (keys.some((key) => typeof values[key] !== 'boolean') || !(values.expectedUpdatedAt === null || (typeof values.expectedUpdatedAt === 'string' && luxorTimestampIsKnown(values.expectedUpdatedAt)))) return NextResponse.json({ error: 'Invalid reminder preferences.' }, { status: 400 })
      let billId = ''
      let archived = false
      try {
        const [bill] = await supabaseRestStrict<Array<{ id: string; archived_at: string | null }>>(`luxor_bills?select=id,archived_at&id=eq.${id}&limit=1`)
        billId = bill?.id || ''
        archived = Boolean(bill?.archived_at)
      } catch (error) {
        if (!postgrestSchemaUnavailable(error)) throw error
        const [bill] = await supabaseRestStrict<Array<{ id: string }>>(`luxor_bills?select=id&id=eq.${id}&limit=1`)
        billId = bill?.id || ''
      }
      if (!billId || archived) return NextResponse.json({ error: 'An active bill is required.' }, { status: 409 })
      const priorMs = values.expectedUpdatedAt === null ? 0 : luxorTimestampMs(values.expectedUpdatedAt as string)!
      const updatedAt = new Date(Math.max(Date.now(), priorMs + 1)).toISOString(); const record = { bill_id: id, seven_days: values.seven_days, three_days: values.three_days, due_day: values.due_day, overdue: values.overdue, updated_at: updatedAt, updated_by: session.email }
      const path = values.expectedUpdatedAt === null ? 'luxor_bill_reminder_preferences?on_conflict=bill_id&select=*' : `luxor_bill_reminder_preferences?bill_id=eq.${id}&updated_at=eq.${encodeURIComponent(values.expectedUpdatedAt)}&select=*`
      try {
        const [result] = await supabaseRestStrict<Preferences[]>(path, { method: values.expectedUpdatedAt === null ? 'POST' : 'PATCH', headers: { Prefer: values.expectedUpdatedAt === null ? 'resolution=ignore-duplicates,return=representation' : 'return=representation' }, body: JSON.stringify(record) })
        if (!result) return NextResponse.json({ error: 'Preferences changed. Refresh and retry.' }, { status: 409 })
        return NextResponse.json({ preferences: result })
      } catch (error) {
        if (postgrestSchemaUnavailable(error)) {
          return NextResponse.json({ error: 'Reminder preferences are not stored yet. Nothing was saved, and no notification was sent.', unavailable: true }, { status: 409 })
        }
        throw error
      }
    }
    return NextResponse.json({ error: 'Invalid planning action.' }, { status: 400 })
  } catch (error) {
    if (postgrestSchemaUnavailable(error)) {
      return NextResponse.json({ error: 'Payment plans and reminder preferences are not stored yet. Nothing was scheduled, and no notification was sent.', unavailable: true }, { status: 409 })
    }
    if (error instanceof SupabaseRestError && error.code === '23505') return NextResponse.json({ error: 'A matching active plan already exists or this request key was used for another plan.' }, { status: 409 })
    if (error instanceof SupabaseRestError && ['22023','P0002'].includes(error.code || '')) return NextResponse.json({ error: error.message }, { status: error.code === 'P0002' ? 404 : 409 })
    console.error('Bill planning failed:', error)
    return NextResponse.json({ error: 'The change could not be confirmed. Retry the same request.' }, { status: 503 })
  }
}
