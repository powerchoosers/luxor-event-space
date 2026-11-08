import type { LuxorExpenseRecord, LuxorExpenseReceipt } from '@/lib/luxorExpenseTypes'
import type { LuxorPayment, LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'
import { getLuxorPaymentCalendarDateKey } from '@/lib/luxorFinanceReporting'
import { expenseAmountState } from '@/lib/luxorExpenseAmount'

type Cell = string | number | boolean | null | undefined

// Prefix spreadsheet formulas even when preceded by whitespace or control characters.
function csvCell(value: Cell) {
  let text = value == null ? '' : String(value)
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

function csv(rows: Cell[][]) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export type AccountantExportPeriod = { from: string; to: string } | null

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Both bounds are inclusive. A missing date never silently enters a selected period. */
export function accountantExportPeriod(from: string | null, to: string | null): AccountantExportPeriod {
  if (from === null && to === null) return null
  if (!from || !to || !validDateKey(from) || !validDateKey(to) || from > to) throw new Error('Choose a valid start and end date.')
  return { from, to }
}

export function accountantExportIncludesDate(date: string | null | undefined, period: AccountantExportPeriod) {
  if (!period) return true
  return Boolean(date && validDateKey(date) && date >= period.from && date <= period.to)
}

export function buildLuxorExpenseExport(expenses: LuxorExpenseRecord[], receipts: LuxorExpenseReceipt[], period: AccountantExportPeriod = null) {
  const receiptIds = new Map<string, string[]>()
  for (const receipt of receipts) if (receipt.expense_id) {
    receiptIds.set(receipt.expense_id, [...(receiptIds.get(receipt.expense_id) || []), receipt.id])
  }
  return csv([
    ['expense_id', 'created_at', 'updated_at', 'expense_type', 'booking_id', 'source_bill_id', 'receipt_ids', 'vendor', 'description', 'category', 'incurred_on', 'due_date', 'status', 'amount_known', 'amount_usd', 'legacy_paid_amount', 'legacy_paid_status_without_payment_history', 'billing_period_start', 'billing_period_end', 'recurring_template_id', 'notes'],
    ...expenses.filter((e) => accountantExportIncludesDate(e.incurred_on, period)).map((e): Cell[] => {
      const amount = expenseAmountState(e.amount, e.metadata)
      const amountKnown = e.amount_known === true && amount.known
      return [e.id, e.created_at, e.updated_at, e.expense_type, e.booking_id, e.source_bill_id,
        (receiptIds.get(e.id) || []).join('; '), e.vendor_name, e.description, e.category, e.incurred_on, e.due_date,
        e.status, amountKnown, amountKnown ? amount.amount : null,
        amountKnown && (typeof e.metadata?.legacy_paid_amount === 'number' || typeof e.metadata?.legacy_paid_amount === 'string') ? e.metadata.legacy_paid_amount : null,
        e.status === 'paid' && e.payments.length === 0, e.billing_period_start, e.billing_period_end, e.recurring_template_id, e.notes]
    }),
  ])
}

export function buildLuxorExpensePaymentExport(expenses: LuxorExpenseRecord[], period: AccountantExportPeriod = null) {
  return csv([
    ['payment_id', 'expense_id', 'booking_id', 'source_bill_id', 'transaction_type', 'payment_date', 'amount_usd', 'payment_method', 'reference_number', 'notes', 'created_at'],
    ...expenses.flatMap((e) => e.payments.filter((p) => accountantExportIncludesDate(p.payment_date, period)).map((p): Cell[] => [p.id, e.id, e.booking_id, e.source_bill_id,
      p.transaction_type, p.payment_date, p.amount, p.payment_method, p.reference_number, p.notes, p.created_at])),
  ])
}

/** Source records, not revenue recognition or net cash calculations. */
export function buildLuxorClientPaymentExport(payments: LuxorPayment[], period: AccountantExportPeriod = null) {
  return csv([
    ['payment_id', 'booking_id', 'invoice_id', 'inquiry_id', 'status', 'amount', 'payment_method', 'received_date', 'paid_at', 'processor', 'processor_reference', 'payment_kind_saved', 'notes', 'created_at', 'updated_at'],
    ...payments.filter((p) => accountantExportIncludesDate(getLuxorPaymentCalendarDateKey(p), period)).map((p): Cell[] => [p.id, p.booking_id, p.invoice_id, p.inquiry_id, p.status, p.amount, p.payment_method, p.received_date, p.paid_at, p.processor, p.processor_reference, typeof p.metadata?.payment_kind === 'string' ? p.metadata.payment_kind : null, p.notes, p.created_at, p.updated_at]),
  ])
}

export function buildLuxorClientRefundExport(refunds: LuxorPaymentRefundView[], period: AccountantExportPeriod = null) {
  return csv([
    ['refund_id', 'source_payment_id', 'booking_id', 'invoice_id', 'inquiry_id', 'refund_kind', 'status', 'amount', 'currency', 'processor', 'processor_payment_intent_id', 'processor_refund_id', 'requested_at', 'completed_at', 'livemode'],
    ...refunds.filter((r) => accountantExportIncludesDate(getLuxorPaymentCalendarDateKey({ received_date: null, paid_at: r.requested_at }), period)).map((r): Cell[] => [r.id, r.source_payment_id, r.booking_id, r.invoice_id, r.inquiry_id, r.refund_kind, r.status, r.amount, r.currency, r.processor, r.processor_payment_intent_id, r.processor_refund_id, r.requested_at, r.completed_at, r.livemode]),
  ])
}
