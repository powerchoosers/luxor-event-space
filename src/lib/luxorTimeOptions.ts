export type LuxorTimeDropdownOption = {
  value: string
  label: string
}

/**
 * Shared scheduling choices for portal and public time pickers. The list is
 * intentionally ordered as a business day: 8:00 AM through 1:00 AM, rather
 * than beginning at midnight.
 */
export const LUXOR_TIME_DROPDOWN_OPTIONS: LuxorTimeDropdownOption[] = Array.from(
  { length: 35 },
  (_, index) => {
    const totalMinutes = (8 * 60) + (index * 30)
    const clockMinutes = totalMinutes % (24 * 60)
    const hours24 = Math.floor(clockMinutes / 60)
    const minutes = clockMinutes % 60
    const suffix = hours24 >= 12 ? 'PM' : 'AM'
    const hours12 = hours24 % 12 || 12

    return {
      value: `${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      label: `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`,
    }
  },
)

export function normalizeLuxorTimeDropdownValue(value: unknown) {
  const input = String(value || '').trim()
  const twentyFourHour = input.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/)
  if (twentyFourHour) return `${twentyFourHour[1]}:${twentyFourHour[2]}`

  const twelveHour = input.match(/^(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)$/i)
  if (!twelveHour) return ''
  let hours = Number(twelveHour[1]) % 12
  if (twelveHour[3].toUpperCase() === 'PM') hours += 12
  return `${String(hours).padStart(2, '0')}:${twelveHour[2]}`
}
