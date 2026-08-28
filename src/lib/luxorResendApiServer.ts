import 'server-only'

export class LuxorResendError extends Error {
  constructor(public status: number, public code: string) {
    super(status === 429 ? 'Resend is rate limiting email requests. Please retry shortly.'
      : status === 401 || status === 403 ? 'Resend authorization or domain verification needs attention in Settings.'
        : `Resend request failed (${status}).`)
    this.name = 'LuxorResendError'
  }
}

export async function luxorResendApi<T>(path: string, init: RequestInit = {}) {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) throw new Error('Missing RESEND_API_KEY on the server.')
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid Resend API path.')
  const response = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'Luxor-Mail/1.0' },
    cache: 'no-store',
    signal: init.signal || AbortSignal.timeout(20_000),
  })
  const data = await response.json().catch(() => null)
  // Never propagate provider payloads: they can contain recipient data or credentials.
  if (!response.ok) throw new LuxorResendError(response.status, String(data?.name || 'provider_error'))
  if (!data) throw new Error('Resend returned an empty response.')
  return data as T
}
