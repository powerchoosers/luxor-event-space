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

function signingTokenKey() {
  const secret = process.env.LUXOR_PORTAL_SESSION_SECRET
  if (!secret) throw new Error('Missing LUXOR_PORTAL_SESSION_SECRET for signing links.')
  return crypto.createHash('sha256').update(`${secret}:created-document-signing:v1`).digest()
}

export function encryptLuxorCreatedDocumentSigningToken(token: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', signingTokenKey(), iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptLuxorCreatedDocumentSigningToken(value: string) {
  const [version, iv, tag, body] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('The saved signing link could not be read.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', signingTokenKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
}