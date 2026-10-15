import 'server-only'

const copy = {
  form_confirmation: ['Test inquiry received', 'Your test inquiry was received and added to an isolated workflow run.'],
  brochure: ['Test brochure request', 'This message simulates the brochure response for the test inquiry.'],
  tour_confirmation: ['Test tour confirmation', 'This message simulates a confirmed venue tour. No calendar event was created.'],
  tour_reminder: ['Test tour reminder', 'This message simulates a reminder for the test tour.'],
  follow_up: ['Test follow-up', 'This message simulates a follow-up after the test inquiry.'],
  proposal: ['Test proposal', 'This message simulates a proposal notification. No quote or invoice was created.'],
  contract: ['Test contract', 'This message simulates a contract notification. No legal document was sent or signed.'],
  booking_confirmation: ['Test booking confirmation', 'This message simulates a booking confirmation. No inventory was reserved.'],
  payment_reminder: ['Test payment reminder', 'This message simulates a payment reminder. No payment was requested or processed.'],
  planning: ['Test planning update', 'This message simulates an event planning update.'],
  event_notification: ['Test event notification', 'This message simulates an event notification.'],
  post_event: ['Test post-event follow-up', 'This message simulates a post-event follow-up.'],
  review_request: ['Test review request', 'This message simulates a review request.'],
  direct_message: ['Test email reply', 'This message simulates a reply from the test lead workflow. Original email content is intentionally omitted.'],
  other: ['Test workflow notice', 'This message simulates a test workflow notice.'],
} as const

export type LuxorTestEmailCategory = keyof typeof copy

export function isLuxorTestEmailCategory(value: string): value is LuxorTestEmailCategory {
  return Object.hasOwn(copy, value)
}

export function buildLuxorTestEmailTemplate(category: LuxorTestEmailCategory, runId: string) {
  const [subject, message] = copy[category]
  const safeRunId = runId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36)
  const footer = `Test run: ${safeRunId}. This is a controlled test message. No customer records, calendar events, legal documents, inventory, or money movement were created.`
  return {
    subject: `Luxor test workflow: ${subject}`,
    body: `<main><p>${message}</p><p>${footer}</p></main>`,
  }
}
