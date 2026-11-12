// Keep common expense categories recognizable across finance charts.
const CATEGORY_COLORS: Record<string, string> = {
  utilities: '#4F86A8',
  rent: '#A87827',
  marketing: '#9B5F7A',
  cleaning: '#6B9A78',
  supplies: '#C07848',
  equipment: '#7A6B9E',
  insurance: '#B85C55',
  maintenance: '#9A8B3A',
  'event expenses': '#B484A2',
  'professional services': '#5C9A6E',
  decor: '#BB8E70',
  labor: '#556B94',
  other: '#8B7867',
}

const CUSTOM_COLORS = ['#A25975', '#4F8F7A', '#AE7045', '#8872A4', '#A08042', '#5C718F', '#A96557', '#82945C']

export function expenseCategoryColors(categories: string[]): Map<string, string> {
  const names = [...new Set(categories)].sort((a, b) => a.localeCompare(b))
  const colors = new Map<string, string>()
  let customIndex = 0
  for (const name of names) {
    const known = CATEGORY_COLORS[name.trim().toLowerCase()]
    colors.set(name, known ?? CUSTOM_COLORS[customIndex++ % CUSTOM_COLORS.length])
  }
  return colors
}

/** Conic-gradient stops for category donuts (continuous slices, no separator gap). */
export function expenseCategoryConicStops(categories: Array<{ name: string; amount: number }>): string {
  const total = categories.reduce((sum, entry) => sum + entry.amount, 0)
  if (!total || !categories.length) return 'var(--portal-border) 0% 100%'

  const colors = expenseCategoryColors(categories.map((item) => item.name))
  let cursor = 0
  return categories
    .map((item) => {
      const start = cursor
      cursor += (item.amount / total) * 100
      const color = colors.get(item.name) ?? CATEGORY_COLORS.other
      return `${color} ${start}% ${cursor}%`
    })
    .join(', ')
}
