'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle, ArrowUpRight, Check, CheckCircle2, ChevronRight, CircleDollarSign,
  Clock3, FileCheck2, FileText, Inbox, Mail, Plus, RefreshCw, Search, ShieldCheck, X,
} from 'lucide-react'
import { PortalButton, PortalSelect } from '@/components/portal/PortalUI'
import type { LuxorBill, LuxorBillIntake } from '@/lib/luxorInquiryTypes'

type LedgerTab = 'all' | 'review' | 'due' | 'ready' | 'paid' | 'hold'

function money(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(value || 0))
}

function dateLabel(value: string | null) {
  if (!value) return 'No due date'
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function relativeDue(value: string | null) {
  if (!value) return 'Due date missing'
  const days = Math.ceil((new Date(`${value}T23:59:59`).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  return `Due in ${days}d`
}

function ledgerStatus(bill: LuxorBill): LedgerTab {
  if (bill.status === 'paid') return 'paid'
  if (bill.extraction_status === 'needs_review' || bill.extraction_status === 'failed') return 'review'
  if (bill.extraction_status === 'duplicate') return 'hold'
  if (bill.due_date && new Date(`${bill.due_date}T23:59:59`).getTime() <= Date.now() + 7 * 86_400_000) return 'due'
  if (bill.payment_ready_at || bill.extraction_status === 'ready') return 'ready'
  return 'all'
}

function statusLabel(bill: LuxorBill) {
  const status = ledgerStatus(bill)
  if (status === 'review') return { label: 'Needs review', color: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20' }
  if (status === 'paid') return { label: 'Paid', color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20' }
  if (status === 'hold') return { label: 'On hold', color: 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/20' }
  if (status === 'due') return { label: relativeDue(bill.due_date), color: 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/20' }
  return { label: 'Ready to pay', color: 'text-blue-700 dark:text-blue-300 bg-blue-500/10 border-blue-500/20' }
}

function sourceUrl(bill: LuxorBill) {
  if (!bill.source_message_id || !bill.source_attachment_id) return null
  return `/api/email/attachments/mail-${bill.source_message_id}?attachmentId=${encodeURIComponent(bill.source_attachment_id)}&filename=${encodeURIComponent(bill.source_filename || 'invoice')}`
}

export function BillsPayableLedger({
  bills, intakes, onAddBill, onRefresh, onBillChanged,
}: {
  bills: LuxorBill[]
  intakes: LuxorBillIntake[]
  onAddBill: () => void
  onRefresh: () => Promise<void> | void
  onBillChanged: (bill: LuxorBill) => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<LedgerTab>('all')
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('bill'))
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('all')
  const [vendor, setVendor] = useState('all')
  const [dueWindow, setDueWindow] = useState('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const selected = bills.find((bill) => bill.id === selectedId) || bills[0] || null
  const failedIntakes = intakes.filter((intake) => intake.status === 'failed')
  const processingIntakes = intakes.filter((intake) => intake.status === 'received' || intake.status === 'processing')

  const counts = useMemo(() => Object.fromEntries((['review', 'due', 'ready', 'paid', 'hold'] as LedgerTab[])
    .map((key) => [key, bills.filter((bill) => ledgerStatus(bill) === key).length])), [bills])
  const vendorOptions = useMemo(() => [{ value: 'all', label: 'All vendors' }, ...Array.from(new Set(bills.map((bill) => bill.provider))).sort().map((name) => ({ value: name, label: name }))], [bills])
  const openBills = bills.filter((bill) => bill.status !== 'paid' && bill.extraction_status !== 'duplicate')
  const totalDue = openBills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0)
  const nextDue = openBills.filter((bill) => bill.due_date).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0]
  const visible = useMemo(() => bills.filter((bill) => {
    if (tab !== 'all' && ledgerStatus(bill) !== tab) return false
    if (source !== 'all' && bill.source_type !== source) return false
    if (vendor !== 'all' && bill.provider !== vendor) return false
    if (dueWindow !== 'all') {
      if (!bill.due_date) return dueWindow === 'missing'
      const days = Math.ceil((new Date(`${bill.due_date}T23:59:59`).getTime() - Date.now()) / 86_400_000)
      if (dueWindow === 'overdue' && days >= 0) return false
      if (dueWindow === '7' && (days < 0 || days > 7)) return false
      if (dueWindow === '30' && (days < 0 || days > 30)) return false
    }
    const haystack = `${bill.provider} ${bill.service} ${bill.invoice_number || ''} ${bill.source_subject || ''}`.toLowerCase()
    return !query.trim() || haystack.includes(query.trim().toLowerCase())
  }), [bills, dueWindow, query, source, tab, vendor])

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

  async function review(action: 'approve' | 'flag' | 'mark_paid') {
    if (!selected) return
    setBusy(action)
    setMessage(null)
    try {
      const response = await fetch(`/api/operations/bills/${selected.id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Bill review failed.')
      onBillChanged(payload)
      setMessage(action === 'approve' ? 'Approved and ready for payment.' : action === 'mark_paid' ? 'Payment recorded.' : 'Kept in review with an owner flag.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Bill review failed.') }
    finally { setBusy(null) }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-sm">
      <div className="border-b border-[color:var(--portal-border)] px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><CircleDollarSign size={19} className="text-[#a8792f] dark:text-[#caa24c]" /><h2 className="text-lg font-semibold tracking-tight text-[color:var(--portal-text)]">Payables Ledger</h2></div>
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Review every vendor bill from source to payment readiness.</p>
            <p className="mt-3 text-sm font-semibold text-[color:var(--portal-text)]">{money(totalDue)} due across {openBills.length} bill{openBills.length === 1 ? '' : 's'} <span className="ml-2 text-[10px] font-normal text-[color:var(--portal-muted)]">{nextDue ? `Next: ${dateLabel(nextDue.due_date)} · ${nextDue.provider}` : 'No open due dates'}</span></p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PortalButton type="button" size="sm" onClick={() => void onRefresh()}><RefreshCw size={13} /> Refresh</PortalButton>
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
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3"><Search size={14} className="text-[color:var(--portal-muted)]" /><span className="sr-only">Search bills</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendor, service, invoice" className="min-w-0 flex-1 bg-transparent text-xs text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)]" /></label>
            <PortalSelect value={dueWindow} onChange={setDueWindow} options={[{ value: 'all', label: 'All due dates' }, { value: 'overdue', label: 'Overdue' }, { value: '7', label: 'Next 7 days' }, { value: '30', label: 'Next 30 days' }, { value: 'missing', label: 'Missing due date' }]} buttonClassName="min-h-10 w-full" />
            <PortalSelect value={vendor} onChange={setVendor} options={vendorOptions} buttonClassName="min-h-10 w-full" />
            <PortalSelect value={source} onChange={setSource} options={[{ value: 'all', label: 'All sources' }, { value: 'email', label: 'Invoice inbox' }, { value: 'manual', label: 'Manual' }]} buttonClassName="min-h-10 w-full" />
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
                    <span className="hidden text-[9px] text-[color:var(--portal-muted)] lg:block">{bill.source_type === 'email' ? 'Email' : 'Manual'}</span>
                    <span className="hidden text-[9px] text-[color:var(--portal-muted)] lg:block">{bill.received_at ? new Date(bill.received_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                    <span className="hidden text-[9px] text-[color:var(--portal-muted)] lg:block">{dateLabel(bill.due_date)}</span>
                    <div className="lg:text-right"><p className="font-mono text-xs font-semibold text-[color:var(--portal-text)]">{money(bill.amount, bill.currency)}</p><p className="mt-1 text-[9px] text-[color:var(--portal-muted)] lg:hidden">{dateLabel(bill.due_date)}</p></div>
                    <span className={`w-fit rounded-md border px-2 py-1 text-[9px] font-bold ${badge.color}`}>{badge.label}</span><ChevronRight size={15} className="hidden text-[color:var(--portal-faint)] sm:block" />
                  </button>
                })}
              </div>
            </div>)}
          </div>
        </div>

        <aside className={`${selectedId ? 'fixed inset-x-3 bottom-20 top-20 z-50 block shadow-2xl' : 'hidden'} min-h-0 overflow-y-auto rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 portal-scrollbar sm:inset-x-8 sm:p-5 xl:static xl:block xl:rounded-none xl:border-0 xl:shadow-none`}>
          {selected ? <BillReview bill={selected} busy={busy} message={message} onClose={() => selectBill(null)} onReview={review} /> : <div className="flex min-h-72 flex-col items-center justify-center text-center"><FileText size={24} className="text-[color:var(--portal-faint)]" /><p className="mt-3 text-xs font-semibold text-[color:var(--portal-text)]">Select a bill</p><p className="mt-1 max-w-52 text-[10px] leading-4 text-[color:var(--portal-muted)]">Review the original document, extracted facts, arithmetic, and email source together.</p></div>}
        </aside>
      </div>
    </section>
  )
}

function BillReview({ bill, busy, message, onClose, onReview }: { bill: LuxorBill; busy: string | null; message: string | null; onClose: () => void; onReview: (action: 'approve' | 'flag' | 'mark_paid') => void }) {
  const url = sourceUrl(bill)
  const badge = statusLabel(bill)
  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-3"><div><span className={`inline-flex rounded-md border px-2 py-1 text-[9px] font-bold ${badge.color}`}>{badge.label}</span><h3 className="mt-3 text-base font-semibold text-[color:var(--portal-text)]">{bill.provider}</h3><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">{bill.source_filename || bill.service}</p></div><button type="button" onClick={onClose} aria-label="Close bill detail" className="rounded-lg p-2 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)] xl:hidden"><X size={16} /></button></div>
    <div className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
      {url && bill.source_content_type?.startsWith('image/') ? <img src={url} alt={`Source invoice from ${bill.provider}`} className="h-44 w-full object-contain p-3" /> : <div className="flex h-40 flex-col items-center justify-center bg-[color:var(--portal-soft)]"><FileText size={30} className="text-[#a8792f] dark:text-[#caa24c]" /><p className="mt-3 max-w-56 truncate text-[10px] text-[color:var(--portal-muted)]">{bill.source_filename || 'Manual bill'}</p></div>}
      {url ? <a href={url} target="_blank" rel="noreferrer" className="flex min-h-10 items-center justify-center gap-1.5 border-t border-[color:var(--portal-border)] text-[10px] font-bold text-[#a8792f] hover:bg-[#caa24c]/5 dark:text-[#caa24c]">View full document <ArrowUpRight size={11} /></a> : null}
    </div>
    <section><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">Extracted facts</p><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4"><Fact label="Total" value={money(bill.amount, bill.currency)} /><Fact label="Due date" value={dateLabel(bill.due_date)} /><Fact label="Invoice" value={bill.invoice_number || 'Not found'} /><Fact label="Confidence" value={bill.extraction_confidence === null ? 'Manual' : `${Math.round(bill.extraction_confidence * 100)}%`} /><Fact label="Service" value={bill.service} wide /><Fact label="Frequency" value={bill.frequency} /></dl></section>
    <section className={`rounded-xl border p-3 ${bill.arithmetic_status === 'mismatch' ? 'border-rose-500/25 bg-rose-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}><div className="flex gap-2">{bill.arithmetic_status === 'mismatch' ? <AlertCircle size={15} className="mt-0.5 text-rose-500" /> : <ShieldCheck size={15} className="mt-0.5 text-emerald-600 dark:text-emerald-400" />}<div><p className="text-[10px] font-bold text-[color:var(--portal-text)]">Arithmetic {bill.arithmetic_status === 'balanced' ? 'checks out' : bill.arithmetic_status === 'mismatch' ? 'needs review' : 'not available'}</p><p className="mt-1 text-[9px] leading-4 text-[color:var(--portal-muted)]">{bill.arithmetic_status === 'balanced' ? 'Line items match the extracted total.' : bill.arithmetic_status === 'mismatch' ? 'Line items do not match the extracted total.' : 'The document did not provide enough line-item detail.'}</p></div></div></section>
    {bill.source_type === 'email' ? <section><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">Email provenance</p><div className="mt-3 space-y-2 text-[10px]"><p className="truncate text-[color:var(--portal-text)]">From {bill.source_sender}</p><p className="truncate text-[color:var(--portal-muted)]">{bill.source_subject}</p><p className="text-[color:var(--portal-muted)]">Received {bill.received_at ? new Date(bill.received_at).toLocaleString() : 'unknown'}</p></div></section> : null}
    {bill.evidence?.length ? <section><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">Source evidence</p><div className="mt-3 space-y-2">{bill.evidence.slice(0, 3).map((item, index) => <blockquote key={`${item.field}-${index}`} className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-[9px] leading-4 text-[color:var(--portal-muted)]"><span className="font-bold text-[color:var(--portal-text)]">{item.field}: </span>{item.quote}{item.page_number ? ` · p. ${item.page_number}` : ''}</blockquote>)}</div></section> : null}
    {message ? <p role="status" className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[10px] text-[color:var(--portal-text)]">{message}</p> : null}
    {bill.status !== 'paid' ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{bill.extraction_status === 'needs_review' ? <PortalButton type="button" variant="primary" disabled={Boolean(busy)} onClick={() => onReview('approve')} className="w-full"><CheckCircle2 size={13} />{busy === 'approve' ? 'Approving…' : 'Approve & mark ready'}</PortalButton> : <PortalButton type="button" variant="primary" disabled={Boolean(busy)} onClick={() => onReview('mark_paid')} className="w-full"><CheckCircle2 size={13} />{busy === 'mark_paid' ? 'Saving…' : 'Mark paid'}</PortalButton>}<PortalButton type="button" disabled={Boolean(busy)} onClick={() => onReview('flag')} className="w-full"><Clock3 size={13} /> Keep in review</PortalButton></div> : <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"><Check size={14} /> Payment recorded</div>}
  </div>
}

function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? 'col-span-2' : ''}><dt className="text-[9px] uppercase tracking-wider text-[color:var(--portal-muted)]">{label}</dt><dd className="mt-1 truncate text-xs font-semibold text-[color:var(--portal-text)]">{value}</dd></div>
}
