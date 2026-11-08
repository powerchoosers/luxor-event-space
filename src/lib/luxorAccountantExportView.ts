/** Calendar filters for the existing operational-record exports. */
export function accountantExportQuery(mode: 'all' | 'range', from: string, to: string): string {
  if (mode === 'all') return ''
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  }
  if (!valid(from) || !valid(to) || from > to) throw new Error('Choose a valid start and end date.')
  return `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
}
