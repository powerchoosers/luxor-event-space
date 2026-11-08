import type { LuxorExpenseRecord } from './luxorExpenseTypes'
import type { LuxorBill } from './luxorInquiryTypes'
import type { getLuxorFinanceOverview } from './luxorFinanceReporting'

/** A target is an owner-entered monthly spending plan, not an obligation. */
export type LuxorMonthlyBudget = { month: string; category: string; amount: number }

export type LuxorBudgetSummaryStatus = 'under' | 'on' | 'over' | 'incomplete'
export type LuxorBudgetSummary = {
  revenueTarget: number | null
  revenueActual: number | null
  revenueVariance: number | null
  expenseTargetTotal: number | null
  expenseActual: number | null
  expenseVariance: number | null
  operationalMargin: number | null
  status: LuxorBudgetSummaryStatus
  statusMessage: string
}
export type LuxorBudgetReportIssue = { message: string; href: string }
export type LuxorBudgetReportLine = {
  id: string
  label: string
  category: string
  date: string
  amount: number
  kind: 'payment' | 'refund' | 'reversal' | 'unpaid'
  href: string
}

const expenseHref = (id: string) => `/portal/finances/expenses/${encodeURIComponent(id)}`
const billsHref = '/portal/operations?tab=bills'
const round = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100
const validMoney = (amount: unknown): amount is number => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0
function validDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** An intentionally partial scenario based only on future recorded flows. */
export function getLuxorMonthEndScenario(opening: number | null, collections: number | null, expenses: number | null, reserve: number | null) {
  if (opening === null || !Number.isFinite(opening) || collections === null || !Number.isFinite(collections) || expenses === null || !Number.isFinite(expenses)) return { ending: null, belowZero: false, belowReserve: false }
  const ending = round(opening + collections - expenses)
  return { ending, belowZero: ending < 0, belowReserve: reserve !== null && Number.isFinite(reserve) && reserve >= 0 && ending < reserve }
}

/** Carry uncertainty forward; never substitute zero for unavailable flows. */
const compareTolerance = 0.005

/** Month-level plan vs actual; null amounts stay unknown. */
export function buildLuxorBudgetSummary(input: {
  revenueTarget: number | null
  revenueActual: number | null
  expenseTargetTotal: number | null
  expenseActual: number | null
}): LuxorBudgetSummary {
  const revenueVariance =
    input.revenueTarget !== null && input.revenueActual !== null
      ? round(input.revenueActual - input.revenueTarget)
      : null
  const expenseVariance =
    input.expenseTargetTotal !== null && input.expenseActual !== null
      ? round(input.expenseActual - input.expenseTargetTotal)
      : null
  const operationalMargin =
    input.revenueActual !== null && input.expenseActual !== null
      ? round(input.revenueActual - input.expenseActual)
      : null

  const collectionComparable = input.revenueTarget !== null && input.revenueActual !== null
  const spendingComparable = input.expenseTargetTotal !== null && input.expenseActual !== null
  if (!collectionComparable && !spendingComparable) {
    return {
      ...input,
      revenueVariance,
      expenseVariance,
      operationalMargin,
      status: 'incomplete',
      statusMessage: 'Set a collection target or expense category targets to compare this month to your plan.',
    }
  }

  const collectionOver =
    collectionComparable && revenueVariance! > compareTolerance
  const collectionUnder =
    collectionComparable && revenueVariance! < -compareTolerance
  const spendingOver =
    spendingComparable && expenseVariance! > compareTolerance
  const spendingUnder =
    spendingComparable && expenseVariance! < -compareTolerance

  let status: LuxorBudgetSummaryStatus = 'on'
  if ((!collectionComparable && !spendingComparable) || input.revenueActual === null || input.expenseActual === null) {
    status = 'incomplete'
  } else if (collectionUnder || spendingOver) {
    status = 'over'
  } else if (collectionOver && !spendingOver) {
    status = 'under'
  } else if (Math.abs(revenueVariance ?? 0) <= compareTolerance && Math.abs(expenseVariance ?? 0) <= compareTolerance) {
    status = 'on'
  } else if (collectionOver || spendingUnder) {
    status = 'under'
  }

  let statusMessage = 'This month matches your plan on the measures you set.'
  if (status === 'incomplete') {
    statusMessage = 'Some totals need review or targets before this month can be compared.'
  } else if (status === 'over') {
    if (collectionUnder && spendingOver) statusMessage = 'Collections are below target and paid expenses are above your spending plan.'
    else if (collectionUnder) statusMessage = 'Collections are below your monthly target.'
    else if (spendingOver) statusMessage = 'Paid expenses are above your spending plan for this month.'
  } else if (status === 'under') {
    statusMessage = 'Collections and spending are favorable versus the targets you set.'
  }

  return {
    revenueTarget: input.revenueTarget,
    revenueActual: input.revenueActual,
    revenueVariance,
    expenseTargetTotal: input.expenseTargetTotal,
    expenseActual: input.expenseActual,
    expenseVariance,
    operationalMargin,
    status,
    statusMessage,
  }
}

export function getLuxorForecastScenario(opening: number | null, rows: Array<{ month: string; collections: number | null; expenses: number | null }>, reserve: number | null) {
  let balance = opening
  return rows.map((row) => {
    const result = getLuxorMonthEndScenario(balance, row.collections, row.expenses, reserve)
    balance = result.ending
    return { ...row, ...result }
  })
}

/**
 * Read-only reporting contract. Pass complete source snapshots; null means the
 * source could not be loaded, not an empty ledger. The caller must verify and
 * exclude test records (including test-linked expenses) before passing them.
 * No amounts are inferred
 * from a paid status or recurring template. Revenue retains the existing
 * finance overview's reconciliation gates and excludes security deposits.
 */
export function getLuxorBudgetReport(input: {
  month: string
  today: string
  budgets: LuxorMonthlyBudget[] | null
  revenueTarget?: number | null
  availableCategories?: string[]
  expenses: LuxorExpenseRecord[] | null
  bills: LuxorBill[] | null
  revenue: ReturnType<typeof getLuxorFinanceOverview> | null
}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month) || !validDate(`${input.month}-01`) || !validDate(input.today)) {
    throw new Error('A valid report month and calendar date are required.')
  }
  const issues: LuxorBudgetReportIssue[] = []
  const lines: LuxorBudgetReportLine[] = []
  let expenseComplete = input.expenses !== null
  let forecastComplete = input.expenses !== null && input.bills !== null
  if (!input.expenses) issues.push({ message: 'Expense records could not be loaded.', href: '/portal/finances/expenses' })
  if (!input.bills) issues.push({ message: 'Bills could not be loaded.', href: billsHref })
  const seenExpenses = new Set<string>()
  const seenPayments = new Set<string>()
  const linkedBillIds = new Set<string>()
  for (const expense of input.expenses || []) {
    const href = expenseHref(expense.id)
    if (!expense.id || seenExpenses.has(expense.id)) {
      expenseComplete = false; forecastComplete = false
      issues.push({ message: 'An expense has a missing or duplicate identity.', href: '/portal/finances/expenses' })
      continue
    }
    seenExpenses.add(expense.id)
    if (expense.source_bill_id) {
      if (linkedBillIds.has(expense.source_bill_id)) {
        forecastComplete = false
        issues.push({ message: 'More than one expense links to the same bill.', href })
      }
      linkedBillIds.add(expense.source_bill_id)
    }
    const label = expense.description || expense.vendor_name || 'Expense'
    for (const payment of expense.payments || []) {
      if (!payment.id || seenPayments.has(payment.id) || !validMoney(payment.amount) || payment.amount === 0 || !validDate(payment.payment_date) || !['payment', 'refund', 'reversal'].includes(payment.transaction_type)) {
        expenseComplete = false; forecastComplete = false
        issues.push({ message: `${label} has a payment that needs review.`, href })
        continue
      }
      seenPayments.add(payment.id)
      if (payment.payment_date.slice(0, 7) === input.month) lines.push({ id: payment.id, label, category: expense.category || 'Unclassified', date: payment.payment_date, amount: payment.transaction_type === 'payment' ? payment.amount : -payment.amount, kind: payment.transaction_type, href })
    }
    // Legacy status-only payments have no transaction date and cannot be
    // placed in a period. Do not manufacture a payment from paid_amount.
    const historyNet = round((expense.payments || []).reduce((sum, p) => sum + (validMoney(p.amount) ? (p.transaction_type === 'payment' ? p.amount : -p.amount) : 0), 0))
    if (!validMoney(expense.paid_amount) || Math.abs(historyNet - expense.paid_amount) > 0.005) {
      expenseComplete = false; forecastComplete = false
      issues.push({ message: `${label} has payment history that needs reconciliation.`, href })
    }
    if (expense.status === 'cancelled') {
      if (expense.source_bill_id) {
        forecastComplete = false
        issues.push({ message: `${label} is cancelled but still linked to a bill; review the bill.`, href })
      }
      continue
    }
    if (!expense.amount_known || !validMoney(expense.remaining_balance)) {
      forecastComplete = false
      issues.push({ message: `${label} has an unknown remaining amount.`, href })
    } else if (expense.remaining_balance > 0) {
      if (!validDate(expense.due_date)) {
        forecastComplete = false
        issues.push({ message: `${label} has no valid due date.`, href })
      } else if (expense.due_date.slice(0, 7) === input.month) {
        lines.push({ id: expense.id, label, category: expense.category || 'Unclassified', date: expense.due_date, amount: expense.remaining_balance, kind: 'unpaid', href })
      }
    }
  }
  for (const bill of input.bills || []) {
    if (bill.duplicate_of_bill_id || bill.extraction_status === 'duplicate' || linkedBillIds.has(bill.id)) continue
    if (bill.status !== 'paid') {
      // A bill alone may be unreviewed or overlap an unlinked expense. Keep it
      // visible for review rather than inventing a payable or counting twice.
      forecastComplete = false
      issues.push({ message: `${bill.provider || bill.service || 'A bill'} is not linked to an expense; review its amount and due date.`, href: billsHref })
    } else {
      expenseComplete = false
      issues.push({ message: `${bill.provider || bill.service || 'A paid bill'} has no linked expense payment history.`, href: billsHref })
    }
  }
  const budgets = input.budgets?.filter((row) => row.month === input.month) ?? null
  const budgetKeys = new Set<string>()
  let budgetsValid = budgets !== null
  for (const row of budgets || []) {
    const key = row.category.trim().toLocaleLowerCase()
    if (!key || budgetKeys.has(key) || !validMoney(row.amount)) budgetsValid = false
    budgetKeys.add(key)
  }
  if (!budgetsValid) issues.push({ message: 'Budget targets are unavailable or need review.', href: '/portal/finances/expenses' })
  const actualLines = lines.filter((line) => line.kind !== 'unpaid')
  const unpaidLines = lines.filter((line) => line.kind === 'unpaid')
  const expenseActual = expenseComplete ? round(actualLines.reduce((sum, line) => sum + line.amount, 0)) : null
  const upcoming = forecastComplete ? round(unpaidLines.filter((line) => line.date >= input.today).reduce((sum, line) => sum + line.amount, 0)) : null
  const overdue = forecastComplete ? round(unpaidLines.filter((line) => line.date < input.today).reduce((sum, line) => sum + line.amount, 0)) : null
  const incomeActual = input.revenue?.actualByMonth ? input.revenue.actualByMonth[input.month] || 0 : null
  const incomeExpected = input.revenue?.expectedByMonth ? input.revenue.expectedByMonth[input.month] || 0 : null
  if (!input.revenue || incomeActual === null || incomeExpected === null) issues.push({ message: 'Collections or payment schedules need review before the forecast is available.', href: '/portal/finances/revenue' })
  const categoryNames = new Map<string, string>()
  for (const category of [...(input.availableCategories || []), ...(budgets || []).map((row) => row.category), ...lines.map((line) => line.category)]) {
    const name = category.trim() || 'Unclassified'
    if (!categoryNames.has(name.toLocaleLowerCase())) categoryNames.set(name.toLocaleLowerCase(), name)
  }
  const categories = [...categoryNames.values()].sort((a, b) => a.localeCompare(b))
  const expenseTargetTotal =
    budgetsValid && budgets && budgets.length > 0
      ? round(budgets.reduce((sum, row) => sum + row.amount, 0))
      : null
  const revenueTarget = input.revenueTarget ?? null
  const summary = buildLuxorBudgetSummary({
    revenueTarget,
    revenueActual: incomeActual,
    expenseTargetTotal,
    expenseActual,
  })
  return {
    month: input.month, today: input.today, expenseActual, upcoming, overdue, incomeActual, incomeExpected, summary,
    // This is a change in recorded flows, not a bank balance. Overdue items are
    // shown separately because their eventual payment date is unknown.
    projectedFlow: expenseActual === null || upcoming === null || incomeActual === null || incomeExpected === null ? null : round(incomeActual + incomeExpected - expenseActual - upcoming),
    categories: categories.map((category) => {
      const target = budgetsValid ? budgets?.find((row) => row.category.toLocaleLowerCase() === category.toLocaleLowerCase())?.amount ?? null : null
      const actual = expenseComplete ? round(actualLines.filter((line) => line.category.toLocaleLowerCase() === category.toLocaleLowerCase()).reduce((sum, line) => sum + line.amount, 0)) : null
      const canEdit = input.availableCategories === undefined || input.availableCategories.some((name) => name.trim().toLocaleLowerCase() === category.toLocaleLowerCase())
      return { category, target, actual, remaining: target === null || actual === null ? null : round(target - actual), canEdit }
    }),
    lines, issues,
  }
}
