import type { LuxorBooking, LuxorInvoice, LuxorPaymentInstallment } from './luxorInquiryTypes'

export type LuxorSavedPaymentScheduleStatus = 'preview' | 'committed' | 'saved' | 'review_required'
export type LuxorSavedPaymentScheduleRow = {
  installment_order: number
  label: string
  description?: string
  amount: number
  due_at: string
  payment_bucket: 'venue' | 'event' | 'security_deposit'
  status?: 'scheduled' | 'sent' | 'partial' | 'paid' | 'void'
  paid_at?: string | null
}
export type LuxorSavedPaymentSchedule = {
  status: LuxorSavedPaymentScheduleStatus
  rows: LuxorSavedPaymentScheduleRow[]
  final_payment_due_date?: string
} | null

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function rowFromValue(value: unknown): LuxorSavedPaymentScheduleRow | null {
  const row = asRecord(value)
  if (!row || !Number.isInteger(Number(row.installment_order)) || Number(row.installment_order) < 1 ||
    typeof row.label !== 'string' || !Number.isFinite(Number(row.amount)) || Number(row.amount) < 0 ||
    typeof row.due_at !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(row.due_at)) return null
  const bucket = row.payment_bucket === 'event' || row.payment_bucket === 'security_deposit' ? row.payment_bucket : 'venue'
  const status = row.status === 'scheduled' || row.status === 'sent' || row.status === 'partial' || row.status === 'paid' || row.status === 'void' ? row.status : undefined
  return {
    installment_order: Number(row.installment_order),
    label: row.label,
    ...(typeof row.description === 'string' ? { description: row.description } : {}),
    amount: Number(row.amount),
    due_at: row.due_at.slice(0, 10),
    payment_bucket: bucket,
    ...(status ? { status } : {}),
    ...(typeof row.paid_at === 'string' ? { paid_at: row.paid_at } : {}),
  }
}

function frozenRows(values: unknown) {
  return Array.isArray(values)
    ? values.map(rowFromValue).filter((row): row is LuxorSavedPaymentScheduleRow => Boolean(row && row.status !== 'void')).sort((left, right) => left.installment_order - right.installment_order)
    : []
}

function installmentRows(values: LuxorPaymentInstallment[], requireFirstDepositPolicy: boolean) {
  return values
    .filter((row) => row.status !== 'void' && (!requireFirstDepositPolicy || row.metadata?.schedule_anchor_policy === 'first_deposit_paid_at_v1'))
    .map((row) => rowFromValue({
      installment_order: row.installment_order,
      label: row.label,
      amount: row.amount,
      due_at: row.due_at,
      payment_bucket: row.metadata?.payment_bucket,
      status: row.status,
      paid_at: row.paid_at,
    }))
    .filter((row): row is LuxorSavedPaymentScheduleRow => Boolean(row))
    .sort((left, right) => left.installment_order - right.installment_order)
}

/** Selects only persisted proposal rows; it never recalculates dates or amounts. */
export function getLuxorSavedPaymentSchedule(input: {
  invoice: Pick<LuxorInvoice, 'proposal_context'>
  booking?: Pick<LuxorBooking, 'metadata'> | null
  installments?: LuxorPaymentInstallment[]
}): LuxorSavedPaymentSchedule {
  const context = asRecord(input.invoice.proposal_context)
  const plan = asRecord(context?.payment_plan)
  if (!plan || plan.mode === 'pay_in_full') return null

  const snapshotRows = frozenRows(plan.schedule_rows)
  const rows = input.installments || []
  const usesDepositAnchor = plan.schedule_anchor_policy === 'first_deposit_paid_at_v1'
  const depositPaidAt = typeof input.booking?.metadata?.deposit_paid_at === 'string' ? input.booking.metadata.deposit_paid_at : null
  const expectedCount = Number.isInteger(Number(plan.payment_count)) && Number(plan.payment_count) > 0
    ? Number(plan.payment_count)
    : snapshotRows.length

  if (usesDepositAnchor) {
    const committedRows = installmentRows(rows, true)
    if (plan.schedule_status === 'review_required') {
      return {
        status: 'review_required',
        rows: [],
        ...(typeof plan.final_payment_due_date === 'string' ? { final_payment_due_date: plan.final_payment_due_date } : {}),
      }
    }
    if (committedRows.length && expectedCount > 0 && committedRows.length === expectedCount) {
      return {
        status: 'committed',
        rows: committedRows,
        ...(typeof plan.final_payment_due_date === 'string' ? { final_payment_due_date: plan.final_payment_due_date } : {}),
      }
    }
    if (depositPaidAt || committedRows.length) {
      return {
        status: 'review_required',
        rows: [],
        ...(typeof plan.final_payment_due_date === 'string' ? { final_payment_due_date: plan.final_payment_due_date } : {}),
      }
    }
    return snapshotRows.length ? {
      status: 'preview',
      rows: snapshotRows,
      ...(typeof plan.final_payment_due_date === 'string' ? { final_payment_due_date: plan.final_payment_due_date } : {}),
    } : null
  }

  const savedInstallments = installmentRows(rows, false)
  const historicalRows = savedInstallments.length ? savedInstallments : snapshotRows
  return historicalRows.length ? {
    status: 'saved',
    rows: historicalRows,
    ...(typeof plan.final_payment_due_date === 'string' ? { final_payment_due_date: plan.final_payment_due_date } : {}),
  } : null
}
