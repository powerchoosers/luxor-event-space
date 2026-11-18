import 'server-only'

import crypto from 'node:crypto'
import type { LuxorEmailJob, LuxorInquiry } from './luxorInquiryTypes'
import { getLuxorInquiry, updateLuxorInquiry } from './luxorInquiriesServer'
import { luxorMailProvider } from './luxorMailConfig'
import { listLuxorOwnerNotificationRecipients } from './luxorOwnerNotificationRecipientsServer'
import { broadcastLuxorPortalNotification } from './luxorZohoWebhookServer'
import { supabaseRestStrict } from './supabaseRestServer'

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  'http://localhost:3000'

function absoluteUrl(path: string) {
  return `${PUBLIC_BASE_URL.replace(/\/$/, '')}${path}`
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stableJobId(eventId: string, recipient: string) {
  const hash = crypto.createHash('sha256').update(`luxor-client-status/v1/${eventId}/${recipient}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

function buildClientStatusAlertHtml(input: {
  leadName: string
  summary: string
  kindLabel: string
  leadUrl: string
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Client update</title></head>
<body style="margin:0;background:#0b0a08;font-family:Georgia,serif;color:#d7c29a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#080605;border:1px solid rgba(202,162,76,0.2);">
        <tr><td style="padding:28px 32px 12px;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#caa24c;">Client status update</p>
          <h1 style="margin:0;font-size:22px;font-weight:600;color:#f5ead2;">${escapeHtml(input.leadName)}</h1>
          <p style="margin:12px 0 0;font-size:13px;line-height:1.7;color:rgba(215,194,154,0.9);">${escapeHtml(input.summary)}</p>
          <p style="margin:12px 0 0;font-size:11px;color:rgba(215,194,154,0.55);">${escapeHtml(input.kindLabel)}</p>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;">
          <a href="${escapeHtml(input.leadUrl)}" style="display:inline-block;background:#caa24c;color:#050505;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;text-decoration:none;padding:14px 24px;border-radius:3px;">Open lead dossier</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export type NotifyOwnerOfClientStatusChangeInput = {
  leadId: string
  kind: string
  summary: string
  /** Stable idempotency key for this client event, e.g. tour_reschedule:&lt;inquiryId&gt;:&lt;iso&gt; */
  eventId: string
  leadName?: string | null
  /** When true, skip owner email (e.g. tour cancel already queues tour_cancellation). */
  skipOwnerEmail?: boolean
}

const KIND_LABELS: Record<string, string> = {
  tour_confirm: 'Tour confirmed from email link',
  tour_reschedule: 'Tour reschedule requested from email link',
  tour_cancel: 'Tour cancelled from email link',
  payment_preference: 'Payment preference selected in client portal',
  proposal_accept: 'Proposal accepted in client portal',
  signature_view: 'Agreement opened in signing portal',
  signature_signed: 'Agreement signed in signing portal',
  layout_review: 'Layout review response from client',
  planner_presentation: 'Planner presentation response from client',
}

/**
 * Alert Arianna when a client changes lead/tour status through a public route.
 * Never throws; client-facing routes must still succeed if alerting fails.
 */
export async function notifyOwnerOfClientStatusChange(
  input: NotifyOwnerOfClientStatusChangeInput,
): Promise<void> {
  const leadId = String(input.leadId || '').trim()
  const kind = String(input.kind || '').trim().slice(0, 80)
  const summary = String(input.summary || '').trim().replace(/\s+/g, ' ').slice(0, 500)
  const eventId = String(input.eventId || '').trim().slice(0, 200)
  if (!leadId || !kind || !summary || !eventId) {
    console.error('Client status owner alert skipped: missing leadId, kind, summary, or eventId.')
    return
  }

  try {
    const inquiry = await getLuxorInquiry(leadId)
    if (!inquiry || inquiry.is_test) return

    const stamp = new Date().toISOString()
    const sameEvent = inquiry.client_attention_event_id === eventId

    if (!sameEvent) {
      await updateLuxorInquiry(leadId, {
        client_attention_at: stamp,
        client_attention_reason: summary,
        client_attention_kind: kind,
        client_attention_event_id: eventId,
        client_attention_acknowledged_at: null,
      })
    }

    if (!input.skipOwnerEmail) {
      const leadName = (input.leadName || inquiry.full_name || 'Sample Guest').trim()
      const kindLabel = KIND_LABELS[kind] || kind.replaceAll('_', ' ')
      const leadUrl = absoluteUrl(`/portal/leads/${leadId}`)
      const subject = `[Client update] ${leadName}: ${summary.slice(0, 120)}`
      const body = buildClientStatusAlertHtml({ leadName, summary, kindLabel, leadUrl })
      const recipients = await listLuxorOwnerNotificationRecipients()

      await Promise.all(recipients.map(async (recipient) => {
        const id = stableJobId(eventId, recipient)
        try {
          await supabaseRestStrict<LuxorEmailJob[]>('luxor_email_jobs?on_conflict=id&select=id', {
            method: 'POST',
            headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
            body: JSON.stringify({
              id,
              job_type: 'inquiry_notification',
              status: 'queued',
              inquiry_id: leadId,
              recipient_email: recipient,
              subject,
              body,
              scheduled_for: stamp,
              metadata: {
                notificationKind: 'client_status_change',
                notificationRendered: true,
                notificationProvider: luxorMailProvider(),
                clientStatusEventId: eventId,
                clientStatusKind: kind,
                leadId,
                leadName,
              },
            }),
          })
        } catch (error) {
          console.error(`Client status owner email queue failed for ${recipient}:`, error)
        }
      }))
    }

    await broadcastLuxorPortalNotification('client-status-change', {
      inquiryId: leadId,
      kind,
      eventId,
      summary,
    }).catch((error) => {
      console.error('Client status portal broadcast failed:', error)
    })
  } catch (error) {
    console.error('notifyOwnerOfClientStatusChange failed:', error)
  }
}

export async function acknowledgeLuxorClientAttention(
  inquiry: LuxorInquiry,
  acknowledgedBy: string,
): Promise<LuxorInquiry | null> {
  const stamp = new Date().toISOString()
  return updateLuxorInquiry(inquiry.id, {
    client_attention_acknowledged_at: stamp,
  })
}