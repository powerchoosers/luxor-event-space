export { LUXOR_PERMANENT_TEST_LEAD_ID } from './luxorInquiryTypes'

export type TestLeadIdentifiers = { identification_email: string; identification_phone: string; enabled: boolean }

export const LUXOR_TEST_IDENTIFICATION_EMAIL = 'luxoratlaspalmas@gmail.com'
export const LUXOR_TEST_IDENTIFICATION_PHONE = '2149600276'
export const LUXOR_TEST_PHONE_E164_DIGITS = '12149600276'

export function normalizeTestEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function normalizeTestPhone(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : ''
}

/** Requires a complete exact identifier; partial names and contact fragments never classify. */
export function matchesTestLeadIdentifiers(input: { email?: unknown; phone?: unknown }, settings: TestLeadIdentifiers | null | undefined) {
  if (!settings?.enabled) return false
  const email = normalizeTestEmail(input.email)
  const phone = normalizeTestPhone(input.phone)
  return Boolean(
    (email && email === normalizeTestEmail(settings.identification_email)) ||
    (phone.length === 10 && phone === normalizeTestPhone(settings.identification_phone)),
  )
}
