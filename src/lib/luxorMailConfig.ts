export type LuxorMailProvider = 'zoho' | 'resend'

export function luxorMailProvider(): LuxorMailProvider {
  const provider = (process.env.LUXOR_MAIL_PROVIDER || 'zoho').trim().toLowerCase()
  if (provider !== 'zoho' && provider !== 'resend') throw new Error('LUXOR_MAIL_PROVIDER must be zoho or resend.')
  return provider
}

export function luxorMailAddress(value: string) {
  const address = value.trim().toLowerCase()
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(address) ? address : ''
}

export function luxorMailSenders() {
  // Retain the approved allowlist throughout the provider migration.
  const configured = process.env.LUXOR_MAIL_ALLOWED_SENDERS ?? process.env.LUXOR_ZOHO_ALLOWED_SENDERS
  return Array.from(new Set([
    process.env.LUXOR_MAIL_FROM || process.env.LUXOR_ZOHO_LOGIN_EMAIL || 'booking@luxoratlaspalmas.com',
    ...(configured === undefined ? ['booking@luxoratlaspalmas.com', 'hello@luxoratlaspalmas.com'] : configured.split(',')),
  ].map(luxorMailAddress).filter(Boolean)))
}

export function luxorMailFrom(value?: string) {
  const from = luxorMailAddress(value || process.env.LUXOR_MAIL_FROM || process.env.LUXOR_ZOHO_LOGIN_EMAIL || 'booking@luxoratlaspalmas.com')
  if (!from || !luxorMailSenders().includes(from)) throw new Error('This sender is not approved for the Luxor mailbox.')
  return from
}

export function luxorResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}
