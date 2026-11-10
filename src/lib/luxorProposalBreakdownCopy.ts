export type ProposalBreakdownCopy = {
  subject: string
  eyebrow: string
  headline: string
  intro: string
  packageNote: string
  closing: string
  footer: string
}

export const PROPOSAL_BREAKDOWN_DEFAULT: ProposalBreakdownCopy = {
  subject: 'Proposal Breakdown: {{event_type}}',
  eyebrow: 'Proposal Breakdown',
  headline: 'A clear view of your celebration options',
  intro: 'Hi {{first_name}}, here is the package comparison and staff-prepared estimate for your Luxor event.',
  packageNote: 'These estimates are for comparison. The highlighted package is the estimate prepared by Luxor, not a package selection or reservation.',
  closing: 'This comparison is informational and does not reserve your date or create a payment obligation. Contact Luxor to discuss your preferred package.',
  footer: 'Package estimates for your event.',
}

const limits: Record<keyof ProposalBreakdownCopy, number> = {
  subject: 160,
  eyebrow: 80,
  headline: 160,
  intro: 600,
  packageNote: 600,
  closing: 600,
  footer: 200,
}
const variables = /\{\{(first_name|event_type)\}\}/g

export function validateProposalBreakdownCopy(value: unknown): ProposalBreakdownCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all email fields.')
  const input = value as Record<string, unknown>
  const fields = Object.keys(limits) as Array<keyof ProposalBreakdownCopy>
  if (Object.keys(input).some((key) => !fields.includes(key as keyof ProposalBreakdownCopy))) throw new Error('Unknown email field.')
  const result = {} as ProposalBreakdownCopy
  for (const field of fields) {
    const raw = input[field]
    if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > limits[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = raw.trim()
    const remainder = clean.replace(variables, '')
    if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('Use only {{first_name}} and {{event_type}}.')
    if (['subject', 'eyebrow', 'headline', 'footer'].includes(field) && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    result[field] = clean
  }
  return result
}

export function renderProposalBreakdownCopy(copy: ProposalBreakdownCopy, values: { first_name: string; event_type: string }): ProposalBreakdownCopy {
  const clean = validateProposalBreakdownCopy(copy)
  const replace = (value: string) => value.replace(variables, (_, variable: keyof typeof values) => values[variable].replace(/[\r\n]+/g, ' '))
  return Object.fromEntries(Object.entries(clean).map(([key, value]) => [key, replace(value)])) as ProposalBreakdownCopy
}
