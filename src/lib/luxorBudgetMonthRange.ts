const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function validBudgetMonth(month: unknown): month is string {
  return typeof month === 'string' && MONTH_RE.test(month) && Number(month.slice(0, 4)) >= 1900
}

export function shiftBudgetMonth(month: string, delta: number) {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, number - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Inclusive month list; throws when invalid or over maxMonths. */
export function enumerateBudgetMonths(from: string, to: string, maxMonths = 24) {
  if (!validBudgetMonth(from) || !validBudgetMonth(to) || from > to) {
    throw new Error('Choose a valid from and to month.')
  }
  const months: string[] = []
  let cursor = from
  while (cursor <= to) {
    months.push(cursor)
    if (months.length > maxMonths) throw new Error(`Choose at most ${maxMonths} months.`)
    cursor = shiftBudgetMonth(cursor, 1)
  }
  return months
}

export type BudgetExportPreset = 'viewed_month' | 'last_3' | 'last_6' | 'calendar_year' | 'last_12' | 'last_24' | 'custom'

export function resolveBudgetExportRange(preset: BudgetExportPreset, anchorMonth: string, customFrom: string, customTo: string) {
  if (!validBudgetMonth(anchorMonth)) throw new Error('Invalid month.')
  switch (preset) {
    case 'viewed_month':
      return { from: anchorMonth, to: anchorMonth }
    case 'last_3':
      return { from: shiftBudgetMonth(anchorMonth, -2), to: anchorMonth }
    case 'last_6':
      return { from: shiftBudgetMonth(anchorMonth, -5), to: anchorMonth }
    case 'calendar_year': {
      const year = anchorMonth.slice(0, 4)
      return { from: `${year}-01`, to: `${year}-12` }
    }
    case 'last_12':
      return { from: shiftBudgetMonth(anchorMonth, -11), to: anchorMonth }
    case 'last_24':
      return { from: shiftBudgetMonth(anchorMonth, -23), to: anchorMonth }
    case 'custom':
      return { from: customFrom, to: customTo }
    default:
      return { from: anchorMonth, to: anchorMonth }
  }
}
