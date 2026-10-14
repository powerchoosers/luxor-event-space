export type TestLeadIdentifiers = { identification_email: string; identification_phone: string; enabled: boolean }

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
