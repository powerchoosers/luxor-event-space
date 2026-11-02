import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { assertLuxorProductionSideEffectsAllowed } from '@/lib/luxorTestLeadServer'
import { getLuxorPaymentReceiptEmailContext } from '@/lib/luxorPaymentReceiptEmailServer'
import { queueLuxorTransactionalNotice } from '@/lib/luxorTransactionalNoticeServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorEmailJob } from '@/lib/luxorInquiryTypes'

type NoticeSnapshot = {
  kind?: string; key?: string; provider?: string; recipient?: string; subject?: string; html?: string
  pdf?: { sha256?: string }
}

function receiptSnapshot(job: LuxorEmailJob) {
  return job.metadata?.transactionalNotice as NoticeSnapshot | undefined
}

function receiptMatches(job: LuxorEmailJob, context: Awaited<ReturnType<typeof getLuxorPaymentReceiptEmailContext>>) {
  const snapshot = receiptSnapshot(job)
  return job.job_type === 'transactional_notice'
    && snapshot?.kind === 'payment_receipt'
    && snapshot.recipient === context.recipient
    && snapshot.subject === context.subject
    && snapshot.html === context.html
    && snapshot.pdf?.sha256 === context.pdfSha256
}

async function retryReceiptJob(job: LuxorEmailJob) {
  if (job.status !== 'failed') throw new Error('This receipt email is not in a retryable failed state.')
  const snapshot = receiptSnapshot(job)
  if (snapshot?.kind !== 'payment_receipt') throw new Error('Receipt email details could not be verified.')
  const now = new Date()
  const resendRetryWindowMs = 23 * 60 * 60 * 1000
  const firstProviderAttemptAt = typeof job.metadata?.transactionalFirstSendStartedAt === 'string'
    ? Date.parse(job.metadata.transactionalFirstSendStartedAt) : Number.NaN
  const hasProviderAttemptTimestamp = Number.isFinite(firstProviderAttemptAt)
  const retryAllowed = snapshot.provider === 'resend'
    ? hasProviderAttemptTimestamp
      ? now.getTime() >= firstProviderAttemptAt && now.getTime() - firstProviderAttemptAt < resendRetryWindowMs
      : Number(job.attempts || 0) === 0 && job.metadata?.transactionalSendStarted !== true
    : snapshot.provider === 'zoho' && job.metadata?.transactionalSendStarted !== true && !hasProviderAttemptTimestamp
  if (!retryAllowed) {
    throw new Error(snapshot.provider === 'resend'
      ? 'The provider’s 24-hour duplicate-protection window has expired. Verify delivery with Luxor before sending another receipt.'
      : 'The provider may already have accepted this receipt. Review delivery before retrying.')
  }
  const retryHistory = Array.isArray(job.metadata?.paymentReceiptRetries) ? job.metadata.paymentReceiptRetries : []
  const rows = await supabaseRest<LuxorEmailJob[]>(
    `luxor_email_jobs?id=eq.${encodeURIComponent(job.id)}&status=eq.failed&updated_at=eq.${encodeURIComponent(job.updated_at)}&select=*`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'queued', attempts: 0, scheduled_for: now.toISOString(), last_error: null, updated_at: now.toISOString(),
        metadata: { ...job.metadata, paymentReceiptRetries: [...retryHistory, { requested_at: now.toISOString(), previous_attempts: job.attempts }],
          manualReceiptRetryRequested: true },
      }),
    })
  if (rows[0]) return rows[0]
  const [current] = await supabaseRest<LuxorEmailJob[]>(`luxor_email_jobs?select=*&id=eq.${encodeURIComponent(job.id)}&limit=1`)
  if (current && ['queued', 'sending', 'sent'].includes(current.status)) return current
  throw new Error('Receipt status changed before retry. Refresh to verify its current delivery state.')
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const { id } = await params
    const context = await getLuxorPaymentReceiptEmailContext(id)
    return NextResponse.json({
      recipient: context.recipient,
      subject: context.subject,
      message: context.message,
      filename: context.filename,
      receiptNumber: context.receiptNumber,
      eventName: context.eventName,
      fingerprint: context.fingerprint,
      pdfSha256: context.pdfSha256,
      pdfUrl: `/api/payments/${encodeURIComponent(id)}/receipt?disposition=inline&fingerprint=${encodeURIComponent(context.fingerprint)}&pdfSha256=${encodeURIComponent(context.pdfSha256)}`,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Receipt preview could not be prepared.'
    const status = message === 'Payment record not found.' ? 404
      : message.includes('confirmed paid transaction') || message.includes('client email') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({})) as { fingerprint?: string; pdfSha256?: string; retry?: boolean }
    const context = await getLuxorPaymentReceiptEmailContext(id)
    if (body.fingerprint !== context.fingerprint || body.pdfSha256 !== context.pdfSha256) {
      return NextResponse.json({ error: 'The receipt changed after preview. Reopen the preview before sending.' }, { status: 409 })
    }
    if (context.inquiry?.is_test) await assertLuxorProductionSideEffectsAllowed(context.inquiry.id)

    let job: LuxorEmailJob
    if (body.retry === true) {
      const candidates = await supabaseRest<LuxorEmailJob[]>(`luxor_email_jobs?select=*&job_type=eq.transactional_notice&inquiry_id=eq.${encodeURIComponent(context.inquiry?.id || context.payment.inquiry_id || '')}&order=created_at.desc&limit=500`)
      const existing = candidates.find((candidate) => {
        const snapshot = receiptSnapshot(candidate)
        return snapshot?.kind === 'payment_receipt' && snapshot.key === `payment_receipt/${context.payment.id}`
      })
      if (!existing || !receiptMatches(existing, context)) {
        return NextResponse.json({ error: 'The saved receipt email does not match this preview; no retry was made.' }, { status: 409 })
      }
      job = await retryReceiptJob(existing)
    } else {
      job = await queueLuxorTransactionalNotice({
        kind: 'payment_receipt',
        sourceId: context.payment.id,
        inquiryId: context.inquiry?.id || context.payment.inquiry_id,
        bookingId: context.booking?.id || context.payment.booking_id,
        recipient: context.recipient,
        subject: context.subject,
        html: context.html,
        pdf: context.pdf,
        filename: context.filename,
        scheduledFor: new Date().toISOString(),
      })
      if (!receiptMatches(job, context)) {
        return NextResponse.json({ error: 'A receipt email already exists with different immutable content. Review the saved email before retrying.' }, { status: 409 })
      }
    }

    const accepted = job.status === 'sent'
    const state = accepted ? 'sent' : job.status === 'failed' ? 'failed'
      : job.status === 'cancelled' ? 'cancelled' : job.status === 'sending' ? 'pending' : 'queued'
    return NextResponse.json({ job, state }, {
      status: accepted ? 200 : state === 'cancelled' || state === 'failed' ? 409 : 202,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment receipt email could not be queued.'
    const status = message === 'Payment record not found.' ? 404
      : message.includes('confirmed paid transaction') || message.includes('client email') || message.includes('retryable') || message.includes('duplicate-protection') || message.includes('may already have accepted') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
