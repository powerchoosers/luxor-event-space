import type { LuxorInvoiceLineItem } from './luxorInquiryTypes'

export type LuxorCatalogItem = {
  id: string
  category: string
  name: string
  unitPrice: number | null
  note?: string
  minimumCharge?: number
  requiresCustomPrice?: boolean
}

export type LuxorCanonicalPackagePresetId =
  | 'rental_only'
  | 'bronze_essentials'
  | 'silver_premier'
  | 'gold_all_inclusive'

/**
 * The catalog emits only canonical IDs. The legacy members stay in the type
 * temporarily so older UI comparisons and persisted data can be compiled
 * while their runtime values are normalized through LUXOR_LEGACY_PACKAGE_NAMES.
 */
export type LuxorPackagePresetId =
  | LuxorCanonicalPackagePresetId
  | 'rent-only'
  | 'small'
  | 'mid'
  | 'best'

export type LuxorPackagePreset = {
  id: LuxorPackagePresetId
  name: string
  eyebrow: string
  description: string
  /**
   * Package totals are contextual (date, guest count, rules, and approved
   * adjustments). This remains for older consumers but deliberately never
   * describes a fixed package price.
   */
  catalogIds: string[]
  includedItems: Array<{ id: string; category: string; name: string }>
}

const CONTEXTUAL_PRICING_NOTE = 'Calculated by the final proposal builder from the event date, guest count, selected package, and approved pricing rules.'

/**
 * The only public fixed figures in this legacy catalog are the base venue
 * rental rates. All other services are intentionally contextual: their exact
 * amount is resolved by the server-side proposal calculator, never by a
 * static package table or an estimate.
 */
export const LUXOR_SERVICE_CATALOG: LuxorCatalogItem[] = [
  { id: 'rental-weekday-morning', category: 'Venue rental', name: 'Monday-Thursday morning rental (8am-3pm)', unitPrice: 1000 },
  { id: 'rental-weekday-evening', category: 'Venue rental', name: 'Monday-Thursday evening rental (5pm-12am)', unitPrice: 1200 },
  { id: 'rental-weekday-full', category: 'Venue rental', name: 'Monday-Thursday full-day rental (11am-11pm)', unitPrice: 1600 },
  { id: 'rental-friday-morning', category: 'Venue rental', name: 'Friday morning rental (8am-3pm)', unitPrice: 1500 },
  { id: 'rental-friday-evening', category: 'Venue rental', name: 'Friday evening rental (5pm-12am)', unitPrice: 1700 },
  { id: 'rental-friday-full', category: 'Venue rental', name: 'Friday full-day rental (11am-11pm)', unitPrice: 2500 },
  { id: 'rental-saturday-morning', category: 'Venue rental', name: 'Saturday morning rental (8am-3pm)', unitPrice: 1900 },
  { id: 'rental-saturday-evening', category: 'Venue rental', name: 'Saturday evening rental (5pm-12am)', unitPrice: 2100 },
  { id: 'rental-saturday-full', category: 'Venue rental', name: 'Saturday full-day rental (11am-11pm)', unitPrice: 3000 },
  { id: 'rental-sunday-morning', category: 'Venue rental', name: 'Sunday morning rental (8am-3pm)', unitPrice: 1400 },
  { id: 'rental-sunday-evening', category: 'Venue rental', name: 'Sunday evening rental (5pm-12am)', unitPrice: 1600 },
  { id: 'rental-sunday-full', category: 'Venue rental', name: 'Sunday full-day rental (11am-11pm)', unitPrice: 2200 },

  { id: 'cleaning', category: 'Required services', name: 'Cleaning fee', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'security', category: 'Required services', name: 'Event security', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'tables_chairs_setup', category: 'Venue services', name: 'Tables & chairs included with rental', unitPrice: 0, note: 'Included with the venue rental at no additional charge.', requiresCustomPrice: false },
  { id: 'essential_decor', category: 'Event services', name: 'Essential Decor', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'full_decor', category: 'Event services', name: 'Full Decor & Planning', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'buffet_catering', category: 'Event services', name: 'Buffet catering', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'plated_catering', category: 'Event services', name: 'Plated catering', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'dj', category: 'Event services', name: 'DJ (6 hours)', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'photo_booth_signature', category: 'Event services', name: 'Signature Photo Booth', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'photo_booth_celebration', category: 'Event services', name: 'Celebration Photo Booth', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'photo_booth_forever', category: 'Event services', name: 'Forever Photo Booth', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'bartender_service', category: 'Event services', name: 'Bartender service (up to 5 hours)', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'byob_signature', category: 'Event services', name: 'Signature BYOB bar', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'byob_premium', category: 'Event services', name: 'Premium BYOB bar', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'byob_non_alcoholic', category: 'Event services', name: 'Non-alcoholic bar package', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
  { id: 'bartender_additional_hour', category: 'Event services', name: 'Additional bartender hour', unitPrice: null, note: CONTEXTUAL_PRICING_NOTE, requiresCustomPrice: true },
]

const ESSENTIAL_DECOR_INCLUSIONS = [
  { id: 'included-essential-centerpieces', category: 'What’s included', name: 'Essential centerpieces' },
  { id: 'included-basic-linens', category: 'What’s included', name: 'Basic linens' },
  { id: 'included-basic-sweetheart-table', category: 'What’s included', name: 'Basic sweetheart table' },
  { id: 'included-basic-gift-table', category: 'What’s included', name: 'Gift table with basic linen' },
  { id: 'included-basic-cake-table', category: 'What’s included', name: 'Cake table with basic decor' },
]

const FULL_DECOR_INCLUSIONS = [
  { id: 'included-premium-linens', category: 'What’s included', name: 'Premium linens' },
  { id: 'included-silk-florals', category: 'What’s included', name: 'Silk floral centerpieces' },
  { id: 'included-premium-sweetheart-table', category: 'What’s included', name: 'Premium sweetheart table' },
  { id: 'included-signing-table', category: 'What’s included', name: 'Signing table with simple decor' },
  { id: 'included-premium-gift-table', category: 'What’s included', name: 'Gift table with premium linen' },
  { id: 'included-premium-cake-table', category: 'What’s included', name: 'Cake table with premium decor' },
  { id: 'included-centerpiece-designs', category: 'What’s included', name: 'Tall and small centerpiece designs' },
]

const PACKAGE_SCOPE_ITEMS = {
  rentalOnly: [
    { id: 'included-venue-rental', category: 'Package scope', name: 'Venue rental for the selected window' },
    { id: 'included-required-cleaning', category: 'Package scope', name: 'Required cleaning' },
    { id: 'included-required-security', category: 'Package scope', name: 'Required security' },
    { id: 'included-tables-chairs-setup', category: 'Package scope', name: 'Tables & chairs included with rental' },
  ],
  bronze: [
    { id: 'included-venue-rental', category: 'Package scope', name: 'Venue rental for the selected window' },
    { id: 'included-required-cleaning', category: 'Package scope', name: 'Required cleaning' },
    { id: 'included-required-security', category: 'Package scope', name: 'Required security' },
    { id: 'included-tables-chairs-setup', category: 'Package scope', name: 'Tables & chairs included with rental' },
    { id: 'included-buffet-catering', category: 'Package scope', name: 'Buffet catering' },
    { id: 'included-dj', category: 'Package scope', name: 'DJ (6 hours)' },
    ...ESSENTIAL_DECOR_INCLUSIONS,
  ],
  silver: [
    { id: 'included-full-day-access', category: 'Package scope', name: '8 event hours plus 4 hours for setup and breakdown' },
    { id: 'included-required-cleaning', category: 'Package scope', name: 'Required cleaning' },
    { id: 'included-required-security', category: 'Package scope', name: 'Required security' },
    { id: 'included-tables-chairs-setup', category: 'Package scope', name: 'Tables & chairs included with rental' },
    { id: 'included-buffet-catering', category: 'Package scope', name: 'Buffet catering' },
    { id: 'included-dj', category: 'Package scope', name: 'DJ (6 hours)' },
    { id: 'included-signature-photo-booth', category: 'Package scope', name: 'Signature Photo Booth' },
    ...FULL_DECOR_INCLUSIONS,
  ],
  gold: [
    { id: 'included-full-day-access', category: 'Package scope', name: '8 event hours plus 4 hours for setup and breakdown' },
    { id: 'included-required-cleaning', category: 'Package scope', name: 'Required cleaning' },
    { id: 'included-required-security', category: 'Package scope', name: 'Required security' },
    { id: 'included-tables-chairs-setup', category: 'Package scope', name: 'Tables & chairs included with rental' },
    { id: 'included-buffet-catering', category: 'Package scope', name: 'Buffet catering' },
    { id: 'included-dj', category: 'Package scope', name: 'DJ (6 hours)' },
    { id: 'included-signature-photo-booth', category: 'Package scope', name: 'Signature Photo Booth' },
    { id: 'included-bartender-service', category: 'Package scope', name: 'Bartender service (up to 5 hours)' },
    ...FULL_DECOR_INCLUSIONS,
  ],
} as const

/**
 * Package presets are names and scope only. There are deliberately no
 * catalogIds here: a package cannot be turned into a stale, fixed total.
 */
export const LUXOR_PACKAGE_PRESETS: LuxorPackagePreset[] = [
  {
    id: 'rental_only',
    name: 'Custom Package',
    eyebrow: 'Venue foundation',
    description: 'Venue rental with required cleaning, security, and tables & chairs included.',
    catalogIds: [],
    includedItems: [...PACKAGE_SCOPE_ITEMS.rentalOnly],
  },
  {
    id: 'bronze_essentials',
    name: 'Bronze - Essentials',
    eyebrow: 'Celebration essentials',
    description: 'Venue rental, Essential Decor, buffet catering, and a six-hour DJ, with required services.',
    catalogIds: [],
    includedItems: [...PACKAGE_SCOPE_ITEMS.bronze],
  },
  {
    id: 'silver_premier',
    name: 'Silver - Premier',
    eyebrow: 'Premier celebration',
    description: 'Full Decor & Planning, buffet catering, a six-hour DJ, and a Signature Photo Booth.',
    catalogIds: [],
    includedItems: [...PACKAGE_SCOPE_ITEMS.silver],
  },
  {
    id: 'gold_all_inclusive',
    name: 'Gold - All-Inclusive',
    eyebrow: 'All-inclusive celebration',
    description: 'Silver package inclusions plus bartender service for up to five hours.',
    catalogIds: [],
    includedItems: [...PACKAGE_SCOPE_ITEMS.gold],
  },
]

export const LUXOR_PACKAGE_OPTIONS = LUXOR_PACKAGE_PRESETS.map((preset) => ({ value: preset.name, label: preset.name }))

export const LUXOR_PACKAGE_INTEREST_OPTIONS = [
  ...LUXOR_PACKAGE_OPTIONS,
  { value: 'Not Sure', label: 'Help me choose' },
]

/**
 * Keep old inquiry URLs and historic lead values useful without allowing
 * obsolete names to reappear in the current package picker.
 */
export const LUXOR_LEGACY_PACKAGE_NAMES: Record<string, string> = {
  'Rental Only': 'Custom Package',
  'Rent Only': 'Custom Package',
  'Venue Rental': 'Custom Package',
  'Venue Essentials': 'Custom Package',
  Small: 'Bronze - Essentials',
  Foundation: 'Bronze - Essentials',
  'Classic Celebration': 'Bronze - Essentials',
  Mid: 'Silver - Premier',
  Signature: 'Silver - Premier',
  'Signature Celebration': 'Silver - Premier',
  Best: 'Gold - All-Inclusive',
  Showpiece: 'Gold - All-Inclusive',
  'Grand Celebration': 'Gold - All-Inclusive',
}

export function catalogItemToLineItem(item: LuxorCatalogItem): LuxorInvoiceLineItem {
  const unitPrice = item.unitPrice ?? 0
  const quantity = item.minimumCharge && unitPrice > 0 ? Math.ceil(item.minimumCharge / unitPrice) : 1
  return {
    catalogId: item.id,
    category: item.category,
    description: item.name,
    quantity,
    unitPrice,
    total: quantity * unitPrice,
    ...(item.unitPrice === null ? { pricingRole: 'add_on' as const, detail: item.note } : {}),
  }
}

const LEGACY_CATALOG_ID_ALIASES: Record<string, string> = {
  'cleaning-1-75': 'cleaning',
  'cleaning-76-150': 'cleaning',
  'cleaning-151-200': 'cleaning',
  'security-1': 'security',
  'security-2': 'security',
  'security-3': 'security',
  'guest-tables': 'tables_chairs_setup',
  'basic-linens': 'essential_decor',
  'decor-basic': 'essential_decor',
  'decor-full': 'full_decor',
  'catering-buffet': 'buffet_catering',
  'catering-plated': 'plated_catering',
  'catering-extra': 'buffet_catering',
  'booth-signature': 'photo_booth_signature',
  'booth-celebration': 'photo_booth_celebration',
  'booth-forever': 'photo_booth_forever',
  'bar-service-1-75': 'bartender_service',
  'bar-service-76-150': 'bartender_service',
  'bar-service-151-200': 'bartender_service',
  'bar-signature': 'byob_signature',
  'bar-premium': 'byob_premium',
  'bar-nonalcoholic': 'byob_non_alcoholic',
  'bar-extra-hour': 'bartender_additional_hour',
}

export function getLuxorCatalogItem(id: string | undefined) {
  if (!id) return undefined
  const canonicalId = LEGACY_CATALOG_ID_ALIASES[id] || id
  return LUXOR_SERVICE_CATALOG.find((item) => item.id === canonicalId)
}

/**
 * Kept for older code paths that render package scope. It intentionally only
 * returns zero-value inclusion lines; the proposal calculator owns pricing.
 */
export function packagePresetToLineItems(preset: LuxorPackagePreset): LuxorInvoiceLineItem[] {
  const includedItems = preset.includedItems.map((item) => ({
    catalogId: item.id,
    category: item.category,
    included: true,
    pricingRole: 'included' as const,
    description: item.name,
    quantity: 1,
    unitPrice: 0,
    total: 0,
  }))

  return includedItems
}

/**
 * A package no longer has a static total. Call the server-side proposal
 * calculator with a real event selection to obtain its final event price.
 */
export function getPackagePresetTotal(_preset: LuxorPackagePreset): null {
  return null
}
