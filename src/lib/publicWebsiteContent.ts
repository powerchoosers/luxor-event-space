export type WebsiteDestination = 'brochure' | 'packages' | 'visit'
export type WebsiteContent = { hero: WebsiteDestination; other: WebsiteDestination; headline: string; introduction: string }
export const defaultWebsiteContent: WebsiteContent = {
  hero: 'brochure', other: 'brochure',
  headline: 'A Beautiful Setting for Life’s Biggest Moments.',
  introduction: 'A modern San Antonio venue created for weddings, quinceañeras, and private celebrations.',
}
export function parseWebsiteContent(value: unknown): WebsiteContent {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const destination = (v: unknown): WebsiteDestination => v === 'packages' || v === 'visit' ? v : 'brochure'
  const copy = (v: unknown, fallback: string, max: number) => typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : fallback
  return { hero: destination(data.hero), other: destination(data.other), headline: copy(data.headline, defaultWebsiteContent.headline, 100), introduction: copy(data.introduction, defaultWebsiteContent.introduction, 240) }
}
