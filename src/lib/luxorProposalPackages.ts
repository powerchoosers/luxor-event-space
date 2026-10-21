export const LUXOR_PACKAGE_SELECTION_SCHEMA_VERSION = 1

export const LUXOR_PROPOSAL_PACKAGE_IDS = ['essentials', 'signature', 'luxor', 'customized'] as const
export type LuxorProposalPackageTierId = typeof LUXOR_PROPOSAL_PACKAGE_IDS[number]

export function normalizeLuxorProposalPackageTierId(value: unknown): LuxorProposalPackageTierId | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return (LUXOR_PROPOSAL_PACKAGE_IDS as readonly string[]).includes(normalized)
    ? normalized as LuxorProposalPackageTierId
    : null
}

export type LuxorProposalPackagePriceTier = {
  min_guests: number
  max_guests: number
  amount: number
}

export type LuxorProposalPackageOption = {
  id: LuxorProposalPackageTierId
  name: string
  positioning: string
  description: string
  summary_title: string
  summary: string
  inclusions: string[]
  price_tiers: LuxorProposalPackagePriceTier[]
  most_popular_label?: string
}

export type LuxorProposalPackageSettings = {
  schema_version: number
  options: Record<LuxorProposalPackageTierId, LuxorProposalPackageOption>
}

const DEFAULT_CATALOG_INCLUSION_ALIASES: Record<string, string[]> = {
  sofa_throne_chair: ['Sofa or throne chair'],
  centerpieces: ['Centerpieces'],
  silverware: ['Silverware'],
  napkins: ['Napkins'],
  uplighting: ['Uplighting'],
  table_runners: ['Table runners'],
  glasses: ['Glasses'],
  arch_backdrop: ['Arch backdrop and/or shimmer wall'],
  shimmer_wall: ['Arch backdrop and/or shimmer wall'],
  led_sign: ['LED sign or custom vinyl'],
  custom_vinyl: ['LED sign or custom vinyl'],
  chafing_dishes: ['Chafing dishes'],
  charger_plates: ['Charger plates'],
  display_pedestal_set: ['Display pedestals'],
  balloon_garland: ['Half balloon garland or floral arch'],
  floral_arch: ['Half balloon garland or floral arch'],
  digital_photobooth_4_hours: ['Digital photobooth for 4 hours'],
}

const ESSENTIALS_INCLUSIONS = [
  '%rental_hours%-hour venue rental',
  'Round tables, up to 20',
  'Rectangle tables, up to 5',
  'Cocktail tables, up to 5',
  'Black or white tablecloths',
  'VIP room access',
  'Luxor Lounge access',
  'Kitchenette access',
  'Cleaning',
  'Required security',
  'Free Wi-Fi',
  'Bluetooth speaker',
]

const SIGNATURE_ADDITIONS = [
  'Any color tablecloths, up to 2 colors',
  'Centerpieces',
  'Silverware',
  'Napkins',
  'Uplighting',
  'Sweetheart table',
  'Sofa or throne chair',
]

const LUXOR_ADDITIONS = [
  'Table runners',
  'Charger plates',
  'Glasses',
  'Display pedestals',
  'Arch backdrop and/or shimmer wall',
  'Half balloon garland or floral arch',
  'LED sign or custom vinyl',
  'Digital photobooth for 4 hours',
  'Chafing dishes',
]

export const DEFAULT_LUXOR_PROPOSAL_PACKAGE_SETTINGS: LuxorProposalPackageSettings = {
  schema_version: LUXOR_PACKAGE_SELECTION_SCHEMA_VERSION,
  options: {
    essentials: {
      id: 'essentials',
      name: 'The Essentials Package',
      positioning: 'DIY',
      description: 'Perfect for hosts who want to personalize and decorate their own event.',
      summary_title: 'DIY Event Experience',
      summary: 'Venue rental, tables, linens, cleaning, security, and amenities.',
      inclusions: [...ESSENTIALS_INCLUSIONS],
      price_tiers: [],
    },
    signature: {
      id: 'signature',
      name: 'The Signature Package',
      positioning: 'Done-with-you',
      description: 'Enjoy a beautifully styled event with essential decor and finishing touches included.',
      summary_title: 'Done-with-You Experience',
      summary: 'Everything in Essentials, plus enhanced linens, centerpieces, silverware, uplighting, and a styled sweetheart table.',
      inclusions: [...ESSENTIALS_INCLUSIONS, ...SIGNATURE_ADDITIONS],
      price_tiers: [
        { min_guests: 0, max_guests: 99, amount: 600 },
        { min_guests: 100, max_guests: 180, amount: 900 },
      ],
    },
    luxor: {
      id: 'luxor',
      name: 'The Luxor Package',
      positioning: 'Done-for-you',
      description: 'Our complete event styling experience with elevated decor, statement pieces, and finishing touches.',
      summary_title: 'Done-for-You Experience',
      summary: 'Everything in Signature, plus elevated tabletop decor, statement backdrops, balloon or floral styling, a digital photobooth, and more.',
      inclusions: [...ESSENTIALS_INCLUSIONS, ...SIGNATURE_ADDITIONS, ...LUXOR_ADDITIONS],
      price_tiers: [
        { min_guests: 0, max_guests: 99, amount: 1100 },
        { min_guests: 100, max_guests: 180, amount: 1600 },
      ],
      most_popular_label: '⭐ MOST POPULAR',
    },
    customized: {
      id: 'customized',
      name: 'Customized Package',
      positioning: 'Build your own',
      description: 'Start with our Essentials Package and personalize your event with the additional services and decor you want.',
      summary_title: 'Build Your Own Package',
      summary: 'Start with Essentials and add the individual services and decor you want.',
      inclusions: [...ESSENTIALS_INCLUSIONS],
      price_tiers: [],
    },
  },
}

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null
}

/** Resolve versioned proposal package settings from the existing pricing JSON. */
export function getLuxorProposalPackageSettings(config: unknown): LuxorProposalPackageSettings {
  const outer = record(config) || {}
  const luxorCosts = record(outer.luxor_costs) || outer
  const saved = record(luxorCosts.package_selection_v1) || {}
  const savedOptions = record(saved.options) || {}
  const options = Object.fromEntries(LUXOR_PROPOSAL_PACKAGE_IDS.map((id) => {
    const defaults = DEFAULT_LUXOR_PROPOSAL_PACKAGE_SETTINGS.options[id]
    const savedOption = record(savedOptions[id]) || {}
    return [id, {
      ...defaults,
      ...savedOption,
      id,
      inclusions: Array.isArray(savedOption.inclusions)
        ? savedOption.inclusions.filter((item): item is string => typeof item === 'string')
        : [...defaults.inclusions],
      price_tiers: Array.isArray(savedOption.price_tiers)
        ? savedOption.price_tiers.map((tier) => record(tier) || {})
          .map((tier) => ({
            min_guests: Number(tier.min_guests),
            max_guests: Number(tier.max_guests),
            amount: Number(tier.amount),
          }))
        : defaults.price_tiers.map((tier) => ({ ...tier })),
    } satisfies LuxorProposalPackageOption]
  })) as LuxorProposalPackageSettings['options']
  return {
    schema_version: Number(saved.schema_version) || LUXOR_PACKAGE_SELECTION_SCHEMA_VERSION,
    options,
  }
}

export function validateLuxorProposalPackageSettings(value: unknown): string[] {
  const settings = record(value)
  const options = record(settings?.options)
  const errors: string[] = []
  if (Number(settings?.schema_version) !== LUXOR_PACKAGE_SELECTION_SCHEMA_VERSION) {
    errors.push('Package settings must use schema version 1.')
  }

  for (const id of LUXOR_PROPOSAL_PACKAGE_IDS) {
    const option = record(options?.[id])
    if (!option) {
      errors.push(`Package settings are missing ${id}.`)
      continue
    }
    for (const field of ['name', 'positioning', 'description', 'summary_title', 'summary'] as const) {
      if (typeof option[field] !== 'string' || !String(option[field]).trim()) errors.push(`Set a ${field.replaceAll('_', ' ')} for ${id}.`)
    }
    if (!Array.isArray(option.inclusions) || !option.inclusions.length || option.inclusions.some((item) => typeof item !== 'string' || !item.trim())) {
      errors.push(`Inclusions for ${id} must contain non-empty text items.`)
    }
    if (id === 'luxor' && (typeof option.most_popular_label !== 'string' || !option.most_popular_label.trim())) {
      errors.push('Set the Most Popular badge text for Luxor.')
    }
    const tiers = Array.isArray(option.price_tiers) ? option.price_tiers : null
    const expectedTierCount = id === 'signature' || id === 'luxor' ? 2 : 0
    if (!tiers || tiers.length !== expectedTierCount) {
      errors.push(`${id} must have ${expectedTierCount} guest-count price tiers.`)
      continue
    }
    if (!expectedTierCount) continue
    const parsed = tiers.map((tier) => record(tier) || {})
    const first = parsed[0]
    const second = parsed[1]
    const hasNumericValue = (value: unknown) => (typeof value === 'number' && Number.isFinite(value))
      || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
    const validTier = (tier: RecordValue) => hasNumericValue(tier.min_guests)
      && hasNumericValue(tier.max_guests)
      && hasNumericValue(tier.amount)
      && Number.isSafeInteger(Number(tier.min_guests))
      && Number.isSafeInteger(Number(tier.max_guests))
      && Number(tier.min_guests) >= 0
      && Number(tier.max_guests) >= Number(tier.min_guests)
      && Number(tier.amount) >= 0
    if (!validTier(first) || !validTier(second)) {
      errors.push(`${id} guest tiers must use whole-number guest boundaries and non-negative prices.`)
      continue
    }
    if (Number(first.min_guests) !== 0 || Number(second.min_guests) !== Number(first.max_guests) + 1) {
      errors.push(`${id} guest tiers must start at 0 and meet without gaps or overlaps.`)
    }
  }
  return [...new Set(errors)]
}

export function calculateLuxorProposalPackageFee(
  packageId: LuxorProposalPackageTierId,
  guestCount: number,
  settings: LuxorProposalPackageSettings,
) {
  const option = settings.options[packageId]
  if (!option) return { amount: null, valid: false, error: 'Choose a recognized Luxor package.' }
  if (!Number.isSafeInteger(guestCount) || guestCount < 0) {
    return { amount: null, valid: false, error: 'Enter a valid guest count before pricing this package.' }
  }
  if (!option.price_tiers.length) return { amount: 0, valid: true, error: null }
  const tier = option.price_tiers.find((entry) => guestCount >= entry.min_guests && guestCount <= entry.max_guests)
  if (!tier) return { amount: null, valid: false, error: `Pricing for ${option.name} at ${guestCount} guests needs owner review.` }
  return { amount: tier.amount, valid: true, error: null }
}

export function packageInclusionsForDisplay(
  option: LuxorProposalPackageOption,
  rentalHours: number,
  customizedAdditions: string[] = [],
  decorCatalog?: Array<{ id: string; name: string; included_in_packages: string[]; active?: boolean }>,
  tableclothUpgradeSelected = false,
) {
  const hoursLabel = Number.isFinite(rentalHours) && rentalHours > 0 ? String(rentalHours) : 'Custom'
  const stopWords = new Set(['and', 'or', 'for', 'up', 'to', 'with', 'the', 'a', 'an', 'of'])
  const packageWords = (value: string) => value.toLowerCase().match(/[a-z0-9]+/g)?.map((word) => {
    if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y'
    if (word.endsWith('s') && word.length > 4) return word.slice(0, -1)
    return word
  }).filter((word) => !stopWords.has(word)) || []
  const referencesCatalogItem = (copy: string, name: string) => {
    const normalizedCopy = copy.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (normalizedCopy === normalizedName || normalizedCopy.includes(normalizedName)) return true
    const copyWords = new Set(packageWords(copy))
    return packageWords(name).filter((word) => copyWords.has(word)).length >= 2
  }
  const configuredNames = decorCatalog?.flatMap((item) => [item.name, ...(DEFAULT_CATALOG_INCLUSION_ALIASES[item.id] || [])]).map((name) => name.trim()).filter(Boolean) || []
  const activeDecorCatalog = decorCatalog?.filter((item) => item.active !== false) || []
  const items = option.inclusions
    .map((item) => item.replaceAll('%rental_hours%', hoursLabel))
    .filter((item) => {
      const normalized = item.trim().toLowerCase()
      if (decorCatalog && /tablecloth/.test(normalized)) return false
      return !configuredNames.some((name) => referencesCatalogItem(item, name))
    })
  if (decorCatalog) {
    const tableclothItem = activeDecorCatalog.find((item) => item.id === 'tablecloths')
    const tableclothIncluded = tableclothItem?.included_in_packages.includes(option.id) === true
    items.push(tableclothIncluded || tableclothUpgradeSelected
      ? 'Any color tablecloths, up to 2 colors.'
      : 'Black or white tablecloths')
    items.push(...activeDecorCatalog
      .filter((item) => item.id !== 'tablecloths' && item.included_in_packages.includes(option.id))
      .map((item) => item.name))
  }
  if (option.id === 'customized') items.push(...customizedAdditions)
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.trim().toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
