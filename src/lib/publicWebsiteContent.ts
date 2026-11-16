export type WebsiteDestination = 'brochure' | 'packages' | 'visit'

export const HERO_BUTTON_TEXT_MAX = 40

export const PUBLIC_ACTIONS_CONTENT_KEYS = ['hero', 'other', 'headline', 'introduction', 'heroText'] as const

export type WebsiteContent = {
  hero: WebsiteDestination
  other: WebsiteDestination
  headline: string
  introduction: string
  heroText?: string
}

export const defaultWebsiteContent: WebsiteContent = {
  hero: 'brochure',
  other: 'brochure',
  headline: 'A Beautiful Setting for Life’s Biggest Moments.',
  introduction: 'A modern San Antonio venue created for weddings, quinceañeras, and private celebrations.',
}

const HERO_DEFAULT_LABELS: Record<WebsiteDestination, string> = {
  brochure: 'Get your free venue brochure.',
  packages: 'Explore packages',
  visit: 'Schedule a visit',
}

export function resolvePublicHeroButtonLabel(destination: WebsiteDestination, heroText?: string | null): string {
  const custom = heroText?.trim()
  if (custom) return custom
  return HERO_DEFAULT_LABELS[destination]
}

function parseDestination(value: unknown): WebsiteDestination {
  return value === 'packages' || value === 'visit' ? value : 'brochure'
}

function parseCopy(value: unknown, fallback: string, max: number): string {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fallback
}

function parseHeroText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > HERO_BUTTON_TEXT_MAX) return undefined
  return trimmed
}

export function parseWebsiteContent(value: unknown): WebsiteContent {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const heroText = parseHeroText(data.heroText)
  return {
    hero: parseDestination(data.hero),
    other: parseDestination(data.other),
    headline: parseCopy(data.headline, defaultWebsiteContent.headline, 100),
    introduction: parseCopy(data.introduction, defaultWebsiteContent.introduction, 240),
    ...(heroText ? { heroText } : {}),
  }
}

export function isValidPublicActionsPayload(content: unknown): boolean {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) return false
  const record = content as Record<string, unknown>
  const allowedDestinations = (value: unknown) => value === 'brochure' || value === 'packages' || value === 'visit'

  if (!allowedDestinations(record.hero) || !allowedDestinations(record.other)) return false
  if (Object.keys(record).some((key) => !PUBLIC_ACTIONS_CONTENT_KEYS.includes(key as (typeof PUBLIC_ACTIONS_CONTENT_KEYS)[number]))) {
    return false
  }
  if (
    record.headline !== undefined
    && (typeof record.headline !== 'string' || !record.headline.trim() || record.headline.length > 100)
  ) {
    return false
  }
  if (
    record.introduction !== undefined
    && (typeof record.introduction !== 'string' || !record.introduction.trim() || record.introduction.length > 240)
  ) {
    return false
  }
  if (record.heroText !== undefined) {
    if (typeof record.heroText !== 'string') return false
    const trimmed = record.heroText.trim()
    if (trimmed.length > HERO_BUTTON_TEXT_MAX) return false
  }
  return true
}