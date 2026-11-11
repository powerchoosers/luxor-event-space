'use client'

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle, ArrowUpRight, Check, CheckCircle2, ChevronDown, ChevronRight,
  Building2, Clock3, CreditCard, FileCheck2, FilePenLine, FileText, Inbox, Mail, Plus, ShieldCheck, X,
} from '@/lib/icons/phosphor-compat'
import { PortalAnimatedTabs, PortalButton, PortalCloseButton, PortalFilterBar, PortalGhostIconButton, PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import { formatLuxorDate } from '@/lib/luxorDateFormatting'
import ManualBillAnalysis from '@/components/portal/ManualBillAnalysis'
import BillPlanning from '@/components/portal/BillPlanning'
import BillDocumentPreview from '@/components/portal/BillDocumentPreview'
import VendorBusinessDetails from '@/components/portal/VendorBusinessDetails'
import VendorDocuments from '@/components/portal/VendorDocuments'
import RecurringBillMatch from '@/components/portal/RecurringBillMatch'
import type { LuxorBill, LuxorBillIntake, LuxorVendor } from '@/lib/luxorInquiryTypes'
import { isLuxorBillCategory } from '@/lib/luxorBillCategories'
import { getBillBalance, type BillBalance, type BillExpense } from '@/lib/luxorBillBalances'
import { billReminders, type BillReminderPreference } from '@/lib/luxorBillReminders'

type LedgerTab = 'all' | 'review' | 'due' | 'ready' | 'paid' | 'hold'

const VENDOR_DOMAINS: Record<string, string> = {
  'at&t business': 'business.att.com',
  'honeybook inc.': 'honeybook.com',
  'txu energy': 'txu.com',
  'zoho corp': 'zoho.com',
}

const PERSONAL_EMAIL_DOMAINS = new Set(['gmail.com', 'hotmail.com', 'icloud.com', 'outlook.com', 'yahoo.com'])

function chicagoToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-')
}

function dueDayOffset(dueDate: string, today: string) {
  const due = dueDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null
  const [year, month, day] = due.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
}

function money(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(value || 0))
}

function billAmount(bill: LuxorBill) {
  if (bill.amount_state === 'unknown') return 'Amount unknown'
  if (bill.amount_state === 'variable') return 'Variable amount'
  return `${money(bill.amount, bill.currency)}${bill.amount_state == null ? ' (unconfirmed)' : ''}`
}

function dateLabel(value: string | null) {
  if (!value) return 'No due date'
  return formatLuxorDate(value) || 'Unknown date'
}

function shortDate(value: string | null) {
  if (!value) return 'No due date'
  const day = value.slice(0, 10)
  if (dueDayOffset(day, chicagoToday()) === null) return 'Unknown date'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
}

function relativeDue(value: string | null) {
  if (!value) return 'Due date missing'
  const days = dueDayOffset(value, chicagoToday())
  if (days === null) return 'Due date missing'
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  return `Due in ${days}d`
}

function ledgerStatus(bill: LuxorBill): LedgerTab {
  if (bill.status === 'paid') return 'paid'
  if (bill.extraction_status === 'needs_review' || bill.extraction_status === 'failed') return 'review'
  if (bill.extraction_status === 'duplicate' || bill.duplicate_of_bill_id) return 'hold'
  const days = bill.due_date ? dueDayOffset(bill.due_date, chicagoToday()) : null
  if (days !== null && days <= 7) return 'due'
  if (bill.payment_ready_at || bill.extraction_status === 'ready') return 'ready'
  return 'all'
}

function statusLabel(bill: LuxorBill) {
  if (bill.archived_at) return { label: 'Archived', color: 'text-[color:var(--portal-muted)] bg-[color:var(--portal-soft)]' }
  const status = ledgerStatus(bill)
  if (status === 'review') return { label: 'Needs review', color: 'text-amber-700 dark:text-amber-300 bg-amber-500/10' }
  if (status === 'paid') return { label: 'Paid', color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10' }
  if (status === 'hold') return { label: 'On hold', color: 'text-rose-700 dark:text-rose-300 bg-rose-500/10' }
  if (status === 'due') return { label: relativeDue(bill.due_date), color: 'text-rose-700 dark:text-rose-300 bg-rose-500/10' }
  if (status === 'ready') return { label: 'Ready to pay', color: 'text-blue-700 dark:text-blue-300 bg-blue-500/10' }
  return { label: 'Open', color: 'text-[color:var(--portal-muted)] bg-[color:var(--portal-soft)]' }
}


function vendorDomain(bill: LuxorBill) {
  const knownDomain = VENDOR_DOMAINS[bill.provider.trim().toLowerCase()]
  if (knownDomain) return knownDomain
  const senderDomain = bill.source_sender?.match(/@([^>\s]+)$/)?.[1]?.toLowerCase().replace(/[>,.;]+$/, '')
  return senderDomain && !PERSONAL_EMAIL_DOMAINS.has(senderDomain) ? senderDomain : null
}

export function BillsPayableLedger({
  bills, intakes, vendors, invoiceAnalysisConfigured, resendReceivingConfigured, onAddBill, onBillChanged, onEditBill,
  onIntakeChanged, onVendorChanged, onOpenExpense, onCreateExpense, refreshKey = 0,
}: {
  bills: LuxorBill[]
  refreshKey?: number
  intakes: LuxorBillIntake[]
  invoiceAnalysisConfigured: boolean | null
  resendReceivingConfigured: boolean | null
  vendors: LuxorVendor[]
  onVendorChanged: (vendor: LuxorVendor) => void
  onAddBill: () => void
  onBillChanged: (bill: LuxorBill) => void
  onIntakeChanged: (intake: LuxorBillIntake) => void
  onEditBill: (bill: LuxorBill) => void
  onOpenExpense?: (id: string) => void
  onCreateExpense?: (billId: string) => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [tab, setTab] = useState<LedgerTab>('all')
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('bill'))
  const [closingBill, setClosingBill] = useState<LuxorBill | null>(null)
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('all')
  const [vendor, setVendor] = useState(() => searchParams.get('company') || 'all')
  const [companyChoice, setCompanyChoice] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [dueWindow, setDueWindow] = useState('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showAllIntakeIssues, setShowAllIntakeIssues] = useState(false)
  const [expenses, setExpenses] = useState<BillExpense[] | null>(null)
  const [reminders, setReminders] = useState<BillReminderPreference[] | null>(null)
  const selected = bills.find((bill) => bill.id === selectedId) || null
  const displayedBill = selected || closingBill
  const failedIntakes = intakes.filter((intake) => intake.status === 'failed')
  const attentionIntakes = intakes.filter((intake) => ['failed', 'ignored'].includes(intake.status))
  const processingIntakes = intakes.filter((intake) => intake.status === 'received' || intake.status === 'processing')

  useEffect(() => {
    let active = true
    fetch('/api/portal/bill-center', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Reminders unavailable')
      const result = await response.json()
      if (active) setReminders(Array.isArray(result.reminders) ? result.reminders : null)
    }).catch(() => { if (active) setReminders(null) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const response = await fetch('/api/expenses', { cache: 'no-store' })
        if (!response.ok || response.headers.get('X-Luxor-Expense-History') === 'legacy-only') throw new Error('Payment history unavailable')
        const records: unknown = await response.json()
        if (!Array.isArray(records)) throw new Error('Expense data unavailable')
        if (active) setExpenses(records as BillExpense[])
      } catch { if (active) setExpenses(null) }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh) }
  }, [refreshKey])
  useEffect(() => { setVendor(searchParams.get('company') || 'all') }, [searchParams])
  useEffect(() => { setSelectedId(searchParams.get('bill')) }, [searchParams])

  const counts = useMemo(() => Object.fromEntries((['review', 'due', 'ready', 'paid', 'hold'] as LedgerTab[])
    .map((key) => [key, bills.filter((bill) => !bill.archived_at && ledgerStatus(bill) === key).length])), [bills])
  const vendorOptions = useMemo(() => [{ value: 'all', label: 'All companies' }, ...vendors.filter((item) => bills.some((bill) => !bill.archived_at && bill.vendor_id === item.id)).map((item) => ({ value: item.id, label: item.name }))], [bills, vendors])
  const openBills = bills.filter((bill) => !bill.archived_at && bill.status !== 'paid' && bill.extraction_status !== 'duplicate' && !bill.duplicate_of_bill_id)
  const openBalances = openBills.map((bill) => getBillBalance(bill, expenses))
  const knownDue = openBalances.reduce((sum, balance) => sum + (balance.remaining ?? 0), 0)
  const unresolvedCount = openBalances.filter((balance) => balance.remaining === null).length
  const nextDue = openBills
    .map((bill, index) => ({ bill, remaining: openBalances[index]?.remaining }))
    .filter((item) => item.bill.due_date && item.remaining !== 0)
    .sort((a, b) => String(a.bill.due_date).localeCompare(String(b.bill.due_date)))[0]?.bill
  const today = chicagoToday()
  const visible = useMemo(() => bills.filter((bill) => {
    if (bill.archived_at) return false
    if (tab !== 'all' && ledgerStatus(bill) !== tab) return false
    if (source !== 'all' && bill.source_type !== source) return false
    if (vendor !== 'all' && bill.vendor_id !== vendor) return false
    if (dueWindow !== 'all') {
      if (!bill.due_date) return dueWindow === 'missing'
      if (dueWindow === 'missing') return false
      const days = dueDayOffset(bill.due_date, today)
      if (days === null) return false
      if (dueWindow === 'overdue' && days >= 0) return false
      if (dueWindow === '7' && (days < 0 || days > 7)) return false
      if (dueWindow === '30' && (days < 0 || days > 30)) return false
    }
    const haystack = `${bill.provider} ${bill.service} ${bill.invoice_number || ''} ${bill.source_subject || ''}`.toLowerCase()
    return !query.trim() || haystack.includes(query.trim().toLowerCase())
  }), [bills, dueWindow, query, source, tab, today, vendor])

  const groups = useMemo(() => {
    const order: LedgerTab[] = ['review', 'due', 'ready', 'paid', 'hold', 'all']
    return order.map((key) => ({ key, rows: visible.filter((bill) => ledgerStatus(bill) === key) })).filter((group) => group.rows.length)
  }, [visible])

  function selectBill(id: string | null) {
    if (!id && selected) setClosingBill(selected)
    setSelectedId(id)
    setCompanyChoice('')
    setCompanyName('')
    setMessage(null)
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('bill', id)
    else params.delete('bill')
    if (vendor !== 'all') params.set('company', vendor)
    else params.delete('company')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  async function openRelatedBill(id: string) {
    if (!bills.some((bill) => bill.id === id)) {
      try {
        const response = await fetch('/api/portal/bill-center', { cache: 'no-store' })
        if (!response.ok) throw new Error('The bill could not be loaded.')
        const result = await response.json()
        const bill = Array.isArray(result.bills) ? result.bills.find((item: LuxorBill) => item.id === id) : null
        if (!bill) throw new Error('The bill could not be loaded.')
        onBillChanged(bill)
      } catch { setMessage('The bill could not be loaded. Close this panel and refresh Bills.'); return }
    }
    selectBill(id)
  }

  async function review(action: 'approve' | 'flag' | 'mark_paid' | 'confirm_distinct') {
    if (!selected || busy) return
    setBusy(action)
    setMessage(null)
    try {
      const response = await fetch(`/api/operations/bills/${selected.id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, expectedUpdatedAt: selected.updated_at }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Bill review failed.')
      onBillChanged(payload)
      setMessage(action === 'approve' ? 'Approved and ready for payment.' : action === 'mark_paid' ? 'Payment recorded.' : action === 'confirm_distinct' ? 'Marked as a separate bill. Review its facts before approval.' : 'Kept in review with an owner flag.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Bill review failed.') }
    finally { setBusy(null) }
  }

  async function linkCompany(create: boolean) {
    if (!selected || busy) return
    setBusy('company')
    setMessage(null)
    try {
      const paid = selected.status === 'paid'
      const response = await fetch(`/api/operations/bills/${selected.id}/${paid ? 'paid-provider' : 'company'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(create ? { name: companyName } : { vendorId: companyChoice }), expectedUpdatedAt: selected.updated_at, ...(paid ? { confirmed: true } : {}) }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Company link failed.')
      onBillChanged(result.bill)
      onVendorChanged({ ...vendors.find((item) => item.id === result.vendor.id), ...result.vendor })
      setCompanyChoice('')
      setCompanyName('')
      setMessage(paid ? 'Provider linked. The paid bill and its payment history are unchanged.' : 'Company linked. Review the bill before approving it.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Company link failed.') }
    finally { setBusy(null) }
  }

  async function intakeAction(intake: LuxorBillIntake, action: 'retry' | 'ignore') {
    setBusy(`${action}:${intake.id}`)
    try {
      const response = await fetch(`/api/operations/bills/intake/${intake.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Bill intake action failed.')
      onIntakeChanged(payload)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bill intake action failed.')
    } finally { setBusy(null) }
  }

  const activeReminders = reminders ? billReminders(bills.filter((bill) => !bill.archived_at), expenses, reminders, chicagoToday()) : []
  const dueOptions = [{ value: 'all', label: 'All due dates' }, { value: 'overdue', label: 'Overdue' }, { value: '7', label: 'Next 7 days' }, { value: '30', label: 'Next 30 days' }, { value: 'missing', label: 'Missing due date' }]
  const sourceOptions = [{ value: 'all', label: 'All sources' }, { value: 'email', label: 'Invoice inbox' }, { value: 'portal_upload', label: 'Uploaded' }, { value: 'manual', label: 'Entered manually' }]
  return <>
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
      <div className="border-b border-[color:var(--portal-border)] px-4 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-bold text-[color:var(--portal-text)]">Bills</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">Review incoming bills, track due dates, and see what’s paid.</p></div>
          <PortalButton type="button" size="sm" variant="primary" onClick={onAddBill} className="shrink-0"><Plus size={15} /> Add bill</PortalButton>
        </div>
        <details className="mt-3 text-xs text-[color:var(--portal-muted)]">
          <summary className="w-fit cursor-pointer py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">Inbox & balance summary{processingIntakes.length ? ` · ${processingIntakes.length} analyzing` : ''}{failedIntakes.length ? ` · ${failedIntakes.length} needs attention` : ''}</summary>
          <div className="space-y-3 pb-2 pt-2">
            <p className="tabular-nums">{expenses ? `${money(knownDue)} confirmed outstanding` : 'Payment balances unavailable'}{unresolvedCount ? ` · ${unresolvedCount} ${unresolvedCount === 1 ? 'bill has' : 'bills have'} an unverified balance` : ''}</p>
            {nextDue ? <p>Earliest open due date: {dateLabel(nextDue.due_date)} · {nextDue.provider}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 break-all"><Inbox size={16} className="shrink-0" /> invoices@luxoratlaspalmas.com</p><Link href="/portal/emails?mailbox=invoices" className="inline-flex min-h-10 items-center gap-1 font-semibold text-[#9a712e] dark:text-[#e6c77f]">Open inbox <ArrowUpRight size={13} /></Link></div>
            {activeReminders.length ? <ul className="space-y-2">{activeReminders.map(({ bill, remaining, days }) => <li key={bill.id}><button type="button" onClick={() => selectBill(bill.id)} className="min-h-10 text-left font-semibold text-[#9a712e] dark:text-[#e6c77f]">{bill.provider} · {days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : `Due in ${days} days`} · <span className="tabular-nums">{money(remaining)} remaining</span></button></li>)}</ul> : null}
          </div>
        </details>
        {resendReceivingConfigured === false ? <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-300">Email intake needs setup. Add bills here until receiving is connected.</p> : null}
        {invoiceAnalysisConfigured === false ? <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-300">Automatic analysis is unavailable. Enter bill details manually.</p> : null}
        {attentionIntakes.length ? <details className="mt-3 text-xs text-[color:var(--portal-text)]"><summary className="min-h-10 cursor-pointer py-2 font-semibold">{attentionIntakes.length} uploaded {attentionIntakes.length === 1 ? 'document needs' : 'documents need'} attention</summary><div className="divide-y divide-[color:var(--portal-border)]">{(showAllIntakeIssues ? attentionIntakes : attentionIntakes.slice(0, 4)).map((intake) => <div key={intake.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0"><p className="break-words font-semibold">{intake.filename}</p><p className="mt-1 text-[color:var(--portal-muted)]">{intake.status === 'ignored' ? (intake.last_error_message ? 'Analysis stopped after repeated failures' : 'Ignored') : intake.last_error_message || 'Analysis failed'}</p></div><div className="flex gap-2"><PortalButton size="sm" disabled={Boolean(busy)} onClick={() => void intakeAction(intake, 'retry')}>Retry</PortalButton>{intake.status !== 'ignored' ? <PortalButton size="sm" disabled={Boolean(busy)} onClick={() => void intakeAction(intake, 'ignore')}>Ignore</PortalButton> : null}</div></div>)}</div>{attentionIntakes.length > 4 ? <button type="button" onClick={() => setShowAllIntakeIssues((value) => !value)} aria-expanded={showAllIntakeIssues} className="min-h-11 font-semibold text-[#9a712e] dark:text-[#e6c77f]">{showAllIntakeIssues ? 'Show fewer' : `Show all ${attentionIntakes.length}`}</button> : null}</details> : null}
        {!selected && message ? <p role="status" className="mt-2 text-xs text-[color:var(--portal-text)]">{message}</p> : null}
      </div>
      <div className="border-b border-[color:var(--portal-border)] px-4 py-3 sm:px-6">
        <PortalAnimatedTabs variant="slider" ariaLabel="Bill status" tabs={[
          { id: 'all', label: 'All bills' }, { id: 'review', label: `Needs review${counts.review ? ` (${counts.review})` : ''}` }, { id: 'due', label: 'Due soon' }, { id: 'ready', label: 'Ready to pay' }, { id: 'paid', label: 'Paid' }, { id: 'hold', label: 'On hold' },
        ]} activeTab={tab} onTabChange={(value) => setTab(value as LedgerTab)} />
      </div>
      <div className="border-b border-[color:var(--portal-border)] px-4 py-3 sm:px-6">
        <PortalFilterBar searchValue={query} onSearchChange={setQuery} searchPlaceholder="Search company, bill or invoice" resultLabel={`${visible.length} ${visible.length === 1 ? 'bill' : 'bills'}`} activeFilters={[
          ...(dueWindow !== 'all' ? [{ id: 'due', label: dueOptions.find((item) => item.value === dueWindow)?.label || dueWindow, onRemove: () => setDueWindow('all') }] : []),
          ...(vendor !== 'all' ? [{ id: 'company', label: vendorOptions.find((item) => item.value === vendor)?.label || 'Company', onRemove: () => setVendor('all') }] : []),
          ...(source !== 'all' ? [{ id: 'source', label: sourceOptions.find((item) => item.value === source)?.label || source, onRemove: () => setSource('all') }] : []),
        ]} onClearFilters={() => { setSource('all'); setVendor('all'); setDueWindow('all') }}>
          <div className="grid gap-3 sm:grid-cols-3"><PortalSelect aria-label="Due date filter" value={dueWindow} onChange={setDueWindow} options={dueOptions} /><PortalSelect aria-label="Company filter" value={vendor} onChange={setVendor} options={vendorOptions} /><PortalSelect aria-label="Source filter" value={source} onChange={setSource} options={sourceOptions} /></div>
        </PortalFilterBar>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto portal-scrollbar">
        {!visible.length ? <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center"><FileCheck2 size={24} className="text-[color:var(--portal-faint)]" /><p className="mt-3 text-sm font-semibold text-[color:var(--portal-text)]">No bills in this view</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Change the filters or add a bill.</p></div> : groups.map((group) => <div key={group.key}>
          <div className="border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-2 sm:px-6"><p className="text-xs font-semibold text-[color:var(--portal-muted)]">{group.key === 'review' ? 'Needs review' : group.key === 'due' ? 'Due soon' : group.key === 'ready' ? 'Ready to pay' : group.key === 'paid' ? 'Paid' : group.key === 'hold' ? 'On hold' : 'Open bills'} <span className="ml-1 tabular-nums font-normal">{group.rows.length}</span></p></div>
          {group.rows.map((bill) => {
            const badge = statusLabel(bill)
            return <button key={bill.id} type="button" onClick={() => selectBill(bill.id)} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-[color:var(--portal-border)] px-4 py-4 text-left transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/40 sm:grid-cols-[minmax(0,1fr)_8rem_9rem_7rem_1rem] sm:px-6 ${selectedId === bill.id ? 'bg-[#caa24c]/[0.07]' : ''}`}>
              <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--portal-text)]"><span className="truncate">{bill.provider}</span>{bill.source_type === 'email' ? <Mail size={13} className="shrink-0 text-[color:var(--portal-muted)]" /> : null}</p><p className="mt-1 truncate text-xs text-[color:var(--portal-muted)]">{bill.service}{bill.invoice_number ? ` · #${bill.invoice_number}` : ''}</p></div>
              <span className="hidden text-xs tabular-nums text-[color:var(--portal-muted)] sm:block">{shortDate(bill.due_date)}</span>
              <p className="text-right text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{billAmount(bill)}</p>
              <span className={`w-fit rounded-md px-2 py-1 text-[11px] font-semibold ${badge.color}`}>{badge.label}</span><span className="text-right text-xs tabular-nums text-[color:var(--portal-muted)] sm:hidden">{shortDate(bill.due_date)}</span><ChevronRight size={15} className="hidden text-[color:var(--portal-faint)] sm:block" />
            </button>
          })}
        </div>)}
      </div>
    </section>
    <PortalModal
      isOpen={Boolean(selected)}
      onClose={() => { if (!busy) selectBill(null) }}
      title="Bill details"
      description={displayedBill?.service}
      sidePanel
      maxWidth="max-w-[600px]"
      animateClose
      headerAction={displayedBill ? (
        <div className="flex items-center gap-1">
          {!displayedBill.archived_at && displayedBill.status !== 'paid' ? (
            <PortalGhostIconButton
              size="sm"
              onClick={() => review('mark_paid')}
              disabled={Boolean(busy)}
              aria-label="Mark bill paid"
              title="Mark bill paid"
              className="!h-8 !w-8 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              <Check size={16} />
            </PortalGhostIconButton>
          ) : null}
          {!displayedBill.archived_at && displayedBill.status !== 'paid' ? (
            <PortalGhostIconButton
              size="sm"
              onClick={() => { if (selected) onEditBill(selected) }}
              disabled={Boolean(busy)}
              aria-label="Edit bill details"
              title="Edit bill details"
              className="!h-8 !w-8"
            >
              <FilePenLine size={16} />
            </PortalGhostIconButton>
          ) : null}
        </div>
      ) : null}
    >
      {displayedBill ? <BillReview key={displayedBill.id} bill={displayedBill} balance={getBillBalance(displayedBill, expenses)} busy={busy} message={message} onClose={() => selectBill(null)} onReview={review} onBillChanged={onBillChanged} onEdit={() => { if (selected) onEditBill(selected) }} vendors={vendors} companyChoice={companyChoice} setCompanyChoice={setCompanyChoice} companyName={companyName} setCompanyName={setCompanyName} onLinkCompany={linkCompany} onOpenBill={(id) => void openRelatedBill(id)} onOpenExpense={onOpenExpense} onCreateExpense={onCreateExpense} onVendorChanged={onVendorChanged} onFilterCompany={(id) => { setVendor(id); setSelectedId(null); const params = new URLSearchParams(searchParams.toString()); params.set('company', id); params.delete('bill'); router.replace(`${pathname}?${params.toString()}`, { scroll: false }) }} /> : null}
    </PortalModal>
  </>
}

export function BillReview({ bill, balance, busy, message, onClose, onReview, onBillChanged, onEdit, vendors, companyChoice, setCompanyChoice, companyName, setCompanyName, onLinkCompany, onOpenBill, onOpenExpense, onCreateExpense, onVendorChanged, onFilterCompany, showClose = false }: { bill: LuxorBill; balance: BillBalance; busy: string | null; message: string | null; onClose: () => void; onReview: (action: 'approve' | 'flag' | 'mark_paid' | 'confirm_distinct') => void; onBillChanged: (bill: LuxorBill) => void; onEdit: () => void; vendors: LuxorVendor[]; companyChoice: string; setCompanyChoice: (value: string) => void; companyName: string; setCompanyName: (value: string) => void; onLinkCompany: (create: boolean) => void; showClose?: boolean; onOpenBill?: (id: string) => void; onFilterCompany?: (id: string) => void; onOpenExpense?: (id: string) => void; onCreateExpense?: (billId: string) => void; onVendorChanged?: (vendor: LuxorVendor) => void }) {
  const badge = statusLabel(bill)
  const [paidReview, setPaidReview] = useState<{ billId: string; vendorId: string; updatedAt: string } | null>(null)
  const [companyOpen, setCompanyOpen] = useState(false)
  const [companyOverride, setCompanyOverride] = useState<LuxorVendor | null>(null)
  const company = companyOverride?.id === bill.vendor_id ? companyOverride : vendors.find((item) => item.id === bill.vendor_id)
  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <VendorMark bill={bill} />
        <div className="min-w-0">
          <h3 id="bill-review-title" className="truncate text-base font-semibold text-[color:var(--portal-text)]">{bill.provider}</h3>
          <p className="mt-1 truncate text-xs text-[color:var(--portal-muted)]">{bill.source_filename || bill.service}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`inline-flex shrink-0 rounded-md px-2 py-1 text-[11px] font-bold ${badge.color}`}>{badge.label}</span>
        {!bill.archived_at && bill.status !== 'paid' ? (
          <PortalGhostIconButton
            size="sm"
            onClick={() => onReview('mark_paid')}
            disabled={Boolean(busy)}
            aria-label="Mark bill paid"
            title="Mark bill paid"
            className="!h-8 !w-8 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            <Check size={16} />
          </PortalGhostIconButton>
        ) : null}
        {!bill.archived_at && bill.status !== 'paid' ? (
          <PortalGhostIconButton
            size="sm"
            onClick={onEdit}
            disabled={Boolean(busy)}
            aria-label="Edit bill details"
            title="Edit bill details"
            className="!h-8 !w-8"
          >
            <FilePenLine size={16} />
          </PortalGhostIconButton>
        ) : null}
        {showClose ? <PortalCloseButton onClick={onClose} aria-label="Close bill detail" className="-mr-1" /> : null}
      </div>
    </div>
    <BillDocumentPreview key={bill.id} bill={bill} />

    <section>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">{bill.source_type === 'manual' ? 'Manually entered details' : 'AI-extracted details'}</p>
        {!bill.archived_at && bill.status !== 'paid' ? (
          <button
            type="button"
            onClick={onEdit}
            disabled={Boolean(busy)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[#9a712e] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:opacity-50 dark:text-[#e6c77f]"
          >
            <FilePenLine size={13} />
            <span>Edit details</span>
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-[color:var(--portal-muted)]">{bill.source_type === 'manual' ? 'No source document was provided for AI analysis.' : 'Check these suggestions against the source document before approval.'}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4"><Fact label="Total" value={billAmount(bill)} /><Fact label="Due date" value={dateLabel(bill.due_date)} /><Fact label="Invoice" value={bill.invoice_number || 'Not found'} /><Fact label="Confidence" value={bill.extraction_confidence === null ? 'Manual' : `${Math.round(bill.extraction_confidence * 100)}%`} /><Fact label="Service" value={bill.service} wide /><Fact label="Frequency" value={bill.frequency} /></dl>
    </section>

    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CreditCard size={15} className="text-[color:var(--portal-muted)]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Payment balance</p>
        </div>
        {balance.remaining !== null ? (
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${balance.remaining === 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : (balance.paid ?? 0) > 0 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>
            {balance.remaining === 0 ? <Check size={12} /> : null}
            {balance.remaining === 0 ? 'Paid in full' : (balance.paid ?? 0) > 0 ? 'Partially paid' : 'Unpaid'}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--portal-border)]/60 pb-3">
        {balance.remaining === null ? (
          <p className="text-xs text-[color:var(--portal-muted)]">{balance.reason}</p>
        ) : (
          <>
            <div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-[color:var(--portal-text)]">{money(balance.remaining)}</p>
              <p className="mt-0.5 text-[11px] font-medium text-[color:var(--portal-muted)]">Remaining balance</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold tabular-nums text-[color:var(--portal-muted)]">{money(balance.paid ?? 0)}</p>
              <p className="text-[11px] text-[color:var(--portal-muted)]">Paid to date</p>
            </div>
          </>
        )}
      </div>
      {balance.expense && Array.isArray(balance.expense.payments) ? (
        <div className="pt-2">
          <BillDisclosure title="Payment history">
            <ul className="mt-2 space-y-1.5 text-xs text-[color:var(--portal-muted)]">
              {balance.expense.payments.length ? (
                balance.expense.payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-2 rounded-lg bg-[color:var(--portal-card)] px-3 py-2 text-xs">
                    <span className="tabular-nums font-medium text-[color:var(--portal-text)]">{money(Number(payment.amount))}</span>
                    <span className="text-[color:var(--portal-muted)]">{formatLuxorDate(payment.payment_date) || 'Date unavailable'} · {payment.payment_method || payment.transaction_type}</span>
                  </li>
                ))
              ) : (
                <li className="px-1 text-xs text-[color:var(--portal-muted)]">No recorded payments.</li>
              )}
            </ul>
          </BillDisclosure>
        </div>
      ) : null}
    </section>
    <section><p className="text-xs font-semibold text-[color:var(--portal-text)]">Category</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{bill.bill_category || (isLuxorBillCategory(bill.extracted_fields?.category_suggestion) ? `Suggested: ${bill.extracted_fields.category_suggestion} · not confirmed` : 'Not categorized')}</p></section>
    {bill.duplicate_of_bill_id ? <section className="space-y-2"><p className="text-xs text-[color:var(--portal-text)]">Another bill has the same company and invoice number. Compare both documents before proceeding.</p><button type="button" onClick={() => onOpenBill?.(bill.duplicate_of_bill_id!)} disabled={!onOpenBill || Boolean(busy)} className="min-h-10 text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f] disabled:opacity-50">View possible duplicate</button><PortalButton type="button" disabled={Boolean(busy) || Boolean(bill.archived_at)} onClick={() => onReview('confirm_distinct')} className="w-full">I compared them; this is a separate bill</PortalButton></section> : null}
    <section className="space-y-2"><p className="text-sm font-semibold text-[color:var(--portal-text)]">Company</p>{bill.vendor_id ? <><button type="button" onClick={() => setCompanyOpen(true)} disabled={!company || Boolean(busy)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-[color:var(--portal-soft)] px-3 text-left text-sm font-medium text-[color:var(--portal-text)] disabled:opacity-50">{company?.name || bill.provider}<ChevronRight size={16} /></button>{onFilterCompany ? <button type="button" onClick={() => onFilterCompany(bill.vendor_id!)} className="min-h-10 text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f]">Show all bills for this company</button> : null}{bill.vendor_link_method === 'matched' ? <p className="text-xs text-[color:var(--portal-muted)]">Matched from a previously confirmed sender. Check the company before approval.</p> : null}</> : <p className="text-xs text-[color:var(--portal-muted)]">Confirm the company shown on this bill: {bill.provider}.</p>}
      {bill.vendor_id || bill.archived_at ? null : <>
      <PortalSelect value={companyChoice} onChange={(value) => { setCompanyChoice(value); setPaidReview(null) }} options={[{ value: '', label: 'Choose existing company' }, ...vendors.filter((item) => !item.archived_at).map((item) => ({ value: item.id, label: `${item.name} · ${item.vendor_type}` }))]} buttonClassName="min-h-10 w-full" />
      {bill.status === 'paid' ? paidReview?.billId === bill.id && paidReview.vendorId === companyChoice && paidReview.updatedAt === bill.updated_at ? <div className="space-y-2 rounded-lg border border-[color:var(--portal-border)] p-3"><p className="text-xs leading-5 text-[color:var(--portal-text)]">Link this paid bill from {bill.provider} to {vendors.find((item) => item.id === companyChoice)?.name}? The bill amount, paid status, and payment history stay unchanged.</p><div className="flex gap-2"><PortalButton disabled={Boolean(busy)} onClick={() => setPaidReview(null)}>Cancel</PortalButton><PortalButton variant="primary" disabled={Boolean(busy)} onClick={() => onLinkCompany(false)}>Confirm link</PortalButton></div></div> : <><PortalButton type="button" disabled={!companyChoice || Boolean(busy)} onClick={() => setPaidReview({ billId: bill.id, vendorId: companyChoice, updatedAt: bill.updated_at })} className="w-full">Review provider link</PortalButton></> : <>
      <PortalButton type="button" disabled={!companyChoice || Boolean(busy)} onClick={() => onLinkCompany(false)} className="w-full">Link company</PortalButton>
      <label className="block text-xs text-[color:var(--portal-muted)]">Or add a service company<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} maxLength={200} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-sm text-[color:var(--portal-text)]" /></label>
      <PortalButton type="button" disabled={!companyName.trim() || Boolean(busy)} onClick={() => onLinkCompany(true)} className="w-full">Add and link company</PortalButton>
      </>}
      </>}
    </section>
    <section className={`rounded-xl p-3 ${bill.arithmetic_status === 'mismatch' ? 'bg-rose-500/10' : bill.arithmetic_status === 'balanced' ? 'bg-emerald-500/10' : 'bg-[color:var(--portal-soft)]'}`}><div className="flex gap-2">{bill.arithmetic_status === 'mismatch' ? <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-500" /> : bill.arithmetic_status === 'balanced' ? <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <FileText size={15} className="mt-0.5 shrink-0 text-[color:var(--portal-muted)]" />}<div><p className="text-xs font-bold text-[color:var(--portal-text)]">Arithmetic {bill.arithmetic_status === 'balanced' ? 'checks out' : bill.arithmetic_status === 'mismatch' ? 'needs review' : 'not available'}</p><p className="mt-1 text-[11px] leading-4 text-[color:var(--portal-muted)]">{bill.arithmetic_status === 'balanced' ? 'Line items match the extracted total.' : bill.arithmetic_status === 'mismatch' ? 'Line items do not match the extracted total.' : 'The document did not provide enough line-item detail.'}</p></div></div></section>
    {message ? <p role="status" className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-xs text-[color:var(--portal-text)]">{message}</p> : null}
    {bill.status === 'paid' && bill.linked_expense_id && onOpenExpense ? <PortalButton type="button" onClick={() => onOpenExpense(bill.linked_expense_id!)} className="w-full">View payment history <ChevronRight size={14} /></PortalButton> : null}
    {bill.archived_at ? <p className="text-sm leading-6 text-[color:var(--portal-muted)]">This bill is archived. Restore it from the Bills archive to make changes.</p> : bill.status !== 'paid' ? <div className="space-y-2">{bill.linked_expense_id && onOpenExpense ? <PortalButton type="button" onClick={() => onOpenExpense(bill.linked_expense_id!)} className="w-full">Record or review payment <ChevronRight size={14} /></PortalButton> : bill.linked_expense_id ? <Link href={`/portal/finances/expenses/${encodeURIComponent(bill.linked_expense_id)}`} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[#9a712e] hover:bg-[color:var(--portal-soft)] dark:text-[#e6c77f]">Record payment in Expense Management <ArrowUpRight size={13} aria-hidden="true" /></Link> : bill.extraction_status === 'ready' && bill.payment_ready_at && onCreateExpense ? <PortalButton type="button" onClick={() => onCreateExpense(bill.id)} className="w-full">Set up payment tracking <ChevronRight size={14} /></PortalButton> : bill.extraction_status === 'ready' && bill.payment_ready_at ? <Link href="/portal/finances/expenses/business" className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[#9a712e] hover:bg-[color:var(--portal-soft)] dark:text-[#e6c77f]">Link a reviewed bill to an expense <ArrowUpRight size={13} aria-hidden="true" /></Link> : null}{bill.extraction_status === 'needs_review' ? <PortalButton type="button" variant="primary" disabled={Boolean(busy)} onClick={() => onReview('approve')} className="w-full"><CheckCircle2 size={13} />{busy === 'approve' ? 'Approving…' : 'Approve & mark ready'}</PortalButton> : null}<PortalButton type="button" disabled={Boolean(busy) || Boolean(bill.linked_expense_id)} onClick={() => onReview('flag')} className="w-full"><Clock3 size={13} /> Keep in review</PortalButton></div> : <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><Check size={14} /> {balance.paid === null ? 'Marked paid · payment details unavailable' : 'Payment recorded'}</div>}
    <BillDisclosure title="Payment planning & reminders">
    <BillPlanning key={`planning-${bill.id}`} billId={bill.id} canPlan={!bill.archived_at && bill.status !== 'paid' && bill.extraction_status === 'ready' && Boolean(bill.linked_expense_id)} canConfigure={!bill.archived_at} />
    </BillDisclosure>
    {bill.vendor_id && !bill.archived_at && (bill.status !== 'paid' || bill.linked_expense_id) && bill.extraction_status === 'ready' && bill.payment_ready_at && bill.amount_state === 'known' && bill.currency?.toUpperCase() === 'USD' && Number(bill.amount) > 0 ? <BillDisclosure title="Recurring charge"><RecurringBillMatch key={`match-${bill.id}`} bill={bill} /></BillDisclosure> : null}
    {bill.source_type === 'email' || bill.evidence?.length || (bill.source_type === 'manual' && !bill.archived_at) ? <BillDisclosure title="Source & analysis">
    {bill.source_type === 'email' ? <section><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">Email provenance</p><div className="mt-3 space-y-2 text-xs"><p className="truncate text-[color:var(--portal-text)]">From {bill.source_sender}</p><p className="truncate text-[color:var(--portal-muted)]">{bill.source_subject}</p><p className="text-[color:var(--portal-muted)]">Received {formatLuxorDate(bill.received_at, { includeTime: true }) || 'unknown'}</p></div></section> : null}
    {bill.evidence?.length ? <section><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">Source evidence</p><div className="mt-3 space-y-2">{bill.evidence.slice(0, 3).map((item, index) => <blockquote key={`${item.field}-${index}`} className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-[11px] leading-4 text-[color:var(--portal-muted)]"><span className="font-bold text-[color:var(--portal-text)]">{item.field}: </span>{item.quote}{item.page_number ? ` · p. ${item.page_number}` : ''}</blockquote>)}</div></section> : null}
    {bill.source_type === 'manual' && !bill.archived_at ? <ManualBillAnalysis key={`analysis-${bill.id}`} bill={bill} onBillChanged={onBillChanged} /> : null}
    </BillDisclosure> : null}
    <PortalModal isOpen={companyOpen} onClose={() => setCompanyOpen(false)} title={company?.name || 'Company details'} description="Contact details and documents" sidePanel headerBack maxWidth="max-w-[600px]" animateClose>
      {company ? <><section className="relative pb-6"><h2 className="pr-12 text-base font-bold text-[color:var(--portal-text)]">Company details</h2><VendorBusinessDetails vendor={company} onSaved={(updated) => { setCompanyOverride(updated); onVendorChanged?.(updated) }}><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">{([['Contact', company.contact_person], ['Email', company.email], ['Phone', company.phone], ['Website', company.business_website]] as const).filter(([, value]) => value).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-[color:var(--portal-muted)]">{label}</dt><dd className="mt-1 break-words text-[color:var(--portal-text)]">{value}</dd></div>)}</dl></VendorBusinessDetails></section><VendorDocuments vendorId={company.id} archived={Boolean(company.archived_at)} onOpenBill={onOpenBill ? (id) => { setCompanyOpen(false); onOpenBill(id) } : undefined} /></> : null}
    </PortalModal>
  </div>
}

function VendorMark({ bill }: { bill: LuxorBill }) {
  const domain = vendorDomain(bill)
  const [failed, setFailed] = useState(false)
  const fallback = <Building2 size={18} aria-hidden="true" />

  return <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] shadow-sm">
    {domain && !failed ? <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`} alt={`${bill.provider} logo`} className="h-6 w-6 object-contain" onError={() => setFailed(true)} /> : fallback}
  </span>
}

function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? 'col-span-2' : ''}><dt className="text-[11px] uppercase tracking-wider text-[color:var(--portal-muted)]">{label}</dt><dd className="mt-1 truncate text-xs font-semibold text-[color:var(--portal-text)]">{value}</dd></div>
}

function BillDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <section className="border-t border-[color:var(--portal-border)] pt-2">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left text-sm font-semibold text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">
      {title}<ChevronDown size={16} className={`shrink-0 text-[color:var(--portal-muted)] transition-transform duration-[520ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
    </button>
    <div id={id} className="grid transition-[grid-template-rows,opacity] duration-[520ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none" style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }} inert={!open} aria-hidden={!open}>
      <div className="min-h-0 overflow-hidden"><div className={`space-y-4 pb-3 pt-1 transition-transform duration-[520ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none ${open ? 'translate-y-0' : '-translate-y-1.5'}`}>{children}</div></div>
    </div>
  </section>
}
