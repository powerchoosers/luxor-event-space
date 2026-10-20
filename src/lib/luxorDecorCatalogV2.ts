import { LUXOR_PROPOSAL_PACKAGE_IDS } from './luxorProposalPackages'

export const LUXOR_DECOR_CATALOG_KEY = 'official_decor_catalog_v2'
export const LUXOR_DECOR_CATALOG_SCHEMA_VERSION = 1

export const LUXOR_DECOR_CATEGORIES = [
  { id: 'signature_package_add_ons', label: 'SIGNATURE PACKAGE ADD-ONS' },
  { id: 'luxor_package_add_ons', label: 'LUXOR PACKAGE ADD-ONS' },
  { id: 'premium_add_ons', label: 'PREMIUM ADD-ONS' },
] as const

export type LuxorDecorCategoryId = typeof LUXOR_DECOR_CATEGORIES[number]['id']
export type LuxorDecorPricingUnit = 'order' | 'set' | 'each' | 'letter' | 'arch'

export type LuxorDecorCatalogItem = {
  id: string
  name: string
  description: string
  category: LuxorDecorCategoryId
  amount: number
  pricing_unit: LuxorDecorPricingUnit
  minimum_quantity: number
  active: boolean
  included_in_packages: string[]
  display_order: number
}

type RecordValue = Record<string, unknown>

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null
}

function luxorCostsFrom(config: unknown) {
  const outer = asRecord(config) || {}
  return asRecord(outer.luxor_costs) || outer
}

export function readLuxorDecorCatalog(config: unknown, includeInactive = false): LuxorDecorCatalogItem[] {
  const saved = asRecord(luxorCostsFrom(config)[LUXOR_DECOR_CATALOG_KEY])
  if (Number(saved?.schema_version) !== LUXOR_DECOR_CATALOG_SCHEMA_VERSION || !Array.isArray(saved?.items)) return []
  const items = saved.items.map((value) => {
    const item = asRecord(value) || {}
    return {
      id: typeof item.id === 'string' ? item.id : '',
      name: typeof item.name === 'string' ? item.name : '',
      description: typeof item.description === 'string' ? item.description : '',
      category: item.category as LuxorDecorCategoryId,
      amount: Number(item.amount),
      pricing_unit: item.pricing_unit as LuxorDecorPricingUnit,
      minimum_quantity: Number(item.minimum_quantity),
      active: item.active === true,
      included_in_packages: Array.isArray(item.included_in_packages)
        ? item.included_in_packages.filter((id): id is string => typeof id === 'string')
        : [],
      display_order: Number(item.display_order),
    } satisfies LuxorDecorCatalogItem
  })
  return items
    .filter((item) => includeInactive || item.active)
    .sort((left, right) => LUXOR_DECOR_CATEGORIES.findIndex((item) => item.id === left.category) - LUXOR_DECOR_CATEGORIES.findIndex((item) => item.id === right.category) || left.display_order - right.display_order || left.id.localeCompare(right.id))
}

export function luxorDecorCategoryLabel(category: string) {
  return LUXOR_DECOR_CATEGORIES.find((entry) => entry.id === category)?.label || category
}

export function luxorDecorUnitLabel(unit: LuxorDecorPricingUnit) {
  return unit === 'order' ? 'order' : unit === 'set' ? 'set' : unit === 'letter' ? 'letter' : unit === 'arch' ? 'arch' : 'each'
}

export function includedLuxorDecorQuantity(item: LuxorDecorCatalogItem, packageId: string | null | undefined) {
  return packageId && item.included_in_packages.includes(packageId) ? 1 : 0
}

export function validateLuxorDecorCatalog(value: unknown): string[] {
  const root = asRecord(value)
  if (!root) return ['The active decor add-on catalog is missing.']
  if (Number(root.schema_version) !== LUXOR_DECOR_CATALOG_SCHEMA_VERSION || !Array.isArray(root.items)) {
    return ['The decor add-on catalog must use schema version 1 and contain an item list.']
  }
  const errors: string[] = []
  const ids = new Set<string>()
  const units = new Set<LuxorDecorPricingUnit>(['order', 'set', 'each', 'letter', 'arch'])
  const categories = new Set<string>(LUXOR_DECOR_CATEGORIES.map((entry) => entry.id))
  const packages = new Set<string>(LUXOR_PROPOSAL_PACKAGE_IDS)
  root.items.forEach((rawItem, index) => {
    const item = asRecord(rawItem)
    const label = 'Add-on ' + (index + 1)
    if (!item) {
      errors.push(label + ' must be a record.')
      return
    }
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(id)) errors.push(label + ' needs a stable lowercase ID.')
    else if (ids.has(id)) errors.push('Add-on IDs must be unique.')
    ids.add(id)
    if (typeof item.name !== 'string' || !item.name.trim()) errors.push(label + ' needs a name.')
    if (typeof item.description !== 'string') errors.push(label + ' needs a description field.')
    if (typeof item.category !== 'string' || !categories.has(item.category)) errors.push(label + ' needs a supported category.')
    const amount = Number(item.amount)
    if (!Number.isFinite(amount) || amount < 0 || (item.active === true && amount <= 0)) errors.push(label + ' needs a valid positive price while active.')
    if (typeof item.pricing_unit !== 'string' || !units.has(item.pricing_unit as LuxorDecorPricingUnit)) errors.push(label + ' needs a supported pricing unit.')
    const minimum = Number(item.minimum_quantity)
    if (!Number.isSafeInteger(minimum) || minimum < 1 || (item.pricing_unit === 'order' && minimum !== 1)) {
      errors.push(label + ' needs a valid minimum quantity for its pricing unit.')
    }
    if (typeof item.active !== 'boolean') errors.push(label + ' needs an active or inactive status.')
    if (!Array.isArray(item.included_in_packages) || item.included_in_packages.some((id) => typeof id !== 'string' || !packages.has(id))) {
      errors.push(label + ' has an unsupported package inclusion.')
    }
    const displayOrder = Number(item.display_order)
    if (!Number.isSafeInteger(displayOrder) || displayOrder < 1) errors.push(label + ' needs a positive display order.')
  })
  return [...new Set(errors)]
}
