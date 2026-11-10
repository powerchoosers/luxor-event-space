export type BrochureDeliveryCopy = { subject: string; preview: string; title: string; greeting: string; body: string; note: string }

/** The original delivery wording; links and venue footer are owned by the email renderer. */
export const BROCHURE_DELIVERY_DEFAULT: BrochureDeliveryCopy = {
  subject: 'Your Luxor at Las Palmas Venue Brochure',
  preview: 'Your free Luxor at Las Palmas venue brochure is ready.',
  title: 'Your Luxor Venue Brochure',
  greeting: 'Hi {{first_name}},',
  body: 'Thank you for your interest in Luxor at Las Palmas Events! We are delighted to share our official venue brochure with you.\n\nInside, you’ll find floor plans, included amenities, spaces, and planning details for weddings, quinceañeras, and private celebrations.\n\nWhenever you are ready to walk the room in person and talk through your date, we invite you to schedule a visit.',
  note: 'If you have questions or would like to check a specific date, you can also reach us directly at (210) 906-8803 or reply to this email.',
}
const LIMITS: Record<keyof BrochureDeliveryCopy, number> = { subject: 120, preview: 180, title: 100, greeting: 100, body: 1800, note: 600 }
const VARIABLES = /\{\{(first_name|event_type|guest_count)\}\}/g

export function validateBrochureDeliveryCopy(value: unknown): BrochureDeliveryCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all brochure email fields.')
  const input = value as Record<string, unknown>
  const fields = Object.keys(LIMITS) as Array<keyof BrochureDeliveryCopy>
  if (Object.keys(input).some((key) => !fields.includes(key as keyof BrochureDeliveryCopy))) throw new Error('Unknown brochure email field.')
  const result = {} as BrochureDeliveryCopy
  for (const field of fields) {
    const raw = input[field]
    if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > LIMITS[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = raw.trim()
    const remainder = clean.replace(VARIABLES, '')
    if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('Use only the listed brochure email variables.')
    if (field !== 'body' && field !== 'note' && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    result[field] = clean
  }
  return result
}

export function renderBrochureDeliveryCopy(copy: BrochureDeliveryCopy, values: { first_name: string; event_type: string; guest_count: string }): BrochureDeliveryCopy {
  const valid = validateBrochureDeliveryCopy(copy)
  return Object.fromEntries(Object.entries(valid).map(([field, text]) => {
    const rendered = text.replace(VARIABLES, (_, variable: keyof typeof values) => values[variable])
    return [field, field === 'body' || field === 'note' ? rendered : rendered.replace(/[\r\n]+/g, ' ')]
  })) as BrochureDeliveryCopy
}
