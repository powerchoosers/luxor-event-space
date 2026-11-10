export const FINAL_PAYMENT_REMINDER_KEYS = ['payment_request', '14_days', '7_days', 'due_date'] as const
export type FinalPaymentReminderKey = typeof FINAL_PAYMENT_REMINDER_KEYS[number]
export type FinalPaymentReminderCopy = { subject: string; title: string; greeting: string; body: string }
export const FINAL_PAYMENT_REMINDER_DEFAULT: FinalPaymentReminderCopy = {
  subject: 'Final payment reminder for your Luxor event',
  title: 'Final Event Price payment reminder',
  greeting: 'Hi {{first_name}},',
  body: 'This is a reminder that your remaining Final Event Price balance is due on the date set out in your Event Agreement. The separate refundable security deposit is billed independently from your initial booking payment and remains held under the Event Agreement.',
}
const limits: Record<keyof FinalPaymentReminderCopy, number> = { subject: 120, title: 100, greeting: 100, body: 1200 }
export function validateFinalPaymentReminderCopy(input: unknown): FinalPaymentReminderCopy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter all reminder fields.')
  const record = input as Record<string, unknown>, fields = Object.keys(limits) as Array<keyof FinalPaymentReminderCopy>
  if (Object.keys(record).some((key) => !fields.includes(key as keyof FinalPaymentReminderCopy))) throw new Error('Unknown reminder field.')
  const result = {} as FinalPaymentReminderCopy
  for (const field of fields) {
    const value = record[field]
    if (typeof value !== 'string' || !value.trim() || value.trim().length > limits[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = value.trim(), remainder = clean.replaceAll('{{first_name}}', '')
    if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('Use only the listed reminder variables.')
    if (field !== 'body' && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    result[field] = clean
  }
  return result
}
export function renderFinalPaymentReminderCopy(copy: FinalPaymentReminderCopy, firstName: string): FinalPaymentReminderCopy {
  const valid = validateFinalPaymentReminderCopy(copy)
  return Object.fromEntries(Object.entries(valid).map(([field, value]) => {
    const rendered = value.replaceAll('{{first_name}}', firstName)
    return [field, field === 'body' ? rendered : rendered.replace(/[\r\n]+/g, ' ')]
  })) as FinalPaymentReminderCopy
}
