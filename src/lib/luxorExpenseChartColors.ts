// Keep common expense categories recognizable across finance charts.
const CATEGORY_COLORS: Record<string, string> = {
  utilities: '#607c88',
  rent: '#a87827',
  marketing: '#9b667b',
  cleaning: '#638476',
  supplies: '#b87750',
  equipment: '#777195',
  insurance: '#a45e57',
  maintenance: '#8a824c',
  'event expenses': '#b484a2',
  'professional services': '#667f73',
  decor: '#bb8e70',
  labor: '#6f7794',
  other: '#8b7867',
}

const CUSTOM_COLORS = ['#a25975', '#568279', '#ae7045', '#8872a4', '#a08042', '#5c718f', '#a96557', '#82945c']

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
