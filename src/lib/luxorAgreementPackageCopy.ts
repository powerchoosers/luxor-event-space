export type AgreementPackageCopy = {
  subject: string
  title: string
  greeting: string
  introduction: string
  nextSteps: string
}

export const AGREEMENT_PACKAGE_DEFAULT: AgreementPackageCopy = {
  subject: 'Your Luxor Event Agreement is ready to sign',
  title: 'Your Event Agreement is ready to sign',
  greeting: 'Hi {{first_name}},',
  introduction: 'your custom proposal and event agreement are ready. Please confirm the event details and included services, then review and sign the agreement using the secure button below.',
  nextSteps: 'Your agreement includes the remaining-balance schedule{{final_balance_schedule}}. No payment is requested in this email. After the agreement is signed, Luxor will email the secure Stripe link for the applicable booking payment.',
}

const limits: Record<keyof AgreementPackageCopy, number> = {
  subject: 120,
  title: 120,
  greeting: 100,
  introduction: 480,
  nextSteps: 800,
}

const variables = /\{\{(first_name|final_balance_schedule)\}\}/g

export function validateAgreementPackageCopy(value: unknown): AgreementPackageCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all email fields.')
  const input = value as Record<string, unknown>
  const fields = Object.keys(limits) as Array<keyof AgreementPackageCopy>
  if (Object.keys(input).some((key) => !fields.includes(key as keyof AgreementPackageCopy))) throw new Error('Unknown email field.')
  const result = {} as AgreementPackageCopy
  for (const field of fields) {
    const raw = input[field]
    if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > limits[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = raw.trim()
    const remainder = clean.replace(variables, '')
    if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('Use only the listed email variables.')
    if (field !== 'introduction' && field !== 'nextSteps' && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    result[field] = clean
  }
  if (!result.greeting.includes('{{first_name}}')) throw new Error('The greeting must include {{first_name}}.')
  return result
}

export function renderAgreementPackageCopy(
  copy: AgreementPackageCopy,
  values: { first_name: string; final_balance_schedule: string },
): AgreementPackageCopy {
  const valid = validateAgreementPackageCopy(copy)
  const replace = (value: string) => value.replace(variables, (_, name: keyof typeof values) => values[name].replace(/[\r\n]+/g, ' '))
  return Object.fromEntries(Object.entries(valid).map(([key, value]) => [key, replace(value)])) as AgreementPackageCopy
}
