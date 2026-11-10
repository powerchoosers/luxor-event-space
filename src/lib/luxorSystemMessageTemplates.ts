export const INQUIRY_CONFIRMATION_DEFAULT = 'Hi {{first_name}}, we received your {{event_type}} inquiry and will follow up with availability and next steps.'
export const INQUIRY_CONFIRMATION_VARIABLES = /\{\{(first_name|full_name|event_type|guest_count|target_date)\}\}/g
export const INQUIRY_CONFIRMATION_CHIP_TOKENS = ['{{first_name}}', '{{full_name}}', '{{event_type}}', '{{guest_count}}', '{{target_date}}'] as const

function formatInquiryTargetDate(value: string | null | undefined) {
  if (!value) return 'your requested date'
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed)
}

function inquiryGuestCountLabel(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return 'your group'
  return String(value)
}
export const SYSTEM_TEXT_PREFIX = 'Luxor Event Space: '
export const SYSTEM_TEXT_FOOTER = 'Reply STOP to opt out.'
export const PAYMENT_CONFIRMATION_DEFAULT = 'Hi {{first_name}}, we received your payment of {{amount}}. Thank you. Reply with any questions.'
export const EVENT_REMINDER_DEFAULT = 'Hi {{first_name}}, your {{event_type}} is {{time_until}} away on {{event_date}}. Reply with any final questions or updates.'
export const TOUR_TEXT_DEFAULTS = {
  tour_confirmation: 'Hi {{first_name}}, your private venue tour is confirmed for {{tour_date}}{{tour_time_suffix}}. Reply with any questions.',
  tour_reminder: 'Reminder for your private venue tour tomorrow{{tour_time_suffix}}. We look forward to meeting you.',
} as const
export type TourTextTemplateKey = keyof typeof TOUR_TEXT_DEFAULTS

export function validateTourTextTemplate(value: unknown, key: TourTextTemplateKey) {
  if (typeof value !== 'string') throw new Error('Enter the tour text message.')
  const body = value.trim()
  if (!body || body.length > 300) throw new Error('Keep the message between 1 and 300 characters.')
  if (key === 'tour_confirmation' && !body.includes('{{tour_date}}')) throw new Error('Include {{tour_date}} so the guest can identify the appointment.')
  const stripped = body.replace(/\{\{(?:first_name|tour_date|tour_time_suffix)\}\}/g, '')
  if (stripped.includes('{{') || stripped.includes('}}')) throw new Error('Use only the listed tour variables.')
  return body
}

export function renderTourText(template: string, key: TourTextTemplateKey, input: { name: string; date: string; time: string | null | undefined }) {
  const body = validateTourTextTemplate(template, key)
  const values: Record<string, string> = { first_name: input.name.trim().split(/\s+/)[0] || 'there', tour_date: input.date, tour_time_suffix: input.time ? ` at ${input.time}` : '' }
  return `${SYSTEM_TEXT_PREFIX}${body.replace(/\{\{(first_name|tour_date|tour_time_suffix)\}\}/g, (_, variable: string) => values[variable])} ${SYSTEM_TEXT_FOOTER}`
}
export const INVOICE_REMINDER_DEFAULTS = {
  invoice_due_reminder: 'Hi {{first_name}}, a friendly reminder that your {{amount}} invoice is due {{due_date}}. Please use your secure invoice link or contact us with questions.',
  invoice_overdue_reminder: 'Hi {{first_name}}, our records show your {{amount}} invoice due {{due_date}} is still unpaid. Please use your secure invoice link or contact us for help.',
  invoice_payment_request: 'Hi {{first_name}}, this is a reminder that your {{amount}} payment request is still open. Pay securely here: {{payment_url}}',
} as const
export type InvoiceReminderTemplateKey = keyof typeof INVOICE_REMINDER_DEFAULTS

export function validateInvoiceReminderTemplate(value: unknown, key: InvoiceReminderTemplateKey = 'invoice_due_reminder') {
  if (typeof value !== 'string') throw new Error('Enter the invoice reminder message.')
  const body = value.trim()
  if (!body || body.length > 300) throw new Error('Keep the message between 1 and 300 characters.')
  if (key === 'invoice_payment_request') {
    if (!body.includes('{{amount}}') || (body.match(/\{\{payment_url\}\}/g) || []).length !== 1) throw new Error('Include {{amount}} and exactly one {{payment_url}} for the payment request.')
    if (/https?:\/\/|www\./i.test(body)) throw new Error('Use {{payment_url}} for the secure payment link instead of a written URL.')
  } else if (!body.includes('{{amount}}') || !body.includes('{{due_date}}')) throw new Error('Include {{amount}} and {{due_date}} so the recipient can identify the invoice.')
  const stripped = body.replace(key === 'invoice_payment_request' ? /\{\{(?:first_name|amount|payment_url)\}\}/g : /\{\{(?:first_name|amount|due_date)\}\}/g, '')
  if (stripped.includes('{{') || stripped.includes('}}')) throw new Error('Use only the listed invoice variables.')
  return body
}

export function renderInvoiceReminder(template: string, input: { name: string; amount: string; dueDate?: string; paymentUrl?: string }, key: InvoiceReminderTemplateKey = 'invoice_due_reminder') {
  const body = validateInvoiceReminderTemplate(template, key)
  const values: Record<string, string> = { first_name: input.name.trim().split(/\s+/)[0] || 'there', amount: input.amount, due_date: input.dueDate || '', payment_url: input.paymentUrl || '' }
  if (key === 'invoice_payment_request' && !input.paymentUrl) throw new Error('The payment link is unavailable.')
  return `${SYSTEM_TEXT_PREFIX}${body.replace(/\{\{(first_name|amount|due_date|payment_url)\}\}/g, (_, variable: string) => values[variable])} ${SYSTEM_TEXT_FOOTER}`
}

export function validateEventReminderTemplate(value: unknown) {
  if (typeof value !== 'string') throw new Error('Enter the event reminder message.')
  const body = value.trim()
  if (!body || body.length > 300) throw new Error('Keep the message between 1 and 300 characters.')
  if (!body.includes('{{event_date}}')) throw new Error('Include {{event_date}} so the recipient can identify the event date.')
  const stripped = body.replace(/\{\{(?:first_name|event_type|time_until|event_date)\}\}/g, '')
  if (stripped.includes('{{') || stripped.includes('}}')) throw new Error('Use only the listed event variables.')
  return body
}

export function renderEventReminder(template: string, input: { name: string; eventType: string | null | undefined; timeUntil: string; eventDate: string }) {
  const body = validateEventReminderTemplate(template)
  const values: Record<string, string> = { first_name: input.name.trim().split(/\s+/)[0] || 'there', event_type: input.eventType || 'event', time_until: input.timeUntil, event_date: input.eventDate }
  return `${SYSTEM_TEXT_PREFIX}${body.replace(/\{\{(first_name|event_type|time_until|event_date)\}\}/g, (_, key: string) => values[key])} ${SYSTEM_TEXT_FOOTER}`
}

export function validatePaymentConfirmationTemplate(value: unknown) {
  if (typeof value !== 'string') throw new Error('Enter the payment confirmation message.')
  const body = value.trim()
  if (!body || body.length > 300) throw new Error('Keep the message between 1 and 300 characters.')
  if (!body.includes('{{amount}}')) throw new Error('Include {{amount}} so the recipient can identify the payment.')
  const stripped = body.replace(/\{\{(?:first_name|amount)\}\}/g, '')
  if (stripped.includes('{{') || stripped.includes('}}')) throw new Error('Use only {{first_name}} and {{amount}} as variables.')
  return body
}

export function renderPaymentConfirmation(template: string, input: { name: string; amount: string }) {
  const body = validatePaymentConfirmationTemplate(template)
  const name = input.name.trim().split(/\s+/)[0] || 'there'
  return `${SYSTEM_TEXT_PREFIX}${body.replace(/\{\{(first_name|amount)\}\}/g, (_, key: string) => key === 'first_name' ? name : input.amount)} ${SYSTEM_TEXT_FOOTER}`
}

export function validateInquiryConfirmationTemplate(value: unknown) {
  if (typeof value !== 'string') throw new Error('Enter the inquiry confirmation message.')
  const body = value.trim()
  if (!body || body.length > 300) throw new Error('Keep the message between 1 and 300 characters.')
  const stripped = body.replace(INQUIRY_CONFIRMATION_VARIABLES, '')
  if (stripped.includes('{{') || stripped.includes('}}')) throw new Error('Use only the listed inquiry confirmation variables.')
  return body
}

export function renderInquiryConfirmation(
  template: string,
  input: {
    fullName: string
    eventType: string | null | undefined
    guestCount?: number | null
    targetDate?: string | null
  },
) {
  const body = validateInquiryConfirmationTemplate(template)
  const trimmedName = input.fullName.trim()
  const values: Record<string, string> = {
    first_name: trimmedName ? trimmedName.split(/\s+/)[0] || 'there' : 'there',
    full_name: trimmedName || 'Guest',
    event_type: input.eventType || 'event',
    guest_count: inquiryGuestCountLabel(input.guestCount),
    target_date: formatInquiryTargetDate(input.targetDate),
  }
  const rendered = body.replace(INQUIRY_CONFIRMATION_VARIABLES, (_, key: string) => values[key])
  return `${SYSTEM_TEXT_PREFIX}${rendered} ${SYSTEM_TEXT_FOOTER}`
}
