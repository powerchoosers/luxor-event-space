'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  FileText,
  Search,
  ExternalLink,
  ArrowRightLeft,
  Trash2,
  Sparkles
} from 'lucide-react'
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
import {
  PortalBulkActionDeck,
  PortalBulkChoiceDialog,
  PortalBulkConfirmDialog,
  PortalBulkHeaderSelector,
  PortalBulkRowSelector,
  usePortalBulkSelection,
} from '@/components/portal/PortalBulkSelection'

type EditableInvoiceStatus = Exclude<LuxorInvoiceStatus, 'paid'>
const INVOICE_STATUS_OPTIONS: Array<{ value: EditableInvoiceStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
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
    const ids = bulkSelection.resolveIds(matchingInvoiceIds)
    if (!ids.length) return
    setBulkBusy('delete')
    const deletedIds: string[] = []
    const blockedMessages: string[] = []
    for (const id of ids) {
      try {
        const response = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
        const payload = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) throw new Error(payload.error || `Invoice ${id.slice(0, 8)} could not be deleted.`)
        deletedIds.push(id)
      } catch (deleteError) {
        blockedMessages.push(deleteError instanceof Error ? deleteError.message : `Invoice ${id.slice(0, 8)} could not be deleted.`)
      }
    }
    setInvoices((current) => current.filter((invoice) => !deletedIds.includes(invoice.id)))
    bulkSelection.clear()
    setConfirmBulkDelete(false)
    setBulkBusy(null)
    if (blockedMessages.length) alert(`${deletedIds.length} invoice${deletedIds.length === 1 ? '' : 's'} deleted. ${blockedMessages.length} kept:\n${blockedMessages.join('\n')}`)
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
        />
        <StatsPanel
          label="Outstanding A/R"
          value={`$${outstandingAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          trend={`${outstandingInvoices.length} unpaid`}
          isNegative={outstandingAR > 0}
        />
        <StatsPanel
          label="Overdue Receivables"
          value={`$${overdueAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          trend={`${overdueInvoices.length} overdue`}
          isNegative={overdueAR > 0}
        />
      </div>

      <PortalTableCard
        controls={
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full md:w-96 group">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-650" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter by ID, Client name, or Event type..."
                className="w-full bg-[#080808] border border-zinc-900 rounded-lg pl-10 pr-4 py-2.5 text-xs text-zinc-400 focus:outline-none focus:border-blue-700/50 transition-all font-mono"
              />
            </div>
          </div>
        }
      >
        <PortalStickyTable minWidth="980px">
          <PortalStickyThead>
            <tr className="text-[10px] uppercase font-bold text-zinc-600 tracking-[0.2em] border-b border-zinc-900/50 bg-[#0c0c0c]">
              <th className="w-14 px-4 py-5 text-center"><PortalBulkHeaderSelector state={bulkSelection.pageSelectionState(matchingInvoiceIds)} onChange={() => bulkSelection.selectPage(matchingInvoiceIds)} /></th>
              <th className="px-4 py-5">Invoice ID</th>
              <th className="px-6 py-5">Client Portfolio</th>
              <th className="px-6 py-5">Value (USD)</th>
              <th className="px-6 py-5">Date Summary</th>
              <th className="px-6 py-5">Fulfillment</th>
              <th className="px-8 py-5 text-right">Lifecycle status</th>
            </tr>
          </PortalStickyThead>
          <tbody className="divide-y divide-zinc-900/30">
            {loading ? (
              <PortalTableSkeleton cols={7} rows={5} />
            ) : error ? (
              <tr>
                <td colSpan={7} className="px-8 py-12 text-sm text-red-350">
                  {error}
                </td>
              </tr>
            ) : filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-8 py-12 text-sm text-zinc-550 text-center">
                  No invoice records match search parameters.
                </td>
              </tr>
            ) : (
              filteredInvoices.map((inv, rowIndex) => (
                <tr key={inv.id} className={`hover:bg-zinc-900/40 transition-colors group ${bulkSelection.isSelected(inv.id) ? 'bg-[#caa24c]/5' : ''}`}>
                  <td className="px-4 py-6 text-center"><PortalBulkRowSelector checked={bulkSelection.isSelected(inv.id)} index={rowIndex + 1} onChange={() => bulkSelection.toggle(inv.id)} label={`invoice ${inv.id.slice(0, 8)}`} /></td>
                  <td className="px-4 py-6 font-mono text-sm text-zinc-400 group-hover:text-[#caa24c] transition-colors">
                    {inv.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-6 py-6">
                    <div>
                      {inv.inquiry_id ? (
                        <Link
                          href={`/portal/leads/${inv.inquiry_id}`}
                          className="text-sm font-semibold text-white/90 leading-none mb-1 hover:text-blue-400 inline-flex items-center gap-1.5"
                        >
                          {inv.client_name} <ExternalLink size={12} className="text-zinc-650" />
                        </Link>
                      ) : (
                        <p className="text-sm font-semibold text-white/90 leading-none mb-1">{inv.client_name}</p>
                      )}
                      <p className="text-[10px] text-zinc-500 font-medium italic mt-1">{inv.event_type || 'Custom Booking'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-6 font-mono text-sm text-white/90 font-bold tracking-tight">
                    ${inv.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex flex-col">
                      <span className="text-xs text-zinc-400 font-medium">{new Date(inv.created_at).toLocaleDateString()}</span>
                      <span className="text-[10px] text-zinc-600 font-medium uppercase tracking-tighter mt-1">
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
                      <PortalSelect
                        value={inv.status}
                        onChange={(value) => handleUpdateStatus(inv.id, value)}
                        className="w-36"
                        options={[
                          { value: 'draft', label: 'Draft' },
                          { value: 'sent', label: 'Sent' },
                          { value: 'paid', label: 'Paid' },
                          { value: 'overdue', label: 'Overdue' },
                          { value: 'cancelled', label: 'Cancelled' },
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
          { id: 'delete', label: 'Delete', icon: <Trash2 size={13} />, tone: 'danger' },
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
        title={`Delete ${bulkSelectedCount} selected invoice${bulkSelectedCount === 1 ? '' : 's'}?`}
        description="Draft, sent, overdue, and cancelled invoices can be permanently deleted. Paid invoices are protected and will be kept because they are part of the payment record. Open Stripe checkout sessions are expired before deletion."
        confirmLabel="Delete eligible invoices"
        busy={bulkBusy === 'delete'}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => void deleteSelectedInvoices()}
      />
    </PortalPageFrame>
  )
}

function StatsPanel({
  label,
  value,
  trend,
  isNegative = false,
}: {
  label: string
  value: string
  trend: string
  isNegative?: boolean
}) {
  const isPaid = label.toLowerCase().includes('paid')
  const glowClass = isPaid ? 'luxor-glow-green' : 'luxor-glow-gold'

  return (
    <div className={`luxor-glass-card rounded-2xl p-6 ${glowClass} overflow-hidden group shadow-xl`}>
      <div className="flex items-center justify-between mb-3 relative z-10">
        <p className="text-[10px] uppercase font-black text-zinc-500 tracking-[0.2em]">{label}</p>
        <span
          className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
            isNegative
              ? 'bg-rose-500/5 text-rose-400 border-rose-500/10'
              : 'bg-emerald-500/5 text-emerald-400 border-emerald-500/10'
          }`}
        >
          {trend}
        </span>
      </div>
      <h3 className="text-2xl font-bold text-[color:var(--portal-text)] font-mono tracking-tight group-hover:translate-x-1 transition-transform duration-300 relative z-10">
        {value}
      </h3>
    </div>
  )
}
