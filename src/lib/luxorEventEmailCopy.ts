export const EVENT_EMAIL_KEYS = ['details', 'day', 'thanks'] as const
export type EventEmailKey = typeof EVENT_EMAIL_KEYS[number]
export type EventEmailCopy = { subject: string; title: string; greeting: string; body: string }
export const EVENT_EMAIL_DEFAULTS: Record<EventEmailKey, EventEmailCopy> = {
  details: { subject: 'Let’s confirm the final details for your Luxor event', title: 'Final details check-in', greeting: 'Hi {{first_name}},', body: 'Please reply with any final guest-count, vendor, layout, or timing changes so our team can keep the event plan accurate.' },
  day: { subject: 'Your Luxor event is almost here', title: 'We will see you soon', greeting: 'Hi {{first_name}},', body: 'Your Luxor event is almost here. Reply if your arrival time or day-of contact has changed.' },
  thanks: { subject: 'Thank you for celebrating at Luxor', title: 'It was an honor to host you', greeting: 'Hi {{first_name}},', body: 'Thank you for choosing Luxor Event Space for your {{event_type}}. We hope the day felt every bit as special as you planned.' },
}
const limits: Record<keyof EventEmailCopy, number> = { subject: 120, title: 100, greeting: 100, body: 1200 }
const variables = /\{\{(first_name|event_type)\}\}/g
export function validateEventEmailCopy(input: unknown): EventEmailCopy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter all event email fields.')
  const record = input as Record<string, unknown>, fields = Object.keys(limits) as Array<keyof EventEmailCopy>
  if (Object.keys(record).some((key) => !fields.includes(key as keyof EventEmailCopy))) throw new Error('Unknown event email field.')
  const result = {} as EventEmailCopy
  for (const field of fields) {
    const value = record[field]
    if (typeof value !== 'string' || !value.trim() || value.trim().length > limits[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = value.trim(), remainder = clean.replace(variables, '')
    if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('Use only the listed event email variables.')
    if (field !== 'body' && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    result[field] = clean
  }
  return result
}
export function renderEventEmailCopy(copy: EventEmailCopy, values: { first_name: string; event_type: string }): EventEmailCopy {
  const valid = validateEventEmailCopy(copy)
  return Object.fromEntries(Object.entries(valid).map(([field, value]) => {
    const rendered = value.replace(variables, (_, key: keyof typeof values) => values[key])
    return [field, field === 'body' ? rendered : rendered.replace(/[\r\n]+/g, ' ')]
  })) as EventEmailCopy
}
