import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { listLuxorEmailJobsForInquiry, processLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorEmailJob } from '@/lib/luxorInquiryTypes'
import { listInvoicesByInquiry } from '@/lib/luxorInvoicesServer'
import { isLuxorOfferExpired } from '@/lib/luxorOffer'
import { rankCorrectEmailResendOptions, getRecipientBounceEvidence, isLeadEmailResendStage, type CorrectEmailResendOption, type EmailDeliveryEvidence } from '@/lib/luxorLeadEmailResend'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorBooking, getLuxorBookingByInvoice } from '@/lib/luxorBookingsServer'
import { listPaidPaymentsByInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorPaymentReminderBookingLookup, getLuxorPaymentReminderDueDate } from '@/lib/luxorPaymentReminderDueDate'

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RESENDABLE_TYPES = new Set(['booking_package', 'post_event_follow_up', 'layout_review'])

type MailRow = EmailDeliveryEvidence

function canCorrectAndResend(inquiry: { status: string; pipeline_stage?: string | null; is_test?: boolean }) {
  return !inquiry.is_test && inquiry.status !== 'closed_lost' && inquiry.pipeline_stage !== 'closed_lost'
}

function filterForLeadStage(options: CorrectEmailResendOption[], inquiry: { status: string; pipeline_stage?: string | null }) {
  const preProposal = ['new', 'contacted', 'tour_requested', 'tour_confirmed'].includes(inquiry.status)
    && ['newsletter', 'inquiry', 'tour'].includes(inquiry.pipeline_stage ?? 'inquiry')
  if (preProposal) return options.filter((option) => option.sourceKind !== 'Event follow-up'
    && option.resendKind !== 'proposal' && option.resendKind !== 'agreement')
  const postEvent = inquiry.status === 'booked' && ['event', 'closing'].includes(inquiry.pipeline_stage || '')
  const planning = inquiry.status === 'booked' && ['planning', 'event'].includes(inquiry.pipeline_stage || '')
  const contract = inquiry.pipeline_stage === 'contract'
    && ['proposal_sent', 'booked'].includes(inquiry.status)
  const activeAgreement = ['contract', 'deposit'].includes(inquiry.pipeline_stage || '')
    && ['proposal_sent', 'booked'].includes(inquiry.status)
  const payment = inquiry.status === 'booked' && ['deposit', 'final_payment', 'planning', 'event', 'closing'].includes(inquiry.pipeline_stage || '')
  return options.filter((option) => (postEvent && option.sourceKind === 'Event follow-up')
    || (planning && option.sourceKind === 'Layout review')
    || (contract && option.resendKind === 'proposal')
    || (payment && option.resendKind === 'payment')
    || (activeAgreement && option.resendKind === 'agreement'))
}

async function loadDedicatedFlowOptions(inquiryId: string, email: string, jobs: LuxorEmailJob[]): Promise<CorrectEmailResendOption[]> {
  const invoices = await listInvoicesByInquiry(inquiryId).catch(() => [])
  const sentProposalOptions = await Promise.all(invoices.filter((invoice) => {
    const context = invoice.proposal_context as Record<string, unknown> | null | undefined
    const snapshot = context?.delivery_snapshot as Record<string, unknown> | undefined
    const emailSnapshot = snapshot?.proposal_email as Record<string, unknown> | undefined
    return invoice.inquiry_id === inquiryId && invoice.invoice_kind === 'event' && invoice.status === 'sent'
      && Boolean(invoice.price_locked_at) && !invoice.proposal_accepted_at && !invoice.booking_id && !invoice.paid_at
      && invoice.proposal_version === 1 && !isLuxorOfferExpired(invoice)
      && invoice.offer_status !== 'withdrawn' && invoice.offer_status !== 'expired'
      && !invoices.some((later) => later.supersedes_invoice_id === invoice.id && !['cancelled'].includes(later.status))
      && typeof emailSnapshot?.html === 'string' && typeof emailSnapshot.subject === 'string'
      && Boolean(emailSnapshot.recipient_email)
      && String(emailSnapshot.recipient_email).trim().toLowerCase() !== email
  }).map(async (invoice) => {
    const context = invoice.proposal_context as Record<string, unknown>
    const snapshot = context.delivery_snapshot as Record<string, unknown>
    const emailSnapshot = snapshot.proposal_email as Record<string, unknown>
    const providerMessageId = typeof emailSnapshot.provider_message_id === 'string' ? emailSnapshot.provider_message_id : ''
    if (!providerMessageId) return null
    const mailRows = await supabaseRest<MailRow[]>(
      `luxor_mail_messages?select=id,status,occurred_at,accepted_at,to_addresses&provider_id=eq.${encodeURIComponent(providerMessageId)}&direction=eq.outgoing&limit=5`,
    ).catch(() => [])
    const originalRecipient = String(emailSnapshot.recipient_email).trim().toLowerCase()
    const deliveryEvidence = getRecipientBounceEvidence(mailRows, originalRecipient)
    const successfulCorrection = await supabaseRest<MailRow[]>(
      `luxor_mail_messages?select=id,status,occurred_at,accepted_at,to_addresses&provider=resend&direction=eq.outgoing&metadata->>invoiceId=eq.${encodeURIComponent(invoice.id)}&order=occurred_at.desc&limit=50`,
    ).catch(() => [])
    if (successfulCorrection.some((row) => row.to_addresses?.some((address) => address.trim().toLowerCase() === email)
      && (Boolean(row.accepted_at) || ['delivered', 'opened', 'clicked'].includes(row.status)))) return null
    return {
      id: invoice.id,
      recipientEmail: String(emailSnapshot.recipient_email),
      subject: String(emailSnapshot.subject),
      body: String(emailSnapshot.html),
      sentAt: invoice.proposal_latest_sent_at || invoice.proposal_sent_at || invoice.created_at,
      bounced: deliveryEvidence.bounced,
      bounceAt: deliveryEvidence.bounceAt,
      sourceKind: `Proposal v${invoice.proposal_version || 1} (frozen PDF attached)`,
      resendKind: 'proposal' as const,
      canSend: true,
    }
  }))

  const agreementOptions = await Promise.all(jobs.filter((job) => job.job_type === 'contract_signature'
    && job.metadata?.agreement_delivery === true && ['sent', 'failed', 'cancelled'].includes(job.status) && job.signature_request_id)
    .map(async (job) => {
      const signatures = await supabaseRest<Array<{ id: string; status: string; client_email: string; contract_title: string }>>(
        `luxor_signature_requests?select=id,status,client_email,contract_title&id=eq.${encodeURIComponent(job.signature_request_id!)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1`,
      ).catch(() => [])
      const signature = signatures[0]
      if (!signature) return null
      const signerMatches = signature.client_email.trim().toLowerCase() === email
      const signed = signature.status === 'signed'
      return {
        id: job.id,
        invoiceId: typeof job.metadata?.invoice_id === 'string' ? job.metadata.invoice_id : undefined,
        recipientEmail: signature.client_email,
        subject: job.subject,
        body: signed ? 'This agreement is signed and cannot be resent.'
          : signerMatches ? 'The agreement resend will use the existing signer and signature record. No signer details will change.'
            : `Blocked: the saved signer is ${signature.client_email}. Correcting the inquiry email will not change the agreement signer.`,
        sentAt: job.sent_at,
        bounced: false,
        bounceAt: null,
        sourceKind: `Event Agreement · ${signature.contract_title}`,
        resendKind: 'agreement' as const,
        canSend: !signed && signerMatches,
        unavailableLabel: signed ? 'Already signed' : signerMatches ? undefined : 'Signer mismatch',
      }
    }))
  return [...sentProposalOptions.filter((option): option is NonNullable<typeof option> => Boolean(option)),
    ...agreementOptions.filter((option): option is NonNullable<typeof option> => Boolean(option)),
    ...await loadPaymentOptions(inquiryId, email, jobs)]
}

async function loadPaymentOptions(inquiryId: string, email: string, jobs: LuxorEmailJob[]): Promise<CorrectEmailResendOption[]> {
  const paymentJobs = jobs.filter((job) => ['unpaid_invoice_reminder', 'final_payment_reminder', 'final_payment_request'].includes(job.job_type)
    && job.status === 'sent' && job.sent_at && job.booking_id && job.recipient_email.trim().toLowerCase() !== email)
  const invoices = await listInvoicesByInquiry(inquiryId).catch(() => [])
  const options = await Promise.all(paymentJobs.map(async (job) => {
    const booking = await getLuxorBooking(job.booking_id!).catch(() => null)
    const candidates = invoices.filter((candidate) => candidate.booking_id === job.booking_id
      && (typeof job.metadata?.invoice_id !== 'string' || job.metadata.invoice_id === candidate.id)
      && ['deposit', 'final_balance', 'security_deposit'].includes(candidate.invoice_kind || '')
      && (!['final_payment_reminder', 'final_payment_request'].includes(job.job_type) || candidate.invoice_kind === 'final_balance')
      && (job.job_type !== 'unpaid_invoice_reminder' || candidate.invoice_kind !== 'final_balance'))
    const invoice = candidates.length === 1 ? candidates[0] : null
    if (!invoice || invoice.status === 'cancelled' || !booking || booking.contract_status !== 'signed'
      || !getLuxorPaymentReminderDueDate({ invoice_kind: invoice.invoice_kind, due_date: invoice.due_date, final_payment_due_date: booking.final_payment_due_date })) return null
    const paid = await listPaidPaymentsByInvoice(invoice.id).catch(() => [])
    if (Math.max(0, Math.round((Number(invoice.total) - paid.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)) * 100) / 100) <= 0) return null
    const deliveryRows = await supabaseRest<MailRow[]>(
      `luxor_mail_messages?select=id,status,occurred_at,accepted_at,to_addresses&direction=eq.outgoing&metadata->>emailJobId=eq.${encodeURIComponent(job.id)}&order=occurred_at.desc&limit=50`,
    ).catch(() => [])
    const bounce = getRecipientBounceEvidence(deliveryRows, job.recipient_email)
    const alreadySentCorrected = jobs.some((candidate) => candidate.metadata?.corrected_payment_resend_invoice_id === invoice.id
      && ['queued', 'sending', 'sent'].includes(candidate.status) && candidate.recipient_email.trim().toLowerCase() === email)
    if (alreadySentCorrected) return null
    return {
      id: job.id, invoiceId: invoice.id, recipientEmail: email, subject: job.subject,
      body: 'A fresh secure payment link will be generated for the current balance and shown to the recipient. The invoice amount and payment history will stay unchanged.',
      sentAt: job.sent_at, bounced: bounce.bounced, bounceAt: bounce.bounceAt, sourceKind: 'Payment reminder',
      resendKind: 'payment' as const, canSend: true,
    }
  }))
  return options.filter((option): option is NonNullable<typeof option> => Boolean(option))
}

async function loadEligibleSnapshots(inquiryId: string, email: string) {
  const jobs = await listLuxorEmailJobsForInquiry(inquiryId, 200)
  const eligible = jobs.filter((job) => RESENDABLE_TYPES.has(job.job_type)
    && job.status === 'sent' && Boolean(job.sent_at)
    && job.inquiry_id === inquiryId
    && !job.metadata?.corrected_email_resend_request_id
    && !job.automation_enrollment_id && !job.automation_step_key
    && (job.job_type !== 'post_event_follow_up' || Boolean(job.booking_id))
    && !job.signature_request_id && !job.calendar_revision_id && !job.tour_revision_id
    && job.metadata?.hasAttachments !== true
    && job.recipient_email.trim().toLowerCase() !== email.trim().toLowerCase())
  const rows = await Promise.all(eligible.map(async (job) => {
    if (job.job_type === 'layout_review') {
      const reviewId = typeof job.metadata?.layout_review_id === 'string' ? job.metadata.layout_review_id : ''
      if (!UUID_RE.test(reviewId)) return null
      const reviews = await supabaseRest<Array<{ id: string; status: string; expires_at: string; revoked_at: string | null }>>(
        `luxor_layout_reviews?select=id,status,expires_at,revoked_at&id=eq.${encodeURIComponent(reviewId)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1`,
      ).catch(() => [])
      if (!reviews[0] || reviews[0].status !== 'open' || reviews[0].revoked_at || Date.parse(reviews[0].expires_at) <= Date.now()) return null
    }
    const mailRows = await supabaseRest<MailRow[]>(
      `luxor_mail_messages?select=id,status,occurred_at,accepted_at,to_addresses&direction=eq.outgoing&metadata->>emailJobId=eq.${encodeURIComponent(job.id)}&order=occurred_at.desc&limit=50`,
    ).catch(() => [])
    const deliveryEvidence = getRecipientBounceEvidence(mailRows, job.recipient_email)
    const correctedCopies = jobs.filter((later) => later.metadata?.corrected_email_resend_source_id === job.id
      && later.status === 'sent' && later.sent_at
      && later.recipient_email.trim().toLowerCase() === email.trim().toLowerCase())
    const hasSuccessfulCorrection = (await Promise.all(correctedCopies.map(async (copy) => {
      const copyMail = await supabaseRest<MailRow[]>(
        `luxor_mail_messages?select=id,status,occurred_at,accepted_at&provider=resend&direction=eq.outgoing&metadata->>emailJobId=eq.${encodeURIComponent(copy.id)}&order=occurred_at.desc&limit=1`,
      ).catch(() => [])
      return Boolean(copy.sent_at) || ['delivered', 'opened', 'clicked'].includes(copyMail[0]?.status || '')
    }))).some(Boolean)
    if (hasSuccessfulCorrection) return null
    return {
      id: job.id,
      recipientEmail: job.recipient_email,
      subject: job.subject,
      body: job.body,
      sentAt: job.sent_at,
      bounced: deliveryEvidence.bounced,
      bounceAt: deliveryEvidence.bounceAt,
      sourceKind: job.job_type === 'booking_package' ? 'Venue brochure' : job.job_type === 'layout_review' ? 'Layout review' : 'Event follow-up',
      resendKind: 'snapshot' as const,
      canSend: true,
    }
  }))
  return rows.filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => Number(b.bounced) - Number(a.bounced)
      || Date.parse(b.bounceAt || b.sentAt || '') - Date.parse(a.bounceAt || a.sentAt || ''))
}

async function loadPreparedTourResends(jobs: LuxorEmailJob[], email: string): Promise<CorrectEmailResendOption[]> {
  const eligible = jobs.filter((job) => job.metadata?.prepared_tour_email_resend === true
      && job.recipient_email.trim().toLowerCase() === email.trim().toLowerCase()
      && !job.metadata?.superseded_at && !job.metadata?.superseded_by_request_id
      && (job.status === 'failed' || job.status === 'queued' || job.status === 'sending'
        || (job.status === 'cancelled' && job.metadata?.awaiting_owner_confirmation === true)))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 1)
  return Promise.all(eligible.map(async (job) => {
    const sourceJobId = typeof job.metadata?.source_job_id === 'string' ? job.metadata.source_job_id : ''
    const sourceMail = UUID_RE.test(sourceJobId) ? await supabaseRest<MailRow[]>(
      `luxor_mail_messages?select=id,status,occurred_at,accepted_at,to_addresses&direction=eq.outgoing&metadata->>emailJobId=eq.${encodeURIComponent(sourceJobId)}&order=occurred_at.desc&limit=50`,
    ).catch(() => []) : []
    const bounce = getRecipientBounceEvidence(sourceMail, job.recipient_email)
    return {
      id: job.id,
      recipientEmail: job.recipient_email,
      subject: job.subject,
      body: job.body,
      sentAt: job.sent_at,
      bounced: bounce.bounced,
      bounceAt: bounce.bounceAt,
      sourceKind: 'Tour confirmation',
      resendKind: 'tour',
      canSend: job.status === 'failed' || (job.status === 'cancelled' && job.metadata?.awaiting_owner_confirmation === true),
      unavailableLabel: job.status === 'queued' ? 'Queued' : job.status === 'sending' ? 'Sending' : undefined,
    }
  }))
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    const member = await getLuxorPortalMember(session.email)
    if (!memberCan(member, 'leads')) return NextResponse.json({ error: 'Lead permission is required.' }, { status: 403 })
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Lead ID is invalid.' }, { status: 400 })
    const inquiry = await getLuxorInquiry(id)
    if (!inquiry) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    if (!canCorrectAndResend(inquiry) || !isLeadEmailResendStage(inquiry)) return NextResponse.json({ options: [], unavailableReason: 'This lead has moved beyond the eligible email-resend stage.' })
    const email = inquiry.email?.trim().toLowerCase() || ''
    if (!EMAIL_RE.test(email)) return NextResponse.json({ options: [], unavailableReason: 'Save a valid email address before resending.' })
    const jobs = await listLuxorEmailJobsForInquiry(id, 200)
    const [snapshotOptions, tourOptions, dedicatedOptions] = await Promise.all([
      loadEligibleSnapshots(id, email), loadPreparedTourResends(jobs, email), loadDedicatedFlowOptions(id, email, jobs),
    ])
    const options = rankCorrectEmailResendOptions(filterForLeadStage([...snapshotOptions, ...tourOptions, ...dedicatedOptions]
      .filter((option) => memberCan(member, 'finances') || option.resendKind !== 'payment'), inquiry))
    return NextResponse.json({ options, suggestedId: options[0]?.id || null, currentEmail: email })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load email resend options.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    const member = await getLuxorPortalMember(session.email)
    if (!memberCan(member, 'leads')) return NextResponse.json({ error: 'Lead permission is required.' }, { status: 403 })
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Lead ID is invalid.' }, { status: 400 })
    const payload = await request.json().catch(() => ({})) as { sourceJobId?: unknown; requestId?: unknown; expectedRecipient?: unknown }
    const sourceJobId = typeof payload.sourceJobId === 'string' ? payload.sourceJobId : ''
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
    if (!UUID_RE.test(sourceJobId) || !/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) {
      return NextResponse.json({ error: 'Choose an eligible email and retry.' }, { status: 400 })
    }
    const inquiry = await getLuxorInquiry(id)
    if (!inquiry) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    if (!canCorrectAndResend(inquiry) || !isLeadEmailResendStage(inquiry)) return NextResponse.json({ error: 'This lead has moved beyond the eligible email-resend stage.' }, { status: 409 })
    const email = inquiry.email?.trim().toLowerCase() || ''
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Save a valid corrected email before resending.' }, { status: 409 })
    if (typeof payload.expectedRecipient !== 'string' || payload.expectedRecipient.trim().toLowerCase() !== email) {
      return NextResponse.json({ error: 'The lead email changed after this message was reviewed. Refresh and review it again.' }, { status: 409 })
    }
    const jobs = await listLuxorEmailJobsForInquiry(id, 200)
    const dedicatedOption = filterForLeadStage(await loadDedicatedFlowOptions(id, email, jobs), inquiry)
      .find((option) => option.id === sourceJobId)
    if (dedicatedOption?.resendKind === 'proposal') {
      const response = await fetch(`${new URL(request.url).origin}/api/invoices/${encodeURIComponent(sourceJobId)}/approved-proposal-resend`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', cookie: request.headers.get('cookie') || '' },
        body: JSON.stringify({ expectedRecipient: email }),
      })
      const result = await response.json().catch(() => ({}))
      return NextResponse.json(result, { status: response.status })
    }
    if (dedicatedOption?.resendKind === 'payment') {
      if (!memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance permission is required to send payment links.' }, { status: 403 })
      const invoiceId = dedicatedOption.invoiceId
      if (!invoiceId) return NextResponse.json({ error: 'The payment invoice could not be verified.' }, { status: 409 })
      const invoice = await listInvoicesByInquiry(id).then((rows) => rows.find((row) => row.id === invoiceId))
      const bookingLookup = invoice && getLuxorPaymentReminderBookingLookup(invoice)
      const booking = bookingLookup && 'bookingId' in bookingLookup ? await getLuxorBooking(bookingLookup.bookingId)
        : bookingLookup && 'invoiceId' in bookingLookup ? await getLuxorBookingByInvoice(bookingLookup.invoiceId) : null
      if (!invoice || !booking || booking.contract_status !== 'signed'
        || !getLuxorPaymentReminderDueDate({ invoice_kind: invoice.invoice_kind, due_date: invoice.due_date, final_payment_due_date: booking.final_payment_due_date })) {
        return NextResponse.json({ error: 'The signed booking or payment schedule changed. Refresh before sending.' }, { status: 409 })
      }
      const source = jobs.find((job) => job.id === sourceJobId && job.booking_id === booking.id && job.status === 'sent'
        && job.recipient_email.trim().toLowerCase() !== email
        && ['unpaid_invoice_reminder', 'final_payment_reminder', 'final_payment_request'].includes(job.job_type)
        && (!['final_payment_reminder', 'final_payment_request'].includes(job.job_type) || invoice.invoice_kind === 'final_balance')
        && (job.job_type !== 'unpaid_invoice_reminder' || invoice.invoice_kind !== 'final_balance'))
      if (!source) return NextResponse.json({ error: 'The selected payment reminder is no longer eligible.' }, { status: 409 })
      const response = await fetch(`${new URL(request.url).origin}/api/invoices/${encodeURIComponent(invoiceId)}/remind`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', cookie: request.headers.get('cookie') || '' },
        body: JSON.stringify({ kind: source.job_type === 'final_payment_reminder' ? 'final_payment' : 'unpaid_invoice', correctedEmailResend: true, expectedRecipient: email, sourceJobId: source.id }),
      })
      const result = await response.json().catch(() => ({}))
      return NextResponse.json(result, { status: response.status })
    }
    if (dedicatedOption?.resendKind === 'agreement') {
      if (!dedicatedOption.invoiceId) return NextResponse.json({ error: 'The saved agreement is missing its accepted proposal link.' }, { status: 409 })
      if (!dedicatedOption.canSend) return NextResponse.json({ error: dedicatedOption.body }, { status: 409 })
      const response = await fetch(`${new URL(request.url).origin}/api/leads/${encodeURIComponent(id)}/send-agreement`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', cookie: request.headers.get('cookie') || '' },
        body: JSON.stringify({ resend: true, invoiceId: dedicatedOption.invoiceId }),
      })
      const result = await response.json().catch(() => ({}))
      return NextResponse.json(result, { status: response.status })
    }
    const tourOption = (await loadPreparedTourResends(jobs, email)).find((option) => option.id === sourceJobId)
    if (tourOption && filterForLeadStage([tourOption], inquiry).length) {
      const result = await supabaseRest<LuxorEmailJob | LuxorEmailJob[]>('rpc/luxor_confirm_prepared_tour_email_resend', {
        method: 'POST', body: JSON.stringify({ p_inquiry_id: id, p_job_id: sourceJobId }),
      })
      const job = Array.isArray(result) ? result[0] : result
      if (job?.status === 'queued') await processLuxorEmailJobs([job]).catch(() => undefined)
      const latest = (await listLuxorEmailJobsForInquiry(id, 200)).find((candidate) => candidate.id === sourceJobId) || job
      return NextResponse.json({ job: latest, replayed: true, delivery: latest.status }, { status: 202 })
    }
    const options = filterForLeadStage(await loadEligibleSnapshots(id, email), inquiry)
    const selected = options.find((option) => option.id === sourceJobId)
    if (!selected) {
      return NextResponse.json({ error: 'The selected message is no longer eligible. Refresh and review the current suggestion.' }, { status: 409 })
    }
    const result = await supabaseRest<{ job: LuxorEmailJob; replayed: boolean }>('rpc/luxor_prepare_corrected_email_resend', {
      method: 'POST',
      body: JSON.stringify({ p_inquiry_id: id, p_source_job_id: sourceJobId, p_expected_recipient: selected.recipientEmail, p_request_id: requestId }),
    })
    const job = result.job
    if (!job) return NextResponse.json({ error: 'The resend could not be prepared.' }, { status: 409 })
    // A duplicate click, another tab, or a lost response returns the existing
    // job. Only its first queued state is processed; sent/sending jobs never
    // trigger a second provider call.
    if (job.status === 'queued' && !result.replayed) await processLuxorEmailJobs([job]).catch((error) => {
      console.error('Corrected lead email remains in the durable queue:', error instanceof Error ? error.message : 'Unknown error.')
    })
    const latest = (await listLuxorEmailJobsForInquiry(id, 200)).find((candidate) => candidate.id === job.id) || job
    if (latest.status === 'failed') {
      return NextResponse.json({
        job: latest,
        error: latest.last_error || 'Delivery failed or is unresolved. This same saved message will not be sent again automatically.',
      }, { status: 409 })
    }
    return NextResponse.json({ job: latest, replayed: result.replayed, delivery: latest.status }, { status: 202 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The resend could not be queued.'
    return NextResponse.json({ error: message }, { status: message.includes('changed') ? 409 : 500 })
  }
}
