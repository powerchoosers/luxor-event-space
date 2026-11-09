'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CalendarBlank,
  CalendarDots,
  Check,
  FileText,
  MagnifyingGlass,
  Plus,
  Receipt,
  Repeat,
  TrendDown,
  UploadSimple,
  X,
} from '@phosphor-icons/react'
import {
  PortalAnimatedTabs,
  PortalButton,
  PortalDatePicker,
  PortalModal,
  PortalPageFrame,
  PortalPageHeader,
  PortalSelect,
  PortalSkeleton,
  PortalTabTransition,
} from '@/components/portal/PortalUI'
import { FinanceBrowseViews, type FinanceBrowseView } from '@/components/portal/FinanceBrowseViews'
import { getLuxorExpenseCashActivityInPeriod } from '@/lib/luxorFinanceReporting'
import { getLuxorExpensePaymentPostFailureDisposition, reconcileLuxorExpensePaymentRetry } from '@/lib/luxorExpenseTypes'
import type { LuxorBooking, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment, LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'

type ExpenseManagementView = 'dashboard' | 'recurring' | 'business' | 'events' | 'receipts' | 'detail'
type ExpensePayment = {
  id: string
  expense_id: string
  amount: number
  transaction_type: 'payment' | 'refund' | 'reversal'
  idempotency_key?: string | null
  payment_date: string
  payment_method: string | null
  reference_number: string | null
  notes: string | null
  created_at: string
}
type ExpenseRow = {
  id: string
  created_at: string
  updated_at: string
  booking_id: string | null
  category: string
  description: string | null
  vendor_name: string | null
  amount: number
  amount_known?: boolean
  incurred_on: string
  due_date?: string | null
  status: 'planned' | 'incurred' | 'paid' | 'cancelled' | string
  notes: string | null
  metadata: Record<string, unknown> | null
  expense_type?: 'business' | 'event' | string
  recurring_template_id?: string | null
  billing_period_start?: string | null
  billing_period_end?: string | null
  payment_method?: string | null
  reference_number?: string | null
  source_bill_id?: string | null
  tax_amount?: number | null
  paid_amount: number
  remaining_balance: number | null
  payment_status: 'expected' | 'due_today' | 'overdue' | 'partially_paid' | 'paid' | 'cancelled' | string
  payments: ExpensePayment[]
}
type ExpenseTemplate = {
  id: string
  name: string
  category: string
  vendor_name: string | null
  expected_amount: number | null
  is_variable: boolean
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually' | 'custom' | string
  custom_interval?: number | null
  custom_unit?: 'days' | 'weeks' | 'months' | 'years' | string | null
  first_due_date: string
  start_date: string
  end_date: string | null
  payment_method: string | null
  notes: string | null
  is_active: boolean
}
type ExpenseCategory = { id: string; name: string; is_system: boolean; is_active: boolean }
type ExpenseBooking = {
  id: string
  client_name: string
  event_type: string | null
  event_date: string | null
  status: string
  contract_total?: number | null
  contract_status?: string | null
}
type ExpenseBill = {
  id: string
  service: string
  provider: string
  amount: number
  amount_state?: 'known' | 'unknown' | 'variable' | null
  status: string
  due_date: string | null
  issue_date?: string | null
  extraction_status?: string
  payment_ready_at?: string | null
  bill_category?: string | null
  source_attachment_id?: string | null
  source_filename?: string | null
  currency?: string | null
}
type ExpenseReceipt = {
  id: string
  expense_id: string | null
  title: string
  file_name: string
  storage_path: string
  content_type: string
  size_bytes: number
  created_at: string
  metadata: Record<string, unknown> | null
}
type ExpenseManagementData = {
  expenses: ExpenseRow[]
  templates: ExpenseTemplate[]
  categories: ExpenseCategory[]
  bookings: ExpenseBooking[]
  bills: ExpenseBill[]
  receipts: ExpenseReceipt[]
  can_manage_categories?: boolean
}
type PendingExpenseRequest = {
  client_request_id: string
  expense_payload: Record<string, unknown>
  form_snapshot: Record<string, unknown>
  first_payment_payload: Record<string, unknown> | null
}
type FinanceLedgerData = {
  payments: LuxorPayment[]
  invoices: LuxorInvoice[]
  bookings: LuxorBooking[]
  installments: LuxorPaymentInstallment[]
  refunds: LuxorPaymentRefundView[]
  eventPaymentsReceivedByBooking?: Record<string, number> | null
  eventPaymentsVerified?: boolean
}

const VIEW_DETAILS: Record<ExpenseManagementView, { title: string; description: string; browse: FinanceBrowseView; icon: React.ReactNode }> = {
  dashboard: { title: 'Expense Dashboard', description: 'A clear view of paid spending and upcoming business costs.', browse: 'expense-dashboard', icon: <TrendDown size={18} weight="regular" /> },
  recurring: { title: 'Recurring Expenses', description: 'Manage fixed and variable obligations from one schedule.', browse: 'recurring-expenses', icon: <Repeat size={18} weight="regular" /> },
  business: { title: 'Business Expenses', description: 'Record general operating costs and review their payment history.', browse: 'business-expenses', icon: <Briefcase size={18} weight="regular" /> },
  events: { title: 'Event Expenses', description: 'Keep booking costs connected to the right event and client.', browse: 'event-expenses', icon: <CalendarDots size={18} weight="regular" /> },
  receipts: { title: 'Receipts & Records', description: 'Find and review the documents tied to expense records.', browse: 'expense-receipts', icon: <Receipt size={18} weight="regular" /> },
  detail: { title: 'Expense detail', description: 'Review this expense, its balance, documents, and transaction history.', browse: 'business-expenses', icon: <FileText size={18} weight="regular" /> },
}

const EXPENSE_TABS: Array<{ id: Exclude<ExpenseManagementView, 'detail'>; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: 'Expense Dashboard', icon: <TrendDown size={15} weight="regular" /> },
  { id: 'recurring', label: 'Recurring Expenses', icon: <Repeat size={15} weight="regular" /> },
  { id: 'business', label: 'Business Expenses', icon: <Briefcase size={15} weight="regular" /> },
  { id: 'events', label: 'Event Expenses', icon: <CalendarDots size={15} weight="regular" /> },
  { id: 'receipts', label: 'Receipts & Records', icon: <Receipt size={15} weight="regular" /> },
]

const DEFAULT_CATEGORIES = ['Rent', 'Utilities', 'Marketing', 'Cleaning', 'Supplies', 'Equipment', 'Insurance', 'Maintenance', 'Event Expenses', 'Professional Services', 'Decor', 'Labor', 'Other']
const PAYMENT_METHODS = ['Credit Card', 'Debit Card', 'Cash', 'Zelle', 'Bank Transfer', 'Check', 'Stripe', 'Other']
const PERIOD_OPTIONS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'all_time', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
]
const INPUT_CLASS = 'min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none transition focus:border-[#caa24c]/60 focus:ring-2 focus:ring-[#caa24c]/20 placeholder:text-[color:var(--portal-faint)]'
const TEXTAREA_CLASS = 'min-h-24 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition focus:border-[#caa24c]/60 focus:ring-2 focus:ring-[#caa24c]/20 placeholder:text-[color:var(--portal-faint)]'
const CARD_CLASS = 'rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-sm'

function dateKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function todayKey() { return dateKey(new Date()) }

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}

function formatDate(value: string | null | undefined) {
  const date = value ? parseDateKey(value) : null
  return date ? date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}

function money(value: number | null | undefined) {
  const amount = Number(value)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(amount) ? amount : 0)
}

function hasKnownAmount(expense: ExpenseRow) {
  const state = expense.metadata?.amount_state
  return expense.amount_known !== false && state !== 'variable' && state !== 'unknown'
}

function expenseAmountLabel(expense: ExpenseRow) {
  return hasKnownAmount(expense) ? money(expense.amount) : 'Awaiting bill'
}

function paymentRetryStorageKey(expenseId: string) {
  return `luxor-expense-payment-retry:${expenseId}`
}

function expenseCreateRetryStorageKey() {
  return 'luxor-expense-create-retry'
}

function periodBounds(period: string, customStart: string, customEnd: string) {
  const today = todayKey()
  const [year, month] = today.split('-').map(Number)
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const lastMonthDate = new Date(Date.UTC(year, month - 2, 1, 12))
  const lastMonthStart = dateKey(lastMonthDate)
  const lastMonthEnd = dateKey(new Date(Date.UTC(year, month - 1, 0, 12)))
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1
  if (period === 'this_month') return { start: monthStart, end: today }
  if (period === 'last_month') return { start: lastMonthStart, end: lastMonthEnd }
  if (period === 'this_quarter') return { start: `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`, end: today }
  if (period === 'this_year') return { start: `${year}-01-01`, end: today }
  if (period === 'custom') return { start: customStart, end: customEnd }
  return { start: '0001-01-01', end: today }
}

function inRange(date: string | null | undefined, start: string, end: string) {
  return Boolean(date && date >= start && date <= end)
}

function expenseStatusLabel(status: string) {
  if (status === 'due_today') return 'Due today'
  if (status === 'partially_paid') return 'Partially paid'
  if (status === 'cancelled') return 'Canceled'
  return status ? status.replaceAll('_', ' ').replace(/^\w/, (value) => value.toUpperCase()) : 'Expected'
}

function statusTone(status: string) {
  if (status === 'paid') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (status === 'overdue') return 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
  if (status === 'due_today' || status === 'partially_paid') return 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (status === 'cancelled') return 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'
  return 'bg-[#caa24c]/10 text-[#8a6527] dark:text-[#e6c77f]'
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[#9a712e] transition hover:bg-[#caa24c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]">{children}</Link>
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block min-w-0 space-y-1.5 ${className}`}><span className="text-xs font-semibold text-[color:var(--portal-muted)]">{label}</span>{children}</label>
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTone(status)}`}>{expenseStatusLabel(status)}</span>
}

function paidInPeriod(expense: ExpenseRow, start: string, end: string) {
  const activity = getLuxorExpenseCashActivityInPeriod(expense, start, end)
  return activity.available ? activity.net : null
}

function expenseDateInPeriod(expense: ExpenseRow, start: string, end: string) {
  return inRange(expense.due_date || expense.incurred_on, start, end)
}

function activeCategories(categories: ExpenseCategory[]) {
  const active = categories.filter((category) => category.is_active).map((category) => category.name)
  return [...new Set(active.length ? active : DEFAULT_CATEGORIES)]
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT_CLASS} ${props.className || ''}`.trim()} />
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/35 px-5 py-10 text-center"><p className="font-semibold text-[color:var(--portal-text)]">{title}</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[color:var(--portal-muted)]">{detail}</p></div>
}

export default function ExpenseManagement({ view, expenseId, embedded = false }: { view: ExpenseManagementView; expenseId?: string; embedded?: boolean }) {
  const router = useRouter()
  const [data, setData] = useState<ExpenseManagementData>({ expenses: [], templates: [], categories: [], bookings: [], bills: [], receipts: [] })
  const [ledger, setLedger] = useState<FinanceLedgerData>({ payments: [], invoices: [], bookings: [], installments: [], refunds: [], eventPaymentsReceivedByBooking: null, eventPaymentsVerified: false })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [firstPaymentIdempotencyKey, setFirstPaymentIdempotencyKey] = useState(() => crypto.randomUUID())
  const [expenseClientRequestId, setExpenseClientRequestId] = useState(() => crypto.randomUUID())
  const [period, setPeriod] = useState('this_month')
  const [trendPeriod, setTrendPeriod] = useState('monthly')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedBooking, setSelectedBooking] = useState('all')
  const [receiptQuery, setReceiptQuery] = useState('')
  const [receiptVendorFilter, setReceiptVendorFilter] = useState('all')
  const [receiptCategoryFilter, setReceiptCategoryFilter] = useState('all')
  const [receiptBookingFilter, setReceiptBookingFilter] = useState('all')
  const [receiptStart, setReceiptStart] = useState('')
  const [receiptEnd, setReceiptEnd] = useState('')
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editExpense, setEditExpense] = useState<ExpenseRow | null>(null)
  const [editTemplate, setEditTemplate] = useState<ExpenseTemplate | null>(null)
  const [expenseForm, setExpenseForm] = useState({
    description: '', amount: '', incurred_on: '', due_date: '', category: '', vendor_name: '', booking_id: '',
    expense_type: 'business', payment_method: '', payment_choice: 'unpaid', first_payment: '', first_payment_date: '', reference_number: '', notes: '', source_bill_id: '', source_bill_occurrence_id: '', bill_review_confirmed: false,
  })
  const [pendingExpenseRequest, setPendingExpenseRequest] = useState<PendingExpenseRequest | null>(null)
  const entryHandled = useRef(false)
  const [templateForm, setTemplateForm] = useState({
    name: '', category: '', vendor_name: '', expected_amount: '', is_variable: false, frequency: 'monthly', custom_interval: '1', custom_unit: 'months',
    first_due_date: '', start_date: '', end_date: '', payment_method: '', notes: '',
  })
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: '', payment_method: '', transaction_type: 'payment', reference_number: '', notes: '', idempotency_key: '' })
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentRetryLocked, setPaymentRetryLocked] = useState(false)
  const [receiptForm, setReceiptForm] = useState({ file: null as File | null, vendor_name: '', transaction_date: '', subtotal_amount: '', total_amount: '', tax_amount: '', category: '', expense_id: '', booking_id: '', notes: '' })
  const [receiptReview, setReceiptReview] = useState<ExpenseReceipt | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryEdit, setCategoryEdit] = useState<{ id: string; name: string } | null>(null)

  const loadData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const responses = await Promise.all([
        fetch('/api/expenses/management', { cache: 'no-store' }),
        view === 'events' || view === 'detail'
          ? fetch('/api/portal/finance-overview-ledgers', { cache: 'no-store' })
          : Promise.resolve(null),
      ])
      if (!responses[0].ok) {
        const failure = await responses[0].json().catch(() => ({})) as { error?: unknown }
        throw new Error(typeof failure.error === 'string' ? failure.error : 'Expense records could not be loaded.')
      }
      const payload = await responses[0].json() as ExpenseManagementData
      setData({
        expenses: Array.isArray(payload.expenses) ? payload.expenses : [],
        templates: Array.isArray(payload.templates) ? payload.templates : [],
        categories: Array.isArray(payload.categories) ? payload.categories : [],
        bookings: Array.isArray(payload.bookings) ? payload.bookings : [],
        bills: Array.isArray(payload.bills) ? payload.bills : [],
        receipts: Array.isArray(payload.receipts) ? payload.receipts : [],
        can_manage_categories: payload.can_manage_categories === true,
      })
      const ledgerResponse = responses[1]
      if (ledgerResponse?.ok) {
        const value = await ledgerResponse.json() as FinanceLedgerData
        setLedger({
          payments: Array.isArray(value.payments) ? value.payments : [],
          invoices: Array.isArray(value.invoices) ? value.invoices : [],
          bookings: Array.isArray(value.bookings) ? value.bookings : [],
          installments: Array.isArray(value.installments) ? value.installments : [],
          refunds: Array.isArray(value.refunds) ? value.refunds : [],
          eventPaymentsReceivedByBooking: value.eventPaymentsReceivedByBooking || null,
          eventPaymentsVerified: value.eventPaymentsVerified === true && Boolean(value.eventPaymentsReceivedByBooking),
        })
      } else if (ledgerResponse) {
        setLedger({ payments: [], invoices: [], bookings: [], installments: [], refunds: [], eventPaymentsReceivedByBooking: null, eventPaymentsVerified: false })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Expense records could not be loaded.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [view])

  useEffect(() => { void loadData() }, [loadData])

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(expenseCreateRetryStorageKey())
      if (!stored) return
      const pending = JSON.parse(stored) as PendingExpenseRequest
      if (!pending.client_request_id || !pending.expense_payload || !pending.form_snapshot) return
      setPendingExpenseRequest(pending)
      setExpenseClientRequestId(pending.client_request_id)
      setExpenseForm((current) => ({ ...current, ...pending.form_snapshot }) as typeof current)
      setExpenseModalOpen(true)
      setNotice('An expense save may not have completed. Retry the unchanged request to resolve it safely.')
    } catch { /* Ignore unavailable or malformed session storage. */ }
  }, [])

  useEffect(() => {
    if (view !== 'events' || loading || error || entryHandled.current) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('add') !== '1') return
    entryHandled.current = true
    const requestedId = url.searchParams.get('bookingId') || ''
    url.searchParams.delete('add')
    url.searchParams.delete('bookingId')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    if (pendingExpenseRequest) {
      setExpenseModalOpen(true)
      setNotice('Resolve the existing expense save before starting another expense.')
      return
    }
    const booking = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedId)
      ? data.bookings.find((item) => item.id.toLowerCase() === requestedId.toLowerCase())
      : undefined
    if (!booking) {
      setNotice('That booking is unavailable. Choose a booking before adding an expense.')
      return
    }
    setSelectedBooking(booking.id)
    setExpenseForm({ description: '', amount: '', incurred_on: '', due_date: '', category: '', vendor_name: '', booking_id: booking.id,
      expense_type: 'event', payment_method: '', payment_choice: 'unpaid', first_payment: '', first_payment_date: '', reference_number: '', notes: '', source_bill_id: '', source_bill_occurrence_id: '', bill_review_confirmed: false })
    setExpenseClientRequestId(crypto.randomUUID())
    setFirstPaymentIdempotencyKey(crypto.randomUUID())
    setEditExpense(null)
    setExpenseModalOpen(true)
  }, [view, loading, error, data.bookings, pendingExpenseRequest])

  const page = VIEW_DETAILS[view]
  const activeView = view === 'detail' ? 'business' : view
  const categories = useMemo(() => activeCategories(data.categories), [data.categories])
  const categoryOptions = useMemo(() => categories.map((name) => ({ value: name, label: name })), [categories])
  const approvedBills = useMemo(() => data.bills.filter((bill) => bill.payment_ready_at && bill.extraction_status === 'ready' && bill.amount_state === 'known' && Number.isFinite(Number(bill.amount)) && Number(bill.amount) >= 0 && bill.status !== 'paid' && !data.expenses.some((expense) => expense.source_bill_id === bill.id)), [data.bills, data.expenses])
  const variableOccurrenceOptions = useMemo(() => data.expenses.filter((expense) => !hasKnownAmount(expense) && !expense.source_bill_id && expense.status !== 'cancelled' && Boolean(expense.recurring_template_id) && data.templates.some((template) => template.id === expense.recurring_template_id && template.is_variable)).map((expense) => ({ value: expense.id, label: `${expense.description || expense.category} · ${formatDate(expense.due_date || expense.incurred_on)} · ${expense.vendor_name || 'Vendor not set'}` })), [data.expenses, data.templates])
  const selectedExpense = useMemo(() => data.expenses.find((expense) => expense.id === expenseId) || null, [data.expenses, expenseId])
  const selectedExpenseId = selectedExpense?.id
  const bookingById = useMemo(() => new Map(data.bookings.map((booking) => [booking.id, booking])), [data.bookings])

  useEffect(() => {
    if (view !== 'detail' || !selectedExpenseId) return
    try {
      const retry = window.sessionStorage.getItem(paymentRetryStorageKey(selectedExpenseId))
      if (!retry) return
      const pending = JSON.parse(retry) as typeof paymentForm
      if (!pending.idempotency_key || !pending.amount || !pending.payment_date) return
      setPaymentForm(pending)
      setPaymentRetryLocked(true)
      setPaymentOpen(true)
      setNotice('A payment result is uncertain. Retry this exact transaction or reconcile its saved status before editing it.')
    } catch { /* Ignore unavailable or invalid session storage. */ }
  }, [view, selectedExpenseId])

  const periodRange = useMemo(() => periodBounds(period, customStart, customEnd), [period, customStart, customEnd])
  const periodExpenses = useMemo(() => data.expenses.filter((expense) => expense.status !== 'cancelled' && expenseDateInPeriod(expense, periodRange.start, periodRange.end)), [data.expenses, periodRange])
  const paidSummary = useMemo(() => data.expenses.reduce((summary, expense) => {
    const net = paidInPeriod(expense, periodRange.start, periodRange.end)
    if (net === null) return { total: summary.total, excluded: summary.excluded + 1 }
    return { total: summary.total + net, excluded: summary.excluded }
  }, { total: 0, excluded: 0 }), [data.expenses, periodRange])
  const paidTotal = paidSummary.total
  const paidExcluded = paidSummary.excluded
  const overdueTotal = useMemo(() => periodExpenses.filter((expense) => expense.payment_status === 'overdue' && hasKnownAmount(expense)).reduce((sum, expense) => sum + Math.max(0, Number(expense.remaining_balance) || 0), 0), [periodExpenses])
  const upcomingTotal = useMemo(() => periodExpenses.filter((expense) => ['expected', 'due_today', 'partially_paid'].includes(expense.payment_status) && hasKnownAmount(expense)).reduce((sum, expense) => sum + Math.max(0, Number(expense.remaining_balance) || 0), 0), [periodExpenses])
  const unpaidTotal = overdueTotal + upcomingTotal
  const monthlyFixed = useMemo(() => data.templates.filter((template) => template.is_active && !template.is_variable && template.expected_amount !== null).reduce((sum, template) => {
    const amount = Number(template.expected_amount) || 0
    const multiplier: Record<string, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, annually: 1 / 12, custom: template.custom_unit === 'days' ? 30 / Math.max(1, Number(template.custom_interval) || 1) : template.custom_unit === 'weeks' ? 4.33 / Math.max(1, Number(template.custom_interval) || 1) : template.custom_unit === 'years' ? 1 / (12 * Math.max(1, Number(template.custom_interval) || 1)) : 1 / (Math.max(1, Number(template.custom_interval) || 1) * 12) }
    return sum + amount * (multiplier[template.frequency] ?? 1)
  }, 0), [data.templates])
  const variableTotal = useMemo(() => periodExpenses.filter((expense) => hasKnownAmount(expense) && expense.recurring_template_id && data.templates.find((template) => template.id === expense.recurring_template_id)?.is_variable).reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0), [periodExpenses, data.templates])
  const unknownVariableCount = useMemo(() => periodExpenses.filter((expense) => !hasKnownAmount(expense) && expense.recurring_template_id && data.templates.find((template) => template.id === expense.recurring_template_id)?.is_variable).length, [periodExpenses, data.templates])
  const eventTotal = useMemo(() => periodExpenses.filter((expense) => hasKnownAmount(expense) && (expense.expense_type === 'event' || expense.booking_id)).reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0), [periodExpenses])
  const recentExpenses = useMemo(() => [...data.expenses].filter((expense) => expense.status !== 'cancelled').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 6), [data.expenses])

  const refresh = () => { void loadData(true) }
  const setExpenseField = <K extends keyof typeof expenseForm>(key: K, value: (typeof expenseForm)[K]) => {
    if (pendingExpenseRequest) return
    setExpenseClientRequestId(crypto.randomUUID())
    setFirstPaymentIdempotencyKey(crypto.randomUUID())
    setExpenseForm((current) => ({ ...current, [key]: value }))
  }
  const setPaymentField = <K extends keyof typeof paymentForm>(key: K, value: (typeof paymentForm)[K]) => {
    if (paymentRetryLocked) return
    setPaymentForm((current) => ({ ...current, [key]: value, idempotency_key: crypto.randomUUID() }))
  }

  async function reconcilePaymentRetry() {
    if (!selectedExpense || !paymentRetryLocked || !paymentForm.idempotency_key) return
    setBusy(true); setNotice(null)
    try {
      const response = await fetch('/api/expenses/management', { cache: 'no-store' })
      const payload = await response.json() as ExpenseManagementData
      if (!response.ok) throw new Error(payload && 'error' in payload ? String(payload.error) : 'Payment status could not be checked.')
      const freshExpense = payload.expenses?.find((expense) => expense.id === selectedExpense.id)
      const retryResult = reconcileLuxorExpensePaymentRetry(freshExpense?.payments || [], paymentForm)
      setData({
        expenses: Array.isArray(payload.expenses) ? payload.expenses : [],
        templates: Array.isArray(payload.templates) ? payload.templates : [],
        categories: Array.isArray(payload.categories) ? payload.categories : [],
        bookings: Array.isArray(payload.bookings) ? payload.bookings : [],
        bills: Array.isArray(payload.bills) ? payload.bills : [],
        receipts: Array.isArray(payload.receipts) ? payload.receipts : [],
        can_manage_categories: payload.can_manage_categories === true,
      })
      if (retryResult.clearSavedRequest) {
        try { window.sessionStorage.removeItem(paymentRetryStorageKey(selectedExpense.id)) } catch { /* storage may be unavailable */ }
      }
      setPaymentRetryLocked(retryResult.keepLocked)
      if (retryResult.status === 'conflict') {
        setNotice('This request key is already attached to different transaction details. The form remains locked for review.')
        return
      }
      if (retryResult.status === 'confirmed') {
        setPaymentOpen(false)
        setNotice('The saved transaction was found and confirmed. No second payment was created.')
      } else {
        setPaymentRetryLocked(true)
        setNotice('No saved transaction is visible yet. The original request may still complete; retry the locked exact request to resolve it.')
      }
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Payment status could not be checked.') }
    finally { setBusy(false) }
  }
  const resetExpenseForm = (expenseType: string, sourceBill?: ExpenseBill | null) => setExpenseForm({
    description: sourceBill?.service || '', amount: sourceBill ? String(sourceBill.amount) : '', incurred_on: sourceBill?.issue_date || sourceBill?.due_date || '', due_date: sourceBill?.due_date || '', category: sourceBill?.bill_category || '', vendor_name: sourceBill?.provider || '', booking_id: '', expense_type: expenseType, payment_method: '', payment_choice: 'unpaid', first_payment: '', first_payment_date: '', reference_number: sourceBill ? `Bill ${sourceBill.id.slice(0, 8)}` : '', notes: sourceBill ? 'Owner-reviewed bill imported from invoice intake.' : '', source_bill_id: sourceBill?.id || '', source_bill_occurrence_id: '', bill_review_confirmed: false,
  })

  async function submitExpense(event: React.FormEvent) {
    event.preventDefault()
    const matchedOccurrence = expenseForm.source_bill_occurrence_id ? data.expenses.find((expense) => expense.id === expenseForm.source_bill_occurrence_id) || null : null
    const targetExpense = editExpense || matchedOccurrence
    if (!expenseForm.incurred_on || !expenseForm.category || !expenseForm.vendor_name.trim() || !expenseForm.payment_method) { setNotice('Enter the expense date, category, vendor, and payment method before saving.'); return }
    if (expenseForm.expense_type === 'event' && !expenseForm.booking_id) { setNotice('Choose the booking for this event expense.'); return }
    if (expenseForm.source_bill_id && !expenseForm.bill_review_confirmed) { setNotice('Confirm that you reviewed this bill before linking it.'); return }
    if ((expenseForm.payment_choice === 'paid' || expenseForm.payment_choice === 'partial') && !expenseForm.first_payment_date) { setNotice('Choose the date the initial payment was actually made.'); return }
    if (expenseForm.first_payment_date && expenseForm.first_payment_date > todayKey()) { setNotice('A future date cannot be recorded as a completed payment.'); return }
    const sourceBillChanged = Boolean(expenseForm.source_bill_id && expenseForm.source_bill_id !== targetExpense?.source_bill_id)
    const paymentAmount = expenseForm.payment_choice === 'paid'
      ? Number(expenseForm.amount)
      : expenseForm.payment_choice === 'partial' ? Number(expenseForm.first_payment) : 0
    const form: Record<string, unknown> = {
      description: expenseForm.description,
      amount: Number(expenseForm.amount),
      incurred_on: expenseForm.incurred_on,
      due_date: expenseForm.due_date || null,
      category: expenseForm.category,
      vendor_name: expenseForm.vendor_name,
      booking_id: expenseForm.expense_type === 'event' ? expenseForm.booking_id || null : null,
      expense_type: expenseForm.expense_type,
      payment_method: expenseForm.payment_method || null,
      reference_number: expenseForm.reference_number || null,
      notes: expenseForm.notes || null,
      ...(!targetExpense ? { status: expenseForm.payment_choice === 'unpaid' && expenseForm.due_date > todayKey() ? 'planned' : 'incurred' } : {}),
      ...(sourceBillChanged ? { source_bill_id: expenseForm.source_bill_id, confirm_source_bill: expenseForm.bill_review_confirmed } : {}),
    }
    let createRequest: PendingExpenseRequest | null = null
    if (!targetExpense) {
      const initialPaymentPayload = paymentAmount > 0 ? {
        amount: paymentAmount,
        payment_date: expenseForm.first_payment_date,
        payment_method: expenseForm.payment_method,
        transaction_type: 'payment',
        reference_number: expenseForm.reference_number || null,
        notes: expenseForm.payment_choice === 'partial' ? 'Initial partial payment' : null,
        idempotency_key: firstPaymentIdempotencyKey,
      } : null
      createRequest = pendingExpenseRequest || {
        client_request_id: expenseClientRequestId,
        expense_payload: { ...form, client_request_id: expenseClientRequestId },
        form_snapshot: { ...expenseForm },
        first_payment_payload: initialPaymentPayload,
      }
      setPendingExpenseRequest(createRequest)
      try { window.sessionStorage.setItem(expenseCreateRetryStorageKey(), JSON.stringify(createRequest)) } catch { /* In-memory retry still uses the immutable payload. */ }
    }
    setBusy(true); setNotice(null)
    try {
      const response = await fetch(targetExpense ? `/api/expenses/${encodeURIComponent(targetExpense.id)}` : '/api/expenses/management', {
        method: targetExpense ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createRequest?.expense_payload || form),
      })
      const saved = await response.json().catch(() => ({})) as { id?: string; expense_id?: string; existing_expense_id?: string; error?: string; expense?: { id?: string }; replayed?: boolean }
      if (!response.ok) {
        const existingExpenseId = saved.expense_id || saved.existing_expense_id || saved.expense?.id
        if (existingExpenseId && response.status === 409) {
          try { window.sessionStorage.removeItem(expenseCreateRetryStorageKey()) } catch { /* storage may be unavailable */ }
          setPendingExpenseRequest(null); setExpenseModalOpen(false); setEditExpense(null)
          setNotice('This request key is already linked to a saved expense. Opening that record to prevent a duplicate.')
          router.push(`/portal/finances/expenses/${encodeURIComponent(existingExpenseId)}`)
          return
        }
        if (!targetExpense && response.status >= 500) {
          setNotice('The save result is uncertain. Retry the locked, unchanged request to resolve it safely.')
          return
        }
        if (!targetExpense) {
          try { window.sessionStorage.removeItem(expenseCreateRetryStorageKey()) } catch { /* storage may be unavailable */ }
          setPendingExpenseRequest(null)
          setExpenseClientRequestId(crypto.randomUUID()); setFirstPaymentIdempotencyKey(crypto.randomUUID())
        }
        setNotice(saved.error || 'Expense could not be saved.')
        return
      }
      const savedExpenseId = saved.id || saved.expense?.id
      if (!savedExpenseId) {
        setNotice('The server accepted the request but did not return the saved expense ID. Retry the same locked request to resolve it.')
        return
      }
      if (!targetExpense) {
        try { window.sessionStorage.removeItem(expenseCreateRetryStorageKey()) } catch { /* storage may be unavailable */ }
        setPendingExpenseRequest(null)
      }
      const initialPaymentPayload = createRequest?.first_payment_payload || (paymentAmount > 0 ? {
        amount: paymentAmount, payment_date: expenseForm.first_payment_date, payment_method: expenseForm.payment_method,
        transaction_type: 'payment', reference_number: expenseForm.reference_number || null,
        notes: expenseForm.payment_choice === 'partial' ? 'Initial partial payment' : null,
        idempotency_key: firstPaymentIdempotencyKey,
      } : null)
      if (initialPaymentPayload) {
        const paymentBody = initialPaymentPayload
        const paymentRetryKey = paymentRetryStorageKey(savedExpenseId)
        try {
          try { window.sessionStorage.setItem(paymentRetryKey, JSON.stringify(paymentBody)) } catch { /* In-memory exact replay remains available. */ }
          const paymentResponse = await fetch(`/api/expenses/${encodeURIComponent(savedExpenseId)}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(paymentBody) })
          if (!paymentResponse.ok) {
            const paymentError = await paymentResponse.json().catch(() => ({})) as { error?: string }
            if (paymentResponse.status < 500) {
              try { window.sessionStorage.removeItem(paymentRetryKey) } catch { /* storage may be unavailable */ }
              setPaymentRetryLocked(false)
              setExpenseModalOpen(false); setEditExpense(null)
              setNotice(`Expense saved, but the payment was rejected: ${paymentError.error || 'review the payment details from the expense record.'}`)
              await loadData(true)
              router.push(`/portal/finances/expenses/${encodeURIComponent(savedExpenseId)}`)
              return
            }
            throw new Error(paymentError.error || 'the payment result is uncertain.')
          }
          try { window.sessionStorage.removeItem(paymentRetryKey) } catch { /* storage may be unavailable */ }
        } catch (paymentCause) {
          setPaymentRetryLocked(true)
          setExpenseModalOpen(false); setEditExpense(null)
          setNotice(`Expense saved, but its payment result is uncertain: ${paymentCause instanceof Error ? paymentCause.message : 'the request did not complete.'}`)
          await loadData(true)
          router.push(`/portal/finances/expenses/${encodeURIComponent(savedExpenseId)}`)
          return
        }
      }
      setExpenseModalOpen(false); setEditExpense(null); setNotice(targetExpense ? 'Expense updated. Its correction is recorded in the audit history.' : 'Expense recorded.')
      await loadData(true)
      if (paymentAmount > 0) router.push(`/portal/finances/expenses/${encodeURIComponent(savedExpenseId)}`)
    } catch (cause) {
      setNotice(pendingExpenseRequest || !targetExpense ? 'The expense save result is uncertain. Retry the unchanged request to resolve it safely.' : cause instanceof Error ? cause.message : 'Expense could not be saved.')
    } finally { setBusy(false) }
  }

  async function submitTemplate(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null)
    const payload = {
      name: templateForm.name.trim(), category: templateForm.category, vendor_name: templateForm.vendor_name || null,
      expected_amount: templateForm.is_variable ? null : Number(templateForm.expected_amount), is_variable: templateForm.is_variable,
      frequency: templateForm.frequency, custom_interval: templateForm.frequency === 'custom' ? Number(templateForm.custom_interval) : null,
      custom_unit: templateForm.frequency === 'custom' ? templateForm.custom_unit : null, first_due_date: templateForm.first_due_date,
      start_date: templateForm.start_date, end_date: templateForm.end_date || null, payment_method: templateForm.payment_method || null,
      notes: templateForm.notes || null,
    }
    try {
      const response = await fetch(editTemplate ? `/api/expenses/templates/${encodeURIComponent(editTemplate.id)}` : '/api/expenses/templates', {
        method: editTemplate ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Recurring template could not be saved.')
      setTemplateModalOpen(false); setEditTemplate(null); setNotice(editTemplate ? 'Template updated for future occurrences.' : 'Recurring template saved; upcoming occurrences are being generated.')
      await loadData(true)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Recurring template could not be saved.') }
    finally { setBusy(false) }
  }

  async function toggleTemplate(template: ExpenseTemplate) {
    setBusy(true); setNotice(null)
    try {
      const response = await fetch(`/api/expenses/templates/${encodeURIComponent(template.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !template.is_active }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Template could not be updated.')
      setNotice(template.is_active ? 'Template deactivated. Existing occurrences remain in the ledger.' : 'Template activated.')
      await loadData(true)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Template could not be updated.') }
    finally { setBusy(false) }
  }

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedExpense) return
    if (!paymentForm.payment_date || !paymentForm.payment_method) { setNotice('Choose the transaction date and payment method.'); return }
    if (paymentForm.payment_date > todayKey()) { setNotice('A future date cannot be recorded as a completed payment.'); return }
    setBusy(true); setNotice(null)
    const submission = { ...paymentForm, idempotency_key: paymentForm.idempotency_key || crypto.randomUUID() }
    setPaymentForm(submission)
    try { window.sessionStorage.setItem(paymentRetryStorageKey(selectedExpense.id), JSON.stringify(submission)) } catch { /* In-memory exact replay remains available. */ }
    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(selectedExpense.id)}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(submission.amount), payment_date: submission.payment_date, payment_method: submission.payment_method, transaction_type: submission.transaction_type, reference_number: submission.reference_number || null, notes: submission.notes || null, idempotency_key: submission.idempotency_key }),
      })
      const result = await response.json()
      if (!response.ok) {
        const failure = getLuxorExpensePaymentPostFailureDisposition(response.status, typeof result.code === 'string' ? result.code : null)
        if (failure.clearSavedRequest) {
          try { window.sessionStorage.removeItem(paymentRetryStorageKey(selectedExpense.id)) } catch { /* storage may be unavailable */ }
        }
        setPaymentRetryLocked(failure.keepLocked)
        if (failure.idempotencyConflict) {
          setNotice('This request key is already attached to a different transaction. The original request remains locked; review its saved status before continuing.')
          return
        }
        if (!failure.keepLocked) {
          setNotice(result.error || 'The transaction was rejected. Review its details and try again.')
          return
        }
        setNotice(result.error || 'The transaction result is uncertain. Retry this exact request or reconcile its saved status.')
        return
      }
      try { window.sessionStorage.removeItem(paymentRetryStorageKey(selectedExpense.id)) } catch { /* storage may be unavailable */ }
      setPaymentRetryLocked(false)
      setPaymentOpen(false); setPaymentForm({ amount: '', payment_date: '', payment_method: '', transaction_type: 'payment', reference_number: '', notes: '', idempotency_key: '' })
      setNotice(paymentForm.transaction_type === 'payment' ? 'Payment recorded.' : 'Adjustment recorded and retained in the transaction history.')
      await loadData(true)
    } catch (cause) {
      setPaymentRetryLocked(true)
      setNotice(`The transaction result is uncertain: ${cause instanceof Error ? cause.message : 'the request did not complete.'} Retry this exact request or reconcile its saved status.`)
    }
    finally { setBusy(false) }
  }

  async function cancelExpense(expense: ExpenseRow) {
    if (!window.confirm(`Cancel “${expense.description || 'this expense'}”? It will remain in the ledger history.`)) return
    setBusy(true); setNotice(null)
    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(expense.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Expense could not be canceled.')
      setNotice('Expense canceled. Its history is preserved.')
      await loadData(true)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Expense could not be canceled.') }
    finally { setBusy(false) }
  }

  async function submitReceipt(event: React.FormEvent) {
    event.preventDefault()
    if (!receiptForm.file) { setNotice('Choose a JPG, PNG, or PDF receipt to upload.'); return }
    const subtotal = receiptForm.subtotal_amount ? Number(receiptForm.subtotal_amount) : null
    const tax = receiptForm.tax_amount ? Number(receiptForm.tax_amount) : null
    const total = receiptForm.total_amount ? Number(receiptForm.total_amount) : null
    if (subtotal !== null && tax !== null && total !== null && subtotal + tax > total + 0.01) { setNotice('Subtotal plus tax cannot be greater than the receipt total.'); return }
    setBusy(true); setNotice(null)
    try {
      const body = new FormData()
      body.append('file', receiptForm.file)
      body.append('vendor_name', receiptForm.vendor_name)
      body.append('transaction_date', receiptForm.transaction_date)
      body.append('subtotal_amount', receiptForm.subtotal_amount)
      body.append('total_amount', receiptForm.total_amount)
      body.append('tax_amount', receiptForm.tax_amount)
      body.append('category', receiptForm.category)
      body.append('expense_id', receiptForm.expense_id)
      body.append('booking_id', receiptForm.booking_id)
      body.append('notes', receiptForm.notes)
      const response = await fetch('/api/expenses/receipts', { method: 'POST', body })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Receipt could not be uploaded.')
      setReceiptReview(result.receipt || result.document || result)
      const duplicateWarning = typeof result.duplicate_warning === 'string' ? result.duplicate_warning : Array.isArray(result.duplicate_warning) ? result.duplicate_warning.join(' · ') : ''
      setNotice(duplicateWarning ? `Possible duplicate: ${duplicateWarning}. The receipt was uploaded so you can confirm whether it is a repeat purchase.` : 'Receipt uploaded. Review its details before attaching it to an expense.')
      setReceiptForm({ file: null, vendor_name: '', transaction_date: '', subtotal_amount: '', total_amount: '', tax_amount: '', category: '', expense_id: '', booking_id: '', notes: '' })
      await loadData(true)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Receipt could not be uploaded.') }
    finally { setBusy(false) }
  }

  async function saveReceiptReview(event: React.FormEvent) {
    event.preventDefault()
    if (!receiptReview) return
    const hasSubtotal = String(receiptReview.metadata?.subtotal_amount ?? '').trim() !== ''
    const hasTax = String(receiptReview.metadata?.tax_amount ?? '').trim() !== ''
    const hasTotal = String(receiptReview.metadata?.total_amount ?? '').trim() !== ''
    const subtotal = Number(receiptReview.metadata?.subtotal_amount || 0)
    const tax = Number(receiptReview.metadata?.tax_amount || 0)
    const total = Number(receiptReview.metadata?.total_amount || 0)
    if (hasSubtotal && hasTax && hasTotal && subtotal + tax > total + 0.01) { setNotice('Subtotal plus tax cannot be greater than the receipt total.'); return }
    setBusy(true); setNotice(null)
    try {
      const response = await fetch(`/api/expenses/receipts/${encodeURIComponent(receiptReview.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_name: String(receiptReview.metadata?.vendor_name || ''), transaction_date: String(receiptReview.metadata?.transaction_date || ''), subtotal_amount: String(receiptReview.metadata?.subtotal_amount || ''), total_amount: String(receiptReview.metadata?.total_amount || ''), tax_amount: String(receiptReview.metadata?.tax_amount || ''), category: String(receiptReview.metadata?.category || ''), expense_id: receiptReview.expense_id || '', booking_id: String(receiptReview.metadata?.booking_id || ''), notes: String(receiptReview.metadata?.notes || ''), confirm_extracted: true }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Receipt details could not be saved.')
      setReceiptReview(null); setNotice('Receipt details saved.')
      await loadData(true)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Receipt details could not be saved.') }
    finally { setBusy(false) }
  }

  async function createCategory(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null)
    try {
      const response = await fetch('/api/expenses/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: categoryName }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Category could not be saved.')
      setCategoryName(''); setCategoryModalOpen(false); setNotice('Category added.')
      await loadData(true)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Category could not be saved.') }
    finally { setBusy(false) }
  }

  async function renameCategory() {
    if (!categoryEdit) return
    const name = categoryEdit.name.trim()
    if (!name) { setNotice('Enter a category name.'); return }
    setBusy(true); setNotice(null)
    try {
      const response = await fetch(`/api/expenses/categories/${encodeURIComponent(categoryEdit.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Category could not be renamed.')
      setCategoryEdit(null); setNotice('Category renamed. Historical expenses remain attached to their saved category records.')
      await loadData(true)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Category could not be renamed.') }
    finally { setBusy(false) }
  }

  function openNewExpense(expenseType: 'business' | 'event', bill?: ExpenseBill | null) {
    if (pendingExpenseRequest) {
      setExpenseModalOpen(true)
      setNotice('Resolve the existing expense save before starting another expense.')
      return
    }
    resetExpenseForm(expenseType, bill || null)
    setFirstPaymentIdempotencyKey(crypto.randomUUID())
    setExpenseClientRequestId(crypto.randomUUID())
    setEditExpense(null); setExpenseModalOpen(true)
  }

  function openPaymentForExpense(expense: ExpenseRow | null) {
    if (!expense) return
    try {
      const retry = window.sessionStorage.getItem(paymentRetryStorageKey(expense.id))
      if (retry) {
        setPaymentForm(JSON.parse(retry) as typeof paymentForm)
        setPaymentRetryLocked(true)
        setPaymentOpen(true)
        return
      }
    } catch { /* Open a fresh payment form if retry state is unavailable. */ }
    setPaymentRetryLocked(false)
    setPaymentForm({ amount: String(expense.remaining_balance || ''), payment_date: todayKey(), payment_method: expense.payment_method || '', transaction_type: 'payment', reference_number: '', notes: '', idempotency_key: crypto.randomUUID() })
    setPaymentOpen(true)
  }

  function openEditExpense(expense: ExpenseRow) {
    setEditExpense(expense)
    setExpenseForm({ description: expense.description || '', amount: hasKnownAmount(expense) ? String(expense.amount || '') : '', incurred_on: expense.incurred_on || '', due_date: expense.due_date || '', category: expense.category, vendor_name: expense.vendor_name || '', booking_id: expense.booking_id || '', expense_type: expense.expense_type || (expense.booking_id ? 'event' : 'business'), payment_method: expense.payment_method || '', payment_choice: 'unpaid', first_payment: '', first_payment_date: '', reference_number: expense.reference_number || '', notes: expense.notes || '', source_bill_id: expense.source_bill_id || '', source_bill_occurrence_id: '', bill_review_confirmed: false })
    setExpenseModalOpen(true)
  }

  async function skipOccurrence(expense: ExpenseRow) {
    if (expense.paid_amount > 0) { setNotice('An occurrence with recorded payments cannot be skipped. Record an appropriate adjustment instead.'); return }
    if (!window.confirm(`Skip the ${expense.description || 'recurring expense'} period due ${formatDate(expense.due_date)}? The template and history will remain.`)) return
    setBusy(true); setNotice(null)
    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(expense.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Occurrence could not be skipped.')
      setNotice('Recurring occurrence skipped. The template and historical record remain.')
      await loadData(true)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Occurrence could not be skipped.') }
    finally { setBusy(false) }
  }

  function openNewTemplate(template?: ExpenseTemplate) {
    setEditTemplate(template || null)
    setTemplateForm(template ? {
      name: template.name, category: template.category, vendor_name: template.vendor_name || '', expected_amount: template.expected_amount === null ? '' : String(template.expected_amount), is_variable: template.is_variable, frequency: template.frequency,
      custom_interval: String(template.custom_interval || 1), custom_unit: template.custom_unit || 'months', first_due_date: template.first_due_date, start_date: template.start_date, end_date: template.end_date || '', payment_method: template.payment_method || '', notes: template.notes || '',
    } : { name: '', category: '', vendor_name: '', expected_amount: '', is_variable: false, frequency: 'monthly', custom_interval: '1', custom_unit: 'months', first_due_date: '', start_date: '', end_date: '', payment_method: '', notes: '' })
    setTemplateModalOpen(true)
  }

  function navigateTab(next: Exclude<ExpenseManagementView, 'detail'>) {
    const paths: Record<Exclude<ExpenseManagementView, 'detail'>, string> = {
      dashboard: '/portal/finances/expenses', recurring: '/portal/finances/expenses/recurring', business: '/portal/finances/expenses/business', events: '/portal/finances/expenses/events', receipts: '/portal/finances/expenses/receipts',
    }
    router.push(paths[next])
  }

  const headerActions = <div className="flex flex-wrap items-center justify-end gap-2">
    <button type="button" onClick={() => setBrowseOpen(true)} aria-haspopup="dialog" aria-expanded={browseOpen} aria-label={`Browse views. Currently viewing ${page.title}`} className="hidden min-h-10 items-center gap-2.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3.5 py-1.5 text-left text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/45 hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 md:inline-flex xl:hidden">
      <CalendarBlank size={16} className="shrink-0 text-[#a8792f]" aria-hidden="true" />
      <span className="min-w-0"><span className="block text-[8px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Browse views</span><span className="mt-0.5 block max-w-[170px] truncate text-xs font-bold leading-tight">{page.title}</span></span>
      <span aria-hidden="true" className="text-[color:var(--portal-muted)]">⌄</span>
    </button>
    <PortalButton type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh expense records"><ArrowClockwise size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh</PortalButton>
    {view === 'recurring' ? <PortalButton type="button" variant="primary" onClick={() => openNewTemplate()}><Plus size={15} /> Add template</PortalButton> : null}
    {view === 'business' || view === 'dashboard' ? <PortalButton type="button" variant="primary" onClick={() => openNewExpense('business')}><Plus size={15} /> Log expense</PortalButton> : null}
    {view === 'events' ? <PortalButton type="button" variant="primary" onClick={() => openNewExpense('event')}><Plus size={15} /> Add event expense</PortalButton> : null}
    {view === 'receipts' ? <PortalButton type="button" variant="primary" onClick={() => document.getElementById('expense-receipt-file')?.click()}><UploadSimple size={15} /> Upload receipt</PortalButton> : null}
  </div>

  const detailName = selectedExpense?.description || 'Expense detail'

  return <PortalPageFrame className="flex h-full min-h-0 flex-col gap-4 overflow-hidden max-md:pt-4">
    {!embedded && <PortalPageHeader icon={page.icon} title={view === 'detail' ? detailName : page.title} description={page.description} mobileActionsInline actions={headerActions} />}
    {!embedded && <div className="md:hidden">
      <button type="button" onClick={() => setBrowseOpen(true)} aria-haspopup="dialog" aria-expanded={browseOpen} className="flex w-full items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 text-left text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/45">
        <CalendarBlank size={18} className="shrink-0 text-[#a8792f]" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Browse views</span><span className="mt-0.5 block truncate text-sm font-bold">{page.title}</span></span>
        <span aria-hidden="true" className="text-[color:var(--portal-muted)]">⌄</span>
      </button>
    </div>}
    <FinanceBrowseViews open={browseOpen} close={() => setBrowseOpen(false)} currentView={page.browse} />
    {embedded && <div className="flex justify-end">{headerActions}</div>}
    {!embedded && <nav aria-label="Expense management views" className="hidden xl:block">
      <PortalAnimatedTabs tabs={EXPENSE_TABS} activeTab={activeView as Exclude<ExpenseManagementView, 'detail'>} onTabChange={navigateTab} ariaLabel="Expense management views" className="flex min-w-max items-center gap-1 overflow-x-auto portal-scrollbar" />
    </nav>}
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-6 portal-scrollbar">
      {notice ? <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-sm text-[color:var(--portal-text)]"><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)} className="rounded p-1 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)]"><X size={14} /></button></div> : null}
      {error ? <div role="alert" className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-300"><p className="font-semibold">Expense records are unavailable</p><p className="mt-1">{error}</p><button type="button" onClick={refresh} className="mt-3 font-semibold underline underline-offset-2">Try again</button></div> : null}
      {loading && !data.expenses.length ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className={`${CARD_CLASS} p-5`}><PortalSkeleton className="h-3 w-28 rounded" /><PortalSkeleton className="mt-4 h-7 w-32 rounded" /><PortalSkeleton className="mt-3 h-3 w-40 rounded" /></div>)}</div><div className={`${CARD_CLASS} p-5`}><PortalSkeleton className="h-5 w-48 rounded" /><PortalSkeleton className="mt-5 h-52 w-full rounded-xl" /></div></div> : null}
      {!loading && !error ? <PortalTabTransition activeKey={view}>
        {view === 'dashboard' ? <DashboardView data={data} period={period} setPeriod={setPeriod} periodRange={periodRange} customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd} trendPeriod={trendPeriod} setTrendPeriod={setTrendPeriod} paidTotal={paidTotal} paidExcluded={paidExcluded} unpaidTotal={unpaidTotal} overdueTotal={overdueTotal} upcomingTotal={upcomingTotal} monthlyFixed={monthlyFixed} variableTotal={variableTotal} unknownVariableCount={unknownVariableCount} eventTotal={eventTotal} recentExpenses={recentExpenses} bookingById={bookingById} /> : null}
        {view === 'recurring' ? <RecurringView data={data} busy={busy} onAdd={() => openNewTemplate()} onEdit={openNewTemplate} onToggle={toggleTemplate} onViewExpense={(id) => router.push(`/portal/finances/expenses/${encodeURIComponent(id)}`)} onEditExpense={openEditExpense} onSkip={skipOccurrence} /> : null}
        {view === 'business' ? <BusinessView data={data} categoryOptions={categoryOptions} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} query={query} setQuery={setQuery} onAdd={() => openNewExpense('business')} onImportBill={(bill) => openNewExpense('business', bill)} onEdit={openEditExpense} onCancel={cancelExpense} onOpen={(id) => router.push(`/portal/finances/expenses/${encodeURIComponent(id)}`)} onManageCategories={() => setCategoryModalOpen(true)} loading={loading} /> : null}
        {view === 'events' ? <EventExpensesView data={data} ledger={ledger} selectedBooking={selectedBooking} setSelectedBooking={setSelectedBooking} onAdd={(id) => { if (!id) { setNotice('Choose a booking before adding an event expense.'); return } if (pendingExpenseRequest) { setExpenseModalOpen(true); setNotice('Resolve the existing expense save before starting another expense.'); return } openNewExpense('event'); setExpenseField('booking_id', id) }} /> : null}
        {view === 'receipts' ? <ReceiptsView data={data} categories={categoryOptions} receiptQuery={receiptQuery} setReceiptQuery={setReceiptQuery} vendorFilter={receiptVendorFilter} setVendorFilter={setReceiptVendorFilter} categoryFilter={receiptCategoryFilter} setCategoryFilter={setReceiptCategoryFilter} bookingFilter={receiptBookingFilter} setBookingFilter={setReceiptBookingFilter} start={receiptStart} setStart={setReceiptStart} end={receiptEnd} setEnd={setReceiptEnd} form={receiptForm} setForm={setReceiptForm} onSubmit={submitReceipt} receiptReview={receiptReview} setReceiptReview={setReceiptReview} onSaveReview={saveReceiptReview} busy={busy} /> : null}
        {view === 'detail' ? <ExpenseDetailView expense={selectedExpense} data={data} booking={selectedExpense?.booking_id ? bookingById.get(selectedExpense.booking_id) || null : null} onBack={() => router.back()} onEdit={selectedExpense ? () => openEditExpense(selectedExpense) : undefined} onCancel={selectedExpense ? () => void cancelExpense(selectedExpense) : undefined} onPay={() => openPaymentForExpense(selectedExpense)} onOpenAdjust={() => { setPaymentForm({ amount: '', payment_date: todayKey(), payment_method: selectedExpense?.payment_method || '', transaction_type: 'refund', reference_number: '', notes: '', idempotency_key: crypto.randomUUID() }); setPaymentRetryLocked(false); setPaymentOpen(true) }} /> : null}
      </PortalTabTransition> : null}
    </div>

    <PortalModal isOpen={expenseModalOpen} onClose={() => { setExpenseModalOpen(false); setEditExpense(null) }} title={pendingExpenseRequest ? 'Resolve expense save' : editExpense ? 'Edit expense' : expenseForm.expense_type === 'event' ? 'Add event expense' : 'Log business expense'} description={pendingExpenseRequest ? 'The saved form is locked until the same request is confirmed.' : editExpense ? 'Corrections are recorded alongside the saved expense history.' : 'Save the expense first. Payments are recorded as separate transactions.'} maxWidth="max-w-2xl" fullScreenOnMobile>
      <form onSubmit={submitExpense} className="space-y-4">
        {pendingExpenseRequest ? <p role="status" className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-5 text-[color:var(--portal-text)]">This submission may already have been saved. The form is locked to its original values; retrying sends the same request key and payload so the server can return the original expense instead of creating a duplicate.</p> : null}
        <fieldset disabled={Boolean(pendingExpenseRequest)} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field label="Expense description"><Input required maxLength={200} value={expenseForm.description} onChange={(event) => setExpenseField('description', event.target.value)} placeholder="e.g. Cleaning supplies" /></Field>
          <Field label="Amount (USD)"><Input required min="0.01" step="0.01" type="number" value={expenseForm.amount} onChange={(event) => setExpenseField('amount', event.target.value)} placeholder="0.00" /></Field>
          <Field label="Expense date"><PortalDatePicker value={expenseForm.incurred_on} onChange={(value) => setExpenseField('incurred_on', value)} placeholder="Select expense date" timeZone="America/Chicago" /></Field>
          <Field label="Due date (optional)"><PortalDatePicker value={expenseForm.due_date} onChange={(value) => setExpenseField('due_date', value)} placeholder="Select due date" timeZone="America/Chicago" /></Field>
          <Field label="Category"><PortalSelect value={expenseForm.category} onChange={(value) => setExpenseField('category', value)} options={[{ value: '', label: 'Choose category' }, ...categoryOptions]} buttonClassName="min-h-11 w-full" /></Field>
          <Field label="Vendor or merchant"><Input value={expenseForm.vendor_name} onChange={(event) => setExpenseField('vendor_name', event.target.value)} maxLength={200} placeholder="Company or merchant" /></Field>
          <Field label="Payment method"><PortalSelect value={expenseForm.payment_method} onChange={(value) => setExpenseField('payment_method', value)} options={[{ value: '', label: 'Choose method' }, ...PAYMENT_METHODS.map((value) => ({ value, label: value }))]} buttonClassName="min-h-11 w-full" /></Field>
          {!editExpense ? <Field label="Payment status"><PortalSelect value={expenseForm.payment_choice} onChange={(value) => setExpenseField('payment_choice', value)} options={[{ value: 'unpaid', label: 'Unpaid' }, { value: 'paid', label: 'Paid now' }, { value: 'partial', label: 'Partially paid' }]} buttonClassName="min-h-11 w-full" /></Field> : null}
          {expenseForm.payment_choice === 'partial' && !editExpense ? <Field label="Amount paid now (USD)"><Input required min="0.01" step="0.01" type="number" value={expenseForm.first_payment} onChange={(event) => setExpenseField('first_payment', event.target.value)} placeholder="0.00" /></Field> : null}
          {!editExpense && (expenseForm.payment_choice === 'paid' || expenseForm.payment_choice === 'partial') ? <Field label="Date paid"><PortalDatePicker value={expenseForm.first_payment_date} onChange={(value) => setExpenseField('first_payment_date', value)} placeholder="Select actual payment date" timeZone="America/Chicago" /></Field> : null}
          {expenseForm.expense_type === 'event' ? <Field label="Booking"><PortalSelect value={expenseForm.booking_id} onChange={(value) => setExpenseField('booking_id', value)} options={[{ value: '', label: 'Choose booking' }, ...data.bookings.map((booking) => ({ value: booking.id, label: `${booking.client_name} · ${booking.event_type || 'Event'}${booking.event_date ? ` · ${formatDate(booking.event_date)}` : ''}` }))]} buttonClassName="min-h-11 w-full" /></Field> : null}
          {!editExpense && approvedBills.length ? <Field label="Reviewed bill (optional)"><PortalSelect value={expenseForm.source_bill_id} onChange={(value) => { const bill = data.bills.find((item) => item.id === value); setExpenseField('source_bill_id', value); setExpenseField('source_bill_occurrence_id', ''); setExpenseField('bill_review_confirmed', false); if (bill) { setExpenseField('description', bill.service); setExpenseField('vendor_name', bill.provider); setExpenseField('amount', String(bill.amount)); setExpenseField('incurred_on', bill.issue_date || bill.due_date || ''); setExpenseField('due_date', bill.due_date || ''); setExpenseField('category', bill.bill_category || '') } }} options={[{ value: '', label: 'No linked bill' }, ...approvedBills.map((bill) => ({ value: bill.id, label: `${bill.provider} · ${bill.service} · ${money(bill.amount)}` }))]} buttonClassName="min-h-11 w-full" /></Field> : null}           {expenseForm.source_bill_id ? <div className="space-y-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 p-3 sm:col-span-2">             <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Review the vendor, amount, and dates above. If this bill belongs to an existing variable recurring period, link that occurrence instead of creating a second expense.</p>             {variableOccurrenceOptions.length ? <Field label="Match an existing variable occurrence (optional)"><PortalSelect value={expenseForm.source_bill_occurrence_id} onChange={(value) => setExpenseField('source_bill_occurrence_id', value)} options={[{ value: '', label: 'Create a new expense record' }, ...variableOccurrenceOptions]} buttonClassName="min-h-11 w-full" /></Field> : <p className="text-xs text-[color:var(--portal-muted)]">No unfilled variable occurrence is available to match.</p>}             <label className="flex min-h-10 items-start gap-2 text-xs leading-5 text-[color:var(--portal-text)]"><input type="checkbox" checked={expenseForm.bill_review_confirmed} onChange={(event) => setExpenseField('bill_review_confirmed', event.target.checked)} className="mt-1 accent-[#b98a3e]" /><span>I reviewed this invoice and confirm the displayed vendor, amount, and dates.</span></label>           </div> : null}
          <Field label="Reference number (optional)"><Input value={expenseForm.reference_number} onChange={(event) => setExpenseField('reference_number', event.target.value)} maxLength={100} placeholder="Receipt, transfer, or invoice ref." /></Field>
          <Field label="Notes (optional)" className="sm:col-span-2"><textarea className={TEXTAREA_CLASS} value={expenseForm.notes} onChange={(event) => setExpenseField('notes', event.target.value)} maxLength={2000} placeholder="Additional context" /></Field>
        </fieldset>
        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:justify-end">
          <PortalButton type="button" onClick={() => { setExpenseModalOpen(false); setEditExpense(null) }}>Cancel</PortalButton>
          <PortalButton type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : pendingExpenseRequest ? 'Retry same expense request' : editExpense ? 'Save changes' : expenseForm.source_bill_occurrence_id ? 'Update occurrence' : 'Save expense'}</PortalButton>
        </div>
      </form>
    </PortalModal>

    <PortalModal isOpen={templateModalOpen} onClose={() => { setTemplateModalOpen(false); setEditTemplate(null) }} title={editTemplate ? 'Edit recurring template' : 'New recurring template'} description="Changes apply to future occurrences. Previously generated expenses stay in the ledger." maxWidth="max-w-2xl" fullScreenOnMobile>
      <form onSubmit={submitTemplate} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Expense name"><Input required value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} maxLength={200} placeholder="Monthly internet" /></Field>
          <Field label="Category"><PortalSelect value={templateForm.category} onChange={(value) => setTemplateForm((current) => ({ ...current, category: value }))} options={[{ value: '', label: 'Choose category' }, ...categoryOptions]} buttonClassName="min-h-11 w-full" /></Field>
          <Field label="Expense type"><PortalSelect value={templateForm.is_variable ? 'variable' : 'fixed'} onChange={(value) => setTemplateForm((current) => ({ ...current, is_variable: value === 'variable', expected_amount: value === 'variable' ? '' : current.expected_amount }))} options={[{ value: 'fixed', label: 'Fixed recurring' }, { value: 'variable', label: 'Variable recurring' }]} buttonClassName="min-h-11 w-full" /></Field>
          {!templateForm.is_variable ? <Field label="Expected amount (USD)"><Input required min="0.01" step="0.01" type="number" value={templateForm.expected_amount} onChange={(event) => setTemplateForm((current) => ({ ...current, expected_amount: event.target.value }))} placeholder="0.00" /></Field> : <p className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs leading-5 text-[color:var(--portal-muted)]">The actual bill amount is entered for each occurrence. Past variable amounts are preserved.</p>}
          <Field label="Frequency"><PortalSelect value={templateForm.frequency} onChange={(value) => setTemplateForm((current) => ({ ...current, frequency: value }))} options={['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'custom'].map((value) => ({ value, label: value === 'biweekly' ? 'Every two weeks' : value.charAt(0).toUpperCase() + value.slice(1) }))} buttonClassName="min-h-11 w-full" /></Field>
          {templateForm.frequency === 'custom' ? <div className="grid grid-cols-2 gap-2"><Field label="Every"><Input required min="1" max="365" type="number" value={templateForm.custom_interval} onChange={(event) => setTemplateForm((current) => ({ ...current, custom_interval: event.target.value }))} /></Field><Field label="Unit"><PortalSelect value={templateForm.custom_unit} onChange={(value) => setTemplateForm((current) => ({ ...current, custom_unit: value }))} options={['days', 'weeks', 'months', 'years'].map((value) => ({ value, label: value }))} buttonClassName="min-h-11 w-full" /></Field></div> : null}
          <Field label="Next billing date"><PortalDatePicker value={templateForm.first_due_date} onChange={(value) => setTemplateForm((current) => ({ ...current, first_due_date: value }))} placeholder="Select next due date" timeZone="America/Chicago" /></Field>
          <Field label="Start date"><PortalDatePicker value={templateForm.start_date} onChange={(value) => setTemplateForm((current) => ({ ...current, start_date: value }))} placeholder="Select start date" timeZone="America/Chicago" /></Field>
          <Field label="End date (optional)"><PortalDatePicker value={templateForm.end_date} onChange={(value) => setTemplateForm((current) => ({ ...current, end_date: value }))} placeholder="No end date" timeZone="America/Chicago" /></Field>
          <Field label="Vendor (optional)"><Input value={templateForm.vendor_name} onChange={(event) => setTemplateForm((current) => ({ ...current, vendor_name: event.target.value }))} maxLength={200} placeholder="Company or merchant" /></Field>
          <Field label="Payment method (optional)"><PortalSelect value={templateForm.payment_method} onChange={(value) => setTemplateForm((current) => ({ ...current, payment_method: value }))} options={[{ value: '', label: 'Unknown' }, ...PAYMENT_METHODS.map((value) => ({ value, label: value }))]} buttonClassName="min-h-11 w-full" /></Field>
          <Field label="Notes (optional)" className="sm:col-span-2"><textarea className={TEXTAREA_CLASS} value={templateForm.notes} onChange={(event) => setTemplateForm((current) => ({ ...current, notes: event.target.value }))} maxLength={2000} placeholder="Billing context" /></Field>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:justify-end"><PortalButton type="button" onClick={() => { setTemplateModalOpen(false); setEditTemplate(null) }}>Cancel</PortalButton><PortalButton type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save template'}</PortalButton></div>
      </form>
    </PortalModal>

    <PortalModal isOpen={paymentOpen} onClose={() => setPaymentOpen(false)} title="Record expense transaction" description="Each successful payment or refund is saved as an individual ledger entry." maxWidth="max-w-xl" fullScreenOnMobile>
      <form onSubmit={submitPayment} className="space-y-4">
        {paymentRetryLocked ? <div role="status" className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-5 text-[color:var(--portal-text)]">The result is uncertain. The transaction fields and request key are locked until the exact replay succeeds or you reconcile its saved status.</div> : null}
        <fieldset disabled={busy || paymentRetryLocked} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field label="Transaction type"><PortalSelect value={paymentForm.transaction_type} onChange={(value) => setPaymentField('transaction_type', value)} options={[{ value: 'payment', label: 'Payment' }, { value: 'refund', label: 'Refund received' }, { value: 'reversal', label: 'Payment reversal' }]} buttonClassName="min-h-11 w-full" /></Field>
          <Field label="Amount (USD)"><Input required type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentField('amount', event.target.value)} placeholder="0.00" /></Field>
          <Field label="Date"><PortalDatePicker value={paymentForm.payment_date} onChange={(value) => setPaymentField('payment_date', value)} placeholder="Select date" timeZone="America/Chicago" /></Field>
          <Field label="Payment method"><PortalSelect value={paymentForm.payment_method} onChange={(value) => setPaymentField('payment_method', value)} options={[{ value: '', label: 'Choose method' }, ...PAYMENT_METHODS.map((value) => ({ value, label: value }))]} buttonClassName="min-h-11 w-full" /></Field>
          <Field label="Reference (optional)"><Input value={paymentForm.reference_number} onChange={(event) => setPaymentField('reference_number', event.target.value)} maxLength={100} placeholder="Confirmation number" /></Field>
          <Field label="Notes"><Input value={paymentForm.notes} onChange={(event) => setPaymentField('notes', event.target.value)} maxLength={500} placeholder="Reason for adjustment" /></Field>
        </fieldset>
        {selectedExpense ? <p className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs leading-5 text-[color:var(--portal-muted)]">Remaining balance: <strong className="tabular-nums text-[color:var(--portal-text)]">{hasKnownAmount(selectedExpense) ? money(selectedExpense.remaining_balance ?? 0) : 'Awaiting bill'}</strong>. Refunds and reversals are capped by recorded payments.</p> : null}
        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:justify-end">
          <PortalButton type="button" onClick={() => setPaymentOpen(false)}>Cancel</PortalButton>
          {paymentRetryLocked ? <PortalButton type="button" onClick={() => void reconcilePaymentRetry()} disabled={busy}>Reconcile transaction status</PortalButton> : null}
          <PortalButton type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : paymentRetryLocked ? 'Retry same transaction' : 'Record transaction'}</PortalButton>
        </div>
      </form>
    </PortalModal>

        <PortalModal isOpen={categoryModalOpen} onClose={() => { setCategoryModalOpen(false); setCategoryEdit(null) }} title="Expense categories" description="Custom categories can be renamed or deactivated. Historical expenses remain linked to their category records." maxWidth="max-w-lg">
      <div className="space-y-4">
        <form onSubmit={createCategory} className="flex flex-col gap-2 border-b border-[color:var(--portal-border)] pb-4 sm:flex-row sm:items-end">
          <Field label="New category name" className="min-w-0 flex-1"><Input required maxLength={80} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="e.g. Permits" /></Field>
          <PortalButton type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Add category'}</PortalButton>
        </form>
        <div className="space-y-2">
          {data.categories.filter((category) => !category.is_system).map((category) => (
            <div key={category.id} className="rounded-xl border border-[color:var(--portal-border)] px-3 py-2">
              {categoryEdit?.id === category.id ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input aria-label={`Rename ${category.name}`} maxLength={80} value={categoryEdit.name} onChange={(event) => setCategoryEdit({ id: category.id, name: event.target.value })} />
                  <div className="flex shrink-0 gap-2">
                    <PortalButton type="button" variant="primary" disabled={busy || !categoryEdit.name.trim()} onClick={() => void renameCategory()}>{busy ? 'Saving…' : 'Save name'}</PortalButton>
                    <PortalButton type="button" disabled={busy} onClick={() => setCategoryEdit(null)}>Cancel</PortalButton>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-[color:var(--portal-text)]">{category.name}{category.is_active ? '' : ' (inactive)'}</span>
                  <div className="flex shrink-0 gap-3">
                    <button type="button" onClick={() => setCategoryEdit({ id: category.id, name: category.name })} className="text-xs font-semibold text-[#9a712e] underline underline-offset-2 dark:text-[#e6c77f]">Rename</button>
                    <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { const response = await fetch(`/api/expenses/categories/${encodeURIComponent(category.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !category.is_active }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Category update failed.'); await loadData(true) } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Category update failed.') } finally { setBusy(false) } }} className="text-xs font-semibold text-[#9a712e] underline underline-offset-2 disabled:opacity-50 dark:text-[#e6c77f]">{category.is_active ? 'Deactivate' : 'Reactivate'}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!data.categories.some((category) => !category.is_system) ? <p className="text-xs text-[color:var(--portal-muted)]">No custom categories yet.</p> : null}
        </div>
        <div className="flex justify-end border-t border-[color:var(--portal-border)] pt-4"><PortalButton type="button" onClick={() => { setCategoryModalOpen(false); setCategoryEdit(null) }}>Close</PortalButton></div>
      </div>
    </PortalModal>
  </PortalPageFrame>
}

function DashboardView({
  data, period, setPeriod, periodRange, customStart, setCustomStart, customEnd, setCustomEnd, trendPeriod, setTrendPeriod,
  paidTotal, paidExcluded = 0, unpaidTotal, overdueTotal, upcomingTotal, monthlyFixed, variableTotal, unknownVariableCount, eventTotal, recentExpenses, bookingById,
}: {
  data: ExpenseManagementData; period: string; setPeriod: (value: string) => void; periodRange: { start: string; end: string }; customStart: string; setCustomStart: (value: string) => void; customEnd: string; setCustomEnd: (value: string) => void; trendPeriod: string; setTrendPeriod: (value: string) => void; paidTotal: number; paidExcluded?: number; unpaidTotal: number; overdueTotal: number; upcomingTotal: number; monthlyFixed: number; variableTotal: number; unknownVariableCount: number; eventTotal: number; recentExpenses: ExpenseRow[]; bookingById: Map<string, ExpenseBooking>;
}) {
  const filteredExpenses = data.expenses.filter((expense) => expense.status !== 'cancelled' && hasKnownAmount(expense) && expenseDateInPeriod(expense, periodRange.start, periodRange.end))
  const categoryTotals = new Map<string, number>()
  for (const expense of filteredExpenses) categoryTotals.set(expense.category || 'Uncategorized', (categoryTotals.get(expense.category || 'Uncategorized') || 0) + Math.max(0, Number(expense.amount) || 0))
  const categories = [...categoryTotals.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
  const trendBuckets = buildTrendBuckets(data.expenses, trendPeriod)
  const maxTrend = Math.max(1, ...trendBuckets.map((bucket) => bucket.paid + bucket.refunds + bucket.unpaid))
  const fixedVariable = [
    { label: 'Fixed recurring', amount: data.expenses.filter((expense) => hasKnownAmount(expense) && expense.recurring_template_id && !data.templates.find((template) => template.id === expense.recurring_template_id)?.is_variable && inRange(expense.incurred_on, periodRange.start, periodRange.end)).reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0) },
    { label: 'Variable recurring', amount: variableTotal },
  ]
  const businessEvent = [
    { label: 'Business', amount: filteredExpenses.filter((expense) => !expense.booking_id && expense.expense_type !== 'event').reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0) },
    { label: 'Event', amount: eventTotal },
  ]
  let cursor = 0
  const palette = ['#b98a3e', '#667f73', '#92758a', '#c49a75', '#7887a0', '#a88a54', '#7c8b8a', '#bb755e']
  const donutStops = categories.length ? categories.map((item, index) => {
    const start = cursor
    cursor += categories.reduce((sum, entry) => sum + entry.amount, 0) ? item.amount / categories.reduce((sum, entry) => sum + entry.amount, 0) * 100 : 0
    return `${palette[index % palette.length]} ${start}% ${cursor}%`
  }).join(', ') : 'var(--portal-border) 0% 100%'

  return <div className="space-y-5">
    <section className={`${CARD_CLASS} flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between`}>
      <div><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Spending for the selected period</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Paid totals follow recorded payment dates. Expected costs do not reduce cash.</p></div>
      <div className="grid gap-2 sm:grid-cols-[minmax(10rem,12rem)_minmax(10rem,12rem)]">
        <PortalSelect value={period} onChange={setPeriod} options={PERIOD_OPTIONS} buttonClassName="min-h-10 w-full" />
        {period === 'custom' ? <div className="grid grid-cols-2 gap-2 sm:col-span-2"><Field label="Start"><PortalDatePicker value={customStart} onChange={setCustomStart} placeholder="Start date" timeZone="America/Chicago" /></Field><Field label="End"><PortalDatePicker value={customEnd} onChange={setCustomEnd} placeholder="End date" timeZone="America/Chicago" /></Field></div> : null}
      </div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="Total expenses paid" value={money(paidTotal)} detail={paidExcluded ? `Payments less refunds dated in period. ${paidExcluded} ${paidExcluded === 1 ? 'expense is' : 'expenses are'} excluded until the amount is confirmed.` : 'Payments less refunds dated in period'} tone="gold" />
      <MetricCard label="Unpaid expenses" value={money(unpaidTotal)} detail={`${money(upcomingTotal)} upcoming · ${money(overdueTotal)} overdue${unknownVariableCount ? ` · ${unknownVariableCount} variable ${unknownVariableCount === 1 ? 'bill' : 'bills'} awaiting amount` : ''}`} />
      <MetricCard label="Monthly fixed costs" value={money(monthlyFixed)} detail="Expected monthly equivalent" />
      <MetricCard label="Variable expenses" value={money(variableTotal)} detail={unknownVariableCount ? `${unknownVariableCount} variable ${unknownVariableCount === 1 ? 'bill' : 'bills'} awaiting actual amount` : 'Known amounts recorded in period'} />
      <MetricCard label="Event expenses" value={money(eventTotal)} detail="Costs linked to bookings" />
    </section>
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
      <div className={`${CARD_CLASS} p-4 sm:p-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Expense trends</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Paid outflows and unpaid balances are shown separately.</p></div><PortalSelect value={trendPeriod} onChange={setTrendPeriod} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'annual', label: 'Annual' }]} buttonClassName="min-h-9 w-full sm:w-36" /></div>
        <div className="mt-5 flex gap-2"><div className="relative h-[calc(13rem-1.75rem)] w-12 shrink-0 text-right text-[10px] text-[color:var(--portal-muted)]">{[maxTrend, maxTrend / 2, 0].map((value, index) => <span key={index} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${index * 50}%` }}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value)}</span>)}</div><div role="img" aria-label={`${trendPeriod} expenses with paid, refunded, and unpaid amounts`} className="relative grid h-52 min-w-0 flex-1 grid-flow-col auto-cols-fr items-end gap-2 pb-2 sm:gap-4"><div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-7 top-0 flex flex-col justify-between">{[0, 1, 2].map((line) => <div key={line} className="border-t border-[color:var(--portal-border)]" />)}</div>
          {trendBuckets.map((bucket) => {
            const paidHeight = bucket.paid / maxTrend * 100
            const refundHeight = bucket.refunds / maxTrend * 100
            const unpaidHeight = bucket.unpaid / maxTrend * 100
            return <div key={bucket.label} className="flex h-full min-w-0 flex-col items-center justify-end gap-1">
              <div className="flex h-[calc(100%-1.25rem)] w-full items-end justify-center gap-1" aria-label={`${bucket.label}: ${money(bucket.paid)} paid, ${money(bucket.refunds)} refunded, ${money(bucket.unpaid)} unpaid${bucket.unknown ? `, ${bucket.unknown} awaiting an amount` : ''}`}>
                <div className="w-[42%] max-w-7 rounded-t bg-[#b98a3e] transition-[height]" style={{ height: `${Math.max(bucket.paid > 0 ? 3 : 0, paidHeight)}%` }} title={`Paid ${money(bucket.paid)}`} />
                <div className="w-[32%] max-w-6 rounded-t bg-emerald-700/60 transition-[height] dark:bg-emerald-300/60" style={{ height: `${Math.max(bucket.refunds > 0 ? 3 : 0, refundHeight)}%` }} title={`Refunded ${money(bucket.refunds)}`} />
                <div className="w-[42%] max-w-7 rounded-t bg-[#b98a3e]/30 dark:bg-[#e6c77f]/30 transition-[height]" style={{ height: `${Math.max(bucket.unpaid > 0 ? 3 : 0, unpaidHeight)}%` }} title={`Unpaid ${money(bucket.unpaid)}`} />
              </div><span className="max-w-full truncate text-[10px] text-[color:var(--portal-muted)]">{bucket.label}</span>
            </div>
          })}
        </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-[color:var(--portal-muted)]"><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#b98a3e]" /> Paid</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-700/60 dark:bg-emerald-300/60" /> Refunded</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#b98a3e]/30 dark:bg-[#e6c77f]/30" /> Unpaid</span></div>
      </div>
      <div className={`${CARD_CLASS} p-4 sm:p-5`}>
        <h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Expenses by category</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Known recorded amounts, including unpaid items. Bills awaiting an amount are excluded.</p>
        <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div role="img" aria-label="Expense distribution by category" className="h-36 w-36 shrink-0 rounded-full" style={{ background: `conic-gradient(${donutStops})` }}><div className="m-[22%] grid h-[56%] place-items-center rounded-full bg-[color:var(--portal-card)] text-center"><span className="text-[10px] leading-4 text-[color:var(--portal-muted)]">Total<br /><strong className="tabular-nums text-[color:var(--portal-text)]">{money(categories.reduce((sum, row) => sum + row.amount, 0))}</strong></span></div></div>
          <ul className="w-full min-w-0 space-y-2">{categories.slice(0, 7).map((item, index) => <li key={item.name} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 text-[color:var(--portal-text)]"><i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: palette[index % palette.length] }} /><span className="truncate">{item.name}</span></span><span className="shrink-0 tabular-nums text-[color:var(--portal-muted)]">{money(item.amount)}</span></li>)}{!categories.length ? <li className="text-xs text-[color:var(--portal-muted)]">No expenses recorded in this period.</li> : null}</ul>
        </div>
      </div>
    </section>
    <section className="grid gap-4 xl:grid-cols-2">
      <ComparisonCard title="Fixed vs. variable expenses" rows={fixedVariable} description="Expected fixed monthly cost is shown above; this comparison uses recorded expense occurrences for the selected period." />
      <ComparisonCard title="Business vs. event expenses" rows={businessEvent} description="General overhead stays separate from costs linked to individual bookings." />
    </section>
    <section className={`${CARD_CLASS} overflow-hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--portal-border)] px-4 py-4 sm:px-5"><div><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Recent expense activity</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Most recently recorded expenses.</p></div><LinkButton href="/portal/finances/expenses/business">View all <ArrowRight size={14} /></LinkButton></div>
      {recentExpenses.length ? <ExpenseRows expenses={recentExpenses} bookingById={bookingById} /> : <div className="p-4"><EmptyState title="No expenses recorded yet" detail="Log an operating expense or add a recurring template to get started." /></div>}
    </section>
  </div>
}

function buildTrendBuckets(expenses: ExpenseRow[], group: string) {
  const now = parseDateKey(todayKey()) || new Date()
  const year = now.getUTCFullYear()
  const months = group === 'monthly' ? Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(year, now.getUTCMonth() - 11 + index, 1, 12))) : null
  const keys = group === 'annual'
    ? Array.from({ length: 5 }, (_, index) => `${year - 4 + index}`)
    : group === 'quarterly'
      ? Array.from({ length: 8 }, (_, index) => `${year - (index < 4 ? 0 : 1)}-Q${index % 4 + 1}`).reverse()
      : months?.map((date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`) || []
  return keys.map((key) => {
    const [bucketYear] = key.split('-')
    let start = `${bucketYear}-01-01`; let end = `${bucketYear}-12-31`; let label = bucketYear
    if (group === 'monthly') { start = `${key}-01`; end = `${key}-31`; label = new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) }
    if (group === 'quarterly') { const quarter = Number(key.slice(-1)); const firstMonth = (quarter - 1) * 3 + 1; start = `${bucketYear}-${String(firstMonth).padStart(2, '0')}-01`; end = dateKey(new Date(Date.UTC(Number(bucketYear), firstMonth + 2, 0, 12))); label = `Q${quarter} '${bucketYear.slice(-2)}` }
    const rangeExpenses = expenses.filter((expense) => expense.status !== 'cancelled' && expenseDateInPeriod(expense, start, end))
    const cash = expenses.reduce((result, expense) => {
      const activity = getLuxorExpenseCashActivityInPeriod(expense, start, end)
      if (!activity.available) return result
      return { paid: result.paid + activity.paid, refunds: result.refunds + activity.refunds }
    }, { paid: 0, refunds: 0 })
    const unpaid = rangeExpenses.filter(hasKnownAmount).reduce((sum, expense) => sum + Math.max(0, Number(expense.remaining_balance) || 0), 0)
    const unknown = rangeExpenses.filter((expense) => !hasKnownAmount(expense)).length
    return { key, label: group === 'monthly' ? `${label} '${bucketYear.slice(-2)}` : label, paid: cash.paid, refunds: cash.refunds, unpaid, unknown }
  })
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: 'gold' }) {
  return <article className={`${CARD_CLASS} min-w-0 p-4 sm:p-5`}><p className="text-xs font-semibold text-[color:var(--portal-muted)]">{label}</p><p className={`mt-3 break-words font-sans text-2xl font-bold tabular-nums tracking-tight ${tone === 'gold' ? 'text-[#9a712e] dark:text-[#e6c77f]' : 'text-[color:var(--portal-text)]'}`}>{value}</p><p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">{detail}</p></article>
}

function ComparisonCard({ title, rows, description }: { title: string; rows: Array<{ label: string; amount: number }>; description: string }) {
  const max = Math.max(1, ...rows.map((row) => row.amount))
  return <section className={`${CARD_CLASS} p-4 sm:p-5`}><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">{title}</h2><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{description}</p><div className="mt-5 space-y-4">{rows.map((row, index) => <div key={row.label}><div className="flex items-center justify-between gap-3 text-sm"><span className="text-[color:var(--portal-text)]">{row.label}</span><strong className="tabular-nums text-[color:var(--portal-text)]">{money(row.amount)}</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--portal-soft)]"><div className={`h-full rounded-full ${index === 0 ? 'bg-[#b98a3e]' : 'bg-[#8b9a8f]'}`} style={{ width: `${row.amount / max * 100}%` }} /></div></div>)}</div></section>
}

function ExpenseRows({ expenses, bookingById }: { expenses: ExpenseRow[]; bookingById: Map<string, ExpenseBooking> }) {
  return <div className="divide-y divide-[color:var(--portal-border)]">{expenses.map((expense) => {
    const booking = expense.booking_id ? bookingById.get(expense.booking_id) : null
    return <Link key={expense.id} href={`/portal/finances/expenses/${encodeURIComponent(expense.id)}`} className="flex min-w-0 flex-col gap-2 px-4 py-3.5 transition hover:bg-[color:var(--portal-soft)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{expense.description || expense.category || 'Expense'}</span><span className="mt-1 block truncate text-xs text-[color:var(--portal-muted)]">{formatDate(expense.incurred_on)} · {expense.category}{booking ? ` · ${booking.client_name}` : expense.vendor_name ? ` · ${expense.vendor_name}` : ''}</span></span>
      <span className="flex shrink-0 items-center justify-between gap-3 sm:justify-end"><StatusBadge status={expense.payment_status} /><strong className="min-w-[5.5rem] text-right text-sm tabular-nums text-[color:var(--portal-text)]">{expenseAmountLabel(expense)}</strong></span>
    </Link>
  })}</div>
}

function RecurringView({ data, busy, onAdd, onEdit, onToggle, onViewExpense, onEditExpense, onSkip }: {
  data: ExpenseManagementData; busy: boolean; onAdd: () => void; onEdit: (template: ExpenseTemplate) => void; onToggle: (template: ExpenseTemplate) => void; onViewExpense: (id: string) => void; onEditExpense: (expense: ExpenseRow) => void; onSkip: (expense: ExpenseRow) => void;
}) {
  const templates = data.templates
  const fixed = templates.filter((template) => !template.is_variable)
  const variable = templates.filter((template) => template.is_variable)
  const occurrences = data.expenses.filter((expense) => expense.recurring_template_id).sort((a, b) => String(a.due_date || a.incurred_on).localeCompare(String(b.due_date || b.incurred_on)))
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2"><MetricCard label="Fixed templates" value={String(fixed.filter((item) => item.is_active).length)} detail="Active predictable obligations" /><MetricCard label="Variable templates" value={String(variable.filter((item) => item.is_active).length)} detail="Amounts are entered for each bill" /></div>
    <TemplateSection title="Fixed recurring expenses" detail="Stable expected amounts, such as rent or internet." templates={fixed} busy={busy} onEdit={onEdit} onToggle={onToggle} onAdd={onAdd} />
    <TemplateSection title="Variable recurring expenses" detail="Each occurrence waits for the actual bill amount." templates={variable} busy={busy} onEdit={onEdit} onToggle={onToggle} onAdd={onAdd} />
    <section className={`${CARD_CLASS} overflow-hidden`}><div className="border-b border-[color:var(--portal-border)] px-4 py-4 sm:px-5"><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Generated expense occurrences</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Edit one occurrence or skip its billing period without changing the recurring template.</p></div>{occurrences.length ? <div className="divide-y divide-[color:var(--portal-border)]">{occurrences.map((expense) => { const isVariableAmountUnknown = !hasKnownAmount(expense); return <article key={expense.id} className="flex min-w-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><button type="button" onClick={() => onViewExpense(expense.id)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{expense.description || expense.category}</span><span className="mt-1 block truncate text-xs text-[color:var(--portal-muted)]">{formatDate(expense.due_date || expense.incurred_on)} · {expense.category} · {isVariableAmountUnknown ? 'Amount awaiting bill' : money(expense.amount)}</span></button><div className="flex shrink-0 items-center gap-2"><StatusBadge status={expense.payment_status} /><PortalButton type="button" onClick={() => onEditExpense(expense)}>Edit occurrence</PortalButton>{expense.payment_status !== 'paid' && expense.payment_status !== 'cancelled' ? <PortalButton type="button" disabled={busy} onClick={() => onSkip(expense)}>Skip period</PortalButton> : null}</div></article> })}</div> : <div className="p-4"><EmptyState title="No recurring expenses generated yet" detail="When a template is active, its expected occurrences will appear here. Variable amounts stay unknown until the bill arrives." /></div>}</section>
  </div>
}

function TemplateSection({ title, detail, templates, busy, onEdit, onToggle, onAdd }: { title: string; detail: string; templates: ExpenseTemplate[]; busy: boolean; onEdit: (template: ExpenseTemplate) => void; onToggle: (template: ExpenseTemplate) => void; onAdd: () => void }) {
  return <section className={`${CARD_CLASS} overflow-hidden`}><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--portal-border)] px-4 py-4 sm:px-5"><div><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">{title}</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{detail}</p></div><button type="button" onClick={onAdd} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#9a712e] hover:bg-[#caa24c]/10 dark:text-[#e6c77f]"><Plus size={14} /> Add template</button></div>{templates.length ? <div className="divide-y divide-[color:var(--portal-border)]">{templates.map((template) => <article key={template.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-[color:var(--portal-text)]">{template.name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${template.is_active ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>{template.is_active ? 'Active' : 'Inactive'}</span></div><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{template.category} · {template.frequency === 'biweekly' ? 'Every two weeks' : template.frequency}{template.vendor_name ? ` · ${template.vendor_name}` : ''}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{template.is_variable ? 'Variable amount' : money(template.expected_amount)} · Next due {formatDate(template.first_due_date)} · Starts {formatDate(template.start_date)}</p></div><div className="flex shrink-0 flex-wrap gap-2"><PortalButton type="button" onClick={() => onEdit(template)}>Edit</PortalButton><PortalButton type="button" disabled={busy} onClick={() => onToggle(template)}>{template.is_active ? 'Deactivate' : 'Activate'}</PortalButton></div></article>)}</div> : <div className="p-4"><EmptyState title="No templates here" detail="Add a recurring template to create expected expense occurrences." /></div>}</section>
}

function BusinessView({ data, categoryOptions, categoryFilter, setCategoryFilter, statusFilter, setStatusFilter, query, setQuery, onAdd, onImportBill, onEdit, onCancel, onOpen, onManageCategories, loading }: {
  data: ExpenseManagementData; categoryOptions: Array<{ value: string; label: string }>; categoryFilter: string; setCategoryFilter: (value: string) => void; statusFilter: string; setStatusFilter: (value: string) => void; query: string; setQuery: (value: string) => void; onAdd: () => void; onImportBill: (bill: ExpenseBill) => void; onEdit: (expense: ExpenseRow) => void; onCancel: (expense: ExpenseRow) => void; onOpen: (id: string) => void; onManageCategories: () => void; loading: boolean;
}) {
  const businessExpenses = data.expenses.filter((expense) => !expense.booking_id && expense.expense_type !== 'event')
  const filtered = businessExpenses.filter((expense) => (categoryFilter === 'all' || expense.category === categoryFilter) && (statusFilter === 'all' || expense.payment_status === statusFilter) && (!query.trim() || `${expense.description} ${expense.vendor_name} ${expense.category}`.toLowerCase().includes(query.trim().toLowerCase())))
  return <div className="space-y-5">
    {data.bills.length ? <section className={`${CARD_CLASS} border-l-2 border-l-[#b98a3e] p-4 sm:p-5`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Reviewed vendor bills</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[color:var(--portal-muted)]">Bills from the invoice inbox stay in review until their facts are confirmed. Add a reviewed bill to the expense ledger once; its source file remains linked.</p></div><LinkButton href="/portal/operations?tab=bills">Open bill intake <ArrowRight size={14} /></LinkButton></div>{data.bills.some((bill) => bill.payment_ready_at && bill.extraction_status === 'ready' && bill.amount_state === 'known' && Number.isFinite(Number(bill.amount)) && Number(bill.amount) >= 0) ? <div className="mt-3 divide-y divide-[color:var(--portal-border)]">{data.bills.filter((bill) => bill.payment_ready_at && bill.extraction_status === 'ready' && bill.amount_state === 'known' && Number.isFinite(Number(bill.amount)) && Number(bill.amount) >= 0 && bill.status !== 'paid').slice(0, 3).map((bill) => <div key={bill.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[color:var(--portal-text)]">{bill.provider} · {bill.service}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{money(bill.amount)} · Due {formatDate(bill.due_date)}{bill.source_filename ? ` · ${bill.source_filename}` : ''}</p></div>{data.expenses.some((expense) => expense.source_bill_id === bill.id) ? <span className="shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Added to expenses</span> : <PortalButton type="button" onClick={() => onImportBill(bill)}>Review &amp; log</PortalButton>}</div>)}</div> : <p className="mt-3 text-xs text-[color:var(--portal-muted)]">Bills awaiting extraction or owner review remain in Operations and won’t affect expense totals.</p>}</section> : null}
    <section className={`${CARD_CLASS} overflow-hidden`}>
      <div className="border-b border-[color:var(--portal-border)] p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Business expense ledger</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">General operating expenses remain separate from event costs.</p></div><div className="flex flex-wrap gap-2">{data.can_manage_categories ? <PortalButton type="button" onClick={onManageCategories}>Manage categories</PortalButton> : null}<PortalButton type="button" variant="primary" onClick={onAdd}><Plus size={14} /> Log expense</PortalButton></div></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]"><label className="flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3"><MagnifyingGlass size={14} className="shrink-0 text-[color:var(--portal-muted)]" /><span className="sr-only">Search expenses</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search description or vendor" className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)]" /></label><PortalSelect value={categoryFilter} onChange={setCategoryFilter} options={[{ value: 'all', label: 'All categories' }, ...categoryOptions]} buttonClassName="min-h-10 w-full" /><PortalSelect value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: 'All statuses' }, ...['expected', 'due_today', 'overdue', 'partially_paid', 'paid', 'cancelled'].map((value) => ({ value, label: expenseStatusLabel(value) }))]} buttonClassName="min-h-10 w-full" /></div>
      </div>
      {filtered.length ? <ExpenseTable expenses={filtered} onOpen={onOpen} onEdit={onEdit} onCancel={onCancel} /> : loading ? <div className="space-y-3 p-5"><PortalSkeleton className="h-12 rounded-xl" /><PortalSkeleton className="h-12 rounded-xl" /><PortalSkeleton className="h-12 rounded-xl" /></div> : <div className="p-4"><EmptyState title="No matching business expenses" detail="Clear the filters or log the first operating expense." /></div>}
    </section>
  </div>
}

function ExpenseTable({ expenses, onOpen, onEdit, onCancel }: { expenses: ExpenseRow[]; onOpen: (id: string) => void; onEdit: (expense: ExpenseRow) => void; onCancel: (expense: ExpenseRow) => void }) {
  return <div className="divide-y divide-[color:var(--portal-border)]">{expenses.map((expense) => <article key={expense.id} className="flex min-w-0 flex-col gap-2 px-4 py-3.5 sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_7rem_7.5rem_auto] sm:items-center sm:gap-3 sm:px-5"><button type="button" onClick={() => onOpen(expense.id)} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{expense.description || 'Expense'}</span><span className="mt-1 block truncate text-xs text-[color:var(--portal-muted)]">{expense.vendor_name || 'Vendor not set'} · {expense.category} · {formatDate(expense.incurred_on)}</span></button><span className="text-sm tabular-nums text-[color:var(--portal-text)]">Total {expenseAmountLabel(expense)}</span><span className="text-xs tabular-nums text-[color:var(--portal-muted)]">Remaining {hasKnownAmount(expense) ? money(expense.remaining_balance ?? 0) : 'Pending'}</span><span><StatusBadge status={expense.payment_status} /></span><span className="flex gap-2 sm:justify-end"><button type="button" onClick={() => onEdit(expense)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-[#9a712e] hover:bg-[#caa24c]/10 dark:text-[#e6c77f]">Edit</button>{expense.payment_status !== 'paid' && expense.payment_status !== 'cancelled' ? <button type="button" onClick={() => onCancel(expense)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-[color:var(--portal-muted)] hover:text-rose-700 dark:hover:text-rose-300">Cancel</button> : null}</span></article>)}</div>
}

function EventExpensesView({ data, ledger, selectedBooking, setSelectedBooking, onAdd }: { data: ExpenseManagementData; ledger: FinanceLedgerData; selectedBooking: string; setSelectedBooking: (value: string) => void; onAdd: (bookingId: string) => void }) {
  const eventExpenses = data.expenses.filter((expense) => expense.status !== 'cancelled' && (expense.booking_id || expense.expense_type === 'event'))
  const bookings = data.bookings.filter((booking) => eventExpenses.some((expense) => expense.booking_id === booking.id) || booking.status !== 'cancelled')
  const filteredBookings = bookings.filter((booking) => selectedBooking === 'all' || booking.id === selectedBooking)
  const byBooking = new Map<string, ExpenseRow[]>()
  for (const expense of eventExpenses) if (expense.booking_id) byBooking.set(expense.booking_id, [...(byBooking.get(expense.booking_id) || []), expense])
  return <div className="space-y-5">
    <section className={`${CARD_CLASS} flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between`}><div><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Booking costs</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Expenses are linked to a booking; general overhead is never allocated automatically.</p></div><div className="flex w-full gap-2 sm:w-auto"><PortalSelect value={selectedBooking} onChange={setSelectedBooking} options={[{ value: 'all', label: 'All bookings' }, ...bookings.map((booking) => ({ value: booking.id, label: `${booking.client_name} · ${booking.event_type || 'Event'}${booking.event_date ? ` · ${formatDate(booking.event_date)}` : ''}` }))]} buttonClassName="min-h-10 w-full sm:w-80" /><PortalButton type="button" variant="primary" onClick={() => onAdd(selectedBooking === 'all' ? '' : selectedBooking)}><Plus size={14} /> Add expense</PortalButton></div></section>
    {filteredBookings.length ? <div className="space-y-4">{filteredBookings.map((booking) => {
      const rows = byBooking.get(booking.id) || []
      const knownRows = rows.filter(hasKnownAmount)
      const unknownCount = rows.length - knownRows.length
      const total = knownRows.reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0)
      const paid = knownRows.reduce((sum, expense) => sum + Math.max(0, Number(expense.paid_amount) || 0), 0)
      const outstanding = knownRows.reduce((sum, expense) => sum + Math.max(0, Number(expense.remaining_balance) || 0), 0)
      const revenue = ledger.eventPaymentsVerified ? Number(ledger.eventPaymentsReceivedByBooking?.[booking.id] || 0) : null
      return <section key={booking.id} className={`${CARD_CLASS} overflow-hidden`}>
        <div className="border-b border-[color:var(--portal-border)] p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">{booking.client_name}</h3><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{booking.event_type || 'Event'}{booking.event_date ? ` · ${formatDate(booking.event_date)}` : ''} · {booking.status}</p></div><PortalButton type="button" onClick={() => onAdd(booking.id)}><Plus size={14} /> Add expense</PortalButton></div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{[
            ['Contract total (expected)', booking.contract_total !== null && booking.contract_total !== undefined ? money(booking.contract_total) : '-'],
            ['Payments received', revenue !== null ? money(revenue) : 'Unavailable'],
            ['Total expenses', money(total)],
            ['Expenses paid', money(paid)],
            ['Outstanding expenses', money(outstanding)],
            ['After paid expenses', revenue !== null ? money(revenue - paid) : 'Unavailable'],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 p-3"><p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">{label}</p><p className="mt-1 break-words text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{value}</p></div>)}</div>
          <p className="mt-3 text-[11px] leading-5 text-[color:var(--portal-muted)]">Payments received exclude refundable security deposits. Contract totals are expected revenue; only recorded payments count as cash. Unpaid expenses stay out of paid costs.{unknownCount ? ` ${unknownCount} variable ${unknownCount === 1 ? 'expense has' : 'expenses have'} no confirmed amount, so expense totals are incomplete.` : ''}</p>
        </div>
        {rows.length ? <ExpenseRows expenses={rows} bookingById={new Map([[booking.id, booking]])} /> : <div className="p-4"><EmptyState title="No expenses for this booking" detail="Add event-specific costs here. Rent, utilities, and other overhead belong in Business Expenses." /></div>}
      </section>
    })}</div> : <EmptyState title="No bookings to show" detail="Event expenses will appear here after they are linked to an existing booking." />}
  </div>
}

function ReceiptsView({ data, categories, receiptQuery, setReceiptQuery, vendorFilter, setVendorFilter, categoryFilter, setCategoryFilter, bookingFilter, setBookingFilter, start, setStart, end, setEnd, form, setForm, onSubmit, receiptReview, setReceiptReview, onSaveReview, busy }: {
  data: ExpenseManagementData; categories: Array<{ value: string; label: string }>; receiptQuery: string; setReceiptQuery: (value: string) => void; vendorFilter: string; setVendorFilter: (value: string) => void; categoryFilter: string; setCategoryFilter: (value: string) => void; bookingFilter: string; setBookingFilter: (value: string) => void; start: string; setStart: (value: string) => void; end: string; setEnd: (value: string) => void; form: { file: File | null; vendor_name: string; transaction_date: string; subtotal_amount: string; total_amount: string; tax_amount: string; category: string; expense_id: string; booking_id: string; notes: string }; setForm: React.Dispatch<React.SetStateAction<{ file: File | null; vendor_name: string; transaction_date: string; subtotal_amount: string; total_amount: string; tax_amount: string; category: string; expense_id: string; booking_id: string; notes: string }>>; onSubmit: (event: React.FormEvent) => void; receiptReview: ExpenseReceipt | null; setReceiptReview: React.Dispatch<React.SetStateAction<ExpenseReceipt | null>>; onSaveReview: (event: React.FormEvent) => void; busy: boolean;
}) {
  const all = data.receipts
  const vendors = [...new Set(all.map((receipt) => String(receipt.metadata?.vendor_name || '')).filter(Boolean))].sort()
  const filtered = all.filter((receipt) => {
    const vendor = String(receipt.metadata?.vendor_name || '')
    const category = String(receipt.metadata?.category || '')
    const transactionDate = String(receipt.metadata?.transaction_date || '')
    const bookingId = String(receipt.metadata?.booking_id || '')
    const expense = data.expenses.find((row) => row.id === receipt.expense_id)
    return (vendorFilter === 'all' || vendor === vendorFilter)
      && (categoryFilter === 'all' || category === categoryFilter)
      && (bookingFilter === 'all' || bookingId === bookingFilter || expense?.booking_id === bookingFilter)
      && (!start || transactionDate >= start) && (!end || transactionDate <= end)
      && (!receiptQuery.trim() || `${receipt.file_name} ${receipt.title} ${vendor} ${category} ${expense?.description || ''}`.toLowerCase().includes(receiptQuery.trim().toLowerCase()))
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }))
  const extraction = receiptReview?.metadata?.extracted_fields as { status?: string; confirmed?: boolean; facts?: Record<string, unknown> } | undefined
  const suggested = extraction?.status === 'candidate' && extraction.confirmed !== true ? extraction.facts || null : null
  return <div className="space-y-5">
    <section className={`${CARD_CLASS} p-4 sm:p-5`}><div><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Add a receipt</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-[color:var(--portal-muted)]">Upload a JPG, PNG, or PDF. Any extracted facts remain suggestions until you review and save them.</p></div>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Receipt file" className="sm:col-span-2 xl:col-span-4"><Input id="expense-receipt-file" type="file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" capture="environment" onChange={(event) => set('file', event.target.files?.[0] || null)} className="min-h-12 py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-[#caa24c]/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#8a6527] dark:file:text-[#e6c77f]" /><span className="block text-[11px] text-[color:var(--portal-muted)]">{form.file ? `${form.file.name} · ${(form.file.size / 1024 / 1024).toFixed(1)} MB` : 'On mobile, use the camera or choose a saved document.'}</span></Field>
        <Field label="Vendor (optional)"><Input value={form.vendor_name} onChange={(event) => set('vendor_name', event.target.value)} placeholder="Vendor or merchant" /></Field>
        <Field label="Transaction date"><PortalDatePicker value={form.transaction_date} onChange={(value) => set('transaction_date', value)} placeholder="Select date" timeZone="America/Chicago" /></Field>
        <Field label="Subtotal"><Input type="number" min="0" step="0.01" value={form.subtotal_amount} onChange={(event) => set('subtotal_amount', event.target.value)} placeholder="Optional" /></Field>
        <Field label="Total amount"><Input type="number" min="0" step="0.01" value={form.total_amount} onChange={(event) => set('total_amount', event.target.value)} placeholder="0.00" /></Field>
        <Field label="Tax amount"><Input type="number" min="0" step="0.01" value={form.tax_amount} onChange={(event) => set('tax_amount', event.target.value)} placeholder="0.00" /></Field>
        <Field label="Category"><PortalSelect value={form.category} onChange={(value) => set('category', value)} options={[{ value: '', label: 'Choose category' }, ...categories]} buttonClassName="min-h-11 w-full" /></Field>
        <Field label="Attach to expense"><PortalSelect value={form.expense_id} onChange={(value) => set('expense_id', value)} options={[{ value: '', label: 'No linked expense' }, ...data.expenses.filter((expense) => expense.status !== 'cancelled').map((expense) => ({ value: expense.id, label: `${expense.description || expense.category} · ${expenseAmountLabel(expense)}` }))]} buttonClassName="min-h-11 w-full" /></Field>
        <Field label="Related booking (optional)"><PortalSelect value={form.booking_id} onChange={(value) => set('booking_id', value)} options={[{ value: '', label: 'No booking' }, ...data.bookings.map((booking) => ({ value: booking.id, label: `${booking.client_name} · ${booking.event_type || 'Event'}` }))]} buttonClassName="min-h-11 w-full" /></Field>
        <Field label="Internal notes" className="sm:col-span-2"><Input value={form.notes} onChange={(event) => set('notes', event.target.value)} maxLength={500} placeholder="Optional documentation note" /></Field>
        <div className="flex items-end"><PortalButton type="submit" variant="primary" disabled={busy || !form.file}><UploadSimple size={14} />{busy ? 'Uploading…' : 'Upload receipt'}</PortalButton></div>
      </form>
    </section>
    {receiptReview ? <section className={`${CARD_CLASS} border-l-2 border-l-[#b98a3e] p-4 sm:p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Review receipt details</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{receiptReview.file_name}. Extracted values are suggestions; confirm only what the receipt supports.</p></div><button type="button" onClick={() => setReceiptReview(null)} className="rounded-lg p-2 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)]" aria-label="Close receipt review"><X size={15} /></button></div>
      {suggested ? <div className="mt-3 rounded-xl bg-[color:var(--portal-soft)] p-3 text-xs leading-5 text-[color:var(--portal-muted)]"><p className="font-semibold text-[color:var(--portal-text)]">Candidate extraction · unconfirmed</p><p>{[suggested.vendor_name, suggested.transaction_date || suggested.issue_date, suggested.subtotal_amount, suggested.tax_amount, suggested.total_amount].filter(Boolean).map(String).join(' · ') || 'No candidate facts found'}</p><button type="button" onClick={() => setReceiptReview((current) => current ? ({ ...current, metadata: { ...(current.metadata || {}), vendor_name: current.metadata?.vendor_name || String(suggested.vendor_name || ''), transaction_date: current.metadata?.transaction_date || String(suggested.transaction_date || suggested.issue_date || ''), subtotal_amount: current.metadata?.subtotal_amount || String(suggested.subtotal_amount || ''), total_amount: current.metadata?.total_amount || String(suggested.total_amount || ''), tax_amount: current.metadata?.tax_amount || String(suggested.tax_amount || ''), category: current.metadata?.category || String(suggested.category_suggestion || '') } }) : current)} className="mt-2 font-semibold text-[#9a712e] underline underline-offset-2 dark:text-[#e6c77f]">Fill fields to review</button></div> : null}
      <form onSubmit={onSaveReview} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Vendor"><Input value={String(receiptReview.metadata?.vendor_name || '')} onChange={(event) => setReceiptReview({ ...receiptReview, metadata: { ...(receiptReview.metadata || {}), vendor_name: event.target.value } })} /></Field><Field label="Transaction date"><PortalDatePicker value={String(receiptReview.metadata?.transaction_date || '')} onChange={(value) => setReceiptReview({ ...receiptReview, metadata: { ...(receiptReview.metadata || {}), transaction_date: value } })} placeholder="Select date" timeZone="America/Chicago" /></Field><Field label="Subtotal"><Input type="number" min="0" step="0.01" value={String(receiptReview.metadata?.subtotal_amount || '')} onChange={(event) => setReceiptReview({ ...receiptReview, metadata: { ...(receiptReview.metadata || {}), subtotal_amount: event.target.value } })} /></Field><Field label="Total amount"><Input type="number" min="0" step="0.01" value={String(receiptReview.metadata?.total_amount || '')} onChange={(event) => setReceiptReview({ ...receiptReview, metadata: { ...(receiptReview.metadata || {}), total_amount: event.target.value } })} /></Field><Field label="Tax amount"><Input type="number" min="0" step="0.01" value={String(receiptReview.metadata?.tax_amount || '')} onChange={(event) => setReceiptReview({ ...receiptReview, metadata: { ...(receiptReview.metadata || {}), tax_amount: event.target.value } })} /></Field><Field label="Category"><PortalSelect value={String(receiptReview.metadata?.category || '')} onChange={(value) => setReceiptReview({ ...receiptReview, metadata: { ...(receiptReview.metadata || {}), category: value } })} options={[{ value: '', label: 'Choose category' }, ...categories]} buttonClassName="min-h-11 w-full" /></Field><Field label="Attach to expense"><PortalSelect value={receiptReview.expense_id || ''} onChange={(value) => setReceiptReview({ ...receiptReview, expense_id: value || null })} options={[{ value: '', label: 'No linked expense' }, ...data.expenses.map((expense) => ({ value: expense.id, label: `${expense.description || expense.category} · ${expenseAmountLabel(expense)}` }))]} buttonClassName="min-h-11 w-full" /></Field><div className="flex items-end"><PortalButton type="submit" variant="primary" disabled={busy}><Check size={14} />Confirm and save</PortalButton></div></form>
      </section> : null}
    <section className={`${CARD_CLASS} overflow-hidden`}><div className="border-b border-[color:var(--portal-border)] p-4 sm:p-5"><div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between"><div><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Receipt library</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Search by vendor, category, filename, or expense.</p></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><label className="flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 sm:col-span-2 xl:col-span-1"><MagnifyingGlass size={14} className="shrink-0 text-[color:var(--portal-muted)]" /><span className="sr-only">Search receipts</span><input value={receiptQuery} onChange={(event) => setReceiptQuery(event.target.value)} placeholder="Search receipts" className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)]" /></label><PortalSelect value={vendorFilter} onChange={setVendorFilter} options={[{ value: 'all', label: 'All vendors' }, ...vendors.map((vendor) => ({ value: vendor, label: vendor }))]} buttonClassName="min-h-10 w-full" /><PortalSelect value={categoryFilter} onChange={setCategoryFilter} options={[{ value: 'all', label: 'All categories' }, ...categories]} buttonClassName="min-h-10 w-full" /><PortalSelect value={bookingFilter} onChange={setBookingFilter} options={[{ value: 'all', label: 'All events' }, ...data.bookings.map((booking) => ({ value: booking.id, label: booking.client_name }))]} buttonClassName="min-h-10 w-full" /><div className="grid grid-cols-2 gap-2"><PortalDatePicker value={start} onChange={setStart} placeholder="From date" timeZone="America/Chicago" /><PortalDatePicker value={end} onChange={setEnd} placeholder="To date" timeZone="America/Chicago" /></div></div></div></div>
      {filtered.length ? <div className="divide-y divide-[color:var(--portal-border)]">{filtered.map((receipt) => { const vendor = String(receipt.metadata?.vendor_name || 'Vendor not set'); const category = String(receipt.metadata?.category || 'Uncategorized'); const date = String(receipt.metadata?.transaction_date || ''); const expense = data.expenses.find((row) => row.id === receipt.expense_id); return <article key={receipt.id} className="flex min-w-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[color:var(--portal-text)]">{vendor} · {money(Number(receipt.metadata?.total_amount) || 0)}</p><p className="mt-1 truncate text-xs text-[color:var(--portal-muted)]">{formatDate(date)} · {category} · {receipt.file_name}{expense ? ` · ${expense.description || expense.category}` : ''}</p></div><div className="flex shrink-0 gap-2"><a href={`/api/expenses/receipts/${encodeURIComponent(receipt.id)}?download=0`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">Preview</a><a href={`/api/expenses/receipts/${encodeURIComponent(receipt.id)}?download=1`} className="inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold text-[#9a712e] hover:bg-[#caa24c]/10 dark:text-[#e6c77f]">Download</a></div></article> })}</div> : <div className="p-4"><EmptyState title="No receipts match these filters" detail={all.length ? 'Try changing the vendor, event, date range, or search term.' : 'Uploaded receipts will be organized here.'} /></div>}
    </section>
    {data.bills.length ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Email-extracted vendor invoices remain in the existing Operations Bills intake until reviewed. Open the <Link href="/portal/operations?tab=bills" className="font-semibold text-[#9a712e] underline underline-offset-2 dark:text-[#e6c77f]">bill ledger</Link> to review their source attachments.</p> : null}
  </div>
}

function ExpenseDetailView({ expense, data, booking, onBack, onEdit, onCancel, onPay, onOpenAdjust }: { expense: ExpenseRow | null; data: ExpenseManagementData; booking: ExpenseBooking | null; onBack: () => void; onEdit?: () => void; onCancel?: () => void; onPay: () => void; onOpenAdjust: () => void }) {
  if (!expense) return <EmptyState title="Expense not found" detail="This record may have been canceled or the link may be out of date." />
  const linkedReceipts = data.receipts.filter((receipt) => receipt.expense_id === expense.id)
  const linkedBill = expense.source_bill_id ? data.bills.find((bill) => bill.id === expense.source_bill_id) : null
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"><ArrowLeft size={15} /> Back</button><div className="flex flex-wrap gap-2">{onEdit ? <PortalButton type="button" onClick={onEdit}>Edit</PortalButton> : null}{expense.payment_status !== 'paid' && expense.payment_status !== 'cancelled' ? <PortalButton type="button" variant="primary" onClick={onPay}>Record payment</PortalButton> : null}{expense.paid_amount > 0 && expense.payment_status !== 'cancelled' ? <PortalButton type="button" onClick={onOpenAdjust}>Record refund</PortalButton> : null}{expense.payment_status !== 'cancelled' && onCancel ? <PortalButton type="button" onClick={onCancel}>Cancel expense</PortalButton> : null}</div></div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.8fr)]">
      <section className={`${CARD_CLASS} p-4 sm:p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-sans text-lg font-bold text-[color:var(--portal-text)]">{expense.description || 'Expense'}</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">{expense.vendor_name || 'Vendor not set'} · {expense.category}</p></div><StatusBadge status={expense.payment_status} /></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
          ['Total expense', expenseAmountLabel(expense)], ['Amount paid', hasKnownAmount(expense) ? money(expense.paid_amount) : 'Awaiting bill'], ['Remaining balance', hasKnownAmount(expense) ? money(expense.remaining_balance) : 'Awaiting bill'], ['Expense date', formatDate(expense.incurred_on)],
          ['Due date', formatDate(expense.due_date)], ['Payment method', expense.payment_method || 'Not recorded'], ['Reference', expense.reference_number || '—'], ['Created', formatDate(expense.created_at?.slice(0, 10))],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 p-3"><p className="text-[10px] text-[color:var(--portal-muted)]">{label}</p><p className="mt-1 break-words text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{value}</p></div>)}</div>
        {expense.notes ? <div className="mt-4 rounded-xl border border-[color:var(--portal-border)] p-3"><p className="text-xs font-semibold text-[color:var(--portal-text)]">Notes</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[color:var(--portal-muted)]">{expense.notes}</p></div> : null}
        {booking ? <Link href={`/portal/planner/event/${encodeURIComponent(booking.id)}`} className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 px-3 hover:border-[#caa24c]/50 hover:bg-[color:var(--portal-soft)]"><span className="min-w-0"><span className="block text-xs font-semibold text-[color:var(--portal-text)]">{booking.client_name} · {booking.event_type || 'Event'}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{formatDate(booking.event_date)} · Open booking</span></span><ArrowRight size={15} className="shrink-0 text-[color:var(--portal-muted)]" /></Link> : null}
        {linkedBill ? <Link href={`/portal/operations?tab=bills&bill=${encodeURIComponent(linkedBill.id)}`} className="mt-3 block rounded-xl border border-[color:var(--portal-border)] px-3 py-3 text-xs text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)]">Source bill: <strong className="text-[color:var(--portal-text)]">{linkedBill.provider} · {linkedBill.service}</strong><span className="ml-2 font-semibold text-[#9a712e] dark:text-[#e6c77f]">Open source</span></Link> : null}
      </section>
      <section className={`${CARD_CLASS} p-4 sm:p-5`}><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Receipt attachments</h2>{linkedReceipts.length ? <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{linkedReceipts.map((receipt) => <li key={receipt.id} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{receipt.file_name}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{receipt.content_type}</span></span><a href={`/api/expenses/receipts/${encodeURIComponent(receipt.id)}?download=0`} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-[#9a712e] hover:bg-[#caa24c]/10 dark:text-[#e6c77f]">Preview</a></li>)}</ul> : <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">No receipt is attached. Add one in Receipts &amp; Records.</p>}<LinkButton href="/portal/finances/expenses/receipts">Open receipt library <ArrowRight size={14} /></LinkButton></section>
    </div>
    <section className={`${CARD_CLASS} overflow-hidden`}><div className="border-b border-[color:var(--portal-border)] px-4 py-4 sm:px-5"><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Payment history</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Each payment, refund, and reversal stays as its own transaction.</p></div>{expense.payments?.length ? <div className="divide-y divide-[color:var(--portal-border)]">{expense.payments.map((payment) => <div key={payment.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><span><span className="block text-sm font-semibold text-[color:var(--portal-text)]">{payment.transaction_type === 'payment' ? 'Payment recorded' : payment.transaction_type === 'refund' ? 'Refund recorded' : 'Reversal recorded'}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{formatDate(payment.payment_date)} · {payment.payment_method || 'Method not recorded'}{payment.reference_number ? ` · ${payment.reference_number}` : ''}</span></span><strong className={`tabular-nums text-sm ${payment.transaction_type === 'payment' ? 'text-[color:var(--portal-text)]' : 'text-emerald-700 dark:text-emerald-300'}`}>{payment.transaction_type === 'payment' ? '−' : '+'}{money(payment.amount)}</strong></div>)}</div> : expense.status === 'paid' ? <div className="px-4 py-3 text-xs leading-5 text-[color:var(--portal-muted)] sm:px-5">This legacy expense was saved as paid before individual payment history was introduced.</div> : <div className="p-4"><EmptyState title="No payment transactions recorded" detail="Expected and unpaid amounts do not count as cash outflow." /></div>}</section>
  </div>
}
