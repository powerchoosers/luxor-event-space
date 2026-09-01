import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'

const ALLOWED_FIELDS = new Set(['service', 'frequency', 'provider', 'amount', 'due_date', 'invoice_number', 'review_notes'])

function reviewUpdates(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value as Record<string, unknown>).filter(([key]) => ALLOWED_FIELDS.has(key))
  const updates = Object.fromEntries(entries)
  if ('amount' in updates) {
    const amount = Number(updates.amount)
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Amount must be a valid positive number.')
    updates.amount = amount
  }
  if ('due_date' in updates && updates.due_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(updates.due_date))) {
    throw new Error('Due date must use YYYY-MM-DD.')
  }
  return updates
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id } = await context.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid bill.' }, { status: 400 })
    const body = await request.json() as { action?: string; updates?: unknown; note?: unknown }
    if (!['approve', 'flag', 'mark_paid'].includes(body.action || '')) return NextResponse.json({ error: 'Invalid review action.' }, { status: 400 })
    const now = new Date().toISOString()
    const changes = reviewUpdates(body.updates)
    if (body.action === 'approve') Object.assign(changes, {
      extraction_status: 'ready', reviewed_at: now, reviewed_by: session.email,
      payment_ready_at: now, review_notes: typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null,
    })
    else if (body.action === 'flag') Object.assign(changes, {
      extraction_status: 'needs_review', reviewed_at: now, reviewed_by: session.email,
      payment_ready_at: null, review_notes: typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || 'Flagged for review.' : 'Flagged for review.',
    })
    else Object.assign(changes, { status: 'paid', reviewed_at: now, reviewed_by: session.email })
    const [bill] = await supabaseRest<LuxorBill[]>(`luxor_bills?id=eq.${id}&select=*`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...changes, updated_at: now }),
    })
    if (!bill) return NextResponse.json({ error: 'Bill not found.' }, { status: 404 })
    if (bill.source_attachment_id) {
      await supabaseRest(`luxor_bill_intakes?attachment_id=eq.${bill.source_attachment_id}`, { method: 'PATCH', body: JSON.stringify({
        status: body.action === 'flag' ? 'needs_review' : 'ready', reviewed_at: now, reviewed_by: session.email, updated_at: now,
      }) })
    }
    return NextResponse.json(bill)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bill review failed.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
