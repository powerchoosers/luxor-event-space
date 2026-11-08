import type { LuxorBill } from '@/lib/luxorInquiryTypes'

export type BillExpense = {
  id: string
  source_bill_id?: string | null
  amount: number | string
  paid_amount?: number | string | null
  remaining_balance?: number | string | null
  status: string
  booking_id?: string | null
  due_date?: string | null
  recurring_template_id?: string | null
  payments?: Array<{ id: string; amount: number | string; payment_date: string; payment_method: string; transaction_type: string; reference_number?: string | null; notes?: string | null }>
  metadata?: Record<string, unknown>
}
export type BillBalance = { expense: BillExpense | null; original: number | null; paid: number | null; remaining: number | null; reason: string | null }

function calendarDay(value: string | null | undefined) {
  const day = value?.slice(0, 10) || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const [year, month, dayNumber] = day.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, dayNumber))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== dayNumber) return null
  return day
}

/** Never treat a missing expense or missing payment history as a zero balance. */
export function getBillBalance(bill: LuxorBill, expenses: BillExpense[] | null): BillBalance {
  const originalValue = Number(bill.amount)
  const original = bill.amount_state === 'known' && Number.isFinite(originalValue) && originalValue >= 0 ? originalValue : null
  const unavailable = (reason: string, expense: BillExpense | null = null): BillBalance => ({ expense, original, paid: null, remaining: null, reason })
  if (!expenses) return unavailable('Expense payment history unavailable')
  const matches = expenses.filter((expense) => expense.source_bill_id === bill.id)
  if (matches.length !== 1) return unavailable(matches.length ? 'Duplicate linked expenses need review' : 'Link an expense to verify the balance')
  const expense = matches[0]
  const billDue = bill.due_date ? calendarDay(bill.due_date) : null
  const expenseDue = expense.due_date ? calendarDay(expense.due_date) : null
  if ((bill.due_date && !billDue) || (expense.due_date && !expenseDue) || (billDue && expenseDue && billDue !== expenseDue)) return unavailable('Bill and expense due dates need reconciliation', expense)
  if (bill.extraction_status !== 'ready' || !bill.payment_ready_at) return unavailable('Review the linked bill before using its balance', expense)
  if (original === null || bill.currency?.toUpperCase() !== 'USD') return unavailable('Confirm the USD bill amount', expense)
  if (expense.status === 'cancelled' || expense.paid_amount == null || expense.remaining_balance == null) return unavailable('Expense balance needs review', expense)
  const amount = Number(expense.amount), paid = Number(expense.paid_amount), remaining = Number(expense.remaining_balance)
  if (![amount, paid, remaining].every(Number.isFinite) || paid < 0 || remaining < 0 || Math.abs(amount-original) > 0.005 || Math.abs(amount-paid-remaining) > 0.005 || (bill.status === 'paid') !== (remaining === 0)) return unavailable('Bill and expense balances need reconciliation', expense)
  if (!Array.isArray(expense.payments)) return unavailable('Expense payment history unavailable', expense)
  let transactionTotal = 0
  for (const payment of expense.payments) {
    const value = Number(payment.amount)
    if (!Number.isFinite(value) || value <= 0 || !['payment', 'refund', 'reversal'].includes(payment.transaction_type) || !calendarDay(payment.payment_date)) return unavailable('Expense payment history needs review', expense)
    transactionTotal += payment.transaction_type === 'payment' ? value : -value
  }
  if (Math.abs(transactionTotal - paid) > 0.005) return unavailable('Older payment history needs review', expense)
  return { expense, original, paid, remaining, reason: null }
}
