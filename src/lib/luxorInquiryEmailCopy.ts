/** Editable words in the inquiry receipt. Venue details and the visit link stay in the renderer. */
export type InquiryEmailCopy = {
  subject: string
  preview: string
  title: string
  greeting: string
  body: string
  note: string
}

export const INQUIRY_EMAIL_DEFAULT: InquiryEmailCopy = {
  subject: 'We have received your Luxor inquiry',
  preview: 'We received your Luxor inquiry and will connect with you shortly.',
  title: 'Your celebration starts here',
  greeting: 'Hi {{first_name}},',
  body: 'Thank you for reaching out to Luxor Event Space. Our team is reviewing your event details so we can prepare useful package options and thoughtful next steps.',
  note: 'A coordinator will connect with you shortly. Reply to this email at any time if there is another detail we should know.',
}

export const RECEIPT_EMAIL_DEFAULTS: Record<'tour_request_received' | 'newsletter_confirmation', InquiryEmailCopy> = {
  tour_request_received: { subject: 'Your Luxor tour request is received', preview: 'We received your Schedule a Visit request and are reviewing the details.', title: 'Thanks for your request', greeting: 'Hi {{first_name}},', body: 'Thank you for scheduling a visit to Luxor Event Space. Our team is reviewing your preferred date and time and will send an official confirmation with calendar details once it is accepted.', note: 'Reply to this email if you need to adjust your request.' },
  newsletter_confirmation: { subject: 'You’re on the Luxor list', preview: 'You are on the Luxor Event Space newsletter list.', title: 'You’re on the list', greeting: 'Hi {{first_name}},', body: 'Thank you for joining Luxor’s newsletter. We’ll share occasional open-house invitations, venue news, and practical ideas for planning a celebration that feels like yours.', note: 'Thank you for joining us.' },
}

const LIMITS: Record<keyof InquiryEmailCopy, number> = { subject: 120, preview: 180, title: 100, greeting: 100, body: 1200, note: 600 }
const VARIABLES = /\{\{(first_name|event_type|guest_count)\}\}/g

export function validateInquiryEmailCopy(value: unknown): InquiryEmailCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all inquiry email fields.')
  const input = value as Record<string, unknown>
  const fields = Object.keys(LIMITS) as Array<keyof InquiryEmailCopy>
  if (Object.keys(input).some((key) => !fields.includes(key as keyof InquiryEmailCopy))) throw new Error('Unknown inquiry email field.')
  const result = {} as InquiryEmailCopy
  for (const field of fields) {
    const raw = input[field]
    if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > LIMITS[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = raw.trim()
    const remainder = clean.replace(VARIABLES, '')
    if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('Use only the listed inquiry email variables.')
    if (field !== 'body' && field !== 'note' && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    result[field] = clean
  }
  return result
}

export function renderInquiryEmailCopy(copy: InquiryEmailCopy, values: { first_name: string; event_type: string; guest_count: string }): InquiryEmailCopy {
  const valid = validateInquiryEmailCopy(copy)
  return Object.fromEntries(Object.entries(valid).map(([field, text]) => {
    const rendered = text.replace(VARIABLES, (_, variable: keyof typeof values) => values[variable])
    return [field, field === 'body' || field === 'note' ? rendered : rendered.replace(/[\r\n]+/g, ' ')]
  })) as InquiryEmailCopy
}
