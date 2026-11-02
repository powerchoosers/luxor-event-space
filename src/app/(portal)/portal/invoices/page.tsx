'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  FileText,
  Search,
  ExternalLink,
  ArrowRightLeft,
  Ban,
  Trash2,
  Sparkles
} from 'lucide-react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { LuxorInvoice, LuxorInvoiceStatus } from '@/lib/luxorInquiryTypes'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalStickyTable,
  PortalStickyThead,
  PortalTableCard,
  PortalStatusBadge,
  PortalSelect,
  PortalTableSkeleton
} from '@/components/portal/PortalUI'
import { MagicCard } from '@/components/ui/magic-card'
import { BorderBeam } from '@/components/ui/border-beam'
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar'
import {
  PortalBulkActionDeck,
  PortalBulkChoiceDialog,
  PortalBulkConfirmDialog,
  PortalBulkHeaderSelector,
  PortalBulkRowSelector,
  usePortalBulkSelection,
} from '@/components/portal/PortalBulkSelection'

type EditableInvoiceStatus = Exclude<LuxorInvoiceStatus, 'paid' | 'cancelled'>
const INVOICE_STATUS_OPTIONS: Array<{ value: EditableInvoiceStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
]

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<LuxorInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const bulkSelection = usePortalBulkSelection<string>()
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false)
  const [bulkStatus, setBulkStatus] = useState<EditableInvoiceStatus>('sent')
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<LuxorInvoice | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidBusy, setVoidBusy] = useState(false)

  const handleSendAiReminder = async (invoiceId: string) => {
    try {
      setSendingReminderId(invoiceId)
      const res = await fetch(`/api/invoices/${invoiceId}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'unpaid_invoice' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to send AI reminder.')
      alert(`AI Invoice Reminder sent successfully!\nSubject: ${data.subject}`)
      await fetchInvoices()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to send AI reminder.')
    } finally {
      setSendingReminderId(null)
    }
  }

  const fetchInvoices = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/invoices')
      if (!res.ok) throw new Error('Failed to load invoices.')
      const data = await res.json()
      setInvoices(data)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to fetch invoices.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInvoices()
  }, [])

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch('/api/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status: newStatus,
          paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
        }),
      })

      if (!res.ok) throw new Error('Failed to update invoice status.')
      const updated = await res.json()
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? updated : inv)))
    } catch (err) {
      console.error(err)
      alert('Error updating status.')
    }
  }

  // Filter invoices
  const filteredInvoices = invoices.filter((inv) => {
    return (
      inv.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.event_type && inv.event_type.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  })
  const matchingInvoiceIds = useMemo(() => filteredInvoices.map((invoice) => invoice.id), [filteredInvoices])
  const bulkSelectedCount = bulkSelection.selectedCount(matchingInvoiceIds.length)
  const resolvedSelectedIds = bulkSelection.resolveIds(matchingInvoiceIds)
  const selectedDraftCount = invoices.filter((invoice) => resolvedSelectedIds.includes(invoice.id) && invoice.status === 'draft').length

  const runInvoiceBulkStatus = async (status: EditableInvoiceStatus) => {
    const ids = bulkSelection.resolveIds(matchingInvoiceIds)
    if (!ids.length) return
    setBulkBusy(status)
    try {
      const response = await fetch('/api/portal/bulk-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'invoices', action: 'set_status', ids, value: status }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to update invoices.')
      setInvoices((current) => current.map((invoice) => ids.includes(invoice.id) ? { ...invoice, status, paid_at: null } : invoice))
      bulkSelection.clear()
    } catch (bulkError) {
      alert(bulkError instanceof Error ? bulkError.message : 'Unable to update invoices.')
      void fetchInvoices()
    } finally {
      setBulkBusy(null)
    }
  }

  const deleteSelectedInvoices = async () => {
    const ids = invoices.filter((invoice) => resolvedSelectedIds.includes(invoice.id) && invoice.status === 'draft').map((invoice) => invoice.id)
    if (!ids.length) return
    setBulkBusy('delete')
    const deletedIds: string[] = []
    const blockedMessages: string[] = []
    const cleanupMessages: string[] = []
    for (const id of ids) {
      try {
        const response = await fetch(`/api/invoices/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmDraftDelete: true }) })
        const payload = await response.json().catch(() => ({})) as { error?: string; storageCleanupPending?: boolean; message?: string }
        if (!response.ok) throw new Error(payload.error || `Invoice ${id.slice(0, 8)} could not be deleted.`)
        deletedIds.push(id)
        if (payload.storageCleanupPending && payload.message) cleanupMessages.push(payload.message)
      } catch (deleteError) {
        blockedMessages.push(deleteError instanceof Error ? deleteError.message : `Invoice ${id.slice(0, 8)} could not be deleted.`)
      }
    }
    setInvoices((current) => current.filter((invoice) => !deletedIds.includes(invoice.id)))
    bulkSelection.clear()
    setConfirmBulkDelete(false)
    setBulkBusy(null)
    if (blockedMessages.length) alert(`${deletedIds.length} draft${deletedIds.length === 1 ? '' : 's'} deleted. ${blockedMessages.length} kept:\n${blockedMessages.join('\n')}`)
    if (cleanupMessages.length) alert(cleanupMessages.join('\n'))
  }

  const voidInvoice = async () => {
    if (!voidTarget || voidReason.trim().length < 8) return
    setVoidBusy(true)
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(voidTarget.id)}/void`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmVoid: true, reason: voidReason.trim() }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; status?: string }
      if (!response.ok) throw new Error(payload.error || 'Invoice could not be cancelled.')
      setInvoices((current) => current.map((invoice) => invoice.id === voidTarget.id ? { ...invoice, status: 'cancelled' } : invoice))
      setVoidTarget(null)
      setVoidReason('')
    } catch (voidError) {
      alert(voidError instanceof Error ? voidError.message : 'Invoice could not be cancelled.')
      void fetchInvoices()
    } finally {
      setVoidBusy(false)
    }
  }

  // Computations
  const paidInvoices = invoices.filter((inv) => inv.status === 'paid')
  const netRevenue = paidInvoices.reduce((acc, inv) => acc + Number(inv.total), 0)

  const outstandingInvoices = invoices.filter((inv) => inv.status === 'sent' || inv.status === 'overdue')
  const outstandingAR = outstandingInvoices.reduce((acc, inv) => acc + Number(inv.total), 0)

  const overdueInvoices = invoices.filter((inv) => inv.status === 'overdue')
  const overdueAR = overdueInvoices.reduce((acc, inv) => acc + Number(inv.total), 0)

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden">
      <PortalPageHeader
        icon={<FileText size={18} />}
        title="Revenue & Invoicing"
        actions={
          <div className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">
            {invoices.length} total invoice records
          </div>
        }
      />

      {/* Financial Health Summary */}
      <div className="grid shrink-0 grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
        <StatsPanel
          label="Net Revenue Paid"
          value={`$${netRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          trend={`${paidInvoices.length} paid`}
          highlight
          gaugePercent={netRevenue + outstandingAR > 0 ? (netRevenue / (netRevenue + outstandingAR)) * 100 : 100}
        />
        <StatsPanel
          label="Outstanding A/R"
          value={`$${outstandingAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          trend={`${outstandingInvoices.length} unpaid`}
          isNegative={outstandingAR > 0}
          progress={netRevenue + outstandingAR > 0 ? (outstandingAR / (netRevenue + outstandingAR)) * 100 : 0}
        />
        <StatsPanel
          label="Overdue Receivables"
          value={`$${overdueAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          trend={`${overdueInvoices.length} overdue`}
          isNegative={overdueAR > 0}
          progress={outstandingAR > 0 ? (overdueAR / outstandingAR) * 100 : 0}
        />
      </div>

      <PortalTableCard
        controls={
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full md:w-96 group">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter by ID, Client name, or Event type..."
                className="w-full bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] rounded-lg pl-10 pr-4 py-2.5 text-xs text-[color:var(--portal-text)] focus:outline-none focus:border-[#caa24c]/50 transition-all"
              />
            </div>
          </div>
        }
      >
        <PortalStickyTable minWidth="980px">
          <PortalStickyThead>
            <tr className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-[0.16em] border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/80">
              <th className="w-14 px-4 py-5 text-center"><PortalBulkHeaderSelector state={bulkSelection.pageSelectionState(matchingInvoiceIds)} onChange={() => bulkSelection.selectPage(matchingInvoiceIds)} /></th>
              <th className="px-4 py-5">Invoice ID</th>
              <th className="px-6 py-5">Client Portfolio</th>
              <th className="px-6 py-5">Value (USD)</th>
              <th className="px-6 py-5">Date Summary</th>
              <th className="px-6 py-5">Fulfillment</th>
              <th className="px-8 py-5 text-right">Lifecycle status</th>
            </tr>
          </PortalStickyThead>
          <tbody className="divide-y divide-[color:var(--portal-border)]/50">
            {loading ? (
              <PortalTableSkeleton cols={7} rows={5} />
            ) : error ? (
              <tr>
                <td colSpan={7} className="px-8 py-12 text-sm text-rose-600 dark:text-rose-400">
                  {error}
                </td>
              </tr>
            ) : filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-8 py-12 text-sm text-[color:var(--portal-muted)] text-center">
                  No invoice records match search parameters.
                </td>
              </tr>
            ) : (
              filteredInvoices.map((inv, rowIndex) => (
                <tr key={inv.id} className={`hover:bg-[color:var(--portal-soft)]/50 transition-colors group ${bulkSelection.isSelected(inv.id) ? 'bg-[#caa24c]/5' : ''}`}>
                  <td className="px-4 py-6 text-center"><PortalBulkRowSelector checked={bulkSelection.isSelected(inv.id)} index={rowIndex + 1} onChange={() => bulkSelection.toggle(inv.id)} label={`invoice ${inv.id.slice(0, 8)}`} /></td>
                  <td className="px-4 py-6 tabular-nums font-bold text-xs text-[color:var(--portal-muted)] group-hover:text-[#caa24c] transition-colors">
                    {inv.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-6 py-6">
                    <div>
                      {inv.inquiry_id ? (
                        <Link
                          href={`/portal/leads/${inv.inquiry_id}`}
                          className="text-sm font-bold text-[color:var(--portal-text)] leading-none mb-1 hover:text-[#caa24c] inline-flex items-center gap-1.5"
                        >
                          {inv.client_name} <ExternalLink size={12} className="text-[color:var(--portal-muted)]" />
                        </Link>
                      ) : (
                        <p className="text-sm font-bold text-[color:var(--portal-text)] leading-none mb-1">{inv.client_name}</p>
                      )}
                      <p className="text-[10px] text-[color:var(--portal-muted)] font-medium italic mt-1">{inv.event_type || 'Custom Booking'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-6 tabular-nums text-sm text-[color:var(--portal-text)] font-bold tracking-tight">
                    ${inv.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex flex-col tabular-nums">
                      <span className="text-xs text-[color:var(--portal-text)] font-medium">{new Date(inv.created_at).toLocaleDateString()}</span>
                      <span className="text-[10px] text-[color:var(--portal-muted)] font-medium uppercase tracking-tight mt-1">
                        Due: {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'Immediate'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <PortalStatusBadge status={inv.status} />
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {inv.status !== 'paid' ? (
                        <button
                          type="button"
                          onClick={() => handleSendAiReminder(inv.id)}
                          disabled={sendingReminderId === inv.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-purple-300 transition-colors hover:bg-purple-500/20 disabled:opacity-40 cursor-pointer"
                        >
                          <Sparkles size={11} /> {sendingReminderId === inv.id ? 'Sending...' : 'AI Remind'}
                        </button>
                      ) : null}
                      {['sent', 'overdue'].includes(inv.status) && inv.proposal_sent_at && !inv.proposal_accepted_at && !inv.booking_id && !inv.paid_at
                        && !inv.payment_requested_at && !inv.stripe_checkout_session_id && !inv.stripe_checkout_url ? (
                        <button type="button" onClick={() => { setVoidTarget(inv); setVoidReason('') }} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/25 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 hover:bg-rose-500/10 dark:text-rose-300" aria-label={`Cancel invoice ${inv.id.slice(0, 8)}`}>
                          <Ban size={12} /> Cancel
                        </button>
                      ) : null}
                      <PortalSelect
                        value={inv.status}
                        onChange={(value) => handleUpdateStatus(inv.id, value)}
                        className="w-36"
                        options={[
                          { value: 'draft', label: 'Draft' },
                          { value: 'sent', label: 'Sent' },
                          { value: 'paid', label: 'Paid' },
                          { value: 'overdue', label: 'Overdue' },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </PortalStickyTable>
      </PortalTableCard>
      <PortalBulkActionDeck
        selectedCount={bulkSelectedCount}
        pageCount={matchingInvoiceIds.length}
        totalCount={matchingInvoiceIds.length}
        allMatching={bulkSelection.allMatching}
        busyAction={bulkBusy}
        noun="invoice"
        onSelectAll={bulkSelection.selectAllMatching}
        onClear={bulkSelection.clear}
        onAction={(action) => {
          if (action === 'status') setBulkStatusOpen(true)
          if (action === 'delete') setConfirmBulkDelete(true)
        }}
        actions={[
          { id: 'status', label: 'Change status', icon: <ArrowRightLeft size={13} /> },
          { id: 'delete', label: 'Delete drafts', icon: <Trash2 size={13} />, tone: 'danger', disabled: selectedDraftCount === 0 },
        ]}
      />
      <PortalBulkChoiceDialog
        open={bulkStatusOpen}
        title="Change invoice status"
        description="Paid is intentionally excluded. Payments must be recorded through the payment workflow."
        label="New status"
        value={bulkStatus}
        options={INVOICE_STATUS_OPTIONS}
        confirmLabel="Update invoices"
        busy={Boolean(bulkBusy)}
        onValueChange={(value) => setBulkStatus(value as EditableInvoiceStatus)}
        onConfirm={() => { setBulkStatusOpen(false); void runInvoiceBulkStatus(bulkStatus) }}
        onClose={() => setBulkStatusOpen(false)}
      />
      <PortalBulkConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selectedDraftCount} selected draft${selectedDraftCount === 1 ? '' : 's'}?`}
        description={`Only never-issued draft invoices with no payment, booking, child invoice, or payment request can be deleted. ${bulkSelectedCount - selectedDraftCount} selected non-draft invoice${bulkSelectedCount - selectedDraftCount === 1 ? ' will' : 's will'} be left unchanged. Deletion is recorded in the audit history.`}
        confirmLabel="Delete eligible drafts"
        busy={bulkBusy === 'delete'}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => void deleteSelectedInvoices()}
      />
      {voidTarget ? <div className="fixed inset-0 z-[120] grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !voidBusy) setVoidTarget(null) }}>
        <section role="dialog" aria-modal="true" aria-labelledby="void-invoice-title" className="w-full max-w-lg rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 shadow-2xl">
          <h2 id="void-invoice-title" className="font-serif text-xl font-semibold text-[color:var(--portal-text)]">Cancel sent invoice?</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">This records a cancellation in the financial audit history. Paid, accepted, booked, or payment-request invoices cannot be cancelled here. No refund or customer email will be created.</p>
          <label className="mt-5 block text-xs font-semibold text-[color:var(--portal-text)]" htmlFor="void-invoice-reason">Reason for cancellation</label>
          <textarea id="void-invoice-reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] p-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]" placeholder="Enter at least 8 characters" />
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" disabled={voidBusy} onClick={() => setVoidTarget(null)} className="rounded-lg border border-[color:var(--portal-border)] px-4 py-2 text-sm font-semibold text-[color:var(--portal-text)] disabled:opacity-50">Keep invoice</button>
            <button type="button" disabled={voidBusy || voidReason.trim().length < 8} onClick={() => void voidInvoice()} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{voidBusy ? 'Recording…' : 'Confirm cancellation'}</button>
          </div>
        </section>
      </div> : null}
    </PortalPageFrame>
  )
}

function StatsPanel({
  label,
  value,
  trend,
  isNegative = false,
  highlight = false,
  gaugePercent,
  progress,
}: {
  label: string
  value: string
  trend: string
  isNegative?: boolean
  highlight?: boolean
  gaugePercent?: number
  progress?: number
}) {
  return (
    <MagicCard className="relative flex flex-row items-center justify-between gap-4 rounded-2xl p-6 overflow-hidden group">
      {highlight ? <BorderBeam size={85} duration={10} borderWidth={1.2} /> : null}
      <div className="min-w-0 flex-1 pr-2">
        <div className="flex items-center justify-between gap-2 mb-3 relative z-10">
          <p className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-[0.16em]">{label}</p>
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider tabular-nums shrink-0 ${
              isNegative
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
            }`}
          >
            {trend}
          </span>
        </div>
        <h3 className="text-2xl font-extrabold text-[color:var(--portal-text)] tabular-nums tracking-tight relative z-10">
          {value}
        </h3>
        {progress !== undefined ? (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]/50">
            <motion.div
              className={`h-full rounded-full ${isNegative ? 'bg-gradient-to-r from-rose-500 to-rose-400' : 'bg-gradient-to-r from-[#caa24c] to-[#f1d27a]'}`}
              initial={{ width: '0%' }}
              whileInView={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
              viewport={{ once: true, margin: '0px 0px -30px 0px' }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        ) : null}
      </div>
      {gaugePercent !== undefined ? (
        <div className="ml-auto shrink-0">
          <AnimatedCircularProgressBar
            value={gaugePercent}
            size={52}
            strokeWidth={4.5}
            gaugePrimaryColor="#caa24c"
            subLabel="Collected"
          />
        </div>
      ) : null}
    </MagicCard>
  )
}
