import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorBooking } from '@/lib/luxorBookingsServer'
import { listInvoicesByBooking } from '@/lib/luxorInvoicesServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { paymentReminderJobsForEvent } from '@/lib/luxorPaymentDashboardModel'
import { installmentReminderWindowIsCurrent } from '@/lib/luxorPaymentDashboardModel'
import { luxorCalendarDate } from '@/lib/luxorProposalTerms'
import type { LuxorEmailJob, LuxorPayment } from '@/lib/luxorInquiryTypes'

type MailStatusRow = { id: string; provider: string; provider_id: string | null; status: string; accepted_at: string | null; occurred_at: string | null; metadata: Record<string, unknown> | null }
type ResendEventRow = { event_type: string; provider_email_id: string | null; payload: Record<string, unknown>; received_at: string }
type DeliveryStatus = 'sent' | 'pending' | 'delivered' | 'opened' | 'failed' | 'cancelled'
type PaymentHistoryJob = LuxorEmailJob & { metadata: Record<string, unknown>; delivery: { status: DeliveryStatus; sentAt: string | null; deliveredAt: string | null; openedAt: string | null; providerError: string | null; retryAvailable: boolean } }

const paymentReminderKinds = new Set([
  'unpaid_invoice_reminder', 'sixty_day_payment_reminder', 'final_payment_request',
  'final_payment_reminder', 'installment_payment_reminder', 'proposal_payment_reminder',
])

function jobIdFromMail(row: MailStatusRow) {
  return typeof row.metadata?.emailJobId === 'string' ? row.metadata.emailJobId : ''
}

function eventTime(event: ResendEventRow) {
  const payload = event.payload?.created_at
  return typeof payload === 'string' && Number.isFinite(Date.parse(payload)) ? payload : event.received_at
}

function bounceReason(event: ResendEventRow) {
  const data = event.payload?.data && typeof event.payload.data === 'object' ? event.payload.data as Record<string, unknown> : {}
  const bounce = data.bounce && typeof data.bounce === 'object' ? data.bounce as Record<string, unknown> : {}
  const reason = bounce.message || bounce.subType || data.reason
  return typeof reason === 'string' ? reason.slice(0, 500) : null
}

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const bookingId = request.nextUrl.searchParams.get('bookingId') || ''
    const inquiryId = request.nextUrl.searchParams.get('inquiryId') || ''
    if (!/^[0-9a-f-]{36}$/i.test(bookingId) || !/^[0-9a-f-]{36}$/i.test(inquiryId)) {
      return NextResponse.json({ error: 'A valid booking and client are required.' }, { status: 400 })
    }
    const booking = await getLuxorBooking(bookingId)
    if (!booking || booking.inquiry_id !== inquiryId) return NextResponse.json({ error: 'This booking is not associated with the selected client.' }, { status: 404 })
    const [invoices, payments, candidates] = await Promise.all([
      listInvoicesByBooking(booking.id),
      supabaseRest<LuxorPayment[]>(`luxor_payments?select=id,booking_id,invoice_id,status&booking_id=eq.${encodeURIComponent(booking.id)}&status=eq.paid&limit=1000`),
      supabaseRest<LuxorEmailJob[]>(`luxor_email_jobs?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc&limit=1000`),
    ])
    const invoiceIds = new Set(invoices.map((invoice) => invoice.id))
    const reminders = paymentReminderJobsForEvent(candidates, booking.id, invoiceIds)
      .filter((job) => paymentReminderKinds.has(job.job_type))
    const paymentIds = new Set(payments.map((payment) => payment.id))
    const receiptJobs = candidates.filter((job) => {
      if (job.job_type !== 'transactional_notice') return false
      const notice = job.metadata?.transactionalNotice && typeof job.metadata.transactionalNotice === 'object'
        ? job.metadata.transactionalNotice as Record<string, unknown> : null
      return notice?.kind === 'payment_receipt' && typeof notice.key === 'string'
        && paymentIds.has(notice.key.slice('payment_receipt/'.length))
    })
    const eventJobs = [...new Map([...reminders, ...receiptJobs].map((job) => [job.id, job])).values()]
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    if (!eventJobs.length) return NextResponse.json({ jobs: [] }, { headers: { 'Cache-Control': 'private, no-store' } })

    const ids = eventJobs.map((job) => job.id)
    const mailRows = await supabaseRest<MailStatusRow[]>(
      `luxor_mail_messages?select=id,provider,provider_id,status,accepted_at,occurred_at,metadata&direction=eq.outgoing&metadata->>emailJobId=in.(${ids.map(encodeURIComponent).join(',')})&limit=1000`,
    )
    const mailByJob = new Map<string, MailStatusRow>()
    for (const row of mailRows) {
      const id = jobIdFromMail(row)
      if (id) mailByJob.set(id, row)
    }
    const providerIds = [...new Set(mailRows.map((row) => row.provider_id).filter((id): id is string => Boolean(id)))]
    const providerEvents = providerIds.length
      ? await supabaseRest<ResendEventRow[]>(`luxor_resend_events?select=event_type,provider_email_id,payload,received_at&provider_email_id=in.(${providerIds.map(encodeURIComponent).join(',')})&event_type=in.(email.delivered,email.opened,email.bounced,email.complained,email.delivery_delayed)&limit=2000`)
      : []
    const eventsByProvider = new Map<string, ResendEventRow[]>()
    for (const event of providerEvents) {
      if (!event.provider_email_id) continue
      eventsByProvider.set(event.provider_email_id, [...(eventsByProvider.get(event.provider_email_id) || []), event])
    }
    const jobs: PaymentHistoryJob[] = eventJobs.map((job) => {
      const mail = mailByJob.get(job.id)
      const events = mail?.provider_id ? eventsByProvider.get(mail.provider_id) || [] : []
      const delivered = events.filter((event) => event.event_type === 'email.delivered').sort((a, b) => Date.parse(eventTime(a)) - Date.parse(eventTime(b)))[0]
      const opened = events.filter((event) => event.event_type === 'email.opened').sort((a, b) => Date.parse(eventTime(a)) - Date.parse(eventTime(b)))[0]
      const failure = events.filter((event) => ['email.bounced', 'email.complained'].includes(event.event_type)).sort((a, b) => Date.parse(eventTime(a)) - Date.parse(eventTime(b)))[0]
      const providerAcceptedAt = mail?.accepted_at || (mail && ['sent', 'delivered', 'opened'].includes(mail.status) ? mail.occurred_at : null)
      const status: DeliveryStatus = failure ? 'failed' : opened ? 'opened' : delivered ? 'delivered'
        : job.status === 'sent' || providerAcceptedAt ? 'sent' : job.status === 'failed' ? 'failed' : job.status === 'cancelled' ? 'cancelled' : 'pending'
      const milestone = typeof job.metadata?.milestone === 'string' ? job.metadata.milestone : ''
      const dueDate = typeof job.metadata?.due_date === 'string' ? job.metadata.due_date : ''
      const retryAvailable = job.job_type === 'installment_payment_reminder' && job.status === 'failed'
        && job.metadata?.paymentReminderRetrySafe === true
        && Boolean(dueDate)
        && installmentReminderWindowIsCurrent(dueDate, luxorCalendarDate(new Date()), milestone, new Date())
      return {
        ...job,
        metadata: { ...job.metadata, retry_available: retryAvailable },
        delivery: {
          status,
          sentAt: job.sent_at || providerAcceptedAt,
          deliveredAt: delivered ? eventTime(delivered) : null,
          openedAt: opened ? eventTime(opened) : null,
          providerError: failure ? bounceReason(failure) : job.last_error,
          retryAvailable,
        },
      }
    })
    return NextResponse.json({ jobs }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment reminder history is unavailable.' }, { status: 503 })
  }
}
