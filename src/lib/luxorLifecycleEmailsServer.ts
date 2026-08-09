import 'server-only'

import type { LuxorBooking, LuxorEmailJobKind, LuxorInquiry, LuxorInvoice, LuxorNote, LuxorSignatureRequest } from './luxorInquiryTypes'
import { formatLuxorOfferExpiry, hasLuxorOffer, luxorOfferSnapshot } from './luxorOffer'

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

export async function buildAiOfferReminderEmail(input: {
  inquiry: LuxorInquiry
  invoice: LuxorInvoice
  booking?: LuxorBooking | null
  reviewUrl: string
  reminderNumber: number
  notes?: LuxorNote[]
}) {
  const offer = luxorOfferSnapshot(input.invoice)
  const expiry = formatLuxorOfferExpiry(input.invoice.offer_expires_at) || 'the stated deadline'
  const fallback = hasLuxorOffer(input.invoice)
    ? `Your ${offer.percent}% limited-time offer is still available for your ${input.inquiry.event_type || 'event'}. Review the agreement and complete the required payment by ${expiry} to secure the discounted price and your date.`
    : `Your Luxor proposal is still available for your ${input.inquiry.event_type || 'event'}. Review the agreement and complete the required payment by ${expiry} to secure your date.`
  const apiKey = process.env.OPEN_ROUTER_API_KEY
  let copy = fallback
  let aiGenerated = false
  if (apiKey) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://luxoratlaspalmas.com', 'X-Title': 'Luxor Offer Reminder Email Writer' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          temperature: 0.3,
          messages: [
            { role: 'system', content: 'Write exactly two warm, concise sentences for a Luxor Event Space limited-time proposal reminder. Encourage the client to review, sign, and complete the required payment before the supplied deadline to secure their date. Use only the supplied facts. Never invent availability, urgency, pricing, amenities, promises, or terms. Do not repeat dollar amounts or percentages because the approved detail card supplies them. Return only the two sentences, maximum 55 words.' },
            { role: 'user', content: JSON.stringify({
              clientName: input.inquiry.full_name,
              eventType: input.inquiry.event_type,
              eventDate: input.booking?.event_date || input.inquiry.target_date,
              guestCount: input.booking?.guest_count || input.inquiry.guest_count,
              offerDeadline: expiry,
              hasDiscount: hasLuxorOffer(input.invoice),
              reminderNumber: input.reminderNumber,
              recentNotes: (input.notes || []).slice(-5).map((note) => note.content),
            }) },
          ],
        }),
        signal: AbortSignal.timeout(12_000),
      })
      if (response.ok) {
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
        const generated = payload.choices?.[0]?.message?.content?.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
        if (generated) {
          copy = generated.slice(0, 480)
          aiGenerated = true
        }
      }
    } catch (error) {
      console.warn('AI offer reminder copy fell back to approved copy:', error instanceof Error ? error.message : error)
    }
  }
  const detail = hasLuxorOffer(input.invoice)
    ? `Regular price: ${money(offer.originalTotal)} · Your offer: ${money(offer.discountedTotal)} · Save ${money(offer.savings)} (${offer.percent}%) · Expires: ${expiry}`
    : `Proposal total: ${money(input.invoice.total)} · Expires: ${expiry}`
  return {
    subject: hasLuxorOffer(input.invoice)
      ? `Reminder: your ${offer.percent}% Luxor offer ends ${expiry}`
      : `Reminder: reserve your Luxor date by ${expiry}`,
    body: brandedEmail({
      eyebrow: hasLuxorOffer(input.invoice) ? 'Limited-time event offer' : 'Event proposal reminder',
      title: hasLuxorOffer(input.invoice) ? 'Your offer is ready to secure' : 'Your event date is ready to secure',
      greeting: `Hi ${firstName(input.inquiry.full_name)},`,
      copy,
      detail,
      buttonLabel: 'Review offer & secure date',
      buttonUrl: input.reviewUrl,
    }),
    aiGenerated,
  }
}

export function buildPaymentReminderEmail(input: { inquiry: LuxorInquiry; reviewUrl: string; paymentAmount: number; paymentLabel: string }) {
  return {
    subject: `Reminder: your Luxor ${input.paymentLabel.toLowerCase()} is ready`,
    body: brandedEmail({
      eyebrow: 'Agreement signed · payment pending',
      title: 'Your secure payment is ready',
      greeting: `Hi ${firstName(input.inquiry.full_name)},`,
      copy: `Your Luxor agreement is complete. The next step is your ${input.paymentLabel.toLowerCase()}, which can be paid securely from your event page.`,
      detail: `${input.paymentLabel}: ${money(input.paymentAmount)}`,
      buttonLabel: 'Pay securely with Stripe',
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
      copy: `Your remaining event balance and refundable security deposit can be reviewed and paid securely from your event page.`,
      detail: `${money(input.balance)} remaining event balance and refundable security deposit${input.dueDate ? ` · due ${input.dueDate}` : ''}`,
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

export async function generateAiInvoiceReminderCopy(input: {
  inquiry: LuxorInquiry
  invoice: LuxorInvoice
  booking?: LuxorBooking | null
  balanceDue: number
  daysUntil60Days?: number | null
  notes?: LuxorNote[]
  kind?: 'unpaid_invoice' | 'sixty_day_deadline' | 'final_payment'
}): Promise<{ copy: string; aiGenerated: boolean }> {
  const fallback = input.kind === 'sixty_day_deadline'
    ? `As your event date approaches, we wanted to remind you that your remaining balance and refundable security deposit are due 60 days before your celebration. Please review your invoice and submit payment to ensure everything remains seamlessly reserved.`
    : `We are reaching out to provide a quick update regarding your invoice for ${input.inquiry.event_type || 'your upcoming event'}. Please review the payment details below and let us know if you have any questions.`

  const apiKey = process.env.OPEN_ROUTER_API_KEY
  if (!apiKey) return { copy: fallback, aiGenerated: false }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://luxoratlaspalmas.com',
        'X-Title': 'Luxor Invoice Reminder Email Writer',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'Write 2 warm, elegant, concise sentences for a Luxor Event Space payment reminder email. Tailor the text using client details, event type, guest count, upcoming 60-day balance deadline, deposit mode, and recent notes. Do not invent facts, amenities, or promises. Return only the two sentences (maximum 60 words total).',
          },
          {
            role: 'user',
            content: JSON.stringify({
              clientName: input.inquiry.full_name,
              eventType: input.inquiry.event_type,
              eventDate: input.booking?.event_date || input.inquiry.target_date,
              guestCount: input.booking?.guest_count || input.inquiry.guest_count,
              packageName: input.booking?.package_name || input.inquiry.package_interest,
              balanceDue: input.balanceDue,
              invoiceTotal: input.invoice.total,
              daysUntil60Days: input.daysUntil60Days,
              reminderKind: input.kind || 'unpaid_invoice',
              inquiryMessage: input.inquiry.message,
              recentNotes: (input.notes || []).slice(-5).map((n) => n.content),
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    })

    if (!response.ok) return { copy: fallback, aiGenerated: false }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const copy = payload.choices?.[0]?.message?.content?.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
    return copy ? { copy: copy.slice(0, 480), aiGenerated: true } : { copy: fallback, aiGenerated: false }
  } catch (error) {
    console.warn('AI invoice reminder copy fell back to template:', error instanceof Error ? error.message : error)
    return { copy: fallback, aiGenerated: false }
  }
}

export async function buildAiTailoredInvoiceReminderEmail(input: {
  inquiry: LuxorInquiry
  invoice: LuxorInvoice
  booking?: LuxorBooking | null
  reviewUrl: string
  balanceDue: number
  dueDate?: string | null
  notes?: LuxorNote[]
  kind?: 'unpaid_invoice' | 'sixty_day_deadline' | 'final_payment'
}) {
  const { copy, aiGenerated } = await generateAiInvoiceReminderCopy(input)
  const is60Day = input.kind === 'sixty_day_deadline'
  const eventDate = input.booking?.event_date || input.inquiry.target_date

  const eyebrow = is60Day ? '60-Day Deadline Reminder' : 'Invoice Payment Reminder'
  const title = is60Day ? 'Your 60-day balance deadline is approaching' : 'Reminder: payment pending'
  const subject = is60Day
    ? `Upcoming: 60-day balance payment for your Luxor event (${money(input.balanceDue)})`
    : `Payment reminder: ${money(input.balanceDue)} remaining for your Luxor event`

  const securityDepositAmount = input.invoice.line_items
    .filter((item) => /security deposit/i.test(item.description) || item.category === 'Security Deposit')
    .reduce((total, item) => total + Number(item.total ?? item.unitPrice ?? 0) * Math.max(1, Number(item.quantity || 1)), 0)

  const detailText = [
    `Balance due: ${money(input.balanceDue)}`,
    input.dueDate ? `Due date: ${input.dueDate}` : null,
    eventDate ? `Event date: ${eventDate}` : null,
    securityDepositAmount > 0 ? `Includes ${money(securityDepositAmount)} refundable security deposit` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    subject,
    aiGenerated,
    body: brandedEmail({
      eyebrow,
      title,
      greeting: `Hi ${firstName(input.inquiry.full_name)},`,
      copy,
      detail: detailText,
      buttonLabel: 'Review & Pay Balance Securely',
      buttonUrl: input.reviewUrl,
    }),
  }
}

export function lifecycleAutomationKey(kind: LuxorEmailJobKind, recordId: string) {
  return `${kind}:${recordId}`
}
