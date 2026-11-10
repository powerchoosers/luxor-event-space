export type LayoutReviewEmailCopy = { subject: string; greeting: string; body: string; closing: string }
export const LAYOUT_REVIEW_EMAIL_DEFAULT: LayoutReviewEmailCopy = {
  subject: 'Your Luxor event layout is ready to review', greeting: 'Hi {{first_name}},',
  body: 'Your saved event layout, “{{layout_name}},” is ready to review. Open the private link below to explore the 3D setup, approve the plan, or send us any requested changes.',
  closing: 'We look forward to bringing your celebration to life.',
}
const limits: Record<keyof LayoutReviewEmailCopy, number> = { subject: 120, greeting: 100, body: 1200, closing: 600 }
const variables = /\{\{(first_name|layout_name)\}\}/g
export function validateLayoutReviewEmailCopy(value: unknown): LayoutReviewEmailCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all email fields.')
  const input = value as Record<string, unknown>, fields = Object.keys(limits) as Array<keyof LayoutReviewEmailCopy>
  if (Object.keys(input).some((key) => !fields.includes(key as keyof LayoutReviewEmailCopy))) throw new Error('Unknown email field.')
  const result = {} as LayoutReviewEmailCopy
  for (const field of fields) {
    const raw = input[field]
    if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > limits[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = raw.trim(), remainder = clean.replace(variables, '')
    if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('Use only the listed email variables.')
    if (field !== 'body' && field !== 'closing' && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    result[field] = clean
  }
  return result
}
export function renderLayoutReviewEmailCopy(copy: LayoutReviewEmailCopy, values: { first_name: string; layout_name: string }): LayoutReviewEmailCopy {
  const clean = validateLayoutReviewEmailCopy(copy)
  return Object.fromEntries(Object.entries(clean).map(([key, value]) => [key, value.replace(variables, (_, variable: keyof typeof values) => key === 'body' || key === 'closing' ? values[variable] : values[variable].replace(/[\r\n]+/g, ' '))])) as LayoutReviewEmailCopy
}
