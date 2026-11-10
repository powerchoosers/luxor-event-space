export type InstallmentReminderKey = 'installment_7_days_before' | 'installment_1_day_overdue'
export type InstallmentReminderCopy = { subject: string; title: string; greeting: string; body: string; note: string }
export const INSTALLMENT_REMINDER_KEYS: InstallmentReminderKey[] = ['installment_7_days_before', 'installment_1_day_overdue']
export const INSTALLMENT_REMINDER_DEFAULTS: Record<InstallmentReminderKey, InstallmentReminderCopy> = {
  installment_7_days_before: { subject: 'Upcoming payment reminder: {{payment_label}}', title: 'An upcoming payment is on your plan', greeting: 'Hi {{first_name}},', body: 'This is a reminder about an upcoming payment in your event plan. If you have already paid, please reply so we can update our records.', note: 'Questions or changes? Reply to this email and the Luxor team will help.' },
  installment_1_day_overdue: { subject: 'Payment follow-up: {{payment_label}}', title: 'A scheduled payment is still due', greeting: 'Hi {{first_name}},', body: 'Our records show this scheduled payment still has a balance. If you have already paid, please reply so we can update our records.', note: 'Questions or changes? Reply to this email and the Luxor team will help.' },
}
const limits: Record<keyof InstallmentReminderCopy, number> = { subject: 120, title: 100, greeting: 100, body: 1200, note: 600 }
const variables = /\{\{(first_name|payment_label)\}\}/g
export function validateInstallmentReminderCopy(input: unknown): InstallmentReminderCopy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter all reminder fields.')
  const record = input as Record<string, unknown>, fields = Object.keys(limits) as Array<keyof InstallmentReminderCopy>
  if (Object.keys(record).some((key) => !fields.includes(key as keyof InstallmentReminderCopy))) throw new Error('Unknown reminder field.')
  const result = {} as InstallmentReminderCopy
  for (const field of fields) {
    const value = record[field]
    if (typeof value !== 'string' || !value.trim() || value.trim().length > limits[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = value.trim(), remainder = clean.replace(variables, '')
    if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('Use only the listed reminder variables.')
    if (field !== 'body' && field !== 'note' && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    result[field] = clean
  }
  return result
}
export function renderInstallmentReminderCopy(copy: InstallmentReminderCopy, values: { first_name: string; payment_label: string }): InstallmentReminderCopy {
  const valid = validateInstallmentReminderCopy(copy)
  return Object.fromEntries(Object.entries(valid).map(([field, value]) => {
    const rendered = value.replace(variables, (_, key: keyof typeof values) => values[key])
    return [field, field === 'body' || field === 'note' ? rendered : rendered.replace(/[\r\n]+/g, ' ')]
  })) as InstallmentReminderCopy
}
