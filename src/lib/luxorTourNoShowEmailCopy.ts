export type TourNoShowEmailCopy = { subject: string; greeting: string; body: string }
export const TOUR_NO_SHOW_DEFAULT: TourNoShowEmailCopy = {
  subject: 'Want to reschedule your Luxor tour?', greeting: 'Hi {{full_name}},',
  body: 'We missed you for your Luxor at Las Palmas Events tour for {{event_details}}.',
}
const limits: Record<keyof TourNoShowEmailCopy, number> = { subject: 120, greeting: 100, body: 1200 }
const variables = /\{\{(full_name|first_name|event_details)\}\}/g
export function validateTourNoShowEmailCopy(value: unknown): TourNoShowEmailCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all email fields.')
  const input = value as Record<string, unknown>, fields = Object.keys(limits) as Array<keyof TourNoShowEmailCopy>
  if (Object.keys(input).some((key) => !fields.includes(key as keyof TourNoShowEmailCopy))) throw new Error('Unknown email field.')
  const result = {} as TourNoShowEmailCopy
  for (const field of fields) {
    const raw = input[field]
    if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > limits[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = raw.trim(), remainder = clean.replace(variables, '')
    if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('Use only the listed email variables.')
    if (field !== 'body' && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    result[field] = clean
  }
  return result
}
export function renderTourNoShowEmailCopy(copy: TourNoShowEmailCopy, values: { full_name: string; first_name: string; event_details: string }): TourNoShowEmailCopy {
  const clean = validateTourNoShowEmailCopy(copy)
  return Object.fromEntries(Object.entries(clean).map(([key, value]) => [key, value.replace(variables, (_, variable: keyof typeof values) => key === 'body' ? values[variable] : values[variable].replace(/[\r\n]+/g, ' '))])) as TourNoShowEmailCopy
}
