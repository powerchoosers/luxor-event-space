export type PlannerInvitationCopy = { subject: string; greeting: string; body: string }

export const PLANNER_INVITATION_DEFAULT: PlannerInvitationCopy = {
  subject: 'Your Luxor event design is ready to review',
  greeting: 'Hello {{first_name}},',
  body: 'Luxor has prepared an event design for you. Open the private presentation to view the selected concept and images.',
}

const limits: Record<keyof PlannerInvitationCopy, number> = { subject: 120, greeting: 100, body: 1200 }
export function validatePlannerInvitationCopy(value: unknown): PlannerInvitationCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all email fields.')
  const input = value as Record<string, unknown>
  const fields = Object.keys(limits) as Array<keyof PlannerInvitationCopy>
  if (Object.keys(input).some(key => !fields.includes(key as keyof PlannerInvitationCopy))) throw new Error('Unknown email field.')
  const result = {} as PlannerInvitationCopy
  for (const field of fields) {
    const raw = input[field]
    if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > limits[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = raw.trim()
    const remainder = clean.replace(/\{\{first_name\}\}/g, '')
    if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('Use only the listed email variable.')
    if (field !== 'body' && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    result[field] = clean
  }
  return result
}

export function renderPlannerInvitationCopy(copy: PlannerInvitationCopy, firstName: string): PlannerInvitationCopy {
  const clean = validatePlannerInvitationCopy(copy)
  const name = firstName.replace(/[\r\n]+/g, ' ')
  return Object.fromEntries(Object.entries(clean).map(([key, value]) => [key, value.replace(/\{\{first_name\}\}/g, () => name)])) as PlannerInvitationCopy
}
