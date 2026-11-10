export type AgreementOwnerCopy = { subject: string; heading: string; body: string }

export const AGREEMENT_OWNER_DEFAULT: AgreementOwnerCopy = {
  subject: 'Executed Luxor agreement - {{client_name}}',
  heading: 'Executed agreement archived',
  body: '{{client_name}} completed the agreement. The internal copy with the full audit timeline is attached.',
}

const limits: Record<keyof AgreementOwnerCopy, number> = { subject: 120, heading: 120, body: 800 }

export function validateAgreementOwnerCopy(value: unknown): AgreementOwnerCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all email fields.')
  const input = value as Record<string, unknown>
  const fields = Object.keys(limits) as Array<keyof AgreementOwnerCopy>
  if (Object.keys(input).some((key) => !fields.includes(key as keyof AgreementOwnerCopy))) throw new Error('Unknown email field.')
  const result = {} as AgreementOwnerCopy
  for (const field of fields) {
    const raw = input[field]
    if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > limits[field]) throw new Error(`Enter ${field} within its length limit.`)
    const clean = raw.trim()
    const remainder = clean.replace(/\{\{client_name\}\}/g, '')
    if (remainder.includes('{{') || remainder.includes('}}')) throw new Error('Use only the listed email variable.')
    if (field !== 'body' && /[\r\n]/.test(clean)) throw new Error(`${field} must be a single line.`)
    result[field] = clean
  }
  return result
}

export function renderAgreementOwnerCopy(copy: AgreementOwnerCopy, clientName: string): AgreementOwnerCopy {
  const clean = validateAgreementOwnerCopy(copy)
  const name = clientName.replace(/[\r\n]+/g, ' ')
  return Object.fromEntries(Object.entries(clean).map(([key, value]) => [key, value.replace(/\{\{client_name\}\}/g, () => name)])) as AgreementOwnerCopy
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Keep the audit PDF attachment and owner-only delivery path unchanged. */
export function buildAgreementOwnerNotice(clientName: string, copy: AgreementOwnerCopy | null) {
  const safeName = escapeHtml(clientName.replace(/[\r\n]+/g, ' '))
  if (!copy) {
    return {
      subject: `Executed Luxor agreement - ${clientName}`.replace(/[\r\n]+/g, ' '),
      html: `<div style="font-family:Arial,sans-serif;overflow-wrap:anywhere"><h2>Executed agreement archived</h2><p>${safeName} completed the agreement. The internal copy with the full audit timeline is attached.</p></div>`,
    }
  }
  const rendered = renderAgreementOwnerCopy(copy, clientName)
  const bodyHtml = escapeHtml(rendered.body).replace(/\n/g, '<br />')
  return {
    subject: rendered.subject.replace(/[\r\n]+/g, ' '),
    html: `<div style="font-family:Arial,sans-serif;overflow-wrap:anywhere"><h2>${escapeHtml(rendered.heading)}</h2><p>${bodyHtml}</p></div>`,
  }
}
