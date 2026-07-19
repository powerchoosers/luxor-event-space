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

export function catalogItemToLineItem(item: LuxorCatalogItem): LuxorInvoiceLineItem {
  const unitPrice = item.unitPrice ?? 0
  const quantity = item.minimumCharge && unitPrice > 0 ? Math.ceil(item.minimumCharge / unitPrice) : 1
  return { catalogId: item.id, category: item.category, description: item.name, quantity, unitPrice, total: quantity * unitPrice }
}

export function getLuxorCatalogItem(id: string | undefined) {
  return id ? LUXOR_SERVICE_CATALOG.find((item) => item.id === id) : undefined
}
