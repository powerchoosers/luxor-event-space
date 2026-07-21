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

export type LuxorPackagePresetId = 'rent-only' | 'small' | 'mid' | 'best'

export type LuxorPackagePreset = {
  id: LuxorPackagePresetId
  name: string
  eyebrow: string
  description: string
  catalogIds: string[]
  includedItems: Array<{ id: string; category: string; name: string }>
}

// Transcribed from Packages.xlsx. Null prices are intentionally left editable
// because the source workbook does not provide a final number.
export const LUXOR_SERVICE_CATALOG: LuxorCatalogItem[] = [
  { id: 'rental-weekday-morning', category: 'Venue rental', name: 'Monday-Thursday morning rental (9am-4pm)', unitPrice: 1000 },
  { id: 'rental-weekday-evening', category: 'Venue rental', name: 'Monday-Thursday evening rental (6pm-1am)', unitPrice: 1200 },
  { id: 'rental-weekday-full', category: 'Venue rental', name: 'Monday-Thursday full day rental (9am-11pm)', unitPrice: 1600 },
  { id: 'rental-friday-morning', category: 'Venue rental', name: 'Friday morning rental (9am-4pm)', unitPrice: 1500 },
  { id: 'rental-friday-evening', category: 'Venue rental', name: 'Friday evening rental (6pm-1am)', unitPrice: 1700 },
  { id: 'rental-friday-full', category: 'Venue rental', name: 'Friday full day rental (9am-11pm)', unitPrice: 2500 },
  { id: 'rental-saturday-morning', category: 'Venue rental', name: 'Saturday morning rental (9am-4pm)', unitPrice: 1900 },
  { id: 'rental-saturday-evening', category: 'Venue rental', name: 'Saturday evening rental (6pm-1am)', unitPrice: 2100 },
  { id: 'rental-saturday-full', category: 'Venue rental', name: 'Saturday full day rental (9am-11pm)', unitPrice: 3000 },
  { id: 'rental-sunday-morning', category: 'Venue rental', name: 'Sunday morning rental (9am-4pm)', unitPrice: 1400 },
  { id: 'rental-sunday-evening', category: 'Venue rental', name: 'Sunday evening rental (6pm-1am)', unitPrice: 1600 },
  { id: 'rental-sunday-full', category: 'Venue rental', name: 'Sunday full day rental (9am-11pm)', unitPrice: 2200 },
  { id: 'cleaning-1-75', category: 'Required services', name: 'Cleaning fee - 1-75 guests', unitPrice: 200 },
  { id: 'cleaning-76-150', category: 'Required services', name: 'Cleaning fee - 76-150 guests', unitPrice: 275 },
  { id: 'cleaning-151-200', category: 'Required services', name: 'Cleaning fee - 151-200 guests', unitPrice: 350 },
  { id: 'security-1', category: 'Required services', name: 'Security - 1 officer / 6 hours', unitPrice: 250 },
  { id: 'security-2', category: 'Required services', name: 'Security - 2 officers / 6 hours', unitPrice: 450 },
  { id: 'security-3', category: 'Required services', name: 'Security - 3 officers / higher-risk event', unitPrice: 650 },
  { id: 'guest-tables', category: 'Venue setup', name: 'Guest tables set up', unitPrice: 100 },
  { id: 'basic-linens', category: 'Venue setup', name: 'Basic linens', unitPrice: 500 },
  { id: 'decor-basic', category: 'Decor', name: 'Basic decor package', unitPrice: 600 },
  { id: 'decor-full', category: 'Decor', name: 'Full decor package', unitPrice: 4350 },
  { id: 'catering-buffet', category: 'Catering', name: 'Buffet catering - up to 100 guests', unitPrice: 2150 },
  { id: 'catering-plated', category: 'Catering', name: 'Plated dinner service - up to 100 guests', unitPrice: 2650 },
  { id: 'catering-extra', category: 'Catering', name: 'Catering guests over 100', unitPrice: null, note: 'Enter the agreed per-person price and quantity.', requiresCustomPrice: true },
  { id: 'dj', category: 'Entertainment', name: 'DJ package', unitPrice: 1000, note: 'Workbook lists this as an approximate price.' },
  { id: 'booth-signature', category: 'Photo booth', name: 'The Signature Experience', unitPrice: 450 },
  { id: 'booth-celebration', category: 'Photo booth', name: 'The Celebration Experience', unitPrice: 650 },
  { id: 'booth-forever', category: 'Photo booth', name: 'The Forever Experience', unitPrice: 900 },
  { id: 'bar-service-1-75', category: 'Bar', name: 'Bartender service only - 1-75 guests / up to 5 hours', unitPrice: 450 },
  { id: 'bar-service-76-150', category: 'Bar', name: 'Bartender service only - 76-150 guests / up to 5 hours', unitPrice: 800 },
  { id: 'bar-service-151-200', category: 'Bar', name: 'Bartender service only - 151-200 guests / up to 5 hours', unitPrice: 1150 },
  { id: 'bar-signature', category: 'Bar', name: 'Signature BYOB bar - per guest / up to 5 hours', unitPrice: 10, note: '$750 minimum.', minimumCharge: 750 },
  { id: 'bar-premium', category: 'Bar', name: 'Premium BYOB bar - per guest / up to 5 hours', unitPrice: 14, note: '$1,000 minimum.', minimumCharge: 1000 },
  { id: 'bar-nonalcoholic', category: 'Bar', name: 'Non-alcoholic package - per guest / up to 5 hours', unitPrice: 7, note: '$500 minimum.', minimumCharge: 500 },
  { id: 'bar-extra-hour', category: 'Bar', name: 'Additional bartender hour', unitPrice: 75, note: 'Per bartender.' },
]

const FULL_DECOR_INCLUSIONS = [
  { id: 'included-guest-tables', category: 'Decor inclusions', name: 'Guest tables set up' },
  { id: 'included-premium-linens', category: 'Decor inclusions', name: 'Premium linens' },
  { id: 'included-chargers', category: 'Decor inclusions', name: 'Acrylic charger plates' },
  { id: 'included-florals', category: 'Decor inclusions', name: 'Silk floral centerpieces' },
  { id: 'included-tall-designs', category: 'Decor inclusions', name: 'Half tall centerpiece designs' },
  { id: 'included-small-designs', category: 'Decor inclusions', name: 'Half small centerpiece designs' },
  { id: 'included-sweetheart-table', category: 'Decor inclusions', name: 'Sweetheart table decor' },
  { id: 'included-signing-table', category: 'Decor inclusions', name: 'Signing table with simple decor' },
  { id: 'included-gift-table', category: 'Decor inclusions', name: 'Gift table with premium linen' },
  { id: 'included-cake-table', category: 'Decor inclusions', name: 'Cake table with premium decor' },
]

// Preset totals match the standard package table in Packages.xlsx using the
// Friday evening rental example: $2,825 / $8,725 / $9,725 / $11,125.
export const LUXOR_PACKAGE_PRESETS: LuxorPackagePreset[] = [
  {
    id: 'rent-only',
    name: 'Rent Only',
    eyebrow: 'Venue essentials',
    description: 'Friday evening venue rental with the required setup, security, and cleaning.',
    catalogIds: ['rental-friday-evening', 'security-1', 'cleaning-76-150', 'guest-tables', 'basic-linens'],
    includedItems: [],
  },
  {
    id: 'small',
    name: 'Small',
    eyebrow: 'Decor + buffet',
    description: 'Venue, required services, full decor, and buffet catering for up to 100 guests.',
    catalogIds: ['rental-friday-evening', 'security-1', 'cleaning-76-150', 'decor-full', 'catering-buffet'],
    includedItems: FULL_DECOR_INCLUSIONS,
  },
  {
    id: 'mid',
    name: 'Mid',
    eyebrow: 'Most popular',
    description: 'The Small package plus the DJ package.',
    catalogIds: ['rental-friday-evening', 'security-1', 'cleaning-76-150', 'decor-full', 'catering-buffet', 'dj'],
    includedItems: FULL_DECOR_INCLUSIONS,
  },
  {
    id: 'best',
    name: 'Best',
    eyebrow: 'Full experience',
    description: 'Full decor, plated dinner, DJ, Signature photo booth, and bartender service.',
    catalogIds: ['rental-friday-evening', 'security-1', 'cleaning-76-150', 'decor-full', 'catering-plated', 'dj', 'booth-signature', 'bar-service-1-75'],
    includedItems: FULL_DECOR_INCLUSIONS,
  },
]

export function catalogItemToLineItem(item: LuxorCatalogItem): LuxorInvoiceLineItem {
  const unitPrice = item.unitPrice ?? 0
  const quantity = item.minimumCharge && unitPrice > 0 ? Math.ceil(item.minimumCharge / unitPrice) : 1
  return { catalogId: item.id, category: item.category, description: item.name, quantity, unitPrice, total: quantity * unitPrice }
}

export function getLuxorCatalogItem(id: string | undefined) {
  return id ? LUXOR_SERVICE_CATALOG.find((item) => item.id === id) : undefined
}

export function packagePresetToLineItems(preset: LuxorPackagePreset): LuxorInvoiceLineItem[] {
  const pricedItems = preset.catalogIds
    .map((id) => getLuxorCatalogItem(id))
    .filter((item): item is LuxorCatalogItem => Boolean(item))
    .map(catalogItemToLineItem)

  const includedItems = preset.includedItems.map((item) => ({
    catalogId: item.id,
    category: item.category,
    included: true,
    description: item.name,
    quantity: 1,
    unitPrice: 0,
    total: 0,
  }))

  return [...pricedItems, ...includedItems]
}

export function getPackagePresetTotal(preset: LuxorPackagePreset) {
  return packagePresetToLineItems(preset).reduce((total, item) => total + item.total, 0)
}
