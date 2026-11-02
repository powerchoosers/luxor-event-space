'use client'

import { useMemo, useState } from 'react'
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
} from 'lucide-react'
import type { LuxorBooking, LuxorEmailJob, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment } from '@/lib/luxorInquiryTypes'
import { eventCreditForPayment as paymentMoneyForEvent, installmentPaidAmount, isBookingPaymentMilestone, paidOnInvoice, paymentReminderJobsForEvent } from '@/lib/luxorPaymentDashboardModel'
import { PortalSelect } from '@/components/portal/PortalUI'

type PaymentKind = 'deposit' | 'final' | 'security_deposit' | 'installment'
type ExistingPaymentKind = Exclude<PaymentKind, 'installment'>
type ManualInstallmentInput = { installmentId: string; amount: number; paidOn: string; paymentMethod: string; reference: string; notes: string; idempotencyKey: string; emailReceipt: boolean }
type FinancialTab = 'history' | 'invoices' | 'receipts' | 'reminders'

type Props = {
  leadName: string
  leadEmail: string | null
  booking: LuxorBooking | null
  eventInvoice: LuxorInvoice | null
  invoices: LuxorInvoice[]
  payments: LuxorPayment[]
  installments: LuxorPaymentInstallment[]
  reminderJobs: LuxorEmailJob[]
  paymentLoadError?: string | null
  paymentInstallmentLoadError?: string | null
  paymentReminderLoadError?: string | null
  onRecordPayment: (booking: LuxorBooking, kind: ExistingPaymentKind, emailReceipt?: boolean) => Promise<void>
  onRecordInstallmentPayment: (booking: LuxorBooking, input: ManualInstallmentInput) => Promise<void>
  onViewInvoice: (invoice: LuxorInvoice) => void
  onRequestInvoicePayment: (invoice: LuxorInvoice) => void
}

const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })
const formatMoney = (amount: number) => currency.format(Number.isFinite(amount) ? amount : 0)
const formatInputDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const formatDate = (value?: string | null) => {
  if (!value) return 'Date not set'
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date not set'
}
const round = (value: number) => Math.round(value * 100) / 100
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
  reminderJobs,
  paymentLoadError,
  paymentInstallmentLoadError,
  paymentReminderLoadError,
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
  const [busy, setBusy] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<LuxorPayment | null>(null)
  const [error, setError] = useState<string | null>(null)

  const invoiceById = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice])), [invoices])
  const uniquePayments = useMemo(() => Array.from(new Map(payments.map((payment) => [payment.id, payment])).values())
    .sort((left, right) => Date.parse(right.paid_at || right.created_at) - Date.parse(left.paid_at || left.created_at)), [payments])
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
  const eventReminderJobs = useMemo(() => paymentReminderJobsForEvent(reminderJobs, booking?.id, new Set(invoices.map((invoice) => invoice.id))), [booking?.id, invoices, reminderJobs])
  const nextReminder = eventReminderJobs
    .filter((job) => job.status === 'queued' && Date.parse(job.scheduled_for) > Date.now())
    .sort((left, right) => Date.parse(left.scheduled_for) - Date.parse(right.scheduled_for))[0]
  const categorizedPayments = useMemo(() => uniquePayments.map((payment) => ({ payment, invoice: invoiceById.get(payment.invoice_id || '') })), [invoiceById, uniquePayments])
  const selectedInstallment = timelineInstallments.find((item) => item.id === recordInstallmentId) || timelineInstallments[0]
  const selectedInstallmentRemaining = selectedInstallment
    ? Math.max(0, round(Number(selectedInstallment.amount || 0) - installmentPaidAmount(selectedInstallment, uniquePayments)))
    : 0

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

  const emailReceipt = async (payment: LuxorPayment) => {
    setEmailingReceiptId(payment.id)
    setReceiptEmailMessage(null)
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(payment.id)}/receipt/email`, { method: 'POST' })
      const result = await response.json().catch(() => ({})) as { error?: string; job?: LuxorEmailJob }
      if (!response.ok) throw new Error(result.error || 'Receipt email could not be queued.')
      if (result.job) setReceiptEmailOverrides((current) => ({ ...current, [payment.id]: result.job! }))
      const state = result.job?.status === 'sent' ? 'sent' : result.job?.status === 'failed' ? 'failed' : 'queued'
      setReceiptEmailMessage(state === 'sent' ? 'Receipt email was already sent.' : state === 'failed' ? 'Receipt email remains failed and needs review.' : 'Receipt email queued. Delivery will be shown in Reminder History when available.')
    } catch (caught) {
      setReceiptEmailMessage(caught instanceof Error ? caught.message : 'Receipt email could not be queued.')
    } finally {
      setEmailingReceiptId(null)
    }
  }

  const scheduledDepositPaid = categorizedPayments.filter(({ payment, invoice }) => paymentKind(payment, invoice) === 'deposit').reduce((sum, { payment, invoice }) => sum + paymentMoneyForEvent(payment, invoice), 0)
  const lastDeposit = categorizedPayments.find(({ payment, invoice }) => paymentKind(payment, invoice) === 'deposit' && payment.status === 'paid')?.payment

  return (
    <section className="space-y-5 rounded-2xl border border-[#eadfcf] bg-[#fffdfa] p-4 text-[#332b25] shadow-sm sm:p-6" aria-label="Payments">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-[#241b17]">Payments</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="inline-flex items-center gap-2 text-sm text-[#755b39]" aria-live="polite">
            <CalendarDays size={16} className="shrink-0 text-[#ae8138]" />
            {paymentReminderLoadError ? 'Reminder schedule unavailable' : nextReminder ? <>Next payment reminder: <strong className="font-semibold">{formatDate(nextReminder.scheduled_for)}</strong></> : 'No upcoming reminders'}
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
              <div className="min-w-0"><p className="font-semibold">Booking Deposit</p><p className="text-xs text-[#78685a]">{lastDeposit ? `Received ${formatDate(lastDeposit.paid_at || lastDeposit.created_at)}` : 'No received booking deposit recorded'}</p></div>
              <div className="text-right"><p className="font-semibold tabular-nums">{formatMoney(scheduledDepositPaid)}</p><span className={`text-[10px] font-bold uppercase tracking-wide ${lastDeposit ? 'text-emerald-700' : 'text-[#8b7a67]'}`}>{lastDeposit ? 'Paid' : 'Pending'}</span></div>
            </div>
            <div className="flex items-center gap-3 py-2"><span className="z-10 h-2 w-2 rounded-full bg-[#c29448]" /><p className="flex flex-1 items-center gap-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[#a6772b]">Monthly payments<span className="h-px flex-1 bg-[#d8c6ac]" /></p></div>
            {timelineInstallments.map((installment) => {
              const allocatedPaid = installmentPaidAmount(installment, uniquePayments)
              const due = Number(installment.amount || 0)
              // Allocation rows are authoritative when present. Older rows
              // predate explicit allocation records; retain their canonical
              // installment status without fabricating an allocation.
              const canonicalPaid = installment.status === 'paid' ? due : 0
              const canonicalPartial = installment.status === 'partial'
                ? Number(installment.metadata?.paid_amount || 0)
                : 0
              const credited = Math.min(due, Math.max(allocatedPaid, canonicalPaid, canonicalPartial))
              const isPaid = due > 0 && (credited >= due || installment.status === 'paid')
              const isPartial = installment.status === 'partial' || credited > 0 && !isPaid
              const overdue = !isPaid && installment.due_at && Date.parse(installment.due_at) < Date.now()
              const amountText = isPartial ? credited > 0 ? `${formatMoney(credited)} / ${formatMoney(due)}` : `Unverified / ${formatMoney(due)}` : !credited && installment.due_at && Date.parse(installment.due_at) <= Date.now() ? `${formatMoney(0)} / ${formatMoney(due)}` : formatMoney(due)
              const status = isPaid ? 'Paid' : isPartial ? 'Partially paid' : overdue ? 'Overdue' : 'Pending'
              return <div key={installment.id} className="relative grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#f1eae2] py-3 last:border-0">
                <span className={`z-10 grid h-6 w-6 place-items-center rounded-full border-2 bg-white ${isPaid ? 'border-emerald-600 bg-emerald-600 text-white' : overdue ? 'border-rose-500 text-rose-600' : 'border-[#b4a391] text-[#817364]'}`}>{isPaid ? <Check size={14} /> : <Clock3 size={14} />}</span>
                <div className="min-w-0"><p className="font-semibold">{installment.label || `Installment ${installment.installment_order}`}</p><p className="text-xs text-[#78685a]">{formatDate(installment.due_at)}{isPaid && installment.paid_at ? ` · Paid ${formatDate(installment.paid_at)}` : installment.due_at ? ` · ${overdue ? `Overdue by ${Math.max(1, Math.floor((Date.now() - Date.parse(installment.due_at)) / 86400000))} days` : 'Scheduled'}` : ''}</p></div>
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
              <div className="space-y-2 sm:hidden">{categorizedPayments.length ? categorizedPayments.map(({ payment, invoice }) => <article key={payment.id} className="rounded-xl border border-[#eee5dc] bg-[#fffdf9] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{paymentDescription(payment, invoice)}</p><p className="mt-1 text-[11px] text-[#78685a]">{formatDate(payment.paid_at || payment.created_at)} · {payment.payment_method || 'Method not recorded'}</p></div><strong className="shrink-0 tabular-nums">{formatMoney(Number(payment.amount || 0))}</strong></div><p className="mt-2 text-[11px] text-[#78685a]">Applied to: {appliedTo(payment, invoice)}{payment.status !== 'paid' ? ` · ${payment.status}` : ''}</p>{payment.status === 'paid' ? <div className="mt-2 flex gap-4 text-xs font-semibold text-[#91651f]"><button type="button" onClick={() => setSelectedPayment(payment)} className="inline-flex items-center gap-1"><Eye size={14} /> View</button><a href={`/api/payments/${encodeURIComponent(payment.id)}/receipt`}>Download receipt</a></div> : null}</article>) : <p className="rounded-xl border border-dashed border-[#e7d6be] p-6 text-center text-sm text-[#78685a]">No payment transactions are recorded for this event.</p>}</div>
              <div className="hidden overflow-x-auto rounded-xl border border-[#eee5dc] sm:block"><table className="w-full border-collapse text-left text-xs"><thead className="bg-[#faf5ee] text-[10px] uppercase tracking-wide text-[#78685a]"><tr>{['Date', 'Description', 'Amount', 'Method', 'Applied To', 'Receipt'].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#f1eae2]">{categorizedPayments.length ? categorizedPayments.map(({ payment, invoice }) => <tr key={payment.id}><td className="whitespace-nowrap px-3 py-3">{formatDate(payment.paid_at || payment.created_at)}</td><td className="px-3 py-3 font-medium">{paymentDescription(payment, invoice)}{payment.status !== 'paid' ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-amber-800">{payment.status}</span> : null}</td><td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">{formatMoney(Number(payment.amount || 0))}</td><td className="px-3 py-3">{payment.payment_method || 'Not recorded'}</td><td className="px-3 py-3">{appliedTo(payment, invoice)}</td><td className="px-3 py-3">{payment.status === 'paid' ? <div className="flex items-center gap-2"><button type="button" onClick={() => setSelectedPayment(payment)} className="inline-flex items-center gap-1 text-[#91651f] hover:underline"><Eye size={14} /> View</button><a href={`/api/payments/${encodeURIComponent(payment.id)}/receipt`} className="text-[#91651f] hover:underline">Download</a></div> : <span className="text-[#988979]">—</span>}</td></tr>) : <tr><td colSpan={6} className="px-3 py-8 text-center text-[#78685a]">No payment transactions are recorded for this event.</td></tr>}</tbody></table></div>
            </div> : null}
            {activeTab === 'invoices' ? <div className="space-y-3">{invoices.length ? invoices.map((invoice) => {
              const invoicePaid = paidOnInvoice(invoice, invoices, uniquePayments)
              const total = Number(invoice.total || 0)
              const balance = Math.max(0, round(total - invoicePaid))
              const dueAt = invoice.due_date
              const status = invoice.status === 'cancelled' ? 'Cancelled' : balance <= 0 && invoicePaid > 0 ? 'Paid' : dueAt && Date.parse(dueAt) < Date.now() && balance > 0 ? 'Overdue' : invoice.status === 'draft' ? 'Draft' : invoicePaid > 0 ? 'Partially paid' : invoice.status === 'paid' ? 'Needs reconciliation' : 'Open'
              return <article key={invoice.id} className="grid gap-3 rounded-xl border border-[#eee5dc] bg-[#fffdf9] p-4 md:grid-cols-[1fr_auto] md:items-center"><div className="min-w-0"><p className="font-semibold">{invoice.description || `${invoice.invoice_kind || 'Event'} invoice`}</p><p className="mt-1 text-xs text-[#78685a]">Invoice {invoice.id.slice(0, 8).toUpperCase()} · Issued {formatDate(invoice.created_at)} · Due {formatDate(dueAt)}</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs"><span>Total <strong>{formatMoney(total)}</strong></span><span>Paid <strong>{formatMoney(invoicePaid)}</strong></span><span>Outstanding <strong>{formatMoney(balance)}</strong></span><span className="font-semibold text-[#91651f]">{status}</span></div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => onViewInvoice(invoice)} className="rounded-lg border border-[#e7d6be] px-3 py-2 text-xs font-semibold text-[#624d35]">View</button><a href={`/api/invoices/${encodeURIComponent(invoice.id)}/pdf`} className="rounded-lg border border-[#e7d6be] px-3 py-2 text-xs font-semibold text-[#624d35]">Download</a>{balance > 0 && invoice.status !== 'cancelled' && invoice.status !== 'paid' ? <button type="button" onClick={() => onRequestInvoicePayment(invoice)} className="rounded-lg bg-[#b88737] px-3 py-2 text-xs font-semibold text-white">Payment request</button> : null}</div></article>
            }) : <p className="rounded-xl border border-dashed border-[#e7d6be] p-8 text-center text-sm text-[#78685a]">No invoices are associated with this event.</p>}</div> : null}
            {activeTab === 'receipts' ? <div className="space-y-2">{receiptEmailMessage ? <p role="status" className="rounded-lg bg-[#faf5ee] p-3 text-xs text-[#624d35]">{receiptEmailMessage}</p> : null}{paidPayments.length ? paidPayments.map((payment) => {
              const invoice = invoiceById.get(payment.invoice_id || '')
              const savedEmailJob = receiptEmailOverrides[payment.id] || reminderJobs.find((job) => {
                const notice = job.metadata?.transactionalNotice && typeof job.metadata.transactionalNotice === 'object' ? job.metadata.transactionalNotice as Record<string, unknown> : null
                return notice?.key === `payment_receipt/${payment.id}`
              })
              const emailNoticeTerminal = savedEmailJob?.status === 'sent' || savedEmailJob?.status === 'failed' || savedEmailJob?.status === 'cancelled'
              return <article key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#eee5dc] bg-[#fffdf9] p-4"><div className="flex min-w-0 items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#fbf1e4] text-[#af7c2a]"><ReceiptText size={17} /></span><div className="min-w-0"><p className="font-semibold">Receipt {payment.id.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-xs text-[#78685a]">{formatDate(payment.paid_at || payment.created_at)} · {payment.payment_method || 'Method not recorded'} · {appliedTo(payment, invoice)}</p><p className="mt-1 text-[11px] text-[#78685a]">{leadName}{invoice?.event_type ? ` · ${invoice.event_type}` : ''}{payment.processor_reference ? ` · Ref ${payment.processor_reference}` : ''}</p>{savedEmailJob ? <p className={`mt-1 text-[11px] font-semibold ${savedEmailJob.status === 'failed' ? 'text-rose-700' : savedEmailJob.status === 'sent' ? 'text-emerald-700' : 'text-[#91651f]'}`}>Receipt email: {savedEmailJob.status === 'queued' ? 'Scheduled' : savedEmailJob.status === 'sent' ? 'Sent' : savedEmailJob.status}{savedEmailJob.last_error ? ` · ${savedEmailJob.last_error}` : ''}</p> : null}</div></div><div className="flex flex-wrap items-center gap-3"><strong className="tabular-nums">{formatMoney(Number(payment.amount || 0))}</strong><button type="button" onClick={() => setSelectedPayment(payment)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#91651f]"><Eye size={14} /> View</button><a href={`/api/payments/${encodeURIComponent(payment.id)}/receipt`} className="text-xs font-semibold text-[#91651f] hover:underline">Download</a>{leadEmail ? <button type="button" onClick={() => void emailReceipt(payment)} disabled={emailingReceiptId === payment.id || savedEmailJob?.status === 'queued' || savedEmailJob?.status === 'sending' || Boolean(emailNoticeTerminal)} className="text-xs font-semibold text-[#91651f] disabled:opacity-50">{emailingReceiptId === payment.id ? 'Queueing…' : savedEmailJob?.status === 'failed' || savedEmailJob?.status === 'cancelled' ? 'Email needs review' : 'Email receipt'}</button> : null}</div></article>
            }) : <p className="rounded-xl border border-dashed border-[#e7d6be] p-8 text-center text-sm text-[#78685a]">Receipts appear here after an actual payment has been recorded.</p>}</div> : null}
            {activeTab === 'reminders' ? <div>{paymentReminderLoadError ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{paymentReminderLoadError}</p> : eventReminderJobs.length ? <div className="space-y-2">{eventReminderJobs.map((job) => <article key={job.id} className="rounded-xl border border-[#eee5dc] bg-[#fffdf9] p-3 text-xs sm:hidden"><div className="flex justify-between gap-3"><strong>{String(job.metadata?.obligation_label || job.metadata?.invoice_id || 'Payment reminder')}</strong><span className="font-semibold capitalize">{job.status === 'queued' ? 'Scheduled' : job.status}</span></div><p className="mt-1 text-[#78685a]">{formatDate(job.sent_at || job.scheduled_for || job.created_at)} · Email · {job.job_type.replaceAll('_', ' ')}</p><p className="mt-1 break-all text-[#78685a]">To {job.recipient_email || leadEmail || '—'} · {typeof job.metadata?.amount_due === 'number' ? formatMoney(job.metadata.amount_due) : 'amount not recorded'}</p>{job.last_error ? <p className="mt-1 text-rose-700">{job.last_error}</p> : null}<details className="mt-2"><summary className="cursor-pointer text-[#91651f]">View message</summary><p className="mt-2 whitespace-pre-wrap text-[10px] leading-4 text-[#78685a]">{job.subject}{'\n'}{job.body}</p></details></article>)}<div className="hidden overflow-x-auto rounded-xl border border-[#eee5dc] sm:block"><table className="w-full border-collapse text-left text-xs"><thead className="bg-[#faf5ee] text-[10px] uppercase tracking-wide text-[#78685a]"><tr>{['Date', 'Related obligation', 'Amount due', 'Recipient', 'Channel', 'Type', 'Status'].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#f1eae2]">{eventReminderJobs.map((job) => <tr key={job.id}><td className="whitespace-nowrap px-3 py-3">{formatDate(job.sent_at || job.scheduled_for || job.created_at)}</td><td className="px-3 py-3">{String(job.metadata?.obligation_label || job.metadata?.invoice_id || 'Payment reminder')}</td><td className="px-3 py-3 tabular-nums">{typeof job.metadata?.amount_due === 'number' ? formatMoney(job.metadata.amount_due) : '—'}</td><td className="px-3 py-3">{job.recipient_email || leadEmail || '—'}</td><td className="px-3 py-3">Email</td><td className="px-3 py-3">{job.job_type.replaceAll('_', ' ')}</td><td className="px-3 py-3"><span className={`font-semibold capitalize ${job.status === 'failed' ? 'text-rose-700' : job.status === 'sent' ? 'text-emerald-700' : job.status === 'cancelled' ? 'text-[#78685a]' : 'text-[#9b6d21]'}`}>{job.status === 'queued' ? 'Scheduled' : job.status === 'sent' ? 'Sent' : job.status}</span>{job.last_error ? <p className="mt-1 max-w-48 text-[10px] text-rose-700">{job.last_error}</p> : null}<details className="mt-1"><summary className="cursor-pointer text-[10px] text-[#91651f]">View message</summary><p className="mt-2 max-w-xl whitespace-pre-wrap text-[10px] leading-4 text-[#78685a]">{job.subject}{'\n'}{job.body}</p></details></td></tr>)}</tbody></table></div></div> : <p className="rounded-xl border border-dashed border-[#e7d6be] p-8 text-center text-sm text-[#78685a]">No payment reminders are recorded for this event.</p>}</div> : null}
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

      {selectedPayment ? <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPayment(null) }}><div role="dialog" aria-modal="true" aria-labelledby="payment-receipt-title" className="w-full max-w-md rounded-t-2xl border border-[#eadfcf] bg-[#fffdfa] p-5 shadow-xl sm:rounded-2xl"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#fbf1e4] text-[#af7c2a]"><ReceiptText size={19} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a6772b]">Recorded transaction</p><h3 id="payment-receipt-title" className="mt-1 font-serif text-xl font-semibold">Receipt {selectedPayment.id.slice(0, 8).toUpperCase()}</h3></div></div><dl className="mt-4 space-y-2 rounded-xl bg-[#faf5ee] p-4 text-sm"><div className="flex justify-between gap-4"><dt>Date</dt><dd className="text-right">{formatDate(selectedPayment.paid_at || selectedPayment.created_at)}</dd></div><div className="flex justify-between gap-4"><dt>Amount received</dt><dd className="font-semibold tabular-nums">{formatMoney(Number(selectedPayment.amount || 0))}</dd></div><div className="flex justify-between gap-4"><dt>Method</dt><dd>{selectedPayment.payment_method || 'Not recorded'}</dd></div><div className="flex justify-between gap-4"><dt>Applied to</dt><dd className="text-right">{appliedTo(selectedPayment, invoiceById.get(selectedPayment.invoice_id || ''))}</dd></div><div className="flex justify-between gap-4"><dt>Client</dt><dd className="text-right">{leadName}</dd></div></dl><p className="mt-3 break-all text-[10px] text-[#78685a]">Transaction reference: {selectedPayment.processor_reference || selectedPayment.id}</p><button type="button" onClick={() => setSelectedPayment(null)} className="mt-4 min-h-11 w-full rounded-xl bg-[#b88737] text-sm font-semibold text-white">Close</button></div></div> : null}
    </section>
  )
}
