import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorBooking } from '@/lib/luxorBookingsServer'
import { listPaidPaymentsByInvoice, listInvoicesByBooking } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { listLuxorPaymentInstallments } from '@/lib/luxorPaymentInstallmentsServer'
import { installmentPaidAmount, installmentReminderWindowIsCurrent, isBookingPaymentMilestone, isFinalPaymentMilestone } from '@/lib/luxorPaymentDashboardModel'
import { areLuxorFinalPaymentRemindersEnabled } from '@/lib/luxorPaymentRemindersServer'
import { luxorCalendarDate, validCalendarDate } from '@/lib/luxorProposalTerms'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorEmailJob, LuxorPayment } from '@/lib/luxorInquiryTypes'

function httpError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  if (!await getLuxorPortalSession()) return httpError('Zoho portal login required.', 401)
  try {
    if (process.env.LUXOR_PAYMENT_INSTALLMENT_ALLOCATIONS_READY !== 'true'
      || process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY !== 'true'
      || !await areLuxorFinalPaymentRemindersEnabled()) {
      return httpError('Payment reminders are paused or unavailable.', 409)
    }
    const body = await request.json().catch(() => ({})) as { jobId?: string }
    if (!body.jobId || !/^[0-9a-f-]{36}$/i.test(body.jobId)) return httpError('A valid reminder job is required.', 400)
    const [job] = await supabaseRest<LuxorEmailJob[]>(`luxor_email_jobs?select=*&id=eq.${encodeURIComponent(body.jobId)}&limit=1`)
    if (!job || job.job_type !== 'installment_payment_reminder' || job.status !== 'failed') return httpError('This reminder is no longer in a retryable failed state.', 409)
    if (job.metadata?.paymentReminderRetrySafe !== true) return httpError('The provider outcome may be uncertain. Verify delivery before retrying.', 409)
    if (job.test_run_id || !job.booking_id || !job.inquiry_id) return httpError('This reminder is not an eligible production payment reminder.', 409)

    const booking = await getLuxorBooking(job.booking_id)
    const inquiry = await getLuxorInquiry(job.inquiry_id)
    if (!booking || booking.inquiry_id !== job.inquiry_id || !['tentative', 'confirmed'].includes(booking.status)
      || booking.contract_status !== 'signed' || !booking.invoice_id || !booking.metadata?.deposit_paid_at
      || !inquiry?.email || inquiry.id !== booking.inquiry_id || inquiry.status === 'closed_lost' || inquiry.archived_at
      || inquiry.is_test === true || inquiry.email.toLowerCase() !== job.recipient_email.toLowerCase()) {
      return httpError('The booking or recipient is no longer eligible for payment reminders.', 409)
    }
    const installmentId = typeof job.metadata?.installment_id === 'string' ? job.metadata.installment_id : ''
    const dueDate = typeof job.metadata?.due_date === 'string' ? job.metadata.due_date : ''
    const milestone = typeof job.metadata?.milestone === 'string' ? job.metadata.milestone : ''
    const now = new Date()
    if (!installmentId || !validCalendarDate(dueDate)
      || !['installment_7_days_before', 'installment_1_day_overdue'].includes(milestone)
      || !installmentReminderWindowIsCurrent(dueDate, luxorCalendarDate(now), milestone, now)) {
      return httpError('The approved reminder date or send window has passed. No reminder was requeued.', 409)
    }
    const [invoices, installments] = await Promise.all([
      listInvoicesByBooking(booking.id),
      listLuxorPaymentInstallments(booking.id),
    ])
    const installment = installments.find((row) => row.id === installmentId)
    if (!installment || installment.invoice_id !== booking.invoice_id || installment.status === 'void'
      || isBookingPaymentMilestone(installment) || isFinalPaymentMilestone(installment)
      || installment.due_at?.slice(0, 10) !== dueDate) {
      return httpError('The installment schedule changed; refresh the reminder history.', 409)
    }
    const invoiceIds = invoices.filter((invoice) => invoice.invoice_kind !== 'security_deposit').map((invoice) => invoice.id)
    const payments = (await Promise.all(invoiceIds.map((invoiceId) => listPaidPaymentsByInvoice(invoiceId)))).flat() as LuxorPayment[]
    const remaining = Math.max(0, Math.round((Number(installment.amount) - installmentPaidAmount(installment, payments)) * 100) / 100)
    if (remaining <= 0 || installment.status === 'paid') return httpError('This installment is fully paid and cannot be reminded.', 409)

    const retryHistory = Array.isArray(job.metadata?.paymentReminderRetries) ? job.metadata.paymentReminderRetries : []
    const queued = await supabaseRest<LuxorEmailJob[]>(`luxor_email_jobs?id=eq.${encodeURIComponent(job.id)}&status=eq.failed&updated_at=eq.${encodeURIComponent(job.updated_at)}&select=*`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'queued', scheduled_for: now.toISOString(), attempts: 0, last_error: null, updated_at: now.toISOString(),
        metadata: { ...job.metadata, balance_due: remaining, amount_due: remaining, paymentReminderRetrySafe: false,
          paymentReminderRetries: [...retryHistory, { requested_at: now.toISOString(), previous_attempts: job.attempts }] },
      }),
    })
    if (queued[0]) return NextResponse.json({ job: queued[0], state: 'queued' }, { headers: { 'Cache-Control': 'no-store' } })
    const [current] = await supabaseRest<LuxorEmailJob[]>(`luxor_email_jobs?select=*&id=eq.${encodeURIComponent(job.id)}&limit=1`)
    if (current && ['queued', 'sending', 'sent'].includes(current.status)) return NextResponse.json({ job: current, state: current.status }, { headers: { 'Cache-Control': 'no-store' } })
    return httpError('Reminder status changed before retry. Refresh to verify its current state.', 409)
  } catch (error) {
    return httpError(error instanceof Error ? error.message : 'Payment reminder could not be retried safely.', 503)
  }
}
