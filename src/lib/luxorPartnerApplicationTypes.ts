export const LUXOR_PARTNER_APPLICATION_TYPES = [
  'market_vendor',
  'preferred_vendor',
  'workshop',
  'sponsorship',
  'activity_partner',
  'general',
] as const

export type LuxorPartnerApplicationType = (typeof LUXOR_PARTNER_APPLICATION_TYPES)[number]

export const LUXOR_PARTNER_APPLICATION_STATUSES = [
  'new',
  'under_review',
  'approved',
  'declined',
  'archived',
] as const

export type LuxorPartnerApplicationStatus = (typeof LUXOR_PARTNER_APPLICATION_STATUSES)[number]

export const LUXOR_PARTNER_PAYMENT_STATUSES = ['payment_pending', 'confirmed'] as const

export type LuxorPartnerPaymentStatus = (typeof LUXOR_PARTNER_PAYMENT_STATUSES)[number]

export const LUXOR_MARKET_VENDOR_SPACES = {
  single: { label: 'Single Space', priceCents: 4500, description: '6ft table area' },
  double: { label: 'Double Space', priceCents: 7500, description: '12ft table area (more display space)' },
  premium: { label: 'Premium Space', priceCents: 6000, description: '6ft table area (preferred location)' },
} as const

export type LuxorMarketVendorSpaceKey = keyof typeof LUXOR_MARKET_VENDOR_SPACES

export const LUXOR_MARKET_VENDOR_CATEGORIES = [
  'Clothing & Apparel',
  'Jewelry & Accessories',
  'Beauty & Skincare',
  'Candles & Fragrances',
  'Handmade Crafts',
  'Art & Photography',
  'Home Decor',
  'Gifts & Specialty Products',
  'Plants & Flowers',
  'Baked Goods & Desserts',
  'Packaged Food Products',
  'Specialty Beverages',
  'Other',
] as const

export const LUXOR_MARKET_VENDOR_DISPLAY_OPTIONS = [
  'Shelving',
  'Clothing rack',
  'Backdrop / Signage',
  'Other',
] as const

export const LUXOR_CHRISTMAS_MARKET_EVENT_SLUG = 'christmas-market-2026'

export const LUXOR_PARTNER_APPLICATION_TYPE_LABELS: Record<LuxorPartnerApplicationType, string> = {
  market_vendor: 'Market Vendor',
  preferred_vendor: 'Preferred Vendor',
  workshop: 'Workshop Request',
  sponsorship: 'Sponsorship Inquiry',
  activity_partner: 'Activity Partner',
  general: 'General Inquiry',
}

export const LUXOR_PARTNER_APPLICATION_STATUS_LABELS: Record<LuxorPartnerApplicationStatus, string> = {
  new: 'New',
  under_review: 'Under Review',
  approved: 'Approved',
  declined: 'Declined',
  archived: 'Archived',
}