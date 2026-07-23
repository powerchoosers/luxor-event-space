import 'server-only'

import { LUXOR_GRAND_OPENING } from './luxorGrandOpening'

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const SOCIAL_LINKS = {
  instagram: 'https://www.instagram.com/luxoratlaspalmas?utm_source=qr',
  facebook: 'https://www.facebook.com/share/1DD3mKM8XJ/?mibextid=wwXIfr',
  tiktok: 'https://www.tiktok.com/@luxoratlaspalmas?_r=1&_t=ZT-97vnzmYjFUM',
} as const

function plainTextEmailFooter() {
  return ['Luxor Event Space']
}

function socialEmailIconsHtml() {
  const instagramIcon = absoluteUrl('/social-instagram.png')
  const facebookIcon = absoluteUrl('/social-facebook.png')
  const tiktokIcon = absoluteUrl('/social-tiktok.png')

  return `<p style="margin:18px 0 0;">
    <a href="${SOCIAL_LINKS.instagram}" target="_blank" style="display:inline-block;margin:0 8px;text-decoration:none;"><img src="${instagramIcon}" width="24" height="24" alt="Instagram" style="display:block;width:24px;height:24px;border:0;" /></a>
    <a href="${SOCIAL_LINKS.facebook}" target="_blank" style="display:inline-block;margin:0 8px;text-decoration:none;"><img src="${facebookIcon}" width="24" height="24" alt="Facebook" style="display:block;width:24px;height:24px;border:0;" /></a>
    <a href="${SOCIAL_LINKS.tiktok}" target="_blank" style="display:inline-block;margin:0 8px;text-decoration:none;"><img src="${tiktokIcon}" width="24" height="24" alt="TikTok" style="display:block;width:24px;height:24px;border:0;" /></a>
  </p>`
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
        ...plainTextEmailFooter(),
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
        ...plainTextEmailFooter(),
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
      ...plainTextEmailFooter(),
    ].filter(Boolean).join('\n\n'),
  }
}

export function buildGrandOpeningRsvpEmail(inquiry: LuxorInquiry) {
  const attendeeCount = inquiry.attendee_count || inquiry.guest_count || 1
  const interestLine = inquiry.package_interest || inquiry.event_type || 'your future event plans'
  const firstName = inquiry.full_name.split(' ')[0] || inquiry.full_name

  return {
    subject: 'Your Luxor Grand Opening RSVP is confirmed',
    body: [
      `Hi ${firstName},`,
      'Thank you for RSVPing to the Luxor Grand Opening Showcase.',
      `We have your spot saved for ${LUXOR_GRAND_OPENING.dateLabel}, from ${LUXOR_GRAND_OPENING.timeLabel} at Luxor Event Space.`,
      `Attending: ${attendeeCount} guest${attendeeCount === 1 ? '' : 's'}`,
      `Interest noted: ${interestLine}`,
      'You can expect venue tours, vendor connections, tastings, giveaways, and a closer look at what Luxor offers for future events.',
      'If your plans change or you need anything before the event, reply to this email and our team will help.',
      ...plainTextEmailFooter(),
    ].join('\n\n'),
  }
}

export function buildGrandOpeningRsvpEmailHtml(inquiry: LuxorInquiry) {
  const attendeeCount = inquiry.attendee_count || inquiry.guest_count || 1
  const firstName = inquiry.full_name.split(' ')[0] || inquiry.full_name
  const interestLine = inquiry.package_interest || inquiry.event_type || 'Future event planning'
  const websiteUrl = absoluteUrl('/')
  const tourUrl = absoluteUrl('/visit')
  const pricingUrl = absoluteUrl('/pricing')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>Your Luxor RSVP Is Confirmed</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body, table, td, p, a, h1 { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    @media (prefers-color-scheme: dark) {
      body, .luxor-bg { background-color: #050505 !important; color: #f7efe3 !important; }
      .luxor-card { background-color: #0a0807 !important; border-color: rgba(202,162,76,0.22) !important; }
      .luxor-header { background-color: #080605 !important; }
      .luxor-hero { background-color: #120d0a !important; }
      .luxor-title { color: #f7efe3 !important; }
      .luxor-gold { color: #caa24c !important; }
      .luxor-muted { color: #d7c29a !important; }
    }
    [data-ogsc] .luxor-bg { background-color: #050505 !important; }
    [data-ogsc] .luxor-card { background-color: #0a0807 !important; }
    [data-ogsc] .luxor-title { color: #f7efe3 !important; }
    [data-ogsc] .luxor-gold { color: #caa24c !important; }
  </style>
</head>
<body class="luxor-bg" style="margin:0;padding:0;background-color:#050505;font-family:'Helvetica Neue',Arial,sans-serif;color:#f7efe3;color-scheme:light dark;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050505" class="luxor-bg" style="background-color:#050505;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="luxor-card" style="width:600px;max-width:600px;background-color:#0a0807;border:1px solid rgba(202,162,76,0.22);border-radius:4px;overflow:hidden;">
          <tr>
            <td style="height:3px;background:linear-gradient(90deg,#9b6d24,#f1d27a,#caa24c,#9b6d24);font-size:1px;line-height:1px;">&nbsp;</td>
          </tr>
          <tr>
            <td class="luxor-header" style="padding:28px 48px 20px;text-align:center;background-color:#080605;border-bottom:1px solid rgba(202,162,76,0.14);">
              <p class="luxor-gold" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:600;letter-spacing:0.18em;color:#caa24c;text-transform:uppercase;">Luxor</p>
              <p style="margin:6px 0 0;font-size:8px;letter-spacing:0.42em;color:rgba(202,162,76,0.62);text-transform:uppercase;">At Las Palmas Events</p>
            </td>
          </tr>
          <tr>
            <td class="luxor-hero" style="padding:60px 48px 34px;text-align:center;background-color:#120d0a;background:radial-gradient(circle at 50% 0%,rgba(202,162,76,0.18),transparent 70%),linear-gradient(180deg,#120d0a,#050505);">
              <p class="luxor-gold" style="margin:0 0 16px;font-size:10px;font-weight:700;letter-spacing:0.34em;text-transform:uppercase;color:#caa24c;">Grand Opening Showcase</p>
              <h1 class="luxor-title" style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:44px;font-weight:600;line-height:1.05;color:#f7efe3;">Your RSVP Is Confirmed</h1>
              <p class="luxor-muted" style="margin:0 auto;max-width:460px;font-size:15px;line-height:1.8;color:rgba(215,194,154,0.82);">
                Hi ${escapeHtml(firstName)}, we saved your spot for the Luxor Grand Opening Showcase on ${LUXOR_GRAND_OPENING.dateLabel}, from <strong style="color:#f1d27a;">${LUXOR_GRAND_OPENING.timeLabel}</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="height:2px;background:linear-gradient(90deg,transparent,#caa24c,transparent);font-size:1px;line-height:1px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:36px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="48%" style="width:48%;vertical-align:top;padding-right:16px;border-right:1px solid rgba(202,162,76,0.18);">
                    <p class="luxor-gold" style="margin:0 0 10px;font-size:9px;font-weight:700;letter-spacing:0.32em;text-transform:uppercase;color:#caa24c;">Attending</p>
                    <p class="luxor-title" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.1;color:#f7efe3;">${attendeeCount}</p>
                  </td>
                  <td width="4%" style="width:4%;">&nbsp;</td>
                  <td width="48%" style="width:48%;vertical-align:top;padding-left:16px;">
                    <p class="luxor-gold" style="margin:0 0 10px;font-size:9px;font-weight:700;letter-spacing:0.32em;text-transform:uppercase;color:#caa24c;">Interest</p>
                    <p class="luxor-muted" style="margin:0;font-size:14px;line-height:1.8;color:rgba(215,194,154,0.82);">${escapeHtml(interestLine)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 48px 18px;">
              <p class="luxor-muted" style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(215,194,154,0.82);">
                You can expect venue tours, vendor connections, tastings, giveaways, and a closer look at what Luxor offers for weddings, quinceañeras, private celebrations, and more.
              </p>
              <p class="luxor-muted" style="margin:0;font-size:14px;line-height:1.8;color:rgba(215,194,154,0.82);">
                If your plans change or you want to talk with the team before the event, use one of the links below.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:14px 48px 34px;">
              <a href="${tourUrl}" target="_blank" style="display:inline-block;background-color:#caa24c;color:#050505;font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:3px;border:1px solid rgba(241,210,122,0.5);margin:0 6px 12px;">Schedule A Tour</a>
              <a href="${pricingUrl}" target="_blank" style="display:inline-block;background-color:#0f0c09;color:#f7efe3;font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:3px;border:1px solid rgba(202,162,76,0.28);margin:0 6px 12px;">View Pricing</a>
            </td>
          </tr>
          <tr>
            <td class="luxor-header" style="background-color:#080605;padding:34px 48px 36px;text-align:center;border-top:1px solid rgba(202,162,76,0.14);">
              <p class="luxor-gold" style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:0.14em;color:#caa24c;text-transform:uppercase;">Luxor</p>
              <p class="luxor-muted" style="margin:0 0 16px;font-size:11px;line-height:1.9;color:rgba(215,194,154,0.56);">
                803 Castroville Rd #402, San Antonio, TX 78237<br />
                Private venue tours by appointment.<br />
                <a href="mailto:booking@luxoratlaspalmas.com" style="color:rgba(202,162,76,0.7);text-decoration:none;">booking@luxoratlaspalmas.com</a><br />
                <a href="${websiteUrl}" style="color:rgba(202,162,76,0.7);text-decoration:none;">luxoratlaspalmas.com</a>
              </p>
              ${socialEmailIconsHtml()}
              <p class="luxor-muted" style="margin:0;font-size:9px;line-height:1.7;color:rgba(215,194,154,0.32);">
                This RSVP confirmation was sent because you reserved a spot for the Luxor Grand Opening Showcase.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function buildStandardInquiryEmailHtml(inquiry: LuxorInquiry) {
  const firstName = inquiry.full_name.split(' ')[0] || inquiry.full_name
  const websiteUrl = absoluteUrl('/')
  const tourUrl = absoluteUrl('/visit')
  const pricingUrl = absoluteUrl('/pricing')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>Your Inquiry is Received</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body, table, td, p, a, h1 { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    @media (prefers-color-scheme: dark) {
      body, .luxor-bg { background-color: #050505 !important; color: #f7efe3 !important; }
      .luxor-card { background-color: #0a0807 !important; border-color: rgba(202,162,76,0.22) !important; }
      .luxor-header { background-color: #080605 !important; }
      .luxor-hero { background-color: #120d0a !important; }
      .luxor-title { color: #f7efe3 !important; }
      .luxor-gold { color: #caa24c !important; }
      .luxor-muted { color: #d7c29a !important; }
    }
    [data-ogsc] .luxor-bg { background-color: #050505 !important; }
    [data-ogsc] .luxor-card { background-color: #0a0807 !important; }
    [data-ogsc] .luxor-title { color: #f7efe3 !important; }
    [data-ogsc] .luxor-gold { color: #caa24c !important; }
  </style>
</head>
<body class="luxor-bg" style="margin:0;padding:0;background-color:#050505;font-family:'Helvetica Neue',Arial,sans-serif;color:#f7efe3;color-scheme:light dark;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050505" class="luxor-bg" style="background-color:#050505;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="luxor-card" style="width:600px;max-width:600px;background-color:#0a0807;border:1px solid rgba(202,162,76,0.22);border-radius:4px;overflow:hidden;">
          <tr>
            <td style="height:3px;background:linear-gradient(90deg,#9b6d24,#f1d27a,#caa24c,#9b6d24);font-size:1px;line-height:1px;">&nbsp;</td>
          </tr>
          <tr>
            <td class="luxor-header" style="padding:28px 48px 20px;text-align:center;background-color:#080605;border-bottom:1px solid rgba(202,162,76,0.14);">
              <p class="luxor-gold" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:600;letter-spacing:0.18em;color:#caa24c;text-transform:uppercase;">Luxor</p>
              <p style="margin:6px 0 0;font-size:8px;letter-spacing:0.42em;color:rgba(202,162,76,0.62);text-transform:uppercase;">At Las Palmas Events</p>
            </td>
          </tr>
          <tr>
            <td class="luxor-hero" style="padding:60px 48px 34px;text-align:center;background-color:#120d0a;background:radial-gradient(circle at 50% 0%,rgba(202,162,76,0.18),transparent 70%),linear-gradient(180deg,#120d0a,#050505);">
              <p class="luxor-gold" style="margin:0 0 16px;font-size:10px;font-weight:700;letter-spacing:0.34em;text-transform:uppercase;color:#caa24c;">Inquiry Confirmed</p>
              <h1 class="luxor-title" style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:36px;font-weight:600;line-height:1.1;color:#f7efe3;">We Have Received Your Inquiry</h1>
              <p class="luxor-muted" style="margin:0 auto;max-width:460px;font-size:15px;line-height:1.8;color:rgba(215,194,154,0.82);">
                Hi ${escapeHtml(firstName)}, thank you for reaching out to Luxor Event Space. We have received your event details and a coordinator will connect with you shortly.
              </p>
            </td>
          </tr>
          <tr>
            <td style="height:2px;background:linear-gradient(90deg,transparent,#caa24c,transparent);font-size:1px;line-height:1px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:36px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="48%" style="width:48%;vertical-align:top;padding-right:16px;border-right:1px solid rgba(202,162,76,0.18);">
                    <p class="luxor-gold" style="margin:0 0 10px;font-size:9px;font-weight:700;letter-spacing:0.32em;text-transform:uppercase;color:#caa24c;">Event Type</p>
                    <p class="luxor-muted" style="margin:0;font-size:14px;line-height:1.8;color:rgba(215,194,154,0.82);">${escapeHtml(inquiry.event_type || 'Private Event')}</p>
                  </td>
                  <td width="4%" style="width:4%">&nbsp;</td>
                  <td width="48%" style="width:48%;vertical-align:top;padding-left:16px;">
                    <p class="luxor-gold" style="margin:0 0 10px;font-size:9px;font-weight:700;letter-spacing:0.32em;text-transform:uppercase;color:#caa24c;">Guest Count</p>
                    <p class="luxor-muted" style="margin:0;font-size:14px;line-height:1.8;color:rgba(215,194,154,0.82);">${inquiry.guest_count || 'N/A'}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 48px 18px;">
              <p class="luxor-muted" style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(215,194,154,0.82);">
                Our team is currently reviewing your event notes to prepare custom package options. We will get in touch via email or phone within 24 business hours.
              </p>
              <p class="luxor-muted" style="margin:0;font-size:14px;line-height:1.8;color:rgba(215,194,154,0.82);">
                If you would like to schedule a private tour of the space in the meantime, please use the link below.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:14px 48px 34px;">
              <a href="${tourUrl}" target="_blank" style="display:inline-block;background-color:#caa24c;color:#050505;font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:3px;border:1px solid rgba(241,210,122,0.5);margin:0 6px 12px;">Schedule A Tour</a>
              <a href="${pricingUrl}" target="_blank" style="display:inline-block;background-color:#0f0c09;color:#f7efe3;font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:3px;border:1px solid rgba(202,162,76,0.28);margin:0 6px 12px;">View Pricing</a>
            </td>
          </tr>
          <tr>
            <td class="luxor-header" style="background-color:#080605;padding:34px 48px 36px;text-align:center;border-top:1px solid rgba(202,162,76,0.14);">
              <p class="luxor-gold" style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:0.14em;color:#caa24c;text-transform:uppercase;">Luxor</p>
              <p class="luxor-muted" style="margin:0 0 16px;font-size:11px;line-height:1.9;color:rgba(215,194,154,0.56);">
                803 Castroville Rd #402, San Antonio, TX 78237<br />
                Private venue tours by appointment.<br />
                <a href="mailto:booking@luxoratlaspalmas.com" style="color:rgba(202,162,76,0.7);text-decoration:none;">booking@luxoratlaspalmas.com</a><br />
                <a href="${websiteUrl}" style="color:rgba(202,162,76,0.7);text-decoration:none;">luxoratlaspalmas.com</a>
              </p>
              ${socialEmailIconsHtml()}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function buildSignatureEmail(signature: LuxorSignatureRequest) {
  return {
    subject: `Contract signature requested: ${signature.contract_title}`,
    body: [
      `Hi ${signature.client_name},`,
      'Your Luxor Event Space contract is ready to review and sign.',
      `Sign here: ${absoluteUrl(`/secure-portal/sign/${signature.token}`)}`,
      ...plainTextEmailFooter(),
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

export async function listLuxorEmailJobsForInquiry(inquiryId: string, limit = 100) {
  return supabaseRest<LuxorEmailJob[]>(
    `luxor_email_jobs?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc&limit=${encodeURIComponent(Math.min(Math.max(limit, 1), 200))}`,
  )
}

export async function cancelQueuedTourEmailJobs(inquiryId: string) {
  await supabaseRest(
    `luxor_email_jobs?inquiry_id=eq.${encodeURIComponent(inquiryId)}&status=eq.queued&job_type=in.(tour_confirmation,tour_reminder)`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled', updated_at: new Date().toISOString() }),
    },
  )
}

export async function claimDueLuxorEmailJobs(limit = 25) {
  return supabaseRest<LuxorEmailJob[]>('rpc/luxor_claim_due_email_jobs', {
    method: 'POST',
    body: JSON.stringify({
      job_limit: Math.min(Math.max(limit, 1), 100),
    }),
  })
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

export async function processLuxorEmailJobs(
  jobs: LuxorEmailJob[],
  options: { markSending?: boolean } = {},
) {
  const { markSending = true } = options
  const results: { id: string; status: 'sent' | 'failed'; error?: string }[] = []

  for (const job of jobs) {
    try {
      const metadata = job.metadata && typeof job.metadata === 'object' ? job.metadata : {}
      const senderFrom = typeof metadata.sender_from === 'string' ? metadata.sender_from : 'booking@luxoratlaspalmas.com'
      const senderName = typeof metadata.sender_name === 'string' ? metadata.sender_name : 'Luxor Event Space'

      if (markSending) {
        await updateLuxorEmailJob(job.id, { status: 'sending', attempts: Number(job.attempts || 0) + 1 })
      }
      await sendLuxorZohoEmail({
        to: job.recipient_email,
        subject: job.subject,
        content: job.body,
        from: senderFrom,
        fromName: senderName,
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

// Supabase Cron runs this worker every minute. Keeping the default at one job
// makes a due-time collision harmless: one scheduled minute equals one send.
export async function processDueLuxorEmailJobs(limit = 1) {
  try {
    const jobs = await claimDueLuxorEmailJobs(limit)
    return processLuxorEmailJobs(jobs, { markSending: false })
  } catch (error) {
    console.warn(
      'luxor_claim_due_email_jobs RPC unavailable, falling back to direct due-job processing:',
      error instanceof Error ? error.message : error,
    )
    const jobs = await listDueLuxorEmailJobs(limit)
    return processLuxorEmailJobs(jobs, { markSending: true })
  }
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

export type LuxorEmailCampaign = {
  id: string
  created_at: string
  updated_at?: string
  name: string
  subject: string
  status: string
  audience_label?: string
  recipient_count?: number
  sent_count?: number
  open_count?: number
  click_count?: number
  sent_at?: string | null
}

export async function listLuxorEmailCampaigns(options: { limit?: number } = {}): Promise<LuxorEmailCampaign[]> {
  const limit = options.limit || 50
  try {
    const campaigns = await supabaseRest<LuxorEmailCampaign[]>(
      `luxor_marketing_campaigns?select=*&order=created_at.desc&limit=${limit}`,
    )
    return Array.isArray(campaigns) ? campaigns : []
  } catch (err) {
    console.error('Failed to list email campaigns:', err)
    return []
  }
}

export async function getLuxorEmailCampaignReport(campaignId: string) {
  if (!campaignId) return null
  try {
    const [campaign] = await supabaseRest<LuxorEmailCampaign[]>(
      `luxor_marketing_campaigns?select=*&id=eq.${encodeURIComponent(campaignId)}`,
    )
    if (!campaign) return null
    return { campaign }
  } catch (err) {
    console.error('Failed to get email campaign report:', err)
    return null
  }
}
