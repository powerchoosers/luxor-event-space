import crypto from 'crypto'

export const LUXOR_CREATED_DOCUMENT_TOKEN_BYTES = 32
export const LUXOR_CREATED_DOCUMENT_TEST_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000

export function hashLuxorCreatedDocumentSigningToken(token: string) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}

export function createLuxorCreatedDocumentSigningToken() {
  const token = crypto.randomBytes(LUXOR_CREATED_DOCUMENT_TOKEN_BYTES).toString('base64url')
  return {
    token,
    tokenHash: hashLuxorCreatedDocumentSigningToken(token),
    expiresAt: new Date(Date.now() + LUXOR_CREATED_DOCUMENT_TEST_LINK_TTL_MS).toISOString(),
  }
}

export function luxorCreatedDocumentTokenExpired(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return false
  const expires = new Date(expiresAt).getTime()
  return Number.isFinite(expires) && expires < now
}