import type { LuxorBill, LuxorBookingStatus } from '@/lib/luxorInquiryTypes'

export type LuxorExpenseRecordStatus = 'planned' | 'incurred' | 'paid' | 'cancelled'
export type LuxorExpenseType = 'business' | 'event'
export type LuxorExpenseFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually' | 'custom'
export type LuxorExpensePaymentMethod = 'Credit Card' | 'Debit Card' | 'Cash' | 'Zelle' | 'Bank Transfer' | 'Check' | 'Stripe' | 'Other'
export type LuxorExpensePaymentTransactionType = 'payment' | 'refund' | 'reversal'
export type LuxorExpensePaymentStatus = 'expected' | 'due_today' | 'overdue' | 'partially_paid' | 'paid' | 'cancelled' | 'needs_review'

export type LuxorExpensePayment = {
  id: string
  expense_id: string
  amount: number
  transaction_type: LuxorExpensePaymentTransactionType
  payment_date: string
  payment_method: LuxorExpensePaymentMethod
  reference_number: string | null
  notes: string | null
  idempotency_key?: string
  created_at: string
  created_by?: string
}

export type LuxorExpensePaymentRetryIntent = {
  idempotency_key: string
  amount: string | number
  transaction_type: string
  payment_date: string
  payment_method: string
  reference_number?: string | null
  notes?: string | null
}

export type LuxorExpensePaymentRetryHistoryEntry = {
  idempotency_key?: string | null
  amount: number
  transaction_type: string
  payment_date: string
  payment_method: string | null
  reference_number?: string | null
  notes?: string | null
}

export type LuxorExpensePaymentRetryResolution = {
  status: 'pending' | 'confirmed' | 'conflict'
  keepLocked: boolean
  clearSavedRequest: boolean
}

export type LuxorExpensePaymentPostFailureDisposition = {
  keepLocked: boolean
  clearSavedRequest: boolean
  idempotencyConflict: boolean
}

export const LUXOR_EXPENSE_PAYMENT_IDEMPOTENCY_CONFLICT_CODE = 'EXPENSE_PAYMENT_IDEMPOTENCY_CONFLICT'

export function isLuxorExpensePaymentIdempotencyConflict(errorCode?: string | null, errorMessage?: string | null) {
  return errorCode === '23505'
    && (errorMessage || '').toLowerCase().includes('payment request key was already used for a different transaction')
}

export function getLuxorExpensePaymentPostFailureDisposition(
  status: number,
  code?: string | null,
): LuxorExpensePaymentPostFailureDisposition {
  const idempotencyConflict = status === 409 && code === LUXOR_EXPENSE_PAYMENT_IDEMPOTENCY_CONFLICT_CODE
  const keepLocked = status >= 500 || idempotencyConflict
  return { keepLocked, clearSavedRequest: !keepLocked, idempotencyConflict }
}

export function reconcileLuxorExpensePaymentRetry(
  payments: LuxorExpensePaymentRetryHistoryEntry[],
  intent: LuxorExpensePaymentRetryIntent,
): LuxorExpensePaymentRetryResolution {
  const matching = payments.find((payment) => payment.idempotency_key === intent.idempotency_key)
  if (!matching) return { status: 'pending', keepLocked: true, clearSavedRequest: false }

  const isExact = Math.abs(Number(matching.amount) - Number(intent.amount)) < 0.001
    && matching.transaction_type === intent.transaction_type
    && matching.payment_date === intent.payment_date
    && matching.payment_method === intent.payment_method
    && (matching.reference_number || '').trim() === (intent.reference_number || '').trim()
    && (matching.notes || '').trim() === (intent.notes || '').trim()

  return isExact
    ? { status: 'confirmed', keepLocked: false, clearSavedRequest: true }
    : { status: 'conflict', keepLocked: true, clearSavedRequest: false }
}

export type LuxorExpenseRecord = {
  id: string
  created_at: string
  updated_at: string
  created_by?: string | null
  updated_by?: string | null
  booking_id: string | null
  expense_type: LuxorExpenseType
  category: string
  category_id: string | null
  description: string | null
  vendor_name: string | null
  amount: number | null
  incurred_on: string | null
  due_date: string | null
  status: LuxorExpenseRecordStatus
  payment_status: LuxorExpensePaymentStatus
  amount_known: boolean
  payment_method: LuxorExpensePaymentMethod | null
  reference_number: string | null
  notes: string | null
  metadata: Record<string, unknown>
  recurring_template_id: string | null
  billing_period_start: string | null
  billing_period_end: string | null
  source_bill_id: string | null
  paid_amount: number | null
  remaining_balance: number | null
  payments: LuxorExpensePayment[]
}

export type LuxorExpenseTemplate = {
  id: string
  name: string
  category: string
  category_id: string | null
  vendor_name: string | null
  expected_amount: number | null
  is_variable: boolean
  frequency: LuxorExpenseFrequency
  custom_interval: number | null
  custom_unit: 'days' | 'weeks' | 'months' | 'years' | null
  first_due_date: string
  start_date: string
  end_date: string | null
  payment_method: LuxorExpensePaymentMethod | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by?: string | null
  updated_by?: string | null
}

export type LuxorExpenseCategory = {
  id: string
  name: string
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  created_by?: string | null
  updated_by?: string | null
}

export type LuxorExpenseReceipt = {
  id: string
  created_at: string
  updated_at: string
  expense_id: string | null
  inquiry_id: string | null
  invoice_id: string | null
  document_type: 'expense_receipt'
  title: string
  file_name: string
  storage_path: string
  content_type: 'application/pdf' | 'image/jpeg' | 'image/png'
  size_bytes: number
  created_by: string | null
  metadata: {
    vendor_name?: string | null
    transaction_date?: string | null
    total_amount?: number | null
    subtotal_amount?: number | null
    tax_amount?: number | null
    category?: string | null
    booking_id?: string | null
    notes?: string | null
    sha256?: string | null
    extracted_fields?: Record<string, unknown>
    replacement_history?: Array<Record<string, unknown>>
    metadata_history?: Array<Record<string, unknown>>
    [key: string]: unknown
  }
}

export type LuxorExpenseBooking = {
  id: string
  client_name: string
  event_type: string | null
  event_date: string | null
  status: LuxorBookingStatus | string
  contract_total?: number | null
  contract_status?: string | null
  contract_signed_at?: string | null
  inquiry_id?: string | null
  invoice_id?: string | null
}

export type LuxorExpenseBill = LuxorBill & { linked_expense_id: string | null }

export type LuxorExpenseManagementData = {
  can_manage_categories: boolean
  expenses: LuxorExpenseRecord[]
  templates: LuxorExpenseTemplate[]
  categories: LuxorExpenseCategory[]
  bookings: LuxorExpenseBooking[]
  bills: LuxorExpenseBill[]
  receipts: LuxorExpenseReceipt[]
}
