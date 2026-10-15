import 'server-only'

import type { LuxorBooking, LuxorInquiry, LuxorInvoice } from './luxorInquiryTypes'
import {
  buildBrochureDeliveryEmailHtml,
  buildNewsletterConfirmationEmailHtml,
  buildTourRequestReceivedEmailHtml,
  buildLuxorFollowUpEmailHtml,
  buildStandardInquiryEmailHtml,
} from './luxorEmailJobsServer'
import { buildLuxorProposalEmail, buildLuxorProposalContractEmail, buildLuxorPaymentRequestEmail } from './luxorProposalEmailServer'
import { buildEventEmail, buildPaymentReminderEmail } from './luxorLifecycleEmailsServer'
import { buildTourReminderEmail } from './luxorTourEmailServer'
import { buildAiTourConfirmationEmail } from './luxorTourEmailServer'
import { buildLuxorTourPlan } from './luxorTourPlanningServer'
import { buildLuxorLayoutReviewEmail } from './luxorLayoutReviewsServer'
import { renderLuxorSystemEmail } from './luxorEmailDesignSystem'

const copy = {
  form_confirmation: 'Form confirmation',
  brochure: 'Venue brochure',
  tour_confirmation: 'Tour confirmation',
  tour_reminder: 'Tour reminder',
  tour_cancellation: 'Tour cancellation',
  follow_up: 'Follow up',
  proposal: 'Proposal',
  contract: 'Contract',
  booking_confirmation: 'Booking confirmation',
  payment_reminder: 'Payment reminder',
  planning: 'Planning update',
  event_notification: 'Event notification',
  post_event: 'Post event',
  review_request: 'Review request',
  direct_message: 'Email reply',
  other: 'Test workflow notice',
} as const

export type LuxorTestEmailCategory = keyof typeof copy

const TEST_LEAD_ID = '00b264d6-a3fb-4ea3-9142-415f76385c39'
const TEST_EVENT_DATE = '2026-12-12'
const TEST_TOUR_DATE = '2026-11-01'

export function isLuxorTestEmailCategory(value: string): value is LuxorTestEmailCategory {
  return Object.hasOwn(copy, value)
}

function safeRunId(runId: string) {
  return runId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36)
}

function safePortalUrl(runId: string) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
  return `${origin}/portal/leads/${TEST_LEAD_ID}?testRunId=${encodeURIComponent(safeRunId(runId))}&testPreview=1`
}

function syntheticInquiry(): LuxorInquiry {
  return {
    id: TEST_LEAD_ID,
    full_name: 'Luxor Test Lead',
    email: 'luxoratlaspalmas@gmail.com',
    phone: '214-960-0276',
    event_type: 'Wedding',
    guest_count: 100,
    target_date: TEST_EVENT_DATE,
    preferred_tour_date: TEST_TOUR_DATE,
    preferred_tour_time: '11:00 AM',
    package_interest: 'Gold Celebration Package',
    message: 'Synthetic test details only. No customer information is used.',
    status: 'new',
    pipeline_stage: 'inquiry',
    marketing_opt_in: false,
    created_at: '2026-10-15T12:00:00.000Z',
    updated_at: '2026-10-15T12:00:00.000Z',
    is_test: true,
    metadata: { is_test_record: true, synthetic_test_data: true },
  } as unknown as LuxorInquiry
}

function syntheticInvoice(): LuxorInvoice {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    created_at: '2026-10-15T12:00:00.000Z',
    updated_at: '2026-10-15T12:00:00.000Z',
    inquiry_id: TEST_LEAD_ID,
    client_name: 'Luxor Test Lead',
    event_type: 'Wedding',
    description: 'Synthetic test proposal. Not a quote or invoice.',
    line_items: [{ category: 'Package', description: 'Synthetic Gold Celebration Package', quantity: 1, unitPrice: 5000, total: 5000 }],
    subtotal: 5000,
    tax_rate: 0.0825,
    total: 5412.5,
    status: 'draft',
    due_date: null,
    paid_at: null,
    notes: 'Synthetic test data. No payment due.',
    invoice_kind: 'event',
    proposal_number: 1,
    proposal_context: {
      version: 1,
      package_name: 'Gold Celebration Package (synthetic test package)',
      event_type: 'Wedding',
      event_date: TEST_EVENT_DATE,
      expected_guest_count: 100,
      final_event_price: 5000,
      refundable_security_deposit: 750,
      amount_due_to_book: 1250,
      payment_plan: { mode: 'deposit_and_balance', booking_payment_percent: 25, final_payment_due_days_before_event: 30 },
      publication_errors: [],
    },
  } as unknown as LuxorInvoice
}

function syntheticBooking(): LuxorBooking {
  return {
    id: '00000000-0000-4000-8000-000000000002',
    created_at: '2026-10-15T12:00:00.000Z',
    updated_at: '2026-10-15T12:00:00.000Z',
    inquiry_id: TEST_LEAD_ID,
    invoice_id: '00000000-0000-4000-8000-000000000001',
    client_name: 'Luxor Test Lead',
    email: 'luxoratlaspalmas@gmail.com',
    phone: '214-960-0276',
    event_type: 'Wedding',
    event_date: TEST_EVENT_DATE,
    start_time: '17:00',
    end_time: '23:00',
    guest_count: 100,
    package_name: 'Gold Celebration Package (synthetic test package)',
    status: 'tentative',
    booked_at: null,
    contract_total: 5412.5,
    deposit_required: 1250,
    security_deposit_amount: 750,
    final_payment_due_date: '2026-11-12',
    contract_status: 'not_sent',
    notes: 'Synthetic test booking only. No inventory is reserved.',
    metadata: { simulation_only: true, inventory_reserved: false, money_moved: false },
  } as unknown as LuxorBooking
}

function testBanner(runId: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:2px solid #1254a6;background:#eaf2ff"><tr><td style="padding:14px 18px;color:#17365d;font-family:Arial,sans-serif;font-size:13px;line-height:1.6"><strong style="display:block;letter-spacing:.12em">SIMULATED TEST MESSAGE · NO CUSTOMER ACTION</strong>Synthetic Luxor data for run ${safeRunId(runId)}. Links open the protected test-lead page. They cannot accept a proposal, sign a contract, create a booking, or collect payment.</td></tr></table>`
}

function markTestOnly(subject: string, body: string, runId: string) {
  const safeUrl = safePortalUrl(runId)
  const banner = testBanner(runId)
  const safeActions = body.replace(/href=(['"])(https?:\/\/[^'"]*)\1/gi, (_match, quote: string) => `href=${quote}${safeUrl}${quote}`)
  const html = /<body\b[^>]*>/i.test(safeActions)
    ? safeActions.replace(/<body\b[^>]*>/i, (opening) => `${opening}${banner}`)
    : `<html><body>${banner}${safeActions}</body></html>`
  return { subject: `[TEST ONLY] ${subject}`, body: html }
}

export async function buildLuxorTestEmailTemplate(category: LuxorTestEmailCategory, runId: string, options: {
  flow?: string | null
  preferredTourDate?: string | null
  preferredTourTime?: string | null
  confirmedSlot?: boolean
  reminderLabel?: 'tomorrow' | 'soon'
} = {}) {
  const inquiry = syntheticInquiry()
  inquiry.preferred_tour_date = options.preferredTourDate || inquiry.preferred_tour_date
  inquiry.preferred_tour_time = options.preferredTourTime || inquiry.preferred_tour_time
  const invoice = syntheticInvoice()
  const booking = syntheticBooking()
  const portalUrl = safePortalUrl(runId)
  const tourContext = {
    inquiry,
    meetingType: 'Venue tour (simulated)',
    clientFacingNotes: 'Synthetic test walkthrough; no tour is scheduled.',
    tourDateLabel: 'November 1, 2026',
    tourTimeLabel: '11:00 AM',
    durationMinutes: 30,
    responseUrl: portalUrl,
    contactPhone: null,
  }

  if (category === 'form_confirmation' || category === 'other') {
    if (category === 'form_confirmation' && options.flow === 'newsletter_signup') {
      return markTestOnly('Welcome to Luxor', buildNewsletterConfirmationEmailHtml(inquiry), runId)
    }
    return markTestOnly('Your celebration starts here', buildStandardInquiryEmailHtml(inquiry), runId)
  }
  if (category === 'brochure') {
    return markTestOnly('Your Luxor Venue Brochure', buildBrochureDeliveryEmailHtml(inquiry), runId)
  }
  if (category === 'tour_confirmation') {
    if (!options.confirmedSlot && (options.flow || options.preferredTourDate || options.preferredTourTime)) {
      return markTestOnly('Your Luxor tour request is received', buildTourRequestReceivedEmailHtml(inquiry, safeRunId(runId)), runId)
    }
    if (options.confirmedSlot && options.preferredTourDate && options.preferredTourTime) {
      const planned = await buildLuxorTestTourPlan(runId, options.preferredTourDate, options.preferredTourTime, inquiry)
      return planned.emails.confirmation
    }
    const personalized = await buildAiTourConfirmationEmail(tourContext, { skipAi: true })
    return markTestOnly(personalized.subject, personalized.body, runId)
  }
  if (category === 'tour_reminder') {
    const email = buildTourReminderEmail(tourContext, options.reminderLabel || 'tomorrow')
    return markTestOnly(email.subject, email.body, runId)
  }
  if (category === 'tour_cancellation') {
    const subject = 'Your Luxor tour has been cancelled'
    const email = renderLuxorSystemEmail({
      previewText: 'The simulated Luxor tour was cancelled.',
      eyebrow: 'Tour update', title: 'Your tour was cancelled',
      greeting: 'Hi Luxor Test Lead,',
      bodyHtml: '<p style="margin:0">This simulated test run cancelled the tour request. No venue calendar event or inventory was changed.</p>',
      details: [
        { label: 'Previous date', value: options.preferredTourDate || 'No date selected' },
        { label: 'Previous time', value: options.preferredTourTime || 'No time selected' },
      ],
      actions: [{ label: 'View simulated test run', url: portalUrl }],
      note: 'This notice is for the authorized Luxor test inbox only.', theme: 'brand',
    })
    return markTestOnly(subject, email, runId)
  }
  if (category === 'follow_up') {
    const email = {
      subject: 'A note from Luxor',
      body: buildLuxorFollowUpEmailHtml(inquiry, {
        name: 'Your Luxor plans', subject: 'A note from Luxor',
        body: 'We would be happy to help you explore the venue and answer questions about planning your celebration.',
        cta_text: 'View your test run', cta_url: portalUrl,
        secondary_cta_text: 'Explore Luxor', secondary_cta_url: '/',
      }, portalUrl),
    }
    return markTestOnly(email.subject, email.body, runId)
  }
  if (category === 'proposal') {
    const email = buildLuxorProposalEmail({ invoice, inquiry, reviewUrl: portalUrl })
    return markTestOnly(email.subject, email.html, runId)
  }
  if (category === 'contract') {
    const email = await buildLuxorProposalContractEmail({
      invoice, inquiry, booking, signingUrl: portalUrl,
      introductionOverride: 'This synthetic agreement email demonstrates the standard Luxor signing message. No contract was created or signed.',
    })
    return markTestOnly(email.subject, email.html, runId)
  }
  if (category === 'booking_confirmation') {
    const email = await buildLuxorPaymentRequestEmail({
      invoice, inquiry, booking, paymentUrl: portalUrl,
      paymentAmount: 1250, paymentLabel: 'Synthetic booking payment', paidTotal: 0, balanceDue: 5412.5,
      introductionOverride: 'This synthetic booking payment email demonstrates the standard Luxor booking flow. No payment link or charge was created.',
    })
    return markTestOnly(email.subject, email.html, runId)
  }
  if (category === 'payment_reminder') {
    const email = buildPaymentReminderEmail({ inquiry, reviewUrl: portalUrl, paymentAmount: 1250, paymentLabel: 'synthetic test payment' })
    return markTestOnly(email.subject, email.body, runId)
  }
  if (category === 'planning') {
    const email = buildEventEmail({ inquiry, booking, kind: 'details' })
    return markTestOnly(email.subject, email.body, runId)
  }
  if (category === 'event_notification') {
    const email = buildEventEmail({ inquiry, booking, kind: 'day' })
    return markTestOnly(email.subject, email.body, runId)
  }
  if (category === 'post_event') {
    const email = buildEventEmail({ inquiry, booking, kind: 'thanks' })
    return markTestOnly(email.subject, email.body, runId)
  }
  if (category === 'review_request') {
    const email = renderLuxorSystemEmail({
      previewText: 'A simulated request to review your Luxor experience.',
      eyebrow: 'Review request', title: 'Share your Luxor experience',
      greeting: 'Hi Luxor Test Lead,',
      bodyHtml: '<p style="margin:0">This is the approved Luxor review-request layout with synthetic test data. No public review will be submitted by this message.</p>',
      actions: [{ label: 'Open the simulated test run', url: portalUrl }],
      note: 'This test message does not create or publish a review.', theme: 'brand',
    })
    return markTestOnly('Thank you for celebrating at Luxor', email, runId)
  }
  if (category === 'direct_message') {
    const email = renderLuxorSystemEmail({
      previewText: 'A controlled Luxor test reply.',
      eyebrow: 'Test email reply', title: 'A reply from Luxor',
      greeting: 'Hi Luxor Test Lead,',
      bodyHtml: '<p style="margin:0">This controlled reply uses synthetic content. The original message and any user-entered customer text are excluded.</p>',
      actions: [{ label: 'Open the simulated test run', url: portalUrl }],
      note: 'Reply to this email only if you need help with the test workflow.', theme: 'brand',
    })
    return markTestOnly('Your Luxor test workflow reply', email, runId)
  }
  const layoutEmail = buildLuxorLayoutReviewEmail({
    clientName: inquiry.full_name,
    review: { layout_name: 'Synthetic Gold Celebration Layout', expires_at: '2026-11-15T12:00:00.000Z' },
    reviewUrl: portalUrl,
  })
  return markTestOnly(layoutEmail.subject, `<p>${layoutEmail.body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br />')}</p>`, runId)
}

export async function buildLuxorTestTourPlan(runId: string, date: string, time: string, existingInquiry?: LuxorInquiry) {
  const inquiry = existingInquiry || syntheticInquiry()
  inquiry.preferred_tour_date = date
  inquiry.preferred_tour_time = time
  const plan = await buildLuxorTourPlan({
    inquiry, date, time, responseToken: `test-${safeRunId(runId)}`, responseUrl: safePortalUrl(runId),
    attendeeEmails: ['luxoratlaspalmas@gmail.com'], meetingType: 'Private Venue Tour',
    clientFacingNotes: 'Synthetic test walkthrough; no venue calendar or inventory is reserved.',
    durationMinutes: 30,
  })
  const emails = {
    confirmation: markTestOnly(plan.templates.confirmation.subject, plan.templates.confirmation.body, runId),
    reminder_24: markTestOnly(plan.templates.reminder_24.subject, plan.templates.reminder_24.body, runId),
    reminder_2: markTestOnly(plan.templates.reminder_2.subject, plan.templates.reminder_2.body, runId),
  }
  const start = plan.startUtc.getTime()
  return {
    plan,
    emails,
    scheduledFor: {
      confirmation: new Date().toISOString(),
      reminder_24: new Date(Math.max(Date.now(), start - 24 * 60 * 60_000)).toISOString(),
      reminder_2: new Date(Math.max(Date.now(), start - 2 * 60 * 60_000)).toISOString(),
    },
  }
}
