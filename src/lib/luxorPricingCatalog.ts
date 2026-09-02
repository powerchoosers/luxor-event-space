export type PricingCatalog = Record<string, unknown>

type CatalogRecord = Record<string, unknown>

export type PublicRentalOption = {
  id: 'morning' | 'evening' | 'full_day'
  label: string
  time: string
  price: string
  note?: string
}

export type PublicPricingDay = {
  id: 'monday_thursday' | 'friday' | 'saturday' | 'sunday'
  day: string
  options: PublicRentalOption[]
  additionalTime?: string
}

const DAY_LABELS: Array<{ id: PublicPricingDay['id']; label: string }> = [
  { id: 'monday_thursday', label: 'Monday – Thursday' },
  { id: 'friday', label: 'Friday' },
  { id: 'saturday', label: 'Saturday' },
  { id: 'sunday', label: 'Sunday' },
]

const PERIOD_LABELS: Array<{ id: PublicRentalOption['id']; label: string }> = [
  { id: 'morning', label: 'Daytime' },
  { id: 'evening', label: 'Evening' },
  { id: 'full_day', label: 'All Day' },
]

export function catalogRecord(value: unknown): CatalogRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as CatalogRecord : null
}

export function catalogValue(root: unknown, ...path: Array<string | number>): unknown {
  let current = root
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined
      current = current[segment]
      continue
    }
    const next = catalogRecord(current)
    if (!next) return undefined
    current = next[segment]
  }
  return current
}

export function catalogNumber(root: unknown, ...path: Array<string | number>) {
  const value = catalogValue(root, ...path)
  if (value === '' || value === null || value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function setCatalogValue(root: PricingCatalog, path: Array<string | number>, value: unknown): PricingCatalog {
  const clone = structuredClone(root)
  let current: CatalogRecord | unknown[] = clone
  path.forEach((segment, index) => {
    const isLast = index === path.length - 1
    if (isLast) {
      if (typeof segment === 'number' && Array.isArray(current)) current[segment] = value
      else if (typeof segment === 'string' && !Array.isArray(current)) current[segment] = value
      return
    }
    const nextSegment = path[index + 1]
    if (typeof segment === 'number' && Array.isArray(current)) {
      if (!current[segment] || typeof current[segment] !== 'object') current[segment] = typeof nextSegment === 'number' ? [] : {}
      current = current[segment] as CatalogRecord | unknown[]
    } else if (typeof segment === 'string' && !Array.isArray(current)) {
      if (!current[segment] || typeof current[segment] !== 'object') current[segment] = typeof nextSegment === 'number' ? [] : {}
      current = current[segment] as CatalogRecord | unknown[]
    }
  })
  return clone
}

export function formatCatalogTime(value: unknown) {
  const raw = String(value || '')
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw)
  if (!match) return raw
  const hour = Number(match[1])
  const minutes = match[2]
  const normalized = hour % 24
  const displayHour = normalized % 12 || 12
  return `${displayHour}:${minutes} ${normalized >= 12 ? 'PM' : 'AM'}`
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function buildPublicPricingDays(config: PricingCatalog): PublicPricingDay[] {
  return DAY_LABELS.map(({ id, label }) => {
    const options = PERIOD_LABELS.flatMap(({ id: period, label: periodLabel }) => {
      const rate = catalogNumber(config, 'rental_rates', id, period)
      const rule = catalogRecord(catalogValue(config, 'rental_rate_rules', id, period))
      if (rate === undefined || rule?.public === false) return []
      const start = catalogValue(config, 'rental_access', period, 'start')
      const end = catalogValue(config, 'rental_access', period, 'end')
      const hourlyRate = catalogNumber(rule, 'hourly_rate')
      const minimumHours = catalogNumber(rule, 'minimum_hours')
      return [{
        id: period,
        label: periodLabel,
        time: `${formatCatalogTime(start)} – ${formatCatalogTime(end)}`,
        price: rule?.pricing_type === 'hourly' && hourlyRate !== undefined ? `${formatCurrency(hourlyRate)} / HR` : formatCurrency(rate),
        ...(rule?.pricing_type === 'hourly' && minimumHours !== undefined ? { note: `${minimumHours}-hour minimum` } : {}),
      } satisfies PublicRentalOption]
    })
    const additional = catalogNumber(config, 'additional_time_rates', id)
    return {
      id,
      day: label,
      options,
      ...(additional !== undefined ? { additionalTime: `${formatCurrency(additional)} / hour` } : {}),
    }
  })
}

export function buildPublicFeeDisclosure(config: PricingCatalog) {
  const deposit = catalogNumber(config, 'security_deposit', 'amount')
  const taxRate = catalogNumber(config, 'taxes_and_processing_fees', 'sales_tax_rate')
  const parts = ['Required cleaning and security fees apply']
  if (deposit !== undefined) parts.push(`${formatCurrency(deposit)} refundable security deposit`)
  if (taxRate !== undefined && taxRate > 0) parts.push(`${(taxRate * 100).toFixed(2).replace(/\.00$/, '')}% sales tax`)
  return `${parts.join(', ')}. Rates are subject to change.`
}
