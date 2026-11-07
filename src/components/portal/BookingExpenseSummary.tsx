'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ReceiptText } from '@/lib/icons/phosphor-compat'

type EventExpense = {
  id: string
  description: string | null
  category: string
  amount: number
  incurred_on: string | null
  due_date?: string | null
  status: string
  vendor_name?: string | null
  metadata?: Record<string, unknown>
  amount_known?: boolean
  paid_amount?: number
  remaining_balance?: number | null
  payment_status?: 'expected' | 'due_today' | 'overdue' | 'partially_paid' | 'paid' | 'cancelled'
}

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error'
const EMPTY_EXPENSES: EventExpense[] = []

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function expenseDate(value: string | null | undefined) {
  if (!value) return 'Date not set'
  const dateOnly = value.slice(0, 10)
  const parsed = new Date(`${dateOnly}T12:00:00Z`)
  if (!Number.isFinite(parsed.getTime())) return 'Date not set'
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function statusLabel(expense: EventExpense) {
  if (expense.payment_status === 'overdue') return 'Overdue'
  if (expense.payment_status === 'due_today') return 'Due today'
  if (expense.payment_status === 'partially_paid') return 'Partially paid'
  if (expense.payment_status === 'paid') return 'Paid'
  if (expense.payment_status === 'cancelled' || expense.status === 'cancelled') return 'Canceled'
  return 'Expected'
}

function amountIsUnknown(expense: EventExpense) {
  return expense.amount_known === false || (Number(expense.amount) === 0 && expense.metadata?.amount_state === 'variable')
}

export function BookingExpenseSummary({ bookingId, contractTotal }: { bookingId: string; contractTotal: number | null }) {
  const [result, setResult] = useState<{ bookingId: string; state: LoadState; expenses: EventExpense[]; paymentsReceived: number | null }>({ bookingId: '', state: 'loading', expenses: [], paymentsReceived: null })
  const state = result.bookingId === bookingId ? result.state : 'loading'
  const expenses = result.bookingId === bookingId ? result.expenses : EMPTY_EXPENSES

  useEffect(() => {
    let active = true
    Promise.all([
      fetch(`/api/expenses?bookingId=${encodeURIComponent(bookingId)}`, { cache: 'no-store' }),
      fetch('/api/portal/finance-overview-ledgers', { cache: 'no-store' }),
    ])
      .then(async ([response, financeResponse]) => {
        if (response.status === 401 || response.status === 403) {
          if (active) setResult({ bookingId, state: 'forbidden', expenses: [], paymentsReceived: null })
          return null
        }
        if (!response.ok) throw new Error('Event expenses could not be loaded.')
        const payload: unknown = await response.json()
        if (!Array.isArray(payload)) throw new Error('Event expenses could not be verified.')
        let paymentsReceived: number | null = null
        if (financeResponse.ok) {
          const financials = await financeResponse.json() as { eventPaymentsVerified?: boolean; eventPaymentsReceivedByBooking?: Record<string, number> | null }
          const amount = Number(financials.eventPaymentsReceivedByBooking?.[bookingId] || 0)
          if (financials.eventPaymentsVerified === true && financials.eventPaymentsReceivedByBooking && Number.isFinite(amount)) paymentsReceived = amount
        }
        if (active) setResult({ bookingId, state: 'ready', expenses: payload as EventExpense[], paymentsReceived })
        return null
      })
      .catch(() => {
        if (active) setResult({ bookingId, state: 'error', expenses: [], paymentsReceived: null })
      })
    return () => { active = false }
  }, [bookingId])

  const activeExpenses = useMemo(() => expenses.filter((expense) => expense.status !== 'cancelled'), [expenses])
  const knownAmountExpenses = useMemo(() => activeExpenses.filter((expense) => !amountIsUnknown(expense)), [activeExpenses])
  const unknownAmountCount = activeExpenses.length - knownAmountExpenses.length
  const totals = useMemo(() => knownAmountExpenses.reduce((result, expense) => ({
    total: result.total + Math.max(0, Number(expense.amount) || 0),
    paid: result.paid + Math.max(0, Number(expense.paid_amount) || 0),
    outstanding: result.outstanding + Math.max(0, Number(expense.remaining_balance) || 0),
  }), { total: 0, paid: 0, outstanding: 0 }), [knownAmountExpenses])
  const incomeAfterPaidExpenses = state === 'ready' && result.paymentsReceived !== null ? result.paymentsReceived - totals.paid : null
  const href = '/portal/finances/expenses/events'

  return (
    <section className="mt-5 border-t border-[color:var(--portal-border)] pt-4" aria-labelledby="booking-expenses-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ReceiptText size={17} className="shrink-0 text-[#a17b35] dark:text-[#caa24c]" aria-hidden="true" />
          <h3 id="booking-expenses-title" className="text-sm font-bold text-[color:var(--portal-text)]">Event expenses</h3>
        </div>
        {state !== 'forbidden' ? (
          <Link href={href} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[#9a712e] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]">
            View event expenses <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {state === 'loading' ? <p className="mt-3 text-xs text-[color:var(--portal-muted)]" role="status">Loading event expenses…</p> : null}
      {state === 'forbidden' ? <p className="mt-3 text-xs leading-5 text-[color:var(--portal-muted)]">Expense totals are available to team members with Financial Center access.</p> : null}
      {state === 'error' ? <p className="mt-3 text-xs leading-5 text-[color:var(--portal-muted)]" role="status">Event expenses could not be verified. Refresh this page to retry.</p> : null}

      {state === 'ready' ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 sm:grid-cols-3">
            <SummaryValue label="Contract total (expected)" value={contractTotal} />
            <SummaryValue label="Payments received" value={result.paymentsReceived} />
            <SummaryValue label="Total expenses" value={totals.total} />
            <SummaryValue label="Expenses paid" value={totals.paid} />
            <SummaryValue label="Outstanding expenses" value={totals.outstanding} />
            <SummaryValue label="Income after paid expenses" value={incomeAfterPaidExpenses} />
          </div>
          {unknownAmountCount > 0 ? <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]" role="status">Totals exclude {unknownAmountCount} expense{unknownAmountCount === 1 ? '' : 's'} awaiting {unknownAmountCount === 1 ? 'its bill' : 'their bills'}.</p> : null}
          {activeExpenses.length ? <ul className="mt-2 divide-y divide-[color:var(--portal-border)]">
            {activeExpenses.map((expense) => {
              const unknownVariableAmount = amountIsUnknown(expense)
              return (
                <li key={expense.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-[color:var(--portal-text)]">{expense.description?.trim() || 'Event expense'}</p>
                    <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{expense.category.replaceAll('_', ' ')} / {expenseDate(expense.incurred_on || expense.due_date)}{expense.vendor_name ? ` / ${expense.vendor_name}` : ''}</p>
                    <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{statusLabel(expense)}</p>
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <p className="text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{unknownVariableAmount ? 'Awaiting bill' : money(Number(expense.amount) || 0)}</p>
                    <p className="mt-1 text-xs tabular-nums text-[color:var(--portal-muted)]">{unknownVariableAmount ? 'Paid / remaining pending' : `Paid ${money(Number(expense.paid_amount) || 0)} / Remaining ${money(Number(expense.remaining_balance) || 0)}`}</p>
                  </div>
                </li>
              )
            })}
          </ul> : <p className="mt-3 text-xs text-[color:var(--portal-muted)]">No expenses are linked to this event yet.</p>}
        </>
      ) : null}
      <p className="mt-3 text-[11px] leading-5 text-[color:var(--portal-muted)]">Contract totals are expected revenue. Payments received include only verified event cash after allocations and completed refunds; refundable security deposits are excluded.</p>
    </section>
  )
}

function SummaryValue({ label, value }: { label: string; value: number | null }) {
  return <div className="min-w-0"><p className="text-[10px] font-medium text-[color:var(--portal-muted)]">{label}</p><p className="mt-1 truncate text-xs font-semibold tabular-nums text-[color:var(--portal-text)]">{value === null ? 'Unavailable' : money(value)}</p></div>
}
