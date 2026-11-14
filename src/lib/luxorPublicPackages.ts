import {
  DEFAULT_LUXOR_PROPOSAL_PACKAGE_SETTINGS,
  LUXOR_PUBLIC_PACKAGE_TIER_IDS,
  packageInclusionsForDisplay,
  packageLimitationsForPublicDisplay,
  type LuxorProposalPackageOption,
  type LuxorPublicPackageTierId,
} from '@/lib/luxorProposalPackages'
import type { PublicPackagesPricingSnapshot } from '@/lib/luxorPublicPackageStartingPrices'

export type PublicPackageCardData = {
  id: LuxorPublicPackageTierId
  displayName: string
  shortDescription: string
  startingPrice: number | null
  showStartingPrice: boolean
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

const DEFAULT_RENTAL_HOURS = 6
const PREVIEW_INCLUSION_COUNT = 5

const PUBLIC_CARD_BACK_EXCLUDED_INCLUSION = /^(cleaning|required security)\b/i

export function inclusionsForPublicPackageCardBack(items: string[]) {
  return items.filter((item) => !PUBLIC_CARD_BACK_EXCLUDED_INCLUSION.test(item.trim()))
}

export function formatPublicPackageExperienceLine(option: LuxorProposalPackageOption) {
  const positioning = option.positioning.trim().toLowerCase()
  if (positioning === 'diy') return 'DIY event experience.'
  if (positioning === 'done-with-you') return 'Done-with-you experience.'
  if (positioning === 'done-for-you') return 'Done-for-you experience.'
  const title = option.summary_title.replace(/\s+Experience$/i, '').trim()
  if (!title) return `${option.positioning.trim()} experience.`
  return `${title.charAt(0)}${title.slice(1).toLowerCase()} experience.`
}

export function publicPackageLimitationsForCard(
  packageId: LuxorPublicPackageTierId,
  settings = DEFAULT_LUXOR_PROPOSAL_PACKAGE_SETTINGS,
  rentalHours = DEFAULT_RENTAL_HOURS,
) {
  const option = settings.options[packageId]
  const limits = packageLimitationsForPublicDisplay(packageId, settings, rentalHours, false)
  if (!limits.length) return limits
  const experiencePrefix = `${option.summary_title}: ${option.positioning}.`
  return limits.map((line, index) => (index === 0 && line === experiencePrefix
    ? formatPublicPackageExperienceLine(option)
    : line))
}

export function buildPublicPackageCards(
  locale: 'en' | 'es',
  pricing: PublicPackagesPricingSnapshot,
): PublicPackageCardData[] {
  const settings = DEFAULT_LUXOR_PROPOSAL_PACKAGE_SETTINGS
  return LUXOR_PUBLIC_PACKAGE_TIER_IDS.map((id) => {
    const option = settings.options[id]
    const catalogInclusions = packageInclusionsForDisplay(option, DEFAULT_RENTAL_HOURS)
    const fullInclusions = inclusionsForPublicPackageCardBack(catalogInclusions)
    const computed = pricing.packages.find((entry) => entry.packageId === id)
    const startingPrice = computed?.startingPrice ?? null
    return {
      id,
      displayName: DISPLAY_NAMES[id][locale],
      shortDescription: option.description,
      startingPrice,
      showStartingPrice: pricing.showCardPrices && startingPrice !== null,
      previewInclusions: catalogInclusions.slice(0, PREVIEW_INCLUSION_COUNT),
      fullInclusions,
      limitations: publicPackageLimitationsForCard(id, settings, DEFAULT_RENTAL_HOURS),
      image: PACKAGE_IMAGES[id].src,
      imageAlt: PACKAGE_IMAGES[id].alt,
      mostPopular: option.most_popular_label,
    }
  })
}
