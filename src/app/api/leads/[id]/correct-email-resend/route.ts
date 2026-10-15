import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { listLuxorEmailJobsForInquiry, processLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorEmailJob } from '@/lib/luxorInquiryTypes'
import { listInvoicesByInquiry } from '@/lib/luxorInvoicesServer'
import { isLuxorOfferExpired } from '@/lib/luxorOffer'
import { rankCorrectEmailResendOptions, type CorrectEmailResendOption } from '@/lib/luxorLeadEmailResend'

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RESENDABLE_TYPES = new Set(['booking_package', 'post_event_follow_up', 'layout_review'])

type MailRow = { id: string; status: string; occurred_at: string; accepted_at: string | null; to_addresses?: string[] }

function canCorrectAndResend(inquiry: { status: string; pipeline_stage?: string | null; is_test?: boolean }) {
  return !inquiry.is_test && inquiry.status !== 'closed_lost' && inquiry.pipeline_stage !== 'closed_lost'
}

function filterForLeadStage(options: CorrectEmailResendOption[], inquiry: { status: string; pipeline_stage?: string | null }) {
  const preProposal = ['new', 'contacted', 'tour_requested', 'tour_confirmed'].includes(inquiry.status)
    && ['newsletter', 'inquiry', 'tour', ''].includes(inquiry.pipeline_stage || '')
  if (preProposal) return options.filter((option) => option.sourceKind !== 'Event follow-up'
    && option.resendKind !== 'proposal' && option.resendKind !== 'agreement')
  const postEvent = inquiry.status === 'booked' && ['event', 'closing'].includes(inquiry.pipeline_stage || '')
  const planning = inquiry.status === 'booked' && ['planning', 'event'].includes(inquiry.pipeline_stage || '')
  const contract = inquiry.pipeline_stage === 'contract'
    && ['proposal_sent', 'booked'].includes(inquiry.status)
  const activeAgreement = ['contract', 'deposit'].includes(inquiry.pipeline_stage || '')
    && ['proposal_sent', 'booked'].includes(inquiry.status)
  return options.filter((option) => (postEvent && option.sourceKind === 'Event follow-up')
    || (planning && option.sourceKind === 'Layout review')
    || (contract && option.resendKind === 'proposal')
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
    const approvals = await supabaseRest<Array<{ approval_data: unknown }>>(
      `luxor_approved_proposal_resends?select=approval_data&invoice_id=eq.${encodeURIComponent(invoice.id)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=2`,
    ).catch(() => [])
    if (approvals.length !== 1) return null
    const mailRows = await supabaseRest<MailRow[]>(
      `luxor_mail_messages?select=id,status,occurred_at,accepted_at,to_addresses&provider=resend&direction=eq.outgoing&metadata->>invoiceId=eq.${encodeURIComponent(invoice.id)}&order=occurred_at.desc&limit=10`,
    ).catch(() => [])
    const latestMail = mailRows.find((row) => !row.to_addresses?.length || row.to_addresses.some((address) => address.trim().toLowerCase() === String(emailSnapshot.recipient_email).trim().toLowerCase())) || null
    const successfulCorrection = mailRows.some((row) => row.to_addresses?.some((address) => address.trim().toLowerCase() === email)
      && (Boolean(row.accepted_at) || ['delivered', 'opened', 'clicked'].includes(row.status)))
    if (successfulCorrection) return null
    return {
      id: invoice.id,
      recipientEmail: String(emailSnapshot.recipient_email),
      subject: String(emailSnapshot.subject),
      body: String(emailSnapshot.html),
      sentAt: invoice.proposal_latest_sent_at || invoice.proposal_sent_at || invoice.created_at,
      bounced: latestMail?.status === 'bounced',
      bounceAt: latestMail?.status === 'bounced' ? latestMail.occurred_at : null,
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
    ...agreementOptions.filter((option): option is NonNullable<typeof option> => Boolean(option))]
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
      `luxor_mail_messages?select=id,status,occurred_at,accepted_at&provider=resend&direction=eq.outgoing&metadata->>emailJobId=eq.${encodeURIComponent(job.id)}&order=occurred_at.desc&limit=10`,
    ).catch(() => [])
    const latestMail = mailRows[0] || null
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
      bounced: latestMail?.status === 'bounced',
      bounceAt: latestMail?.status === 'bounced' ? latestMail.occurred_at : null,
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
      `luxor_mail_messages?select=id,status,occurred_at,accepted_at&provider=resend&direction=eq.outgoing&metadata->>emailJobId=eq.${encodeURIComponent(sourceJobId)}&order=occurred_at.desc&limit=1`,
    ).catch(() => []) : []
    return {
      id: job.id,
      recipientEmail: job.recipient_email,
      subject: job.subject,
      body: job.body,
      sentAt: job.sent_at,
      bounced: sourceMail[0]?.status === 'bounced',
      bounceAt: sourceMail[0]?.status === 'bounced' ? sourceMail[0].occurred_at : null,
      sourceKind: 'Tour confirmation',
      resendKind: 'tour',
      canSend: job.status === 'failed' || (job.status === 'cancelled' && job.metadata?.awaiting_owner_confirmation === true),
      unavailableLabel: job.status === 'queued' ? 'Queued' : job.status === 'sending' ? 'Sending' : undefined,
    }
  }))
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Lead ID is invalid.' }, { status: 400 })
    const inquiry = await getLuxorInquiry(id)
    if (!inquiry) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    if (!canCorrectAndResend(inquiry)) return NextResponse.json({ options: [], unavailableReason: 'This lead has moved beyond the eligible email-resend stage.' })
    const email = inquiry.email?.trim().toLowerCase() || ''
    if (!EMAIL_RE.test(email)) return NextResponse.json({ options: [], unavailableReason: 'Save a valid email address before resending.' })
    const jobs = await listLuxorEmailJobsForInquiry(id, 200)
    const [snapshotOptions, tourOptions, dedicatedOptions] = await Promise.all([
      loadEligibleSnapshots(id, email), loadPreparedTourResends(jobs, email), loadDedicatedFlowOptions(id, email, jobs),
    ])
    const options = rankCorrectEmailResendOptions(filterForLeadStage([...snapshotOptions, ...tourOptions, ...dedicatedOptions], inquiry))
    return NextResponse.json({ options, suggestedId: options[0]?.id || null, currentEmail: email })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load email resend options.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
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
    if (!canCorrectAndResend(inquiry)) return NextResponse.json({ error: 'This lead has moved beyond the eligible email-resend stage.' }, { status: 409 })
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
        method: 'POST', headers: { cookie: request.headers.get('cookie') || '' },
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
