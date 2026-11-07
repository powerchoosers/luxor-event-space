import { NextRequest, NextResponse } from 'next/server'
import { supabaseRest, supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { assertLuxorProductionSideEffectsAllowed } from '@/lib/luxorTestLeadServer'
import { assertLuxorExpensePaymentHistoryReady, assertLuxorExpenseSchemaReady, isExpenseManagementNotReady, LuxorExpenseRequestError } from '@/lib/luxorExpensesServer'
import type { LuxorExpensePayment } from '@/lib/luxorInquiryTypes'

export type LuxorBookingExpense = {
  id: string
  created_at: string
  updated_at: string
  booking_id: string | null
  category: string
  description: string | null
  vendor_name: string | null
  amount: number
  incurred_on: string
  status: string
  notes: string | null
  metadata: Record<string, unknown>
  due_date?: string | null
  payment_method?: string | null
  reference_number?: string | null
  source_bill_id?: string | null
  expense_type?: 'business' | 'event'
  tax_amount?: number | null
  recurring_template_id?: string | null
  billing_period_start?: string | null
  billing_period_end?: string | null
  paid_amount?: number
  remaining_balance?: number | null
  amount_known?: boolean
  payment_status?: 'expected' | 'due_today' | 'overdue' | 'partially_paid' | 'paid' | 'cancelled'
  payments?: LuxorExpensePayment[]
}

type ExpensePaymentWithDate = LuxorExpensePayment & { payment_date: string | null }

async function readStrictRows<T>(path: string) {
  const expected = await supabaseRestCount(path)
  const rows: T[] = []
  for (let offset = 0; offset < expected; offset += 500) {
    const page = await supabaseRestStrict<T[]>(`${path}&limit=500&offset=${offset}`)
    rows.push(...page)
    if (page.length < Math.min(500, expected - offset)) throw new Error('Expense records could not be fully verified.')
  }
  if (rows.length !== expected || await supabaseRestCount(path) !== expected) throw new Error('Expense records changed while loading. Please refresh.')
  return rows
}

function luxorToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function withExpensePayments(expenses: LuxorBookingExpense[], payments: ExpensePaymentWithDate[]): LuxorBookingExpense[] {
  const byExpense = new Map<string, ExpensePaymentWithDate[]>()
  for (const payment of payments) {
    const rows = byExpense.get(payment.expense_id) || []
    rows.push(payment)
    byExpense.set(payment.expense_id, rows)
  }
  const today = luxorToday()
  return expenses.map((expense) => {
    const history = byExpense.get(expense.id) || []
    const legacyAmount = Number(expense.metadata?.legacy_paid_amount ?? (history.length === 0 && expense.status === 'paid' ? expense.amount : 0))
    const transactionTotal = history.reduce((total, payment) => {
      const amount = Number(payment.amount)
      if (payment.transaction_type === 'payment') return total + amount
      if (payment.transaction_type === 'refund' || payment.transaction_type === 'reversal') return total - amount
      throw new Error('Expense payment records need reconciliation.')
    }, 0)
    const paidAmount = Math.round((legacyAmount + transactionTotal + Number.EPSILON) * 100) / 100
    const amount = Number(expense.amount)
    const amountKnown = !(expense.metadata?.amount_state === 'variable' && amount === 0)
    if (!Number.isFinite(legacyAmount) || legacyAmount < 0 || !Number.isFinite(paidAmount) || !Number.isFinite(amount) || amount < 0) {
      throw new Error('Expense amounts need reconciliation.')
    }
    if (!amountKnown && paidAmount > 0) throw new Error('A variable expense with payment history needs a confirmed bill amount.')
    const remainingBalance = amountKnown ? Math.round((Math.max(0, amount - paidAmount) + Number.EPSILON) * 100) / 100 : null
    const paymentStatus = expense.status === 'cancelled' ? 'cancelled'
      : !amountKnown ? 'expected'
        : remainingBalance === 0 ? 'paid'
          : expense.due_date && expense.due_date < today ? 'overdue'
            : expense.due_date === today ? 'due_today'
              : paidAmount > 0 ? 'partially_paid' : 'expected'
    return {
      ...expense,
      amount_known: amountKnown,
      payments: history,
      paid_amount: paidAmount,
      remaining_balance: remainingBalance,
      payment_status: paymentStatus,
    }
  })
}

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const bookingId = searchParams.get('bookingId')

    let path = 'luxor_booking_expenses?select=*&order=incurred_on.desc,created_at.desc,id.asc'
    if (bookingId) {
      path = `luxor_booking_expenses?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&order=incurred_on.desc,created_at.desc,id.asc`
    }

    const expenses = await readStrictRows<LuxorBookingExpense>(path)
    if (new Set(expenses.map((expense) => expense.id)).size !== expenses.length) throw new Error('Duplicate expense records need reconciliation.')
    try {
      await assertLuxorExpensePaymentHistoryReady()
    } catch (error) {
      // Phase 1/2 read surfaces continue using their original expense rows
      // while the Phase 3 ledger migration is pending. No dates or payments
      // are inferred for legacy rows; only records already marked paid count.
      if (isExpenseManagementNotReady(error)) {
        return NextResponse.json(withExpensePayments(expenses, []), {
          headers: { 'Cache-Control': 'no-store', 'X-Luxor-Expense-History': 'legacy-only' },
        })
      }
      throw error
    }
    const payments = await readStrictRows<ExpensePaymentWithDate>('luxor_expense_payments?select=*&order=payment_date.asc,created_at.asc,id.asc')
    const expenseIds = new Set(expenses.map((expense) => expense.id))
    return NextResponse.json(withExpensePayments(expenses, payments.filter((payment) => expenseIds.has(payment.expense_id))))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch expenses.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
    await assertLuxorExpenseSchemaReady()

    const body = await request.json()
    const { booking_id, category, description, vendor_name, amount, incurred_on, status, notes } = body
    const bookingIdValue = booking_id == null ? null : typeof booking_id === 'string' ? booking_id.trim() : undefined
    const bookingId = bookingIdValue ?? ''
    const cleanCategory = typeof category === 'string' ? category.trim() : ''
    const numericAmount = Number(amount)
    const expenseStatus = status ?? 'incurred'
    if (bookingIdValue === undefined || (bookingId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId))) {
      return NextResponse.json({ error: 'Choose a valid booking or leave it blank for general overhead.' }, { status: 400 })
    }
    if (!cleanCategory || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: 'Category and a positive amount are required.' }, { status: 400 })
    }
    if (!['planned', 'incurred'].includes(expenseStatus)) {
      return NextResponse.json({ error: 'Create the expense as expected or unpaid, then record a payment in the expense detail.' }, { status: 400 })
    }

    if (bookingId) {
      const [booking] = await supabaseRestStrict<Array<{ inquiry_id: string | null }>>(`luxor_bookings?select=inquiry_id&id=eq.${encodeURIComponent(bookingId)}&limit=1`)
      if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
      if (booking.inquiry_id) await assertLuxorProductionSideEffectsAllowed(booking.inquiry_id)
    }

    const [created] = await supabaseRest<LuxorBookingExpense[]>('luxor_booking_expenses?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        booking_id: bookingId || null,
        category: cleanCategory,
        description: description || null,
        vendor_name: vendor_name || null,
        amount: numericAmount,
        incurred_on: incurred_on || new Date().toISOString().split('T')[0],
        status: expenseStatus,
        notes: notes || null,
        metadata: {},
      }),
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    if (error instanceof LuxorExpenseRequestError) return NextResponse.json({ error: error.message }, { status: error.status })
    const message = error instanceof Error ? error.message : 'Failed to save expense.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
    await assertLuxorExpenseSchemaReady()

    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      || body.status !== 'cancelled') {
      return NextResponse.json({ error: 'A valid expense and cancelled status are required.' }, { status: 400 })
    }

    const [current] = await supabaseRestStrict<LuxorBookingExpense[]>(`luxor_booking_expenses?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
    if (!current) return NextResponse.json({ error: 'Expense not found.' }, { status: 404 })
    if (current.status === 'cancelled') return NextResponse.json(current)
    if (current.booking_id) {
      const [booking] = await supabaseRestStrict<Array<{ inquiry_id: string | null }>>(`luxor_bookings?select=inquiry_id&id=eq.${encodeURIComponent(current.booking_id)}&limit=1`)
      if (booking?.inquiry_id) await assertLuxorProductionSideEffectsAllowed(booking.inquiry_id)
    }

    await supabaseRestStrict<Record<string, unknown>>('rpc/luxor_update_expense_safely', {
      method: 'POST',
      body: JSON.stringify({
        p_expense_id: id,
        p_expected_updated_at: current.updated_at,
        p_changes: { status: 'cancelled' },
        p_actor_email: session.email,
      }),
    })
    const [updated] = await supabaseRestStrict<LuxorBookingExpense[]>(`luxor_booking_expenses?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof LuxorExpenseRequestError) return NextResponse.json({ error: error.message }, { status: error.status })
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
    if (code === '40001' || code === '55000' || code === '23505') return NextResponse.json({ error: error instanceof Error ? error.message : 'Expense changed while it was being removed. Refresh and try again.' }, { status: 409 })
    if (code === 'P0002') return NextResponse.json({ error: 'Expense not found.' }, { status: 404 })
    const message = error instanceof Error ? error.message : 'Failed to remove expense.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
