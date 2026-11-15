/** Current visit-scheduling CTA click event (since tour → visit rename). */
export const LUXOR_VISIT_CTA_CLICK_EVENT = 'visit_cta_click' as const

/** Legacy visit-scheduling CTA click event; retained for historical analytics ranges. */
export const LUXOR_TOUR_CTA_CLICK_EVENT = 'tour_cta_click' as const

/** Generic CTA click events counted in per-page performance (engagement rate). */
export const LUXOR_GENERIC_CTA_CLICK_EVENT = 'cta_click' as const

export const LUXOR_VISIT_CTA_CLICK_EVENT_NAMES = [
  LUXOR_VISIT_CTA_CLICK_EVENT,
  LUXOR_TOUR_CTA_CLICK_EVENT,
] as const

export const LUXOR_PAGE_PERFORMANCE_CTA_CLICK_EVENT_NAMES = [
  ...LUXOR_VISIT_CTA_CLICK_EVENT_NAMES,
  LUXOR_GENERIC_CTA_CLICK_EVENT,
] as const

export type LuxorVisitCtaClickEventName = (typeof LUXOR_VISIT_CTA_CLICK_EVENT_NAMES)[number]

const visitCtaClickEventNames = new Set<string>(LUXOR_VISIT_CTA_CLICK_EVENT_NAMES)
const pagePerformanceCtaClickEventNames = new Set<string>(LUXOR_PAGE_PERFORMANCE_CTA_CLICK_EVENT_NAMES)

export function isLuxorVisitCtaClickEvent(eventName: string): boolean {
  return visitCtaClickEventNames.has(eventName)
}

export function isLuxorPagePerformanceCtaClickEvent(eventName: string): boolean {
  return pagePerformanceCtaClickEventNames.has(eventName)
}

export function countLuxorVisitCtaClicks(events: ReadonlyArray<{ event_name: string }>): number {
  return events.filter((e) => isLuxorVisitCtaClickEvent(e.event_name)).length
}