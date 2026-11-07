import 'server-only'

import {
  getLuxorPortalSession,
  type LuxorPortalSession,
} from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { SupabaseRestError, supabaseRest, supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'
import type {
  LuxorExpenseBooking,
  LuxorExpenseCategory,
  LuxorExpenseManagementData,
  LuxorExpensePayment,
  LuxorExpenseRecord,
  LuxorExpenseTemplate,
} from '@/lib/luxorExpenseTypes'

export const LUXOR_EXPENSE_PAYMENT_METHODS = [
  'Credit Card', 'Debit Card', 'Cash', 'Zelle', 'Bank Transfer', 'Check', 'Stripe', 'Other',
] as const

export type LuxorExpenseTemplateFrequency = LuxorExpenseTemplate['frequency']
export type LuxorExpenseTemplateRow = LuxorExpenseTemplate
export type LuxorExpenseRecordRow = Omit<LuxorExpenseRecord, 'paid_amount' | 'remaining_balance' | 'payment_status' | 'payments'>

export class LuxorExpenseRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
    this.name = 'LuxorExpenseRequestError'
  }
}

const EXPENSE_MANAGEMENT_NOT_READY_MESSAGE = 'Expense Management setup is not complete yet. Existing financial records remain available to view, but expense changes are temporarily unavailable.'
const EXPENSE_MANAGEMENT_TABLES = ['luxor_expense_categories', 'luxor_expense_templates', 'luxor_expense_payments', 'luxor_expense_audit'] as const

function isMissingExpenseManagementTable(error: unknown) {
  if (!(error instanceof SupabaseRestError) || error.status !== 404 || error.code !== 'PGRST205') return false
  return EXPENSE_MANAGEMENT_TABLES.some((table) => error.message.includes(table))
}

function isMissingExpensePaymentTable(error: unknown) {
  return error instanceof SupabaseRestError
    && error.status === 404
    && error.code === 'PGRST205'
    && error.message.includes('luxor_expense_payments')
}

export function isExpenseManagementNotReady(error: unknown): error is LuxorExpenseRequestError {
  return error instanceof LuxorExpenseRequestError
    && error.status === 503
    && error.message === EXPENSE_MANAGEMENT_NOT_READY_MESSAGE
}

/** Read-only probe used by Phase 1/2 readers that need only Phase 3 cash history. */
export async function assertLuxorExpensePaymentHistoryReady() {
  try {
    await supabaseRestStrict<Array<{ id: string }>>('luxor_expense_payments?select=id&limit=0')
  } catch (error) {
    if (isMissingExpensePaymentTable(error)) {
      throw new LuxorExpenseRequestError(EXPENSE_MANAGEMENT_NOT_READY_MESSAGE, 503)
    }
    throw error
  }
}

/** Read-only full-schema probe used before Phase 3 pages or writes. */
export async function assertLuxorExpenseSchemaReady() {
  for (const table of EXPENSE_MANAGEMENT_TABLES) {
    try {
      await supabaseRestStrict<Array<{ id: string }>>(`${table}?select=id&limit=0`)
    } catch (error) {
      if (isMissingExpenseManagementTable(error)) {
        throw new LuxorExpenseRequestError(EXPENSE_MANAGEMENT_NOT_READY_MESSAGE, 503)
      }
      throw error
    }
  }
}

export async function authorizeLuxorExpenseRequest() {
  const session = await getLuxorPortalSession()
  if (!session) throw new LuxorExpenseRequestError('Portal sign-in required.', 401)
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances')) {
    throw new LuxorExpenseRequestError('Finance access required.', 403)
  }
  await assertLuxorExpenseSchemaReady()
  return { session: session as LuxorPortalSession, member }
}

export function toExpenseErrorResponse(error: unknown) {
  if (error instanceof LuxorExpenseRequestError) return { status: error.status, message: error.message }
  if (isMissingExpenseManagementTable(error)) return { status: 503, message: EXPENSE_MANAGEMENT_NOT_READY_MESSAGE }
  return { status: 500, message: 'Expense information could not be loaded. Please try again.' }
}

export function isExpenseUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function luxorTodayDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (name: 'year' | 'month' | 'day') => parts.find((item) => item.type === name)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function paymentSort(left: LuxorExpensePayment, right: LuxorExpensePayment) {
  return right.payment_date.localeCompare(left.payment_date) || right.created_at.localeCompare(left.created_at)
}

export function paidAmountForExpense(expense: Pick<LuxorExpenseRecordRow, 'amount' | 'status' | 'metadata'>, payments: LuxorExpensePayment[]) {
  const rawLegacy = expense.metadata?.legacy_paid_amount
  const legacyAmount = typeof rawLegacy === 'number' || typeof rawLegacy === 'string'
    ? Number(rawLegacy)
    : payments.length === 0 && expense.status === 'paid' ? Number(expense.amount) : 0
  const legacyPaid = Number.isFinite(legacyAmount) && legacyAmount > 0 ? legacyAmount : 0
  const transactionTotal = payments.reduce((sum, payment) => {
    const amount = Number(payment.amount)
    if (!Number.isFinite(amount) || amount <= 0) return sum
    return sum + (payment.transaction_type === 'payment' ? amount : -amount)
  }, 0)
  return money(Math.max(0, legacyPaid + transactionTotal))
}

export function deriveExpensePaymentStatus(expense: Pick<LuxorExpenseRecordRow, 'amount' | 'status' | 'due_date' | 'metadata'>, paidAmount: number, today = luxorTodayDateKey()) {
  if (expense.status === 'cancelled') return 'cancelled' as const
  const amount = Number(expense.amount)
  if (expense.metadata?.amount_state === 'variable' && amount === 0) {
    // The due date cannot determine an overdue balance until the variable
    // invoice amount has been reviewed and confirmed.
    return 'expected' as const
  }
  if (Number.isFinite(amount) && amount > 0 && paidAmount >= amount) return 'paid' as const
  if (expense.due_date === today) return 'due_today' as const
  if (expense.due_date && expense.due_date < today) return 'overdue' as const
  if (paidAmount > 0) return 'partially_paid' as const
  return 'expected' as const
}

function dateParts(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

function dateOrdinal(value: string) {
  const { year, month, day } = dateParts(value)
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

function dateKeyFromUtc(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function addDays(value: string, days: number) {
  const { year, month, day } = dateParts(value)
  return dateKeyFromUtc(new Date(Date.UTC(year, month - 1, day + days)))
}

function addMonthsAnchored(value: string, months: number, anchorDay?: number) {
  const { year, month, day } = dateParts(value)
  const monthDate = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate()
  return dateKeyFromUtc(new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), Math.min(anchorDay ?? day, lastDay))))
}

function monthIndex(value: string) {
  const { year, month } = dateParts(value)
  return year * 12 + month - 1
}

function occurrenceAt(template: LuxorExpenseTemplate, index: number) {
  const anchor = template.first_due_date
  if (template.frequency === 'weekly') return addDays(anchor, index * 7)
  if (template.frequency === 'biweekly') return addDays(anchor, index * 14)
  if (template.frequency === 'monthly') return addMonthsAnchored(anchor, index)
  if (template.frequency === 'quarterly') return addMonthsAnchored(anchor, index * 3)
  if (template.frequency === 'annually') return addMonthsAnchored(anchor, index * 12)
  const interval = Number(template.custom_interval || 0)
  if (!Number.isInteger(interval) || interval < 1 || interval > 365 || !template.custom_unit) {
    throw new LuxorExpenseRequestError(`Recurring template “${template.name}” has an invalid custom interval.`, 500)
  }
  if (template.custom_unit === 'days') return addDays(anchor, index * interval)
  if (template.custom_unit === 'weeks') return addDays(anchor, index * interval * 7)
  if (template.custom_unit === 'months') return addMonthsAnchored(anchor, index * interval)
  return addMonthsAnchored(anchor, index * interval * 12)
}

function firstOccurrenceIndex(template: LuxorExpenseTemplate, floorDate: string) {
  if (template.first_due_date >= floorDate) return 0
  if (template.frequency === 'weekly' || template.frequency === 'biweekly' || (template.frequency === 'custom' && ['days','weeks'].includes(String(template.custom_unit)))) {
    const daysPerStep = template.frequency === 'weekly' ? 7
      : template.frequency === 'biweekly' ? 14
        : Number(template.custom_interval) * (template.custom_unit === 'weeks' ? 7 : 1)
    return Math.max(0, Math.ceil((dateOrdinal(floorDate) - dateOrdinal(template.first_due_date)) / daysPerStep))
  }
  const monthsPerStep = template.frequency === 'monthly' ? 1
    : template.frequency === 'quarterly' ? 3
      : template.frequency === 'annually' ? 12
        : template.custom_unit === 'years' ? Number(template.custom_interval) * 12 : Number(template.custom_interval)
  let index = Math.max(0, Math.ceil((monthIndex(floorDate) - monthIndex(template.first_due_date)) / monthsPerStep))
  const candidate = occurrenceAt(template, index)
  if (candidate < floorDate) index += 1
  return index
}

function occurrenceRange(template: LuxorExpenseTemplate, lowerBound: string, upperBound: string) {
  const floorDate = template.start_date > lowerBound ? template.start_date : lowerBound
  let index = firstOccurrenceIndex(template, floorDate)
  const dates: string[] = []
  for (let count = 0; count < 5000; count += 1, index += 1) {
    const dueDate = occurrenceAt(template, index)
    if (template.end_date && dueDate > template.end_date) break
    if (dueDate > upperBound) break
    if (dueDate >= floorDate) dates.push(dueDate)
  }
  return dates
}

async function readAllStrict<T extends { id: string }>(path: string, label: string) {
  const expected = await supabaseRestCount(path)
  const rows: T[] = []
  for (let offset = 0; offset < expected; offset += 500) {
    const page = await supabaseRestStrict<T[]>(`${path}&limit=500&offset=${offset}`)
    if (page.length < Math.min(500, expected - offset)) throw new Error(`${label} could not be fully verified.`)
    rows.push(...page)
  }
  if (rows.length !== expected || new Set(rows.map((row) => row.id)).size !== expected || await supabaseRestCount(path) !== expected) {
    throw new Error(`${label} changed while loading. Refresh and try again.`)
  }
  return rows
}

export async function generateLuxorExpenseOccurrences(now = new Date(), templateId?: string) {
  const today = luxorTodayDateKey(now)
  const currentMonthStart = `${today.slice(0, 7)}-01`
  const horizon = addDays(today, 366)
  const path = `luxor_expense_templates?select=*&is_active=eq.true&order=first_due_date.asc,id.asc${templateId ? `&id=eq.${encodeURIComponent(templateId)}` : ''}`
  const templates = await readAllStrict<LuxorExpenseTemplate>(path, 'Recurring templates')
  let inserted = 0
  for (const template of templates) {
    const dates = occurrenceRange(template, currentMonthStart, horizon)
    const occurrences: Array<Record<string, unknown>> = []
    for (let index = 0; index < dates.length; index += 1) {
      const dueDate = dates[index]
      const nextDate = dates[index + 1] || occurrenceAt(template, firstOccurrenceIndex(template, dueDate) + 1)
      const isVariable = template.is_variable
      const amount = isVariable ? 0 : Number(template.expected_amount)
      if (!isVariable && (!Number.isFinite(amount) || amount <= 0)) throw new Error(`Recurring template “${template.name}” has no valid expected amount.`)
      const metadata = {
        generated_from_template: true,
        template_name_at_generation: template.name,
        frequency_at_generation: template.frequency,
        amount_state: isVariable ? 'variable' : 'known',
        expected_amount: isVariable ? null : amount,
      }
      occurrences.push({
        booking_id: null,
        expense_type: 'business',
        category: template.category,
        category_id: template.category_id,
        description: template.name,
        vendor_name: template.vendor_name,
        amount,
        incurred_on: dueDate,
        due_date: dueDate,
        status: 'planned',
        payment_method: template.payment_method,
        notes: template.notes,
        metadata,
        recurring_template_id: template.id,
        billing_period_start: dueDate,
        billing_period_end: addDays(nextDate, -1),
        created_by: 'recurring expense generator',
      })
    }
    if (occurrences.length) {
      const created = await supabaseRest<LuxorExpenseRecordRow[]>(
        'luxor_booking_expenses?on_conflict=recurring_template_id,billing_period_start&select=*',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
          body: JSON.stringify(occurrences),
        },
      )
      inserted += created.length
    }
  }
  return { inserted, templates_checked: templates.length }
}

export async function loadLuxorExpenseManagementData(options: { generate?: boolean; now?: Date } = {}): Promise<LuxorExpenseManagementData> {
  if (options.generate !== false) await generateLuxorExpenseOccurrences(options.now)
  const [expenseRows, payments, templates, categories, bookings, bills, documents] = await Promise.all([
    readAllStrict<LuxorExpenseRecordRow>('luxor_booking_expenses?select=*&order=incurred_on.desc,created_at.desc,id.asc', 'Expenses'),
    readAllStrict<LuxorExpensePayment>('luxor_expense_payments?select=*&order=payment_date.desc,created_at.desc,id.asc', 'Expense payments'),
    readAllStrict<LuxorExpenseTemplate>('luxor_expense_templates?select=*&order=is_active.desc,first_due_date.asc,name.asc,id.asc', 'Recurring templates'),
    readAllStrict<LuxorExpenseCategory>('luxor_expense_categories?select=*&order=is_system.desc,name.asc,id.asc', 'Expense categories'),
    readAllStrict<LuxorExpenseBooking>('luxor_bookings?select=id,client_name,event_type,event_date,status,contract_total,contract_status,contract_signed_at,inquiry_id,invoice_id&order=event_date.asc,id.asc', 'Bookings'),
    readAllStrict<LuxorBill>('luxor_bills?select=*&order=due_date.asc,id.asc', 'Bills'),
    readAllStrict<LuxorExpenseManagementData['receipts'][number]>('luxor_documents?select=*&document_type=eq.expense_receipt&order=created_at.desc,id.asc', 'Receipts'),
  ])

  const paymentRowsByExpense = new Map<string, LuxorExpensePayment[]>()
  for (const payment of payments) {
    const list = paymentRowsByExpense.get(payment.expense_id) || []
    list.push(payment)
    paymentRowsByExpense.set(payment.expense_id, list)
  }
  const today = luxorTodayDateKey(options.now)
  const expenses: LuxorExpenseRecord[] = expenseRows.map((expense) => {
    const history = (paymentRowsByExpense.get(expense.id) || []).sort(paymentSort)
    const paidAmount = paidAmountForExpense(expense, history)
    const amountKnown = !(expense.metadata?.amount_state === 'variable' && Number(expense.amount) === 0)
    return {
      ...expense,
      amount_known: amountKnown,
      payments: history,
      paid_amount: paidAmount,
      remaining_balance: amountKnown ? money(Math.max(0, Number(expense.amount) - paidAmount)) : null,
      payment_status: deriveExpensePaymentStatus(expense, paidAmount, today),
    }
  })
  const linkedBills = new Map(expenses.filter((expense) => expense.source_bill_id).map((expense) => [expense.source_bill_id as string, expense.id]))
  return {
    can_manage_categories: false,
    expenses,
    templates,
    categories,
    bookings,
    bills: bills.map((bill) => ({ ...bill, linked_expense_id: linkedBills.get(bill.id) || null })),
    receipts: documents,
  }
}

export async function getExpenseRecordWithHistory(id: string) {
  const [expense] = await supabaseRestStrict<LuxorExpenseRecordRow[]>(`luxor_booking_expenses?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
  if (!expense) return null
  const history = await supabaseRestStrict<LuxorExpensePayment[]>(`luxor_expense_payments?select=*&expense_id=eq.${encodeURIComponent(id)}&order=payment_date.desc,created_at.desc,id.asc`)
  const paidAmount = paidAmountForExpense(expense, history)
  const amountKnown = !(expense.metadata?.amount_state === 'variable' && Number(expense.amount) === 0)
  if (!amountKnown && paidAmount > 0) throw new Error('A variable expense with payment history needs a confirmed bill amount.')
  return {
    ...expense,
    amount_known: amountKnown,
    payments: history,
    paid_amount: paidAmount,
    remaining_balance: amountKnown ? money(Math.max(0, Number(expense.amount) - paidAmount)) : null,
    payment_status: deriveExpensePaymentStatus(expense, paidAmount),
  } satisfies LuxorExpenseRecord
}

export async function getLuxorExpenseStorageConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Private receipt storage is not configured on the server.')
  return { url: url.replace(/\/$/, ''), key }
}

export async function getLuxorExpenseCategoryByName(name: string, allowInactive = false) {
  const rows = await supabaseRestStrict<LuxorExpenseCategory[]>(
    `luxor_expense_categories?select=*&name=eq.${encodeURIComponent(name)}${allowInactive ? '' : '&is_active=eq.true'}&limit=1`,
  )
  return rows[0] || null
}

export async function validateExpenseBooking(id: string) {
  const rows = await supabaseRestStrict<Array<{ id: string; inquiry_id: string | null }>>(`luxor_bookings?select=id,inquiry_id&id=eq.${encodeURIComponent(id)}&limit=1`)
  return rows[0] || null
}

export async function validateExpenseBill(id: string) {
  const rows = await supabaseRestStrict<LuxorBill[]>(`luxor_bills?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
  return rows[0] || null
}

export async function findExpenseBySourceBill(id: string) {
  const rows = await supabaseRestStrict<Array<{ id: string }>>(`luxor_booking_expenses?select=id&source_bill_id=eq.${encodeURIComponent(id)}&limit=1`)
  return rows[0] || null
}

export async function getExpenseReceipts(expenseId: string) {
  return supabaseRestStrict<LuxorExpenseManagementData['receipts']>(`luxor_documents?select=*&expense_id=eq.${encodeURIComponent(expenseId)}&document_type=eq.expense_receipt&order=created_at.desc,id.asc`)
}

export async function loadAllExpenseReceipts() {
  return readAllStrict<LuxorExpenseManagementData['receipts'][number]>('luxor_documents?select=*&document_type=eq.expense_receipt&order=created_at.desc,id.asc', 'Receipts')
}

export async function findExpenseDuplicatesForReceipt(input: {
  vendorName: string
  transactionDate: string
  totalAmount: number
  excludeExpenseId?: string | null
}) {
  if (!input.vendorName.trim() || !isDateKey(input.transactionDate) || !Number.isFinite(input.totalAmount) || input.totalAmount <= 0) return []
  const rows = await supabaseRestStrict<Array<{
    id: string
    description: string | null
    vendor_name: string | null
    amount: number
    incurred_on: string | null
  }>>(`luxor_booking_expenses?select=id,description,vendor_name,amount,incurred_on&incurred_on=eq.${encodeURIComponent(input.transactionDate)}&amount=eq.${encodeURIComponent(String(input.totalAmount))}`)
  const vendor = input.vendorName.trim().toLocaleLowerCase()
  return rows.filter((expense) => expense.id !== input.excludeExpenseId
    && (expense.vendor_name || '').trim().toLocaleLowerCase() === vendor).slice(0, 8)
}

export async function getExpenseDocument(id: string) {
  const rows = await supabaseRestStrict<LuxorExpenseManagementData['receipts']>(`luxor_documents?select=*&id=eq.${encodeURIComponent(id)}&document_type=eq.expense_receipt&limit=1`)
  return rows[0] || null
}
