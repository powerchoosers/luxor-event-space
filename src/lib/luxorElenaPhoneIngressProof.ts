import { createHmac } from 'node:crypto'

/** Derive the same short-lived ticket for an authenticated parent-call retry. */
export function deriveElenaIngressToken(callSid: string, secret: string) {
  if (!/^CA[0-9a-f]{32}$/i.test(callSid) || secret.length < 32) throw new Error('Phone ingress signing is unavailable.')
  return createHmac('sha256', secret).update('luxor-elena-ingress-ticket-v1.' + callSid).digest('base64url')
}

/** Persist a separate, domain-bound digest; never store the SIP ticket itself. */
export function hashElenaIngressToken(token: string, secret: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || secret.length < 32) throw new Error('Invalid phone ingress proof.')
  return createHmac('sha256', secret).update('luxor-elena-ingress-v1.' + token).digest('hex')
}
