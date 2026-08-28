import 'server-only'

import crypto from 'crypto'
import type { LuxorEmailJob } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'
import { downloadLuxorPrivatePdf, saveLuxorPrivatePdf } from './luxorDocumentsServer'
import { luxorMailAddress, luxorMailFrom, luxorMailProvider, type LuxorMailProvider } from './luxorMailConfig'
import { sendLuxorResendEmail } from './luxorResendMailServer'
import { sendLuxorZohoEmail } from './zohoMailServer'

type NoticeKind = 'agreement_client' | 'agreement_owner' | 'paid_invoice'
type PdfReference = { path: string; filename: string; sha256: string; size: number }
type NoticeSnapshot = {
  version: 1; key: string; kind: NoticeKind; provider: LuxorMailProvider
  recipient: string; subject: string; html: string; from: string; fromName: string; pdf: PdfReference
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sha256 = (bytes: Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex')

function noticeId(key: string) {
  const hex = crypto.createHash('sha256').update(`luxor-transactional-notice/v1/${key}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function snapshotOf(job: LuxorEmailJob): NoticeSnapshot {
  const snapshot = job.metadata?.transactionalNotice as NoticeSnapshot | undefined
  if (job.job_type !== 'transactional_notice' || !snapshot || snapshot.version !== 1
    || !['agreement_client', 'agreement_owner', 'paid_invoice'].includes(snapshot.kind)
    || !snapshot.key || noticeId(snapshot.key) !== job.id
    || !['resend', 'zoho'].includes(snapshot.provider)
    || !luxorMailAddress(snapshot.recipient) || snapshot.recipient !== job.recipient_email
    || snapshot.subject !== job.subject || snapshot.html !== job.body
    || !snapshot.pdf || !/^[0-9a-f]{64}$/.test(snapshot.pdf.sha256)
    || snapshot.pdf.path !== `mail-notices/${job.id}/${snapshot.pdf.sha256}.pdf`
    || !Number.isInteger(snapshot.pdf.size) || snapshot.pdf.size < 1 || snapshot.pdf.size > 10 * 1024 * 1024
    || !/^[a-zA-Z0-9._-]+\.pdf$/.test(snapshot.pdf.filename)
    || /[\r\n]/.test(snapshot.subject + snapshot.fromName)) {
    throw new Error('Transactional notice snapshot is invalid; review before delivery.')
  }
  luxorMailFrom(snapshot.from)
  return snapshot
}

export async function queueLuxorTransactionalNotice(input: {
  kind: NoticeKind; sourceId: string; inquiryId?: string | null; bookingId?: string | null
  signatureRequestId?: string | null; recipient: string; subject: string; html: string
  pdf: Uint8Array; filename: string; scheduledFor: string
  legacyAutomationKey?: string
}) {
  if (!['agreement_client', 'agreement_owner', 'paid_invoice'].includes(input.kind)
    || !/^[a-zA-Z0-9_-]{1,200}$/.test(input.sourceId)
    || [input.inquiryId, input.bookingId, input.signatureRequestId].some(value => value && !UUID.test(value))
    || !Number.isFinite(Date.parse(input.scheduledFor))) throw new Error('Invalid transactional notice identity.')
  const key = `${input.kind}/${input.sourceId}`
  const id = noticeId(key)
  const [existing] = await supabaseRest<LuxorEmailJob[]>(`luxor_email_jobs?select=*&id=eq.${id}&limit=1`)
  if (existing) { snapshotOf(existing); return existing }

  // A pre-migration direct-send job may have delivered even when its status
  // is failed/sending. Keep that evidence for review; never create a second job.
  const legacyFilter = input.kind === 'agreement_client' && input.signatureRequestId
    ? `job_type=eq.contract_signature&signature_request_id=eq.${input.signatureRequestId}&metadata->>flow_stage=eq.contract_completed`
    : input.kind === 'paid_invoice' && input.legacyAutomationKey
      ? `job_type=eq.deposit_payment_confirmation&metadata->>automation_key=eq.${encodeURIComponent(input.legacyAutomationKey)}` : null
  if (legacyFilter) {
    const [legacy] = await supabaseRest<LuxorEmailJob[]>(`luxor_email_jobs?select=*&${legacyFilter}&limit=1`)
    if (legacy) return legacy
  }

  const recipient = luxorMailAddress(input.recipient)
  if (!recipient || !input.subject || input.subject.length > 998 || /[\r\n]/.test(input.subject)
    || !input.html || Buffer.byteLength(input.html, 'utf8') > 256 * 1024
    || !/^[a-zA-Z0-9._-]+\.pdf$/.test(input.filename)
    || !input.pdf.byteLength || input.pdf.byteLength > 10 * 1024 * 1024) throw new Error('Invalid transactional notice content.')
  const digest = sha256(input.pdf)
  const path = `mail-notices/${id}/${digest}.pdf`
  const snapshot: NoticeSnapshot = { version: 1, key, kind: input.kind, provider: luxorMailProvider(), recipient,
    subject: input.subject, html: input.html, from: luxorMailFrom('booking@luxoratlaspalmas.com'), fromName: 'Luxor Event Space',
    pdf: { path, filename: input.filename, sha256: digest, size: input.pdf.byteLength } }
  await saveLuxorPrivatePdf(path, input.pdf)
  const saved = await downloadLuxorPrivatePdf(path)
  if (saved.byteLength !== input.pdf.byteLength || sha256(saved) !== digest) throw new Error('Transactional PDF verification failed; notification was not queued.')
  const rows = await supabaseRest<LuxorEmailJob[]>('luxor_email_jobs?on_conflict=id&select=*', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ id, inquiry_id: input.inquiryId || null, booking_id: input.bookingId || null,
      signature_request_id: input.signatureRequestId || null, job_type: 'transactional_notice', status: 'queued',
      recipient_email: recipient, subject: input.subject, body: input.html, scheduled_for: input.scheduledFor,
      metadata: { automated: true, transactionalNotice: snapshot } }),
  })
  const job = rows[0] || (await supabaseRest<LuxorEmailJob[]>(`luxor_email_jobs?select=*&id=eq.${id}&limit=1`))[0]
  if (!job) throw new Error('Transactional notification could not be recorded.')
  snapshotOf(job)
  return job
}

export async function deliverLuxorTransactionalNotice(job: LuxorEmailJob): Promise<{ status: 'sent' }> {
  if (job.status !== 'sending') throw new Error('Transactional notice must be claimed before delivery.')
  const snapshot = snapshotOf(job)
  if (snapshot.provider === 'zoho' && luxorMailProvider() !== 'zoho') {
    throw new Error('Review this unfinished Zoho notification before changing its provider.')
  }
  const pdf = await downloadLuxorPrivatePdf(snapshot.pdf.path)
  if (pdf.byteLength !== snapshot.pdf.size || sha256(pdf) !== snapshot.pdf.sha256) {
    throw new Error('Transactional PDF changed or is incomplete; delivery stopped.')
  }
  // Fence the long storage read against a cancelled/reclaimed job. A request
  // already in flight cannot be recalled; Resend's durable key handles replay.
  const [current] = await supabaseRest<LuxorEmailJob[]>(
    `luxor_email_jobs?select=*&id=eq.${job.id}&status=eq.sending&attempts=eq.${job.attempts}&limit=1`)
  if (!current || JSON.stringify(snapshotOf(current)) !== JSON.stringify(snapshot)) throw new Error('Transactional notice claim changed; delivery stopped.')
  if (snapshot.provider === 'zoho' && current.metadata.transactionalSendStarted === true) {
    throw new Error('Zoho delivery may already have started; review before retrying.')
  }
  if (snapshot.provider === 'zoho') {
    const [started] = await supabaseRest<LuxorEmailJob[]>(
      `luxor_email_jobs?select=*&id=eq.${job.id}&status=eq.sending&attempts=eq.${job.attempts}&or=(metadata->>transactionalSendStarted.is.null,metadata->>transactionalSendStarted.eq.false)`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
          metadata: { ...current.metadata, transactionalSendStarted: true }, updated_at: new Date().toISOString(),
        }),
      })
    if (!started) throw new Error('Transactional notice claim changed; delivery stopped.')
  }
  const input = { to: snapshot.recipient, subject: snapshot.subject, content: snapshot.html,
    from: snapshot.from, fromName: snapshot.fromName, idempotencyKey: `email-job/${job.id}`,
    attachments: [{ filename: snapshot.pdf.filename, content: pdf, contentType: 'application/pdf' }] }
  if (snapshot.provider === 'resend') await sendLuxorResendEmail(input)
  else await sendLuxorZohoEmail(input)
  return { status: 'sent' }
}
