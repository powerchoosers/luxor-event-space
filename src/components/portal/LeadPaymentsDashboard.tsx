'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Eye,
  FileText,
  FolderClosed,
  Layers3,
  ReceiptText,
  CalendarDays as CalendarEdit,
} from 'lucide-react'
import type { LuxorBooking, LuxorEmailJob, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment } from '@/lib/luxorInquiryTypes'
import { getLuxorInvoiceFinancialSummary } from '@/lib/luxorFinanceReporting'
import { eventCreditForPayment as paymentMoneyForEvent, getInvoiceCollectionDisplayState, installmentDisplayState, installmentPaidAmount, isBookingPaymentMilestone, isCalendarDateDueInChicago, paymentDisplayReceivedDate } from '@/lib/luxorPaymentDashboardModel'
import { PortalDatePicker, PortalSelect } from '@/components/portal/PortalUI'

const PaymentReceiptPdfPreview = dynamic(() => import('./PaymentReceiptPdfPreview'), {
  ssr: false,
  loading: () => <div className="grid h-[42vh] min-h-[320px] place-items-center bg-white text-sm text-[#78685a] sm:h-[56vh]">Loading PDF preview…</div>,
})

type PaymentKind = 'deposit' | 'final' | 'security_deposit' | 'installment'
type ExistingPaymentKind = Exclude<PaymentKind, 'installment'>
type ManualInstallmentInput = { installmentId: string; amount: number; paidOn: string; paymentMethod: string; reference: string; notes: string; idempotencyKey: string; emailReceipt: boolean }
type FinancialTab = 'history' | 'invoices' | 'receipts' | 'reminders'
type ReceiptPreview = { recipient: string; subject: string; message: string; filename: string; receiptNumber: string; eventName: string; fingerprint: string; pdfSha256: string; pdfUrl: string }
type PaymentEmailHistoryJob = LuxorEmailJob & { delivery?: { status: 'sent' | 'pending' | 'delivered' | 'opened' | 'failed' | 'cancelled'; sentAt: string | null; deliveredAt: string | null; openedAt: string | null; providerError: string | null; retryAvailable?: boolean } }
type ReceivedDateCorrection = { id: string; actor_email: string; occurred_at: string; reason: string | null; before_state: Record<string, unknown>; after_state: Record<string, unknown> }

type Props = {
  leadName: string
  leadEmail: string | null
  booking: LuxorBooking | null
  eventInvoice: LuxorInvoice | null
  invoices: LuxorInvoice[]
  payments: LuxorPayment[]
  installments: LuxorPaymentInstallment[]
  paymentLoadError?: string | null
  paymentInstallmentLoadError?: string | null
  onRecordPayment: (booking: LuxorBooking, kind: ExistingPaymentKind, emailReceipt?: boolean) => Promise<void>
  onRecordInstallmentPayment: (booking: LuxorBooking, input: ManualInstallmentInput) => Promise<void>
  onViewInvoice: (invoice: LuxorInvoice) => void
  onRequestInvoicePayment: (invoice: LuxorInvoice) => void
}

const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })
const formatMoney = (amount: number) => currency.format(Number.isFinite(amount) ? amount : 0)
const formatInputDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const dateInputValue = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? value
  : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
const formatDate = (value?: string | null) => {
  if (!value) return 'Date not set'
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00.000Z` : value)
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) : 'Date not set'
}
const formatDateTime = (value?: string | null) => {
  if (!value) return 'Not recorded'
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) : 'Not recorded'
}
const round = (value: number) => Math.round(value * 100) / 100
const PAYMENT_REMINDER_TYPES = new Set(['unpaid_invoice_reminder', 'sixty_day_payment_reminder', 'final_payment_request', 'final_payment_reminder', 'installment_payment_reminder', 'proposal_payment_reminder'])
const paymentEmailStatus = (job: PaymentEmailHistoryJob | LuxorEmailJob) => {
  const delivery = (job as PaymentEmailHistoryJob).delivery
  if (delivery?.status === 'opened') return 'Opened signal'
  if (delivery?.status === 'delivered') return 'Delivered'
  if (delivery?.status === 'sent') return 'Sent'
  if (delivery?.status === 'failed') return 'Failed'
  if (job.status === 'sent') return 'Sent'
  if (job.status === 'failed') return 'Failed'
  if (job.status === 'cancelled') return 'Canceled'
  if (job.status === 'queued' && Date.parse(job.scheduled_for) > Date.now()) return 'Scheduled'
  return 'Pending'
}
const daysBefore = (value?: string | null, days = 0) => {
  if (!value) return null
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (!Number.isFinite(parsed.getTime())) return null
  parsed.setDate(parsed.getDate() - days)
  return parsed.toISOString()
}

function paymentKind(payment: LuxorPayment, invoice?: LuxorInvoice) {
  const metaKind = String(payment.metadata?.payment_kind || '').toLowerCase()
  if (metaKind === 'security_deposit' || invoice?.invoice_kind === 'security_deposit') return 'security_deposit'
  if (metaKind === 'deposit' || invoice?.invoice_kind === 'deposit') return 'deposit'
  if (metaKind === 'final' || invoice?.invoice_kind === 'final_balance') return 'final'
  return 'event'
}

function paymentDescription(payment: LuxorPayment, invoice?: LuxorInvoice) {
  const explicit = String(payment.metadata?.payment_kind || payment.metadata?.description || '').trim()
  if (explicit) return explicit.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
  if (invoice?.invoice_kind === 'security_deposit') return 'Refundable security deposit'
  if (invoice?.invoice_kind === 'deposit') return 'Booking deposit'
  if (invoice?.invoice_kind === 'final_balance') return 'Final event payment'
  return 'Event payment'
}

function appliedTo(payment: LuxorPayment, invoice?: LuxorInvoice) {
  const kind = paymentKind(payment, invoice)
  if (kind === 'security_deposit') return 'Security deposit'
  if (kind === 'deposit') return 'Booking payment'
  if (kind === 'final') return 'Final event balance'
  const allocations = payment.metadata?.installment_allocations
  if (Array.isArray(allocations) && allocations.length) return allocations.map((allocation) => {
    const value = allocation && typeof allocation === 'object' ? allocation as Record<string, unknown> : {}
    return String(value.label || `Installment ${value.installment_order || ''}`).trim()
  }).join(', ')
  if (String(payment.metadata?.payment_kind || '').toLowerCase().includes('installment')) return 'Monthly installment'
  return invoice?.description || 'Event total'
}

export function LeadPaymentsDashboard({
  leadName,
  leadEmail,
  booking,
  eventInvoice,
  invoices,
  payments,
  installments,
  paymentLoadError,
  paymentInstallmentLoadError,
  onRecordPayment,
  onRecordInstallmentPayment,
  onViewInvoice,
  onRequestInvoicePayment,
}: Props) {
  const [planOpen, setPlanOpen] = useState(true)
  const [recordsOpen, setRecordsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<FinancialTab>('history')
  const [recordOpen, setRecordOpen] = useState(false)
  const [recordKind, setRecordKind] = useState<PaymentKind>('deposit')
  const [recordInstallmentId, setRecordInstallmentId] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualPaidOn, setManualPaidOn] = useState(() => formatInputDate())
  const [manualMethod, setManualMethod] = useState('Zelle')
  const [manualReference, setManualReference] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  const [installmentRequestKey, setInstallmentRequestKey] = useState('')
  const [emailReceiptOnSave, setEmailReceiptOnSave] = useState(false)
  const [emailingReceiptId, setEmailingReceiptId] = useState<string | null>(null)
  const [receiptEmailMessage, setReceiptEmailMessage] = useState<string | null>(null)
  const [receiptEmailOverrides, setReceiptEmailOverrides] = useState<Record<string, LuxorEmailJob>>({})
  const [receiptPreviewPayment, setReceiptPreviewPayment] = useState<LuxorPayment | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<ReceiptPreview | null>(null)
  const [receiptPreviewError, setReceiptPreviewError] = useState<string | null>(null)
  const [receiptPreviewLoading, setReceiptPreviewLoading] = useState(false)
  const [paymentEmailJobs, setPaymentEmailJobs] = useState<PaymentEmailHistoryJob[]>([])
  const [reminderHistoryError, setReminderHistoryError] = useState<string | null>(null)
  const [reminderHistoryLoading, setReminderHistoryLoading] = useState(false)
  const [retryingReminderId, setRetryingReminderId] = useState<string | null>(null)
  const [reminderActionMessage, setReminderActionMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<LuxorPayment | null>(null)
  const [receivedDateTarget, setReceivedDateTarget] = useState<LuxorPayment | null>(null)
  const [receivedDateValue, setReceivedDateValue] = useState('')
  const [receivedDateReason, setReceivedDateReason] = useState('')
  const [receivedDateBusy, setReceivedDateBusy] = useState(false)
  const [receivedDateError, setReceivedDateError] = useState<string | null>(null)
  const [receivedDateOverrides, setReceivedDateOverrides] = useState<Record<string, string>>({})
  const [receivedDateHistory, setReceivedDateHistory] = useState<ReceivedDateCorrection[]>([])
  const [receivedDateHistoryError, setReceivedDateHistoryError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const invoiceById = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice])), [invoices])
  const uniquePayments = useMemo(() => Array.from(new Map(payments.map((payment) => [payment.id, payment])).values())
    .sort((left, right) => Date.parse(right.received_date || right.paid_at || right.created_at) - Date.parse(left.received_date || left.paid_at || left.created_at)), [payments])
  const invoiceFinancialSummary = useMemo(
    () => getLuxorInvoiceFinancialSummary(invoices, uniquePayments, new Set(), new Set(), installments),
    [invoices, uniquePayments, installments],
  )
  const paidTotal = useMemo(() => round(uniquePayments.reduce((total, payment) => total + paymentMoneyForEvent(payment, invoiceById.get(payment.invoice_id || '')), 0)), [invoiceById, uniquePayments])
  const eventPrice = Math.max(0, round(Number(eventInvoice?.total || booking?.contract_total || 0)))
  const remaining = Math.max(0, round(eventPrice - paidTotal))
  const percentPaid = eventPrice > 0 ? Math.min(100, Math.max(0, round((paidTotal / eventPrice) * 100))) : 0
  const paidPayments = uniquePayments.filter((payment) => payment.status === 'paid')
  const securityInvoice = invoices.find((invoice) => invoice.invoice_kind === 'security_deposit')
  const securityPaid = round(uniquePayments.reduce((sum, payment) => {
    if (payment.status !== 'paid') return sum
    const kind = paymentKind(payment, invoiceById.get(payment.invoice_id || ''))
    if (kind === 'security_deposit') return sum + Number(payment.amount || 0)
    if (kind === 'deposit') return sum + Math.max(0, Number(payment.metadata?.refundable_security_deposit || 0))
    return sum
  }, 0))
  const securityAmount = Number(securityInvoice?.total || booking?.security_deposit_amount || 0)
  const securityStatus = booking?.security_deposit_status || (securityPaid >= securityAmount && securityAmount > 0 ? 'held' : 'due')
  const securityReceived = securityPaid >= securityAmount || ['refunded', 'retained'].includes(securityStatus)
  const timelineInstallments = useMemo(() => [...installments]
    .filter((installment) => installment.status !== 'void'
      // The schedule generator persists its first, already-satisfied booking
      // payment as an installment. The timeline renders that obligation above
      // from the actual deposit transaction, so do not display it twice.
      && !isBookingPaymentMilestone(installment))
    .sort((left, right) => left.installment_order - right.installment_order), [installments])
  const refreshPaymentEmailJobs = useCallback(async () => {
    if (!booking?.id || !booking.inquiry_id) {
      setPaymentEmailJobs([])
      setReminderHistoryError(null)
      return
    }
    setReminderHistoryLoading(true)
    try {
      const response = await fetch(`/api/payments/reminders?bookingId=${encodeURIComponent(booking.id)}&inquiryId=${encodeURIComponent(booking.inquiry_id)}`, { cache: 'no-store' })
      const result = await response.json().catch(() => ({})) as { jobs?: PaymentEmailHistoryJob[]; error?: string }
      if (!response.ok || !Array.isArray(result.jobs)) throw new Error(result.error || 'Payment reminder history could not be verified.')
      setPaymentEmailJobs(result.jobs)
      setReminderHistoryError(null)
    } catch (caught) {
      setReminderHistoryError(caught instanceof Error ? caught.message : 'Payment reminder history could not be verified.')
    } finally {
      setReminderHistoryLoading(false)
    }
  }, [booking?.id, booking?.inquiry_id])
  useEffect(() => { void refreshPaymentEmailJobs() }, [refreshPaymentEmailJobs])
  useEffect(() => {
    if (!booking?.id || (activeTab !== 'reminders' && activeTab !== 'receipts')) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshPaymentEmailJobs() }, 15_000)
    return () => window.clearInterval(timer)
  }, [activeTab, booking?.id, refreshPaymentEmailJobs])
  const eventReminderJobs = useMemo(() => paymentEmailJobs.filter((job) => PAYMENT_REMINDER_TYPES.has(job.job_type)), [paymentEmailJobs])
  const isFutureQueuedReminder = (job: PaymentEmailHistoryJob) => job.status === 'queued'
    && Date.parse(job.scheduled_for) > Date.now() && !['sent', 'delivered', 'opened', 'failed'].includes(job.delivery?.status || '')
  const upcomingReminderJobs = eventReminderJobs.filter(isFutureQueuedReminder).sort((left, right) => Date.parse(left.scheduled_for) - Date.parse(right.scheduled_for))
  const historyReminderJobs = eventReminderJobs.filter((job) => !isFutureQueuedReminder(job)).sort((left, right) => {
    const leftTime = Math.max(...[left.delivery?.openedAt, left.delivery?.deliveredAt, left.sent_at, left.updated_at, left.created_at].filter((value): value is string => Boolean(value)).map((value) => Date.parse(value)))
    const rightTime = Math.max(...[right.delivery?.openedAt, right.delivery?.deliveredAt, right.sent_at, right.updated_at, right.created_at].filter((value): value is string => Boolean(value)).map((value) => Date.parse(value)))
    return rightTime - leftTime
  })
  const nextReminder = eventReminderJobs
    .filter(isFutureQueuedReminder)
    .sort((left, right) => Date.parse(left.scheduled_for) - Date.parse(right.scheduled_for))[0]
  const categorizedPayments = useMemo(() => uniquePayments.map((payment) => ({ payment, invoice: invoiceById.get(payment.invoice_id || '') })), [invoiceById, uniquePayments])
  const displayReceivedDate = (payment: LuxorPayment) => paymentDisplayReceivedDate(payment, receivedDateOverrides[payment.id])
  const selectedInstallment = timelineInstallments.find((item) => item.id === recordInstallmentId) || timelineInstallments[0]
  const selectedInstallmentRemaining = selectedInstallment
    ? Math.max(0, round(Number(selectedInstallment.amount || 0) - installmentPaidAmount(selectedInstallment, uniquePayments)))
    : 0

  const saveReceivedDateCorrection = async () => {
    if (!receivedDateTarget || !receivedDateValue || receivedDateReason.trim().length < 8) return
    setReceivedDateBusy(true)
    setReceivedDateError(null)
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(receivedDateTarget.id)}/received-date`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmCorrection: true, receivedDate: receivedDateValue, expectedReceivedDate: dateInputValue(displayReceivedDate(receivedDateTarget)), reason: receivedDateReason.trim() }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; receivedDate?: string }
      if (!response.ok || !result.receivedDate) throw new Error(result.error || 'Received date could not be corrected.')
      setReceivedDateOverrides((current) => ({ ...current, [receivedDateTarget.id]: result.receivedDate! }))
      setSelectedPayment((current) => current?.id === receivedDateTarget.id ? { ...current, received_date: result.receivedDate! } : current)
      const historyResponse = await fetch(`/api/payments/${encodeURIComponent(receivedDateTarget.id)}/received-date`, { cache: 'no-store' })
      const historyPayload = await historyResponse.json().catch(() => ({})) as { corrections?: ReceivedDateCorrection[] }
      if (historyResponse.ok && Array.isArray(historyPayload.corrections)) setReceivedDateHistory(historyPayload.corrections)
      setReceivedDateTarget(null)
      setReceivedDateReason('')
    } catch (caught) {
      setReceivedDateError(caught instanceof Error ? caught.message : 'Received date could not be corrected.')
    } finally {
      setReceivedDateBusy(false)
    }
  }

  const openReceivedDateCorrection = async (payment: LuxorPayment) => {
    setReceivedDateTarget(payment)
    setReceivedDateValue(dateInputValue(displayReceivedDate(payment)))
    setReceivedDateReason('')
    setReceivedDateError(null)
    setReceivedDateHistoryError(null)
    setReceivedDateHistory([])
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(payment.id)}/received-date`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as { corrections?: ReceivedDateCorrection[]; error?: string }
      if (!response.ok || !Array.isArray(payload.corrections)) throw new Error(payload.error || 'Correction history could not be verified.')
      setReceivedDateHistory(payload.corrections)
    } catch (caught) {
      setReceivedDateHistoryError(caught instanceof Error ? caught.message : 'Correction history could not be verified.')
    }
  }

  const runRecord = async () => {
    if (!booking) return
    setBusy(true)
    setError(null)
    try {
      if (recordKind === 'installment') {
        if (!selectedInstallment || !manualPaidOn || !Number.isFinite(Number(manualAmount)) || Number(manualAmount) <= 0) {
          throw new Error('Choose an installment, payment date, and amount greater than zero.')
        }
        const idempotencyKey = installmentRequestKey || crypto.randomUUID()
        if (!installmentRequestKey) setInstallmentRequestKey(idempotencyKey)
        await onRecordInstallmentPayment(booking, {
          installmentId: selectedInstallment.id,
          amount: Number(manualAmount),
          paidOn: manualPaidOn,
          paymentMethod: manualMethod,
          reference: manualReference,
          notes: manualNotes,
          idempotencyKey,
          emailReceipt: emailReceiptOnSave,
        })
        setInstallmentRequestKey('')
      } else {
        await onRecordPayment(booking, recordKind, emailReceiptOnSave)
      }
      setRecordOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payment could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  const openReceiptPreview = async (payment: LuxorPayment) => {
    setReceiptPreviewPayment(payment)
    setReceiptPreview(null)
    setReceiptPreviewError(null)
    setReceiptPreviewLoading(true)
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(payment.id)}/receipt/email`, { cache: 'no-store' })
      const result = await response.json().catch(() => ({})) as ReceiptPreview & { error?: string }
      if (!response.ok || !result.fingerprint || !result.pdfSha256 || !result.pdfUrl) throw new Error(result.error || 'Receipt preview could not be prepared.')
      setReceiptPreview(result)
    } catch (caught) {
      setReceiptPreviewError(caught instanceof Error ? caught.message : 'Receipt preview could not be prepared.')
    } finally {
      setReceiptPreviewLoading(false)
    }
  }

  const emailReceipt = async (payment: LuxorPayment, retry = false) => {
    if (!receiptPreview || receiptPreviewPayment?.id !== payment.id) {
      setReceiptEmailMessage('Open the receipt preview before sending so the email and PDF can be verified together.')
      return
    }
    setEmailingReceiptId(payment.id)
    setReceiptEmailMessage(null)
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(payment.id)}/receipt/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: receiptPreview.fingerprint, pdfSha256: receiptPreview.pdfSha256, retry }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; job?: LuxorEmailJob; state?: string }
      if (!response.ok) throw new Error(result.error || 'Receipt email could not be queued.')
      if (result.job) setReceiptEmailOverrides((current) => ({ ...current, [payment.id]: result.job! }))
      const state = result.state || result.job?.status
      setReceiptEmailMessage(state === 'sent' ? 'Receipt email was accepted by the provider.' : state === 'failed' || state === 'cancelled' ? result.job?.last_error || `Receipt email ${state}. Review its status before taking action.` : state === 'pending' ? 'Receipt email is pending provider confirmation.' : 'Receipt email queued. It has not been marked sent; status will update after provider acceptance.')
      await refreshPaymentEmailJobs()
    } catch (caught) {
      setReceiptEmailMessage(caught instanceof Error ? caught.message : 'Receipt email could not be queued.')
    } finally {
      setEmailingReceiptId(null)
    }
  }

  const retryReminder = async (job: PaymentEmailHistoryJob) => {
    setRetryingReminderId(job.id)
    setReminderActionMessage(null)
    try {
      const response = await fetch('/api/payments/reminders/retry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: job.id }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Reminder could not be retried safely.')
      setReminderActionMessage('Reminder queued for the approved send window. It has not been marked sent.')
      await refreshPaymentEmailJobs()
    } catch (caught) {
      setReminderActionMessage(caught instanceof Error ? caught.message : 'Reminder could not be retried safely.')
    } finally {
      setRetryingReminderId(null)
    }
  }

  const scheduledDepositPaid = categorizedPayments.filter(({ payment, invoice }) => paymentKind(payment, invoice) === 'deposit').reduce((sum, { payment, invoice }) => sum + paymentMoneyForEvent(payment, invoice), 0)
  const lastDeposit = categorizedPayments.find(({ payment, invoice }) => paymentKind(payment, invoice) === 'deposit' && payment.status === 'paid')?.payment
  const previewReceiptJob = receiptPreviewPayment
    ? receiptEmailOverrides[receiptPreviewPayment.id] || paymentEmailJobs.find((job) => {
      const notice = job.metadata?.transactionalNotice && typeof job.metadata.transactionalNotice === 'object' ? job.metadata.transactionalNotice as Record<string, unknown> : null
      return notice?.key === `payment_receipt/${receiptPreviewPayment.id}`
    })
    : undefined

  return (
    <section className="space-y-5 rounded-2xl border border-[#eadfcf] bg-[#fffdfa] p-4 text-[#332b25] shadow-sm sm:p-6" aria-label="Payments">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-[#241b17]">Payments</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="inline-flex items-center gap-2 text-sm text-[#755b39]" aria-live="polite">
            <CalendarDays size={16} className="shrink-0 text-[#ae8138]" />
            {reminderHistoryError ? 'Reminder schedule unavailable' : reminderHistoryLoading && !paymentEmailJobs.length ? 'Loading payment reminders…' : nextReminder ? <>Next payment reminder: <strong className="font-semibold">{formatDate(nextReminder.scheduled_for)}</strong></> : 'No upcoming reminders'}
          </p>
          <button type="button" onClick={() => { setRecordKind('deposit'); setRecordOpen(true) }} disabled={!booking || Boolean(paymentLoadError)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#b88737] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#9d6c25] disabled:cursor-not-allowed disabled:opacity-50">
            <CircleDollarSign size={17} /> Record Payment
          </button>
        </div>
      </div>

      {paymentLoadError ? <div role="alert" className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{paymentLoadError}</div> : null}

      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[#eadfcf] bg-white sm:grid-cols-4">
        <div className="flex min-h-[96px] items-center gap-3 border-b border-[#eee5dc] p-3 sm:border-b-0 sm:border-r sm:p-4">
          <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#ed4388 ${percentPaid}%, #f8d9e5 ${percentPaid}% 100%)` }} aria-label={`${percentPaid}% paid`}><span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[10px] font-semibold text-[#7d4e61]">{Math.round(percentPaid)}%</span></div>
          <div><p className="text-[11px] text-[#78685a]">Percentage Paid</p><p className="mt-1 font-serif text-xl font-semibold tabular-nums text-[#2c211a]">{percentPaid.toFixed(1)}%</p></div>
        </div>
        <div className="flex min-h-[96px] items-center gap-3 border-b border-[#eee5dc] p-3 sm:border-b-0 sm:border-r sm:p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fbf1e4] text-[#b17e2d]"><CreditCard size={19} /></span><div><p className="text-[11px] text-[#78685a]">Total Paid</p><p className="mt-1 font-serif text-xl font-semibold tabular-nums">{formatMoney(paidTotal)}</p></div></div>
        <div className="flex min-h-[96px] items-center gap-3 border-[#eee5dc] p-3 sm:border-r sm:p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fbf1e4] text-[#b17e2d]"><FileText size={19} /></span><div><p className="text-[11px] text-[#78685a]">Remaining Balance</p><p className="mt-1 font-serif text-xl font-semibold tabular-nums">{formatMoney(remaining)}</p></div></div>
        <div className="flex min-h-[96px] items-center gap-3 border-t border-[#eee5dc] p-3 sm:border-t-0 sm:p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fbf1e4] text-[#b17e2d]"><CalendarDays size={19} /></span><div><p className="text-[11px] text-[#78685a]">Total Event Price</p><p className="mt-1 font-serif text-xl font-semibold tabular-nums">{formatMoney(eventPrice)}</p></div></div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#eadfcf] bg-white" aria-labelledby="payment-plan-heading">
        <button type="button" onClick={() => setPlanOpen((value) => !value)} aria-expanded={planOpen} className="flex w-full items-center gap-3 p-4 text-left sm:p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#fbf1e4] text-[#af7c2a]"><Layers3 size={22} /></span>
          <span className="min-w-0 flex-1"><span id="payment-plan-heading" className="block font-serif text-2xl font-semibold text-[#2d211a]">Payment Plan</span><span className="mt-0.5 block text-sm text-[#78685a]">All payment milestones for this event.</span></span>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#fbf1e4] text-[#ad7a2a]">{planOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
        </button>
        <div className="mx-4 mb-4 rounded-xl border border-[#f0e7dc] bg-[#fffdf9] p-3 sm:mx-5 sm:mb-5 sm:px-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm"><strong className="mr-2 font-serif text-xl text-[#2d211a]">{formatMoney(paidTotal)}</strong><span className="text-[#78685a]">Paid</span></p><p className="text-sm"><strong className="mr-2 font-serif text-xl text-[#2d211a]">{formatMoney(remaining)}</strong><span className="text-[#78685a]">Remaining</span></p></div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#f8d9e5]" role="progressbar" aria-label="Event payment progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentPaid}><div className="h-full rounded-full bg-[#ed4388] transition-[width]" style={{ width: `${percentPaid}%` }} /></div>
        </div>
        {planOpen ? <div className="border-t border-[#f0e7dc] px-4 pb-5 pt-2 sm:px-6">
          <div className="relative ml-2 space-y-1 before:absolute before:bottom-3 before:left-[11px] before:top-4 before:w-px before:bg-[#d8c6ac]">
            <div className="relative grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 py-3">
              <span className={`z-10 grid h-6 w-6 place-items-center rounded-full ${lastDeposit ? 'bg-emerald-600 text-white' : 'border-2 border-[#c7b69d] bg-white text-[#8b7a67]'}`}>{lastDeposit ? <Check size={14} /> : <Clock3 size={15} />}</span>
              <div className="min-w-0"><p className="font-semibold">Booking Deposit</p><p className="text-xs text-[#78685a]">{lastDeposit ? `Received ${formatDate(displayReceivedDate(lastDeposit))}` : 'No received booking deposit recorded'}</p></div>
              <div className="text-right"><p className="font-semibold tabular-nums">{formatMoney(scheduledDepositPaid)}</p><span className={`text-[10px] font-bold uppercase tracking-wide ${lastDeposit ? 'text-emerald-700' : 'text-[#8b7a67]'}`}>{lastDeposit ? 'Paid' : 'Pending'}</span></div>
            </div>
            <div className="flex items-center gap-3 py-2"><span className="z-10 h-2 w-2 rounded-full bg-[#c29448]" /><p className="flex flex-1 items-center gap-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[#a6772b]">Monthly payments<span className="h-px flex-1 bg-[#d8c6ac]" /></p></div>
            {timelineInstallments.map((installment) => {
              const state = installmentDisplayState(installment, uniquePayments)
              const { amountDue: due, credited, isPaid, isPartial, overdueDays } = state
              const overdue = state.isOverdue
              const amountText = isPartial ? credited > 0 ? `${formatMoney(credited)} / ${formatMoney(due)}` : `Unverified / ${formatMoney(due)}` : !credited && installment.due_at && isCalendarDateDueInChicago(installment.due_at) ? `${formatMoney(0)} / ${formatMoney(due)}` : formatMoney(due)
              const status = isPaid ? 'Paid' : overdue ? 'Overdue' : isPartial ? 'Partially paid' : 'Pending'
              return <div key={installment.id} className="relative grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#f1eae2] py-3 last:border-0">
                <span className={`z-10 grid h-6 w-6 place-items-center rounded-full border-2 bg-white ${isPaid ? 'border-emerald-600 bg-emerald-600 text-white' : overdue ? 'border-rose-500 text-rose-600' : 'border-[#b4a391] text-[#817364]'}`}>{isPaid ? <Check size={14} /> : <Clock3 size={14} />}</span>
                <div className="min-w-0"><p className="font-semibold">{installment.label || `Installment ${installment.installment_order}`}</p><p className="text-xs text-[#78685a]">{formatDate(installment.due_at)}{isPaid && installment.paid_at ? ` · Paid ${formatDate(installment.paid_at)}` : installment.due_at ? ` · ${overdue ? `Overdue by ${overdueDays} days` : 'Scheduled'}` : ''}</p></div>
                <div className="text-right"><p className="font-semibold tabular-nums">{amountText}</p><span className={`text-[10px] font-bold uppercase tracking-wide ${isPaid ? 'text-emerald-700' : overdue ? 'text-rose-700' : isPartial ? 'text-amber-700' : 'text-[#a6772b]'}`}>{status}</span></div>
              </div>
            })}
            {paymentInstallmentLoadError ? <p role="alert" className="py-3 pl-10 text-sm text-amber-800">{paymentInstallmentLoadError}</p> : timelineInstallments.length === 0 ? <p className="py-3 pl-10 text-sm text-[#78685a]">No installment schedule is saved for this event.</p> : null}
            {securityAmount > 0 ? <>
              <div className="flex items-center gap-3 py-2"><span className="z-10 h-2 w-2 rounded-full bg-[#c29448]" /><p className="flex flex-1 items-center gap-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[#a6772b]">Refundable security deposit<span className="h-px flex-1 bg-[#d8c6ac]" /></p></div>
              <div className="relative grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 py-3">
                <span className={`z-10 grid h-6 w-6 place-items-center rounded-full ${securityReceived ? 'bg-emerald-600 text-white' : 'border-2 border-[#b4a391] bg-white text-[#817364]'}`}>{securityReceived ? <Check size={14} /> : <Clock3 size={14} />}</span>
                <div className="min-w-0"><p className="font-semibold">Security deposit</p><p className="text-xs text-[#78685a]">{securityInvoice?.due_date ? `Due ${formatDate(securityInvoice.due_date)}` : booking?.event_date ? `Due ${formatDate(daysBefore(booking.event_date, 30))}` : 'Separate from event total'}{securityStatus === 'held' ? ' · Held separately' : securityStatus === 'refunded' ? ' · Refunded' : ''}</p></div>
                <div className="text-right"><p className="font-semibold tabular-nums">{formatMoney(securityAmount)}</p><span className={`text-[10px] font-bold uppercase tracking-wide ${securityReceived ? 'text-emerald-700' : 'text-[#a6772b]'}`}>{securityReceived ? securityStatus.replaceAll('_', ' ') : 'Pending'}</span></div>
              </div>
            </> : null}
          </div>
        </div> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#eadfcf] bg-white" aria-labelledby="financial-records-heading">
        <button type="button" onClick={() => setRecordsOpen((value) => !value)} aria-expanded={recordsOpen} className="flex w-full items-center gap-3 p-4 text-left sm:p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#fbf1e4] text-[#af7c2a]"><FolderClosed size={22} /></span>
          <span className="min-w-0 flex-1"><span id="financial-records-heading" className="block font-serif text-2xl font-semibold text-[#2d211a]">Financial Records</span><span className="mt-0.5 block text-sm text-[#78685a]">All payment transactions, invoices, receipts, and reminders for this client.</span></span>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#fbf1e4] text-[#ad7a2a]">{recordsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
        </button>
        {recordsOpen ? <div className="border-t border-[#f0e7dc] p-3 sm:p-5">
          <div role="tablist" aria-label="Financial record type" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([['history', 'Payment History'], ['invoices', 'Invoices'], ['receipts', 'Receipts'], ['reminders', 'Reminder History']] as const).map(([key, label]) => <button key={key} id={`payment-record-tab-${key}`} type="button" role="tab" aria-selected={activeTab === key} aria-controls={`payment-record-panel-${key}`} onClick={() => setActiveTab(key)} className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold transition ${activeTab === key ? 'border-[#b88737] bg-[#b88737] text-white shadow-sm' : 'border-[#eadfcf] bg-[#fffdf9] text-[#624d35] hover:border-[#c9a66e]'}`}>{label}</button>)}
          </div>
          <div id={`payment-record-panel-${activeTab}`} role="tabpanel" aria-labelledby={`payment-record-tab-${activeTab}`} className="mt-4">
            {activeTab === 'history' ? <div>
              <div className="space-y-2 sm:hidden">{categorizedPayments.length ? categorizedPayments.map(({ payment, invoice }) => <article key={payment.id} className="rounded-xl border border-[#eee5dc] bg-[#fffdf9] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{paymentDescription(payment, invoice)}</p><p className="mt-1 text-[11px] text-[#78685a]">{formatDate(displayReceivedDate(payment))} · {payment.payment_method || 'Method not recorded'}</p></div><strong className="shrink-0 tabular-nums">{formatMoney(Number(payment.amount || 0))}</strong></div><p className="mt-2 text-[11px] text-[#78685a]">Applied to: {appliedTo(payment, invoice)}{payment.status !== 'paid' ? ` · ${payment.status}` : ''}</p>{payment.status === 'paid' ? <div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold text-[#91651f]"><button type="button" onClick={() => setSelectedPayment(payment)} className="inline-flex items-center gap-1"><Eye size={14} /> View</button><a href={`/api/payments/${encodeURIComponent(payment.id)}/receipt`}>Download receipt</a>{payment.processor === 'manual' ? <button type="button" onClick={() => { void openReceivedDateCorrection(payment) }} className="inline-flex items-center gap-1"><CalendarEdit size={13} /> Correct received date</button> : null}</div> : null}</article>) : <p className="rounded-xl border border-dashed border-[#e7d6be] p-6 text-center text-sm text-[#78685a]">No payment transactions are recorded for this event.</p>}</div>
              <div className="hidden overflow-x-auto rounded-xl border border-[#eee5dc] sm:block"><table className="w-full border-collapse text-left text-xs"><thead className="bg-[#faf5ee] text-[10px] uppercase tracking-wide text-[#78685a]"><tr>{['Date', 'Description', 'Amount', 'Method', 'Applied To', 'Receipt'].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#f1eae2]">{categorizedPayments.length ? categorizedPayments.map(({ payment, invoice }) => <tr key={payment.id}><td className="whitespace-nowrap px-3 py-3">{formatDate(displayReceivedDate(payment))}</td><td className="px-3 py-3 font-medium">{paymentDescription(payment, invoice)}{payment.status !== 'paid' ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-amber-800">{payment.status}</span> : null}</td><td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">{formatMoney(Number(payment.amount || 0))}</td><td className="px-3 py-3">{payment.payment_method || 'Not recorded'}</td><td className="px-3 py-3">{appliedTo(payment, invoice)}</td><td className="px-3 py-3">{payment.status === 'paid' ? <div className="flex items-center gap-2"><button type="button" onClick={() => setSelectedPayment(payment)} className="inline-flex items-center gap-1 text-[#91651f] hover:underline"><Eye size={14} /> View</button><a href={`/api/payments/${encodeURIComponent(payment.id)}/receipt`} className="text-[#91651f] hover:underline">Download</a>{payment.processor === 'manual' ? <button type="button" onClick={() => { void openReceivedDateCorrection(payment) }} className="text-[#91651f] hover:underline">Correct date</button> : null}</div> : <span className="text-[#988979]">—</span>}</td></tr>) : <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-[#78685a]">No payment transactions are recorded for this event.</td></tr>}</tbody></table></div>
            </div> : null}
            {activeTab === 'invoices' ? <div className="space-y-3">{invoices.length ? invoices.map((invoice) => {
              const collection = getInvoiceCollectionDisplayState(invoice, invoices, uniquePayments, installments, new Date(), invoiceFinancialSummary)
              const invoicePaid = collection.paidAmount
              const total = collection.collectionStatus ? collection.totalDue : Number(invoice.total || 0)
              const balance = collection.balanceDue
              const dueAt = invoice.due_date
              const lifecycleStatus = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)
              const supportsPaymentRequest = invoice.invoice_kind === 'deposit' || invoice.invoice_kind === 'final_balance' || invoice.invoice_kind === 'security_deposit'
              const canRequestPayment = balance > 0 && supportsPaymentRequest && invoice.status !== 'draft' && invoice.status !== 'cancelled' && invoice.status !== 'paid'
              return <article key={invoice.id} className="grid gap-3 rounded-xl border border-[#eee5dc] bg-[#fffdf9] p-4 md:grid-cols-[1fr_auto] md:items-center"><div className="min-w-0"><p className="font-semibold">{invoice.description || `${invoice.invoice_kind || 'Event'} invoice`}</p><p className="mt-1 text-xs text-[#78685a]">Invoice {invoice.id.slice(0, 8).toUpperCase()} · Issued {formatDate(invoice.created_at)} · Due {formatDate(dueAt)}</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs"><span>Total <strong>{formatMoney(total)}</strong></span><span>Paid <strong>{formatMoney(invoicePaid)}</strong></span><span>Outstanding <strong>{formatMoney(balance)}</strong></span></div><div className="mt-2 flex flex-wrap items-center gap-2"><span aria-label={`Stored lifecycle status: ${lifecycleStatus}`} className="rounded-full border border-[#eadfcf] bg-[#faf5ee] px-2.5 py-1 text-[10px] font-semibold text-[#624d35]">Stored lifecycle: {lifecycleStatus}</span>{collection.collectionStatus ? <span aria-label={`Collection status: ${collection.collectionStatus}`} className="rounded-full border border-[#caa24c]/30 bg-[#caa24c]/10 px-2.5 py-1 text-[10px] font-semibold text-[#8b6424]">Collection: {collection.collectionStatus}</span> : null}</div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => onViewInvoice(invoice)} className="rounded-lg border border-[#e7d6be] px-3 py-2 text-xs font-semibold text-[#624d35]">View</button><a href={`/api/invoices/${encodeURIComponent(invoice.id)}/pdf`} className="rounded-lg border border-[#e7d6be] px-3 py-2 text-xs font-semibold text-[#624d35]">Download</a>{canRequestPayment ? <button type="button" onClick={() => onRequestInvoicePayment(invoice)} className="rounded-lg bg-[#b88737] px-3 py-2 text-xs font-semibold text-white">Payment request</button> : null}</div></article>
            }) : <p className="rounded-xl border border-dashed border-[#e7d6be] p-8 text-center text-sm text-[#78685a]">No invoices are associated with this event.</p>}</div> : null}
            {activeTab === 'receipts' ? <div className="space-y-2">{receiptEmailMessage ? <p role="status" className="rounded-lg bg-[#faf5ee] p-3 text-xs text-[#624d35]">{receiptEmailMessage}</p> : null}{paidPayments.length ? paidPayments.map((payment) => {
              const invoice = invoiceById.get(payment.invoice_id || '')
              const savedEmailJob = receiptEmailOverrides[payment.id] || paymentEmailJobs.find((job) => {
                const notice = job.metadata?.transactionalNotice && typeof job.metadata.transactionalNotice === 'object' ? job.metadata.transactionalNotice as Record<string, unknown> : null
                return notice?.key === `payment_receipt/${payment.id}`
              })
              const emailStatus = savedEmailJob ? paymentEmailStatus(savedEmailJob as PaymentEmailHistoryJob) : null
              return <article key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#eee5dc] bg-[#fffdf9] p-4"><div className="flex min-w-0 items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#fbf1e4] text-[#af7c2a]"><ReceiptText size={17} /></span><div className="min-w-0"><p className="font-semibold">Receipt {payment.id.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-xs text-[#78685a]">{formatDate(displayReceivedDate(payment))} · {payment.payment_method || 'Method not recorded'} · {appliedTo(payment, invoice)}</p><p className="mt-1 text-[11px] text-[#78685a]">{leadName}{invoice?.event_type ? ` · ${invoice.event_type}` : ''}{payment.processor_reference ? ` · Ref ${payment.processor_reference}` : ''}</p>{savedEmailJob ? <p className={`mt-1 text-[11px] font-semibold ${emailStatus === 'Failed' ? 'text-rose-700' : emailStatus === 'Sent' || emailStatus === 'Delivered' || emailStatus === 'Opened signal' ? 'text-emerald-700' : 'text-[#91651f]'}`}>Receipt email: {emailStatus}{savedEmailJob.last_error ? ` · ${savedEmailJob.last_error}` : ''}</p> : null}</div></div><div className="flex flex-wrap items-center gap-3"><strong className="tabular-nums">{formatMoney(Number(payment.amount || 0))}</strong><button type="button" onClick={() => void openReceiptPreview(payment)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#91651f]"><Eye size={14} /> Preview &amp; send</button><a href={`/api/payments/${encodeURIComponent(payment.id)}/receipt`} className="text-xs font-semibold text-[#91651f] hover:underline">Download</a></div></article>
            }) : <p className="rounded-xl border border-dashed border-[#e7d6be] p-8 text-center text-sm text-[#78685a]">Receipts appear here after an actual payment has been recorded.</p>}</div> : null}
            {activeTab === 'reminders' ? <div className="space-y-4">
              {reminderHistoryError ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{reminderHistoryError}</p> : null}
              {reminderActionMessage ? <p role="status" className="rounded-lg bg-[#faf5ee] p-3 text-xs text-[#624d35]">{reminderActionMessage}</p> : null}
              {!reminderHistoryError && eventReminderJobs.length ? <>
                {upcomingReminderJobs.length ? <section aria-label="Upcoming reminders"><h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9b6d21]">Upcoming</h3><div className="space-y-2">{upcomingReminderJobs.map((job) => <article key={job.id} className="rounded-xl border border-[#eadfcf] bg-[#fffdf9] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold">{job.subject || 'Payment reminder'}</p><p className="mt-1 text-xs text-[#78685a]">{String(job.metadata?.obligation_label || job.metadata?.invoice_id || 'Payment obligation')} · {formatMoney(Number(job.metadata?.amount_due ?? job.metadata?.balance_due ?? 0))} due</p><p className="mt-1 text-xs text-[#78685a]">Due {formatDate(typeof job.metadata?.due_date === 'string' ? job.metadata.due_date : null)} · To {job.recipient_email || 'Recipient not recorded'}</p></div><span className="rounded-full bg-[#fbf1e4] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#91651f]">{paymentEmailStatus(job)}</span></div><dl className="mt-3 grid gap-x-4 gap-y-1 text-[11px] text-[#78685a] sm:grid-cols-2"><div>Scheduled: {formatDateTime(job.scheduled_for)}</div><div>Created: {formatDateTime(job.created_at)}</div></dl><details className="mt-3"><summary className="cursor-pointer text-[11px] font-semibold text-[#91651f]">View message</summary><p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-[#78685a]">{job.body}</p></details></article>)}</div></section> : null}
                {historyReminderJobs.length ? <section aria-label="Reminder history"><h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#78685a]">Activity · newest first</h3><div className="space-y-2">{historyReminderJobs.map((job) => {
                  const delivery = job.delivery
                  const status = paymentEmailStatus(job)
                  const errorText = delivery?.providerError || job.last_error
                  const retryAvailable = job.job_type === 'installment_payment_reminder' && job.status === 'failed' && job.metadata?.retry_available === true
                  return <article key={job.id} className="rounded-xl border border-[#eee5dc] bg-[#fffdf9] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold">{job.subject || 'Payment reminder'}</p><p className="mt-1 text-xs text-[#78685a]">{String(job.metadata?.obligation_label || job.metadata?.invoice_id || 'Payment obligation')} · {formatMoney(Number(job.metadata?.amount_due ?? job.metadata?.balance_due ?? 0))} due</p><p className="mt-1 text-xs text-[#78685a]">Due {formatDate(typeof job.metadata?.due_date === 'string' ? job.metadata.due_date : null)} · To {job.recipient_email || 'Recipient not recorded'}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${status === 'Failed' ? 'bg-rose-50 text-rose-700' : status === 'Sent' || status === 'Delivered' || status === 'Opened signal' ? 'bg-emerald-50 text-emerald-700' : 'bg-[#fbf1e4] text-[#91651f]'}`}>{status}</span></div><dl className="mt-3 grid gap-x-4 gap-y-1 text-[11px] text-[#78685a] sm:grid-cols-2"><div>Created: {formatDateTime(job.created_at)}</div><div>Scheduled: {formatDateTime(job.scheduled_for)}</div>{job.sent_at || delivery?.sentAt ? <div>Accepted by provider: {formatDateTime(job.sent_at || delivery?.sentAt)}</div> : null}{delivery?.deliveredAt ? <div>Delivered: {formatDateTime(delivery.deliveredAt)}</div> : null}{delivery?.openedAt ? <div>Opened signal: {formatDateTime(delivery.openedAt)}</div> : null}</dl>{delivery?.openedAt ? <p className="mt-2 text-[10px] text-[#78685a]">Open tracking is a provider signal and does not prove a person read the email.</p> : null}{errorText ? <p className="mt-2 text-xs text-rose-700">{errorText}</p> : null}<div className="mt-3 flex flex-wrap items-center gap-3"><details><summary className="cursor-pointer text-[11px] font-semibold text-[#91651f]">View message</summary><p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-[#78685a]">{job.body}</p></details>{retryAvailable ? <button type="button" onClick={() => void retryReminder(job)} disabled={retryingReminderId === job.id} className="rounded-lg border border-[#e7d6be] px-3 py-2 text-[11px] font-semibold text-[#624d35] disabled:opacity-50">{retryingReminderId === job.id ? 'Retrying…' : 'Retry reminder'}</button> : null}</div></article>
                })}</div></section> : null}
              </> : null}
              {!reminderHistoryError && !reminderHistoryLoading && !eventReminderJobs.length ? <p className="rounded-xl border border-dashed border-[#e7d6be] p-8 text-center text-sm text-[#78685a]">No payment reminders are recorded for this event.</p> : null}
              {reminderHistoryLoading && !eventReminderJobs.length ? <p className="rounded-xl border border-dashed border-[#e7d6be] p-6 text-center text-sm text-[#78685a]">Loading reminder history…</p> : null}
            </div> : null}
          </div>
        </div> : null}
      </section>

      {recordOpen ? <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setRecordOpen(false) }}><div role="dialog" aria-modal="true" aria-labelledby="record-payment-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[#eadfcf] bg-[#fffdfa] p-5 shadow-xl sm:rounded-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a6772b]">{leadName}{leadEmail ? ` · ${leadEmail}` : ''}</p><h3 id="record-payment-title" className="mt-1 font-serif text-2xl font-semibold text-[#2d211a]">Record Payment</h3><p className="mt-1 text-sm text-[#78685a]">Record funds already received and apply them to the correct signed-booking obligation.</p></div><button type="button" onClick={() => setRecordOpen(false)} disabled={busy} aria-label="Close" className="rounded-lg p-2 text-[#78685a] hover:bg-[#f6eee4]">×</button></div>
        <div className="mt-5"><label className="text-xs font-semibold text-[#624d35]" htmlFor="record-payment-obligation">Payment obligation</label><PortalSelect value={recordKind} onChange={(value) => { setRecordKind(value as PaymentKind); if (value === 'installment' && selectedInstallment) { setRecordInstallmentId(selectedInstallment.id); setManualAmount(String(selectedInstallmentRemaining.toFixed(2))) } }} aria-label="Payment obligation" theme="light" className="mt-1 w-full" options={[{ value: 'deposit', label: 'Booking deposit' }, { value: 'installment', label: 'Monthly installment' }, { value: 'final', label: 'Final event balance' }, { value: 'security_deposit', label: 'Refundable security deposit' }]} /></div>
        {recordKind === 'installment' ? <div className="mt-4 space-y-3 rounded-xl border border-[#eee5dc] bg-[#fffdf9] p-4">
          <label className="block text-xs font-semibold text-[#624d35]">Installment
            <select value={selectedInstallment?.id || ''} onChange={(event) => { const next = timelineInstallments.find((row) => row.id === event.target.value); setRecordInstallmentId(event.target.value); setManualAmount(next ? String(round(Number(next.amount || 0) - installmentPaidAmount(next, uniquePayments)).toFixed(2)) : '') }} className="mt-1 min-h-11 w-full rounded-lg border border-[#e7d6be] bg-white px-3 text-sm">
              {timelineInstallments.filter((item) => item.status !== 'paid').map((item) => <option key={item.id} value={item.id}>{item.label} · due {formatDate(item.due_at)} · remaining {formatMoney(Math.max(0, Number(item.amount || 0) - installmentPaidAmount(item, uniquePayments)))}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-[#624d35]">Amount received<input type="number" min="0.01" max={selectedInstallmentRemaining} step="0.01" value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#e7d6be] bg-white px-3 text-sm tabular-nums" /></label><label className="text-xs font-semibold text-[#624d35]">Actual payment date<input type="date" max={formatInputDate()} value={manualPaidOn} onChange={(event) => setManualPaidOn(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#e7d6be] bg-white px-3 text-sm" /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-[#624d35]">Method<select value={manualMethod} onChange={(event) => setManualMethod(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#e7d6be] bg-white px-3 text-sm">{['Cash', 'Zelle', 'Check', 'ACH'].map((method) => <option key={method}>{method}</option>)}</select></label><label className="text-xs font-semibold text-[#624d35]">Reference (optional)<input value={manualReference} onChange={(event) => setManualReference(event.target.value)} maxLength={200} className="mt-1 min-h-11 w-full rounded-lg border border-[#e7d6be] bg-white px-3 text-sm" /></label></div>
          <label className="block text-xs font-semibold text-[#624d35]">Notes (optional)<textarea value={manualNotes} onChange={(event) => setManualNotes(event.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-[#e7d6be] bg-white px-3 py-2 text-sm" /></label>
          <p className="text-xs leading-5 text-[#78685a]">This amount is allocated only to the selected installment. Early payment keeps the actual date entered above. Record other obligations as separate transactions so each receipt remains traceable.</p>
          {paymentInstallmentLoadError ? <p role="alert" className="text-xs text-amber-800">{paymentInstallmentLoadError}</p> : null}
        </div> : <div className="mt-4 rounded-xl bg-[#faf5ee] p-4 text-sm leading-6 text-[#6f5c48]">This uses the existing protected invoice-balance workflow and its current payment rules.</div>}
        <label className="mt-3 flex items-center gap-2 text-xs text-[#624d35]"><input type="checkbox" checked={emailReceiptOnSave} onChange={(event) => setEmailReceiptOnSave(event.target.checked)} disabled={!leadEmail} className="accent-[#b88737]" /> Email the paid receipt to {leadEmail || 'the client (email address missing)'}</label>
        {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setRecordOpen(false)} disabled={busy} className="min-h-11 rounded-xl border border-[#e7d6be] px-4 text-sm font-semibold text-[#624d35]">Cancel</button><button type="button" onClick={() => void runRecord()} disabled={busy || !booking || Boolean(paymentLoadError) || booking.contract_status !== 'signed' || (recordKind === 'installment' && (Boolean(paymentInstallmentLoadError) || !selectedInstallment || selectedInstallmentRemaining <= 0 || Number(manualAmount) > selectedInstallmentRemaining))} className="min-h-11 rounded-xl bg-[#b88737] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Saving…' : recordKind === 'installment' ? 'Record installment payment' : 'Continue with existing payment workflow'}</button></div>
        {booking?.contract_status !== 'signed' ? <p className="mt-3 text-xs text-[#78685a]">The Event Agreement must be signed before payments can be recorded.</p> : null}
      </div></div> : null}

      {selectedPayment ? <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPayment(null) }}><div role="dialog" aria-modal="true" aria-labelledby="payment-receipt-title" className="w-full max-w-md rounded-t-2xl border border-[#eadfcf] bg-[#fffdfa] p-5 shadow-xl sm:rounded-2xl"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#fbf1e4] text-[#af7c2a]"><ReceiptText size={19} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a6772b]">Recorded transaction</p><h3 id="payment-receipt-title" className="mt-1 font-serif text-xl font-semibold">Receipt {selectedPayment.id.slice(0, 8).toUpperCase()}</h3></div></div><dl className="mt-4 space-y-2 rounded-xl bg-[#faf5ee] p-4 text-sm"><div className="flex justify-between gap-4"><dt>Date</dt><dd className="text-right">{formatDate(displayReceivedDate(selectedPayment))}</dd></div><div className="flex justify-between gap-4"><dt>Amount received</dt><dd className="font-semibold tabular-nums">{formatMoney(Number(selectedPayment.amount || 0))}</dd></div><div className="flex justify-between gap-4"><dt>Method</dt><dd>{selectedPayment.payment_method || 'Not recorded'}</dd></div><div className="flex justify-between gap-4"><dt>Applied to</dt><dd className="text-right">{appliedTo(selectedPayment, invoiceById.get(selectedPayment.invoice_id || ''))}</dd></div><div className="flex justify-between gap-4"><dt>Client</dt><dd className="text-right">{leadName}</dd></div></dl><p className="mt-3 break-all text-[10px] text-[#78685a]">Transaction reference: {selectedPayment.processor_reference || selectedPayment.id}</p><button type="button" onClick={() => setSelectedPayment(null)} className="mt-4 min-h-11 w-full rounded-xl bg-[#b88737] text-sm font-semibold text-white">Close</button></div></div> : null}
      {receivedDateTarget && typeof document !== 'undefined' ? createPortal(<div className="fixed inset-0 z-[130] grid place-items-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !receivedDateBusy) setReceivedDateTarget(null) }}><section role="dialog" aria-modal="true" aria-labelledby="received-date-title" className="w-full max-w-lg rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 text-[color:var(--portal-text)] shadow-2xl sm:p-6"><h3 id="received-date-title" className="font-serif text-xl font-semibold">Correct actual received date</h3><p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">The original entry timestamp stays unchanged. This correction is recorded in the append-only financial audit history. Existing signed installment due dates are left as agreed.</p><div className="mt-4"><PortalDatePicker value={receivedDateValue} onChange={setReceivedDateValue} timeZone="America/Chicago" allowPastDates placeholder="Choose received date" className="w-full" /></div><label htmlFor="received-date-reason" className="mt-4 block text-xs font-semibold">Reason for correction</label><textarea id="received-date-reason" value={receivedDateReason} onChange={(event) => setReceivedDateReason(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] p-3 text-sm outline-none focus:border-[#caa24c]" placeholder="Enter at least 8 characters" />{receivedDateError ? <p role="alert" className="mt-3 text-sm text-rose-600">{receivedDateError}</p> : null}{receivedDateHistoryError ? <p role="alert" className="mt-3 text-xs text-rose-600">{receivedDateHistoryError}</p> : null}{receivedDateHistory.length ? <section className="mt-4 rounded-xl border border-[color:var(--portal-border)] p-3"><h4 className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--portal-muted)]">Correction history · newest first</h4><ol className="mt-2 space-y-2">{receivedDateHistory.map((entry) => <li key={entry.id} className="border-t border-[color:var(--portal-border)] pt-2 text-xs"><p>{String(entry.before_state.received_date || "Original date not recorded")} → <strong>{String(entry.after_state.received_date || "Date not recorded")}</strong></p><p className="mt-1 text-[color:var(--portal-muted)]">{formatDateTime(entry.occurred_at)} · {entry.actor_email}{entry.reason ? ` · ${entry.reason}` : ""}</p></li>)}</ol></section> : null}<div className="mt-5 flex justify-end gap-3"><button type="button" disabled={receivedDateBusy} onClick={() => setReceivedDateTarget(null)} className="min-h-10 rounded-lg border border-[color:var(--portal-border)] px-4 text-sm font-semibold disabled:opacity-50">Cancel</button><button type="button" disabled={receivedDateBusy || !receivedDateValue || receivedDateReason.trim().length < 8} onClick={() => void saveReceivedDateCorrection()} className="min-h-10 rounded-lg bg-[#b88737] px-4 text-sm font-semibold text-white disabled:opacity-50">{receivedDateBusy ? 'Saving…' : 'Save correction'}</button></div></section></div>, document.body) : null}
      {receiptPreviewPayment && typeof document !== 'undefined' ? createPortal(<div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !emailingReceiptId) { setReceiptPreviewPayment(null); setReceiptPreview(null) } }}><div role="dialog" aria-modal="true" aria-labelledby="receipt-email-preview-title" className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-[#caa24c]/30 bg-[#f7f3ec] text-[#231f1a] shadow-2xl sm:rounded-2xl"><div className="flex items-start justify-between gap-4 border-b border-[#caa24c]/20 bg-[#101010] px-5 py-4 text-[#f5eee2]"><div><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#caa24c]">Luxor at Las Palmas Events</p><h3 id="receipt-email-preview-title" className="mt-1 font-serif text-xl font-semibold">Receipt email preview</h3><p className="mt-1 text-xs text-[#d7c29a]">Review the message and the exact receipt PDF before sending.</p></div><button type="button" onClick={() => { if (!emailingReceiptId) { setReceiptPreviewPayment(null); setReceiptPreview(null) } }} aria-label="Close receipt preview" className="rounded-lg px-3 py-2 text-xl text-[#d7c29a] hover:bg-white/10">×</button></div><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{receiptPreviewLoading ? <p className="rounded-xl border border-[#e7d6be] bg-white p-6 text-sm text-[#78685a]">Preparing the receipt email and PDF…</p> : null}{receiptPreviewError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{receiptPreviewError}</p> : null}{receiptPreview ? <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"><section className="overflow-hidden rounded-xl border border-[#ded6ca] bg-[#fffdfa] shadow-sm"><div className="space-y-2 border-b border-[#e7dfd4] bg-[#fbf8f2] p-4 text-xs"><p><span className="inline-block w-16 font-semibold text-[#78685a]">To</span><span className="break-all">{receiptPreview.recipient}</span></p><p><span className="inline-block w-16 font-semibold text-[#78685a]">Subject</span>{receiptPreview.subject}</p><p><span className="inline-block w-16 font-semibold text-[#78685a]">Attachment</span>{receiptPreview.filename}</p></div><div className="whitespace-pre-wrap p-5 text-sm leading-6 text-[#332b25]">{receiptPreview.message}</div></section><section className="overflow-hidden rounded-xl border border-[#ded6ca] bg-white shadow-sm"><div className="flex items-center justify-between gap-3 border-b border-[#e7dfd4] bg-[#101010] px-4 py-3 text-xs text-[#f7efe3]"><span className="font-semibold text-[#d7b866]">Attached receipt · {receiptPreview.receiptNumber}</span><a href={receiptPreview.pdfUrl.replace('disposition=inline', 'disposition=attachment')} className="text-[#e1c881] underline">Download</a></div><PaymentReceiptPdfPreview key={receiptPreview.pdfUrl} url={receiptPreview.pdfUrl} receiptNumber={receiptPreview.receiptNumber} /></section></div> : null}</div><div className="flex flex-col gap-2 border-t border-[#e7dfd4] bg-[#fffdfa] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-xs text-[#78685a]">{receiptEmailMessage || (previewReceiptJob ? `Receipt email status: ${paymentEmailStatus(previewReceiptJob as PaymentEmailHistoryJob)}.` : 'The PDF preview and outgoing attachment use the same server-generated receipt.')}</p><div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" onClick={() => { if (!emailingReceiptId) { setReceiptPreviewPayment(null); setReceiptPreview(null) } }} disabled={Boolean(emailingReceiptId)} className="min-h-11 rounded-xl border border-[#e7d6be] px-4 text-sm font-semibold text-[#624d35]">Close</button><button type="button" onClick={() => void emailReceipt(receiptPreviewPayment, previewReceiptJob?.status === 'failed')} disabled={!receiptPreview || receiptPreviewLoading || Boolean(receiptPreviewError) || emailingReceiptId === receiptPreviewPayment.id || previewReceiptJob?.status === 'queued' || previewReceiptJob?.status === 'sending' || previewReceiptJob?.status === 'sent' || previewReceiptJob?.status === 'cancelled' || !leadEmail} className="min-h-11 rounded-xl bg-[#b88737] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{emailingReceiptId === receiptPreviewPayment.id ? 'Queueing…' : previewReceiptJob?.status === 'sent' ? 'Already sent' : previewReceiptJob?.status === 'cancelled' ? 'Receipt email canceled' : previewReceiptJob?.status === 'queued' || previewReceiptJob?.status === 'sending' ? 'Pending provider acceptance' : previewReceiptJob?.status === 'failed' ? 'Retry receipt email' : 'Send Receipt'}</button></div></div></div></div>, document.body) : null}
    </section>
  )
}
