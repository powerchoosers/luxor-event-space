export type PaidInvoiceEmailCopy = { subject: string; greeting: string; closing: string }
export const PAID_INVOICE_EMAIL_STARTER: PaidInvoiceEmailCopy = {
  subject: 'Your Luxor payment receipt', greeting: 'Hi {{first_name}},', closing: 'Please contact Luxor if you have questions about your booking.',
}
const limits: Record<keyof PaidInvoiceEmailCopy, number> = { subject: 120, greeting: 100, closing: 600 }
export function validatePaidInvoiceEmailCopy(value: unknown): PaidInvoiceEmailCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all email fields.')
  const input = value as Record<string, unknown>, fields = Object.keys(limits) as Array<keyof PaidInvoiceEmailCopy>
  if (Object.keys(input).some(key => !fields.includes(key as keyof PaidInvoiceEmailCopy))) throw new Error('Unknown email field.')
  const result = {} as PaidInvoiceEmailCopy
  for (const field of fields) {
    const raw = input[field]
    if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > limits[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = raw.trim(), remainder = clean.replace(/\{\{first_name\}\}/g, '')
    if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('Use only the listed email variable.')
    if (field !== 'closing' && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    result[field] = clean
  }
  return result
}
export function renderPaidInvoiceEmailCopy(copy: PaidInvoiceEmailCopy, firstName: string): PaidInvoiceEmailCopy {
  const valid = validatePaidInvoiceEmailCopy(copy), safeName = firstName.replace(/[\r\n]+/g, ' ')
  return Object.fromEntries(Object.entries(valid).map(([key, value]) => [key, value.replace(/\{\{first_name\}\}/g, () => safeName)])) as PaidInvoiceEmailCopy
}
export function paidInvoiceCopyHtml(copy: PaidInvoiceEmailCopy) {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  return { subject: copy.subject, greeting: escape(copy.greeting), closing: escape(copy.closing).replace(/\n/g, '<br />') }
}
