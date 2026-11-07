import { NextRequest, NextResponse } from 'next/server'
import { supabaseRestStrict, SupabaseRestError } from '@/lib/supabaseRestServer'
import {
  authorizeLuxorExpenseRequest,
  findExpenseBySourceBill,
  getExpenseRecordWithHistory,
  getLuxorExpenseCategoryByName,
  isDateKey,
  isExpenseUuid,
  LuxorExpenseRequestError,
  toExpenseErrorResponse,
  validateExpenseBill,
  validateExpenseBooking,
} from '@/lib/luxorExpensesServer'

export const dynamic = 'force-dynamic'

function objectBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

function money(value: unknown) {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 && Math.round(parsed * 100) === parsed * 100 ? parsed : null
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { session } = await authorizeLuxorExpenseRequest()
    const { id } = await context.params
    if (!isExpenseUuid(id)) throw new LuxorExpenseRequestError('Choose a valid expense.')
    const current = await getExpenseRecordWithHistory(id)
    if (!current) throw new LuxorExpenseRequestError('Expense not found.', 404)
    const body = objectBody(await request.json())
    if (!body) throw new LuxorExpenseRequestError('Invalid expense update.')

    const patch: Record<string, unknown> = {}
    const editable = ['description', 'amount', 'incurred_on', 'due_date', 'category', 'vendor_name', 'payment_method', 'reference_number', 'notes', 'status', 'booking_id', 'source_bill_id']
    for (const key of editable) {
      if (body[key] === undefined) continue
      switch (key) {
        case 'description': {
          const value = clean(body.description, 300)
          if (!value) throw new LuxorExpenseRequestError('Enter an expense description.')
          patch.description = value
          break
        }
        case 'amount': {
          const amount = money(body.amount)
          if (amount === null) throw new LuxorExpenseRequestError('Enter a positive amount to the nearest cent.')
          if (amount < current.paid_amount) throw new LuxorExpenseRequestError('The expense total cannot be lower than its recorded paid amount. Record an adjustment first.')
          patch.amount = amount
          break
        }
        case 'incurred_on':
          if (!isDateKey(body.incurred_on)) throw new LuxorExpenseRequestError('Choose a valid expense date.')
          patch.incurred_on = body.incurred_on
          break
        case 'due_date':
          if (body.due_date !== null && body.due_date !== '' && !isDateKey(body.due_date)) throw new LuxorExpenseRequestError('Choose a valid due date.')
          patch.due_date = body.due_date || null
          break
        case 'category': {
          const name = clean(body.category, 100)
          const category = name ? await getLuxorExpenseCategoryByName(name) : null
          if (!category) throw new LuxorExpenseRequestError('That category is inactive or unavailable. Refresh the category list.')
          patch.category = category.name
          patch.category_id = category.id
          break
        }
        case 'vendor_name':
          patch.vendor_name = clean(body.vendor_name, 200) || null
          break
        case 'payment_method': {
          const method = clean(body.payment_method, 40)
          if (!['Credit Card','Debit Card','Cash','Zelle','Bank Transfer','Check','Stripe','Other'].includes(method)) throw new LuxorExpenseRequestError('Choose a valid payment method.')
          patch.payment_method = method
          break
        }
        case 'reference_number':
          patch.reference_number = clean(body.reference_number, 100) || null
          break
        case 'notes':
          patch.notes = clean(body.notes, 4000) || null
          break
        case 'status':
          if (!['planned','incurred','cancelled'].includes(String(body.status))) throw new LuxorExpenseRequestError('Use Record payment to mark an expense paid.')
          if (body.status === 'cancelled') {
            if (current.source_bill_id) throw new LuxorExpenseRequestError('Unlink or resolve the source bill before canceling this expense.', 409)
            if (current.paid_amount > 0) throw new LuxorExpenseRequestError('Record a refund or reversal before canceling an expense with a remaining paid balance.', 409)
          }
          patch.status = body.status
          break
        case 'booking_id': {
          const bookingId = body.booking_id === null || body.booking_id === '' ? null : body.booking_id
          if (bookingId !== null && !isExpenseUuid(bookingId)) throw new LuxorExpenseRequestError('Choose a valid booking.')
          if (current.payments.length > 0 && bookingId !== current.booking_id) throw new LuxorExpenseRequestError('An expense with payment history cannot be reassigned to another booking.', 409)
          if (bookingId) {
            const booking = await validateExpenseBooking(bookingId)
            if (!booking) throw new LuxorExpenseRequestError('Booking not found.', 404)
          }
          patch.booking_id = bookingId
          patch.expense_type = bookingId ? 'event' : 'business'
          break
        }
        case 'source_bill_id': {
          const sourceBillId = body.source_bill_id === null || body.source_bill_id === '' ? null : body.source_bill_id
          if (sourceBillId === current.source_bill_id) break
          if (current.source_bill_id) throw new LuxorExpenseRequestError('An expense cannot be reassigned to a different source bill.', 409)
          if (sourceBillId === null || !isExpenseUuid(sourceBillId)) throw new LuxorExpenseRequestError('Choose a valid source bill.')
          if (body.confirm_source_bill !== true) throw new LuxorExpenseRequestError('Review and confirm the extracted bill facts before linking it.')
          const bill = await validateExpenseBill(sourceBillId)
          if (!bill) throw new LuxorExpenseRequestError('Source bill not found.', 404)
          if (bill.extraction_status !== 'ready' || !bill.payment_ready_at || bill.status === 'paid'
            || bill.amount_state !== 'known' || bill.currency?.toUpperCase() !== 'USD') {
            throw new LuxorExpenseRequestError('Only a reviewed, payment-ready USD bill with a confirmed amount can be linked.')
          }
          const link = await findExpenseBySourceBill(sourceBillId)
          if (link && link.id !== current.id) throw new LuxorExpenseRequestError('This bill is already linked to another expense.', 409)
          const confirmedAmount = Object.hasOwn(body, 'amount') ? money(body.amount) : current.amount
          if (confirmedAmount === null || Math.abs(Number(bill.amount) - confirmedAmount) > 0.001) throw new LuxorExpenseRequestError('The reviewed bill amount must match this expense occurrence.')
          patch.source_bill_id = sourceBillId
          patch.amount = confirmedAmount
          if (!Object.hasOwn(body, 'status') && current.status === 'planned') patch.status = 'incurred'
          patch.metadata = {
            ...current.metadata,
            amount_state: 'known',
            expected_amount: null,
            amount_confirmation_source: 'reviewed_source_bill',
            source_bill_confirmed_by: session.email,
            source_bill_confirmed_at: new Date().toISOString(),
          }
          break
        }
      }
    }
    if (Object.hasOwn(body, 'amount') && !Object.hasOwn(patch, 'metadata') && current.metadata?.amount_state === 'variable') {
      patch.metadata = {
        ...current.metadata,
        amount_state: 'known',
        expected_amount: null,
        amount_confirmation_source: 'user_entry',
        amount_confirmed_by: session.email,
        amount_confirmed_at: new Date().toISOString(),
      }
    }
    if (!Object.keys(patch).length) throw new LuxorExpenseRequestError('Choose expense details to update.')

    await supabaseRestStrict<Record<string, unknown>>('rpc/luxor_update_expense_safely', {
      method: 'POST',
      body: JSON.stringify({ p_expense_id: id, p_expected_updated_at: current.updated_at, p_changes: patch, p_actor_email: session.email }),
    })
    const refreshed = await getExpenseRecordWithHistory(id)
    if (!refreshed) throw new Error('Saved expense could not be reloaded.')
    return NextResponse.json(refreshed, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof SupabaseRestError) {
      if (error.code === 'P0002') return NextResponse.json({ error: 'Expense not found.' }, { status: 404 })
      if (error.code === '23505') return NextResponse.json({ error: 'This bill or recurring occurrence is already linked to an expense.' }, { status: 409 })
      if (error.code === '40001') return NextResponse.json({ error: 'This expense changed while you were editing it. Refresh and review the latest details.' }, { status: 409 })
      if (error.code === '55000') return NextResponse.json({ error: error.message }, { status: 409 })
      if (error.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Expense could not be updated:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}
