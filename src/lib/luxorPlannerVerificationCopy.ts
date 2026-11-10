export type PlannerVerificationCopy = { subject: string; title: string; greeting: string; intro: string; closing: string; note: string }

export const PLANNER_VERIFICATION_DEFAULT: PlannerVerificationCopy = {
  subject: 'Your Luxor design verification code',
  title: 'Verify your email',
  greeting: 'Hello,',
  intro: 'Enter this six-digit code in the Luxor presentation page:',
  closing: 'This code expires in 10 minutes and works once. If you did not request it, you can ignore this email.',
  note: 'For your privacy, Luxor will never ask you to share this code by phone or text.',
}

const limits: Record<keyof PlannerVerificationCopy, number> = {
  subject: 120, title: 120, greeting: 80, intro: 600, closing: 600, note: 400,
}

export function validatePlannerVerificationCopy(value: unknown): PlannerVerificationCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all email fields.')
  const input = value as Record<string, unknown>
  const fields = Object.keys(limits) as Array<keyof PlannerVerificationCopy>
  if (Object.keys(input).some((key) => !fields.includes(key as keyof PlannerVerificationCopy))) throw new Error('Unknown email field.')
  const result = {} as PlannerVerificationCopy
  for (const field of fields) {
    const raw = input[field]
    if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > limits[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = raw.trim()
    if (field !== 'intro' && field !== 'closing' && field !== 'note' && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    if (/\{\{/.test(clean) || /\}\}/.test(clean)) throw new Error('This email does not use merge fields.')
    result[field] = clean
  }
  return result
}

export function renderPlannerVerificationCopy(copy: PlannerVerificationCopy): PlannerVerificationCopy {
  return validatePlannerVerificationCopy(copy)
}
