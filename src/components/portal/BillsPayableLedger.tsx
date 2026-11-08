'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertCircle, ArrowUpRight, Check, CheckCircle2, ChevronRight, CircleDollarSign,
  Building2, Clock3, FileCheck2, FileText, Inbox, Mail, Plus, Search, ShieldCheck, X,
} from '@/lib/icons/phosphor-compat'
import { PortalButton, PortalSelect } from '@/components/portal/PortalUI'
import { formatLuxorDate } from '@/lib/luxorDateFormatting'
import ManualBillAnalysis from '@/components/portal/ManualBillAnalysis'
import BillPlanning from '@/components/portal/BillPlanning'
import type { LuxorBill, LuxorBillIntake, LuxorVendor } from '@/lib/luxorInquiryTypes'
import { isLuxorBillCategory } from '@/lib/luxorBillCategories'
import { getBillBalance, type BillBalance, type BillExpense } from '@/lib/luxorBillBalances'

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
  const status = ledgerStatus(bill)
  if (status === 'review') return { label: 'Needs review', color: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20' }
  if (status === 'paid') return { label: 'Paid', color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20' }
  if (status === 'hold') return { label: 'On hold', color: 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/20' }
  if (status === 'due') return { label: relativeDue(bill.due_date), color: 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/20' }
  if (status === 'ready') return { label: 'Ready to pay', color: 'text-blue-700 dark:text-blue-300 bg-blue-500/10 border-blue-500/20' }
  return { label: 'Open', color: 'text-[color:var(--portal-muted)] bg-[color:var(--portal-soft)] border-[color:var(--portal-border)]' }
}

function sourceUrl(bill: LuxorBill) {
  if (!bill.source_message_id || !bill.source_attachment_id) return null
  return `/api/operations/bills/${encodeURIComponent(bill.id)}/document`
}

function vendorDomain(bill: LuxorBill) {
  const knownDomain = VENDOR_DOMAINS[bill.provider.trim().toLowerCase()]
  if (knownDomain) return knownDomain
  const senderDomain = bill.source_sender?.match(/@([^>\s]+)$/)?.[1]?.toLowerCase().replace(/[>,.;]+$/, '')
  return senderDomain && !PERSONAL_EMAIL_DOMAINS.has(senderDomain) ? senderDomain : null
}

export function BillsPayableLedger({
  bills, intakes, vendors, onAddBill, onBillChanged, onEditBill,
  onIntakeChanged, onVendorChanged,
}: {
  bills: LuxorBill[]
  intakes: LuxorBillIntake[]
  vendors: LuxorVendor[]
  onVendorChanged: (vendor: LuxorVendor) => void
  onAddBill: () => void
  onBillChanged: (bill: LuxorBill) => void
  onIntakeChanged: (intake: LuxorBillIntake) => void
  onEditBill: (bill: LuxorBill) => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<LedgerTab>('all')
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('bill'))
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('all')
  const [vendor, setVendor] = useState(() => searchParams.get('company') || 'all')
  const [companyChoice, setCompanyChoice] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [dueWindow, setDueWindow] = useState('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [expenses, setExpenses] = useState<BillExpense[] | null>(null)
  const reduceMotion = useReducedMotion()
  const selected = bills.find((bill) => bill.id === selectedId && (vendor === 'all' || bill.vendor_id === vendor)) || null
  const failedIntakes = intakes.filter((intake) => intake.status === 'failed')
  const processingIntakes = intakes.filter((intake) => intake.status === 'received' || intake.status === 'processing')

  useEffect(() => setMounted(true), [])
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
  }, [])
  useEffect(() => { setVendor(searchParams.get('company') || 'all') }, [searchParams])
  useEffect(() => { setSelectedId(searchParams.get('bill')) }, [searchParams])

  useEffect(() => {
    if (!selectedId) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') selectBill(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    const shouldLock = window.matchMedia('(max-width: 1279px)').matches
    const previousOverflow = document.body.style.overflow
    if (shouldLock) document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      if (shouldLock) document.body.style.overflow = previousOverflow
    }
  // selectBill is intentionally omitted so this effect only follows the selected bill state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const counts = useMemo(() => Object.fromEntries((['review', 'due', 'ready', 'paid', 'hold'] as LedgerTab[])
    .map((key) => [key, bills.filter((bill) => ledgerStatus(bill) === key).length])), [bills])
  const vendorOptions = useMemo(() => [{ value: 'all', label: 'All companies' }, ...vendors.filter((item) => bills.some((bill) => bill.vendor_id === item.id)).map((item) => ({ value: item.id, label: item.name }))], [bills, vendors])
  const openBills = bills.filter((bill) => bill.status !== 'paid' && bill.extraction_status !== 'duplicate' && !bill.duplicate_of_bill_id)
  const openBalances = openBills.map((bill) => getBillBalance(bill, expenses))
  const knownDue = openBalances.reduce((sum, balance) => sum + (balance.remaining ?? 0), 0)
  const unresolvedCount = openBalances.filter((balance) => balance.remaining === null).length
  const nextDue = openBills
    .map((bill, index) => ({ bill, remaining: openBalances[index]?.remaining }))
    .filter((item) => item.bill.due_date && item.remaining !== 0)
    .sort((a, b) => String(a.bill.due_date).localeCompare(String(b.bill.due_date)))[0]?.bill
  const today = chicagoToday()
  const visible = useMemo(() => bills.filter((bill) => {
    if (tab !== 'all' && ledgerStatus(bill) !== tab) return false
    if (source !== 'all' && bill.source_type !== source) return false
    if (vendor !== 'all' && bill.vendor_id !== vendor) return false
    if (dueWindow !== 'all') {
      if (!bill.due_date) return dueWindow === 'missing'
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
    setSelectedId(id)
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('bill', id)
    else params.delete('bill')
    router.replace(`/portal/operations?${params.toString()}`, { scroll: false })
  }

  async function review(action: 'approve' | 'flag' | 'mark_paid' | 'confirm_distinct') {
    if (!selected) return
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
    if (!selected) return
    setBusy('company')
    setMessage(null)
    try {
      const response = await fetch(`/api/operations/bills/${selected.id}/company`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(create ? { name: companyName } : { vendorId: companyChoice }), expectedUpdatedAt: selected.updated_at }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Company link failed.')
      onBillChanged(result.bill)
      onVendorChanged(result.vendor)
      setCompanyChoice('')
      setCompanyName('')
      setMessage('Company linked. Review the bill before approving it.')
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

  const overlay = mounted ? createPortal(
    <AnimatePresence>
      {selectedId && selected ? <motion.div
        className="pointer-events-none fixed inset-0 z-[100] xl:hidden"
        initial="closed"
        animate="open"
        exit="closed"
        variants={{ closed: { opacity: 0.999 }, open: { opacity: 1 } }}
        transition={{ duration: reduceMotion ? 0 : 0.24 }}
      >
        <motion.button
          type="button"
          aria-label="Close bill detail"
          className="portal-modal-layer pointer-events-auto absolute inset-0 bg-black/25 backdrop-blur-[1px]"
          variants={{ closed: { opacity: 0 }, open: { opacity: 1 } }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          onClick={() => selectBill(null)}
        />
        <motion.aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="bill-review-title"
          className="portal-sheet pointer-events-auto absolute inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] max-h-[calc(100dvh-5.5rem-env(safe-area-inset-bottom))] overflow-y-auto rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-5 shadow-2xl portal-scrollbar sm:bottom-auto sm:left-auto sm:right-4 sm:top-20 sm:max-h-[calc(100dvh-6rem)] sm:w-[min(27rem,calc(100vw-2rem))] sm:p-6"
          variants={{
            closed: reduceMotion ? { opacity: 0 } : { opacity: 0, x: 28, y: 8, scale: 0.985 },
            open: { opacity: 1, x: 0, y: 0, scale: 1 },
          }}
          transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.23, 1, 0.32, 1] }}
        >
          <BillReview bill={selected} balance={getBillBalance(selected, expenses)} busy={busy} message={message} onClose={() => selectBill(null)} onReview={review} onBillChanged={onBillChanged} onEdit={() => onEditBill(selected)} vendors={vendors} companyChoice={companyChoice} setCompanyChoice={setCompanyChoice} companyName={companyName} setCompanyName={setCompanyName} onLinkCompany={linkCompany} showClose />
        </motion.aside>
      </motion.div> : null}
    </AnimatePresence>,
    document.body,
  ) : null

  return <>
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-sm">
      <div className="border-b border-[color:var(--portal-border)] px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><CircleDollarSign size={19} className="text-[#a8792f] dark:text-[#caa24c]" /><h2 className="text-lg font-semibold tracking-tight text-[color:var(--portal-text)]">Payables Ledger</h2></div>
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Review every vendor bill from source to payment readiness.</p>
            <p className="mt-3 text-sm font-semibold text-[color:var(--portal-text)]">{expenses ? `${money(knownDue)} in verified linked balances` : 'Expense balances unavailable'} <span className="ml-2 text-[10px] font-normal text-[color:var(--portal-muted)]">{unresolvedCount ? `${unresolvedCount} open bill(s) need balance reconciliation · ` : ''}{nextDue ? `Next: ${dateLabel(nextDue.due_date)} · ${nextDue.provider}` : 'No open due dates'}</span></p>
          </div>
          <div className="flex flex-wrap gap-2">
            {counts.review ? <PortalButton type="button" size="sm" variant="primary" onClick={() => setTab('review')}>Review {counts.review} bill{counts.review === 1 ? '' : 's'}</PortalButton> : null}
            <PortalButton type="button" size="sm" variant="primary" onClick={onAddBill}><Plus size={13} /> Add bill</PortalButton>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Inbox size={16} /></span>
            <div className="min-w-0"><p className="truncate text-xs font-semibold text-[color:var(--portal-text)]">invoices@luxoratlaspalmas.com</p><p className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">{processingIntakes.length ? `${processingIntakes.length} attachment${processingIntakes.length === 1 ? '' : 's'} processing` : 'Invoice intake is ready'}{failedIntakes.length ? ` · ${failedIntakes.length} needs retry` : ''}</p></div>
          </div>
          <Link href="/portal/emails?mailbox=invoices" className="inline-flex min-h-10 items-center gap-1.5 self-start rounded-lg px-2 text-[10px] font-bold text-[#a8792f] hover:bg-[#caa24c]/10 dark:text-[#caa24c] sm:self-auto">Open invoice inbox <ArrowUpRight size={12} /></Link>
        </div>
        {intakes.filter((intake) => ['failed', 'ignored'].includes(intake.status)).length ? <div className="mt-3 space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">Intake attention</p>{intakes.filter((intake) => ['failed', 'ignored'].includes(intake.status)).slice(0, 4).map((intake) => <div key={intake.id} className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-[10px] font-semibold text-[color:var(--portal-text)]">{intake.filename}</p><p className="text-[9px] text-[color:var(--portal-muted)]">{intake.status === 'ignored' ? (intake.last_error_message ? 'Analysis stopped after repeated failures' : 'Ignored') : intake.last_error_message || 'Extraction failed'}</p></div><div className="flex shrink-0 gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => void intakeAction(intake, 'retry')} className="text-[9px] font-bold text-[#a8792f] disabled:opacity-50">Retry</button>{intake.status !== 'ignored' ? <button type="button" disabled={Boolean(busy)} onClick={() => void intakeAction(intake, 'ignore')} className="text-[9px] font-bold text-[color:var(--portal-muted)] disabled:opacity-50">Ignore</button> : null}</div></div>)}</div> : null}
      </div>

      <div className="border-b border-[color:var(--portal-border)] px-4 sm:px-6">
        <div className="flex gap-5 overflow-x-auto portal-scrollbar">
          {([
            ['all', 'All bills'], ['review', `Needs review ${counts.review || ''}`], ['due', `Due soon ${counts.due || ''}`],
            ['ready', `Ready to pay ${counts.ready || ''}`], ['paid', 'Paid'], ['hold', 'On hold'],
          ] as Array<[LedgerTab, string]>).map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`min-h-12 shrink-0 border-b-2 text-[11px] font-semibold transition-colors ${tab === key ? 'border-[#a8792f] text-[color:var(--portal-text)]' : 'border-transparent text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}>{label}</button>)}
          <Link href="/portal/finances?tab=invoices" className="flex min-h-12 shrink-0 items-center gap-1 border-b-2 border-transparent text-[11px] font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">Client invoices <ArrowUpRight size={11} /></Link>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-h-0 flex-col border-[color:var(--portal-border)] xl:border-r">
          <div className="grid gap-2 border-b border-[color:var(--portal-border)] p-4 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_9.5rem_9.5rem_9rem]">
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3"><Search size={14} className="text-[color:var(--portal-muted)]" /><span className="sr-only">Search bills</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendor, service, invoice" className="!min-w-0 flex-1 !border-0 !bg-transparent !p-0 text-xs text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:!ring-0" /></label>
            <PortalSelect value={dueWindow} onChange={setDueWindow} options={[{ value: 'all', label: 'All due dates' }, { value: 'overdue', label: 'Overdue' }, { value: '7', label: 'Next 7 days' }, { value: '30', label: 'Next 30 days' }, { value: 'missing', label: 'Missing due date' }]} buttonClassName="min-h-10 w-full" />
            <PortalSelect value={vendor} onChange={setVendor} options={vendorOptions} buttonClassName="min-h-10 w-full" />
            <PortalSelect value={source} onChange={setSource} options={[{ value: 'all', label: 'All sources' }, { value: 'email', label: 'Invoice inbox' }, { value: 'portal_upload', label: 'Portal upload' }, { value: 'manual', label: 'Manual' }]} buttonClassName="min-h-10 w-full" />
            {(query || source !== 'all' || vendor !== 'all' || dueWindow !== 'all') ? <button type="button" onClick={() => { setQuery(''); setSource('all'); setVendor('all'); setDueWindow('all') }} className="text-left text-[10px] font-bold text-[#a8792f] dark:text-[#caa24c] xl:col-start-4 xl:text-right">Reset filters</button> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto portal-scrollbar p-3 sm:p-4">
            {!visible.length ? <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--portal-border)] text-center"><FileCheck2 size={22} className="text-[color:var(--portal-faint)]" /><p className="mt-3 text-xs font-semibold text-[color:var(--portal-text)]">No bills in this view</p><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">Change a filter or add a bill manually.</p></div> : groups.map((group) => <div key={group.key} className="mb-5 last:mb-0">
              <div className="mb-2 flex items-center gap-2 px-1"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">{group.key === 'review' ? 'Needs review' : group.key === 'due' ? 'Due soon' : group.key === 'ready' ? 'Ready to pay' : group.key === 'paid' ? 'Paid' : group.key === 'hold' ? 'On hold' : 'Open bills'}</p><span className="text-[9px] text-[color:var(--portal-faint)]">{group.rows.length}</span></div>
              <div className="overflow-hidden rounded-xl border border-[color:var(--portal-border)]">
                <div className="hidden grid-cols-[minmax(9rem,1fr)_3.5rem_5.5rem_5.5rem_5.5rem_6.5rem_1.25rem] items-center gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-2 lg:grid"><span>Vendor / service</span><span>Source</span><span>Received</span><span>Due date</span><span className="text-right">Amount</span><span>Review / payment</span><span /><style jsx>{`span{font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--portal-muted)}`}</style></div>
                {group.rows.map((bill) => {
                  const badge = statusLabel(bill)
                  return <button key={bill.id} type="button" onClick={() => selectBill(bill.id)} className={`grid w-full gap-3 border-b border-[color:var(--portal-border)] p-4 text-left last:border-b-0 hover:bg-[color:var(--portal-soft)] sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_1.25rem] sm:items-center lg:grid-cols-[minmax(9rem,1fr)_3.5rem_5.5rem_5.5rem_5.5rem_6.5rem_1.25rem] ${selectedId === bill.id ? 'bg-[#caa24c]/[0.07]' : 'bg-[color:var(--portal-card)]'}`}>
                    <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-xs font-semibold text-[color:var(--portal-text)]">{bill.provider}</span>{bill.source_type === 'email' ? <Mail size={12} className="shrink-0 text-[#a8792f] dark:text-[#caa24c]" /> : null}</div><p className="mt-1 truncate text-[10px] text-[color:var(--portal-muted)]">{bill.service}{bill.invoice_number ? ` · #${bill.invoice_number}` : ''}</p></div>
                    <span className="hidden text-[9px] text-[color:var(--portal-muted)] lg:block">{bill.source_type === 'email' ? 'Email' : bill.source_type === 'portal_upload' ? 'Portal upload' : 'Manual'}</span>
                    <span className="hidden text-[9px] text-[color:var(--portal-muted)] lg:block">{formatLuxorDate(bill.received_at) || '—'}</span>
                    <span className="hidden text-[9px] text-[color:var(--portal-muted)] lg:block">{dateLabel(bill.due_date)}</span>
                    <div className="lg:text-right"><p className="font-mono text-xs font-semibold text-[color:var(--portal-text)]">{billAmount(bill)}</p><p className="mt-1 text-[9px] text-[color:var(--portal-muted)] lg:hidden">{dateLabel(bill.due_date)}</p></div>
                    <span className={`w-fit rounded-md border px-2 py-1 text-[9px] font-bold ${badge.color}`}>{badge.label}</span><ChevronRight size={15} className="hidden text-[color:var(--portal-faint)] sm:block" />
                  </button>
                })}
              </div>
            </div>)}
          </div>
        </div>
        <aside className="hidden min-h-0 overflow-y-auto bg-[color:var(--portal-soft)] p-5 portal-scrollbar xl:block">
          {selected ? <BillReview bill={selected} balance={getBillBalance(selected, expenses)} busy={busy} message={message} onClose={() => selectBill(null)} onReview={review} onBillChanged={onBillChanged} onEdit={() => onEditBill(selected)} vendors={vendors} companyChoice={companyChoice} setCompanyChoice={setCompanyChoice} companyName={companyName} setCompanyName={setCompanyName} onLinkCompany={linkCompany} /> : <div className="flex min-h-72 flex-col items-center justify-center text-center"><FileText size={24} className="text-[color:var(--portal-faint)]" /><p className="mt-3 text-xs font-semibold text-[color:var(--portal-text)]">Select a bill</p><p className="mt-1 max-w-52 text-[10px] leading-4 text-[color:var(--portal-muted)]">Review the original document, extracted facts, arithmetic, and email source together.</p></div>}
        </aside>
      </div>
    </section>
    {overlay}
  </>
}

function BillReview({ bill, balance, busy, message, onClose, onReview, onBillChanged, onEdit, vendors, companyChoice, setCompanyChoice, companyName, setCompanyName, onLinkCompany, showClose = false }: { bill: LuxorBill; balance: BillBalance; busy: string | null; message: string | null; onClose: () => void; onReview: (action: 'approve' | 'flag' | 'mark_paid' | 'confirm_distinct') => void; onBillChanged: (bill: LuxorBill) => void; onEdit: () => void; vendors: LuxorVendor[]; companyChoice: string; setCompanyChoice: (value: string) => void; companyName: string; setCompanyName: (value: string) => void; onLinkCompany: (create: boolean) => void; showClose?: boolean }) {
  const url = sourceUrl(bill)
  const badge = statusLabel(bill)
  return <div className="space-y-5">
    {bill.status !== 'paid' ? <PortalButton type="button" disabled={Boolean(busy)} onClick={onEdit} className="w-full">Edit extracted facts</PortalButton> : null}
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className={`inline-flex rounded-md border px-2 py-1 text-[9px] font-bold ${badge.color}`}>{badge.label}</span><div className="mt-3 flex min-w-0 items-center gap-3"><VendorMark bill={bill} /><div className="min-w-0"><h3 id="bill-review-title" className="truncate text-base font-semibold text-[color:var(--portal-text)]">{bill.provider}</h3><p className="mt-1 truncate text-[10px] text-[color:var(--portal-muted)]">{bill.source_filename || bill.service}</p></div></div></div>{showClose ? <button type="button" onClick={onClose} aria-label="Close bill detail" className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><X size={15} /></button> : null}</div>
    <div className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
      {url && bill.source_content_type?.startsWith('image/') ? <img src={url} alt={`Source invoice from ${bill.provider}`} className="h-44 w-full object-contain p-3" /> : <div className="flex h-40 flex-col items-center justify-center bg-[color:var(--portal-soft)]"><FileText size={30} className="text-[#a8792f] dark:text-[#caa24c]" /><p className="mt-3 max-w-56 truncate text-[10px] text-[color:var(--portal-muted)]">{bill.source_filename || 'Manual bill'}</p></div>}
      {url ? <a href={url} target="_blank" rel="noreferrer" className="flex min-h-10 items-center justify-center gap-1.5 border-t border-[color:var(--portal-border)] text-[10px] font-bold text-[#a8792f] hover:bg-[#caa24c]/5 dark:text-[#caa24c]">View full document <ArrowUpRight size={11} /></a> : null}
    </div>
    <section><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">{bill.source_type === 'manual' ? 'Manually entered details' : 'AI-extracted details'}</p><p className="mt-2 text-xs text-[color:var(--portal-muted)]">{bill.source_type === 'manual' ? 'No source document was provided for AI analysis.' : 'Check these suggestions against the source document before approval.'}</p><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4"><Fact label="Total" value={billAmount(bill)} /><Fact label="Due date" value={dateLabel(bill.due_date)} /><Fact label="Invoice" value={bill.invoice_number || 'Not found'} /><Fact label="Confidence" value={bill.extraction_confidence === null ? 'Manual' : `${Math.round(bill.extraction_confidence * 100)}%`} /><Fact label="Service" value={bill.service} wide /><Fact label="Frequency" value={bill.frequency} /></dl></section>
    <section><p className="text-xs font-semibold text-[color:var(--portal-text)]">Payment balance</p><p className="mt-1 text-xs tabular-nums text-[color:var(--portal-muted)]">{balance.remaining === null ? balance.reason : `${money(balance.paid ?? 0)} paid · ${money(balance.remaining)} remaining`}</p></section>
    <BillPlanning key={bill.id} billId={bill.id} canPlan={!bill.archived_at && bill.status !== 'paid' && bill.extraction_status === 'ready' && Boolean(bill.linked_expense_id)} canConfigure={!bill.archived_at} />
    {bill.source_type === 'manual' ? <ManualBillAnalysis key={bill.id} bill={bill} onBillChanged={onBillChanged} /> : null}
    <section><p className="text-xs font-semibold text-[color:var(--portal-text)]">Category</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{bill.bill_category || (isLuxorBillCategory(bill.extracted_fields?.category_suggestion) ? `Suggested: ${bill.extracted_fields.category_suggestion} · not confirmed` : 'Not categorized')}</p></section>
    {bill.duplicate_of_bill_id ? <section className="space-y-2"><p className="text-xs text-[color:var(--portal-text)]">Another bill has the same company and invoice number. Compare both documents before proceeding.</p><Link href={`/portal/operations?tab=bills&bill=${encodeURIComponent(bill.duplicate_of_bill_id)}`} className="text-xs font-semibold text-[#a8792f]">View possible duplicate</Link><PortalButton type="button" disabled={Boolean(busy)} onClick={() => onReview('confirm_distinct')} className="w-full">I compared them; this is a separate bill</PortalButton></section> : null}
    <section className="space-y-2"><p className="text-xs font-semibold text-[color:var(--portal-text)]">Company</p>{bill.vendor_id ? <><Link className="text-xs font-semibold text-[#a8792f] dark:text-[#caa24c]" href={`/portal/operations?tab=bills&company=${encodeURIComponent(bill.vendor_id)}`}>View bills for {vendors.find((item) => item.id === bill.vendor_id)?.name || bill.provider} <ArrowUpRight size={12} className="inline" /></Link><Link className="block text-xs font-semibold text-[#a8792f] dark:text-[#caa24c]" href={`/portal/finances/bills/vendors/${encodeURIComponent(bill.vendor_id)}`}>Open vendor profile <ArrowUpRight size={12} className="inline" /></Link>{bill.vendor_link_method === 'matched' ? <p className="text-xs text-[color:var(--portal-muted)]">Matched from a previously confirmed sender. Check this company when reviewing the bill.</p> : null}</> : bill.status === 'paid' ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">This bill is already paid. Link a company while the bill is still open for payment. The name shown here stays <span className="font-semibold text-[color:var(--portal-text)]">{bill.provider}</span> until then.</p> : <p className="text-xs text-[color:var(--portal-muted)]">Choose a company for this bill. Suggested name: {bill.provider}</p>}
      {bill.vendor_id || bill.status === 'paid' ? null : <>
      <PortalSelect value={companyChoice} onChange={setCompanyChoice} options={[{ value: '', label: 'Choose existing company' }, ...vendors.map((item) => ({ value: item.id, label: `${item.name} · ${item.vendor_type}` }))]} buttonClassName="min-h-10 w-full" />
      <PortalButton type="button" disabled={!companyChoice || Boolean(busy)} onClick={() => onLinkCompany(false)} className="w-full">Link company</PortalButton>
      <label className="block text-xs text-[color:var(--portal-muted)]">Or add a service company<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} maxLength={200} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-sm text-[color:var(--portal-text)]" /></label>
      <PortalButton type="button" disabled={!companyName.trim() || Boolean(busy)} onClick={() => onLinkCompany(true)} className="w-full">Add and link company</PortalButton>
      </>}
    </section>
    <section className={`rounded-xl border p-3 ${bill.arithmetic_status === 'mismatch' ? 'border-rose-500/25 bg-rose-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}><div className="flex gap-2">{bill.arithmetic_status === 'mismatch' ? <AlertCircle size={15} className="mt-0.5 text-rose-500" /> : <ShieldCheck size={15} className="mt-0.5 text-emerald-600 dark:text-emerald-400" />}<div><p className="text-[10px] font-bold text-[color:var(--portal-text)]">Arithmetic {bill.arithmetic_status === 'balanced' ? 'checks out' : bill.arithmetic_status === 'mismatch' ? 'needs review' : 'not available'}</p><p className="mt-1 text-[9px] leading-4 text-[color:var(--portal-muted)]">{bill.arithmetic_status === 'balanced' ? 'Line items match the extracted total.' : bill.arithmetic_status === 'mismatch' ? 'Line items do not match the extracted total.' : 'The document did not provide enough line-item detail.'}</p></div></div></section>
    {bill.source_type === 'email' ? <section><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">Email provenance</p><div className="mt-3 space-y-2 text-[10px]"><p className="truncate text-[color:var(--portal-text)]">From {bill.source_sender}</p><p className="truncate text-[color:var(--portal-muted)]">{bill.source_subject}</p><p className="text-[color:var(--portal-muted)]">Received {formatLuxorDate(bill.received_at, { includeTime: true }) || 'unknown'}</p></div></section> : null}
    {bill.evidence?.length ? <section><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">Source evidence</p><div className="mt-3 space-y-2">{bill.evidence.slice(0, 3).map((item, index) => <blockquote key={`${item.field}-${index}`} className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-[9px] leading-4 text-[color:var(--portal-muted)]"><span className="font-bold text-[color:var(--portal-text)]">{item.field}: </span>{item.quote}{item.page_number ? ` · p. ${item.page_number}` : ''}</blockquote>)}</div></section> : null}
    {message ? <p role="status" className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[10px] text-[color:var(--portal-text)]">{message}</p> : null}
    {bill.status !== 'paid' ? <div className="space-y-2">{bill.linked_expense_id ? <Link href={`/portal/finances/expenses/${encodeURIComponent(bill.linked_expense_id)}`} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[#9a712e] hover:bg-[color:var(--portal-soft)] dark:text-[#e6c77f]">Record payment in Expense Management <ArrowUpRight size={13} aria-hidden="true" /></Link> : bill.extraction_status === 'ready' && bill.payment_ready_at ? <Link href="/portal/finances/expenses/business" className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[#9a712e] hover:bg-[color:var(--portal-soft)] dark:text-[#e6c77f]">Link a reviewed bill to an expense <ArrowUpRight size={13} aria-hidden="true" /></Link> : null}{bill.extraction_status === 'needs_review' ? <PortalButton type="button" variant="primary" disabled={Boolean(busy)} onClick={() => onReview('approve')} className="w-full"><CheckCircle2 size={13} />{busy === 'approve' ? 'Approving…' : 'Approve & mark ready'}</PortalButton> : null}<PortalButton type="button" disabled={Boolean(busy) || Boolean(bill.linked_expense_id)} onClick={() => onReview('flag')} className="w-full"><Clock3 size={13} /> Keep in review</PortalButton></div> : <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"><Check size={14} /> {balance.paid === null ? 'Marked paid · payment details unavailable' : 'Payment recorded'}</div>}
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
  return <div className={wide ? 'col-span-2' : ''}><dt className="text-[9px] uppercase tracking-wider text-[color:var(--portal-muted)]">{label}</dt><dd className="mt-1 truncate text-xs font-semibold text-[color:var(--portal-text)]">{value}</dd></div>
}
