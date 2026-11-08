import { isExactPlanningCent } from './luxorFinancialPlanningBounds'
import type { LuxorExpenseRecord, LuxorExpenseTemplate } from '@/lib/luxorExpenseTypes'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'
import type { getLuxorFinanceOverview } from '@/lib/luxorFinanceReporting'
import type { ForecastFlow } from '@/lib/luxorFinancialPlanningModels'
import { getBillBalance } from '@/lib/luxorBillBalances'
import { hasUnresolvedLegacyExpenseBalance } from '@/lib/luxorLegacyExpenseBalances'

/** Build dated inputs from already-classified, complete source snapshots. */
export function planningDatedFlows(input: {
  today: string
  revenue: ReturnType<typeof getLuxorFinanceOverview> | null
  expenses: LuxorExpenseRecord[] | null
  bills: LuxorBill[] | null
  templates: LuxorExpenseTemplate[] | null
}) {
  const flows: ForecastFlow[] = []
  const issues: string[] = []
  let inflowAvailable = input.revenue !== null && input.revenue.expectedByMonth !== null
  let outflowAvailable = input.expenses !== null && input.bills !== null && input.templates !== null
  const issueIn = (message: string) => { inflowAvailable = false; issues.push(message) }
  const issueOut = (message: string) => { outflowAvailable = false; issues.push(message) }
  const validMoney = (value: unknown): value is number => isExactPlanningCent(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100))
  const seenExpenses = new Set<string>()
  const seenPayments = new Set<string>()
  const duplicateExpenses = new Set<string>()
  const duplicatePayments = new Set<string>()
  const linkedBills = new Set<string>()
  const duplicateBills = new Set<string>()
  const billById = new Map<string, LuxorBill>()
  const duplicateBillRecords = new Set<string>()
  for (const bill of input.bills || []) {
    if (!bill.id || billById.has(bill.id)) { if (bill.id) duplicateBillRecords.add(bill.id); issueOut('A bill identity needs review.'); continue }
    billById.set(bill.id, bill)
  }
  const validDate = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const day = new Date(`${value}T00:00:00.000Z`)
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value
  }
  for (const expense of input.expenses || []) {
    if (expense.id && seenExpenses.has(expense.id)) duplicateExpenses.add(expense.id)
    if (expense.id) seenExpenses.add(expense.id)
    for (const payment of expense.payments || []) {
      if (payment.id && seenPayments.has(payment.id)) duplicatePayments.add(payment.id)
      if (payment.id) seenPayments.add(payment.id)
    }
    if (!expense.source_bill_id) continue
    if (linkedBills.has(expense.source_bill_id)) duplicateBills.add(expense.source_bill_id)
    linkedBills.add(expense.source_bill_id)
  }
  if (!input.revenue || input.revenue.expectedByMonth === null) issueIn('Collection schedules need reconciliation.')
  if (!input.expenses || !input.bills || !input.templates) issueOut('Expense or bill sources are unavailable.')
  if (input.templates?.some((template) => template.is_active)) issueOut('Future recurring expenses may not all be generated.')
  for (const row of input.revenue?.expectedByMonth !== null ? input.revenue?.reportingRows.scheduleRows || [] : []) {
    if (!row.scheduleReconciled || !validMoney(row.remaining)) { issueIn('A collection schedule needs review.'); continue }
    if (row.remaining === 0) continue
    if (!validDate(row.dueDate) || row.dueDate < input.today) { issueIn('An overdue or undated collection has no forecast date.'); continue }
    flows.push({ source: 'installment', id: row.installment.id, kind: 'inflow', date: row.dueDate, amount: row.remaining, href: `/portal/finances/schedules?bookingId=${encodeURIComponent(row.bookingId)}` })
  }
  for (const expense of input.expenses || []) {
    if (!expense.id || duplicateExpenses.has(expense.id)) { issueOut('An expense identity needs review.'); continue }
    if (expense.source_bill_id && duplicateBills.has(expense.source_bill_id)) { issueOut('Multiple expenses link to one bill.'); continue }
    if (!Array.isArray(expense.payments) || hasUnresolvedLegacyExpenseBalance(expense, expense.payments.length)) { issueOut('An older expense balance needs review.'); continue }
    if (expense.source_bill_id) {
      const bill = billById.get(expense.source_bill_id)
      if (!bill || duplicateBillRecords.has(expense.source_bill_id) || !input.bills || bill.due_date !== expense.due_date || !bill.due_date || getBillBalance(bill, [{ ...expense, amount: expense.amount ?? 0 }]).remaining === null) { issueOut('A linked bill and expense need reconciliation.'); continue }
    }
    let historyCents = 0
    let historyValid = true
    for (const payment of expense.payments || []) {
      if (!payment.id || duplicatePayments.has(payment.id) || !validMoney(payment.amount) || payment.amount === 0 || !validDate(payment.payment_date) || payment.payment_date > input.today || !['payment', 'refund', 'reversal'].includes(payment.transaction_type)) { historyValid = false; issueOut('An expense payment needs review.'); continue }
      historyCents += Math.round(payment.amount * 100) * (payment.transaction_type === 'payment' ? 1 : -1)
    }
    if (!historyValid || !Number.isSafeInteger(historyCents) || !validMoney(expense.paid_amount) || historyCents !== Math.round(expense.paid_amount * 100)) { issueOut('An expense payment history needs reconciliation.'); continue }
    if (expense.status === 'cancelled') {
      if (expense.source_bill_id) issueOut('A cancelled expense still links to a bill.')
      continue
    }
    if (!expense.amount_known || !validMoney(expense.remaining_balance)) { issueOut('An expense has an unknown remaining amount.'); continue }
    if (!validMoney(expense.amount) || !validMoney(expense.paid_amount) || Math.round(expense.amount * 100) - Math.round(expense.paid_amount * 100) !== Math.round(expense.remaining_balance * 100)) { issueOut('An expense balance needs reconciliation.'); continue }
    if (expense.remaining_balance === 0) continue
    if (!validDate(expense.due_date) || expense.due_date < input.today) { issueOut('An overdue or undated expense has no forecast date.'); continue }
    flows.push({ source: 'expense', id: expense.id, kind: 'outflow', date: expense.due_date, amount: expense.remaining_balance, href: `/portal/finances/expenses/${encodeURIComponent(expense.id)}` })
  }
  for (const bill of input.bills || []) {
    if (bill.duplicate_of_bill_id || bill.extraction_status === 'duplicate' || linkedBills.has(bill.id)) continue
    issueOut('An unlinked bill needs review before forecasting.')
  }
  return { flows, inflowAvailable, outflowAvailable, sourceComplete: inflowAvailable && outflowAvailable, issues: [...new Set(issues)] }
}
