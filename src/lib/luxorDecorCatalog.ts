/** Offering metadata only. Approved prices come from the saved pricing catalog. */
export type OfficialDecorService = {
  id: string
  name: string
  category: 'decor_packages' | 'decor_add_ons'
  description: string
  inclusions: string[]
  minimumQuantity: number
  unit: 'package' | 'each' | 'letter'
  includedAddOnQuantities?: Record<string, number>
}

export const OFFICIAL_DECOR_SERVICES: readonly OfficialDecorService[] = [
  {
    id: 'decor-classic', name: 'Classic Decor Package', category: 'decor_packages',
    description: 'Beautifully Styled', minimumQuantity: 1, unit: 'package',
    inclusions: [
      'Choice of up to 2 linen colors', 'Customized backdrop', 'Classic centerpieces',
      'Coordinated table styling', 'Professional setup & breakdown',
    ],
  },
  {
    id: 'decor-signature', name: 'Signature Decor Package', category: 'decor_packages',
    description: 'Elevated & Personalized', minimumQuantity: 1, unit: 'package',
    inclusions: [
      'Choice of up to 2 linen colors', 'Customized backdrop', 'Assorted table styling elements',
      'Premium centerpieces — choice of floral or candle decor', 'Uplighting', 'Charger plates',
      'Custom welcome sign + easel', 'Professional setup & breakdown',
    ],
  },
  {
    id: 'decor-luxor', name: 'The Luxor Decor Package', category: 'decor_packages',
    description: 'The Ultimate Experience', minimumQuantity: 1, unit: 'package',
    inclusions: [
      'Choice of up to 2 linen colors', 'Premium balloon + floral statement backdrop',
      'Premium centerpieces — choice of floral or candle decor', 'Full table styling',
      'Charger plates', 'Uplighting', 'Custom welcome sign + easel', '4×8 custom photoboard',
      'Cream sofa/lounge seating', 'Specialty accent decor', 'Professional setup & breakdown',
    ],
    includedAddOnQuantities: { 'decor-cream-sofa': 1, 'decor-photoboard': 1, 'decor-balloon-floral-backdrop': 1 },
  },
  {
    id: 'decor-cream-sofa', name: 'Cream Sofa', category: 'decor_add_ons',
    description: 'Official Luxor decor add-on.', inclusions: [], minimumQuantity: 1, unit: 'each',
  },
  {
    id: 'decor-balloon-backdrop', name: 'Customized Balloon Backdrop', category: 'decor_add_ons',
    description: 'Official Luxor decor add-on.', inclusions: [], minimumQuantity: 1, unit: 'each',
  },
  {
    id: 'decor-floral-backdrop', name: 'Customized Floral Backdrop', category: 'decor_add_ons',
    description: 'Official Luxor decor add-on.', inclusions: [], minimumQuantity: 1, unit: 'each',
  },
  {
    id: 'decor-balloon-floral-backdrop', name: 'Customized Balloon + Floral Backdrop', category: 'decor_add_ons',
    description: 'Official Luxor decor add-on.', inclusions: [], minimumQuantity: 1, unit: 'each',
  },
  {
    id: 'decor-photoboard', name: '4×8 Custom Photoboard', category: 'decor_add_ons',
    description: 'Official Luxor decor add-on. Priced for each photoboard.', inclusions: [], minimumQuantity: 1, unit: 'each',
  },
  {
    id: 'decor-balloon-arch', name: '21-ft Balloon Arch', category: 'decor_add_ons',
    description: 'Official Luxor decor add-on.', inclusions: [], minimumQuantity: 1, unit: 'each',
  },
  {
    id: 'decor-marquee-letters', name: 'Marquee Letters', category: 'decor_add_ons',
    description: 'Official Luxor decor add-on. Priced per letter; 2-letter minimum.', inclusions: [], minimumQuantity: 2, unit: 'letter',
  },
]

export function getOfficialDecorService(id: string): OfficialDecorService | undefined {
  return OFFICIAL_DECOR_SERVICES.find((service) => service.id === id)
}
