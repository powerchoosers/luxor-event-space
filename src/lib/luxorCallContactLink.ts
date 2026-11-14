export function normalizeLuxorPhoneNumber(value: string | null | undefined) {
  const raw = String(value || '').trim()
  if (!raw) return null

  const hasLeadingPlus = raw.startsWith('+')
  const digits = raw.replace(/\D/g, '')

  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (hasLeadingPlus && digits.length >= 8 && digits.length <= 15) return `+${digits}`

  return null
}

export type LuxorCallContactResolution = {
  inquiryId: string | null
  vendorId: string | null
  contactName: string | null
  matchCount: number
}

export function luxorCallExternalPartyPhone(input: {
  direction: string
  caller_number?: string | null
  from_number?: string | null
  callee_number?: string | null
  to_number?: string | null
}) {
  const raw = input.direction === 'inbound'
    ? input.caller_number || input.from_number
    : input.callee_number || input.to_number
  return normalizeLuxorPhoneNumber(raw)
}

export function isGenericLuxorCallContactName(name: string | null | undefined, phone: string | null) {
  if (!name || !name.trim()) return true
  const trimmed = name.trim()
  const lower = trimmed.toLowerCase()
  if (lower === 'unknown caller' || lower === 'unknown' || lower === 'caller' || lower === 'anonymous caller') {
    return true
  }
  const normalizedName = normalizeLuxorPhoneNumber(trimmed)
  const normalizedPhone = normalizeLuxorPhoneNumber(phone)
  return Boolean(normalizedName && normalizedPhone && normalizedName === normalizedPhone)
}

export function luxorCallLinkedContactName(input: {
  linkedInquiryName?: string | null
  linkedVendorName?: string | null
  contactName?: string | null
}) {
  const linked = input.linkedInquiryName?.trim() || input.linkedVendorName?.trim() || null
  if (linked && !isGenericLuxorCallContactName(linked, null)) return linked

  const contact = input.contactName?.trim() || null
  if (contact && !isGenericLuxorCallContactName(contact, null)) return contact
  return null
}