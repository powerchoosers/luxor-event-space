import 'server-only'

import { createHash } from 'node:crypto'
import { LUXOR_PARTNER_APPLICATION_TYPE_LABELS, type LuxorPartnerApplicationType } from '@/lib/luxorPartnerApplicationTypes'
import { listLuxorOwnerNotificationRecipients } from '@/lib/luxorOwnerNotificationRecipientsServer'
import { luxorMailProvider } from '@/lib/luxorMailConfig'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { LuxorEmailJob } from '@/lib/luxorInquiryTypes'
import type { LuxorPartnerApplicationRow } from '@/lib/luxorPartnerApplicationsServer'

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

function partnerApplicationMessage(answers: Record<string, unknown> | undefined) {
  return typeof answers?.message === 'string' ? answers.message.trim() : ''
}

export function buildPartnerApplicationStaffAlertHtml(input: {
  contactName: string
  email: string
  phone: string
  applicationType: LuxorPartnerApplicationType
  message: string
  pagePath?: string | null
}) {
  const typeLabel = LUXOR_PARTNER_APPLICATION_TYPE_LABELS[input.applicationType]
  const portalUrl = absoluteUrl('/portal/operations?tab=vendors&vendorView=applications')
  const messageHtml = escapeHtml(input.message).replace(/\n/g, '<br />')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <title>Work With Us request - Luxor</title>
</head>
<body style="margin:0;padding:0;background-color:#050505;font-family:'Helvetica Neue',Arial,sans-serif;color:#f7efe3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#050505;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#0a0807;border:1px solid rgba(202,162,76,0.22);border-radius:4px;">
          <tr>
            <td style="padding:24px 32px 16px;text-align:center;background-color:#080605;border-bottom:1px solid rgba(202,162,76,0.14);">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;letter-spacing:0.18em;color:#caa24c;text-transform:uppercase;">Luxor</p>
              <p style="margin:4px 0 0;font-size:8px;letter-spacing:0.42em;color:rgba(202,162,76,0.62);text-transform:uppercase;">Work With Us alert</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 20px;background-color:#120d0a;">
              <p style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:0.34em;text-transform:uppercase;color:#caa24c;">New contact-form application</p>
              <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:500;line-height:1.25;color:#f7efe3;">${escapeHtml(input.contactName)} · ${escapeHtml(typeLabel)}</h1>
              <table role="presentation" width="100%" cellpadding="8" cellspacing="0" border="0" style="margin-top:12px;background-color:#0b0a08;border:1px solid rgba(202,162,76,0.12);border-radius:4px;font-size:13px;">
                <tr><td width="34%" style="color:#caa24c;font-weight:bold;">Email</td><td style="color:#d7c29a;">${escapeHtml(input.email)}</td></tr>
                <tr><td style="color:#caa24c;font-weight:bold;">Phone</td><td style="color:#d7c29a;">${escapeHtml(input.phone)}</td></tr>
                <tr><td style="color:#caa24c;font-weight:bold;">Intake</td><td style="color:#d7c29a;">Contact form</td></tr>
                ${input.pagePath ? `<tr><td style="color:#caa24c;font-weight:bold;">Page</td><td style="color:#d7c29a;">${escapeHtml(input.pagePath)}</td></tr>` : ''}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <div style="padding:20px;background-color:#0d0b09;border:1px solid rgba(202,162,76,0.1);border-radius:4px;">
                <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#caa24c;">Applicant message</p>
                <p style="margin:0;font-size:13px;line-height:1.7;color:rgba(215,194,154,0.9);white-space:pre-wrap;">${messageHtml}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 32px 36px;">
              <a href="${portalUrl}" target="_blank" style="display:inline-block;background-color:#caa24c;color:#050505;font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:3px;">Review in portal applications</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Staff inquiry_notification jobs for contact-form partner applications (no applicant email). */
export async function queueLuxorPartnerApplicationContactStaffAlerts(
  application: LuxorPartnerApplicationRow,
  options?: { replayed?: boolean },
) {
  if (options?.replayed) return []

  const message = partnerApplicationMessage(application.answers)
  const recipients = await listLuxorOwnerNotificationRecipients()
  const subject = `[Work With Us] ${application.contact_name} · ${LUXOR_PARTNER_APPLICATION_TYPE_LABELS[application.application_type]}`
  const body = buildPartnerApplicationStaffAlertHtml({
    contactName: application.contact_name,
    email: application.email,
    phone: application.phone,
    applicationType: application.application_type,
    message,
    pagePath: typeof application.answers?.page_path === 'string' ? application.answers.page_path : null,
  })
  const provider = luxorMailProvider()
  const queued: LuxorEmailJob[] = []

  for (const recipient of recipients) {
    const hash = createHash('sha256')
      .update(`luxor-partner-application-contact/v1/${application.id}/${recipient}`)
      .digest('hex')
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`

    const rows = await supabaseRestStrict<LuxorEmailJob[]>('luxor_email_jobs?on_conflict=id&select=*', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({
        id,
        job_type: 'inquiry_notification',
        status: 'queued',
        inquiry_id: null,
        recipient_email: recipient,
        subject,
        body,
        scheduled_for: new Date().toISOString(),
        metadata: {
          notificationKind: 'partner_application_contact',
          notificationRendered: true,
          notificationProvider: provider,
          partnerApplicationId: application.id,
          applicationType: application.application_type,
          sender_from: 'booking@luxoratlaspalmas.com',
          sender_name: 'Luxor Lead Alerts',
        },
      }),
    })
    if (rows[0]) queued.push(rows[0])
  }

  return queued
}