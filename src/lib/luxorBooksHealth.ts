import type { LuxorBill } from '@/lib/luxorInquiryTypes'
import { getBillBalance, type BillExpense } from '@/lib/luxorBillBalances'
import { getLuxorFinanceOverview, type LuxorFinanceAllocationRow } from '@/lib/luxorFinanceReporting'
import { getLuxorRevenueCollectionsModel, type LuxorRevenueReceivableRow } from '@/lib/luxorRevenueCollectionsModel'
import { chicagoCalendarDate } from '@/lib/luxorPaymentDashboardModel'
import type { LuxorBooking, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment, LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'

export type BooksHealthIssue = {
  id: string
  severity: 'attention' | 'review' | 'blocked'
  title: string
  detail: string
  href: string
}

export type BooksAgingBucket = {
  current: number
  d1_30: number
  d31_60: number
  d61_90: number
  d90_plus: number
  rowCount: number
  totalKnown: number | null
}

export type LuxorBooksHealth = {
  status: 'clean' | 'attention' | 'blocked'
  statusSentence: string
  issueCount: number
  issues: BooksHealthIssue[]
  kpis: {
    outstandingReceivable: number | null
    knownPayablesOutstanding: number | null
    openReceivableCount: number | null
    openPayableCount: number | null
  }
  receivableAging: BooksAgingBucket | null
  payableAging: BooksAgingBucket | null
  exports: {
    clientExportsVerified: boolean
    expenseExportsVerified: boolean
  }
  cashBasisNote: string
}

const billsHref = '/portal/finances/bills'
const expensesHref = '/portal/finances/expenses'

function validMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validDate(value: string | null | undefined) {
  const day = value?.slice(0, 10) || ''
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

function expenseHref(expenseId: string) {
  return `/portal/finances/expenses?expense=${encodeURIComponent(expenseId)}`
}

function daysBetween(due: string, today: string) {
  const dueMs = Date.UTC(Number(due.slice(0, 4)), Number(due.slice(5, 7)) - 1, Number(due.slice(8, 10)))
  const todayMs = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)))
  return Math.floor((todayMs - dueMs) / 86_400_000)
}

function pushIssue(issues: BooksHealthIssue[], seen: Set<string>, row: Omit<BooksHealthIssue, 'id'>) {
  const key = `${row.href}::${row.title}`
  if (seen.has(key)) return
  seen.add(key)
  issues.push({ id: key, ...row })
}

function hrefForOverviewIssue(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('payment') && (lower.includes('classif') || lower.includes('allocation') || lower.includes('unallocated'))) return '/portal/finances?view=payments'
  if (lower.includes('refund')) return '/portal/finances?view=payments'
  if (lower.includes('schedule') || lower.includes('installment')) return '/portal/finances?view=receivables'
  if (lower.includes('invoice') || lower.includes('contract')) return '/portal/finances/receivables'
  return '/portal/finances'
}

export type BooksHealthExpense = Omit<BillExpense, 'amount'> & {
  amount: number | string | null
  description?: string | null
  vendor_name?: string | null
  category?: string | null
  amount_known?: boolean
}

function collectExpenseAndBillIssues(input: {
  expenses: BooksHealthExpense[] | null
  bills: LuxorBill[] | null
}): BooksHealthIssue[] {
  const issues: BooksHealthIssue[] = []
  const seen = new Set<string>()
  if (!input.expenses) {
    pushIssue(issues, seen, { severity: 'blocked', title: 'Expenses unavailable', detail: 'Expense records could not be loaded.', href: expensesHref })
    return issues
  }
  if (!input.bills) {
    pushIssue(issues, seen, { severity: 'blocked', title: 'Bills unavailable', detail: 'Bill records could not be loaded.', href: billsHref })
  }
  const seenExpenses = new Set<string>()
  const seenPayments = new Set<string>()
  const linkedBillIds = new Set<string>()
  for (const expense of input.expenses) {
    const href = expenseHref(expense.id)
    const label = expense.description || expense.vendor_name || 'Expense'
    if (!expense.id || seenExpenses.has(expense.id)) {
      pushIssue(issues, seen, { severity: 'review', title: 'Expense identity', detail: 'An expense has a missing or duplicate identity.', href: expensesHref })
      continue
    }
    seenExpenses.add(expense.id)
    if (expense.source_bill_id) {
      if (linkedBillIds.has(expense.source_bill_id)) {
        pushIssue(issues, seen, { severity: 'review', title: 'Duplicate bill link', detail: `${label} shares a bill link with another expense.`, href })
      }
      linkedBillIds.add(expense.source_bill_id)
    }
    for (const payment of expense.payments || []) {
      if (!payment.id || seenPayments.has(payment.id) || !validMoney(payment.amount) || payment.amount === 0 || !validDate(payment.payment_date) || !['payment', 'refund', 'reversal'].includes(payment.transaction_type)) {
        pushIssue(issues, seen, { severity: 'review', title: 'Payment needs review', detail: `${label} has a payment line that needs review.`, href })
        continue
      }
      seenPayments.add(payment.id)
    }
    const historyNet = Math.round((expense.payments || []).reduce((sum, payment) => sum + (validMoney(payment.amount) ? (payment.transaction_type === 'payment' ? payment.amount : -payment.amount) : 0), 0) * 100) / 100
    if (!validMoney(expense.paid_amount) || Math.abs(historyNet - expense.paid_amount) > 0.005) {
      pushIssue(issues, seen, { severity: 'review', title: 'Expense reconciliation', detail: `${label} has payment history that needs reconciliation.`, href })
    }
    if (expense.status !== 'cancelled' && expense.amount_known && validMoney(expense.remaining_balance) && expense.remaining_balance > 0 && !validDate(expense.due_date)) {
      pushIssue(issues, seen, { severity: 'attention', title: 'Missing due date', detail: `${label} has a balance without a valid due date.`, href })
    }
  }
  for (const bill of input.bills || []) {
    if (bill.duplicate_of_bill_id || bill.extraction_status === 'duplicate' || linkedBillIds.has(bill.id)) continue
    const label = bill.provider || bill.service || 'Bill'
    if (bill.status !== 'paid') {
      pushIssue(issues, seen, { severity: 'attention', title: 'Bill needs expense link', detail: `${label} is not linked to an expense with verified payments.`, href: billsHref })
    } else {
      pushIssue(issues, seen, { severity: 'review', title: 'Paid bill history', detail: `${label} is marked paid but has no linked expense payment history.`, href: billsHref })
    }
  }
  return issues
}

export function buildReceivableAging(receivables: LuxorRevenueReceivableRow[], today: string): BooksAgingBucket | null {
  const bucket: BooksAgingBucket = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, rowCount: 0, totalKnown: 0 }
  let hasKnown = false
  for (const row of receivables) {
    if (row.remainingBalance === null || row.remainingBalance <= 0.005 || row.status === 'needs_review') continue
    const amount = row.remainingBalance
    bucket.rowCount += 1
    hasKnown = true
    bucket.totalKnown = (bucket.totalKnown ?? 0) + amount
    const due = row.nextPaymentDue && validDate(row.nextPaymentDue) ? row.nextPaymentDue : null
    if (!due || due >= today) {
      bucket.current += amount
      continue
    }
    const days = daysBetween(due, today)
    if (days <= 30) bucket.d1_30 += amount
    else if (days <= 60) bucket.d31_60 += amount
    else if (days <= 90) bucket.d61_90 += amount
    else bucket.d90_plus += amount
  }
  return hasKnown ? bucket : null
}

export function buildPayableAging(bills: LuxorBill[], expenses: BooksHealthExpense[] | null, today: string): BooksAgingBucket | null {
  if (!expenses) return null
  const bucket: BooksAgingBucket = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, rowCount: 0, totalKnown: 0 }
  let hasKnown = false
  for (const bill of bills) {
    if (bill.archived_at || bill.duplicate_of_bill_id || bill.extraction_status === 'duplicate') continue
    const balance = getBillBalance(bill, expenses as BillExpense[])
    if (balance.remaining === null || balance.remaining <= 0.005) continue
    const amount = balance.remaining
    bucket.rowCount += 1
    hasKnown = true
    bucket.totalKnown = (bucket.totalKnown ?? 0) + amount
    const due = validDate(bill.due_date)
    if (!due || due >= today) {
      bucket.current += amount
      continue
    }
    const days = daysBetween(due, today)
    if (days <= 30) bucket.d1_30 += amount
    else if (days <= 60) bucket.d31_60 += amount
    else if (days <= 90) bucket.d61_90 += amount
    else bucket.d90_plus += amount
  }
  return hasKnown ? bucket : null
}

export type BuildLuxorBooksHealthInput = {
  bookings: LuxorBooking[]
  invoices: LuxorInvoice[]
  payments: LuxorPayment[]
  installments: LuxorPaymentInstallment[]
  refunds: LuxorPaymentRefundView[]
  allocations: LuxorFinanceAllocationRow[] | null
  expenses: BooksHealthExpense[] | null
  bills: LuxorBill[] | null
  testInquiryIds: ReadonlySet<string>
  testBookingIds: ReadonlySet<string>
  testInvoiceIds: ReadonlySet<string>
  now?: Date
  expenseExportsVerified?: boolean
  clientExportsVerified?: boolean
}

export function buildLuxorBooksHealth(input: BuildLuxorBooksHealthInput): LuxorBooksHealth {
  const now = input.now || new Date()
  const today = chicagoCalendarDate(now)
  const overview = getLuxorFinanceOverview({
    bookings: input.bookings,
    invoices: input.invoices,
    payments: input.payments,
    installments: input.installments,
    refunds: input.refunds,
    allocations: input.allocations,
    testInquiryIds: input.testInquiryIds,
    testBookingIds: input.testBookingIds,
    testInvoiceIds: input.testInvoiceIds,
    now,
  })
  const revenueModel = getLuxorRevenueCollectionsModel({
    bookings: input.bookings,
    invoices: input.invoices,
    payments: input.payments,
    installments: input.installments,
    refunds: input.refunds,
    allocations: input.allocations,
    testInquiryIds: input.testInquiryIds,
    testBookingIds: input.testBookingIds,
    testInvoiceIds: input.testInvoiceIds,
    now,
  })

  const issues: BooksHealthIssue[] = []
  const seen = new Set<string>()
  for (const message of overview.issues) {
    pushIssue(issues, seen, {
      severity: message.toLowerCase().includes('identity') ? 'blocked' : 'review',
      title: 'Revenue or payment review',
      detail: message,
      href: hrefForOverviewIssue(message),
    })
  }
  if (overview.unallocatedPayments > 0) {
    pushIssue(issues, seen, {
      severity: 'attention',
      title: 'Unclassified client payments',
      detail: `${overview.unallocatedPayments.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in recorded payments need classification before they count toward collections.`,
      href: '/portal/finances?view=payments',
    })
  }
  for (const row of overview.allocationExceptions.slice(0, 20)) {
    pushIssue(issues, seen, {
      severity: 'review',
      title: 'Installment allocation',
      detail: row.reason || 'A payment allocation needs review.',
      href: '/portal/finances?view=payments',
    })
  }
  for (const row of collectExpenseAndBillIssues({ expenses: input.expenses, bills: input.bills })) {
    pushIssue(issues, seen, row)
  }

  const capped = issues.slice(0, 8)
  const issueCount = issues.length

  let knownPayablesOutstanding: number | null = null
  let openPayableCount = 0
  if (input.bills && input.expenses) {
    let total = 0
    let complete = true
    for (const bill of input.bills) {
      if (bill.archived_at || bill.duplicate_of_bill_id || bill.extraction_status === 'duplicate') continue
      const balance = getBillBalance(bill, input.expenses as BillExpense[])
      if (balance.remaining === null) {
        if (bill.status !== 'paid') complete = false
        continue
      }
      if (balance.remaining > 0.005) {
        openPayableCount += 1
        total += balance.remaining
      }
    }
    knownPayablesOutstanding = complete || total > 0 ? Math.round(total * 100) / 100 : null
  }

  const receivableAging = buildReceivableAging(revenueModel.receivables, today)
  const payableAging = input.bills && input.expenses ? buildPayableAging(input.bills, input.expenses, today) : null

  const openReceivableCount = revenueModel.receivables.filter((row) => row.remainingBalance !== null && row.remainingBalance > 0.005 && row.status !== 'needs_review').length

  const status: LuxorBooksHealth['status'] = issues.some((row) => row.severity === 'blocked')
    ? 'blocked'
    : issueCount > 0
      ? 'attention'
      : 'clean'

  const statusSentence = status === 'clean'
    ? 'Recorded client, vendor, and expense activity looks consistent. Download exports for your accountant when you are ready.'
    : status === 'blocked'
      ? `${issueCount} ${issueCount === 1 ? 'item needs' : 'items need'} review before some totals can be trusted.`
      : `${issueCount} ${issueCount === 1 ? 'item needs' : 'items need'} review before totals are fully trusted.`

  return {
    status,
    statusSentence,
    issueCount,
    issues: capped,
    kpis: {
      outstandingReceivable: revenueModel.kpis.outstandingBalance,
      knownPayablesOutstanding,
      openReceivableCount: revenueModel.availability.outstanding ? openReceivableCount : null,
      openPayableCount: knownPayablesOutstanding !== null ? openPayableCount : null,
    },
    receivableAging,
    payableAging,
    exports: {
      clientExportsVerified: input.clientExportsVerified !== false,
      expenseExportsVerified: input.expenseExportsVerified === true,
    },
    cashBasisNote: 'Luxor tracks cash-basis activity from saved client payments and expense payment lines. These views are not a general ledger, verified bank balance, or tax filing.',
  }
}
