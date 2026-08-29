import 'server-only'

import crypto from 'crypto'
import { cookies } from 'next/headers'

export const LUXOR_PORTAL_SESSION_COOKIE = 'luxor_portal_session'

export type LuxorPortalSession = {
  email: string
  accountId: string | null
  mailboxAddress: string | null
  issuedAt: number
  expiresAt: number
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

function getSessionSecret() {
  const secret = process.env.LUXOR_PORTAL_SESSION_SECRET || process.env.ZOHO_CLIENT_SECRET

  if (!secret) {
    throw new Error('Missing LUXOR_PORTAL_SESSION_SECRET or ZOHO_CLIENT_SECRET.')
  }

  return secret
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString('base64url')
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signPayload(payload: string) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url')
}

export function getAllowedZohoPortalEmails() {
  const values = [
    ...(process.env.LUXOR_PORTAL_ALLOWED_EMAILS || '').split(','),
    ...(process.env.LUXOR_MAIL_ALLOWED_SENDERS || '').split(','),
    process.env.LUXOR_ZOHO_LOGIN_EMAIL,
    ...(process.env.LUXOR_ZOHO_ALLOWED_SENDERS || '').split(','),
  ]

  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

/**
 * Validates the password hash stored only in the server environment. The
 * format is deliberately self-contained so the portal can rotate a password
 * without a database migration: scrypt$N$r$p$salt$derivedKey.
 */
export function verifyLuxorPortalPassword(password: string) {
  const encoded = process.env.LUXOR_PORTAL_PASSWORD_HASH || ''
  const [algorithm, nRaw, rRaw, pRaw, salt, expectedKey] = encoded.split('$')
  const N = Number(nRaw)
  const r = Number(rRaw)
  const p = Number(pRaw)
  if (algorithm !== 'scrypt' || !Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)
    || N < 16_384 || N > 262_144 || r < 1 || r > 32 || p < 1 || p > 16 || !salt || !expectedKey) return false
  try {
    const actual = crypto.scryptSync(password, salt, Buffer.from(expectedKey, 'base64url').byteLength, { N, r, p, maxmem: 128 * 1024 * 1024 })
    const expected = Buffer.from(expectedKey, 'base64url')
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function isAuthorizedLuxorPortalEmail(email: string) {
  return getAllowedZohoPortalEmails().includes(email.trim().toLowerCase())
}

export function getLuxorPhonePurchaserEmail() {
  return String(
    process.env.LUXOR_PHONE_PURCHASER_EMAIL
      || process.env.LUXOR_ZOHO_LOGIN_EMAIL
      || 'booking@luxoratlaspalmas.com'
  ).trim().toLowerCase()
}

export function canPurchaseLuxorPhoneNumbers(email: string) {
  return email.trim().toLowerCase() === getLuxorPhonePurchaserEmail()
}

export function createLuxorPortalSessionCookie(session: Omit<LuxorPortalSession, 'issuedAt' | 'expiresAt'>) {
  const issuedAt = Date.now()
  const payload: LuxorPortalSession = {
    ...session,
    email: session.email.toLowerCase(),
    issuedAt,
    expiresAt: issuedAt + SESSION_MAX_AGE_SECONDS * 1000,
  }
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = signPayload(encodedPayload)

  return {
    name: LUXOR_PORTAL_SESSION_COOKIE,
    value: `${encodedPayload}.${signature}`,
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}

export function verifyLuxorPortalSessionCookie(value: string | undefined) {
  if (!value) return null

  const [encodedPayload, signature] = value.split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = signPayload(encodedPayload)
  const actual = Buffer.from(signature)
  const expected = Buffer.from(expectedSignature)

  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return null
  }

  const session = JSON.parse(base64UrlDecode(encodedPayload)) as LuxorPortalSession

  if (!session.email || !session.expiresAt || session.expiresAt <= Date.now()) {
    return null
  }

  if (!isAuthorizedLuxorPortalEmail(session.email)) {
    return null
  }

  return session
}

/**
 * The strict session reader for public routes that need to distinguish an
 * owner preview from a real client visit. Unlike `getLuxorPortalSession`, it
 * intentionally never applies the development convenience session.
 */
export async function getVerifiedLuxorPortalSession() {
  const cookieStore = await cookies()
  return verifyLuxorPortalSessionCookie(cookieStore.get(LUXOR_PORTAL_SESSION_COOKIE)?.value)
}

export async function getLuxorPortalSession() {
  const session = await getVerifiedLuxorPortalSession()
  if (!session && process.env.NODE_ENV === 'development') {
    return {
      email: 'booking@luxoratlaspalmas.com',
      accountId: '5721896000000008002',
      mailboxAddress: 'booking@luxoratlaspalmas.com',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
    }
  }
  return session
}
