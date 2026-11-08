import { NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { supabaseRest, supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'
import { luxorTimestampIsKnown, luxorTimestampMs } from '@/lib/luxorTimestamp'

const ALLOWED_FIELDS = new Set(['service', 'frequency', 'provider', 'amount', 'due_date', 'invoice_number', 'review_notes'])

function realDueDate(value: string | null) {
  if (!value) return true
  const day = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const [year, month, date] = day.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, date))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === date
}

function reviewUpdates(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value as Record<string, unknown>).filter(([key]) => ALLOWED_FIELDS.has(key))
  const updates = Object.fromEntries(entries)
  if ('amount' in updates) {
    if (updates.amount === null || updates.amount === '') throw new Error('Amount must be a valid positive number.')
    const amount = Number(updates.amount)
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Amount must be a valid positive number.')
    updates.amount = amount
  }
  if ('due_date' in updates && updates.due_date !== null && updates.due_date !== '') {
    const value = String(updates.due_date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Due date must use YYYY-MM-DD.')
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Due date must be a real calendar day.')
  }
  return updates
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOperationsSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id } = await context.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid bill.' }, { status: 400 })
    const body = await request.json() as { action?: string; updates?: unknown; note?: unknown; expectedUpdatedAt?: unknown }
    if (!['approve', 'flag', 'mark_paid', 'confirm_distinct'].includes(body.action || '')) return NextResponse.json({ error: 'Invalid review action.' }, { status: 400 })
    if (typeof body.expectedUpdatedAt !== 'string' || !luxorTimestampIsKnown(body.expectedUpdatedAt)) return NextResponse.json({ error: 'Reload the bill before reviewing.' }, { status: 400 })
    const priorMs = luxorTimestampMs(body.expectedUpdatedAt)!
    const now = new Date(Math.max(Date.now(), priorMs + 1)).toISOString()
    const changes = reviewUpdates(body.updates)
    if (Object.keys(changes).length) return NextResponse.json({ error: 'Save corrections before reviewing this bill.' }, { status: 400 })
    const [current] = await supabaseRest<LuxorBill[]>(`luxor_bills?id=eq.${id}&select=*&limit=1`)
    if (!current) return NextResponse.json({ error: 'Bill not found.' }, { status: 404 })
    if (current.updated_at !== body.expectedUpdatedAt || current.status === 'paid') return NextResponse.json({ error: 'Bill changed or is already paid. Reload before continuing.' }, { status: 409 })
    if (body.action === 'mark_paid') {
      const [linkedExpense] = await supabaseRestStrict<Array<{ id: string }>>(
        `luxor_booking_expenses?select=id&source_bill_id=eq.${encodeURIComponent(current.id)}&limit=1`,
      )
      return NextResponse.json({
        error: linkedExpense
          ? 'Record this payment in Expense Management so balances and cash reporting stay in sync.'
          : 'Link this reviewed bill to an expense in Expense Management, then record the payment there.',
        expense_id: linkedExpense?.id || null,
      }, { status: 409 })
    }
    if (body.action === 'approve' || body.action === 'mark_paid') {
      if (current.source_type !== 'manual' && !current.vendor_id) return NextResponse.json({ error: 'Link a company before approving or recording payment.' }, { status: 400 })
      if (!current.bill_category) return NextResponse.json({ error: 'Confirm a category before approving or recording payment.' }, { status: 400 })
      if (current.amount_state !== 'known') return NextResponse.json({ error: 'Confirm the bill amount before approving or recording payment.' }, { status: 400 })
      if (!realDueDate(current.due_date)) return NextResponse.json({ error: 'Correct the due date before approving. A missing date is allowed, but an impossible date is not.' }, { status: 400 })
      if (!realDueDate(current.issue_date)) return NextResponse.json({ error: 'Correct the issue date before approving. A missing issue date is allowed, but an impossible date is not.' }, { status: 400 })
      if (current.arithmetic_status === 'mismatch' || current.extraction_status === 'duplicate' || current.duplicate_of_bill_id) return NextResponse.json({ error: 'Resolve the duplicate or arithmetic discrepancy before approval or payment.' }, { status: 400 })
      if (body.action === 'approve' && current.extraction_status !== 'needs_review') return NextResponse.json({ error: 'Only a bill awaiting review can be approved.' }, { status: 400 })
      if (body.action === 'mark_paid' && current.extraction_status !== 'ready') return NextResponse.json({ error: 'Approve the bill before recording payment.' }, { status: 400 })
      if (body.action === 'mark_paid' && current.source_type !== 'manual' && !current.reviewed_at) return NextResponse.json({ error: 'Approve the imported bill before recording payment.' }, { status: 400 })
    }
    if (body.action === 'confirm_distinct') {
      if (!current.duplicate_of_bill_id) return NextResponse.json({ error: 'There is no possible duplicate to resolve.' }, { status: 400 })
      Object.assign(changes, { duplicate_of_bill_id: null, extraction_status: 'needs_review', payment_ready_at: null, reviewed_at: now, reviewed_by: session.email, review_notes: `Owner confirmed this is distinct from bill ${current.duplicate_of_bill_id}.` })
    } else if (body.action === 'approve') Object.assign(changes, {
      extraction_status: 'ready', reviewed_at: now, reviewed_by: session.email,
      payment_ready_at: now, review_notes: typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || current.review_notes : current.review_notes,
    })
    else if (body.action === 'flag') Object.assign(changes, {
      extraction_status: 'needs_review', reviewed_at: now, reviewed_by: session.email,
      payment_ready_at: null, review_notes: typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || 'Flagged for review.' : 'Flagged for review.',
    })
    const [bill] = await supabaseRest<LuxorBill[]>(`luxor_bills?id=eq.${id}&updated_at=eq.${encodeURIComponent(body.expectedUpdatedAt)}&status=neq.paid&select=*`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...changes, updated_at: now }),
    })
    if (!bill) return NextResponse.json({ error: 'Bill changed. Reload and try again.' }, { status: 409 })
    if (bill.source_attachment_id) {
      await supabaseRest(`luxor_bill_intakes?attachment_id=eq.${bill.source_attachment_id}&status=in.(needs_review,ready)`, { method: 'PATCH', body: JSON.stringify({
        status: body.action === 'flag' || body.action === 'confirm_distinct' ? 'needs_review' : 'ready', reviewed_at: now, reviewed_by: session.email, updated_at: now,
      }) })
    }
    return NextResponse.json(bill)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bill review failed.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
