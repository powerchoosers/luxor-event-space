import { createHmac, timingSafeEqual } from 'node:crypto'

// Svix signing protocol: https://docs.svix.com/receiving/verifying-payloads/how-manual
export function verifyLuxorResendSignature(payload: string, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get('svix-id') || ''
  const timestamp = headers.get('svix-timestamp') || ''
  const signatures = headers.get('svix-signature') || ''
  if (!id || !/^\d+$/.test(timestamp) || !secret.startsWith('whsec_')) return false
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false
  const key = Buffer.from(secret.slice(6), 'base64')
  if (!key.length) return false
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest()
  return signatures.split(/\s+/).some((signature) => {
    const [version, value] = signature.split(',')
    if (version !== 'v1' || !value) return false
    const actual = Buffer.from(value, 'base64')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
}
