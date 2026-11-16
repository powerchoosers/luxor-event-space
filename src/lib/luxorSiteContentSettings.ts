export type PublicCtaDestination = 'brochure' | 'packages' | 'visit' | 'custom'

export interface PublicHeroCtaConfig {
  destination: PublicCtaDestination
  buttonText?: string
  customHref?: string
}

export interface PublicSecondaryCtaConfig {
  destination: PublicCtaDestination
  buttonText?: string
  customHref?: string
}

export interface PublicAnnouncementConfig {
  enabled: boolean
  text: string
  linkText?: string
  linkHref?: string
}

export interface PublicSiteHighlightsConfig {
  capacity: string
  visitType: string
  location: string
}

export interface LuxorSiteContentSettings {
  heroCta: PublicHeroCtaConfig
  secondaryCta: PublicSecondaryCtaConfig
  announcement: PublicAnnouncementConfig
  highlights: PublicSiteHighlightsConfig
}

export const DEFAULT_SITE_SETTINGS: LuxorSiteContentSettings = {
  heroCta: {
    destination: 'brochure',
    buttonText: 'Get your free venue brochure.',
    customHref: '',
  },
  secondaryCta: {
    destination: 'brochure',
    buttonText: 'Get Venue Brochure',
    customHref: '',
  },
  announcement: {
    enabled: false,
    text: 'Now booking 2026 & 2027 celebrations · Limited weekend availability',
    linkText: 'Schedule a visit →',
    linkHref: '/visit',
  },
  highlights: {
    capacity: 'Up to 180 guests',
    visitType: 'Private appointments',
    location: 'San Antonio, Texas',
  },
}

export const SUGGESTED_HERO_LABELS: Record<PublicCtaDestination, string> = {
  brochure: 'Get your free venue brochure.',
  packages: 'Explore our event packages',
  visit: 'Schedule a private visit',
  custom: 'Learn more about Luxor',
}

export const SUGGESTED_SECONDARY_LABELS: Record<PublicCtaDestination, string> = {
  brochure: 'Get Venue Brochure',
  packages: 'View Packages & Pricing',
  visit: 'Schedule a Visit',
  custom: 'Explore Luxor',
}

export function resolveHeroCta(config?: Partial<PublicHeroCtaConfig> | null) {
  const destination: PublicCtaDestination = config?.destination || 'brochure'
  let href = '#brochure-form'
  const isBrochure = destination === 'brochure'

  switch (destination) {
    case 'brochure':
      href = '#brochure-form'
      break
    case 'packages':
      href = '/packages'
      break
    case 'visit':
      href = '/visit'
      break
    case 'custom':
      href = config?.customHref?.trim() || '/'
      break
  }

  const defaultLabel = SUGGESTED_HERO_LABELS[destination] || 'Get your free venue brochure.'
  const label = config?.buttonText?.trim() || defaultLabel

  return { destination, href, label, isBrochure }
}

export function resolveSecondaryCta(config?: Partial<PublicSecondaryCtaConfig> | null) {
  const destination: PublicCtaDestination = config?.destination || 'brochure'
  let href = '/#brochure-form'
  const isBrochure = destination === 'brochure'

  switch (destination) {
    case 'brochure':
      href = '/#brochure-form'
      break
    case 'packages':
      href = '/packages'
      break
    case 'visit':
      href = '/visit'
      break
    case 'custom':
      href = config?.customHref?.trim() || '/'
      break
  }

  const defaultLabel = SUGGESTED_SECONDARY_LABELS[destination] || 'Get Venue Brochure'
  const label = config?.buttonText?.trim() || defaultLabel

  return { destination, href, label, isBrochure }
}

export function resolveAnnouncement(config?: Partial<PublicAnnouncementConfig> | null): PublicAnnouncementConfig {
  return {
    enabled: Boolean(config?.enabled),
    text: config?.text?.trim() || DEFAULT_SITE_SETTINGS.announcement.text,
    linkText: config?.linkText?.trim() || DEFAULT_SITE_SETTINGS.announcement.linkText,
    linkHref: config?.linkHref?.trim() || DEFAULT_SITE_SETTINGS.announcement.linkHref,
  }
}

export function resolveHighlights(config?: Partial<PublicSiteHighlightsConfig> | null): PublicSiteHighlightsConfig {
  return {
    capacity: config?.capacity?.trim() || DEFAULT_SITE_SETTINGS.highlights.capacity,
    visitType: config?.visitType?.trim() || DEFAULT_SITE_SETTINGS.highlights.visitType,
    location: config?.location?.trim() || DEFAULT_SITE_SETTINGS.highlights.location,
  }
}
