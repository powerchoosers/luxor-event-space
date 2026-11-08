'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  FileText,
  Search,
  Ban,
  Trash2,
  Sparkles
} from '@/lib/icons/phosphor-compat'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { LuxorInvoice, type LuxorBooking, type LuxorPayment, type LuxorPaymentInstallment, type LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'
import { getLuxorBusinessFinanceRows, getLuxorInvoiceFinancialSummary } from '@/lib/luxorFinanceReporting'
import { formatLuxorDate } from '@/lib/luxorDateFormatting'
import { getInvoiceCollectionDisplayState } from '@/lib/luxorPaymentDashboardModel'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalStickyTable,
  PortalStickyThead,
  PortalTableCard,
  PortalStatusBadge,
  PortalSkeleton
} from '@/components/portal/PortalUI'
import { MagicCard } from '@/components/ui/magic-card'
import { BorderBeam } from '@/components/ui/border-beam'
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar'
import {
  PortalBulkActionDeck,
  PortalBulkConfirmDialog,
  PortalBulkHeaderSelector,
  PortalBulkRowSelector,
  usePortalBulkSelection,
} from '@/components/portal/PortalBulkSelection'

export default function InvoicesPage() {
  const reduceMotion = useReducedMotion()
  const [invoices, setInvoices] = useState<LuxorInvoice[]>([])
  const [payments, setPayments] = useState<LuxorPayment[]>([])
  const [refunds, setRefunds] = useState<LuxorPaymentRefundView[]>([])
  const [bookings, setBookings] = useState<LuxorBooking[]>([])
  const [installments, setInstallments] = useState<LuxorPaymentInstallment[]>([])
  const [verifiedTestInquiryIds, setVerifiedTestInquiryIds] = useState<ReadonlySet<string>>(new Set())
  const [verifiedTestBookingIds, setVerifiedTestBookingIds] = useState<ReadonlySet<string>>(new Set())
  const [financeVerified, setFinanceVerified] = useState(false)
  const [financeLoading, setFinanceLoading] = useState(true)
  const [financeError, setFinanceError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const bulkSelection = usePortalBulkSelection<string>()
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<LuxorInvoice | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidBusy, setVoidBusy] = useState(false)
  const refreshGeneration = useRef(0)

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
    const generation = ++refreshGeneration.current
    try {
      setLoading(true)
      setError(null)
      setFinanceLoading(true)
      setFinanceError(null)
      setFinanceVerified(false)
      const res = await fetch('/api/invoices?strictMetrics=1')
      if (!res.ok) throw new Error('Failed to load invoices.')
      const invoiceData = await res.json()
      if (!Array.isArray(invoiceData)) throw new Error('Invoice records could not be verified.')
      if (generation !== refreshGeneration.current) return
      setInvoices(invoiceData)

      try {
        const [paymentResponse, bookingResponse, installmentResponse, refundResponse] = await Promise.all([
          fetch('/api/payments'),
          fetch('/api/bookings?strictMetrics=1&financeRowsOnly=1'),
          fetch('/api/portal/payment-installments?strictMetrics=1'),
          fetch('/api/payments/refunds'),
        ])
        if (!paymentResponse.ok || !bookingResponse.ok || !installmentResponse.ok || !refundResponse.ok) throw new Error('Financial records could not be fully verified.')
        const [paymentData, bookingData, installmentData, refundData] = await Promise.all([paymentResponse.json(), bookingResponse.json(), installmentResponse.json(), refundResponse.json()])
        if (![paymentData, bookingData, installmentData, refundData].every(Array.isArray)) throw new Error('Financial records could not be fully verified.')
        const knownBookingIds = new Set(bookingData.map((booking: LuxorBooking) => booking.id).filter((id: unknown): id is string => typeof id === 'string'))
        const inquiryIds = [...new Set([
          ...invoiceData.map((invoice: LuxorInvoice) => invoice.inquiry_id),
          ...bookingData.map((booking: LuxorBooking) => booking.inquiry_id),
          ...paymentData.map((payment: LuxorPayment) => payment.inquiry_id),
        ].filter((id): id is string => typeof id === 'string' && Boolean(id)))]
        const bookingIds = [...new Set([
          ...invoiceData.map((invoice: LuxorInvoice) => invoice.booking_id),
          ...paymentData.map((payment: LuxorPayment) => payment.booking_id),
        ].filter((id): id is string => typeof id === 'string' && Boolean(id) && !knownBookingIds.has(id)))]
        const testInquiryIds = new Set<string>()
        const testBookingIds = new Set<string>()
        for (let offset = 0; offset < Math.max(inquiryIds.length, bookingIds.length); offset += 1000) {
          const inquiryBatch = inquiryIds.slice(offset, offset + 1000)
          const bookingBatch = bookingIds.slice(offset, offset + 1000)
          const classificationResponse = await fetch('/api/portal/test-inquiry-classification', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inquiryIds: inquiryBatch, bookingIds: bookingBatch }),
          })
          if (!classificationResponse.ok) throw new Error('Verified test classification is unavailable.')
          const classification = await classificationResponse.json() as { testInquiryIds?: unknown; testBookingIds?: unknown; unresolvedBookingIds?: unknown }
          const requestedInquiryIds = new Set(inquiryBatch.map((id) => id.toLowerCase()))
          const requestedBookingIds = new Set(bookingBatch.map((id) => id.toLowerCase()))
          if (!Array.isArray(classification.testInquiryIds)
            || !classification.testInquiryIds.every((id) => typeof id === 'string' && requestedInquiryIds.has(id.toLowerCase()))
            || !Array.isArray(classification.testBookingIds)
            || !classification.testBookingIds.every((id) => typeof id === 'string' && requestedBookingIds.has(id.toLowerCase()))
            || !Array.isArray(classification.unresolvedBookingIds)
            || classification.unresolvedBookingIds.length > 0) throw new Error('Verified test classification is unavailable.')
          classification.testInquiryIds.forEach((id: string) => testInquiryIds.add(id.toLowerCase()))
          classification.testBookingIds.forEach((id: string) => testBookingIds.add(id.toLowerCase()))
        }
        if (generation !== refreshGeneration.current) return
        setPayments(paymentData)
        setRefunds(refundData)
        setBookings(bookingData)
        setInstallments(installmentData)
        setVerifiedTestInquiryIds(testInquiryIds)
        setVerifiedTestBookingIds(testBookingIds)
        setFinanceVerified(true)
      } catch (financeLoadError) {
        if (generation !== refreshGeneration.current) return
        setFinanceError(financeLoadError instanceof Error ? financeLoadError.message : 'Financial summary could not be verified.')
      }
    } catch (err) {
      if (generation !== refreshGeneration.current) return
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to fetch invoices.')
    } finally {
      if (generation === refreshGeneration.current) {
        setLoading(false)
        setFinanceLoading(false)
      }
    }
  }

  useEffect(() => {
    fetchInvoices()
  }, [])

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

  const financeRows = useMemo(() => getLuxorBusinessFinanceRows({
    invoices,
    bookings,
    expenses: [],
    testInquiryIds: verifiedTestInquiryIds,
    testBookingIds: verifiedTestBookingIds,
  }), [invoices, bookings, verifiedTestInquiryIds, verifiedTestBookingIds])
  const financialSummary = useMemo(() => financeVerified
    ? getLuxorInvoiceFinancialSummary(invoices, payments, financeRows.testInquiryIds, financeRows.testBookingIds, installments, new Date(), financeRows.testInvoiceIds, refunds, financeRows.bookings)
    : null,
  [financeVerified, invoices, payments, financeRows.testInquiryIds, financeRows.testBookingIds, financeRows.testInvoiceIds, financeRows.bookings, installments, refunds])

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden">
      <PortalPageHeader
        icon={<FileText size={18} />}
        title="Revenue & Invoicing"
        actions={
          <div className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">
            {loading ? 'Loading invoices…' : error ? 'Invoice count unavailable' : `${invoices.length} total invoice records`}
          </div>
        }
      />

      {financeError && <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-[color:var(--portal-muted)]">Financial summary is unavailable because all linked records could not be verified: {financeError}</p>}
      {financialSummary?.refundReconciliationRequired && <p role="status" className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs leading-relaxed text-[color:var(--portal-muted)]">Refund-status rows ({financialSummary.refundRecordCount}, ${financialSummary.refundRecordAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} recorded gross) are shown separately. Their stored amounts do not establish whether they are original receipts marked refunded or separate refund events. Financial figures are unreconciled and use paid-status records only until matched to the payment source.</p>}

      {/* Shared read-only Finance summary */}
      <div className="grid shrink-0 grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
        <StatsPanel
          label="Event Payments Recorded"
          value={financialSummary ? `$${financialSummary.eventPaymentsReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : financeLoading ? 'Verifying…' : 'Unavailable'}
          trend={financialSummary ? `${financialSummary.eventPaymentRows.length} payment rows` : 'Verified records required'}
          highlight
          gaugePercent={financialSummary ? (financialSummary.eventPaymentsReceived + financialSummary.outstandingEventReceivable > 0 ? (financialSummary.eventPaymentsReceived / (financialSummary.eventPaymentsReceived + financialSummary.outstandingEventReceivable)) * 100 : 0) : undefined}
        />
        <StatsPanel
          label="Signed, Confirmed Event Balance Outstanding"
          value={financialSummary ? `$${financialSummary.outstandingEventReceivable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : financeLoading ? 'Verifying…' : 'Unavailable'}
          trend={financialSummary ? `${financialSummary.acceptedInvoiceRows.length} signed, confirmed obligations` : 'Verified records required'}
          isNegative={Boolean(financialSummary?.outstandingEventReceivable)}
          progress={financialSummary ? (financialSummary.eventPaymentsReceived + financialSummary.outstandingEventReceivable > 0 ? (financialSummary.outstandingEventReceivable / (financialSummary.eventPaymentsReceived + financialSummary.outstandingEventReceivable)) * 100 : 0) : undefined}
        />
        <StatsPanel
          label="Overdue Installment Remainder"
          value={financialSummary ? `$${financialSummary.overdueEventReceivable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : financeLoading ? 'Verifying…' : 'Unavailable'}
          trend="Past due in Chicago time"
          isNegative={Boolean(financialSummary?.overdueEventReceivable)}
          progress={financialSummary ? (financialSummary.outstandingEventReceivable > 0 ? (financialSummary.overdueEventReceivable / financialSummary.outstandingEventReceivable) * 100 : 0) : undefined}
        />
      </div>
      <div className="grid shrink-0 grid-cols-1 gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3"><span className="text-[color:var(--portal-muted)]">Known paid cash</span><strong className="ml-2 tabular-nums text-[color:var(--portal-text)]">{financialSummary ? `$${financialSummary.knownPaidCashTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</strong></div>
        <div className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3"><span className="text-[color:var(--portal-muted)]">Refundable security deposits held</span><strong className="ml-2 tabular-nums text-[color:var(--portal-text)]">{financialSummary ? `$${financialSummary.securityDepositsHeld.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</strong></div>
        <div className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3"><span className="text-[color:var(--portal-muted)]">Unallocated payments</span><strong className="ml-2 tabular-nums text-[color:var(--portal-text)]">{financialSummary ? `$${financialSummary.unallocatedPayments.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${financialSummary.unallocatedPaymentRows.length} rows` : '—'}</strong></div>
      </div>
      {financialSummary && financialSummary.unallocatedPaymentRows.length > 0 && <p role="status" className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-[color:var(--portal-muted)]">These paid-status transactions remain in known paid cash but cannot be assigned to event payments or refundable security deposits. Reconcile their invoice links or saved allocations.</p>}

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
          <caption className="sr-only">{loading ? 'Loading invoices' : 'Invoices'}</caption>
          <PortalStickyThead>
            <tr className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-[0.16em] border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/80">
              <th className="w-14 px-4 py-5 text-center"><PortalBulkHeaderSelector state={bulkSelection.pageSelectionState(matchingInvoiceIds)} onChange={() => bulkSelection.selectPage(matchingInvoiceIds)} /></th>
              <th className="px-4 py-5">Invoice ID</th>
              <th className="px-6 py-5">Client Portfolio</th>
              <th className="px-6 py-5">Value (USD)</th>
              <th className="px-6 py-5">Date Summary</th>
              <th className="px-6 py-5">Stored lifecycle / collection</th>
              <th className="px-8 py-5 text-right">Actions</th>
            </tr>
          </PortalStickyThead>
          <AnimatePresence mode="wait">
                  <motion.tbody
                    key={loading ? 'loading' : 'loaded'}
                    className="divide-y divide-[color:var(--portal-border)]/50 motion-reduce:!opacity-100 motion-reduce:![filter:none]"
                    aria-busy={loading}
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={reduceMotion ? { opacity: 1 } : { opacity: 0, filter: 'blur(4px)' }}
                    transition={{ duration: reduceMotion ? 0 : 0.16 }}
                  >
            {loading ? (
              Array.from({ length: 5 }, (_, row) => (
                <tr key={row} aria-hidden="true">
                  <td className="px-4 py-6"><PortalSkeleton className="mx-auto h-4 w-4 rounded" /></td>
                  <td className="px-4 py-6"><PortalSkeleton className="h-3 w-16 rounded" /></td>
                  <td className="px-6 py-6"><div className="space-y-1"><PortalSkeleton className="h-3.5 w-28 rounded" /><PortalSkeleton className="h-2.5 w-20 rounded" /></div></td>
                  <td className="px-6 py-6"><PortalSkeleton className="h-4 w-20 rounded" /></td>
                  <td className="px-6 py-6"><div className="space-y-1"><PortalSkeleton className="h-3 w-20 rounded" /><PortalSkeleton className="h-2.5 w-16 rounded" /></div></td>
                  <td className="px-6 py-6"><div className="space-y-1.5"><PortalSkeleton className="h-2.5 w-20 rounded" /><PortalSkeleton className="h-5 w-16 rounded-md" /></div></td>
                  <td className="px-8 py-6"><PortalSkeleton className="ml-auto h-8 w-20 rounded-lg" /></td>
                </tr>
              ))
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
                          className="mb-1 inline-block text-sm font-bold leading-none text-[color:var(--portal-text)] no-underline transition-colors hover:text-[#a8792f] dark:hover:text-[#f1d27a]"
                        >
                          {inv.client_name}
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
                      <span className="text-xs text-[color:var(--portal-text)] font-medium">{formatLuxorDate(inv.created_at) || 'Unknown date'}</span>
                      <span className="text-[10px] text-[color:var(--portal-muted)] font-medium uppercase tracking-tight mt-1">
                        Due: {inv.due_date ? formatLuxorDate(inv.due_date) || 'Unknown date' : 'Immediate'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex flex-col items-start gap-1.5">
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-[color:var(--portal-muted)]">Stored lifecycle</span>
                      <PortalStatusBadge status={inv.status} borderless />
                      {financeVerified && !financeRows.testInvoiceIds.has(inv.id.toLowerCase()) ? (() => {
                        const collection = getInvoiceCollectionDisplayState(inv, invoices, payments, installments, new Date(), financialSummary || undefined, bookings.find((booking) => booking.id === inv.booking_id) || null)
                        return collection.collectionStatus ? <span aria-label={`Collection status: ${collection.collectionStatus}`} className="rounded-full bg-[#caa24c]/10 px-2.5 py-1 text-[10px] font-semibold text-[#8b6424] dark:text-[#f1d27a]">Collection: {collection.collectionStatus}</span> : null
                      })() : null}
                    </div>
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
                    </div>
                  </td>
                </tr>
              ))
            )}
          </motion.tbody>
                </AnimatePresence>
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
        onAction={(action) => { if (action === 'delete') setConfirmBulkDelete(true) }}
        actions={[
          { id: 'delete', label: 'Delete drafts', icon: <Trash2 size={13} />, tone: 'danger', disabled: selectedDraftCount === 0 },
        ]}
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
          <h2 id="void-invoice-title" className="text-lg font-bold text-[color:var(--portal-text)]">Cancel sent invoice?</h2>
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
            className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider tabular-nums shrink-0 ${
              isNegative
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
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
