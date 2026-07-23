import 'server-only'

import type { LuxorBooking, LuxorEmailJobKind, LuxorInquiry, LuxorInvoice, LuxorSignatureRequest } from './luxorInquiryTypes'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || 'there'
}

function money(value: number) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function brandedEmail(input: { eyebrow: string; title: string; greeting: string; copy: string; buttonLabel?: string; buttonUrl?: string; detail?: string }) {
  return `<!doctype html><html><head><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>@media(prefers-color-scheme:dark){.bg{background:#050505!important}.card{background:#0a0807!important;color:#f7efe3!important}.muted{color:#d7c29a!important}}</style></head><body class="bg" style="margin:0;background:#050505;padding:28px 12px;font-family:Arial,sans-serif"><table class="card" role="presentation" style="width:100%;max-width:620px;margin:auto;background:#0a0807;color:#f7efe3;border:1px solid rgba(202,162,76,.28)"><tr><td style="height:4px;background:#caa24c"></td></tr><tr><td style="padding:30px 42px;text-align:center;border-bottom:1px solid rgba(202,162,76,.16)"><div style="font-family:Georgia,serif;color:#caa24c;font-size:28px;letter-spacing:.18em">LUXOR</div><div style="font-size:8px;letter-spacing:.35em;color:#8c754f;margin-top:6px">AT LAS PALMAS EVENTS</div></td></tr><tr><td style="padding:42px"><div style="color:#caa24c;font-size:10px;font-weight:700;letter-spacing:.25em;text-transform:uppercase">${escapeHtml(input.eyebrow)}</div><h1 style="font-family:Georgia,serif;font-size:36px;line-height:1.1;margin:14px 0;color:#f7efe3">${escapeHtml(input.title)}</h1><p class="muted" style="font-size:15px;line-height:1.75;color:#d7c29a">${escapeHtml(input.greeting)}</p><p class="muted" style="font-size:15px;line-height:1.75;color:#d7c29a">${escapeHtml(input.copy)}</p>${input.detail ? `<div style="margin:24px 0;padding:16px;border:1px solid rgba(202,162,76,.2);background:#0f0c09;color:#f1d27a;font-size:13px">${escapeHtml(input.detail)}</div>` : ''}${input.buttonLabel && input.buttonUrl ? `<p style="margin:28px 0 10px"><a href="${escapeHtml(input.buttonUrl)}" style="display:inline-block;background:#caa24c;color:#17120c;text-decoration:none;padding:15px 24px;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase">${escapeHtml(input.buttonLabel)}</a></p>` : ''}<p style="margin-top:26px;color:#8d7d64;font-size:12px;line-height:1.7">Questions or changes? Reply to this email and the Luxor team will help.</p></td></tr></table></body></html>`
}

export function buildProposalReminderEmail(input: { inquiry: LuxorInquiry; invoice: LuxorInvoice; reviewUrl: string; kind: 'view' | 'payment'; paymentAmount: number }) {
  const viewReminder = input.kind === 'view'
  return {
    subject: viewReminder ? `Your Luxor proposal is ready to review` : `A quick follow-up on your Luxor proposal`,
    body: brandedEmail({
      eyebrow: viewReminder ? 'Proposal reminder' : 'Payment reminder',
      title: viewReminder ? 'Your event proposal is waiting' : 'Ready to reserve your date?',
      greeting: `Hi ${firstName(input.inquiry.full_name)},`,
      copy: viewReminder
        ? `Your custom proposal for ${input.inquiry.event_type || 'your event'} is ready. Review the services and pricing when you have a moment.`
        : `We are following up on the proposal for ${input.inquiry.event_type || 'your event'}. Review it before paying and reply if any service needs to change.`,
      detail: `${viewReminder ? 'Proposal total' : 'Requested payment'}: ${money(viewReminder ? input.invoice.total : input.paymentAmount)}`,
      buttonLabel: 'Review proposal',
      buttonUrl: input.reviewUrl,
    }),
  }
}

export function buildContractReminderEmail(input: { signature: LuxorSignatureRequest; kind: 'view' | 'sign' }) {
  const viewReminder = input.kind === 'view'
  return {
    subject: viewReminder ? 'Your Luxor agreement is ready to review' : 'Reminder: your Luxor agreement is awaiting signature',
    body: brandedEmail({
      eyebrow: 'Event agreement',
      title: viewReminder ? 'Your agreement is ready' : 'One step remains',
      greeting: `Hi ${firstName(input.signature.client_name)},`,
      copy: viewReminder
        ? 'Your Luxor Event Space agreement and Guest Guide are ready in the secure signing portal.'
        : 'Your agreement has been opened but is not signed yet. Please review the final details and sign when you are ready.',
      buttonLabel: 'Review & sign agreement',
      buttonUrl: `${SITE_URL}/secure-portal/sign/${input.signature.token}`,
    }),
  }
}

export function buildFinalPaymentReminderEmail(input: { inquiry: LuxorInquiry; invoice: LuxorInvoice; reviewUrl: string; balance: number; dueDate?: string | null }) {
  return {
    subject: `Reminder: ${money(input.balance)} remains for your Luxor event`,
    body: brandedEmail({
      eyebrow: 'Final payment',
      title: 'Your remaining balance',
      greeting: `Hi ${firstName(input.inquiry.full_name)},`,
      copy: `Your event is moving forward. The remaining balance can be reviewed and paid securely from your proposal page.`,
      detail: `${money(input.balance)} remaining${input.dueDate ? ` · due ${input.dueDate}` : ''}`,
      buttonLabel: 'Review balance & pay',
      buttonUrl: input.reviewUrl,
    }),
  }
}

export function buildEventEmail(input: { inquiry: LuxorInquiry; booking: LuxorBooking; kind: 'details' | 'day' | 'thanks' }) {
  const eventDate = input.booking.event_date || input.inquiry.target_date || 'your event date'
  if (input.kind === 'thanks') {
    return {
      subject: 'Thank you for celebrating at Luxor',
      body: brandedEmail({
        eyebrow: 'Thank you',
        title: 'It was an honor to host you',
        greeting: `Hi ${firstName(input.inquiry.full_name)},`,
        copy: `Thank you for choosing Luxor Event Space for your ${input.inquiry.event_type || 'celebration'}. We hope the day felt every bit as special as you planned.`,
      }),
    }
  }
  const isDetails = input.kind === 'details'
  return {
    subject: isDetails ? 'Let’s confirm the final details for your Luxor event' : 'Your Luxor event is almost here',
    body: brandedEmail({
      eyebrow: isDetails ? 'Planning check-in' : 'Event reminder',
      title: isDetails ? 'Final details check-in' : 'We will see you soon',
      greeting: `Hi ${firstName(input.inquiry.full_name)},`,
      copy: isDetails
        ? 'Please reply with any final guest-count, vendor, layout, or timing changes so our team can keep the event plan accurate.'
        : 'Your Luxor event is almost here. Reply if your arrival time or day-of contact has changed.',
      detail: `Event date: ${eventDate}`,
    }),
  }
}

export function lifecycleAutomationKey(kind: LuxorEmailJobKind, recordId: string) {
  return `${kind}:${recordId}`
}
