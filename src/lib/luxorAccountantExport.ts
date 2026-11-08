import type { LuxorExpenseRecord, LuxorExpenseReceipt } from '@/lib/luxorExpenseTypes'

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

export function buildLuxorExpenseExport(expenses: LuxorExpenseRecord[], receipts: LuxorExpenseReceipt[]) {
  const receiptIds = new Map<string, string[]>()
  for (const receipt of receipts) if (receipt.expense_id) {
    receiptIds.set(receipt.expense_id, [...(receiptIds.get(receipt.expense_id) || []), receipt.id])
  }
  return csv([
    ['expense_id', 'created_at', 'updated_at', 'expense_type', 'booking_id', 'source_bill_id', 'receipt_ids', 'vendor', 'description', 'category', 'incurred_on', 'due_date', 'status', 'amount_known', 'amount_usd', 'legacy_paid_amount', 'legacy_paid_status_without_payment_history', 'billing_period_start', 'billing_period_end', 'recurring_template_id', 'notes'],
    ...expenses.map((e): Cell[] => [e.id, e.created_at, e.updated_at, e.expense_type, e.booking_id, e.source_bill_id,
      (receiptIds.get(e.id) || []).join('; '), e.vendor_name, e.description, e.category, e.incurred_on, e.due_date,
      e.status, e.amount_known, e.amount_known ? e.amount : null,
      typeof e.metadata?.legacy_paid_amount === 'number' || typeof e.metadata?.legacy_paid_amount === 'string' ? e.metadata.legacy_paid_amount : null,
      e.status === 'paid' && e.payments.length === 0, e.billing_period_start, e.billing_period_end, e.recurring_template_id, e.notes]),
  ])
}

export function buildLuxorExpensePaymentExport(expenses: LuxorExpenseRecord[]) {
  return csv([
    ['payment_id', 'expense_id', 'booking_id', 'source_bill_id', 'transaction_type', 'payment_date', 'amount_usd', 'payment_method', 'reference_number', 'notes', 'created_at'],
    ...expenses.flatMap((e) => e.payments.map((p): Cell[] => [p.id, e.id, e.booking_id, e.source_bill_id,
      p.transaction_type, p.payment_date, p.amount, p.payment_method, p.reference_number, p.notes, p.created_at])),
  ])
}
