import 'server-only'

import type { LuxorInquiry } from './luxorInquiryTypes'
import {
  luxorElenaMailDisplayName,
  luxorElenaMailFrom,
  luxorElenaMailReplyTo,
} from './luxorMailConfig'
import { buildConversationalEmailHtml, luxorEmailHtmlToPlainText } from './luxorConversationalEmailServer'
import { getPublicLuxorPhoneNumber } from './luxorPhoneNumbersServer'
import type { BrochureDeliveryCopy } from './luxorBrochureDeliveryCopy'
import { BROCHURE_DELIVERY_DEFAULT, renderBrochureDeliveryCopy } from './luxorBrochureDeliveryCopy'

const LUXOR_SITE = 'https://www.luxoratlaspalmas.com'

function absoluteUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || LUXOR_SITE).replace(/\/$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type ElenaOutboundEmail = {
  from: string
  fromName: string
  replyTo: string
  html: string
  text: string
}

function elenaSignatureParams(senderPhone: string | null) {
  return {
    senderName: 'Elena',
    senderRole: "Luxor's AI concierge",
    organizationName: 'Luxor at Las Palmas Events',
    senderEmail: luxorElenaMailFrom(),
    senderPhone,
    signatureWebsite: 'luxoratlaspalmas.com',
  }
}

export function buildElenaConversationalEmail(input: {
  subject: string
  body: string
  senderPhone: string | null
}): Omit<ElenaOutboundEmail, 'from' | 'fromName' | 'replyTo'> {
  const html = buildConversationalEmailHtml({
    to: '',
    subject: input.subject,
    body: input.body,
    ...elenaSignatureParams(input.senderPhone),
  })
  return { html, text: luxorEmailHtmlToPlainText(html) }
}

export async function prepareElenaOutboundEmail(input: {
  subject: string
  body: string
}): Promise<ElenaOutboundEmail> {
  const senderPhone = await getPublicLuxorPhoneNumber().catch(() => null)
  const { html, text } = buildElenaConversationalEmail({ ...input, senderPhone })
  return {
    from: luxorElenaMailFrom(),
    fromName: luxorElenaMailDisplayName(),
    replyTo: luxorElenaMailReplyTo(),
    html,
    text,
  }
}

export async function buildElenaBrochureDeliveryEmail(
  inquiry: LuxorInquiry,
  override?: BrochureDeliveryCopy | null,
): Promise<ElenaOutboundEmail> {
  const firstName = inquiry.full_name ? inquiry.full_name.split(' ')[0] : ''
  const tokens = {
    first_name: firstName || 'there',
    event_type: inquiry.event_type || 'event',
    guest_count: inquiry.guest_count ? String(inquiry.guest_count) : '',
  }
  const resolved = renderBrochureDeliveryCopy(override || BROCHURE_DELIVERY_DEFAULT, tokens)
  const brochureUrl = absoluteUrl('/api/brochure/download')
  const visitUrl = absoluteUrl('/visit')
  const note = resolved.note.replace(/\s*or reply to this email\.?\s*$/i, '.')
  const bodyHtml = `
    <p style="margin:0 0 17px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#332c24;">${escapeHtml(resolved.greeting)}</p>
    ${resolved.body.split(/\n\n+/).map((paragraph) =>
      `<p style="margin:0 0 17px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#332c24;">${escapeHtml(paragraph.trim()).replace(/\n/g, '<br />')}</p>`,
    ).join('')}
    <p style="margin:0 0 20px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#332c24;">
      <a href="${escapeHtml(brochureUrl)}" style="color:#8f6829;font-weight:700;text-decoration:none;">Download venue brochure</a>
      <span style="color:#c3b9ac;"> &nbsp;·&nbsp; </span>
      <a href="${escapeHtml(visitUrl)}" style="color:#8f6829;font-weight:700;text-decoration:none;">Schedule a visit</a>
    </p>
    <p style="margin:0;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#756b60;">${escapeHtml(note)}</p>
  `
  const subject = resolved.subject
  const senderPhone = await getPublicLuxorPhoneNumber().catch(() => null)
  const html = buildConversationalEmailHtml({
    to: inquiry.email || '',
    subject,
    body: '',
    bodyHtml,
    ...elenaSignatureParams(senderPhone),
  })
  return {
    from: luxorElenaMailFrom(),
    fromName: luxorElenaMailDisplayName(),
    replyTo: luxorElenaMailReplyTo(),
    html,
    text: luxorEmailHtmlToPlainText(html),
  }
}

export function elenaBrochureDeliveryMetadata() {
  return {
    elena_delivery: true,
    sender_from: luxorElenaMailFrom(),
    sender_name: luxorElenaMailDisplayName(),
    reply_to: luxorElenaMailReplyTo(),
  }
}