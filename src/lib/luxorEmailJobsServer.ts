import 'server-only'

import crypto from 'crypto'
import { LuxorEmailJob, LuxorEmailJobKind, LuxorInquiry, LuxorSignatureRequest } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'
import { sendLuxorZohoEmail } from './zohoMailServer'

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` ||
  'http://localhost:3000'

function absoluteUrl(path: string) {
  return `${PUBLIC_BASE_URL.replace(/\/$/, '')}${path}`
}

export function createPublicToken() {
  return crypto.randomBytes(24).toString('base64url')
}

export function getTourResponseLinks(token: string) {
  return {
    confirmUrl: absoluteUrl(`/tour-response/${token}?action=confirm`),
    rescheduleUrl: absoluteUrl(`/tour-response/${token}?action=reschedule`),
  }
}

export function buildTourEmail(kind: LuxorEmailJobKind, inquiry: LuxorInquiry, token: string) {
  const eventLine = `${inquiry.event_type || 'Event'}${inquiry.guest_count ? ` for ${inquiry.guest_count} guests` : ''}`
  const dateLine = `${inquiry.preferred_tour_date || 'your selected date'}${inquiry.preferred_tour_time ? ` at ${inquiry.preferred_tour_time}` : ''}`
  const links = getTourResponseLinks(token)

  if (kind === 'tour_no_show_reschedule') {
    return {
      subject: 'Want to reschedule your Luxor tour?',
      body: [
        `Hi ${inquiry.full_name},`,
        `We missed you for your Luxor Event Space tour for ${eventLine}.`,
        'If you still want to see the space, use the reschedule link below and we will help find a better time.',
        `Reschedule: ${links.rescheduleUrl}`,
        inquiry.message ? `Your event notes: ${inquiry.message}` : '',
        'Luxor Event Space',
      ].filter(Boolean).join('\n\n'),
    }
  }

  if (kind === 'tour_reminder') {
    return {
      subject: 'Reminder: your Luxor tour is tomorrow',
      body: [
        `Hi ${inquiry.full_name},`,
        `This is a reminder for your Luxor Event Space tour on ${dateLine}.`,
        `Event type: ${eventLine}`,
        inquiry.message ? `Details you shared: ${inquiry.message}` : '',
        `Confirm your tour: ${links.confirmUrl}`,
        `Need a new time? Reschedule here: ${links.rescheduleUrl}`,
        'Luxor Event Space',
      ].filter(Boolean).join('\n\n'),
    }
  }

  return {
    subject: 'Your Luxor Event Space tour request',
    body: [
      `Hi ${inquiry.full_name},`,
      `Thank you for requesting a tour of Luxor Event Space. We have your preferred tour for ${dateLine}.`,
      `Event type: ${eventLine}`,
      inquiry.message ? `Details you shared: ${inquiry.message}` : '',
      `Confirm your tour: ${links.confirmUrl}`,
      `Need to reschedule? ${links.rescheduleUrl}`,
      'Luxor Event Space',
    ].filter(Boolean).join('\n\n'),
  }
}

export function buildSignatureEmail(signature: LuxorSignatureRequest) {
  return {
    subject: `Contract signature requested: ${signature.contract_title}`,
    body: [
      `Hi ${signature.client_name},`,
      'Your Luxor Event Space contract is ready to review and sign.',
      `Sign here: ${absoluteUrl(`/secure-portal/sign/${signature.token}`)}`,
      'Luxor Event Space',
    ].join('\n\n'),
  }
}

export async function createLuxorEmailJob(data: {
  inquiryId?: string | null
  bookingId?: string | null
  signatureRequestId?: string | null
  jobType: LuxorEmailJobKind
  recipientEmail: string
  subject: string
  body: string
  scheduledFor?: string
  metadata?: Record<string, unknown>
}) {
  const [created] = await supabaseRest<LuxorEmailJob[]>('luxor_email_jobs?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      inquiry_id: data.inquiryId || null,
      booking_id: data.bookingId || null,
      signature_request_id: data.signatureRequestId || null,
      job_type: data.jobType,
      status: 'queued',
      recipient_email: data.recipientEmail,
      subject: data.subject,
      body: data.body,
      scheduled_for: data.scheduledFor || new Date().toISOString(),
      metadata: data.metadata || {},
    }),
  })

  return created
}

export async function listDueLuxorEmailJobs(limit = 25) {
  return supabaseRest<LuxorEmailJob[]>(
    `luxor_email_jobs?select=*&status=eq.queued&scheduled_for=lte.${encodeURIComponent(new Date().toISOString())}&order=scheduled_for.asc&limit=${encodeURIComponent(limit)}`,
  )
}

export async function listQueuedLuxorEmailJobsByIds(ids: string[]) {
  const safeIds = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  if (!safeIds.length) return []

  return supabaseRest<LuxorEmailJob[]>(
    `luxor_email_jobs?select=*&status=eq.queued&id=in.(${safeIds.join(',')})&order=scheduled_for.asc`,
  )
}

export async function updateLuxorEmailJob(id: string, updates: Partial<LuxorEmailJob>) {
  const [updated] = await supabaseRest<LuxorEmailJob[]>(`luxor_email_jobs?select=*&id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      ...updates,
      updated_at: new Date().toISOString(),
    }),
  })

  return updated ?? null
}

export async function processLuxorEmailJobs(jobs: LuxorEmailJob[]) {
  const results: { id: string; status: 'sent' | 'failed'; error?: string }[] = []

  for (const job of jobs) {
    try {
      await updateLuxorEmailJob(job.id, { status: 'sending', attempts: Number(job.attempts || 0) + 1 })
      await sendLuxorZohoEmail({
        to: job.recipient_email,
        subject: job.subject,
        content: job.body,
        from: 'booking@luxoratlaspalmas.com',
        fromName: 'Luxor Event Space',
      })
      await updateLuxorEmailJob(job.id, { status: 'sent', sent_at: new Date().toISOString(), last_error: null })
      if (job.job_type === 'marketing_campaign') {
        await markMarketingJobResult(job, 'sent')
      }
      results.push({ id: job.id, status: 'sent' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email send failed.'
      await updateLuxorEmailJob(job.id, { status: 'failed', last_error: message })
      if (job.job_type === 'marketing_campaign') {
        await markMarketingJobResult(job, 'failed', message)
      }
      results.push({ id: job.id, status: 'failed', error: message })
    }
  }

  return results
}

export async function processDueLuxorEmailJobs(limit = 25) {
  const jobs = await listDueLuxorEmailJobs(limit)
  return processLuxorEmailJobs(jobs)
}

async function markMarketingJobResult(job: LuxorEmailJob, status: 'sent' | 'failed', error?: string) {
  const metadata = job.metadata && typeof job.metadata === 'object' ? job.metadata : {}
  const recipientId = typeof metadata.marketing_recipient_id === 'string' ? metadata.marketing_recipient_id : null
  const campaignId = typeof metadata.campaign_id === 'string' ? metadata.campaign_id : null

  if (!recipientId || !campaignId) return

  const now = new Date().toISOString()
  await supabaseRest(
    `luxor_marketing_recipients?id=eq.${encodeURIComponent(recipientId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        sent_at: status === 'sent' ? now : null,
        last_error: error || null,
      }),
    },
  )

  const recipients = await supabaseRest<{ status: string }[]>(
    `luxor_marketing_recipients?select=status&campaign_id=eq.${encodeURIComponent(campaignId)}`,
  )
  const queued = recipients.filter((recipient) => recipient.status === 'queued').length
  const sent = recipients.filter((recipient) => recipient.status === 'sent').length
  const failed = recipients.filter((recipient) => recipient.status === 'failed').length

  await supabaseRest(
    `luxor_marketing_campaigns?id=eq.${encodeURIComponent(campaignId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status: queued > 0 ? 'sending' : failed > 0 && sent === 0 ? 'failed' : 'sent',
        sent_at: queued === 0 ? now : null,
      }),
    },
  )
}
