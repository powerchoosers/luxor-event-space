/** Calendar-day eligibility in the venue's local time zone. */
export function requiresLuxorPayInFull(eventDate: string | null | undefined, now = new Date()): boolean {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return false
  const [y, m, d] = eventDate.split('-').map(Number)
  const event = Date.UTC(y, m - 1, d)
  const check = new Date(event)
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return false
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const today = Date.UTC(value('year'), value('month') - 1, value('day'))
  return (event - today) / 86400000 <= 60
}
export const LUXOR_PAY_IN_FULL_REQUIRED = 'Pay in Full is required for events within 60 days. Update the payment plan before publishing.'
