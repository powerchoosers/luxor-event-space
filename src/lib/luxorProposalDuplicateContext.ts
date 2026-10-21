const RENTAL_TIME_FIELDS = ['rental_start_time', 'rental_end_time', 'start_time', 'end_time'] as const

export const PREFERRED_VENDOR_ESTIMATE_SERVICE_IDS = [
  'essential_decor',
  'full_decor',
  'buffet_catering',
  'plated_catering',
  'dj',
  'photo_booth_signature',
  'photo_booth_celebration',
  'photo_booth_forever',
  'bartender_service',
  'byob_signature',
  'byob_premium',
  'byob_non_alcoholic',
] as const

const PREFERRED_VENDOR_ESTIMATE_SERVICE_ID_SET = new Set<string>(PREFERRED_VENDOR_ESTIMATE_SERVICE_IDS)
const PREFERRED_VENDOR_ESTIMATE_SELECTION_ALIASES = new Set([
  ...PREFERRED_VENDOR_ESTIMATE_SERVICE_IDS,
  'essentialdecor',
  'fulldecor',
  'fulldecorandplanning',
  'buffet',
  'buffetcatering',
  'plated',
  'platedcatering',
  'signaturephotobooth',
  'photoboothsignature',
  'celebrationphotobooth',
  'photoboothcelebration',
  'foreverphotobooth',
  'photoboothforever',
  'bartender',
  'bartenderservice',
  'signaturebyob',
  'byobsignature',
  'premiumbyob',
  'byobpremium',
  'nonalcoholic',
  'nonalcoholicbar',
  'byobnonalcoholic',
].map((id) => id.toLowerCase().replace(/[^a-z0-9]/g, '')))

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function isPreferredVendorEstimateLine(value: unknown): boolean {
  const item = record(value)
  if (!item) return false
  const category = typeof item.category === 'string' ? item.category.trim().toLowerCase() : ''
  const id = item.id ?? item.catalogId ?? item.catalog_id
  const catalogId = item.catalogId ?? item.catalog_id
  const isManualVendorEstimate = (typeof id === 'string' && id.startsWith('custom-'))
    && (item.costClassification ?? item.cost_classification) === 'preferred_vendor_estimate'
  if (isManualVendorEstimate) return true
  return category === 'preferred vendor collection'
    || category.startsWith('preferred vendor services - estimated pricing')
    || (typeof id === 'string' && id.startsWith('preferred-vendor-'))
    || (typeof catalogId === 'string' && PREFERRED_VENDOR_ESTIMATE_SERVICE_ID_SET.has(catalogId))
}

function selectionItemMatchesPreferredVendorEstimate(value: unknown, vendorLineIds: Set<string>) {
  const item = record(value)
  if (!item) return false
  if (isPreferredVendorEstimateLine(item)) return true
  const id = item.id ?? item.catalogId ?? item.catalog_id
  return typeof id === 'string' && vendorLineIds.has(id)
}

function copyStringFields(context: Record<string, unknown>, fields: readonly string[]): Record<string, string> {
  return Object.fromEntries(fields.flatMap((field) => {
    const value = context[field]
    return typeof value === 'string' && value.trim() ? [[field, value]] : []
  }))
}

/** Preserve the proposal's saved venue access window when making a copy. */
export function getDuplicatedProposalRentalTimeFields(context: Record<string, unknown>): Record<string, string> {
  return copyStringFields(context, RENTAL_TIME_FIELDS)
}

/** Keep the separately saved guest-hours window in the copied builder context. */
export function getDuplicatedProposalTimingContext(context: Record<string, unknown>): Record<string, string> {
  return {
    ...getDuplicatedProposalRentalTimeFields(context),
    ...copyStringFields(context, ['guest_arrival_time', 'event_end_time']),
    ...(!context.guest_arrival_time && typeof context.guestArrivalTime === 'string' && context.guestArrivalTime.trim()
      ? { guest_arrival_time: context.guestArrivalTime }
      : {}),
    ...(!context.event_end_time && typeof context.eventEndTime === 'string' && context.eventEndTime.trim()
      ? { event_end_time: context.eventEndTime }
      : {}),
  }
}

/** Clone pricing inputs for a new draft without copied Preferred Vendor Collection estimates. */
export function getDuplicatedProposalSelection(
  savedSelection: Record<string, unknown>,
  savedLineItems: unknown[] = [],
): Record<string, unknown> {
  const selection = { ...savedSelection }
  delete selection.promotionId
  delete selection.promotion_id

  const vendorLineIds = new Set(savedLineItems.flatMap((value) => {
    if (!isPreferredVendorEstimateLine(value)) return []
    const item = record(value)
    return [item?.id, item?.catalogId, item?.catalog_id].filter((id): id is string => typeof id === 'string')
  }))
  const withoutPreferredVendorIds = (value: unknown) => Array.isArray(value)
    ? value.filter((id) => typeof id !== 'string' || !PREFERRED_VENDOR_ESTIMATE_SELECTION_ALIASES.has(id.toLowerCase().replace(/[^a-z0-9]/g, '')))
    : value

  for (const field of ['addOns', 'add_ons', 'service_ids', 'services']) {
    if (Object.prototype.hasOwnProperty.call(selection, field)) selection[field] = withoutPreferredVendorIds(selection[field])
  }
  for (const field of ['customItems', 'custom_items']) {
    if (Array.isArray(selection[field])) {
      selection[field] = (selection[field] as unknown[]).filter((item) => !selectionItemMatchesPreferredVendorEstimate(item, vendorLineIds))
    }
  }
  return selection
}
