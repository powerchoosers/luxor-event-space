import { NextRequest, NextResponse } from 'next/server'
import { supabaseRestStrict, SupabaseRestError } from '@/lib/supabaseRestServer'
import {
  authorizeLuxorExpenseRequest,
  getExpenseRecordWithHistory,
  isDateKey,
  isExpenseUuid,
  LUXOR_EXPENSE_PAYMENT_METHODS,
  LuxorExpenseRequestError,
  toExpenseErrorResponse,
} from '@/lib/luxorExpensesServer'
import {
  isLuxorExpensePaymentIdempotencyConflict,
  LUXOR_EXPENSE_PAYMENT_IDEMPOTENCY_CONFLICT_CODE,
} from '@/lib/luxorExpenseTypes'
import type { LuxorExpensePaymentTransactionType } from '@/lib/luxorExpenseTypes'

export const dynamic = 'force-dynamic'

function bodyObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

function toPublicError(error: unknown) {
  if (error instanceof SupabaseRestError) {
    if (error.code === 'P0002') return new LuxorExpenseRequestError('Expense not found.', 404)
    if (error.code === '55000' || error.code === '23505') return new LuxorExpenseRequestError(error.message, 409)
    if (error.code === '22023') return new LuxorExpenseRequestError(error.message, 400)
  }
  return error
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { session } = await authorizeLuxorExpenseRequest()
    const { id } = await context.params
    if (!isExpenseUuid(id)) throw new LuxorExpenseRequestError('Choose a valid expense.')
    const body = bodyObject(await request.json())
    if (!body) throw new LuxorExpenseRequestError('Invalid expense payment.')
    const amount = typeof body.amount === 'number' || typeof body.amount === 'string' ? Number(body.amount) : Number.NaN
    const transactionType = body.transaction_type
    const paymentDate = body.payment_date
    const paymentMethod = clean(body.payment_method, 40)
    const idempotencyKey = clean(body.idempotency_key, 200)
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) throw new LuxorExpenseRequestError('Enter a positive payment amount to the nearest cent.')
    if (!['payment','refund','reversal'].includes(String(transactionType))) throw new LuxorExpenseRequestError('Choose a payment, refund, or reversal transaction type.')
    if (!isDateKey(paymentDate)) throw new LuxorExpenseRequestError('Choose a valid transaction date.')
    if (!LUXOR_EXPENSE_PAYMENT_METHODS.includes(paymentMethod as typeof LUXOR_EXPENSE_PAYMENT_METHODS[number])) throw new LuxorExpenseRequestError('Choose a valid payment method.')
    if (idempotencyKey.length < 8) throw new LuxorExpenseRequestError('A stable payment request key is required. Refresh the form and try again.')

    const response = await supabaseRestStrict<Record<string, unknown>>('rpc/luxor_record_expense_payment', {
      method: 'POST',
      body: JSON.stringify({
        p_expense_id: id,
        p_amount: amount,
        p_transaction_type: transactionType as LuxorExpensePaymentTransactionType,
        p_payment_date: paymentDate,
        p_payment_method: paymentMethod,
        p_reference_number: clean(body.reference_number, 100) || null,
        p_notes: clean(body.notes, 4000) || null,
        p_idempotency_key: idempotencyKey,
        p_actor_email: session.email,
      }),
    })
    const expense = await getExpenseRecordWithHistory(id)
    if (!expense) throw new LuxorExpenseRequestError('Expense not found.', 404)
    const transaction = response.payment as Record<string, unknown> | undefined
    const payment = transaction?.id
      ? expense.payments.find((row) => row.id === transaction.id)
      : expense.payments.find((row) => row.idempotency_key === idempotencyKey)
    return NextResponse.json({ expense, payment: payment || null, replayed: response.replayed === true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const mapped = toPublicError(error)
    const result = toExpenseErrorResponse(mapped)
    const idempotencyConflict = error instanceof SupabaseRestError
      && isLuxorExpensePaymentIdempotencyConflict(error.code, error.message)
    if (result.status === 500) console.error('Expense payment could not be recorded:', error)
    return NextResponse.json({
      error: result.message,
      ...(idempotencyConflict ? { code: LUXOR_EXPENSE_PAYMENT_IDEMPOTENCY_CONFLICT_CODE } : {}),
    }, { status: result.status })
  }
}
