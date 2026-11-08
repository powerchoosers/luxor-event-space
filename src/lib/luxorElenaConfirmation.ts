import { createHash, randomBytes, randomUUID } from 'node:crypto'

export type ElenaNoteAction = { kind: 'create_note'; inquiryId: string; content: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Only named actions are supported. Raw SQL is never an action. */
export function parseElenaNoteAction(input: unknown): ElenaNoteAction {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid action.')
  const value = input as Record<string, unknown>
  if (Object.keys(value).some((key) => !['kind', 'inquiryId', 'content'].includes(key)) || value.kind !== 'create_note'
    || typeof value.inquiryId !== 'string' || !UUID.test(value.inquiryId)
    || typeof value.content !== 'string' || !value.content.trim() || value.content.trim().length > 4000) throw new Error('Invalid note action.')
  return { kind: 'create_note', inquiryId: value.inquiryId.toLowerCase(), content: value.content.trim() }
}

export function newElenaConfirmationToken() {
  const id = randomUUID()
  const secret = randomBytes(32).toString('base64url')
  return { token: `${id}.${secret}`, id, tokenHash: createHash('sha256').update(secret).digest('hex') }
}

export function parseElenaConfirmationToken(value: unknown) {
  if (typeof value !== 'string') throw new Error('Invalid confirmation.')
  const parts = value.split('.')
  if (parts.length !== 2 || !UUID.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) throw new Error('Invalid confirmation.')
  return { id: parts[0].toLowerCase(), tokenHash: createHash('sha256').update(parts[1]).digest('hex') }
}
