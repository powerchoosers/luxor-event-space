export type ZelleInstructionsCopy = { subject: string; greeting: string; body: string }
export const ZELLE_INSTRUCTIONS_DEFAULT: ZelleInstructionsCopy = {
  subject: 'Luxor Zelle payment instructions',
  greeting: 'Hi {{first_name}},',
  body: "You selected Zelle for your {{payment_type}}. To send it, open your bank's Zelle service and enter the recipient below.",
}
const limits: Record<keyof ZelleInstructionsCopy, number> = { subject: 120, greeting: 100, body: 1200 }
const variables = /\{\{(first_name|payment_type)\}\}/g
export function validateZelleInstructionsCopy(value: unknown): ZelleInstructionsCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all email fields.')
  const input = value as Record<string, unknown>
  const fields = Object.keys(limits) as Array<keyof ZelleInstructionsCopy>
  if (Object.keys(input).some(key => !fields.includes(key as keyof ZelleInstructionsCopy))) throw new Error('Unknown email field.')
  const result = {} as ZelleInstructionsCopy
  for (const field of fields) {
    const raw = input[field]
    if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > limits[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = raw.trim(), remainder = clean.replace(variables, '')
    if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('Use only the listed email variables.')
    if (field !== 'body' && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    result[field] = clean
  }
  if (!result.body.includes('{{payment_type}}')) throw new Error('The body must include {{payment_type}} so the client knows what the payment is for.')
  return result
}
export function renderZelleInstructionsCopy(copy: ZelleInstructionsCopy, values: { first_name: string; payment_type: string }): ZelleInstructionsCopy {
  const valid = validateZelleInstructionsCopy(copy)
  return Object.fromEntries(Object.entries(valid).map(([key, value]) => [key, value.replace(variables, (_, name: keyof typeof values) => values[name].replace(/[\r\n]+/g, ' '))])) as ZelleInstructionsCopy
}
