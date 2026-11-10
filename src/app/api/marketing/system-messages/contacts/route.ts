import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'

export const dynamic = 'force-dynamic'
const PAGE_SIZE = 25
const TEXT_STATUSES = ['queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'cancelled', 'skipped'] as const
const EMAIL_STATUSES = ['queued', 'sending', 'sent', 'failed', 'cancelled'] as const
const SOURCES = {
  'system-inquiry-confirmation': { table: 'luxor_text_jobs', filter: 'job_type=eq.inquiry_confirmation&custom_workflow_step_run_id=is.null', permission: 'messages', statuses: TEXT_STATUSES },
  'system-payment-confirmation': { table: 'luxor_text_jobs', filter: 'job_type=eq.payment_confirmation&custom_workflow_step_run_id=is.null', permission: 'messages', statuses: TEXT_STATUSES },
  'system-event-reminder': { table: 'luxor_text_jobs', filter: 'job_type=eq.event_reminder&custom_workflow_step_run_id=is.null', permission: 'messages', statuses: TEXT_STATUSES },
  'system-tour-texts': { table: 'luxor_text_jobs', filter: 'job_type=in.(tour_confirmation,tour_reminder)&custom_workflow_step_run_id=is.null', permission: 'messages', statuses: TEXT_STATUSES },
  'system-invoice-reminders': { table: 'luxor_text_jobs', filter: 'job_type=in.(invoice_due_reminder,invoice_overdue_reminder)&custom_workflow_step_run_id=is.null&or=(automation_key.like.invoice_due:*,automation_key.like.invoice_overdue:*,automation_key.like.invoice_payment_request:*)', permission: 'messages', statuses: TEXT_STATUSES },
  'system-inquiry-email': { table: 'luxor_email_jobs', filter: 'job_type=eq.marketing_campaign&metadata->>source=eq.inquiry_acknowledgment&automation_enrollment_id=is.null&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-newsletter-email': { table: 'luxor_email_jobs', filter: 'job_type=eq.marketing_campaign&metadata->>source=eq.newsletter_confirmation&automation_enrollment_id=is.null&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-tour-request-email': { table: 'luxor_email_jobs', filter: 'job_type=eq.tour_confirmation&metadata->>source=eq.tour_request_received&tour_revision_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-tour-emails': { table: 'luxor_email_jobs', filter: 'job_type=in.(tour_confirmation,tour_reminder)&tour_revision_id=not.is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-tour-no-show-email': { table: 'luxor_email_jobs', filter: 'job_type=eq.tour_no_show_reschedule&metadata->>manual=eq.true&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-layout-review-email': { table: 'luxor_email_jobs', filter: 'job_type=eq.layout_review&metadata->>layout_review_id=not.is.null&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-planner-invitation': { table: 'luxor_email_jobs', filter: 'job_type=eq.layout_review&metadata->>kind=eq.planner_presentation_invitation&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-planner-verification': { table: 'luxor_email_jobs', filter: 'job_type=eq.layout_review&metadata->>kind=eq.planner_presentation_verification&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-zelle-instructions': { table: 'luxor_email_jobs', filter: 'job_type=eq.final_payment_request&metadata->>payment_method=eq.zelle&metadata->>automation_key=like.zelle-instructions:*&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-paid-invoice-email': { table: 'luxor_email_jobs', filter: 'job_type=eq.transactional_notice&metadata->transactionalNotice->>kind=eq.paid_invoice&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-payment-receipt': { table: 'luxor_email_jobs', filter: 'job_type=eq.transactional_notice&metadata->transactionalNotice->>kind=eq.payment_receipt&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-agreement-client': { table: 'luxor_email_jobs', filter: 'job_type=eq.transactional_notice&metadata->transactionalNotice->>kind=eq.agreement_client&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-agreement-owner': { table: 'luxor_email_jobs', filter: 'job_type=eq.transactional_notice&metadata->transactionalNotice->>kind=eq.agreement_owner&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-installment-emails': { table: 'luxor_email_jobs', filter: 'job_type=eq.installment_payment_reminder&metadata->>milestone=in.(installment_7_days_before,installment_1_day_overdue)&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-manual-invoice-reminder': { table: 'luxor_email_jobs', filter: 'job_type=in.(unpaid_invoice_reminder,final_payment_reminder)&metadata->>manual=eq.true&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-final-payment-emails': { table: 'luxor_email_jobs', filter: 'job_type=in.(final_payment_request,final_payment_reminder)&metadata->>milestone=in.(payment_request,14_days,7_days,due_date)&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-event-emails': { table: 'luxor_email_jobs', filter: 'job_type=in.(event_details_reminder,event_day_reminder,post_event_follow_up)&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-agreement-emails': { table: 'luxor_email_jobs', filter: 'job_type=in.(contract_view_reminder,contract_signature_reminder)&signature_request_id=not.is.null&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-agreement-package': { table: 'luxor_email_jobs', filter: 'job_type=eq.contract_signature&metadata->>agreement_delivery=eq.true&signature_request_id=not.is.null&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-offer-email': { table: 'luxor_email_jobs', filter: 'job_type=in.(proposal_view_reminder,proposal_payment_reminder)&metadata->>offer_reminder=eq.true&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
  'system-payment-request-email': { table: 'luxor_email_jobs', filter: 'job_type=eq.proposal_payment_reminder&metadata->>payment_request_reminder=eq.true&custom_workflow_step_run_id=is.null&test_run_id=is.null', permission: 'emails', statuses: EMAIL_STATUSES },
} as const
type Job = { id: string; inquiry_id: string; job_type: string; automation_key?: string | null; tour_notice?: string | null; calendar_method?: string | null; metadata?: Record<string, unknown> | null; status: string; created_at: string; scheduled_for: string | null; sent_at: string | null }
type PhoneEvent = { id: string; status: string; created_at: string; recipient_number: string; twilio_message_sid: string | null }
type PhoneMessage = { twilio_message_sid: string; inquiry_id: string | null; contact_name: string | null; status: string }
const PHONE_KINDS = { 'system-phone-missed_call': 'missed_call', 'system-phone-inbound_acknowledgment': 'inbound_acknowledgment' } as const

type OwnerAuditJob = { id: string; booking_id: string; inquiry_id: string | null; status: string; created_at: string; scheduled_for: string | null; sent_at: string | null }

async function plannerVerificationHistory(page: number) {
  const filter = 'job_type=eq.layout_review&metadata->>kind=eq.planner_presentation_verification&custom_workflow_step_run_id=is.null&test_run_id=is.null&booking_id=not.is.null'
  const base = `luxor_email_jobs?${filter}`
  const [jobs, counts] = await Promise.all([
    supabaseRestStrict<OwnerAuditJob[]>(`${base}&select=id,booking_id,inquiry_id,status,created_at,scheduled_for,sent_at&order=created_at.desc,id.desc&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`),
    Promise.all(EMAIL_STATUSES.map((status) => supabaseRestCount(`${base}&status=eq.${status}&select=id`))),
  ])
  const bookingIds = [...new Set(jobs.map((job) => job.booking_id))]
  const bookings = bookingIds.length
    ? await supabaseRestStrict<Array<{ id: string; inquiry_id: string | null; luxor_inquiries: { full_name: string | null; is_test: boolean } | null }>>(`luxor_bookings?select=id,inquiry_id,luxor_inquiries(full_name,is_test)&id=in.(${bookingIds.map(encodeURIComponent).join(',')})`)
    : []
  const contacts = jobs.flatMap((job) => {
    const booking = bookings.find((row) => row.id === job.booking_id)
    const inquiry = booking?.luxor_inquiries
    if (!booking?.inquiry_id || inquiry?.is_test) return []
    return [{ id: job.id, inquiry_id: booking.inquiry_id, name: inquiry?.full_name || null, status: job.status, deliveryStatus: null, stepName: 'Planner verification code', created_at: job.created_at, scheduled_for: job.scheduled_for, sent_at: job.sent_at }]
  })
  return { contacts, counts: Object.fromEntries(EMAIL_STATUSES.map((status, index) => [status, counts[index]])), page, pageSize: PAGE_SIZE }
}

const BREAKDOWN_STATUSES = ['prepared', 'sending', 'sent', 'delivery_unconfirmed'] as const

async function calendarMessageHistory(page: number) {
  const filter = 'job_type=eq.calendar_invitation&calendar_revision_id=not.is.null&or=(calendar_method.eq.CANCEL,and(calendar_method.eq.REQUEST,or(metadata->>delivery.is.null,metadata->>delivery.neq.branded_confirmation)))'
  const base = `luxor_email_jobs?${filter}`
  const join = 'luxor_inquiries!inner(is_test)'
  const [jobs, counts] = await Promise.all([
    supabaseRestStrict<Job[]>(`${base}&select=id,inquiry_id,job_type,calendar_method,metadata,status,created_at,scheduled_for,sent_at,${join}&luxor_inquiries.is_test=eq.false&order=created_at.desc,id.desc&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`),
    Promise.all(EMAIL_STATUSES.map((status) => supabaseRestCount(`${base}&status=eq.${status}&select=id,${join}&luxor_inquiries.is_test=eq.false`))),
  ])
  const ids = [...new Set(jobs.map((job) => job.inquiry_id))]
  const inquiries = ids.length ? await supabaseRestStrict<Array<{ id: string; full_name: string | null }>>(`luxor_inquiries?select=id,full_name&id=in.(${ids.map(encodeURIComponent).join(',')})`) : []
  const contacts = jobs.map((job) => ({
    ...job,
    stepName: job.calendar_method === 'CANCEL' ? 'Calendar cancellation' : 'Calendar update',
    name: inquiries.find((inquiry) => inquiry.id === job.inquiry_id)?.full_name || null,
  }))
  return { contacts, counts: Object.fromEntries(EMAIL_STATUSES.map((status, index) => [status, counts[index]])), page, pageSize: PAGE_SIZE }
}

async function proposalBreakdownHistory(page: number) {
  const base = 'luxor_proposal_breakdowns?inquiry_id=not.is.null'
  const join = 'luxor_inquiries!inner(is_test)'
  const [rows, counts] = await Promise.all([
    supabaseRestStrict<Array<{ id: string; inquiry_id: string; recipient_name: string; delivery_state: string; created_at: string; sent_at: string | null }>>(`${base}&select=id,inquiry_id,recipient_name,delivery_state,created_at,sent_at,${join}&luxor_inquiries.is_test=eq.false&order=created_at.desc,id.desc&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`),
    Promise.all(BREAKDOWN_STATUSES.map((status) => supabaseRestCount(`${base}&delivery_state=eq.${status}&select=id,${join}&luxor_inquiries.is_test=eq.false`))),
  ])
  const contacts = rows.map((row) => ({
    id: row.id,
    inquiry_id: row.inquiry_id,
    name: row.recipient_name || null,
    status: row.delivery_state,
    deliveryStatus: null,
    stepName: 'Package comparison email',
    created_at: row.created_at,
    scheduled_for: null,
    sent_at: row.sent_at,
  }))
  return { contacts, counts: Object.fromEntries(BREAKDOWN_STATUSES.map((status, index) => [status, counts[index]])), page, pageSize: PAGE_SIZE, direct: true }
}

async function ownerAuditHistory(page: number) {
  const filter = 'job_type=eq.transactional_notice&metadata->transactionalNotice->>kind=eq.agreement_owner&custom_workflow_step_run_id=is.null&test_run_id=is.null&booking_id=not.is.null'
  const base = `luxor_email_jobs?${filter}`
  const [jobs, counts] = await Promise.all([
    supabaseRestStrict<OwnerAuditJob[]>(`${base}&select=id,booking_id,inquiry_id,status,created_at,scheduled_for,sent_at&order=created_at.desc,id.desc&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`),
    Promise.all(EMAIL_STATUSES.map((status) => supabaseRestCount(`${base}&status=eq.${status}&select=id`))),
  ])
  const bookingIds = [...new Set(jobs.map((job) => job.booking_id))]
  const bookings = bookingIds.length
    ? await supabaseRestStrict<Array<{ id: string; inquiry_id: string | null; luxor_inquiries: { full_name: string | null; is_test: boolean } | null }>>(`luxor_bookings?select=id,inquiry_id,luxor_inquiries(full_name,is_test)&id=in.(${bookingIds.map(encodeURIComponent).join(',')})`)
    : []
  const contacts = jobs.flatMap((job) => {
    const booking = bookings.find((row) => row.id === job.booking_id)
    const inquiry = booking?.luxor_inquiries
    if (!booking?.inquiry_id || inquiry?.is_test) return []
    return [{ id: job.id, inquiry_id: booking.inquiry_id, name: inquiry?.full_name || null, status: job.status, deliveryStatus: null, stepName: 'Owner audit copy', created_at: job.created_at, scheduled_for: job.scheduled_for, sent_at: job.sent_at }]
  })
  return { contacts, counts: Object.fromEntries(EMAIL_STATUSES.map((status, index) => [status, counts[index]])), page, pageSize: PAGE_SIZE }
}

async function phoneHistory(key: keyof typeof PHONE_KINDS, page: number) {
  const base = `luxor_text_automation_events?automation_type=eq.${PHONE_KINDS[key]}`
  const statuses = ['pending', 'sent', 'skipped', 'failed'] as const
  const [events, counts] = await Promise.all([
    supabaseRestStrict<PhoneEvent[]>(`${base}&select=id,status,created_at,recipient_number,twilio_message_sid&order=created_at.desc,id.desc&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`),
    Promise.all(statuses.map((status) => supabaseRestCount(`${base}&status=eq.${status}&select=id`))),
  ])
  const sids = [...new Set(events.map((event) => event.twilio_message_sid).filter((sid): sid is string => Boolean(sid && /^SM[0-9a-f]{32}$/i.test(sid))))]
  const messages = sids.length ? await supabaseRestStrict<PhoneMessage[]>(`luxor_messages?select=twilio_message_sid,inquiry_id,contact_name,status&direction=eq.outbound&owner_email=eq.luxor-automation&twilio_message_sid=in.(${sids.join(',')})`) : []
  const contacts = events.map((event) => {
    const message = messages.find((item) => item.twilio_message_sid === event.twilio_message_sid)
    return { id: event.id, inquiry_id: message?.inquiry_id || null, name: message?.inquiry_id ? message.contact_name || event.recipient_number : event.recipient_number, status: event.status, deliveryStatus: message?.status || null, stepName: key === 'system-phone-missed_call' ? 'Missed-call reply' : 'Incoming-text acknowledgment', created_at: event.created_at, scheduled_for: null, sent_at: null }
  })
  return { contacts, counts: Object.fromEntries(statuses.map((status, index) => [status, counts[index]])), page, pageSize: PAGE_SIZE, direct: true }
}

function stepName(job: Job, workflow: string) {
  if (workflow === 'system-newsletter-email') return 'Newsletter confirmation'
  if (workflow === 'system-tour-request-email') return 'Tour request receipt'
  if (workflow === 'system-tour-no-show-email') return 'Reschedule email'
  if (workflow === 'system-layout-review-email') return 'Layout review invitation'
  if (workflow === 'system-planner-invitation') return 'Planner presentation invitation'
  if (workflow === 'system-planner-verification') return 'Planner verification code'
  if (workflow === 'system-zelle-instructions') return 'Zelle payment instructions'
  if (workflow === 'system-paid-invoice-email') return 'Paid-invoice confirmation'
  if (workflow === 'system-payment-receipt') return 'Payment receipt'
  if (workflow === 'system-agreement-client') return 'Executed agreement email'
  if (workflow === 'system-agreement-owner') return 'Owner audit copy'
  if (workflow === 'system-installment-emails') return job.metadata?.milestone === 'installment_7_days_before' ? 'Seven days before due' : 'One day overdue'
  if (workflow === 'system-manual-invoice-reminder') return job.job_type === 'final_payment_reminder' ? 'Final balance reminder' : 'Deposit or security reminder'
  if (workflow === 'system-final-payment-emails') return ({ payment_request: 'Initial payment request window', '14_days': 'Two-week reminder window', '7_days': 'One-week reminder window', due_date: 'Due-date follow-up window' } as Record<string, string>)[String(job.metadata?.milestone)] || 'Final payment reminder'
  if (workflow === 'system-event-emails') return ({ event_details_reminder: 'Final event details', event_day_reminder: 'Event reminder', post_event_follow_up: 'Post-event thank you' } as Record<string, string>)[job.job_type] || 'Event email'
  if (workflow === 'system-agreement-emails') return job.job_type === 'contract_view_reminder' ? 'Agreement review reminder' : 'Agreement signature reminder'
  if (workflow === 'system-agreement-package') return 'Event Agreement package'
  if (workflow === 'system-offer-email') return 'Proposal offer reminder'
  if (workflow === 'system-payment-request-email') return 'Payment request reminder'
  if (job.tour_notice === 'confirmation') return 'Confirmation and invitation'
  if (job.tour_notice === 'reminder_24') return '24-hour reminder'
  if (job.tour_notice === 'reminder_2') return '2-hour reminder'
  if (job.automation_key?.startsWith('invoice_payment_request:')) return 'Payment request follow-up'
  if (job.job_type === 'event_reminder' && /:7d:/.test(job.automation_key || '')) return '7-day event reminder'
  if (job.job_type === 'event_reminder' && /:1d:/.test(job.automation_key || '')) return '1-day event reminder'
  const names: Record<string, string> = { inquiry_confirmation: 'Inquiry confirmation', marketing_campaign: 'Inquiry acknowledgment', payment_confirmation: 'Payment confirmation', event_reminder: 'Event reminder', tour_confirmation: 'Tour confirmation', tour_reminder: 'Tour reminder', invoice_due_reminder: 'Due reminder', invoice_overdue_reminder: 'Overdue reminder' }
  return names[job.job_type] || 'Message'
}

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) throw new CustomWorkflowServiceError('Portal login required.', 401)
    await requireCustomWorkflowOperator(session.email)
    const key = request.nextUrl.searchParams.get('workflow') || ''
    const isPhone = Object.hasOwn(PHONE_KINDS, key)
  const isBreakdown = key === 'system-proposal-breakdown'
    const isCalendarMessages = key === 'system-calendar-messages'
    if (!isPhone && !isBreakdown && !isCalendarMessages && !Object.hasOwn(SOURCES, key)) return NextResponse.json({ error: 'Unknown workflow.' }, { status: 400 })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'leads') || (isPhone ? !memberCan(member, 'messages') || !memberCan(member, 'calls') : isBreakdown ? !memberCan(member, 'emails') : isCalendarMessages ? !memberCan(member, 'emails') : !memberCan(member, SOURCES[key as keyof typeof SOURCES].permission)) || (['system-tour-emails', 'system-tour-no-show-email', 'system-event-emails', 'system-calendar-messages'].includes(key) && !memberCan(member, 'calendar')) || (['system-installment-emails', 'system-final-payment-emails', 'system-manual-invoice-reminder', 'system-offer-email', 'system-payment-request-email', 'system-zelle-instructions', 'system-paid-invoice-email', 'system-payment-receipt', 'system-agreement-client', 'system-agreement-owner', 'system-agreement-package'].includes(key) && !memberCan(member, 'finances')) || (['system-agreement-emails', 'system-agreement-package', 'system-offer-email', 'system-payment-request-email', 'system-layout-review-email', 'system-planner-invitation', 'system-planner-verification', 'system-agreement-client', 'system-agreement-owner', 'system-proposal-breakdown'].includes(key) && !memberCan(member, 'planner')) || (['system-planner-invitation', 'system-planner-verification', 'system-agreement-owner'].includes(key) && member.role !== 'owner')) throw new CustomWorkflowServiceError('Lead and message access are required.', 403)
    const rawPage = request.nextUrl.searchParams.get('page') || '1'
    if (!/^[1-9]\d{0,5}$/.test(rawPage)) return NextResponse.json({ error: 'Invalid page.' }, { status: 400 })
    const page = Number(rawPage)
    if (isPhone) return NextResponse.json(await phoneHistory(key as keyof typeof PHONE_KINDS, page), { headers: { 'Cache-Control': 'no-store' } })
    if (key === 'system-calendar-messages') return NextResponse.json(await calendarMessageHistory(page), { headers: { 'Cache-Control': 'no-store' } })
    if (key === 'system-proposal-breakdown') return NextResponse.json(await proposalBreakdownHistory(page), { headers: { 'Cache-Control': 'no-store' } })
    if (key === 'system-agreement-owner') return NextResponse.json(await ownerAuditHistory(page), { headers: { 'Cache-Control': 'no-store' } })
    if (key === 'system-planner-verification') return NextResponse.json(await plannerVerificationHistory(page), { headers: { 'Cache-Control': 'no-store' } })
    const source = SOURCES[key as keyof typeof SOURCES]
    const base = `${source.table}?${source.filter}&inquiry_id=not.is.null&luxor_inquiries.is_test=eq.false`
    const join = 'luxor_inquiries!inner(is_test)'
    const [jobs, counts] = await Promise.all([
      supabaseRestStrict<Job[]>(`${base}&select=id,inquiry_id,job_type,${source.table === 'luxor_text_jobs' ? 'automation_key' : ['system-installment-emails', 'system-final-payment-emails', 'system-manual-invoice-reminder'].includes(key) ? 'metadata' : 'tour_notice'},status,created_at,scheduled_for,sent_at,${join}&order=created_at.desc,id.desc&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`),
      Promise.all(source.statuses.map((status) => supabaseRestCount(`${base}&status=eq.${status}&select=id,${join}`))),
    ])
    const ids = [...new Set(jobs.map((job) => job.inquiry_id))]
    const inquiries = ids.length ? await supabaseRestStrict<Array<{ id: string; full_name: string | null }>>(`luxor_inquiries?select=id,full_name&id=in.(${ids.map(encodeURIComponent).join(',')})`) : []
    const contacts = jobs.map((job) => ({ ...job, stepName: stepName(job, key), name: inquiries.find((inquiry) => inquiry.id === job.inquiry_id)?.full_name || null }))
    return NextResponse.json({ contacts, counts: Object.fromEntries(source.statuses.map((status, index) => [status, counts[index]])), page, pageSize: PAGE_SIZE }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof CustomWorkflowServiceError ? error.message : 'Message history could not load.' }, { status: error instanceof CustomWorkflowServiceError ? error.status : 500 })
  }
}
