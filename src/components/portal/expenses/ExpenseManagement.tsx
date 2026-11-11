'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Buildings,
  CalendarBlank,
  CalendarDots,
  CaretRight,
  Check,
  FileText,
  MagnifyingGlass,
  NotePencil,
  Pause,
  Play,
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
  PortalCheckbox,
  PortalExpandTransition,
  PortalDatePicker,
  PortalFilterBar,
  PortalPagination,
  PortalModal,
  PortalPageFrame,
  PortalPageHeader,
  PortalSelect,
  PortalSkeleton,
  PortalStatusBadge,
  PortalTableCard,
  PortalTabTransition,
  type PortalStatusTone,
} from '@/components/portal/PortalUI'
import { ExpenseMobileActionBar } from '@/components/portal/expenses/ExpenseMobileActionBar'
import BillDetailsPanel from '@/components/portal/BillDetailsPanel'
import BillDocumentPreview from '@/components/portal/BillDocumentPreview'
import { lookupScheduleProviderWebsite } from '@/lib/luxorProviderWebsiteLookupClient'
import { FinanceBrowseViews, type FinanceBrowseView } from '@/components/portal/FinanceBrowseViews'
import { recurringCostEvidence, type RecurringCostEvidence } from '@/lib/luxorRecurringCostEvidence'
import { getLuxorExpenseCashActivityInPeriod } from '@/lib/luxorFinanceReporting'
import { expenseCategoryColors } from '@/lib/luxorExpenseChartColors'
import { getLuxorExpensePaymentPostFailureDisposition, reconcileLuxorExpensePaymentRetry } from '@/lib/luxorExpenseTypes'
import { getPortalSupabaseClient } from '@/lib/supabaseClient'
import type { LuxorBill, LuxorBooking, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment, LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'

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
  matched_expense_id?: string | null
  tax_amount?: number | null
  paid_amount: number
  remaining_balance: number | null
  payment_status: 'expected' | 'due_today' | 'overdue' | 'partially_paid' | 'paid' | 'cancelled' | string
  payments: ExpensePayment[]
}
type ExpenseTemplate = {
  id: string
  vendor_id?: string | null
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
  vendor_id?: string | null
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
  frequency?: string | null
  archived_at?: string | null
  duplicate_of_bill_id?: string | null
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
type PendingTemplateRequest = { payload: Record<string, unknown>; form_snapshot: Record<string, unknown> }
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
  recurring: { title: 'Recurring costs', description: 'Rent, utilities, subscriptions, and other repeating business costs.', browse: 'recurring-expenses', icon: <Repeat size={18} weight="regular" /> },
  business: { title: 'Business Expenses', description: 'Record general operating costs and review their payment history.', browse: 'business-expenses', icon: <Briefcase size={18} weight="regular" /> },
  events: { title: 'Event Expenses', description: 'Keep booking costs connected to the right event and client.', browse: 'event-expenses', icon: <CalendarDots size={18} weight="regular" /> },
  receipts: { title: 'Receipts & Records', description: 'Find and review the documents tied to expense records.', browse: 'expense-receipts', icon: <Receipt size={18} weight="regular" /> },
  detail: { title: 'Expense detail', description: 'Review this expense, its balance, documents, and transaction history.', browse: 'business-expenses', icon: <FileText size={18} weight="regular" /> },
}

const EXPENSE_TABS: Array<{ id: Exclude<ExpenseManagementView, 'detail'>; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: 'Expense Dashboard', icon: <TrendDown size={15} weight="regular" /> },
  { id: 'recurring', label: 'Recurring costs', icon: <Repeat size={15} weight="regular" /> },
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

function expenseStatusTone(status: string): PortalStatusTone {
  if (status === 'paid') return 'green'
  if (status === 'overdue') return 'red'
  if (status === 'due_today' || status === 'partially_paid') return 'gold'
  if (status === 'cancelled') return 'neutral'
  return 'gold'
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[#9a712e] transition hover:bg-[#caa24c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]">{children}</Link>
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block min-w-0 space-y-1.5 ${className}`}><span className="text-xs font-semibold text-[color:var(--portal-muted)]">{label}</span>{children}</label>
}

function StatusBadge({ status }: { status: string }) {
  return <PortalStatusBadge status={expenseStatusLabel(status)} tone={expenseStatusTone(status)} />
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

export default function ExpenseManagement({ view, expenseId, embedded = false, selectedRange, provider, onOpenBill, onBrowseCompanies, initialTemplateId, onBack, initialBillId, panelOnly = false }: { view: ExpenseManagementView; expenseId?: string; embedded?: boolean; selectedRange?: { start: string; end: string }; provider?: { id: string; name: string }; onOpenBill?: (billId: string) => void; onBrowseCompanies?: () => void; initialTemplateId?: string; onBack?: () => void; initialBillId?: string; panelOnly?: boolean }) {
  const router = useRouter()
  const [data, setData] = useState<ExpenseManagementData>({ expenses: [], templates: [], categories: [], bookings: [], bills: [], receipts: [] })
  const recurringSuggestions = useMemo(() => view === 'recurring' && !provider ? recurringCostEvidence(data.bills, data.expenses, data.templates) : [], [view, provider, data.bills, data.expenses, data.templates])
  const [ledger, setLedger] = useState<FinanceLedgerData>({ payments: [], invoices: [], bookings: [], installments: [], refunds: [], eventPaymentsReceivedByBooking: null, eventPaymentsVerified: false })
  const [loading, setLoading] = useState(true)
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
  const [expenseModalOpen, setExpenseModalOpen] = useState(Boolean(panelOnly && initialBillId))
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [panelExpenseId, setSelectedPanelExpenseId] = useState<string | null>(null)
  const [panelExpenseOpen, setPanelExpenseOpen] = useState(false)
  const [sourceBillId, setSourceBillId] = useState<string | null>(null)
  function openBill(id: string) { setPanelExpenseOpen(false); if (onOpenBill) onOpenBill(id); else setSourceBillId(id) }
  function setPanelExpenseId(id: string | null) { if (id) setSelectedPanelExpenseId(id); setPanelExpenseOpen(Boolean(id)) }
  const [separateConfirmed, setSeparateConfirmed] = useState(false)
  const [pendingExpenseAction, setPendingExpenseAction] = useState<{ kind: 'cancel' | 'skip'; expense: ExpenseRow } | null>(null)
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
  const [pendingTemplateRequest, setPendingTemplateRequest] = useState<PendingTemplateRequest | null>(null)
  const templateSubmitInFlight = useRef(false)
  const templateRetryKey = `luxor-recurring-cost-retry:${provider?.id || 'unassigned'}`
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: '', payment_method: '', transaction_type: 'payment', reference_number: '', notes: '', idempotency_key: '' })
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentRetryLocked, setPaymentRetryLocked] = useState(false)
  const [receiptForm, setReceiptForm] = useState({ file: null as File | null, vendor_name: '', transaction_date: '', subtotal_amount: '', total_amount: '', tax_amount: '', category: '', expense_id: '', booking_id: '', notes: '' })
  const [receiptReview, setReceiptReview] = useState<ExpenseReceipt | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryEdit, setCategoryEdit] = useState<{ id: string; name: string } | null>(null)

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
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
      if (!quiet) setLoading(false)
    }
  }, [view])

  useEffect(() => { void loadData() }, [loadData])

  useEffect(() => {
    const supabase = getPortalSupabaseClient()
    if (!supabase) return

    let active = true
    let refreshTimer: number | null = null
    const scheduleRefresh = () => {
      if (!active || document.visibilityState !== 'visible') return
      if (refreshTimer !== null) return
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        void loadData(true)
      }, 250)
    }

    const expenseTables = [
      'luxor_bills',
      'luxor_booking_expenses',
      'luxor_expense_templates',
      'luxor_expense_payments',
      'luxor_recurring_cost_bill_links',
    ] as const

    let broadcastChannel: ReturnType<typeof supabase.channel> | null = null
    const postgresChannel = supabase.channel('luxor-expense-management-refresh')
    for (const table of expenseTables) {
      postgresChannel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh)
    }
    void postgresChannel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn(`Expense management realtime channel entered ${status}.`)
    })

    void fetch('/api/portal/realtime-config', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || typeof data?.realtimeChannel !== 'string') return
        broadcastChannel = supabase
          .channel(data.realtimeChannel)
          .on('broadcast', { event: 'email-arrived' }, scheduleRefresh)
          .on('broadcast', { event: 'email-status' }, scheduleRefresh)
          .on('broadcast', { event: 'bill-intake-updated' }, scheduleRefresh)
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn(`Expense management broadcast channel entered ${status}.`)
          })
      })
      .catch((error) => console.warn('Failed to connect expense management realtime updates:', error))

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh()
    }
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    const handleGlobalUpdate = () => {
      void loadData(true)
    }
    window.addEventListener('luxor:recurring-costs-updated', handleGlobalUpdate)

    return () => {
      active = false
      window.removeEventListener('luxor:recurring-costs-updated', handleGlobalUpdate)
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      void supabase.removeChannel(postgresChannel)
      if (broadcastChannel) void supabase.removeChannel(broadcastChannel)
    }
  }, [loadData])

  useEffect(() => {
    if (view !== 'recurring') return
    try {
      const stored = window.sessionStorage.getItem(templateRetryKey)
      if (!stored) return
      const pending = JSON.parse(stored) as PendingTemplateRequest
      if (!pending.payload || typeof pending.payload.client_request_id !== 'string' || !pending.form_snapshot) return
      setPendingTemplateRequest(pending)
      setTemplateForm((current) => ({ ...current, ...pending.form_snapshot }) as typeof current)
      setEditTemplate(null)
      setTemplateModalOpen(true)
      setNotice('A recurring cost save may have completed. Retry the unchanged request to resolve it safely.')
    } catch { /* In-memory retry remains available if storage is unavailable. */ }
  }, [templateRetryKey, view])

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
  const panelCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (panelCloseTimer.current) clearTimeout(panelCloseTimer.current) }, [])
  function finishPanelOnly() {
    if (panelOnly && onBack) panelCloseTimer.current = setTimeout(onBack, 600)
  }
  function closeExpensePanel() {
    if (busy) return
    setExpenseModalOpen(false); if (initialBillId) finishPanelOnly()
  }
  const initialBillHandled = useRef<string | null>(null)
  useEffect(() => {
    if (!initialBillId || loading || error || initialBillHandled.current === initialBillId) return
    initialBillHandled.current = initialBillId
    if (pendingExpenseRequest) { setExpenseModalOpen(true); setNotice('Resolve the previous expense save first.'); return }
    const bill = approvedBills.find(item => item.id === initialBillId)
    if (!bill) { setNotice('This bill must be reviewed before creating an expense, or it already has an expense.'); return }
    setExpenseForm({ description: bill.service, amount: String(bill.amount), incurred_on: bill.issue_date || bill.due_date || '', due_date: bill.due_date || '', category: bill.bill_category || '', vendor_name: bill.provider, booking_id: '', expense_type: 'business', payment_method: '', payment_choice: 'unpaid', first_payment: '', first_payment_date: '', reference_number: `Bill ${bill.id.slice(0,8)}`, notes: 'Owner-reviewed bill imported from invoice intake.', source_bill_id: bill.id, source_bill_occurrence_id: '', bill_review_confirmed: false })
    setExpenseClientRequestId(crypto.randomUUID()); setFirstPaymentIdempotencyKey(crypto.randomUUID()); setEditExpense(null); setExpenseModalOpen(true)
  }, [initialBillId, loading, error, approvedBills, pendingExpenseRequest])
  const occurrenceOptions = useMemo(() => {
    const bill = data.bills.find((item) => item.id === expenseForm.source_bill_id)
    if (!bill?.vendor_id) return []
    return data.expenses.filter((expense) => !expense.source_bill_id && expense.status !== 'cancelled' && expense.status !== 'paid' && expense.payments.length === 0 && (expense.paid_amount === 0 || (!hasKnownAmount(expense) && expense.metadata?.amount_state === 'variable' && !Object.hasOwn(expense.metadata, 'legacy_paid_amount'))) && data.templates.some((template) => template.id === expense.recurring_template_id && template.vendor_id === bill.vendor_id)).map((expense) => ({ value: expense.id, label: `${expense.description || expense.category} · due ${formatDate(expense.due_date || expense.incurred_on)} · ${expense.vendor_name || 'Provider'}` }))
  }, [data.expenses, data.templates, data.bills, expenseForm.source_bill_id])
  const selectedExpense = useMemo(() => data.expenses.find((expense) => expense.id === (panelExpenseId || expenseId)) || null, [data.expenses, expenseId, panelExpenseId])
  const selectedExpenseId = selectedExpense?.id
  const bookingById = useMemo(() => new Map(data.bookings.map((booking) => [booking.id, booking])), [data.bookings])

  useEffect(() => {
    if (!selectedExpenseId || (view !== 'detail' && !panelExpenseId)) return
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
  }, [view, selectedExpenseId, panelExpenseId])

  const periodRange = useMemo(() => selectedRange ?? periodBounds(period, customStart, customEnd), [selectedRange, period, customStart, customEnd])
  const periodExpenses = useMemo(() => data.expenses.filter((expense) => expense.status !== 'cancelled' && expenseDateInPeriod(expense, periodRange.start, periodRange.end)), [data.expenses, periodRange])
  const paidSummary = useMemo(() => data.expenses.reduce((summary, expense) => {
    if (expense.matched_expense_id) return summary
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
  const variableTotal = useMemo(() => periodExpenses.filter((expense) => {
    const templateId = expense.recurring_template_id || data.expenses.find((period) => period.matched_expense_id === expense.id)?.recurring_template_id
    return hasKnownAmount(expense) && templateId && data.templates.find((template) => template.id === templateId)?.is_variable
  }).reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0), [periodExpenses, data.templates, data.expenses])
  const unknownVariableCount = useMemo(() => periodExpenses.filter((expense) => !hasKnownAmount(expense) && expense.recurring_template_id && data.templates.find((template) => template.id === expense.recurring_template_id)?.is_variable).length, [periodExpenses, data.templates])
  const eventTotal = useMemo(() => periodExpenses.filter((expense) => hasKnownAmount(expense) && (expense.expense_type === 'event' || expense.booking_id)).reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0), [periodExpenses])
  const recentExpenses = useMemo(() => [...data.expenses].filter((expense) => expense.status !== 'cancelled').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 6), [data.expenses])

  const refresh = () => { void loadData(true) }
  const setExpenseField = <K extends keyof typeof expenseForm>(key: K, value: (typeof expenseForm)[K]) => {
    if (pendingExpenseRequest) return
    if (key === 'source_bill_id' || key === 'source_bill_occurrence_id') setSeparateConfirmed(false)
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
    if (expenseForm.source_bill_id && !expenseForm.bill_review_confirmed) { setNotice('Confirm that you reviewed this bill before linking it.'); return }
    if (matchedOccurrence) {
      if (expenseForm.payment_choice !== 'unpaid') { setNotice('Match the bill first, then record the actual payment on the expense.'); return }
      setBusy(true); setNotice(null)
      try {
        const response = await fetch(`/api/expenses/${encodeURIComponent(matchedOccurrence.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_bill_id: expenseForm.source_bill_id, confirm_source_bill: true, expected_updated_at: matchedOccurrence.updated_at, amount: Number(expenseForm.amount), due_date: expenseForm.due_date || null }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'The match could not be saved.')
        setExpenseModalOpen(false); setNotice('Bill matched to the expected period. No payment was recorded.'); await loadData(true); if (initialBillId) finishPanelOnly()
      } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'The match could not be confirmed. Refresh before retrying.') }
      finally { setBusy(false) }
      return
    }
    if (!expenseForm.incurred_on || !expenseForm.category || !expenseForm.vendor_name.trim() || !expenseForm.payment_method) { setNotice('Enter the expense date, category, vendor, and payment method before saving.'); return }
    if (expenseForm.expense_type === 'event' && !expenseForm.booking_id) { setNotice('Choose the booking for this event expense.'); return }
    if (!editExpense && expenseForm.source_bill_id && occurrenceOptions.length && !separateConfirmed) { setNotice('Confirm that this is a separate expense or choose an expected period.'); return }
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
          await loadData(true); setPanelExpenseId(existingExpenseId)
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
              setPanelExpenseId(savedExpenseId)
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
          setPanelExpenseId(savedExpenseId)
          return
        }
      }
      setExpenseModalOpen(false); setEditExpense(null); setNotice(targetExpense ? 'Expense updated. Its correction is recorded in the audit history.' : 'Expense recorded.')
      await loadData(true)
      if (panelOnly && initialBillId) finishPanelOnly()
      else if (paymentAmount > 0) setPanelExpenseId(savedExpenseId)
    } catch (cause) {
      setNotice(pendingExpenseRequest || !targetExpense ? 'The expense save result is uncertain. Retry the unchanged request to resolve it safely.' : cause instanceof Error ? cause.message : 'Expense could not be saved.')
    } finally { setBusy(false) }
  }

  async function submitTemplate(event: React.FormEvent) {
    event.preventDefault()
    if (templateSubmitInFlight.current) return
    templateSubmitInFlight.current = true
    setBusy(true); setNotice(null)
    const fields = {
      name: templateForm.name.trim(), category: templateForm.category, vendor_name: provider?.name || templateForm.vendor_name || null,
      ...(provider ? { vendor_id: provider.id } : {}),
      expected_amount: templateForm.is_variable ? null : Number(templateForm.expected_amount), is_variable: templateForm.is_variable,
      frequency: templateForm.frequency, custom_interval: templateForm.frequency === 'custom' ? Number(templateForm.custom_interval) : null,
      custom_unit: templateForm.frequency === 'custom' ? templateForm.custom_unit : null, first_due_date: templateForm.first_due_date,
      start_date: templateForm.start_date, end_date: templateForm.end_date || null, payment_method: templateForm.payment_method || null,
      notes: templateForm.notes || null,
    }
    const pending = !editTemplate ? pendingTemplateRequest || { payload: { ...fields, client_request_id: crypto.randomUUID() }, form_snapshot: { ...templateForm } } : null
    if (pending) {
      setPendingTemplateRequest(pending)
      try { window.sessionStorage.setItem(templateRetryKey, JSON.stringify(pending)) } catch { /* In-memory retry still uses the same request. */ }
    }
    try {
      const response = await fetch(editTemplate ? `/api/expenses/templates/${encodeURIComponent(editTemplate.id)}` : '/api/expenses/templates', {
        method: editTemplate ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending?.payload || fields),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; template?: { id?: string }; generation_pending?: boolean }
      if (!response.ok) {
        if (pending && response.status >= 500) { setNotice('The save result is uncertain. Retry the unchanged request to prevent a duplicate.'); return }
        if (pendingTemplateRequest || (pending && response.status === 409)) { setNotice(result.error || 'The previous save is still unresolved. Retry the same request after checking access.'); return }
        if (pending) { try { window.sessionStorage.removeItem(templateRetryKey) } catch { /* storage may be unavailable */ }; setPendingTemplateRequest(null) }
        setNotice(result.error || 'Recurring cost could not be saved.'); return
      }
      if (pending && !result.template?.id) { setNotice('The saved cost could not be confirmed. Retry the unchanged request to prevent a duplicate.'); return }
      if (pending) { try { window.sessionStorage.removeItem(templateRetryKey) } catch { /* storage may be unavailable */ }; setPendingTemplateRequest(null) }
      setTemplateModalOpen(false); setNotice(editTemplate ? 'Recurring cost updated for future periods.' : result.generation_pending ? 'Recurring cost saved. Expected periods will be generated when the scheduler retries.' : 'Recurring cost saved and expected periods generated.')
      await loadData(true)
    } catch (cause) { setNotice(pending ? 'The save result is uncertain. Retry the unchanged request to prevent a duplicate.' : cause instanceof Error ? cause.message : 'Recurring cost could not be saved.') }
    finally { templateSubmitInFlight.current = false; setBusy(false) }
  }

  async function toggleTemplate(template: ExpenseTemplate) {
    setBusy(true); setNotice(null)
    try {
      const response = await fetch(`/api/expenses/templates/${encodeURIComponent(template.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !template.is_active }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Recurring cost could not be updated.')
      setNotice(template.is_active ? 'Recurring cost paused. Existing bills and payment history are unchanged.' : 'Recurring cost resumed.')
      await loadData(true)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Recurring cost could not be updated.') }
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

  async function cancelExpenseConfirmed(expense: ExpenseRow) {
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
  function cancelExpense(expense: ExpenseRow) { setPendingExpenseAction({ kind: 'cancel', expense }) }

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
    setSeparateConfirmed(false)
    resetExpenseForm(expenseType, bill || null)
    setFirstPaymentIdempotencyKey(crypto.randomUUID())
    setExpenseClientRequestId(crypto.randomUUID())
    setEditExpense(null); setExpenseModalOpen(true)
  }

  function openPaymentForExpense(expense: ExpenseRow | null) {
    if (!expense) return
    setNotice(null)
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

  async function skipOccurrenceConfirmed(expense: ExpenseRow) {
    if (expense.paid_amount > 0) { setNotice('An occurrence with recorded payments cannot be skipped. Record an appropriate adjustment instead.'); return }
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
  function skipOccurrence(expense: ExpenseRow) { setPendingExpenseAction({ kind: 'skip', expense }) }

  function openNewTemplate(template?: ExpenseTemplate) {
    if (pendingTemplateRequest) { setTemplateModalOpen(true); setNotice('Resolve the previous recurring cost save before starting another.'); return }
    setNotice(null)
    setEditTemplate(template || null)
    setTemplateForm(template ? {
      name: template.name, category: template.category, vendor_name: template.vendor_name || '', expected_amount: template.expected_amount === null ? '' : String(template.expected_amount), is_variable: template.is_variable, frequency: template.frequency,
      custom_interval: String(template.custom_interval || 1), custom_unit: template.custom_unit || 'months', first_due_date: template.first_due_date, start_date: template.start_date, end_date: template.end_date || '', payment_method: template.payment_method || '', notes: template.notes || '',
    } : { name: '', category: '', vendor_name: '', expected_amount: '', is_variable: false, frequency: 'monthly', custom_interval: '1', custom_unit: 'months', first_due_date: '', start_date: '', end_date: '', payment_method: '', notes: '' })
    setTemplateModalOpen(true)
  }

  function openSuggestedTemplate(suggestion: RecurringCostEvidence) {
    if (pendingTemplateRequest) { setTemplateModalOpen(true); setNotice('Resolve the previous recurring cost save before starting another.'); return }
    setNotice(null); setEditTemplate(null)
    setTemplateForm({ name: suggestion.name, category: data.categories.some((category) => category.is_active && category.name === suggestion.category) ? suggestion.category : '', vendor_name: suggestion.provider, expected_amount: '', is_variable: true, frequency: suggestion.frequency, custom_interval: '1', custom_unit: 'months', first_due_date: '', start_date: '', end_date: '', payment_method: '', notes: `Suggested from ${suggestion.billCount} reviewed bills. Latest due date: ${suggestion.latestDueDate}.` })
    setTemplateModalOpen(true)
  }

  function navigateTab(next: Exclude<ExpenseManagementView, 'detail'>) {
    const paths: Record<Exclude<ExpenseManagementView, 'detail'>, string> = {
      dashboard: '/portal/finances/expenses', recurring: '/portal/finances/expenses/recurring', business: '/portal/finances/expenses/business', events: '/portal/finances/expenses/events', receipts: '/portal/finances/expenses/receipts',
    }
    router.push(paths[next])
  }

  const headerActions = <div className="flex flex-wrap items-center justify-end gap-2">
    <button type="button" onClick={() => setBrowseOpen(true)} aria-haspopup="dialog" aria-expanded={browseOpen} aria-label={`Browse views. Currently viewing ${page.title}`} className={`${embedded ? 'hidden' : 'hidden md:inline-flex xl:hidden'} min-h-10 items-center gap-2.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3.5 py-1.5 text-left text-[color:var(--portal-text)] shadow-xs transition-colors hover:border-[#caa24c]/45 hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45`}>
      <CalendarBlank size={16} className="shrink-0 text-[#a8792f]" aria-hidden="true" />
      <span className="min-w-0"><span className="block text-[8px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Browse views</span><span className="mt-0.5 block max-w-[170px] truncate text-xs font-bold leading-tight">{page.title}</span></span>
      <span aria-hidden="true" className="text-[color:var(--portal-muted)]">⌄</span>
    </button>
    {view === 'recurring' && onBrowseCompanies ? <PortalButton type="button" onClick={onBrowseCompanies}>Company details</PortalButton> : null}
    {view === 'recurring' ? <PortalButton type="button" variant="primary" onClick={() => openNewTemplate()} className="!hidden"><Plus size={15} /> Add recurring cost</PortalButton> : null}
    {view === 'business' || view === 'dashboard' ? <PortalButton type="button" variant="primary" onClick={() => openNewExpense('business')} className={view === 'dashboard' ? '!hidden sm:!inline-flex' : undefined}><Plus size={15} /> Log expense</PortalButton> : null}
    {view === 'events' ? <PortalButton type="button" variant="primary" onClick={() => openNewExpense('event')}><Plus size={15} /> Add event expense</PortalButton> : null}
    {view === 'receipts' ? <PortalButton type="button" variant="primary" onClick={() => document.getElementById('expense-receipt-file')?.click()}><UploadSimple size={15} /> Upload receipt</PortalButton> : null}
  </div>

  const detailName = selectedExpense?.description || 'Expense detail'

  return <PortalPageFrame className={panelOnly ? 'contents' : provider ? 'flex min-w-0 flex-col gap-4' : embedded ? 'flex h-full min-h-0 flex-col gap-3 overflow-hidden' : 'flex h-full min-h-0 flex-col gap-4 overflow-hidden max-md:pt-4'}>
    {!panelOnly && <>
    {!embedded && <PortalPageHeader icon={page.icon} title={view === 'detail' ? detailName : page.title} description={page.description} mobileActionsInline actions={headerActions} />}
    {!embedded && <div className="md:hidden">
      <button type="button" onClick={() => setBrowseOpen(true)} aria-haspopup="dialog" aria-expanded={browseOpen} className="flex w-full items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 text-left text-[color:var(--portal-text)] shadow-xs transition-colors hover:border-[#caa24c]/45">
        <CalendarBlank size={18} className="shrink-0 text-[#a8792f]" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Browse views</span><span className="mt-0.5 block truncate text-sm font-bold">{page.title}</span></span>
        <span aria-hidden="true" className="text-[color:var(--portal-muted)]">⌄</span>
      </button>
    </div>}
    {!embedded && <FinanceBrowseViews open={browseOpen} close={() => setBrowseOpen(false)} currentView={page.browse} />}
    {embedded && !provider && view !== 'detail' ? <div className={`flex-wrap items-center justify-end gap-2.5 pb-1 ${view === 'dashboard' ? 'hidden sm:flex' : 'flex'}`}>{headerActions}</div> : null}
    {!embedded && <nav aria-label="Expense management views" className="hidden xl:block">
      <PortalAnimatedTabs tabs={EXPENSE_TABS} activeTab={activeView as Exclude<ExpenseManagementView, 'detail'>} onTabChange={navigateTab} ariaLabel="Expense management views" className="flex min-w-max items-center gap-1 overflow-x-auto portal-scrollbar" />
    </nav>}
    <div className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden portal-scrollbar ${view === 'dashboard' ? 'pb-24 sm:pb-6' : 'pb-6'}`}>
      {notice ? <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-sm text-[color:var(--portal-text)]"><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)} className="rounded p-1 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)]"><X size={14} /></button></div> : null}
      {error ? <div role="alert" className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-300"><p className="font-semibold">Expense records are unavailable</p><p className="mt-1">{error}</p><button type="button" onClick={refresh} className="mt-3 font-semibold underline underline-offset-2">Try again</button></div> : null}
      {loading && !data.expenses.length ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className={`${CARD_CLASS} p-5`}><PortalSkeleton className="h-3 w-28 rounded" /><PortalSkeleton className="mt-4 h-7 w-32 rounded" /><PortalSkeleton className="mt-3 h-3 w-40 rounded" /></div>)}</div><div className={`${CARD_CLASS} p-5`}><PortalSkeleton className="h-5 w-48 rounded" /><PortalSkeleton className="mt-5 h-52 w-full rounded-xl" /></div></div> : null}
      {!loading && !error ? <PortalTabTransition activeKey={view}>
        {view === 'dashboard' ? <DashboardView data={data} period={period} setPeriod={setPeriod} periodRange={periodRange} externalRange={Boolean(selectedRange)} customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd} trendPeriod={trendPeriod} setTrendPeriod={setTrendPeriod} paidTotal={paidTotal} paidExcluded={paidExcluded} unpaidTotal={unpaidTotal} overdueTotal={overdueTotal} upcomingTotal={upcomingTotal} monthlyFixed={monthlyFixed} variableTotal={variableTotal} unknownVariableCount={unknownVariableCount} eventTotal={eventTotal} recentExpenses={recentExpenses} bookingById={bookingById} onOpenExpense={setPanelExpenseId} /> : null}
        {view === 'recurring' && recurringSuggestions.length ? <section className={`${CARD_CLASS} p-4 sm:p-5`}><h2 className="text-base font-bold text-[color:var(--portal-text)]">Possible recurring costs</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">These reviewed business bills show a repeating cycle. Check the next billing date before saving a schedule.</p><div className="mt-3 divide-y divide-[color:var(--portal-border)]">{recurringSuggestions.map((suggestion) => <div key={suggestion.billIds.join(':')} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-[color:var(--portal-text)]">{suggestion.name}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{suggestion.provider} · {suggestion.frequency} · {suggestion.billCount} reviewed bills</p></div><PortalButton type="button" size="sm" onClick={() => openSuggestedTemplate(suggestion)}>Review schedule</PortalButton></div>)}</div></section> : null}
        {view === 'recurring' ? <RecurringView message={notice} key={initialTemplateId || 'recurring'} initialTemplateId={initialTemplateId} providerMode={Boolean(provider)} data={provider ? { ...data, templates: data.templates.filter((template) => template.vendor_id === provider.id), expenses: data.expenses.filter((expense) => data.templates.some((template) => template.id === expense.recurring_template_id && template.vendor_id === provider.id)) } : data} busy={busy} onAdd={() => openNewTemplate()} onEdit={openNewTemplate} onToggle={toggleTemplate} onViewExpense={setPanelExpenseId} onEditExpense={openEditExpense} onSkip={skipOccurrence} onOpenBill={openBill} /> : null}
        {view === 'business' ? <BusinessView data={data} categoryOptions={categoryOptions} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} query={query} setQuery={setQuery} onAdd={() => openNewExpense('business')} onEdit={openEditExpense} onCancel={cancelExpense} onOpen={setPanelExpenseId} onManageCategories={() => setCategoryModalOpen(true)} loading={loading} /> : null}
        {view === 'events' ? <EventExpensesView onOpenExpense={setPanelExpenseId} data={data} ledger={ledger} selectedBooking={selectedBooking} setSelectedBooking={setSelectedBooking} onAdd={(id) => { if (!id) { setNotice('Choose a booking before adding an event expense.'); return } if (pendingExpenseRequest) { setExpenseModalOpen(true); setNotice('Resolve the existing expense save before starting another expense.'); return } openNewExpense('event'); setExpenseField('booking_id', id) }} /> : null}
        {view === 'receipts' ? <ReceiptsView data={data} categories={categoryOptions} receiptQuery={receiptQuery} setReceiptQuery={setReceiptQuery} vendorFilter={receiptVendorFilter} setVendorFilter={setReceiptVendorFilter} categoryFilter={receiptCategoryFilter} setCategoryFilter={setReceiptCategoryFilter} bookingFilter={receiptBookingFilter} setBookingFilter={setReceiptBookingFilter} start={receiptStart} setStart={setReceiptStart} end={receiptEnd} setEnd={setReceiptEnd} form={receiptForm} setForm={setReceiptForm} onSubmit={submitReceipt} receiptReview={receiptReview} setReceiptReview={setReceiptReview} onSaveReview={saveReceiptReview} busy={busy} /> : null}
        {view === 'detail' ? <ExpenseDetailView expense={selectedExpense} data={data} booking={selectedExpense?.booking_id ? bookingById.get(selectedExpense.booking_id) || null : null} onBack={onBack || (() => router.back())} compact={embedded} onOpenBill={openBill} onEdit={selectedExpense ? () => openEditExpense(selectedExpense) : undefined} onCancel={selectedExpense ? () => void cancelExpense(selectedExpense) : undefined} onPay={() => openPaymentForExpense(selectedExpense)} onOpenAdjust={() => { setNotice(null); setPaymentForm({ amount: '', payment_date: todayKey(), payment_method: selectedExpense?.payment_method || '', transaction_type: 'refund', reference_number: '', notes: '', idempotency_key: crypto.randomUUID() }); setPaymentRetryLocked(false); setPaymentOpen(true) }} /> : null}
      </PortalTabTransition> : null}
    </div>

    {view === 'dashboard' && !panelOnly ? (
      <ExpenseMobileActionBar
        onLogExpense={() => openNewExpense('business')}
        onAddRecurring={() => openNewTemplate()}
      />
    ) : null}
    </>}

    {panelOnly && view === 'recurring' ? <RecurringView message={notice} key={initialTemplateId || 'recurring-panel'} initialTemplateId={initialTemplateId} panelOnly onClose={finishPanelOnly} loading={loading} error={error || undefined} onRetry={refresh} data={data} busy={busy} onAdd={() => openNewTemplate()} onEdit={openNewTemplate} onToggle={toggleTemplate} onViewExpense={setPanelExpenseId} onEditExpense={openEditExpense} onSkip={skipOccurrence} onOpenBill={openBill} /> : null}

    <PortalModal isOpen={panelExpenseOpen} onClose={() => { if (!busy) { setPanelExpenseId(null); if (initialBillId) finishPanelOnly() } }} title={selectedExpense?.description || 'Expense details'} description={selectedExpense?.vendor_name || 'Business expense'} maxWidth="max-w-[600px]" sidePanel animateClose headerBack>
      {selectedExpense ? <div className="space-y-6">
        {notice ? <p role="status" className="rounded-xl bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)]">{notice}</p> : null}
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs text-[color:var(--portal-muted)]">Amount</p><p className="mt-1 text-2xl font-semibold tabular-nums text-[color:var(--portal-text)]">{expenseAmountLabel(selectedExpense)}</p></div><StatusBadge status={selectedExpense.payment_status} /></div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-[color:var(--portal-border)] py-5 text-sm">{[['Due date', formatDate(selectedExpense.due_date || selectedExpense.incurred_on)], ['Category', selectedExpense.category], ['Paid', hasKnownAmount(selectedExpense) ? money(selectedExpense.paid_amount) : 'Awaiting bill'], ['Remaining', hasKnownAmount(selectedExpense) ? money(selectedExpense.remaining_balance) : 'Awaiting bill']].map(([label, value]) => <div key={label}><dt className="text-xs text-[color:var(--portal-muted)]">{label}</dt><dd className="mt-1 tabular-nums text-[color:var(--portal-text)]">{value}</dd></div>)}</dl>
        <div className="flex flex-wrap gap-2"><PortalButton onClick={() => openEditExpense(selectedExpense)}>Edit expense</PortalButton>{selectedExpense.payment_status !== 'paid' && selectedExpense.payment_status !== 'cancelled' && hasKnownAmount(selectedExpense) ? <PortalButton variant="primary" onClick={() => openPaymentForExpense(selectedExpense)}>Record payment</PortalButton> : null}{selectedExpense.paid_amount > 0 && selectedExpense.payment_status !== 'cancelled' ? <PortalButton onClick={() => { setNotice(null); setPaymentForm({ amount: '', payment_date: todayKey(), payment_method: selectedExpense.payment_method || '', transaction_type: 'refund', reference_number: '', notes: '', idempotency_key: crypto.randomUUID() }); setPaymentRetryLocked(false); setPaymentOpen(true) }}>Record refund</PortalButton> : null}{selectedExpense.source_bill_id ? <PortalButton onClick={() => openBill(selectedExpense.source_bill_id!)}>View original bill</PortalButton> : null}</div>
        {selectedExpense.notes ? <p className="whitespace-pre-wrap text-sm leading-6 text-[color:var(--portal-muted)]">{selectedExpense.notes}</p> : null}
        <section className="border-t border-[color:var(--portal-border)] pt-5"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Payment history</h3>{selectedExpense.payments.length ? <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{selectedExpense.payments.map(payment => <li key={payment.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div><p className="capitalize text-[color:var(--portal-text)]">{payment.transaction_type}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{formatDate(payment.payment_date)}{payment.payment_method ? ` · ${payment.payment_method}` : ''}</p></div><span className="tabular-nums text-[color:var(--portal-text)]">{money(payment.amount)}</span></li>)}</ul> : <p className="mt-2 text-sm text-[color:var(--portal-muted)]">{selectedExpense.status === 'paid' ? 'Marked paid before individual payment records were available.' : 'No payments recorded.'}</p>}</section>
      </div> : <p className="text-sm text-[color:var(--portal-muted)]">This expense is no longer available.</p>}
    </PortalModal>

    <PortalModal isOpen={Boolean(pendingExpenseAction)} onClose={() => { if (!busy) setPendingExpenseAction(null) }} title={pendingExpenseAction?.kind === 'skip' ? 'Skip this period?' : 'Cancel this expense?'} description="The record and its history remain available.">
      <p className="text-sm text-[color:var(--portal-text)]">{pendingExpenseAction?.expense.description || 'Expense'}{pendingExpenseAction?.kind === 'skip' ? ` · due ${formatDate(pendingExpenseAction.expense.due_date)}` : ''}</p><div className="mt-5 flex justify-end gap-2"><PortalButton disabled={busy} onClick={() => setPendingExpenseAction(null)}>Keep it</PortalButton><PortalButton variant="primary" disabled={busy} onClick={() => { const action = pendingExpenseAction; setPendingExpenseAction(null); if (action) void (action.kind === 'skip' ? skipOccurrenceConfirmed(action.expense) : cancelExpenseConfirmed(action.expense)) }}>Confirm</PortalButton></div>
    </PortalModal>
    {sourceBillId ? <BillDetailsPanel key={sourceBillId} billId={sourceBillId} onClose={() => { setSourceBillId(null); void loadData(true) }} onBillChanged={() => void loadData(true)} onOpenExpense={(id) => { setSourceBillId(null); setPanelExpenseId(id) }} onCreateExpense={(id) => { const bill = data.bills.find(item => item.id === id); if (bill) { setSourceBillId(null); openNewExpense('business', bill) } }} /> : null}
    <PortalModal isOpen={expenseModalOpen} onClose={closeExpensePanel} title={pendingExpenseRequest ? 'Resolve expense save' : editExpense ? 'Edit expense' : expenseForm.expense_type === 'event' ? 'Add event expense' : 'Log business expense'} description={pendingExpenseRequest ? 'The saved form is locked until the same request is confirmed.' : editExpense ? 'Corrections are recorded alongside the saved expense history.' : 'Save the expense first. Payments are recorded as separate transactions.'} maxWidth="max-w-[600px]" sidePanel animateClose headerBack={panelOnly || Boolean(panelExpenseId)}>
      <form onSubmit={submitExpense} className="space-y-4">
        {error ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
        {notice ? <p role="alert" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)]">{notice}</p> : null}
        {!editExpense && expenseForm.source_bill_id && !expenseForm.source_bill_occurrence_id && occurrenceOptions.length ? <PortalCheckbox checked={separateConfirmed} onChange={setSeparateConfirmed} label="I reviewed the expected periods and this is a separate expense." /> : null}
        {pendingExpenseRequest ? <p role="status" className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-5 text-[color:var(--portal-text)]">This submission may already have been saved. The form is locked to its original values; retrying sends the same request key and payload so the server can return the original expense instead of creating a duplicate.</p> : null}
        <fieldset disabled={busy || loading || Boolean(error) || Boolean(pendingExpenseRequest) || (panelOnly && Boolean(initialBillId) && !expenseForm.source_bill_id)} className="grid min-w-0 gap-4 sm:grid-cols-2">
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
          {!editExpense && !(panelOnly && initialBillId) && approvedBills.length ? <Field label="Reviewed bill (optional)"><PortalSelect value={expenseForm.source_bill_id} onChange={(value) => { const bill = data.bills.find((item) => item.id === value); setExpenseField('source_bill_id', value); setExpenseField('source_bill_occurrence_id', ''); setExpenseField('bill_review_confirmed', false); if (bill) { setExpenseField('description', bill.service); setExpenseField('vendor_name', bill.provider); setExpenseField('amount', String(bill.amount)); setExpenseField('incurred_on', bill.issue_date || bill.due_date || ''); setExpenseField('due_date', bill.due_date || ''); setExpenseField('category', bill.bill_category || '') } }} options={[{ value: '', label: 'No linked bill' }, ...approvedBills.map((bill) => ({ value: bill.id, label: `${bill.provider} · ${bill.service} · ${money(bill.amount)}` }))]} buttonClassName="min-h-11 w-full" /></Field> : null}           {expenseForm.source_bill_id ? <div className="space-y-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 p-3 sm:col-span-2">             <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Review the vendor, amount, and dates above. If this bill belongs to an expected recurring period, match it to avoid creating a second expense.</p>             {occurrenceOptions.length ? <Field label="Match an expected period (optional)"><PortalSelect value={expenseForm.source_bill_occurrence_id} onChange={(value) => setExpenseField('source_bill_occurrence_id', value)} options={[{ value: '', label: 'Create a new expense record' }, ...occurrenceOptions]} buttonClassName="min-h-11 w-full" /></Field> : <p className="text-xs text-[color:var(--portal-muted)]">No unmatched period is available for this confirmed provider.</p>}             <PortalCheckbox checked={expenseForm.bill_review_confirmed} onChange={(checked) => setExpenseField('bill_review_confirmed', checked)} label="I reviewed this invoice and confirm the displayed vendor, amount, and dates." className="pt-1" />           </div> : null}
          <Field label="Reference number (optional)"><Input value={expenseForm.reference_number} onChange={(event) => setExpenseField('reference_number', event.target.value)} maxLength={100} placeholder="Receipt, transfer, or invoice ref." /></Field>
          <Field label="Notes (optional)" className="sm:col-span-2"><textarea className={TEXTAREA_CLASS} value={expenseForm.notes} onChange={(event) => setExpenseField('notes', event.target.value)} maxLength={2000} placeholder="Additional context" /></Field>
        </fieldset>
        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:justify-end">
          <PortalButton type="button" disabled={busy} onClick={closeExpensePanel}>Cancel</PortalButton>
          <PortalButton type="submit" variant="primary" disabled={busy || loading || Boolean(error) || (panelOnly && Boolean(initialBillId) && !expenseForm.source_bill_id)}>{busy ? 'Saving…' : loading ? 'Loading bill…' : pendingExpenseRequest ? 'Retry same expense request' : editExpense ? 'Save changes' : expenseForm.source_bill_occurrence_id ? 'Update occurrence' : 'Save expense'}</PortalButton>
        </div>
      </form>
    </PortalModal>

    <PortalModal isOpen={templateModalOpen} onClose={() => { setTemplateModalOpen(false) }} title={pendingTemplateRequest ? 'Resolve recurring cost save' : editTemplate ? 'Edit recurring cost' : 'Add recurring cost'} description="Set how often this cost repeats. Existing bills and payments stay unchanged." maxWidth="max-w-[600px]" sidePanel animateClose headerBack={Boolean(editTemplate)}>
      <form onSubmit={submitTemplate} className="space-y-4">
        {notice ? <p role="alert" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)]">{notice}</p> : null}
        {pendingTemplateRequest ? <p role="status" className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-5 text-[color:var(--portal-text)]">This cost may already be saved. Retry the unchanged request to avoid creating a duplicate.</p> : null}
        <fieldset disabled={Boolean(pendingTemplateRequest)} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field label="Expense name"><Input required value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} maxLength={200} placeholder="Monthly internet" /></Field>
          <Field label="Category"><PortalSelect value={templateForm.category} onChange={(value) => setTemplateForm((current) => ({ ...current, category: value }))} options={[{ value: '', label: 'Choose category' }, ...categoryOptions]} buttonClassName="min-h-11 w-full" /></Field>
          <Field label="Amount"><PortalSelect value={templateForm.is_variable ? 'variable' : 'fixed'} onChange={(value) => setTemplateForm((current) => ({ ...current, is_variable: value === 'variable', expected_amount: value === 'variable' ? '' : current.expected_amount }))} options={[{ value: 'fixed', label: 'Same amount each time' }, { value: 'variable', label: 'Amount varies' }]} buttonClassName="min-h-11 w-full" /></Field>
          {!templateForm.is_variable ? <Field label="Expected amount (USD)"><Input required min="0.01" step="0.01" type="number" value={templateForm.expected_amount} onChange={(event) => setTemplateForm((current) => ({ ...current, expected_amount: event.target.value }))} placeholder="0.00" /></Field> : <p className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs leading-5 text-[color:var(--portal-muted)]">Each expected bill waits for its actual amount.</p>}
          <Field label="Frequency"><PortalSelect value={templateForm.frequency} onChange={(value) => setTemplateForm((current) => ({ ...current, frequency: value }))} options={['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'custom'].map((value) => ({ value, label: value === 'biweekly' ? 'Every two weeks' : value.charAt(0).toUpperCase() + value.slice(1) }))} buttonClassName="min-h-11 w-full" /></Field>
          {templateForm.frequency === 'custom' ? <div className="grid grid-cols-2 gap-2"><Field label="Every"><Input required min="1" max="365" type="number" value={templateForm.custom_interval} onChange={(event) => setTemplateForm((current) => ({ ...current, custom_interval: event.target.value }))} /></Field><Field label="Unit"><PortalSelect value={templateForm.custom_unit} onChange={(value) => setTemplateForm((current) => ({ ...current, custom_unit: value }))} options={['days', 'weeks', 'months', 'years'].map((value) => ({ value, label: value }))} buttonClassName="min-h-11 w-full" /></Field></div> : null}
          <Field label="Next billing date"><PortalDatePicker value={templateForm.first_due_date} onChange={(value) => setTemplateForm((current) => ({ ...current, first_due_date: value }))} placeholder="Select next due date" timeZone="America/Chicago" /></Field>
          <Field label="Start date"><PortalDatePicker value={templateForm.start_date} onChange={(value) => setTemplateForm((current) => ({ ...current, start_date: value }))} placeholder="Select start date" timeZone="America/Chicago" /></Field>
          <Field label="End date (optional)"><PortalDatePicker value={templateForm.end_date} onChange={(value) => setTemplateForm((current) => ({ ...current, end_date: value }))} placeholder="No end date" timeZone="America/Chicago" /></Field>
          {provider ? <p className="text-sm text-[color:var(--portal-muted)]">Provider: {provider.name}</p> : <Field label="Company (optional)"><Input value={templateForm.vendor_name} onChange={(event) => setTemplateForm((current) => ({ ...current, vendor_name: event.target.value }))} maxLength={200} placeholder="Company or merchant" /></Field>}
          <Field label="Payment method (optional)"><PortalSelect value={templateForm.payment_method} onChange={(value) => setTemplateForm((current) => ({ ...current, payment_method: value }))} options={[{ value: '', label: 'Unknown' }, ...PAYMENT_METHODS.map((value) => ({ value, label: value }))]} buttonClassName="min-h-11 w-full" /></Field>
          <Field label="Notes (optional)" className="sm:col-span-2"><textarea className={TEXTAREA_CLASS} value={templateForm.notes} onChange={(event) => setTemplateForm((current) => ({ ...current, notes: event.target.value }))} maxLength={2000} placeholder="Billing context" /></Field>
        </fieldset>
        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:justify-end"><PortalButton type="button" onClick={() => { setTemplateModalOpen(false) }}>Close</PortalButton><PortalButton type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : pendingTemplateRequest ? 'Retry same request' : 'Save recurring cost'}</PortalButton></div>
      </form>
    </PortalModal>

    <PortalModal isOpen={paymentOpen} onClose={() => setPaymentOpen(false)} title="Record expense transaction" description="Each successful payment or refund is saved as an individual ledger entry." maxWidth="max-w-[600px]" sidePanel animateClose headerBack={Boolean(panelExpenseId)}>
      <form onSubmit={submitPayment} className="space-y-4">
        {notice ? <p role="alert" className="rounded-xl bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)]">{notice}</p> : null}
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
  data, period, setPeriod, periodRange, externalRange, customStart, setCustomStart, customEnd, setCustomEnd, trendPeriod, setTrendPeriod,
  paidTotal, paidExcluded = 0, unpaidTotal, overdueTotal, upcomingTotal, monthlyFixed, variableTotal, unknownVariableCount, eventTotal, recentExpenses, bookingById, onOpenExpense,
}: {
  data: ExpenseManagementData; period: string; setPeriod: (value: string) => void; periodRange: { start: string; end: string }; externalRange: boolean; customStart: string; setCustomStart: (value: string) => void; customEnd: string; setCustomEnd: (value: string) => void; trendPeriod: string; setTrendPeriod: (value: string) => void; paidTotal: number; paidExcluded?: number; unpaidTotal: number; overdueTotal: number; upcomingTotal: number; monthlyFixed: number; variableTotal: number; unknownVariableCount: number; eventTotal: number; recentExpenses: ExpenseRow[]; bookingById: Map<string, ExpenseBooking>; onOpenExpense: (id: string) => void;
}) {
  const filteredExpenses = data.expenses.filter((expense) => expense.status !== 'cancelled' && hasKnownAmount(expense) && expenseDateInPeriod(expense, periodRange.start, periodRange.end))
  const categoryTotals = new Map<string, number>()
  for (const expense of filteredExpenses) categoryTotals.set(expense.category || 'Uncategorized', (categoryTotals.get(expense.category || 'Uncategorized') || 0) + Math.max(0, Number(expense.amount) || 0))
  const categories = [...categoryTotals.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
  const trendBuckets = buildTrendBuckets(data.expenses, trendPeriod)
  const maxTrend = Math.max(1, ...trendBuckets.map((bucket) => bucket.paid + bucket.refunds + bucket.unpaid))
  const trendScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const scrollEl = trendScrollRef.current
    if (!scrollEl) return
    const alignToLatest = () => {
      scrollEl.scrollLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth)
    }
    alignToLatest()
    const frame = window.requestAnimationFrame(alignToLatest)
    return () => window.cancelAnimationFrame(frame)
  }, [trendPeriod, trendBuckets.length])
  const fixedVariable = [
    { label: 'Fixed recurring', amount: data.expenses.filter((expense) => {
      const templateId = expense.recurring_template_id || data.expenses.find((period) => period.matched_expense_id === expense.id)?.recurring_template_id
      const template = data.templates.find((item) => item.id === templateId)
      return expense.status !== 'cancelled' && hasKnownAmount(expense) && template && !template.is_variable && inRange(expense.incurred_on, periodRange.start, periodRange.end)
    }).reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0) },
    { label: 'Variable recurring', amount: variableTotal },
  ]
  const businessEvent = [
    { label: 'Business', amount: filteredExpenses.filter((expense) => !expense.booking_id && expense.expense_type !== 'event').reduce((sum, expense) => sum + Math.max(0, Number(expense.amount) || 0), 0) },
    { label: 'Event', amount: eventTotal },
  ]
  let cursor = 0
  const categoryColors = expenseCategoryColors(categories.map((item) => item.name))
  const donutStops = categories.length ? categories.map((item) => {
    const start = cursor
    cursor += categories.reduce((sum, entry) => sum + entry.amount, 0) ? item.amount / categories.reduce((sum, entry) => sum + entry.amount, 0) * 100 : 0
    return `${categoryColors.get(item.name)} ${start}% ${cursor}%`
  }).join(', ') : 'var(--portal-border) 0% 100%'

  return <div className="space-y-5">
    <section className={`${CARD_CLASS} flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between`}>
      <div><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Spending for the selected period</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Paid totals follow recorded payment dates. Expected costs do not reduce cash.</p></div>
      {!externalRange && <div className="grid gap-2 sm:grid-cols-[minmax(10rem,12rem)_minmax(10rem,12rem)]">
        <PortalSelect value={period} onChange={setPeriod} options={PERIOD_OPTIONS} buttonClassName="min-h-10 w-full" />
        {period === 'custom' ? <div className="grid grid-cols-2 gap-2 sm:col-span-2"><Field label="Start"><PortalDatePicker value={customStart} onChange={setCustomStart} placeholder="Start date" timeZone="America/Chicago" /></Field><Field label="End"><PortalDatePicker value={customEnd} onChange={setCustomEnd} placeholder="End date" timeZone="America/Chicago" /></Field></div> : null}
      </div>}
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
        <div className="mt-5 flex gap-2">
          <div className="relative h-[calc(13rem-1.75rem)] w-12 shrink-0 text-right text-[10px] tabular-nums text-[color:var(--portal-muted)]">{[maxTrend, maxTrend / 2, 0].map((value, index) => <span key={index} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${index * 50}%` }}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value)}</span>)}</div>
          <div ref={trendScrollRef} className="min-w-0 flex-1 snap-x snap-proximity overflow-x-auto overscroll-x-contain portal-scrollbar [-webkit-overflow-scrolling:touch] sm:overflow-visible sm:snap-none">
            <div role="img" aria-label={`${trendPeriod} expenses with paid, refunded, and unpaid amounts`} className="relative grid h-52 w-max min-w-full auto-cols-[3.25rem] grid-flow-col items-end gap-1.5 pb-2 sm:w-full sm:min-w-0 sm:auto-cols-fr sm:gap-4">
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-7 top-0 flex flex-col justify-between">{[0, 1, 2].map((line) => <div key={line} className="border-t border-[color:var(--portal-border)]" />)}</div>
              {trendBuckets.map((bucket) => {
                const paidHeight = bucket.paid / maxTrend * 100
                const refundHeight = bucket.refunds / maxTrend * 100
                const unpaidHeight = bucket.unpaid / maxTrend * 100
                return <div key={bucket.key} className="flex h-full snap-center flex-col items-center justify-end gap-1">
                  <div className="flex h-[calc(100%-1.25rem)] w-full min-w-[2.5rem] items-end justify-center gap-0.5 sm:gap-1" aria-label={`${bucket.label}: ${money(bucket.paid)} paid, ${money(bucket.refunds)} refunded, ${money(bucket.unpaid)} unpaid${bucket.unknown ? `, ${bucket.unknown} awaiting an amount` : ''}`}>
                    <div className="w-[42%] max-w-7 rounded-t bg-[#b98a3e] transition-[height]" style={{ height: `${Math.max(bucket.paid > 0 ? 3 : 0, paidHeight)}%` }} title={`Paid ${money(bucket.paid)}`} />
                    <div className="w-[32%] max-w-6 rounded-t bg-emerald-700/60 transition-[height] dark:bg-emerald-300/60" style={{ height: `${Math.max(bucket.refunds > 0 ? 3 : 0, refundHeight)}%` }} title={`Refunded ${money(bucket.refunds)}`} />
                    <div className="w-[42%] max-w-7 rounded-t bg-[#b98a3e]/30 dark:bg-[#e6c77f]/30 transition-[height]" style={{ height: `${Math.max(bucket.unpaid > 0 ? 3 : 0, unpaidHeight)}%` }} title={`Unpaid ${money(bucket.unpaid)}`} />
                  </div>
                  <span className="w-full whitespace-nowrap text-center text-[10px] leading-tight text-[color:var(--portal-muted)] sm:truncate">{bucket.label}</span>
                </div>
              })}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-[color:var(--portal-muted)]"><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#b98a3e]" /> Paid</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-700/60 dark:bg-emerald-300/60" /> Refunded</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#b98a3e]/30 dark:bg-[#e6c77f]/30" /> Unpaid</span></div>
      </div>
      <div className={`${CARD_CLASS} p-4 sm:p-5`}>
        <h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Expenses by category</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Known recorded amounts, including unpaid items. Bills awaiting an amount are excluded.</p>
        <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div role="img" aria-label="Expense distribution by category" className="h-36 w-36 shrink-0 rounded-full" style={{ background: `conic-gradient(${donutStops})` }}><div className="m-[22%] grid h-[56%] place-items-center rounded-full bg-[color:var(--portal-card)] text-center"><span className="text-[10px] leading-4 text-[color:var(--portal-muted)]">Total<br /><strong className="tabular-nums text-[color:var(--portal-text)]">{money(categories.reduce((sum, row) => sum + row.amount, 0))}</strong></span></div></div>
          <ul className="w-full min-w-0 space-y-2">{categories.slice(0, 7).map((item) => <li key={item.name} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 text-[color:var(--portal-text)]"><i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: categoryColors.get(item.name) }} /><span className="truncate">{item.name}</span></span><span className="shrink-0 tabular-nums text-[color:var(--portal-muted)]">{money(item.amount)}</span></li>)}{!categories.length ? <li className="text-xs text-[color:var(--portal-muted)]">No expenses recorded in this period.</li> : null}</ul>
        </div>
      </div>
    </section>
    <section className="grid gap-4 xl:grid-cols-2">
      <ComparisonCard title="Fixed vs. variable expenses" rows={fixedVariable} description="Expected fixed monthly cost is shown above; this comparison uses recorded expense occurrences for the selected period." />
      <ComparisonCard title="Business vs. event expenses" rows={businessEvent} description="General overhead stays separate from costs linked to individual bookings." />
    </section>
    <section className={`${CARD_CLASS} overflow-hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--portal-border)] px-4 py-4 sm:px-5"><div><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Recent expense activity</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Most recently recorded expenses.</p></div><LinkButton href="/portal/finances/expenses/business">View all <ArrowRight size={14} /></LinkButton></div>
      {recentExpenses.length ? <ExpenseRows expenses={recentExpenses} bookingById={bookingById} onOpen={onOpenExpense} /> : <div className="p-4"><EmptyState title="No expenses recorded yet" detail="Log an operating expense or add a recurring template to get started." /></div>}
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

function ExpenseRows({ expenses, bookingById, onOpen }: { expenses: ExpenseRow[]; bookingById: Map<string, ExpenseBooking>; onOpen: (id: string) => void }) {
  return <div className="divide-y divide-[color:var(--portal-border)]">{expenses.map((expense) => {
    const booking = expense.booking_id ? bookingById.get(expense.booking_id) : null
    return <button type="button" key={expense.id} onClick={() => onOpen(expense.id)} className="flex w-full min-w-0 text-left flex-col gap-2 px-4 py-3.5 transition hover:bg-[color:var(--portal-soft)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{expense.description || expense.category || 'Expense'}</span><span className="mt-1 block truncate text-xs text-[color:var(--portal-muted)]">{formatDate(expense.incurred_on)} · {expense.category}{booking ? ` · ${booking.client_name}` : expense.vendor_name ? ` · ${expense.vendor_name}` : ''}</span></span>
      <span className="flex shrink-0 items-center justify-between gap-3 sm:justify-end"><StatusBadge status={expense.payment_status} /><strong className="min-w-[5.5rem] text-right text-sm tabular-nums text-[color:var(--portal-text)]">{expenseAmountLabel(expense)}</strong></span>
    </button>
  })}</div>
}

function recurringFrequency(template: ExpenseTemplate) {
  if (template.frequency === 'custom') return `Every ${template.custom_interval || 1} ${template.custom_unit || 'months'}`
  return ({ weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Yearly' } as Record<string, string>)[template.frequency] || template.frequency
}

type RecurringCompanyProfile = { phone: string | null; email: string | null; website: string | null; contact_name: string | null; account_notes: string | null; updated_at: string | null }
type RecurringProfileResponse = { profile: RecurringCompanyProfile; suggested_contacts?: { phone: string | null; email: string | null; website: string | null; source_bill_id: string } | null; summary: { summary: string; source_bill_id: string | null; generated_at: string | null; updated_at: string } | null }
const emptyRecurringProfile: RecurringCompanyProfile = { phone: null, email: null, website: null, contact_name: null, account_notes: null, updated_at: null }

/** A recurring cost has its own company details; it is not an event-vendor profile. */
function RecurringCompanyDetails({ templateId, supplierName, latestMatchedBill, onOpenBill, onLinkedBill }: { templateId: string; supplierName: string; latestMatchedBill: { bill: ExpenseBill; expense: ExpenseRow } | null; onOpenBill: (id: string) => void; onLinkedBill: () => void }) {
  const [record, setRecord] = useState<RecurringProfileResponse | null>(null)
  const [draft, setDraft] = useState<RecurringCompanyProfile>(emptyRecurringProfile)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [saved, setSaved] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [billPickerOpen, setBillPickerOpen] = useState(false)
  const [billCandidates, setBillCandidates] = useState<LuxorBill[] | null>(null)
  const [linkedBills, setLinkedBills] = useState<LuxorBill[]>([])
  const [moreCandidates, setMoreCandidates] = useState(false)
  const [moreLinkedBills, setMoreLinkedBills] = useState(false)
  const [billSelected, setBillSelected] = useState('')
  const [billConfirm, setBillConfirm] = useState(false)
  const [billVersion, setBillVersion] = useState('')
  const [billError, setBillError] = useState('')
  const [billBusy, setBillBusy] = useState(false)
  const url = `/api/expenses/templates/${encodeURIComponent(templateId)}/profile`
  useEffect(() => {
    let current = true
    void fetch(url, { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Company details could not be loaded.')
      const data = await response.json() as RecurringProfileResponse
      if (current) { setRecord(data); setDraft(data.profile || emptyRecurringProfile) }
    }).catch(() => { if (current) setError('Company details could not be loaded.') })
    return () => { current = false }
  }, [url, retry])
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true); setError(''); setSaved(false); setConflict(false)
    try {
      const response = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_name: draft.contact_name, phone: draft.phone, email: draft.email, website: draft.website, account_notes: draft.account_notes, expected_updated_at: record?.profile.updated_at ?? null }) })
      const result = await response.json()
      if (!response.ok) { if (response.status === 409) setConflict(true); throw new Error(result.error || 'Company details could not be saved.') }
      setRecord(current => current ? { ...current, profile: result.profile } : current); setDraft(result.profile); setEditing(false); setSaved(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Company details could not be saved.') }
    finally { setSaving(false) }
  }
  function change(field: keyof RecurringCompanyProfile, value: string) { setDraft(current => ({ ...current, [field]: value })) }
  async function openBillPicker() {
    setBillPickerOpen(true); setBillBusy(true); setBillError(''); setBillSelected(''); setBillConfirm(false)
    try {
      const response = await fetch(`${url}-bills`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || !Array.isArray(result.candidates) || typeof result.templateUpdatedAt !== 'string') throw new Error(result.error || 'Reviewed bills could not be loaded.')
      setBillCandidates(result.candidates); setLinkedBills(Array.isArray(result.linkedBills) ? result.linkedBills : []); setMoreCandidates(result.hasMoreCandidates === true); setMoreLinkedBills(result.hasMoreLinkedBills === true); setBillVersion(result.templateUpdatedAt)
    } catch (cause) { setBillCandidates(null); setBillError(cause instanceof Error ? cause.message : 'Reviewed bills could not be loaded.') }
    finally { setBillBusy(false) }
  }
  async function linkBill() {
    const bill = billCandidates?.find(item => item.id === billSelected)
    if (!bill || billBusy || !billConfirm) return
    if (normalizedCompany(bill.provider) !== normalizedCompany(supplierName)) { setBillError('The company name changed. Reload bills and review the selection.'); return }
    setBillBusy(true); setBillError('')
    try {
      const response = await fetch(`${url}-bills`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bill_id: bill.id, expected_bill_updated_at: bill.updated_at, expected_template_updated_at: billVersion }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The bill could not be added to this profile.')
      setBillPickerOpen(false); setBillCandidates(null); setBillSelected(''); setBillConfirm(false); setRetry(value => value + 1); onLinkedBill()
    } catch (cause) { setBillError(cause instanceof Error ? cause.message : 'The bill could not be added to this profile.') }
    finally { setBillBusy(false) }
  }
  const normalizedCompany = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
  const matchingCandidates = billCandidates?.filter(bill => normalizedCompany(bill.provider) === normalizedCompany(supplierName)) || []
  const profile = record?.profile
  return <section className="border-b border-[color:var(--portal-border)] pb-6" aria-label="Company profile">
    <div className="flex items-center justify-between gap-3"><h3 className="text-base font-bold text-[color:var(--portal-text)]">Company profile</h3>{record ? <button type="button" aria-label={editing ? 'Close company editing' : 'Edit company details'} title={editing ? 'Close' : 'Edit company details'} disabled={saving} onClick={() => { if (editing) setDraft(record.profile); setEditing(!editing); setError(''); setSaved(false) }} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:opacity-50">{editing ? <X size={18} /> : <NotePencil size={18} />}</button> : null}</div>
    {error ? <div role="alert" className="mt-2 text-sm text-[color:var(--portal-muted)]">{error}{!record || conflict ? <button type="button" onClick={() => { setError(''); setConflict(false); setEditing(false); setRetry(value => value + 1) }} className="ml-2 min-h-10 font-semibold text-[#9a712e] dark:text-[#e6c77f]">{conflict ? 'Reload details' : 'Try again'}</button> : null}</div> : null}
    {!record && !error ? <p role="status" className="mt-2 text-sm text-[color:var(--portal-muted)]">Loading company details…</p> : null}
    {record ? <>
      <PortalExpandTransition activeKey={editing ? 'editing' : 'details'}><div className="flow-root">{editing ? <form onSubmit={save} className="mt-4 space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Contact name"><Input value={draft.contact_name || ''} maxLength={200} onChange={event => change('contact_name', event.target.value)} /></Field><Field label="Phone"><Input type="tel" value={draft.phone || ''} maxLength={50} onChange={event => change('phone', event.target.value)} /></Field><Field label="Email"><Input type="email" value={draft.email || ''} maxLength={254} onChange={event => change('email', event.target.value)} /></Field><Field label="Website"><Input type="url" placeholder="https://…" value={draft.website || ''} maxLength={2048} onChange={event => change('website', event.target.value)} /></Field></div><Field label="Account notes"><textarea className={TEXTAREA_CLASS} value={draft.account_notes || ''} maxLength={4000} onChange={event => change('account_notes', event.target.value)} /></Field><div className="flex flex-wrap gap-2"><PortalButton type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</PortalButton><PortalButton type="button" disabled={saving} onClick={() => { setDraft(record.profile); setEditing(false); setError('') }}>Cancel</PortalButton></div></form> : <>
        {profile && (profile.phone || profile.email || profile.website || profile.contact_name) ? <dl className="mt-3 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">{profile.contact_name ? <div><dt className="text-xs text-[color:var(--portal-muted)]">Contact</dt><dd className="mt-1 break-words text-sm text-[color:var(--portal-text)]">{profile.contact_name}</dd></div> : null}{profile.phone ? <div><dt className="text-xs text-[color:var(--portal-muted)]">Phone</dt><dd className="mt-1 break-words text-sm text-[color:var(--portal-text)]"><a href={`tel:${profile.phone.replace(/[^+\d]/g, '')}`} className="hover:underline">{profile.phone}</a></dd></div> : null}{profile.email ? <div><dt className="text-xs text-[color:var(--portal-muted)]">Email</dt><dd className="mt-1 break-all text-sm text-[color:var(--portal-text)]"><a href={`mailto:${profile.email}`} className="hover:underline">{profile.email}</a></dd></div> : null}{profile.website ? <div><dt className="text-xs text-[color:var(--portal-muted)]">Website</dt><dd className="mt-1 break-all text-sm text-[color:var(--portal-text)]"><a href={profile.website} target="_blank" rel="noreferrer" className="hover:underline">{profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></dd></div> : null}</dl> : <p className="mt-2 text-sm text-[color:var(--portal-muted)]">Add a phone number, email, or contact for this company.</p>}
        {profile?.account_notes ? <div className="mt-4"><p className="text-xs text-[color:var(--portal-muted)]">Account notes</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[color:var(--portal-text)]">{profile.account_notes}</p></div> : null}
        {saved ? <p role="status" className="mt-2 text-xs text-[color:var(--portal-muted)]">Company details saved.</p> : null}
      </>}</div></PortalExpandTransition>
      {!editing && record.suggested_contacts && (record.suggested_contacts.phone || record.suggested_contacts.email || record.suggested_contacts.website) ? <div className="mt-5 border-t border-[color:var(--portal-border)] pt-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-semibold text-[color:var(--portal-text)]">Contact details found on a bill</p><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Check these details before saving them.</p></div><button type="button" onClick={() => { const suggested = record.suggested_contacts; setDraft({ ...record.profile, phone: record.profile.phone || suggested?.phone || null, email: record.profile.email || suggested?.email || null, website: record.profile.website || suggested?.website || null }); setEditing(true); setError(''); setSaved(false) }} className="min-h-10 text-xs font-semibold text-[#9a712e] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:text-[#e6c77f]">Review details</button></div><dl className="mt-2 space-y-1 text-sm text-[color:var(--portal-muted)]">{record.suggested_contacts.phone ? <div><dt className="inline">Phone: </dt><dd className="inline break-words text-[color:var(--portal-text)]">{record.suggested_contacts.phone}</dd></div> : null}{record.suggested_contacts.email ? <div><dt className="inline">Email: </dt><dd className="inline break-all text-[color:var(--portal-text)]">{record.suggested_contacts.email}</dd></div> : null}{record.suggested_contacts.website ? <div><dt className="inline">Website: </dt><dd className="inline break-all text-[color:var(--portal-text)]">{record.suggested_contacts.website}</dd></div> : null}</dl></div> : null}
      <div className="mt-5"><h4 className="text-sm font-semibold text-[color:var(--portal-text)]">Latest matched bill</h4>{latestMatchedBill ? <div className="mt-2 flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-[color:var(--portal-text)]">{latestMatchedBill.bill.service}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{latestMatchedBill.bill.due_date ? `Due ${formatDate(latestMatchedBill.bill.due_date)}` : 'Due date not recorded'}</p></div><p className="text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{latestMatchedBill.expense.remaining_balance !== null && Number.isFinite(latestMatchedBill.expense.remaining_balance) && latestMatchedBill.expense.payment_status !== 'needs_review' && latestMatchedBill.expense.amount_known !== false ? `${money(latestMatchedBill.expense.remaining_balance)} remaining` : 'Balance needs review'}</p></div> : <p className="mt-2 text-sm text-[color:var(--portal-muted)]">No reviewed bills matched to a billing period yet.</p>}</div>
      <div className="mt-5"><h4 className="text-sm font-semibold text-[color:var(--portal-text)]">Account summary</h4>{record.summary ? <><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[color:var(--portal-text)]">{record.summary.summary}</p><p className="mt-2 text-xs text-[color:var(--portal-muted)]">AI summary based on a reviewed bill{record.summary.generated_at ? ` · Updated ${formatDate(record.summary.generated_at.slice(0, 10))}` : ''}</p></> : <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">A summary will appear when a reviewed bill is matched to this recurring cost.</p>}</div>
      <div className="mt-3"><button type="button" onClick={() => { if (billPickerOpen) { setBillPickerOpen(false); setBillConfirm(false); setBillError('') } else void openBillPicker() }} className="inline-flex min-h-10 items-center text-xs font-semibold text-[#9a712e] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:text-[#e6c77f]">{billPickerOpen ? 'Close bill selection' : 'Add a reviewed bill to this profile'}</button>
        {billPickerOpen ? <div className="mt-2 space-y-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4"><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Choose a reviewed bill from this company. This adds it to the profile for the summary; it does not change its payment or match a billing period.</p>{billBusy ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Loading…</p> : null}{billError ? <p role="alert" className="text-xs text-[color:var(--portal-text)]">{billError} <button type="button" onClick={() => void openBillPicker()} className="font-semibold text-[#9a712e] dark:text-[#e6c77f]">Reload bills</button></p> : null}{linkedBills.length ? <div><p className="text-xs font-semibold text-[color:var(--portal-text)]">Bills in this profile</p><ul className="mt-1">{linkedBills.map(bill => <li key={bill.id}><button type="button" onClick={() => onOpenBill(bill.id)} className="min-h-10 text-left text-xs text-[#9a712e] hover:underline dark:text-[#e6c77f]">{bill.provider} · {bill.service} · {bill.due_date ? formatDate(bill.due_date) : 'No due date'}</button></li>)}</ul>{moreLinkedBills ? <p className="text-xs text-[color:var(--portal-muted)]">Showing the latest 100 bills in this profile.</p> : null}</div> : null}{matchingCandidates.length ? <><PortalSelect value={billSelected} onChange={value => { setBillSelected(value); setBillConfirm(false) }} aria-label="Reviewed bill" buttonClassName="min-h-11 w-full" options={[{ value: '', label: 'Choose a reviewed bill' }, ...matchingCandidates.map(bill => ({ value: bill.id, label: `${bill.provider} · ${bill.service} · ${bill.due_date ? formatDate(bill.due_date) : 'No due date'}` }))]} />{billSelected ? <><PortalCheckbox checked={billConfirm} onChange={setBillConfirm} label="I confirmed this bill belongs to this recurring cost." className="mt-2" /><div className="mt-2"><PortalButton type="button" size="sm" disabled={!billConfirm || billBusy} onClick={() => void linkBill()}>Add to profile</PortalButton></div></> : null}</> : !billBusy && !billError ? <p className="text-xs text-[color:var(--portal-muted)]">No reviewed bills match this company name.</p> : null}{moreCandidates && !billBusy && !billError ? <p className="text-xs text-[color:var(--portal-muted)]">Only the latest 100 available reviewed bills were checked.</p> : null}</div> : null}
      </div>
    </> : null}
  </section>
}

function RecurringView({ data, busy, onAdd, onEdit, onToggle, onViewExpense, onEditExpense, onSkip, onOpenBill, initialTemplateId, panelOnly = false, onClose, loading = false, error, onRetry, message }: {
  data: ExpenseManagementData; busy: boolean; onAdd: () => void; onEdit: (template: ExpenseTemplate) => void; onToggle: (template: ExpenseTemplate) => void; onViewExpense: (id: string) => void; onEditExpense: (expense: ExpenseRow) => void; onSkip: (expense: ExpenseRow) => void; onOpenBill: (id: string) => void; providerMode?: boolean; initialTemplateId?: string; panelOnly?: boolean; onClose?: () => void; loading?: boolean; error?: string; onRetry?: () => void; message?: string | null;
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [amountType, setAmountType] = useState('all')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(initialTemplateId || null)
  const [scheduleOpen, setScheduleOpen] = useState(Boolean(initialTemplateId))
  const [periodView, setPeriodView] = useState<'upcoming' | 'previous'>('upcoming')
  const [periodPage, setPeriodPage] = useState(1)
  const [supplierWebsite, setSupplierWebsite] = useState<string | null>(null)
  const [logoFailed, setLogoFailed] = useState(false)
  const [sourceBills, setSourceBills] = useState<LuxorBill[]>([])
  const [profileBills, setProfileBills] = useState<LuxorBill[]>([])
  const [profileBillsMore, setProfileBillsMore] = useState(false)
  const [profileBillsError, setProfileBillsError] = useState('')
  const [profileBillsLoading, setProfileBillsLoading] = useState(false)
  const [profileBillRefresh, setProfileBillRefresh] = useState(0)
  const selected = data.templates.find(template => template.id === selectedId)
  useEffect(() => {
    let current = true
    if (!scheduleOpen || !selected || selected.vendor_id || !selected.vendor_name) return
    void lookupScheduleProviderWebsite(selected.id, selected.vendor_name, null).then(result => { if (current) { setSupplierWebsite(result?.website || null); setLogoFailed(false) } }).catch(() => { if (current) setSupplierWebsite(null) })
    return () => { current = false }
  }, [scheduleOpen, selected?.id, selected?.vendor_id, selected?.vendor_name])
  useEffect(() => {
    if (!scheduleOpen || periodView !== 'previous') return
    let current = true
    void fetch('/api/portal/bill-center', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(result => { if (current && Array.isArray(result?.bills)) setSourceBills(result.bills) }).catch(() => { if (current) setSourceBills([]) })
    return () => { current = false }
  }, [scheduleOpen, periodView])
  useEffect(() => {
    if (!scheduleOpen || periodView !== 'previous' || !selectedId) return
    let current = true
    void fetch(`/api/expenses/templates/${encodeURIComponent(selectedId)}/profile-bills`, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Previous profile bills could not be loaded.')
      const result = await response.json()
      if (!Array.isArray(result.linkedBills)) throw new Error('Previous profile bills could not be loaded.')
      if (current) { setProfileBills(result.linkedBills); setProfileBillsMore(result.hasMoreLinkedBills === true); setProfileBillsError(''); setProfileBillsLoading(false) }
    }).catch(() => { if (current) { setProfileBills([]); setProfileBillsMore(false); setProfileBillsError('Previous profile bills could not be loaded.'); setProfileBillsLoading(false) } })
    return () => { current = false }
  }, [scheduleOpen, periodView, selectedId, profileBillRefresh])
  const filtered = data.templates.filter(template => (status === 'all' || template.is_active === (status === 'active')) && (amountType === 'all' || template.is_variable === (amountType === 'variable')) && [template.name, template.vendor_name, template.category].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())).sort((a,b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name))
  const pageCount = Math.max(1, Math.ceil(filtered.length / 15)), currentPage = Math.min(page, pageCount)
  const periods = data.expenses.filter(expense => expense.recurring_template_id === selectedId).sort((a,b) => String(a.due_date || a.incurred_on).localeCompare(String(b.due_date || b.incurred_on)))
  const visiblePeriods = periods.filter(expense => {
    const isPrevious = (expense.due_date || expense.incurred_on) < todayKey() || ['paid', 'cancelled'].includes(expense.payment_status) || Boolean(expense.matched_expense_id)
    return periodView === 'previous' ? isPrevious : !isPrevious
  }).sort((a, b) => periodView === 'previous' ? String(b.due_date || b.incurred_on).localeCompare(String(a.due_date || a.incurred_on)) : String(a.due_date || a.incurred_on).localeCompare(String(b.due_date || b.incurred_on)))
  const previousProfileBills = periodView === 'previous' ? profileBills.filter(bill => !periods.some(period => {
    const expense = period.matched_expense_id ? data.expenses.find(item => item.id === period.matched_expense_id) : period
    return expense?.source_bill_id === bill.id
  })) : []
  const visibleEntries: Array<{ kind: 'period'; period: ExpenseRow; date: string } | { kind: 'bill'; bill: LuxorBill; date: string }> = [
    ...visiblePeriods.map(period => ({ kind: 'period' as const, period, date: period.due_date || period.incurred_on || '' })),
    ...previousProfileBills.map(bill => ({ kind: 'bill' as const, bill, date: bill.due_date || '' })),
  ].sort((a, b) => periodView === 'previous' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))
  const periodPages = Math.max(1, Math.ceil(visibleEntries.length / 8)), currentPeriodPage = Math.min(periodPage, periodPages)
  const latestMatchedBill = periods.flatMap(period => {
    const expense = period.matched_expense_id ? data.expenses.find(item => item.id === period.matched_expense_id) : period
    if (!expense || !expense.source_bill_id || expense.status === 'cancelled') return []
    const bill = data.bills.find(item => item.id === expense.source_bill_id && item.payment_ready_at && item.extraction_status === 'ready')
    return bill ? [{ bill, expense }] : []
  }).sort((a, b) => String(b.bill.due_date || b.bill.issue_date || '').localeCompare(String(a.bill.due_date || a.bill.issue_date || '')))[0] || null
  const nextPeriod = periods.find(expense => (expense.due_date || expense.incurred_on) >= todayKey() && !['paid', 'cancelled'].includes(expense.payment_status) && !expense.matched_expense_id)
  function openTemplate(id: string) { setSupplierWebsite(null); setLogoFailed(false); setProfileBills([]); setProfileBillsError(''); setProfileBillsMore(false); setProfileBillsLoading(false); setSelectedId(id); setScheduleOpen(true); setPeriodPage(1); setPeriodView('upcoming') }
  return <>
    {!panelOnly && (
      <PortalTableCard
        controls={
          <div className="px-4 py-3 sm:px-6">
            <PortalFilterBar
              searchValue={search}
              onSearchChange={(value) => {
                setSearch(value)
                setPage(1)
              }}
              searchPlaceholder="Search recurring costs"
              resultLabel={`${filtered.length} ${filtered.length === 1 ? 'cost' : 'costs'}`}
              activeFilters={[
                ...(status !== 'all' ? [{ id: 'status', label: status === 'active' ? 'Active' : 'Paused', onRemove: () => { setStatus('all'); setPage(1) } }] : []),
                ...(amountType !== 'all' ? [{ id: 'amount', label: amountType === 'variable' ? 'Amount varies' : 'Fixed amount', onRemove: () => { setAmountType('all'); setPage(1) } }] : []),
              ]}
              onClearFilters={() => {
                setStatus('all')
                setAmountType('all')
                setPage(1)
              }}
              actions={
                <PortalButton
                  type="button"
                  variant="primary"
                  onClick={onAdd}
                  aria-label="Add recurring cost"
                  title="Add recurring cost"
                  className="md:hidden aspect-square shrink-0 !size-9.5 !min-h-9.5 !max-h-9.5 !min-w-9.5 !max-w-9.5 !p-0 !gap-0"
                >
                  <Plus size={15} aria-hidden="true" />
                </PortalButton>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <PortalSelect
                  value={status}
                  onChange={(value) => {
                    setStatus(value)
                    setPage(1)
                  }}
                  aria-label="Schedule status"
                  options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }]}
                  buttonClassName="min-h-11 w-full"
                />
                <PortalSelect
                  value={amountType}
                  onChange={(value) => {
                    setAmountType(value)
                    setPage(1)
                  }}
                  aria-label="Amount type"
                  options={[{ value: 'all', label: 'All amounts' }, { value: 'fixed', label: 'Fixed amount' }, { value: 'variable', label: 'Amount varies' }]}
                  buttonClassName="min-h-11 w-full"
                />
              </div>
            </PortalFilterBar>
          </div>
        }
        footer={
          pageCount > 1 ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <span className="text-xs tabular-nums text-[color:var(--portal-muted)]">
                {(currentPage - 1) * 15 + 1}–{Math.min(currentPage * 15, filtered.length)} of {filtered.length}
              </span>
              <PortalPagination currentPage={currentPage} totalPages={pageCount} onPageChange={setPage} scrollToTop={false} />
            </div>
          ) : null
        }
      >
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_1rem] gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 px-6 py-3 text-xs font-semibold text-[color:var(--portal-muted)] md:grid">
          <span>Cost / company</span>
          <span>Repeats</span>
          <span className="text-right">Expected amount</span>
          <span>Status</span>
          <span />
        </div>
        <div className="divide-y divide-[color:var(--portal-border)]">
          {filtered.slice((currentPage - 1) * 15, currentPage * 15).map((template) => (
            <button
              type="button"
              key={template.id}
              onClick={() => openTemplate(template.id)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[color:var(--portal-soft)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/50 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_1rem] md:gap-4 md:px-6"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{template.name}</span>
                <span className="mt-1 block truncate text-xs text-[color:var(--portal-muted)]">
                  {template.vendor_name || template.category}
                  <span className="md:hidden"> · {recurringFrequency(template)}{!template.is_active ? ' · Paused' : ''}</span>
                </span>
              </span>
              <span className="hidden text-sm text-[color:var(--portal-muted)] md:block">{recurringFrequency(template)}</span>
              <span className="text-right text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{template.is_variable ? 'Varies' : money(template.expected_amount)}</span>
              <span className={`hidden text-xs md:block ${template.is_active ? 'text-emerald-700 dark:text-emerald-300' : 'text-[color:var(--portal-muted)]'}`}>
                {template.is_active ? 'Active' : 'Paused'}
              </span>
              <CaretRight size={15} className="text-[color:var(--portal-muted)]" />
            </button>
          ))}
        </div>
        {!filtered.length ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-semibold text-[color:var(--portal-text)]">{data.templates.length ? 'No matching recurring costs' : 'No recurring costs yet'}</p>
            <p className="mt-2 text-sm text-[color:var(--portal-muted)]">{data.templates.length ? 'Try another search or clear the filters.' : 'Add rent, utilities, or subscriptions to track expected bills.'}</p>
            {!data.templates.length ? <PortalButton className="mt-4" onClick={onAdd}>Add recurring cost</PortalButton> : null}
          </div>
        ) : null}
      </PortalTableCard>
    )}
    <PortalModal isOpen={scheduleOpen && (Boolean(selected) || panelOnly)} onClose={() => { setScheduleOpen(false); onClose?.() }} title={selected?.vendor_name || selected?.name || 'Recurring cost'} description={selected?.category || undefined} headerIcon={<span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]">{supplierWebsite && !logoFailed ? <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(supplierWebsite).hostname)}&sz=64`} alt="" referrerPolicy="no-referrer" className="h-6 w-6 object-contain" onError={() => setLogoFailed(true)} /> : <Buildings size={18} />}</span>} sidePanel animateClose headerBack={panelOnly} maxWidth="max-w-[600px]">
      {loading ? <p role="status" className="text-sm text-[color:var(--portal-muted)]">Loading recurring cost…</p> : error ? <div role="alert" className="space-y-3 text-sm text-[color:var(--portal-muted)]"><p>{error}</p>{onRetry ? <PortalButton onClick={onRetry}>Try again</PortalButton> : null}</div> : selected ? <div className="space-y-7">{selected.vendor_name && selected.vendor_name.toLowerCase() !== selected.name.toLowerCase() ? <p className="text-sm font-semibold text-[color:var(--portal-text)]">{selected.name}</p> : null}{message ? <p role="status" className="rounded-xl bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)]">{message}</p> : null}<RecurringCompanyDetails key={selected.id} templateId={selected.id} supplierName={selected.vendor_name || selected.name} latestMatchedBill={latestMatchedBill} onOpenBill={onOpenBill} onLinkedBill={() => setProfileBillRefresh(value => value + 1)} /><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium text-[color:var(--portal-muted)]">Expected amount · {recurringFrequency(selected).toLowerCase()}</p><p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-[color:var(--portal-text)]">{selected.is_variable ? 'Amount varies' : money(selected.expected_amount)}</p>{selected.is_variable ? <p className="mt-2 text-xs text-[color:var(--portal-muted)]">Enter the actual amount when each bill arrives.</p> : null}</div><div className="flex shrink-0 items-center"><button type="button" onClick={() => onEdit(selected)} aria-label="Edit schedule" title="Edit schedule" className="inline-flex h-11 w-8 items-center justify-center rounded-lg text-[color:var(--portal-muted)] opacity-75 transition-[color,background-color,opacity] hover:opacity-100 hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><NotePencil size={19} /></button><button type="button" disabled={busy} onClick={() => onToggle(selected)} aria-label={selected.is_active ? 'Pause schedule' : 'Resume schedule'} title={selected.is_active ? 'Pause schedule' : 'Resume schedule'} className="inline-flex h-11 w-8 items-center justify-center rounded-lg text-[color:var(--portal-muted)] opacity-75 transition-[color,background-color,opacity] hover:opacity-100 hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:opacity-50">{selected.is_active ? <Pause size={19} weight="fill" /> : <Play size={19} />}</button><span aria-hidden="true" className="ml-1 mr-3 h-5 w-px bg-[color:var(--portal-border)]" /><span className={`text-xs font-semibold ${selected.is_active ? 'text-emerald-700 dark:text-emerald-300' : 'text-[color:var(--portal-muted)]'}`}>{selected.is_active ? 'Active' : 'Paused'}</span></div></div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">{[['Next expected', nextPeriod ? formatDate(nextPeriod.due_date || nextPeriod.incurred_on) : 'Not scheduled'], ['Category', selected.category], ['Starts', formatDate(selected.start_date)], ['Ends', selected.end_date ? formatDate(selected.end_date) : 'No end date'], ['Payment method', selected.payment_method || 'Not set']].map(([label,value]) => <div key={label}><dt className="text-xs text-[color:var(--portal-muted)]">{label}</dt><dd className="mt-1 tabular-nums text-[color:var(--portal-text)]">{value}</dd></div>)}</dl>
        {selected.notes ? <p className="whitespace-pre-wrap text-sm leading-6 text-[color:var(--portal-muted)]">{selected.notes}</p> : null}
        <section className="border-t border-[color:var(--portal-border)] pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-bold text-[color:var(--portal-text)]">Bills</h3><PortalAnimatedTabs tabs={[{ id: 'upcoming', label: 'Expected' }, { id: 'previous', label: 'Previous' }]} activeTab={periodView} onTabChange={value => { setPeriodView(value); setPeriodPage(1); if (value === 'previous') setProfileBillsLoading(true) }} ariaLabel="Bill periods" variant="slider" className="!w-fit" /></div><p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">{periodView === 'upcoming' ? 'Upcoming charges on this schedule.' : 'Past charges and completed or skipped bills on this schedule.'}</p>
          <div className={visibleEntries.length ? "mt-4 divide-y divide-[color:var(--portal-border)] overflow-hidden rounded-xl border border-[color:var(--portal-border)]" : ""}>{visibleEntries.slice((currentPeriodPage-1)*8,currentPeriodPage*8).map(entry => { if (entry.kind === 'bill') { const bill = entry.bill; const source = sourceBills.find(item => item.id === bill.id); return <article key={`bill-${bill.id}`} className="px-4 py-3"><button type="button" onClick={() => onOpenBill(bill.id)} className="flex min-h-11 w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[color:var(--portal-text)]">{bill.service}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{bill.due_date ? formatDate(bill.due_date) : 'No due date'} · Reviewed bill</span></span><span className="text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{bill.amount_state === 'known' ? money(bill.amount) : 'Amount unknown'}</span><CaretRight size={15} className="text-[color:var(--portal-muted)]" /></button>{source && source.source_message_id && source.source_attachment_id ? <BillDocumentPreview bill={source} /> : null}</article> } const expense = entry.period; const sourceExpense = expense.matched_expense_id ? data.expenses.find(item => item.id === expense.matched_expense_id) : expense; const sourceBill = sourceBills.find(bill => bill.id === sourceExpense?.source_bill_id && bill.source_message_id && bill.source_attachment_id); return <article key={expense.id} className="px-4 py-3"><button type="button" onClick={() => onViewExpense(expense.matched_expense_id || expense.id)} className="flex min-h-11 w-full items-center gap-3 rounded-lg text-left transition-colors hover:text-[#9a712e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{formatDate(expense.due_date || expense.incurred_on)}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{expense.matched_expense_id ? 'Matched to a recorded expense' : expense.payment_status.replaceAll('_',' ')}</span></span><span className="text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{expenseAmountLabel(expense)}</span><CaretRight size={15} className="text-[color:var(--portal-muted)]" /></button>{!expense.matched_expense_id && !['paid','cancelled'].includes(expense.payment_status) ? <div className="mt-2 flex gap-2"><PortalButton size="sm" className="min-h-11 sm:min-h-9" onClick={() => onEditExpense(expense)}>Edit amount or date</PortalButton><PortalButton size="sm" className="min-h-11 sm:min-h-9" disabled={busy} onClick={() => onSkip(expense)}>Skip this bill</PortalButton></div> : null}{periodView === 'previous' && sourceBill ? <BillDocumentPreview bill={sourceBill} /> : null}</article>})}</div>
          {profileBillsLoading && periodView === 'previous' ? <p role="status" className="mt-3 text-xs text-[color:var(--portal-muted)]">Loading previous bills…</p> : null}{profileBillsError && periodView === 'previous' ? <p role="alert" className="mt-3 text-xs text-[color:var(--portal-muted)]">{profileBillsError} <button type="button" onClick={() => { setProfileBillsLoading(true); setProfileBillRefresh(value => value + 1) }} className="font-semibold text-[#9a712e] dark:text-[#e6c77f]">Try again</button></p> : null}{!visibleEntries.length && !profileBillsError && !profileBillsLoading ? <p className="py-6 text-sm text-[color:var(--portal-muted)]">{periodView === 'previous' ? 'No previous bills on this schedule yet.' : 'No upcoming bills on this schedule.'}</p> : null}{profileBillsMore && periodView === 'previous' ? <p className="mt-3 text-xs text-[color:var(--portal-muted)]">Showing the latest 100 bills added to this profile.</p> : null}
          {periodPages > 1 ? <div className="mt-4 flex justify-end"><PortalPagination currentPage={currentPeriodPage} totalPages={periodPages} onPageChange={setPeriodPage} scrollToTop={false} /></div> : null}
        </section>
      </div> : <p role="alert" className="text-sm text-[color:var(--portal-muted)]">This recurring cost is no longer available.</p>}
    </PortalModal>
  </>
}

function BusinessView({ data, categoryOptions, categoryFilter, setCategoryFilter, statusFilter, setStatusFilter, query, setQuery, onAdd, onEdit, onCancel, onOpen, onManageCategories, loading }: {
  data: ExpenseManagementData; categoryOptions: Array<{ value: string; label: string }>; categoryFilter: string; setCategoryFilter: (value: string) => void; statusFilter: string; setStatusFilter: (value: string) => void; query: string; setQuery: (value: string) => void; onAdd: () => void; onEdit: (expense: ExpenseRow) => void; onCancel: (expense: ExpenseRow) => void; onOpen: (id: string) => void; onManageCategories: () => void; loading: boolean;
}) {
  const [page, setPage] = useState(1)
  const businessExpenses = data.expenses.filter(expense => !expense.booking_id && expense.expense_type !== 'event' && !expense.matched_expense_id && (!expense.metadata?.generated_from_template || expense.source_bill_id || expense.payments.length > 0 || ['paid', 'incurred'].includes(expense.status)))
  const filtered = businessExpenses.filter(expense => (categoryFilter === 'all' || expense.category === categoryFilter) && (statusFilter === 'all' || expense.payment_status === statusFilter) && (!query.trim() || `${expense.description} ${expense.vendor_name} ${expense.category}`.toLowerCase().includes(query.trim().toLowerCase())))
  const pageCount = Math.max(1, Math.ceil(filtered.length / 15)), currentPage = Math.min(page, pageCount)
  return (
    <PortalTableCard
      controls={
        <div className="px-4 py-3 sm:px-6">
          <PortalFilterBar
            searchValue={query}
            onSearchChange={(value) => {
              setQuery(value)
              setPage(1)
            }}
            searchPlaceholder="Search business expenses"
            resultLabel={`${filtered.length} ${filtered.length === 1 ? 'expense' : 'expenses'}`}
            actions={data.can_manage_categories ? <PortalButton size="sm" onClick={onManageCategories}>Categories</PortalButton> : undefined}
            activeFilters={[
              ...(categoryFilter !== 'all' ? [{ id: 'category', label: categoryFilter, onRemove: () => { setCategoryFilter('all'); setPage(1) } }] : []),
              ...(statusFilter !== 'all' ? [{ id: 'status', label: expenseStatusLabel(statusFilter), onRemove: () => { setStatusFilter('all'); setPage(1) } }] : []),
            ]}
            onClearFilters={() => {
              setCategoryFilter('all')
              setStatusFilter('all')
              setPage(1)
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <PortalSelect
                value={categoryFilter}
                onChange={(value) => {
                  setCategoryFilter(value)
                  setPage(1)
                }}
                aria-label="Expense category"
                options={[{ value: 'all', label: 'All categories' }, ...categoryOptions]}
                buttonClassName="min-h-11 w-full"
              />
              <PortalSelect
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value)
                  setPage(1)
                }}
                aria-label="Expense status"
                options={[{ value: 'all', label: 'All statuses' }, ...['expected', 'due_today', 'overdue', 'partially_paid', 'paid', 'cancelled'].map((value) => ({ value, label: expenseStatusLabel(value) }))]}
                buttonClassName="min-h-11 w-full"
              />
            </div>
          </PortalFilterBar>
        </div>
      }
      footer={
        pageCount > 1 ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <span className="text-xs tabular-nums text-[color:var(--portal-muted)]">
              {(currentPage - 1) * 15 + 1}–{Math.min(currentPage * 15, filtered.length)} of {filtered.length}
            </span>
            <PortalPagination currentPage={currentPage} totalPages={pageCount} onPageChange={setPage} scrollToTop={false} />
          </div>
        ) : null
      }
    >
      {filtered.length ? (
        <ExpenseTable expenses={filtered.slice((currentPage - 1) * 15, currentPage * 15)} onOpen={onOpen} onEdit={onEdit} onCancel={onCancel} />
      ) : loading ? (
        <div className="space-y-3 p-5">
          <PortalSkeleton className="h-12 rounded-xl" />
          <PortalSkeleton className="h-12 rounded-xl" />
        </div>
      ) : (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-semibold text-[color:var(--portal-text)]">No matching business expenses</p>
          <p className="mt-2 text-sm text-[color:var(--portal-muted)]">Log an operating cost or review an incoming bill in Bills.</p>
          <PortalButton className="mt-4" onClick={onAdd}>Log expense</PortalButton>
        </div>
      )}
    </PortalTableCard>
  )
}

function ExpenseTable({ expenses, onOpen, onEdit, onCancel }: { expenses: ExpenseRow[]; onOpen: (id: string) => void; onEdit: (expense: ExpenseRow) => void; onCancel: (expense: ExpenseRow) => void }) {
  return <><div className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem_7.5rem_7rem] gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 px-6 py-3 text-xs font-semibold text-[color:var(--portal-muted)] lg:grid"><span>Expense / company</span><span>Total</span><span>Remaining</span><span>Status</span><span/></div><div className="divide-y divide-[color:var(--portal-border)]">{expenses.map(expense => <article key={expense.id} className="flex min-w-0 flex-col gap-2 px-4 py-4 lg:grid lg:grid-cols-[minmax(0,1fr)_8rem_7rem_7.5rem_7rem] lg:items-center lg:gap-3 lg:px-6"><button type="button" onClick={() => onOpen(expense.id)} className="min-h-11 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{expense.description || 'Expense'}</span><span className="mt-1 block truncate text-xs text-[color:var(--portal-muted)]">{expense.vendor_name || expense.category} · {formatDate(expense.incurred_on)}</span></button><span className="text-sm font-semibold tabular-nums text-[color:var(--portal-text)]"><span className="mr-1 font-normal lg:hidden">Total</span>{expenseAmountLabel(expense)}</span><span className="text-xs tabular-nums text-[color:var(--portal-muted)]"><span className="mr-1 lg:hidden">Remaining</span>{hasKnownAmount(expense) ? money(expense.remaining_balance ?? 0) : 'Pending'}</span><span><StatusBadge status={expense.payment_status}/></span><span className="flex gap-2 lg:justify-end"><button type="button" onClick={() => onEdit(expense)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-[#9a712e] hover:bg-[#caa24c]/10 dark:text-[#e6c77f]">Edit</button>{!['paid','cancelled'].includes(expense.payment_status) ? <button type="button" onClick={() => onCancel(expense)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)]">Cancel</button> : null}</span></article>)}</div></>
}

function EventExpensesView({ data, ledger, selectedBooking, setSelectedBooking, onAdd, onOpenExpense }: { data: ExpenseManagementData; ledger: FinanceLedgerData; selectedBooking: string; setSelectedBooking: (value: string) => void; onAdd: (bookingId: string) => void; onOpenExpense: (id: string) => void }) {
  const eventExpenses = data.expenses.filter((expense) => expense.status !== 'cancelled' && (expense.booking_id || expense.expense_type === 'event'))
  const bookings = data.bookings.filter((booking) => eventExpenses.some((expense) => expense.booking_id === booking.id) || booking.status !== 'cancelled')
  const [search, setSearch] = useState('')
  const filteredBookings = bookings.filter(booking => (selectedBooking === 'all' || booking.id === selectedBooking) && [booking.client_name, booking.event_type, booking.event_date].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()))
  const byBooking = new Map<string, ExpenseRow[]>()
  for (const expense of eventExpenses) if (expense.booking_id) byBooking.set(expense.booking_id, [...(byBooking.get(expense.booking_id) || []), expense])
  return <div className="space-y-5">
    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 sm:px-6"><PortalFilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search client or event" resultLabel={`${filteredBookings.length} ${filteredBookings.length === 1 ? 'event' : 'events'}`} activeFilters={selectedBooking !== 'all' ? [{id:'event',label:bookings.find(booking => booking.id === selectedBooking)?.client_name || 'Selected event',onRemove:()=>setSelectedBooking('all')}] : []}><PortalSelect aria-label="Event" value={selectedBooking} onChange={setSelectedBooking} options={[{value:'all',label:'All events'},...bookings.map(booking=>({value:booking.id,label:`${booking.client_name} · ${booking.event_type || 'Event'}${booking.event_date ? ` · ${formatDate(booking.event_date)}` : ''}`}))]} buttonClassName="min-h-11 w-full"/></PortalFilterBar></section>
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
        {rows.length ? <ExpenseRows expenses={rows} bookingById={new Map([[booking.id, booking]])} onOpen={onOpenExpense} /> : <div className="p-4"><EmptyState title="No expenses for this booking" detail="Add event-specific costs here. Rent, utilities, and other overhead belong in Business Expenses." /></div>}
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
    {data.bills.length ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Email-extracted vendor invoices remain in the Bills workspace until reviewed. Open the <Link href="/portal/finances?view=bill-review" className="font-semibold text-[#9a712e] underline underline-offset-2 dark:text-[#e6c77f]">bill ledger</Link> to review their source attachments.</p> : null}
  </div>
}

function ExpenseDetailView({ expense, data, booking, onBack, onEdit, onCancel, onPay, onOpenAdjust, compact = false, onOpenBill }: { expense: ExpenseRow | null; data: ExpenseManagementData; booking: ExpenseBooking | null; onBack: () => void; onEdit?: () => void; onCancel?: () => void; onPay: () => void; onOpenAdjust: () => void; compact?: boolean; onOpenBill?: (billId: string) => void }) {
  if (!expense) return <EmptyState title="Expense not found" detail="This record may have been canceled or the link may be out of date." />
  const linkedReceipts = data.receipts.filter((receipt) => receipt.expense_id === expense.id)
  const linkedBill = expense.source_bill_id ? data.bills.find((bill) => bill.id === expense.source_bill_id) : null
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">{!compact && <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"><ArrowLeft size={15} /> Back</button>}<div className="flex flex-wrap gap-2">{onEdit ? <PortalButton type="button" onClick={onEdit}>Edit</PortalButton> : null}{expense.payment_status !== 'paid' && expense.payment_status !== 'cancelled' && hasKnownAmount(expense) ? <PortalButton type="button" variant="primary" onClick={onPay}>Record payment</PortalButton> : null}{expense.paid_amount > 0 && expense.payment_status !== 'cancelled' ? <PortalButton type="button" onClick={onOpenAdjust}>Record refund</PortalButton> : null}{expense.payment_status !== 'cancelled' && onCancel ? <PortalButton type="button" onClick={onCancel}>Cancel expense</PortalButton> : null}</div></div>
    <div className={`grid gap-4 ${compact ? '' : 'xl:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.8fr)]'}`}>
      <section className={`${CARD_CLASS} p-4 sm:p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-sans text-lg font-bold text-[color:var(--portal-text)]">{expense.description || 'Expense'}</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">{expense.vendor_name || 'Vendor not set'} · {expense.category}</p></div><StatusBadge status={expense.payment_status} /></div>
        <div className={`mt-5 grid gap-3 sm:grid-cols-2 ${compact ? '' : 'xl:grid-cols-4'}`}>{[
          ['Total expense', expenseAmountLabel(expense)], ['Amount paid', hasKnownAmount(expense) ? money(expense.paid_amount) : 'Awaiting bill'], ['Remaining balance', hasKnownAmount(expense) ? money(expense.remaining_balance) : 'Awaiting bill'], ['Expense date', formatDate(expense.incurred_on)],
          ['Due date', formatDate(expense.due_date)], ['Payment method', expense.payment_method || 'Not recorded'], ['Reference', expense.reference_number || '—'], ['Created', formatDate(expense.created_at?.slice(0, 10))],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 p-3"><p className="text-[10px] text-[color:var(--portal-muted)]">{label}</p><p className="mt-1 break-words text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{value}</p></div>)}</div>
        {expense.notes ? <div className="mt-4 rounded-xl border border-[color:var(--portal-border)] p-3"><p className="text-xs font-semibold text-[color:var(--portal-text)]">Notes</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[color:var(--portal-muted)]">{expense.notes}</p></div> : null}
        {booking ? <Link href={`/portal/planner/event/${encodeURIComponent(booking.id)}`} className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 px-3 hover:border-[#caa24c]/50 hover:bg-[color:var(--portal-soft)]"><span className="min-w-0"><span className="block text-xs font-semibold text-[color:var(--portal-text)]">{booking.client_name} · {booking.event_type || 'Event'}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{formatDate(booking.event_date)} · Open booking</span></span><ArrowRight size={15} className="shrink-0 text-[color:var(--portal-muted)]" /></Link> : null}
        {linkedBill && onOpenBill ? <PortalButton className="mt-3" onClick={() => onOpenBill(linkedBill.id)}>View original bill</PortalButton> : linkedBill ? <Link href={`/portal/finances?view=bill-review&bill=${encodeURIComponent(linkedBill.id)}`} className="mt-3 block rounded-xl border border-[color:var(--portal-border)] px-3 py-3 text-xs text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)]">Source bill: <strong className="text-[color:var(--portal-text)]">{linkedBill.provider} · {linkedBill.service}</strong><span className="ml-2 font-semibold text-[#9a712e] dark:text-[#e6c77f]">Open source</span></Link> : null}
      </section>
      <section className={`${CARD_CLASS} p-4 sm:p-5`}><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Receipt attachments</h2>{linkedReceipts.length ? <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{linkedReceipts.map((receipt) => <li key={receipt.id} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{receipt.file_name}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{receipt.content_type}</span></span><a href={`/api/expenses/receipts/${encodeURIComponent(receipt.id)}?download=0`} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-[#9a712e] hover:bg-[#caa24c]/10 dark:text-[#e6c77f]">Preview</a></li>)}</ul> : <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">No receipt is attached. Add one in Receipts &amp; Records.</p>}<LinkButton href="/portal/finances/expenses/receipts">Open receipt library <ArrowRight size={14} /></LinkButton></section>
    </div>
    <section className={`${CARD_CLASS} overflow-hidden`}><div className="border-b border-[color:var(--portal-border)] px-4 py-4 sm:px-5"><h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Payment history</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Each payment, refund, and reversal stays as its own transaction.</p></div>{expense.payments?.length ? <div className="divide-y divide-[color:var(--portal-border)]">{expense.payments.map((payment) => <div key={payment.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><span><span className="block text-sm font-semibold text-[color:var(--portal-text)]">{payment.transaction_type === 'payment' ? 'Payment recorded' : payment.transaction_type === 'refund' ? 'Refund recorded' : 'Reversal recorded'}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{formatDate(payment.payment_date)} · {payment.payment_method || 'Method not recorded'}{payment.reference_number ? ` · ${payment.reference_number}` : ''}</span></span><strong className={`tabular-nums text-sm ${payment.transaction_type === 'payment' ? 'text-[color:var(--portal-text)]' : 'text-emerald-700 dark:text-emerald-300'}`}>{payment.transaction_type === 'payment' ? '−' : '+'}{money(payment.amount)}</strong></div>)}</div> : expense.status === 'paid' ? <div className="px-4 py-3 text-xs leading-5 text-[color:var(--portal-muted)] sm:px-5">This legacy expense was saved as paid before individual payment history was introduced.</div> : <div className="p-4"><EmptyState title="No payment transactions recorded" detail="Expected and unpaid amounts do not count as cash outflow." /></div>}</section>
  </div>
}
