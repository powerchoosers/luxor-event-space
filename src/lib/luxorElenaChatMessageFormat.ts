const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i

/** Strip internal ids Elena should not show Arianna in chat prose. */
export function stripOwnerFacingIds(text: string): string {
  return text
    .replace(new RegExp(`\\s*\\(\\s*inquiryId:\\s*${UUID_PATTERN.source}\\s*\\)`, 'gi'), '')
    .replace(new RegExp(`\\s*\\(\\s*inquiry_id:\\s*${UUID_PATTERN.source}\\s*\\)`, 'gi'), '')
    .replace(
      new RegExp(`\\b(inquiryId|inquiry_id|bookingId|booking_id|task_id|confirmation_id):\\s*${UUID_PATTERN.source}`, 'gi'),
      '',
    )
    .replace(new RegExp(`\\(\\s*${UUID_PATTERN.source}\\s*\\)`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;.:])/g, '$1')
}

/** Emails and US-style phone numbers in Elena chat copy. */
export const ELENA_CHAT_CONTACT_PATTERN =
  /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+1\d{10}|\+1\s*\(\d{3}\)\s*\d{3}-\d{4}|\(\d{3}\)\s*\d{3}-\d{4}|\d{3}[\s.-]\d{3}[\s.-]\d{4})/gi

export function isEmailToken(value: string): boolean {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)
}
