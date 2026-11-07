'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LuxorFinanceOverviewInput, LuxorFinanceAllocationRow } from '@/lib/luxorFinanceReporting'
import { getLuxorBusinessFinanceRows } from '@/lib/luxorFinanceReporting'
import type { LuxorBooking, LuxorBookingExpense, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment, LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'
import { getLuxorRevenueCollectionsModel, type LuxorRevenueCollectionsModel, type LuxorRevenueCollectionsOptions } from '@/lib/luxorRevenueCollectionsModel'

type RevenueSourceRows = {
  invoices: LuxorInvoice[]
  bookings: LuxorBooking[]
  payments: LuxorPayment[]
  installments: LuxorPaymentInstallment[]
  refunds: LuxorPaymentRefundView[]
  allocations: LuxorFinanceAllocationRow[] | null
  testInquiryIds: ReadonlySet<string>
  testBookingIds: ReadonlySet<string>
  testInvoiceIds: ReadonlySet<string>
  now: Date
}

function asArray<T>(value: unknown, description: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${description} could not be verified.`)
  return value as T[]
}

function isAllocationRows(value: unknown): value is LuxorFinanceAllocationRow[] {
  return Array.isArray(value) && value.every((row) => row && typeof row === 'object'
    && typeof row.payment_id === 'string' && typeof row.installment_id === 'string'
    && Number.isFinite(Number(row.amount)))
}

export function useRevenueCollectionsModel(options: Omit<LuxorRevenueCollectionsOptions, 'now'>) {
  const [source, setSource] = useState<RevenueSourceRows | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const activeController = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    activeController.current?.abort()
    const controller = new AbortController()
    activeController.current = controller
    const requestGeneration = ++generation.current
    setLoading(true)
    setError(null)

    try {
      const [ledgerResponse, sourcesResponse] = await Promise.all([
        fetch('/api/portal/finance-overview-ledgers', { cache: 'no-store', signal: controller.signal }),
        fetch('/api/portal/finance-overview-sources', { cache: 'no-store', signal: controller.signal }),
      ])

      if (!ledgerResponse.ok) throw new Error('Financial records could not be loaded.')
      const ledger = await ledgerResponse.json() as Record<string, unknown>
      const invoices = asArray<LuxorInvoice>(ledger.invoices, 'Invoices')
      const bookings = asArray<LuxorBooking>(ledger.bookings, 'Bookings')
      const expenses = asArray<LuxorBookingExpense>(ledger.expenses, 'Expenses')
      const payments = asArray<LuxorPayment>(ledger.payments, 'Payments')
      const installments = asArray<LuxorPaymentInstallment>(ledger.installments, 'Payment schedules')
      const refunds = asArray<LuxorPaymentRefundView>(ledger.refunds, 'Refund records')
      const sourcePayload = sourcesResponse.ok
        ? await sourcesResponse.json().catch(() => null) as { allocations?: unknown } | null
        : null
      const allocations = isAllocationRows(sourcePayload?.allocations) ? sourcePayload.allocations : null

      const inquiryIds = [...new Set([...invoices, ...bookings, ...payments]
        .map((record) => record.inquiry_id)
        .filter((id): id is string => typeof id === 'string' && Boolean(id)))]
      const knownBookingIds = new Set(bookings.map((booking) => booking.id.toLowerCase()))
      const bookingIds = [...new Set([...invoices, ...expenses, ...payments]
        .map((record) => record.booking_id)
        .filter((id): id is string => typeof id === 'string' && Boolean(id) && !knownBookingIds.has(id.toLowerCase())))]
      const testInquiryIds = new Set<string>()
      const testBookingIds = new Set<string>()

      for (let offset = 0; offset < Math.max(inquiryIds.length, bookingIds.length); offset += 1000) {
        const inquiryBatch = inquiryIds.slice(offset, offset + 1000)
        const bookingBatch = bookingIds.slice(offset, offset + 1000)
        const response = await fetch('/api/portal/test-inquiry-classification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inquiryIds: inquiryBatch, bookingIds: bookingBatch }),
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Verified test classification is unavailable; revenue figures are hidden.')
        const classification = await response.json() as { testInquiryIds?: unknown; testBookingIds?: unknown; unresolvedBookingIds?: unknown }
        const requestedInquiryIds = new Set(inquiryBatch.map((id) => id.toLowerCase()))
        const requestedBookingIds = new Set(bookingBatch.map((id) => id.toLowerCase()))
        if (!Array.isArray(classification.testInquiryIds)
          || !classification.testInquiryIds.every((id) => typeof id === 'string' && requestedInquiryIds.has(id.toLowerCase()))
          || !Array.isArray(classification.testBookingIds)
          || !classification.testBookingIds.every((id) => typeof id === 'string' && requestedBookingIds.has(id.toLowerCase()))
          || !Array.isArray(classification.unresolvedBookingIds)
          || classification.unresolvedBookingIds.length > 0) {
          throw new Error('Verified test classification is unavailable; revenue figures are hidden.')
        }
        classification.testInquiryIds.forEach((id: string) => testInquiryIds.add(id.toLowerCase()))
        classification.testBookingIds.forEach((id: string) => testBookingIds.add(id.toLowerCase()))
      }

      if (requestGeneration !== generation.current) return
      const businessRows = getLuxorBusinessFinanceRows({ invoices, bookings, expenses, testInquiryIds, testBookingIds })
      const input: LuxorFinanceOverviewInput = {
        invoices: businessRows.invoices,
        bookings: businessRows.bookings,
        payments,
        installments,
        refunds,
        testInquiryIds: businessRows.testInquiryIds,
        testBookingIds: businessRows.testBookingIds,
        testInvoiceIds: businessRows.testInvoiceIds,
        allocations,
        now: new Date(),
      }
      setSource({ ...input, now: input.now || new Date() })
    } catch (cause) {
      if (controller.signal.aborted || requestGeneration !== generation.current) return
      setSource(null)
      setError(cause instanceof Error ? cause.message : 'Financial records could not be verified.')
    } finally {
      if (requestGeneration === generation.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => {
      generation.current += 1
      activeController.current?.abort()
    }
  }, [refresh])

  const { preset, startDate, endDate } = options
  const model = useMemo<LuxorRevenueCollectionsModel | null>(() => {
    if (!source) return null
    const input: LuxorFinanceOverviewInput = {
      invoices: source.invoices,
      bookings: source.bookings,
      payments: source.payments,
      installments: source.installments,
      refunds: source.refunds,
      testInquiryIds: source.testInquiryIds,
      testBookingIds: source.testBookingIds,
      testInvoiceIds: source.testInvoiceIds,
      allocations: source.allocations,
      now: source.now,
    }
    return getLuxorRevenueCollectionsModel(input, { preset, startDate, endDate, now: source.now })
  }, [source, preset, startDate, endDate])

  return { model, loading, error, refresh, scheduleRows: source?.installments || [] }
}
