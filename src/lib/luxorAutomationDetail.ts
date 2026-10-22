export type FollowUpEmailContent = {
  name: string
  subject: string | null
  body: string | null
  cta_text: string | null
  cta_url: string | null
  secondary_cta_text: string | null
  secondary_cta_url: string | null
}

export const FOLLOW_UP_CONTENT_FIELDS = [
  'name',
  'subject',
  'body',
  'cta_text',
  'cta_url',
  'secondary_cta_text',
  'secondary_cta_url',
] as const

const CONTENT_FIELD_SET = new Set<string>(FOLLOW_UP_CONTENT_FIELDS)
const CANONICAL_LUXOR_ORIGIN = 'https://www.luxoratlaspalmas.com'

export function validateFollowUpContentUpdates(
  current: FollowUpEmailContent,
  input: unknown,
) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Provide email content fields to save.')
  }

  const fields = input as Record<string, unknown>
  const keys = Object.keys(fields)
  if (!keys.length) throw new Error('There are no email content changes to save.')
  const unsupported = keys.find((key) => !CONTENT_FIELD_SET.has(key))
  if (unsupported) {
    throw new Error('This detail view only edits saved email copy. Timing, order, triggers, conditions, and workflow status are unavailable here.')
  }

  const updates: Record<string, string | null> = {}
  for (const key of keys) {
    const value = fields[key]
    if (value !== null && typeof value !== 'string') throw new Error(`Enter ${key.replaceAll('_', ' ')} as text.`)
    const text = typeof value === 'string' ? value.trim() : ''
    const maxLength = key === 'body' ? 12_000 : 500
    if (text.length > maxLength) throw new Error(`${key.replaceAll('_', ' ')} is too long.`)
    if (key === 'subject' && /[\r\n]/.test(text)) throw new Error('Keep the subject line on one line.')
    updates[key] = text || null
  }

  const candidate = { ...current, ...updates }
  if (!candidate.name?.trim()) throw new Error('Enter an internal email name.')
  if (!candidate.subject?.trim()) throw new Error('Enter an email subject.')
  if (!candidate.body?.trim()) throw new Error('Enter email body copy.')

  if (Object.hasOwn(updates, 'body') && !sameMergeFields(current.body || '', candidate.body || '')) {
    throw new Error('Keep every existing {{merge field}} exactly as written. This editor does not add or remove merge fields.')
  }
  if (Object.hasOwn(updates, 'body')) validateMergeFieldSyntax(candidate.body || '')

  validateLuxorLink(candidate.cta_url, 'Primary button')
  validateLuxorLink(candidate.secondary_cta_url, 'Secondary button')
  validateButtonPair(candidate.cta_text, candidate.cta_url, 'Primary button')
  validateButtonPair(candidate.secondary_cta_text, candidate.secondary_cta_url, 'Secondary button')
  validateBodyLinks(candidate.body || '')

  return updates
}

function sameMergeFields(left: string, right: string) {
  const fields = (value: string) => Array.from(value.matchAll(/\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/g), (match) => match[0]).sort()
  return JSON.stringify(fields(left)) === JSON.stringify(fields(right))
}

function validateMergeFieldSyntax(body: string) {
  const withoutValidFields = body.replace(/\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/g, '')
  if (withoutValidFields.includes('{{') || withoutValidFields.includes('}}')) {
    throw new Error('Merge fields must use the existing {{field_name}} format.')
  }
}

function validateButtonPair(label: string | null, url: string | null, buttonName: string) {
  if (Boolean(label?.trim()) !== Boolean(url?.trim())) {
    throw new Error(`${buttonName} needs both a label and a destination, or neither.`)
  }
}

function validateLuxorLink(value: string | null, label: string) {
  const target = value?.trim()
  if (!target) return
  if (target.startsWith('/') && !target.startsWith('//') && !target.includes('\\')) return

  let url: URL
  try {
    url = new URL(target)
  } catch {
    throw new Error(`${label} must use a Luxor page or the canonical Luxor website.`)
  }
  if (url.protocol !== 'https:' || url.origin !== CANONICAL_LUXOR_ORIGIN || url.username || url.password) {
    throw new Error(`${label} must use a Luxor page or the canonical Luxor website.`)
  }
}

function validateBodyLinks(body: string) {
  const links = body.match(/https?:\/\/[^\s<>"']+/gi) || []
  for (const link of links) validateLuxorLink(link.replace(/[),.;!?]+$/, ''), 'Email body link')
}
