import {
  DEFAULT_LUXOR_PROPOSAL_PACKAGE_SETTINGS,
  LUXOR_PUBLIC_PACKAGE_TIER_IDS,
  packageInclusionsForDisplay,
  packageLimitationsForPublicDisplay,
  type LuxorPublicPackageTierId,
} from '@/lib/luxorProposalPackages'

/** Toggle public package card pricing on /packages. */
export const LUXOR_PUBLIC_PACKAGES_SHOW_CARD_PRICES = true

/**
 * Marketing "Starting at" amounts for the public packages page (Arianna's spec).
 * Separate from proposal-catalog package fees and pricing engine totals.
 */
export const LUXOR_PUBLIC_PACKAGE_MARKETING_STARTING_PRICES_USD: Record<LuxorPublicPackageTierId, number> = {
  essentials: 1000,
  signature: 1800,
  luxor: 2800,
}

export type PublicPackageCardData = {
  id: LuxorPublicPackageTierId
  displayName: string
  shortDescription: string
  startingPrice: number
  previewInclusions: string[]
  fullInclusions: string[]
  limitations: string[]
  image: string
  imageAlt: string
  mostPopular?: string
}

const PACKAGE_IMAGES: Record<LuxorPublicPackageTierId, { src: string; alt: string }> = {
  essentials: {
    src: '/images/dining-hall/main-hall-reception-professional.png',
    alt: 'Luxor main hall prepared for a reception',
  },
  signature: {
    src: '/images/dining-hall/main-hall-quinceanera-angle.png',
    alt: 'Luxor celebration with styled tables and lighting',
  },
  luxor: {
    src: '/images/dining-hall/main-hall-wedding-wide.png',
    alt: 'Luxor main hall with full event styling',
  },
}

const DISPLAY_NAMES: Record<LuxorPublicPackageTierId, { en: string; es: string }> = {
  essentials: { en: 'Essentials', es: 'Esenciales' },
  signature: { en: 'Signature', es: 'Signature' },
  luxor: { en: 'Luxor', es: 'Luxor' },
}

const DEFAULT_RENTAL_HOURS = 8
const PREVIEW_INCLUSION_COUNT = 5

export function buildPublicPackageCards(locale: 'en' | 'es' = 'en'): PublicPackageCardData[] {
  const settings = DEFAULT_LUXOR_PROPOSAL_PACKAGE_SETTINGS
  return LUXOR_PUBLIC_PACKAGE_TIER_IDS.map((id) => {
    const option = settings.options[id]
    const fullInclusions = packageInclusionsForDisplay(option, DEFAULT_RENTAL_HOURS)
    return {
      id,
      displayName: DISPLAY_NAMES[id][locale],
      shortDescription: option.description,
      startingPrice: LUXOR_PUBLIC_PACKAGE_MARKETING_STARTING_PRICES_USD[id],
      previewInclusions: fullInclusions.slice(0, PREVIEW_INCLUSION_COUNT),
      fullInclusions,
      limitations: packageLimitationsForPublicDisplay(id, settings, DEFAULT_RENTAL_HOURS, false),
      image: PACKAGE_IMAGES[id].src,
      imageAlt: PACKAGE_IMAGES[id].alt,
      mostPopular: option.most_popular_label,
    }
  })
}
