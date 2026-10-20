import type {
  LuxorInvoiceLineItem,
  LuxorProposalContext,
  LuxorProposalPaymentPlan,
  LuxorProposalPromotionSnapshot,
  LuxorProposalPriceBreakdown,
} from './luxorInquiryTypes'
import { isLuxorCollectedLineItem } from './luxorPaymentOwnership'
import { formatCatalogTime } from './luxorPricingCatalog'
import { LUXOR_EVENT_TIME_ZONE, proposalEventTiming, proposalSecurityDuration } from './luxorProposalTerms'
import { OFFICIAL_DECOR_SERVICES, getOfficialDecorService } from './luxorDecorCatalog'
import {
  includedLuxorDecorQuantity,
  LUXOR_DECOR_CATALOG_KEY,
  luxorDecorUnitLabel,
  readLuxorDecorCatalog,
  type LuxorDecorCatalogItem,
} from './luxorDecorCatalogV2'
import { calculateLuxorPaymentSchedule, paymentPlanFromSchedule } from './luxorPaymentSchedule'
import {
  calculateLuxorProposalPackageFee,
  getLuxorProposalPackageSettings,
  LUXOR_PACKAGE_SELECTION_SCHEMA_VERSION,
  LUXOR_PROPOSAL_PACKAGE_IDS,
  packageInclusionsForDisplay,
  type LuxorProposalPackageOption,
  type LuxorProposalPackageTierId,
} from './luxorProposalPackages'
import type { LuxorSameDayBookingSnapshot } from './luxorSameDayBooking'
import { getWeekdayCustomRentalPolicy, validateWeekdayCustomRentalTiming, validateWeekdayCustomRentalSchedule, weekdayCustomRentalSnapshot, formatWeekdayCustomRentalDuration, formatWeekdayCustomRentalPriceBreakdown } from './luxorWeekdayRental'
import { formatLuxorCustomTimeRentalPriceBreakdownV4, getLuxorCustomTimeRentalPolicyV4, luxorCustomTimeRentalSnapshotV4, validateLuxorCustomTimeScheduleV4 } from './luxorCustomTimeRentalV4'

export type LuxorProposalPackageId =
  | 'rental_only'
  | 'bronze_essentials'
  | 'silver_premier'
  | 'gold_all_inclusive'

export type LuxorRentalPeriod = 'morning' | 'evening' | 'full_day' | 'custom'

/**
 * A non-catalog line entered by an authenticated Luxor owner. Custom items
 * are deliberately explicit: the calculator owns the multiplication and
 * snapshot, but it never invents a description, quantity, or price.
 */
export type LuxorProposalCustomItem = {
  id?: string
  category?: string
  description?: string
  quantity?: number | string
  unitPrice?: number | string
  paymentBucket?: 'venue' | 'event'
  /** Owner-controlled classification. Vendor estimates are never invoice lines. */
  costClassification?: 'luxor_charge' | 'preferred_vendor_estimate'
  detail?: string
}

export type LuxorProposalAddOnQuote = {
  id: string
  label: string
  category: string
  /** Mutually exclusive service family used for replacement semantics. */
  group: 'decor' | 'catering' | 'dj' | 'photo_booth' | 'bar' | 'decor_package' | 'decor_add_on'
  unitPrice?: number
  quantity?: number
  minimumQuantity?: number
  unit?: string
  /** Concrete catalog choice within the service family. */
  kind: string
  rateTier: 'retail' | 'all_inclusive'
  available: boolean
  total: number | null
  lineItems: LuxorInvoiceLineItem[]
  /** Exact owner-facing math for the selectable service. */
  quoteBreakdown?: LuxorProposalPriceBreakdown
  /** A basic service this option replaces instead of stacking on top of it. */
  replacementOf?: string
  /** Difference to the selected package's default configuration. */
  selectionDelta?: number | null
  /** Whether this service is already the package default, selected, or available. */
  state?: 'included' | 'selected' | 'available'
  error?: string
  officialDecorCategory?: string
  description?: string
  includedQuantity?: number
  selectedQuantity?: number
  pricingUnit?: string
}

export type LuxorProposalSelection = {
  packageId?: LuxorProposalPackageId | string | null
  /** New proposal tier, independent from the legacy package IDs above. */
  packageTierId?: LuxorProposalPackageTierId | string | null
  package_tier_id?: LuxorProposalPackageTierId | string | null
  luxorPackageId?: LuxorProposalPackageTierId | string | null
  luxor_package_id?: LuxorProposalPackageTierId | string | null
  proposalPricingPolicyVersion?: number | string | null
  proposal_pricing_policy_version?: number | string | null
  eventDate?: string | null
  guestCount?: number | string | null
  eventType?: string | null
  rentalPeriod?: LuxorRentalPeriod | string | null
  rentalStartTime?: string | null
  rentalEndTime?: string | null
  rental_start_time?: string | null
  rental_end_time?: string | null
  addOns?: string[] | null
  add_ons?: string[] | null
  decorPackageId?: string | null
  decor_package_id?: string | null
  decorAddOnQuantities?: Record<string, number> | null
  decor_add_on_quantities?: Record<string, number> | null
  removedServiceIds?: string[] | null
  removed_service_ids?: string[] | null
  /** Only the server resolves this to a saved promotion and its exact terms. */
  promotionId?: string | null
  promotion_id?: string | null
  /** Additional saved benefit; independent from the existing price promotion. */
  taxCoveragePromotionId?: string | null
  tax_coverage_promotion_id?: string | null
  discountType?: 'percent' | 'fixed' | string | null
  discountValue?: number | string | null
  discountApproved?: boolean | null
  taxRate?: number | string | null
  paymentPlan?: Partial<LuxorProposalPaymentPlan> | Record<string, unknown> | null
  paymentPolicyAcknowledged?: boolean | null
  payment_policy_acknowledged?: boolean | null
  adminOverride?: boolean | null
  bartenderAdditionalHours?: number | string | null
  bartenderStaffCount?: number | string | null
  guestArrivalTime?: string | null
  guest_arrival_time?: string | null
  eventEndTime?: string | null
  event_end_time?: string | null
  securityHours?: number | string | null
  security_hours?: number | string | null
  customItems?: LuxorProposalCustomItem[] | null
  custom_items?: LuxorProposalCustomItem[] | null
  [key: string]: unknown
}

export type LuxorProposalResolvedPromotion = Omit<LuxorProposalPromotionSnapshot, 'amount'>

export type LuxorProposalCalculationOptions = {
  /** Only server-resolved saved promotions are eligible to change the total. */
  promotion?: LuxorProposalResolvedPromotion | null
  sameDayBooking?: LuxorSameDayBookingSnapshot | null
}

/** The server chooses the pricing policy from the saved proposal's history. */
export function withLuxorProposalPricingPolicyVersion(
  selection: LuxorProposalSelection,
  policyVersion: number,
): LuxorProposalSelection {
  const version = policyVersion >= 4 ? 4 : 3
  const plan = record(selection.paymentPlan ?? selection.payment_plan)
  if (!plan) return { ...selection, proposalPricingPolicyVersion: version, proposal_pricing_policy_version: version }
  const nextPlan = { ...plan }
  if (version < 4) delete nextPlan.schedule_anchor_policy
  return {
    ...selection,
    proposalPricingPolicyVersion: version,
    proposal_pricing_policy_version: version,
    paymentPlan: nextPlan as LuxorProposalSelection['paymentPlan'],
    payment_plan: nextPlan as LuxorProposalSelection['payment_plan'],
  }
}

/**
 * The JSONB pricing record is deliberately data-led. Its shape is validated
 * at calculation time so a malformed owner config can never produce a made-up
 * final proposal.
 */
export type LuxorProposalPricingConfig = Record<string, unknown>

type PricingRecord = Record<string, unknown>
type Tier = { min_guests?: unknown; max_guests?: unknown; amount?: unknown; officers?: unknown }

const DEFAULT_SECURITY_HOURLY_RATE = 30

const securityDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: LUXOR_EVENT_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

type PackageCalculation = {
  id: LuxorProposalPackageId | LuxorProposalPackageTierId | string
  name: string
  description: string
  positioning?: string
  summaryTitle?: string
  summary?: string
  inclusions?: string[]
  packageFeeAmount?: number | null
  package_fee_amount?: number | null
  customizationStatus?: 'none' | 'added'
  pricingReviewRequired?: boolean
  finalEventPrice: number | null
  final_event_price: number | null
  refundableSecurityDeposit: number
  refundable_security_deposit: number
  amountDueToBook: number | null
  amount_due_to_book: number | null
  subtotal: number
  discountAmount: number
  discount_amount: number
  taxAmount: number
  tax_amount: number
  taxRate: number
  tax_rate: number
  lineItems: LuxorInvoiceLineItem[]
  line_items: LuxorInvoiceLineItem[]
  promotion?: LuxorProposalPromotionSnapshot
  warnings: string[]
  errors: string[]
}

export type LuxorProposalCalculation = {
  /** True when the package itself has enough approved rate data to calculate. */
  valid: boolean
  /** True only when the calculated package is ready to become a final proposal. */
  publishable: boolean
  /** Errors in the actual rate calculation (missing pricing rule, invalid event facts, etc.). */
  calculationErrors: string[]
  /** Requirements that prevent publication but do not change the calculated event price. */
  publicationErrors: string[]
  requirements: {
    paymentPlan: boolean
  }
  errors: string[]
  warnings: string[]
  packages: PackageCalculation[]
  packageOptions?: LuxorProposalPackageOption[]
  lineItems: LuxorInvoiceLineItem[]
  line_items: LuxorInvoiceLineItem[]
  subtotal: number
  discountAmount: number
  discount_amount: number
  taxAmount: number
  tax_amount: number
  taxRate: number
  tax_rate: number
  total: number | null
  finalEventPrice: number | null
  final_event_price: number | null
  securityDepositAmount: number
  refundable_security_deposit: number
  totalWithSecurityDeposit: number | null
  amountDueToBook: number | null
  amount_due_to_book: number | null
  /** Exact pre-tax quotes for each catalog add-on under the selected package's rate tier. */
  addOnQuotes: LuxorProposalAddOnQuote[]
  /** Planning-only third-party selections. These are deliberately excluded from lineItems and total. */
  selectedVendorEstimateLines?: LuxorInvoiceLineItem[]
  preferred_vendor_estimate_lines?: LuxorInvoiceLineItem[]
  confirmedLuxorTotal?: number | null
  confirmed_luxor_total?: number | null
  estimatedVendorTotal?: number
  estimated_vendor_total?: number
  estimatedOverallInvestment?: number | null
  estimated_overall_investment?: number | null
  /** Server-resolved terms for the applied saved promotion, if any. */
  promotion?: LuxorProposalPromotionSnapshot
  proposalContext: LuxorProposalContext
  context: LuxorProposalContext
  snapshot: Record<string, unknown>
}

const CONFIGURATION_ERROR = 'Pricing configuration required — administrator review.'
const PAYMENT_PLAN_REQUIRED = 'Set the payment plan in Step 5 before publishing this final proposal.'

/**
 * The code fallback mirrors the approved rate schedule. It intentionally has
 * no payment-plan default and no bartender staffing headcount: both require a
 * real owner decision before a proposal can be finalized.
 */
export const LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG: LuxorProposalPricingConfig = {
  schema_version: 1,
  currency: 'USD',
  pricing_mode: 'fixed_rules_only',
  manual_price_override: false,
  undefined_scenario_action: 'administrator_review_required',
  guest_count: { minimum: 1, maximum: 200, tables_per_guest: 0.1, table_rounding: 'ceil' },
  rental_access: {
    morning: { start: '09:00', end: '15:00', hours: 6 },
    evening: { start: '17:00', end: '23:00', hours: 6 },
    full_day: { start: '09:00', end: '23:00', hours: 14 },
    full_decor_or_all_inclusive: {
      event_access_hours: 8,
      setup_and_breakdown_hours: 4,
      total_venue_access_hours: 12,
      display_note: '8 hours of event access plus 4 hours for setup and breakdown',
    },
  },
  rental_rates: {
    monday_thursday: { morning: 1200, evening: 1200, full_day: 1600 },
    friday: { morning: 1000, evening: 1700, full_day: 2500 },
    saturday: { morning: 1900, evening: 2100, full_day: 3500 },
    sunday: { morning: 1400, evening: 1200, full_day: 1600 },
  },
  rental_rate_rules: {
    monday_thursday: {
      morning: { public: true, pricing_type: 'hourly', hourly_rate: 400, minimum_hours: 3 },
      evening: { public: false, pricing_type: 'fixed' },
      full_day: { public: true, pricing_type: 'fixed' },
    },
    friday: { morning: { public: true, pricing_type: 'fixed' }, evening: { public: true, pricing_type: 'fixed' }, full_day: { public: true, pricing_type: 'fixed' } },
    saturday: { morning: { public: true, pricing_type: 'fixed' }, evening: { public: true, pricing_type: 'fixed' }, full_day: { public: true, pricing_type: 'fixed' } },
    sunday: { morning: { public: true, pricing_type: 'fixed' }, evening: { public: true, pricing_type: 'fixed' }, full_day: { public: true, pricing_type: 'fixed' } },
  },
  additional_time_rates: { monday_thursday: 200, friday: 350 },
  booking_payment: { amount: 500 },
  required_fees: {
    cleaning: {
      retail: [{ min_guests: 1, max_guests: 75, amount: 250 }, { min_guests: 76, max_guests: 150, amount: 325 }, { min_guests: 151, max_guests: 200, amount: 400 }],
      all_inclusive: [{ min_guests: 1, max_guests: 75, amount: 200 }, { min_guests: 76, max_guests: 150, amount: 260 }, { min_guests: 151, max_guests: 200, amount: 320 }],
    },
    security: {
      hourly_rate: DEFAULT_SECURITY_HOURLY_RATE,
      minimum_hours: 4,
      retail: [{ min_guests: 1, max_guests: 149, officers: 1, amount: 250 }, { min_guests: 150, max_guests: 200, officers: 2, amount: 450 }],
      all_inclusive: [{ min_guests: 1, max_guests: 149, officers: 1, amount: 200 }, { min_guests: 150, max_guests: 200, officers: 2, amount: 400 }],
    },
  },
  tables: {
    guests_per_table: 10,
    rounding: 'ceil',
    included_tables: 10,
    additional_table_rates: {
      essential_decor: { retail: 70, all_inclusive: 40 },
      full_decor_and_planning: { retail: 160, all_inclusive: 120 },
    },
  },
  // Tables and chairs setup is included at no additional charge in every package.
  tables_and_chairs_setup: { retail: 0, all_inclusive: 0 },
  decor: {
    essential: { retail: 700, all_inclusive: 700 },
    full_decor_and_planning: { retail: 5250, all_inclusive: 4350 },
  },
  catering: {
    buffet: { retail_per_guest: 25.5, all_inclusive_per_guest: 21.5 },
    plated: { retail_per_guest: 31.5, all_inclusive_per_guest: 26.5 },
  },
  dj: { hours: 6, retail: 1200, all_inclusive: 1000 },
  photo_booth: {
    selection_limit: 1,
    signature_experience: { retail: 650, all_inclusive: 550 },
    celebration_experience: { retail: 850, all_inclusive: 750 },
    forever_experience: { retail: 1100, all_inclusive: 999 },
  },
  bartending: {
    service_hours: 5,
    retail: {
      staffing: [{ min_guests: 1, max_guests: 75, amount: 550 }, { min_guests: 76, max_guests: 150, amount: 950 }, { min_guests: 151, max_guests: 200, amount: 1350 }],
      additional_hour_per_bartender: 90,
      bars: { signature_byob: { per_guest: 12, minimum: 750 }, premium_byob: { per_guest: 17, minimum: 1000 }, non_alcoholic: { per_guest: 9, minimum: 500 } },
    },
    all_inclusive: {
      staffing: [{ min_guests: 1, max_guests: 75, amount: 450 }, { min_guests: 76, max_guests: 150, amount: 800 }, { min_guests: 151, max_guests: 200, amount: 1150 }],
      additional_hour_per_bartender: 75,
      bars: { signature_byob: { per_guest: 10, minimum: 750 }, premium_byob: { per_guest: 14, minimum: 1000 }, non_alcoholic: { per_guest: 7, minimum: 500 } },
    },
  },
  security_deposit: { amount: 750, refundable: true, separate_from_event_price: true, required: true },
  taxes_and_processing_fees: { configured_by_owner: true, included_in_service_prices: false },
  discounts: { allowed_types: ['percent', 'fixed'], automatic_discounts: false, explicit_approval_required: true, visible_to_client: true },
}

const PACKAGE_NAMES: Record<LuxorProposalPackageId, string> = {
  rental_only: 'Custom Package',
  bronze_essentials: 'Bronze - Essentials',
  silver_premier: 'Silver - Premier',
  gold_all_inclusive: 'Gold - All-Inclusive',
}

const PACKAGE_DESCRIPTIONS: Record<LuxorProposalPackageId, string> = {
  rental_only: 'Venue rental with required cleaning, security, and setup.',
  bronze_essentials: 'Venue rental, essential decor, buffet catering, and DJ.',
  silver_premier: 'Full decor and planning, buffet catering, DJ, and Signature Photo Booth.',
  gold_all_inclusive: 'Silver package inclusions plus bartender service.',
}

const ADD_ON_ALIASES: Record<string, string> = {
  essentialdecor: 'essential_decor',
  fulldecor: 'full_decor',
  fulldecorandplanning: 'full_decor',
  buffet: 'buffet_catering',
  buffetcatering: 'buffet_catering',
  plated: 'plated_catering',
  platedcatering: 'plated_catering',
  signaturephotobooth: 'photo_booth_signature',
  photoboothsignature: 'photo_booth_signature',
  celebrationphotobooth: 'photo_booth_celebration',
  photoboothcelebration: 'photo_booth_celebration',
  foreverphotobooth: 'photo_booth_forever',
  photoboothforever: 'photo_booth_forever',
  bartender: 'bartender_service',
  bartenderservice: 'bartender_service',
  signaturebyob: 'byob_signature',
  byobsignature: 'byob_signature',
  premiumbyob: 'byob_premium',
  byobpremium: 'byob_premium',
  nonalcoholic: 'byob_non_alcoholic',
  nonalcoholicbar: 'byob_non_alcoholic',
  byobnonalcoholic: 'byob_non_alcoholic',
}

const ADD_ON_QUOTE_OPTIONS = [
  { id: 'essential_decor', label: 'Essential Decor', category: 'Decor', group: 'decor', kind: 'essential' },
  { id: 'full_decor', label: 'Full Decor & Planning', category: 'Decor', group: 'decor', kind: 'full' },
  { id: 'buffet_catering', label: 'Buffet catering', category: 'Catering', group: 'catering', kind: 'buffet' },
  { id: 'plated_catering', label: 'Plated catering', category: 'Catering', group: 'catering', kind: 'plated' },
  { id: 'dj', label: 'DJ (6 hours)', category: 'Entertainment', group: 'dj', kind: 'dj' },
  { id: 'photo_booth_signature', label: 'Signature Photo Booth', category: 'Photo booth', group: 'photo_booth', kind: 'signature' },
  { id: 'photo_booth_celebration', label: 'Celebration Photo Booth', category: 'Photo booth', group: 'photo_booth', kind: 'celebration' },
  { id: 'photo_booth_forever', label: 'Forever Photo Booth', category: 'Photo booth', group: 'photo_booth', kind: 'forever' },
  { id: 'bartender_service', label: 'Bartender service', category: 'Bar', group: 'bar', kind: 'bartender' },
  { id: 'byob_signature', label: 'Signature BYOB bar', category: 'Bar', group: 'bar', kind: 'signature_byob' },
  { id: 'byob_premium', label: 'Premium BYOB bar', category: 'Bar', group: 'bar', kind: 'premium_byob' },
  { id: 'byob_non_alcoholic', label: 'Non-alcoholic bar package', category: 'Bar', group: 'bar', kind: 'non_alcoholic' },
] as const

type ServiceChoiceGroup = 'decor' | 'catering' | 'dj' | 'photo_booth' | 'bar'
type ServiceQuoteOption = typeof ADD_ON_QUOTE_OPTIONS[number]

function record(value: unknown): PricingRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as PricingRecord : null
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function numberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return undefined
  const valueAsNumber = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(valueAsNumber) ? valueAsNumber : undefined
}

function rounded(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function readRecord(root: unknown, ...path: string[]) {
  let current: unknown = root
  for (const key of path) {
    const next = record(current)
    if (!next) return null
    current = next[key]
  }
  return record(current)
}

function readNumber(root: unknown, ...path: string[]) {
  let current: unknown = root
  for (const key of path) {
    const next = record(current)
    if (!next) return undefined
    current = next[key]
  }
  return numberValue(current)
}

function normalizePackageId(value: unknown): LuxorProposalPackageId | null {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z]/g, '')
  if (normalized === 'custompackage' || normalized === 'rentalonly' || normalized === 'rentonly' || normalized === 'venue') return 'rental_only'
  if (normalized === 'bronzeessentials' || normalized === 'bronze' || normalized === 'essentials') return 'bronze_essentials'
  if (normalized === 'silverpremier' || normalized === 'silver' || normalized === 'premier') return 'silver_premier'
  if (normalized === 'goldallinclusive' || normalized === 'gold' || normalized === 'allinclusive') return 'gold_all_inclusive'
  return null
}

function normalizeRentalPeriod(value: unknown): LuxorRentalPeriod | null {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z]/g, '')
  if (normalized === 'morning' || normalized === 'am') return 'morning'
  if (normalized === 'evening' || normalized === 'pm') return 'evening'
  if (normalized === 'fullday' || normalized === 'full') return 'full_day'
  if (normalized === 'custom') return 'custom'
  return null
}

function eventAccessLabel(luxor: PricingRecord, rentalPeriod: LuxorRentalPeriod, fullDecorAccess = false) {
  if (fullDecorAccess) return '8 hours of event access plus 4 hours for setup and breakdown'
  const access = readRecord(luxor, 'rental_access', rentalPeriod)
  const start = formatCatalogTime(access?.start)
  const end = formatCatalogTime(access?.end)
  return start && end ? `${start}–${end} access` : rentalPeriod.replace('_', ' ')
}

function eventTimingErrors(selection: LuxorProposalSelection, _config: PricingRecord, period: LuxorRentalPeriod) {
  const timing = proposalEventTiming(period, trimmedString(selection.guestArrivalTime ?? selection.guest_arrival_time), trimmedString(selection.eventEndTime ?? selection.event_end_time))
  return timing.valid ? [] : [timing.error!]
}

function addRentalExtension(items: LuxorInvoiceLineItem[], errors: string[], selection: LuxorProposalSelection, config: PricingRecord, period: LuxorRentalPeriod, eventDate: string) {
  const timing = proposalEventTiming(period, trimmedString(selection.guestArrivalTime ?? selection.guest_arrival_time), trimmedString(selection.eventEndTime ?? selection.event_end_time))
  if (!timing.valid || !timing.additionalHours) return
  const group = dateRateGroup(eventDate)
  const rate = group ? readNumber(config, 'additional_time_rates', group) : undefined
  if (rate === undefined || rate < 0) { errors.push('Set the additional-hour rate for this event day in Settings.'); return }
  items.push(lineItem({ id: 'venue-additional-hours', category: 'Venue Services', description: 'Additional venue rental hours', quantity: timing.additionalHours, unitPrice: rate, paymentBucket: 'venue', required: true, detail: timing.additionalHours + ' additional hour(s) at ' + rate.toLocaleString('en-US', {style: 'currency', currency: 'USD'}) + ' per hour', pricingRuleId: 'additional_time_rates.' + group }))
}

function applyComplimentary(items: LuxorInvoiceLineItem[], promotion: LuxorProposalResolvedPromotion | null, scope: 'luxor' | 'vendor') {
  if (promotion?.discount_type !== 'complimentary' || promotion.complimentary_scope !== scope) return
  const itemName = promotion.complimentary_item || promotion.name
  const existing = items.find(item => promotion.complimentary_item_id ? item.id === promotion.complimentary_item_id || item.catalogId === promotion.complimentary_item_id : item.description.toLowerCase() === itemName.toLowerCase())
  const detail = 'Regular value: ' + promotion.value.toLocaleString('en-US', {style: 'currency', currency: 'USD'}) + ' · Promotional value: $0.00'
  if (existing) Object.assign(existing, { unitPrice: 0, total: 0, description: 'Complimentary ' + itemName, detail, included: true, quoteBreakdown: {quantity: existing.quantity, unit_price: 0, subtotal: 0} })
  else items.push({ ...lineItem({ id: 'complimentary-' + promotion.id, category: scope === 'vendor' ? 'Preferred Vendor Services - Estimated Pricing' : 'Complimentary service', description: 'Complimentary ' + itemName, unitPrice: 0, included: true, detail, paymentBucket: scope === 'vendor' ? 'event' : 'venue' }), costClassification: scope === 'vendor' ? 'preferred_vendor_estimate' : 'luxor_charge' })
}

function normalizeAddOn(value: unknown) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z]/g, '')
  if (normalized === 'dj') return 'dj'
  return ADD_ON_ALIASES[normalized] || null
}

function trimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function exactNumber(value: unknown) {
  if (typeof value === 'string' && !value.trim()) return undefined
  return numberValue(value)
}

function normalizeCustomItems(selection: LuxorProposalSelection) {
  const source = selection.customItems ?? selection.custom_items
  if (source === undefined || source === null) return { items: [] as LuxorInvoiceLineItem[], errors: [] as string[] }
  if (!Array.isArray(source)) {
    return { items: [] as LuxorInvoiceLineItem[], errors: ['Custom items must be a list of owner-entered item details.'] }
  }

  const errors: string[] = []
  const seenIds = new Set<string>()
  const items: LuxorInvoiceLineItem[] = []

  source.forEach((value, index) => {
    const custom = record(value)
    const label = `Custom item ${index + 1}`
    const description = trimmedString(custom?.description ?? custom?.name)
    const quantity = exactNumber(custom?.quantity)
    const unitPrice = exactNumber(custom?.unitPrice ?? custom?.unit_price)
    const category = trimmedString(custom?.category) || 'Custom items'
    const detail = trimmedString(custom?.detail)
    const requestedBucket = trimmedString(custom?.paymentBucket ?? custom?.payment_bucket)
    const paymentBucket = requestedBucket || 'event'
    const costClassification = custom?.costClassification === 'preferred_vendor_estimate'
      ? 'preferred_vendor_estimate'
      : 'luxor_charge'

    if (!description || quantity === undefined || quantity <= 0 || unitPrice === undefined || unitPrice <= 0) {
      errors.push(`${label} needs a description, a positive quantity, and an exact positive unit price.`)
      return
    }
    if (paymentBucket !== 'venue' && paymentBucket !== 'event') {
      errors.push(`${label} must be assigned to Venue Services or Event Services.`)
      return
    }

    const requestedId = trimmedString(custom?.id || custom?.catalogId || custom?.catalog_id)
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
    const baseId = requestedId || `custom-${index + 1}`
    let id = baseId.startsWith('custom-') ? baseId : `custom-${baseId}`
    let duplicate = 2
    while (seenIds.has(id)) {
      id = `${baseId.startsWith('custom-') ? baseId : `custom-${baseId}`}-${duplicate}`
      duplicate += 1
    }
    seenIds.add(id)

    items.push({
      id,
      catalogId: id,
      category,
      description,
      quantity,
      unitPrice: rounded(unitPrice),
      total: rounded(quantity * unitPrice),
      pricingRole: 'custom',
      pricingRuleId: 'owner_custom_item',
      paymentBucket,
      costClassification,
      ...(detail ? { detail } : {}),
    })
  })

  return { items, errors: [...new Set(errors)] }
}

function tierForGuestCount(value: unknown, guestCount: number) {
  const tiers = array(value).map((item) => record(item) as Tier | null).filter((item): item is Tier => Boolean(item))
  return tiers.find((tier) => {
    const min = numberValue(tier.min_guests)
    const max = numberValue(tier.max_guests)
    return min !== undefined && max !== undefined && guestCount >= min && guestCount <= max
  }) || null
}

function securityOfficerCount(guestCount: number) {
  // The approved two-guard threshold begins at 150 guests. The existing
  // two-guard behavior above 180 guests remains in effect through the venue's
  // configured maximum, without changing shared cleaning guest tiers.
  return guestCount >= 150 ? 2 : 1
}

function formatSecurityDuration(durationMinutes: number) {
  const hours = Math.floor(durationMinutes / 60)
  const minutes = durationMinutes % 60
  if (!minutes) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  if (!hours) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

function securityRate(config: Record<string, unknown> | null) {
  const configured = numberValue(config?.hourly_rate)
  return configured !== undefined && configured > 0 ? configured : DEFAULT_SECURITY_HOURLY_RATE
}

function calculateSecurityCharge(input: {
  securityConfig: Record<string, unknown> | null
  guestCount: number
  eventDate: string
  guestArrivalTime: string
  eventEndTime: string
}) {
  const rate = securityRate(input.securityConfig)
  const guards = securityOfficerCount(input.guestCount)
  const duration = proposalSecurityDuration(input.eventDate, input.guestArrivalTime, input.eventEndTime)
  if (!duration.valid) return { valid: false as const, error: duration.error, rate, guards, duration }

  const total = rounded(guards * duration.durationMinutes * rate / 60)
  const unitPrice = rounded(duration.durationMinutes * rate / 60)
  const localRange = `${securityDateTimeFormatter.format(new Date(duration.arrivalAt))} to ${securityDateTimeFormatter.format(new Date(duration.eventEndAt))}`
  const detail = `${guards} security ${guards === 1 ? 'officer' : 'officers'} | ${formatSecurityDuration(duration.durationMinutes)} actual event time | ${localRange} | $${rate.toFixed(2)}/hour per officer`
  return {
    valid: true as const,
    rate,
    guards,
    duration,
    total,
    detail,
    quoteBreakdown: { quantity: guards, unit_price: unitPrice, subtotal: total },
  }
}

function lineItem(input: {
  id: string
  category: string
  description: string
  quantity?: number
  unitPrice: number
  included?: boolean
  required?: boolean
  detail?: string
  pricingRole?: LuxorInvoiceLineItem['pricingRole']
  pricingRuleId?: string
  paymentBucket?: LuxorInvoiceLineItem['paymentBucket']
  quoteBreakdown?: LuxorProposalPriceBreakdown
  isChecklistItem?: boolean
}) {
  const quantity = input.quantity ?? 1
  const unitPrice = rounded(input.unitPrice)
  return {
    id: input.id,
    catalogId: input.id,
    category: input.category,
    description: input.description,
    quantity,
    unitPrice,
    total: rounded(quantity * unitPrice),
    ...(input.included ? { included: true } : {}),
    ...(input.required ? { required: true } : {}),
    ...(input.detail ? { detail: input.detail } : {}),
    ...(input.pricingRuleId ? { pricingRuleId: input.pricingRuleId } : {}),
    ...(input.quoteBreakdown ? { quoteBreakdown: input.quoteBreakdown } : {}),
    ...(input.isChecklistItem ? { isChecklistItem: true } : {}),
    pricingRole: input.pricingRole || (input.included ? 'included' : input.required ? 'required' : 'add_on'),
    paymentBucket: input.paymentBucket || 'event' as const,
  } satisfies LuxorInvoiceLineItem
}

function dateRateGroup(eventDate: string) {
  const date = new Date(eventDate + 'T12:00:00')
  if (Number.isNaN(date.getTime())) return null
  const weekday = date.getDay()
  if (weekday === 5) return 'friday'
  if (weekday === 6) return 'saturday'
  if (weekday === 0) return 'sunday'
  return 'monday_thursday'
}

function planFromSelection(selection: LuxorProposalSelection, config: LuxorProposalPricingConfig): LuxorProposalPaymentPlan | null {
  const plan = record(selection.paymentPlan || selection.payment_plan)
  if (!plan) return null
  const paymentCount = numberValue(plan.payment_count ?? plan.paymentCount)
  const cadence = plan.payment_cadence ?? plan.paymentCadence
  const paymentCadence = cadence === 'biweekly' || cadence === 'monthly' || cadence === 'evenly_spaced' ? cadence : 'evenly_spaced'
  const bookingPaymentAmount = numberValue(plan.booking_payment_amount ?? plan.bookingPaymentAmount) ?? readNumber(readRecord(config, 'luxor_costs') || config, 'booking_payment', 'amount')
  const preferredMethod = plan.preferred_payment_method ?? plan.preferredPaymentMethod
  const preferredPaymentMethod = preferredMethod === 'card' || preferredMethod === 'cash' || preferredMethod === 'zelle' || preferredMethod === 'check' ? preferredMethod : undefined
  const bookingDateValue = plan.booking_date ?? plan.bookingDate
  const bookingDate = typeof bookingDateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bookingDateValue) ? bookingDateValue : undefined
  const anchorPolicy = plan.schedule_anchor_policy === 'proposal_date_v1' || plan.schedule_anchor_policy === 'first_deposit_paid_at_v1'
    ? plan.schedule_anchor_policy
    : undefined
  if (paymentCount !== undefined && Number.isInteger(paymentCount) && paymentCount >= 2 && paymentCount <= 24) {
    return {
      mode: 'deposit_and_balance',
      booking_payment_percent: 25,
      final_payment_due_days_before_event: 60,
      payment_count: paymentCount,
      payment_cadence: paymentCadence,
      ...(bookingDate ? { booking_date: bookingDate } : {}),
      ...(anchorPolicy ? { schedule_anchor_policy: anchorPolicy } : {}),
      ...(bookingPaymentAmount !== undefined && bookingPaymentAmount >= 0.5 ? { booking_payment_amount: rounded(bookingPaymentAmount) } : {}),
      ...(preferredPaymentMethod ? { preferred_payment_method: preferredPaymentMethod } : {}),
    }
  }
  const mode = plan.mode === 'pay_in_full' || plan.mode === 'deposit_and_balance' ? plan.mode : null
  const percentage = numberValue(plan.booking_payment_percent ?? plan.bookingPaymentPercent)
  const finalDays = numberValue(plan.final_payment_due_days_before_event ?? plan.finalPaymentDueDaysBeforeEvent)
  if (!mode || percentage === undefined || percentage < 0 || percentage > 100 ||
    finalDays === undefined || !Number.isInteger(finalDays) || finalDays < 0 ||
    (mode === 'deposit_and_balance' && percentage <= 0)) return null
  return {
    mode,
    booking_payment_percent: mode === 'pay_in_full' ? 100 : rounded(percentage),
    final_payment_due_days_before_event: finalDays,
    ...(bookingDate ? { booking_date: bookingDate } : {}),
    ...(anchorPolicy ? { schedule_anchor_policy: anchorPolicy } : {}),
    ...(bookingPaymentAmount !== undefined && bookingPaymentAmount >= 0.5 ? { booking_payment_amount: rounded(bookingPaymentAmount) } : {}),
    ...(preferredPaymentMethod ? { preferred_payment_method: preferredPaymentMethod } : {}),
  }
}

function configTaxRate(config: LuxorProposalPricingConfig) {
  const taxSettings = readRecord(config, 'taxes_and_processing_fees')
  const configured = readNumber(config, 'taxes_and_processing_fees', 'sales_tax_rate')
    ?? readNumber(config, 'taxes_and_processing_fees', 'tax_rate')
  if (configured !== undefined) {
    if (configured < 0 || configured > 100) return null
    return configured > 1 ? configured / 100 : configured
  }

  // A tax is an optional, separately configured component. An absent rate
  // means no tax has been turned on; it must not make an otherwise complete
  // package look unpriceable. If an owner explicitly enables tax without a
  // rate, that is the genuinely incomplete configuration we must block.
  if (taxSettings?.sales_tax_enabled === true || taxSettings?.tax_enabled === true) return null
  if (taxSettings?.sales_tax_enabled === false || taxSettings?.tax_enabled === false || !taxSettings) return 0
  return 0
}

function selectedTaxRate(selection: LuxorProposalSelection) {
  if (selection.taxRate === null || selection.taxRate === undefined || selection.taxRate === '') return undefined
  const rate = numberValue(selection.taxRate)
  if (rate === undefined || rate < 0 || rate > 100) return null
  return rate > 1 ? rate / 100 : rate
}

function addDecorInclusions(
  items: LuxorInvoiceLineItem[],
  decor: 'essential' | 'full',
  packageId: LuxorProposalPackageId,
  includedByPackage: boolean,
) {
  const details = decor === 'essential'
    ? ['Essential centerpieces', 'Basic linens', 'Basic sweetheart table', 'Gift table with basic linen', 'Cake table with basic decor']
    : ['Premium linens', 'Silk floral centerpieces', 'Premium sweetheart table', 'Signing table with simple decor', 'Gift table with premium linen', 'Cake table with premium decor', 'Tall and small centerpiece designs']
  const decorName = decor === 'essential' ? 'Essential Decor' : 'Full Decor & Planning'
  const inclusionDetail = includedByPackage
    ? 'Included with ' + PACKAGE_NAMES[packageId]
    : 'Included with selected ' + decorName + ' add-on'
  for (const detail of details) {
    items.push(lineItem({
      id: 'included-' + detail.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category: 'What’s Included',
      description: detail,
      unitPrice: 0,
      included: true,
      detail: inclusionDetail,
      isChecklistItem: true,
    }))
  }
}

type DecorChoice = 'essential' | 'full'
type CateringChoice = 'buffet' | 'plated'
type PhotoBoothChoice = 'signature' | 'celebration' | 'forever'
type BarChoice = 'bartender' | 'signature_byob' | 'premium_byob' | 'non_alcoholic'

type PackageDefaults = {
  decor: DecorChoice | null
  catering: CateringChoice | null
  dj: boolean
  photoBooth: PhotoBoothChoice | null
  bar: BarChoice | null
}

function packageDefaults(packageId: LuxorProposalPackageId): PackageDefaults {
  if (packageId === 'bronze_essentials') return { decor: 'essential', catering: 'buffet', dj: true, photoBooth: null, bar: null }
  if (packageId === 'silver_premier') return { decor: 'full', catering: 'buffet', dj: true, photoBooth: 'signature', bar: null }
  if (packageId === 'gold_all_inclusive') return { decor: 'full', catering: 'buffet', dj: true, photoBooth: 'signature', bar: 'bartender' }
  return { decor: null, catering: null, dj: false, photoBooth: null, bar: null }
}

function selectedProposalAddOns(selection: LuxorProposalSelection) {
  const raw = selection.addOns ?? selection.add_ons
  return [...new Set(array(raw).map(normalizeAddOn).filter((value): value is string => Boolean(value)))]
}

function selectedRemovedServiceIds(selection: LuxorProposalSelection) {
  const raw = selection.removedServiceIds ?? selection.removed_service_ids
  return new Set(array(raw).map(normalizeAddOn).filter((value): value is string => Boolean(value)))
}

function optionForId(id: string) {
  return ADD_ON_QUOTE_OPTIONS.find((option) => option.id === id) || null
}

function optionIdFor(group: ServiceChoiceGroup, kind: string) {
  return ADD_ON_QUOTE_OPTIONS.find((option) => option.group === group && option.kind === kind)?.id || null
}

function optionLineId(option: ServiceQuoteOption) {
  if (option.id === 'essential_decor') return 'essential-decor'
  if (option.id === 'full_decor') return 'full-decor'
  if (option.id === 'buffet_catering') return 'buffet-catering'
  if (option.id === 'plated_catering') return 'plated-catering'
  if (option.id === 'dj') return 'dj'
  if (option.id === 'photo_booth_signature') return 'photo-booth-signature_experience'
  if (option.id === 'photo_booth_celebration') return 'photo-booth-celebration_experience'
  if (option.id === 'photo_booth_forever') return 'photo-booth-forever_experience'
  if (option.id === 'bartender_service') return 'bartender-service'
  if (option.id === 'byob_signature') return 'bar-signature_byob'
  if (option.id === 'byob_premium') return 'bar-premium_byob'
  return 'bar-non_alcoholic'
}

function selectedChoiceForGroup(
  selectedAddOns: string[],
  group: ServiceChoiceGroup,
  errors: string[],
) {
  const choices = selectedAddOns.map(optionForId).filter((option): option is ServiceQuoteOption => Boolean(option && option.group === group))
  if (choices.length > 1) {
    const labels = choices.map((choice) => choice.label).join(', ')
    errors.push(`Choose one ${group === 'photo_booth' ? 'photo booth' : group === 'bar' ? 'bar service' : group} option, not ${labels}.`)
    return null
  }
  return choices[0] || null
}

function serviceDetail(input: {
  defaultOptionId: string | null
  selectedOptionId: string | null
  packageId: LuxorProposalPackageId
  label: string
}) {
  if (input.defaultOptionId === input.selectedOptionId && input.defaultOptionId) return `Included with ${PACKAGE_NAMES[input.packageId]}`
  if (input.defaultOptionId && input.selectedOptionId) {
    const previous = optionForId(input.defaultOptionId)?.label || 'the package service'
    return `Replaces ${previous}; the proposal recalculates from the selected ${input.label}.`
  }
  return `Selected ${input.label}.`
}

function promotionFromOptions(value: LuxorProposalResolvedPromotion | null | undefined) {
  if (!value || !value.id || !value.name || !value.code || !['percent', 'fixed', 'complimentary'].includes(value.discount_type)) return null
  const amount = numberValue(value.value)
  if (amount === undefined || amount <= 0 || (value.discount_type === 'percent' && amount > 100)) return null
  return {
    id: value.id,
    name: value.name.trim(),
    code: value.code.trim().toUpperCase(),
    discount_type: value.discount_type,
    value: rounded(amount),
    expires_on: value.expires_on ?? null,
    complimentary_item: value.complimentary_item,
    complimentary_scope: value.complimentary_scope,
    complimentary_item_id: value.complimentary_item_id,
  } satisfies LuxorProposalResolvedPromotion
}

function rawLegacyDiscount(selection: LuxorProposalSelection) {
  const nested = record(selection.discount)
  const value = Math.max(0, numberValue(selection.discountValue ?? selection.discount_value ?? nested?.value) || 0)
  if (value <= 0) return null
  return {
    discount_type: selection.discountType === 'fixed' || selection.discount_type === 'fixed' || nested?.type === 'fixed' ? 'fixed' as const : 'percent' as const,
    value: rounded(value),
  }
}

function calculatePackage(input: {
  packageId: LuxorProposalPackageId
  selection: LuxorProposalSelection
  config: LuxorProposalPricingConfig
  eventDate: string
  guestCount: number
  requestedRentalPeriod: LuxorRentalPeriod
  securityDeposit: number
  paymentPlan: LuxorProposalPaymentPlan | null
  taxRate: number
  customItems: LuxorInvoiceLineItem[]
  promotion?: LuxorProposalResolvedPromotion | null
}) {
  const { packageId, selection, config, eventDate, guestCount, requestedRentalPeriod, securityDeposit, paymentPlan, taxRate, customItems } = input
  const errors: string[] = []
  const warnings: string[] = []
  const items: LuxorInvoiceLineItem[] = []
  const rateTier = packageId === 'gold_all_inclusive' ? 'all_inclusive' as const : 'retail' as const
  const selectedAddOns = selectedProposalAddOns(selection)
  const removedServiceIds = selectedRemovedServiceIds(selection)
  const defaults = packageDefaults(packageId)

  const selectedDecorOption = selectedChoiceForGroup(selectedAddOns, 'decor', errors)
  const selectedCateringOption = selectedChoiceForGroup(selectedAddOns, 'catering', errors)
  const selectedPhotoOption = selectedChoiceForGroup(selectedAddOns, 'photo_booth', errors)
  const selectedBarOption = selectedChoiceForGroup(selectedAddOns, 'bar', errors)
  const selectedDjOption = selectedChoiceForGroup(selectedAddOns, 'dj', errors)

  const defaultDecorId = defaults.decor ? optionIdFor('decor', defaults.decor) : null
  const defaultCateringId = defaults.catering ? optionIdFor('catering', defaults.catering) : null
  const defaultPhotoId = defaults.photoBooth ? optionIdFor('photo_booth', defaults.photoBooth) : null
  const defaultBarId = defaults.bar ? optionIdFor('bar', defaults.bar) : null

  const decorChoice = selectedDecorOption
    ? selectedDecorOption.kind as DecorChoice
    : defaultDecorId && !removedServiceIds.has(defaultDecorId) ? defaults.decor : null
  const cateringChoice = selectedCateringOption
    ? selectedCateringOption.kind as CateringChoice
    : defaultCateringId && !removedServiceIds.has(defaultCateringId) ? defaults.catering : null
  const photoChoice = selectedPhotoOption
    ? selectedPhotoOption.kind as PhotoBoothChoice
    : defaultPhotoId && !removedServiceIds.has(defaultPhotoId) ? defaults.photoBooth : null
  const barChoice = selectedBarOption
    ? selectedBarOption.kind as BarChoice
    : defaultBarId && !removedServiceIds.has(defaultBarId) ? defaults.bar : null
  const djSelected = Boolean(selectedDjOption || (defaults.dj && !removedServiceIds.has('dj')))

  // Full decor, and Gold regardless of later service edits, keeps the agreed
  // 8-hour event + 4-hour setup/breakdown venue-access rule.
  const fullDecorAccess = decorChoice === 'full' || packageId === 'gold_all_inclusive'
  const rentalPeriod = fullDecorAccess ? 'full_day' : requestedRentalPeriod
  if (fullDecorAccess && requestedRentalPeriod !== 'full_day') {
    warnings.push('Full Decor and Gold proposals use full-day venue access: 8 event hours plus 4 hours for setup and breakdown.')
  }
  errors.push(...eventTimingErrors(selection, config, rentalPeriod))

  const rentalGroup = dateRateGroup(eventDate)
  const rentalAmount = rentalGroup ? readNumber(config, 'rental_rates', rentalGroup, rentalPeriod) : undefined
  if (rentalAmount === undefined) {
    errors.push(CONFIGURATION_ERROR)
  } else {
    const accessDetail = eventAccessLabel(config, rentalPeriod, fullDecorAccess)
    items.push(lineItem({
      id: 'venue-rental',
      category: 'Venue Services',
      description: 'Venue rental',
      unitPrice: rentalAmount,
      required: true,
      detail: accessDetail,
      pricingRuleId: `rental_rates.${rentalGroup}.${rentalPeriod}`,
      paymentBucket: 'venue',
      quoteBreakdown: { quantity: 1, unit_price: rentalAmount, subtotal: rentalAmount },
    }))
  }

  addRentalExtension(items, errors, selection, config, rentalPeriod, eventDate)

  const cleaningTier = tierForGuestCount(readRecord(config, 'required_fees', 'cleaning')?.[rateTier], guestCount)
  const cleaningAmount = cleaningTier ? numberValue(cleaningTier.amount) : undefined
  if (cleaningAmount === undefined) errors.push(CONFIGURATION_ERROR)
  else items.push(lineItem({
    id: 'required-cleaning', category: 'Venue Services', description: 'Required cleaning', unitPrice: cleaningAmount, required: true,
    pricingRuleId: `required_fees.cleaning.${rateTier}`, paymentBucket: 'venue', quoteBreakdown: { quantity: 1, unit_price: cleaningAmount, subtotal: cleaningAmount },
  }))

  const securityConfig = readRecord(config, 'required_fees', 'security') || readRecord(config, 'security')
  const security = calculateSecurityCharge({
    securityConfig,
    guestCount,
    eventDate: typeof selection.eventDate === 'string' ? selection.eventDate : '',
    guestArrivalTime: trimmedString(selection.guestArrivalTime ?? selection.guest_arrival_time),
    eventEndTime: trimmedString(selection.eventEndTime ?? selection.event_end_time),
  })
  if (!security.valid) errors.push(security.error)
  else {
    items.push(lineItem({
      id: 'required-security', category: 'Venue Services', description: 'Required security', unitPrice: security.total, required: true,
      detail: security.detail,
      pricingRuleId: `required_fees.security.actual_event_duration.${rateTier}`, paymentBucket: 'venue', quoteBreakdown: security.quoteBreakdown,
    }))
  }

  // Tables and chairs are part of the venue rental for every package. The
  // zero-dollar rule is intentional and should not block a proposal if an
  // older pricing record predates the explicit config entry.
  const setupAmount = readNumber(config, 'tables_and_chairs_setup', rateTier) ?? 0
  items.push(lineItem({
    id: 'tables-chairs-setup', category: 'Venue Services', description: 'Tables & chairs included with rental', unitPrice: setupAmount,
    included: true, required: true, isChecklistItem: true, detail: 'Included with venue rental',
    pricingRuleId: `tables_and_chairs_setup.${rateTier}`, paymentBucket: 'venue',
    quoteBreakdown: { quantity: 1, unit_price: setupAmount, subtotal: setupAmount },
  }))

  const addDecor = (kind: DecorChoice) => {
    const optionId = optionIdFor('decor', kind)
    const configKey = kind === 'essential' ? 'essential' : 'full_decor_and_planning'
    const amount = readNumber(config, 'decor', configKey, rateTier)
    if (amount === undefined || !optionId) return errors.push(CONFIGURATION_ERROR)
    const label = kind === 'essential' ? 'Essential Decor' : 'Full Decor & Planning'
    const included = defaultDecorId === optionId
    items.push(lineItem({
      id: kind === 'essential' ? 'essential-decor' : 'full-decor', category: 'Event Services', description: label, unitPrice: amount,
      included, detail: serviceDetail({ defaultOptionId: defaultDecorId, selectedOptionId: optionId, packageId, label }),
      pricingRuleId: `decor.${configKey}.${rateTier}`, quoteBreakdown: { quantity: 1, unit_price: amount, subtotal: amount, ...(defaultDecorId && defaultDecorId !== optionId ? { replacement_of: defaultDecorId } : {}) },
    }))
    addDecorInclusions(items, kind, packageId, included)
    const tablesNeeded = Math.ceil(guestCount / (readNumber(config, 'tables', 'guests_per_table') || 10))
    const includedTables = readNumber(config, 'tables', 'included_tables') ?? 0
    const extraTables = Math.max(0, tablesNeeded - includedTables)
    const tableRateKey = kind === 'essential' ? 'essential_decor' : 'full_decor_and_planning'
    const tableRate = readNumber(config, 'tables', 'additional_table_rates', tableRateKey, rateTier)
    if (extraTables > 0) {
      if (tableRate === undefined) errors.push(CONFIGURATION_ERROR)
      else items.push(lineItem({
        id: `additional-tables-${kind}`, category: 'Event Services', description: 'Additional guest tables', quantity: extraTables, unitPrice: tableRate,
        detail: `${extraTables} additional table${extraTables === 1 ? '' : 's'} (${tablesNeeded} total for ${guestCount} guests)`, pricingRuleId: `tables.additional_table_rates.${tableRateKey}.${rateTier}`,
        quoteBreakdown: { quantity: extraTables, unit_price: tableRate, subtotal: rounded(extraTables * tableRate) },
      }))
    }
  }

  const addCatering = (style: CateringChoice) => {
    const optionId = optionIdFor('catering', style)
    const perGuest = readNumber(config, 'catering', style, `${rateTier}_per_guest`)
    if (perGuest === undefined || !optionId) return errors.push(CONFIGURATION_ERROR)
    const label = style === 'buffet' ? 'Buffet catering' : 'Plated catering'
    const included = defaultCateringId === optionId
    items.push(lineItem({
      id: style === 'buffet' ? 'buffet-catering' : 'plated-catering', category: 'Event Services', description: label, quantity: guestCount, unitPrice: perGuest,
      included, detail: serviceDetail({ defaultOptionId: defaultCateringId, selectedOptionId: optionId, packageId, label }),
      pricingRuleId: `catering.${style}.${rateTier}_per_guest`, quoteBreakdown: { quantity: guestCount, unit_price: perGuest, subtotal: rounded(guestCount * perGuest), per_guest_rate: perGuest, ...(defaultCateringId && defaultCateringId !== optionId ? { replacement_of: defaultCateringId } : {}) },
    }))
  }

  const addDj = () => {
    const amount = readNumber(config, 'dj', rateTier)
    if (amount === undefined) return errors.push(CONFIGURATION_ERROR)
    items.push(lineItem({
      id: 'dj', category: 'Event Services', description: 'DJ (6 hours)', unitPrice: amount, included: defaults.dj,
      detail: defaults.dj ? `Included with ${PACKAGE_NAMES[packageId]}` : 'Selected DJ (6 hours).', pricingRuleId: `dj.${rateTier}`,
      quoteBreakdown: { quantity: 1, unit_price: amount, subtotal: amount },
    }))
  }

  const addPhotoBooth = (choice: PhotoBoothChoice) => {
    const optionId = optionIdFor('photo_booth', choice)
    const tier = choice === 'signature' ? 'signature_experience' : choice === 'celebration' ? 'celebration_experience' : 'forever_experience'
    const amount = readNumber(config, 'photo_booth', tier, rateTier)
    if (amount === undefined || !optionId) return errors.push(CONFIGURATION_ERROR)
    const label = choice === 'signature' ? 'Signature Photo Booth' : choice === 'celebration' ? 'Celebration Photo Booth' : 'Forever Photo Booth'
    const included = defaultPhotoId === optionId
    items.push(lineItem({
      id: `photo-booth-${tier}`, category: 'Event Services', description: label, unitPrice: amount, included,
      detail: serviceDetail({ defaultOptionId: defaultPhotoId, selectedOptionId: optionId, packageId, label }), pricingRuleId: `photo_booth.${tier}.${rateTier}`,
      quoteBreakdown: { quantity: 1, unit_price: amount, subtotal: amount, ...(defaultPhotoId && defaultPhotoId !== optionId ? { replacement_of: defaultPhotoId } : {}) },
    }))
  }

  const addAdditionalBarHours = () => {
    const additionalHours = Math.max(0, Math.floor(numberValue(selection.bartenderAdditionalHours) || 0))
    if (!additionalHours) return
    if (!barChoice) {
      errors.push('Choose a bar service before adding additional bartender hours.')
      return
    }
    const staffCount = numberValue(selection.bartenderStaffCount)
    const hourlyRate = readNumber(config, 'bartending', rateTier, 'additional_hour_per_bartender')
    if (!staffCount || staffCount < 1 || hourlyRate === undefined) {
      errors.push(CONFIGURATION_ERROR)
      warnings.push('Additional bartender hours require an approved bartender staffing count.')
      return
    }
    const quantity = additionalHours * staffCount
    items.push(lineItem({
      id: 'bartender-additional-hours', category: 'Event Services', description: 'Additional bar-service hours', quantity, unitPrice: hourlyRate,
      detail: `${additionalHours} additional hour${additionalHours === 1 ? '' : 's'} × ${staffCount} bartender${staffCount === 1 ? '' : 's'}`,
      pricingRuleId: `bartending.${rateTier}.additional_hour_per_bartender`, quoteBreakdown: { quantity, unit_price: hourlyRate, subtotal: rounded(quantity * hourlyRate) },
    }))
  }

  const addBartender = () => {
    const tier = tierForGuestCount(readRecord(config, 'bartending', rateTier)?.staffing, guestCount)
    const amount = tier ? numberValue(tier.amount) : undefined
    if (amount === undefined) return errors.push(CONFIGURATION_ERROR)
    const included = defaultBarId === 'bartender_service'
    items.push(lineItem({
      id: 'bartender-service', category: 'Event Services', description: 'Bartender service (up to 5 hours)', unitPrice: amount, included,
      detail: serviceDetail({ defaultOptionId: defaultBarId, selectedOptionId: 'bartender_service', packageId, label: 'Bartender service' }),
      pricingRuleId: `bartending.${rateTier}.staffing`, quoteBreakdown: { quantity: 1, unit_price: amount, subtotal: amount, ...(defaultBarId && defaultBarId !== 'bartender_service' ? { replacement_of: defaultBarId } : {}) },
    }))
  }

  const addBar = (kind: Exclude<BarChoice, 'bartender'>) => {
    const optionId = optionIdFor('bar', kind)
    const bar = readRecord(config, 'bartending', rateTier, 'bars', kind)
    const perGuest = numberValue(bar?.per_guest)
    const minimum = numberValue(bar?.minimum)
    if (perGuest === undefined || minimum === undefined || !optionId) return errors.push(CONFIGURATION_ERROR)
    const guestSubtotal = rounded(guestCount * perGuest)
    const appliedMinimum = guestSubtotal < minimum
    const amount = Math.max(guestSubtotal, minimum)
    const label = kind === 'signature_byob' ? 'Signature BYOB bar package' : kind === 'premium_byob' ? 'Premium BYOB bar package' : 'Non-Alcoholic bar package'
    const included = defaultBarId === optionId
    items.push(lineItem({
      id: `bar-${kind}`, category: 'Event Services', description: label, unitPrice: amount, included,
      detail: `${guestCount} guests × ${perGuest.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} per guest${appliedMinimum ? `; ${minimum.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} minimum applies` : ''}. ${serviceDetail({ defaultOptionId: defaultBarId, selectedOptionId: optionId, packageId, label })}`,
      pricingRuleId: `bartending.${rateTier}.bars.${kind}`,
      quoteBreakdown: { quantity: guestCount, unit_price: perGuest, subtotal: amount, per_guest_rate: perGuest, minimum, applied_minimum: appliedMinimum, ...(defaultBarId && defaultBarId !== optionId ? { replacement_of: defaultBarId } : {}) },
    }))
  }

  if (decorChoice) addDecor(decorChoice)
  if (cateringChoice) addCatering(cateringChoice)
  if (djSelected) addDj()
  if (photoChoice) addPhotoBooth(photoChoice)
  if (barChoice === 'bartender') addBartender()
  else if (barChoice) addBar(barChoice)
  addAdditionalBarHours()

  // Custom rows remain owner-entered, but their arithmetic is calculated here
  // and frozen into the proposal snapshot rather than being client-editable.
  items.push(...customItems)

  const complimentary = promotionFromOptions(input.promotion)
  applyComplimentary(items, complimentary, 'luxor')
  const subtotal = rounded(items.reduce((sum, item) => sum + Number(item.total || 0), 0))
  const promotionTerms = promotionFromOptions(input.promotion)
  const discountAmount = promotionTerms && promotionTerms.discount_type !== 'complimentary'
    ? promotionTerms.discount_type === 'fixed'
      ? Math.min(subtotal, promotionTerms.value)
      : Math.min(subtotal, rounded(subtotal * promotionTerms.value / 100))
    : 0
  const promotion = promotionTerms && (discountAmount > 0 || promotionTerms.discount_type === 'complimentary')
    ? { ...promotionTerms, amount: discountAmount } satisfies LuxorProposalPromotionSnapshot
    : undefined
  if (promotion && discountAmount > 0) {
    items.push(lineItem({
      id: `promotion-${promotion.id}`, category: 'Promotion', description: promotion.name, unitPrice: -discountAmount, pricingRole: 'discount',
      detail: promotion.discount_type === 'fixed' ? `${promotion.code} · ${promotion.value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} promotion` : `${promotion.code} · ${promotion.value}% promotion`,
      pricingRuleId: `promotion.${promotion.id}`, quoteBreakdown: { quantity: 1, unit_price: -discountAmount, subtotal: -discountAmount },
    }))
  }
  const taxableAmount = Math.max(0, rounded(subtotal - discountAmount))
  const taxAmount = rounded(taxableAmount * Math.max(0, taxRate))
  if (taxAmount > 0) items.push(lineItem({
    id: 'sales-tax', category: 'Tax', description: 'Sales tax', unitPrice: taxAmount, pricingRole: 'tax', pricingRuleId: 'taxes_and_processing_fees.sales_tax_rate',
    quoteBreakdown: { quantity: 1, unit_price: taxAmount, subtotal: taxAmount },
  }))
  const total = rounded(subtotal - discountAmount + taxAmount)
  // The booking payment is applied to Venue Services first.  Do not derive it
  // from the combined event total: that would make a large catering/decor
  // package inflate the amount due at signing and would disagree with the
  // payment schedule shown to the owner/client.
  const venueServicesTotal = rounded(items
    .filter((item) => item.paymentBucket === 'venue' || item.category === 'Venue Services')
    .reduce((sum, item) => sum + Math.max(0, Number(item.total || 0)), 0))
  const amountDueToBook = paymentPlan
    ? paymentPlan.mode === 'pay_in_full'
      ? total
      : paymentPlan.booking_payment_amount !== undefined && paymentPlan.booking_payment_amount >= 0.5
        ? Math.min(venueServicesTotal, rounded(paymentPlan.booking_payment_amount))
        : Math.min(venueServicesTotal, rounded(Math.max(venueServicesTotal * paymentPlan.booking_payment_percent / 100, 750)))
    : null

  return {
    id: packageId,
    name: PACKAGE_NAMES[packageId],
    description: PACKAGE_DESCRIPTIONS[packageId],
    finalEventPrice: total,
    final_event_price: total,
    refundableSecurityDeposit: securityDeposit,
    refundable_security_deposit: securityDeposit,
    amountDueToBook,
    amount_due_to_book: amountDueToBook,
    subtotal,
    discountAmount,
    discount_amount: discountAmount,
    taxAmount,
    tax_amount: taxAmount,
    taxRate,
    tax_rate: taxRate,
    lineItems: items,
    line_items: items,
    promotion,
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
  } satisfies PackageCalculation & { promotion?: LuxorProposalPromotionSnapshot }
}

function addedLineItems(base: LuxorInvoiceLineItem[], quoted: LuxorInvoiceLineItem[]) {
  const counts = new Map<string, number>()
  for (const item of base) {
    const key = `${item.id || item.catalogId || item.description}|${item.quantity}|${item.unitPrice}|${item.total}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return quoted.filter((item) => {
    const key = `${item.id || item.catalogId || item.description}|${item.quantity}|${item.unitPrice}|${item.total}`
    const remaining = counts.get(key) || 0
    if (remaining <= 0) return true
    counts.set(key, remaining - 1)
    return false
  })
}

function calculateAddOnQuotes(input: {
  packageId: LuxorProposalPackageId
  selection: LuxorProposalSelection
  config: LuxorProposalPricingConfig
  eventDate: string
  guestCount: number
  requestedRentalPeriod: LuxorRentalPeriod
  securityDeposit: number
}) {
  const rateTier = input.packageId === 'gold_all_inclusive' ? 'all_inclusive' as const : 'retail' as const
  const quoteSelection: LuxorProposalSelection = {
    ...input.selection,
    addOns: [],
    removedServiceIds: [],
    customItems: [],
    custom_items: [],
    taxRate: 0,
    paymentPlan: null,
  }
  const base = calculatePackage({ ...input, selection: quoteSelection, paymentPlan: null, taxRate: 0, customItems: [], promotion: null })
  const baseError = base.errors[0]
  const selectedAddOns = selectedProposalAddOns(input.selection)
  const defaults = packageDefaults(input.packageId)

  const defaultOptionId = (option: ServiceQuoteOption) => {
    if (option.group === 'decor') return defaults.decor ? optionIdFor('decor', defaults.decor) : null
    if (option.group === 'catering') return defaults.catering ? optionIdFor('catering', defaults.catering) : null
    if (option.group === 'dj') return defaults.dj ? 'dj' : null
    if (option.group === 'photo_booth') return defaults.photoBooth ? optionIdFor('photo_booth', defaults.photoBooth) : null
    return defaults.bar ? optionIdFor('bar', defaults.bar) : null
  }

  return ADD_ON_QUOTE_OPTIONS.map((option): LuxorProposalAddOnQuote => {
    if (baseError) {
      return {
        ...option,
        rateTier,
        available: false,
        total: null,
        lineItems: [],
        selectionDelta: null,
        error: baseError,
      }
    }

    const quoted = calculatePackage({
      ...input,
      selection: { ...quoteSelection, addOns: [option.id] },
      paymentPlan: null,
      taxRate: 0,
      customItems: [],
      promotion: null,
    })
    const quoteError = quoted.errors.find((error) => !base.errors.includes(error))
    const componentId = optionLineId(option)
    const component = quoted.lineItems.find((item) => item.id === componentId || item.catalogId === componentId)
    const lineItems = addedLineItems(base.lineItems, quoted.lineItems)
    const selectionDelta = rounded(quoted.subtotal - base.subtotal)
    const defaultId = defaultOptionId(option)
    const selected = selectedAddOns.includes(option.id)
    const state = selected ? 'selected' as const : defaultId === option.id ? 'included' as const : 'available' as const

    if (quoteError) {
      return {
        ...option,
        rateTier,
        available: false,
        total: null,
        lineItems: [],
        selectionDelta: null,
        error: quoteError,
      }
    }
    if (!component) {
      return {
        ...option,
        rateTier,
        available: false,
        total: null,
        lineItems: [],
        selectionDelta: null,
        error: 'This service needs an approved pricing rule before it can be added.',
      }
    }

    return {
      ...option,
      rateTier,
      available: true,
      total: component.total,
      lineItems,
      quoteBreakdown: component.quoteBreakdown,
      ...(defaultId && defaultId !== option.id ? { replacementOf: defaultId } : {}),
      selectionDelta,
      state,
    }
  })
}

export const PREFERRED_VENDOR_PRICING_DISCLAIMER = 'Vendor Pricing Disclaimer: Venue rental pricing is provided directly by Luxor and represents the official venue rental cost. Pricing for third-party vendor services is provided as an estimate for planning purposes only and is not a guaranteed quote. Final pricing, availability, services, and payment arrangements must be confirmed directly with the individual vendor.'

function preferredVendorCustomIds(selection: LuxorProposalSelection) {
  const source = selection.customItems ?? selection.custom_items
  if (!Array.isArray(source)) return new Set<string>()
  return new Set(source.map((value, index) => {
    const item = record(value)
    if (item?.costClassification !== 'preferred_vendor_estimate') return ''
    const rawId = trimmedString(item.id || item.catalogId || item.catalog_id).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
    return rawId ? (rawId.startsWith('custom-') ? rawId : `custom-${rawId}`) : `custom-${index + 1}`
  }).filter(Boolean))
}

function preferredQuote(config: PricingRecord, option: ServiceQuoteOption, guests: number): LuxorProposalAddOnQuote {
  const root = readRecord(config, 'preferred_vendor_estimates') || {}
  const unavailable = (error: string): LuxorProposalAddOnQuote => ({ id: option.id, label: option.label, category: option.category, group: option.group, kind: option.kind, rateTier: 'retail', available: false, total: null, lineItems: [], error })
  let quantity = 1
  let unitPrice: number | undefined
  let detail = 'Estimated starting investment. Confirm directly with the preferred vendor.'
  let breakdown: LuxorProposalPriceBreakdown | undefined
  if (option.group === 'decor') {
    unitPrice = readNumber(root, 'decor', option.kind === 'essential' ? 'essential' : 'full_decor_and_planning', 'starting_investment')
  } else if (option.group === 'catering') {
    quantity = guests
    unitPrice = readNumber(root, 'catering', option.kind, 'starting_per_guest')
    detail = `Estimated starting investment at ${guests} guests. Confirm menu, selections, and final quote directly with the vendor.`
  } else if (option.group === 'dj') {
    unitPrice = readNumber(root, 'dj', 'starting_investment')
    const hours = readNumber(root, 'dj', 'hours') || 6
    detail = `Estimated starting investment for up to ${hours} hours. Confirm availability and final quote directly with the vendor.`
  } else if (option.group === 'photo_booth') {
    const key = option.kind === 'signature' ? 'signature_experience' : option.kind === 'celebration' ? 'celebration_experience' : 'forever_experience'
    unitPrice = readNumber(root, 'photo_booth', key, 'starting_investment')
  } else if (option.kind === 'bartender') {
    const tier = tierForGuestCount(readRecord(root, 'bartending')?.staffing, guests)
    unitPrice = numberValue(tier?.amount)
    detail = `Estimated staffing investment for ${guests} guests. Confirm staffing, availability, and final quote directly with the vendor.`
  } else {
    quantity = guests
    const bar = readRecord(root, 'bartending', 'bars', option.kind)
    const perGuest = numberValue(bar?.starting_per_guest)
    const minimum = numberValue(bar?.minimum)
    if (perGuest === undefined || minimum === undefined) return unavailable('Preferred vendor estimate configuration required — administrator review.')
    const total = Math.max(minimum, rounded(perGuest * guests))
    unitPrice = rounded(total / Math.max(1, guests))
    detail = `Estimated starting investment for ${guests} guests, subject to a ${minimum.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} minimum. Confirm directly with the vendor.`
    breakdown = { quantity, unit_price: unitPrice, subtotal: total, per_guest_rate: perGuest, minimum, applied_minimum: total === minimum }
  }
  if (unitPrice === undefined || unitPrice < 0) return unavailable('Preferred vendor estimate configuration required — administrator review.')
  const total = breakdown?.subtotal ?? rounded(quantity * unitPrice)
  const vendorLine = lineItem({ id: `preferred-vendor-${option.id}`, category: 'Preferred Vendor Services — Estimated Pricing', description: option.label, quantity, unitPrice, detail, pricingRole: 'add_on', paymentBucket: 'event', quoteBreakdown: breakdown || { quantity, unit_price: unitPrice, subtotal: total } })
  return { id: option.id, label: option.label, category: option.category, group: option.group, kind: option.kind, rateTier: 'retail', available: true, total, lineItems: [vendorLine], quoteBreakdown: vendorLine.quoteBreakdown, state: 'available' }
}

function officialDecorSelection(selection: LuxorProposalSelection, config: PricingRecord) {
  const errors: string[] = []
  const rawPackage = selection.decorPackageId ?? selection.decor_package_id
  const packageId = typeof rawPackage === 'string' ? rawPackage.trim() : ''
  const selectedPackage = getOfficialDecorService(packageId)
  if ((rawPackage != null && typeof rawPackage !== 'string') || (packageId && selectedPackage?.category !== 'decor_packages')) {
    errors.push('Choose one approved decor package.')
  }
  const rawQuantities = selection.decorAddOnQuantities ?? selection.decor_add_on_quantities
  const quantities: Record<string, number> = {}
  if (rawQuantities != null && !record(rawQuantities)) errors.push('Decor add-on quantities must be a list of service quantities.')
  for (const [id, value] of Object.entries(record(rawQuantities) || {})) {
    const service = getOfficialDecorService(id)
    if (!service || service.category !== 'decor_add_ons') {
      errors.push('Choose only approved decor add-ons.')
      continue
    }
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || (value > 0 && value < service.minimumQuantity)) {
      errors.push(`${service.name} requires a whole quantity of at least ${service.minimumQuantity}, or zero to remove it.`)
      continue
    }
    if (value > 0) quantities[id] = value
  }
  const items: LuxorInvoiceLineItem[] = []
  const quotes: LuxorProposalAddOnQuote[] = OFFICIAL_DECOR_SERVICES.map((service) => {
    const isPackage = service.category === 'decor_packages'
    const selected = isPackage ? packageId === service.id : Boolean(quantities[service.id])
    const quantity = isPackage ? 1 : quantities[service.id] || service.minimumQuantity
    const amount = readNumber(config, 'official_decor', service.id, 'amount')
    const available = amount !== undefined && amount > 0 && Number.isSafeInteger(Math.round(amount * 100))
    const total = available ? rounded(quantity * amount) : null
    const validTotal = total !== null && Number.isSafeInteger(Math.round(total * 100))
    const includedQuantity = selectedPackage?.includedAddOnQuantities?.[service.id] || 0
    const detail = isPackage
      ? `${service.description}. Included with package: ${service.inclusions.join('; ')}. The package price includes all listed items.`
      : `${quantity} ${service.unit === 'letter' ? (quantity === 1 ? 'letter' : 'letters') : (quantity === 1 ? 'item' : 'items')} at $${amount ?? 0} / ${service.unit}. ${includedQuantity ? `${includedQuantity} already included with ${selectedPackage?.name}; this quantity is additional.` : 'Additional decor selection.'} Official Luxor charge.`
    const lineItems: LuxorInvoiceLineItem[] = available && validTotal ? [{
      ...lineItem({ id: service.id, category: isPackage ? 'Decor' : 'Decor Add-ons', description: `${includedQuantity ? 'Additional ' : ''}${service.name}`, quantity, unitPrice: amount, detail, pricingRole: 'add_on', pricingRuleId: `official_decor.${service.id}.amount`, paymentBucket: 'venue', quoteBreakdown: { quantity, unit_price: amount, subtotal: total! } }),
      costClassification: 'luxor_charge',
    }] : []
    if (selected && !lineItems.length) errors.push(`${service.name} is unavailable in this proposal's saved approved catalog.`)
    if (selected) items.push(...lineItems)
    return { id: service.id, label: service.name, category: isPackage ? 'Decor Packages' : 'Decor Add-ons', group: isPackage ? 'decor_package' : 'decor_add_on', kind: service.id, rateTier: 'retail', available: available && validTotal, total: validTotal ? total : null, lineItems, ...(available ? { unitPrice: amount } : {}), quantity, minimumQuantity: service.minimumQuantity, unit: service.unit, state: selected ? 'selected' : 'available' }
  })
  return { errors, items, quotes, packageId, quantities, subtotal: rounded(items.reduce((sum, item) => sum + item.total, 0)), catalog: undefined as LuxorDecorCatalogItem[] | undefined }
}

function officialDecorSelectionV4(
  selection: LuxorProposalSelection,
  config: PricingRecord,
  packageTierId: string | null,
) {
  const errors: string[] = []
  const catalog = readLuxorDecorCatalog(config, true)
  if (!catalog.length) {
    errors.push('The official decor add-on catalog is not configured in Settings.')
    return { errors, items: [], quotes: [], quantities: {} as Record<string, number>, subtotal: 0, catalog }
  }
  const rawQuantities = selection.decorAddOnQuantities ?? selection.decor_add_on_quantities
  if (rawQuantities != null && !record(rawQuantities)) errors.push('Decor add-on quantities must be a list of service quantities.')
  const configured = new Map(catalog.map((item) => [item.id, item]))
  const requested = record(rawQuantities) || {}
  const quantities: Record<string, number> = {}
  for (const [id, value] of Object.entries(requested)) {
    const item = configured.get(id)
    if (!item || !item.active) {
      errors.push('Choose only active decor add-ons from the saved catalog.')
      continue
    }
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 ||
      (value > 0 && (value < item.minimum_quantity || (item.pricing_unit === 'order' && value !== 1)))) {
      errors.push(item.name + ' requires a whole quantity of at least ' + item.minimum_quantity + ', or zero to remove it.')
      continue
    }
    if (value > 0) quantities[id] = value
  }

  const activeItems = catalog.filter((item) => item.active)
  const items: LuxorInvoiceLineItem[] = []
  const quotes: LuxorProposalAddOnQuote[] = activeItems.map((item) => {
    const selectedQuantity = quantities[item.id] || 0
    const includedQuantity = includedLuxorDecorQuantity(item, packageTierId)
    const intendedQuantity = selectedQuantity || includedQuantity
    const chargedQuantity = Math.max(0, intendedQuantity - includedQuantity)
    const unitPrice = Number.isFinite(item.amount) && item.amount > 0 ? rounded(item.amount) : undefined
    const available = unitPrice !== undefined
    const displayQuantity = intendedQuantity || item.minimum_quantity
    const chargeableQuantity = chargedQuantity || (!includedQuantity && selectedQuantity ? selectedQuantity : 0)
    const quoteTotal = available
      ? rounded((includedQuantity ? chargedQuantity : (selectedQuantity || item.minimum_quantity)) * unitPrice)
      : null
    const category = item.category
    const detail = includedQuantity
      ? 'Included with the selected package. Separate purchases are ' + (unitPrice ? '$' + unitPrice.toFixed(2) + ' / ' + luxorDecorUnitLabel(item.pricing_unit) + '.' : 'not currently priced.')
      : item.description
        ? item.description + ' ' + (displayQuantity > 1 ? displayQuantity + ' ' + luxorDecorUnitLabel(item.pricing_unit) + 's' : 'One ' + luxorDecorUnitLabel(item.pricing_unit)) + ' at ' + (unitPrice ? '$' + unitPrice.toFixed(2) : 'the configured price') + ' / ' + luxorDecorUnitLabel(item.pricing_unit) + '.'
        : (displayQuantity > 1 ? displayQuantity + ' ' + luxorDecorUnitLabel(item.pricing_unit) + 's' : 'One ' + luxorDecorUnitLabel(item.pricing_unit)) + ' at ' + (unitPrice ? '$' + unitPrice.toFixed(2) : 'the configured price') + ' / ' + luxorDecorUnitLabel(item.pricing_unit) + '.'
    const lineItems: LuxorInvoiceLineItem[] = available && chargeableQuantity > 0
      ? [{
          ...lineItem({
            id: item.id,
            category: 'Decor Add-ons',
            description: includedQuantity ? 'Additional ' + item.name : item.name,
            quantity: chargeableQuantity,
            unitPrice,
            detail,
            pricingRole: 'add_on',
            pricingRuleId: LUXOR_DECOR_CATALOG_KEY + '.' + item.id + '.amount',
            paymentBucket: 'venue',
            quoteBreakdown: {
              quantity: chargeableQuantity,
              unit_price: unitPrice,
              subtotal: rounded(chargeableQuantity * unitPrice),
            },
          }),
          costClassification: 'luxor_charge',
        }]
      : []
    if (selectedQuantity > 0 && !available) errors.push(item.name + " is unavailable in this proposal's saved approved catalog.")
    if (selectedQuantity > 0) items.push(...lineItems)
    return {
      id: item.id,
      label: item.name,
      category,
      group: 'decor_add_on',
      kind: item.id,
      rateTier: 'retail',
      available,
      total: quoteTotal,
      lineItems,
      ...(unitPrice !== undefined ? { unitPrice } : {}),
      quantity: displayQuantity,
      selectedQuantity,
      minimumQuantity: item.minimum_quantity,
      unit: luxorDecorUnitLabel(item.pricing_unit),
      pricingUnit: item.pricing_unit,
      officialDecorCategory: category,
      description: item.description,
      includedQuantity,
      state: includedQuantity > 0 ? 'included' : selectedQuantity > 0 ? 'selected' : 'available',
    }
  })
  const unknownIds = Object.keys(requested).filter((id) => !configured.has(id))
  if (unknownIds.length) errors.push("Choose only decor add-ons from this proposal's saved catalog.")
  return { errors, items, quotes, packageId: null, quantities, subtotal: rounded(items.reduce((sum, item) => sum + item.total, 0)), catalog }
}

function calculatePreferredVendorProposal(selection: LuxorProposalSelection, config: LuxorProposalPricingConfig, options: LuxorProposalCalculationOptions): LuxorProposalCalculation {
  const luxor = readRecord(config, 'luxor_costs') || config
  const errors: string[] = []
  const warnings: string[] = []
  const eventDate = typeof selection.eventDate === 'string' ? selection.eventDate : ''
  const guestCount = Math.floor(numberValue(selection.guestCount) || 0)
  const rentalPeriod = normalizeRentalPeriod(selection.rentalPeriod)
  const rawPackageTier = selection.packageTierId ?? selection.package_tier_id ?? selection.luxorPackageId ?? selection.luxor_package_id
  const packageTierWasSelected = rawPackageTier !== undefined && rawPackageTier !== null && String(rawPackageTier).trim() !== ''
  const normalizedTier = String(rawPackageTier || '').trim().toLowerCase()
  const packageTierId = (LUXOR_PROPOSAL_PACKAGE_IDS as readonly string[]).includes(normalizedTier)
    ? normalizedTier as LuxorProposalPackageTierId
    : null
  if (packageTierWasSelected && !packageTierId) errors.push('Choose one of the four current Luxor proposal packages.')
  const packageSettings = getLuxorProposalPackageSettings(config)
  const rawPolicyVersion = selection.proposalPricingPolicyVersion ?? selection.proposal_pricing_policy_version
  const proposalPricingPolicyVersion = Number.isSafeInteger(Number(rawPolicyVersion)) ? Number(rawPolicyVersion) : 3
  const maxGuests = readNumber(luxor, 'guest_count', 'maximum') || 200
  const minGuests = readNumber(luxor, 'guest_count', 'minimum') || 1
  const requestedLegacyPackage = normalizePackageId(selection.packageId)
  if (requestedLegacyPackage && requestedLegacyPackage !== 'rental_only') errors.push('Legacy package selections cannot be used for a new proposal. Start a new Luxor venue proposal instead.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !dateRateGroup(eventDate)) errors.push('A valid event date is required.')
  if (!guestCount || guestCount < minGuests || guestCount > maxGuests) errors.push(`Expected guest count must be between ${minGuests} and ${maxGuests}.`)
  if (!rentalPeriod) errors.push('Choose a morning, evening, or full-day rental period.')
  const custom = normalizeCustomItems(selection)
  errors.push(...custom.errors)
  const vendorCustom = preferredVendorCustomIds(selection)
  const confirmedCustom = custom.items.filter((item) => !vendorCustom.has(String(item.id)))
  const vendorCustomItems = custom.items.filter((item) => vendorCustom.has(String(item.id))).map((item) => ({ ...item, category: 'Preferred Vendor Services — Estimated Pricing', detail: item.detail || 'Owner-entered estimated vendor investment. Confirm directly with the vendor.' }))
  const confirmed: LuxorInvoiceLineItem[] = []
  const safePeriod = rentalPeriod || 'evening'
  const customTimePolicyV4 = safePeriod === 'custom' ? getLuxorCustomTimeRentalPolicyV4(config, eventDate) : null
  const customPolicy = safePeriod === 'custom' ? getWeekdayCustomRentalPolicy(config) : null
  const rentalStartTime = trimmedString(selection.rentalStartTime ?? selection.rental_start_time ?? selection.guestArrivalTime ?? selection.guest_arrival_time)
  const rentalEndTime = trimmedString(selection.rentalEndTime ?? selection.rental_end_time ?? selection.eventEndTime ?? selection.event_end_time)
  const guestArrivalTime = trimmedString(selection.guestArrivalTime ?? selection.guest_arrival_time)
  const eventEndTime = trimmedString(selection.eventEndTime ?? selection.event_end_time)
  const customSchedule = safePeriod === 'custom'
    ? customTimePolicyV4
      ? validateLuxorCustomTimeScheduleV4(eventDate, rentalStartTime, rentalEndTime, guestArrivalTime, eventEndTime, customTimePolicyV4)
      : validateWeekdayCustomRentalSchedule(eventDate, rentalStartTime, rentalEndTime, guestArrivalTime, eventEndTime, customPolicy)
    : null
  const customTiming = safePeriod === 'custom' ? validateWeekdayCustomRentalTiming(eventDate, rentalStartTime, rentalEndTime, customPolicy) : null
  const customRental = customTimePolicyV4 && customSchedule?.valid
    ? luxorCustomTimeRentalSnapshotV4(eventDate, rentalStartTime, rentalEndTime, guestArrivalTime, eventEndTime, customTimePolicyV4)
    : customPolicy && customTiming?.valid ? weekdayCustomRentalSnapshot(eventDate, customTiming, customPolicy) : null
  if (customSchedule) {
    if (!customSchedule.valid) errors.push(customSchedule.error!)
  } else errors.push(...eventTimingErrors(selection, luxor, safePeriod))
  const rentalGroup = dateRateGroup(eventDate)
  if (safePeriod === 'custom') {
    if (customRental) {
      const extraHours = Math.max(0, customRental.duration_hours - customRental.minimum_hours)
      const versionThree = customRental.version === 3 || customRental.version === 4
      const quantity = versionThree ? 1 : customRental.duration_hours
      const unitPrice = versionThree ? customRental.rental_total : customRental.hourly_rate
      const pricingRuleId = customRental.version === 4
        ? 'custom_time_rental_v4.minimum_price_and_additional_hour_rate'
        : versionThree ? 'weekday_custom_rental.minimum_price_and_additional_hour_rate' : 'weekday_custom_rental.hourly_rate'
      const priceDetail = customRental.version === 4
        ? formatLuxorCustomTimeRentalPriceBreakdownV4(customRental)
        : formatWeekdayCustomRentalPriceBreakdown(customRental)
      const quoteBreakdown = versionThree
        ? { quantity: 1, unit_price: customRental.rental_total, subtotal: customRental.rental_total, included_hours: customRental.minimum_hours, minimum_price: customRental.minimum_price, additional_hours: extraHours, additional_hour_rate: customRental.additional_hour_rate }
        : { quantity: customRental.duration_hours, unit_price: customRental.hourly_rate, subtotal: customRental.rental_total }
      confirmed.push({ ...lineItem({
        id: 'venue-rental',
        category: 'Venue Rental - Confirmed Price',
        description: customRental.version === 4 ? 'Luxor Custom Time venue rental' : 'Luxor custom weekday venue rental',
        quantity,
        unitPrice,
        required: true,
        pricingRole: 'required',
        paymentBucket: 'venue',
        pricingRuleId,
        detail: `${formatCatalogTime(customRental.start_time)}-${formatCatalogTime(customRental.end_time)}${Number(customRental.end_time.slice(0, 2)) < 6 ? ' (next day)' : ''} access | ${formatWeekdayCustomRentalDuration(customRental.duration_minutes)} | ${priceDetail}`,
        quoteBreakdown,
      }), total: customRental.rental_total })
    }
  } else {
    const rentalAmount = rentalGroup ? readNumber(luxor, 'rental_rates', rentalGroup, safePeriod) : undefined
    if (rentalAmount === undefined || rentalAmount <= 0) errors.push(CONFIGURATION_ERROR)
    else confirmed.push(lineItem({ id: 'venue-rental', category: 'Venue Rental — Confirmed Price', description: 'Luxor venue rental', unitPrice: rentalAmount, required: true, pricingRole: 'required', paymentBucket: 'venue', detail: `Official Luxor rate for ${safePeriod.replace('_', ' ')} venue access.` }))
    addRentalExtension(confirmed, errors, selection, luxor, safePeriod, eventDate)
  }
  const cleaning = tierForGuestCount(readRecord(luxor, 'required_fees', 'cleaning')?.retail, guestCount)
  const securityConfig = readRecord(luxor, 'required_fees', 'security') || readRecord(luxor, 'security') || readRecord(config, 'security')
  const security = calculateSecurityCharge({
    securityConfig,
    guestCount,
    eventDate,
    guestArrivalTime,
    eventEndTime,
  })
  const securityAmount = security.valid ? security.total : undefined
  const securityBillableHours = security.valid ? security.duration.durationHours : undefined
  if (!security.valid) errors.push(security.error)

  const cleaningAmount = numberValue(cleaning?.amount)
  if (cleaningAmount === undefined) errors.push(CONFIGURATION_ERROR)
  else {
    confirmed.push(lineItem({ id: 'required-cleaning', category: 'Luxor required charges', description: 'Required cleaning', unitPrice: cleaningAmount, required: true, pricingRole: 'required', paymentBucket: 'venue' }))
  }
  if (security.valid) {
    confirmed.push(lineItem({ id: 'required-security', category: 'Luxor required charges', description: 'Required security', unitPrice: security.total, required: true, pricingRole: 'required', paymentBucket: 'venue', detail: security.detail, pricingRuleId: 'required_fees.security.actual_event_duration', quoteBreakdown: security.quoteBreakdown }))
  }
  confirmed.push(lineItem({ id: 'included-tables-chairs', category: 'Included with venue rental', description: 'Tables and chairs', unitPrice: 0, included: true, pricingRole: 'included', paymentBucket: 'venue', detail: 'Included with the confirmed Luxor venue rental.' }))
  if (proposalPricingPolicyVersion >= 4 || !packageTierId || packageTierId === 'customized') confirmed.push(...confirmedCustom)
  // The current tiered packages supersede the legacy Classic/Signature/Luxor
  // decor-package selector. Individual catalog add-ons are charged only for
  // Customized; old saved requests without a tier continue through the legacy
  // path unchanged.
  const decorSelection = packageTierId
    ? { ...selection, decorPackageId: null, decor_package_id: null }
    : selection
  const decor = proposalPricingPolicyVersion >= 4
    ? officialDecorSelectionV4(decorSelection, luxor, packageTierId)
    : officialDecorSelection(decorSelection, luxor)
  if (proposalPricingPolicyVersion >= 4 || !packageTierId || packageTierId === 'customized') errors.push(...decor.errors)
  if (proposalPricingPolicyVersion >= 4 || !packageTierId || packageTierId === 'customized') confirmed.push(...decor.items)
  const requestedPromotionId = trimmedString(selection.promotionId ?? selection.promotion_id)
  const promotion = promotionFromOptions(options.promotion)
  if (requestedPromotionId && !promotion) errors.push('The selected promotion could not be verified. Refresh promotions and choose an active saved promotion.')
  const configuredTaxRate = configTaxRate(luxor)
  const requestedTaxRate = selectedTaxRate(selection)
  const taxRate = requestedTaxRate === null ? 0 : requestedTaxRate ?? configuredTaxRate ?? 0
  if (configuredTaxRate === null) errors.push(CONFIGURATION_ERROR)
  const securityDeposit = readNumber(luxor, 'security_deposit', 'amount') || 750
  const paymentPlan = planFromSelection(selection, config)
  const amountDueFor = (eventPrice: number | null) => {
    if (eventPrice === null || !paymentPlan) return null
    if (paymentPlan.mode === 'pay_in_full') return eventPrice
    return Math.min(eventPrice, paymentPlan.booking_payment_amount ?? rounded(Math.max(eventPrice * paymentPlan.booking_payment_percent / 100, 750)))
  }
  const decorItemIds = new Set(decor.items.map((item) => item.id))
  const packageBaseLines = confirmed.filter((item) => !decorItemIds.has(item.id))
  const rentalAccessHours = safePeriod === 'custom'
    ? numberValue(customRental?.duration_hours)
    : readNumber(luxor, 'rental_access', safePeriod, 'hours') ?? (safePeriod === 'full_day' ? 14 : 6)
  const additionalRentalLine = confirmed.find((item) => item.id === 'venue-additional-hours')
  const additionalRentalHours = numberValue(additionalRentalLine?.quantity) || 0
  const displayedRentalHours = safePeriod === 'custom'
    ? rentalAccessHours || 0
    : (rentalAccessHours || 0) + additionalRentalHours

  const selectedCustomAdditions = [
    ...(packageTierId === 'customized' ? decor.items.map((item) => `${item.description}${item.quantity > 1 ? ` x ${item.quantity}` : ''}`) : []),
    ...(packageTierId === 'customized' ? confirmedCustom.map((item) => `${item.description}${item.quantity > 1 ? ` x ${item.quantity}` : ''}`) : []),
  ]
  const packageConfigurations = packageTierId
    ? LUXOR_PROPOSAL_PACKAGE_IDS.map((id) => packageSettings.options[id])
    : []
  const tierPackages: PackageCalculation[] = packageTierId
    ? packageConfigurations.map((option) => {
      const optionDecor = proposalPricingPolicyVersion >= 4
        ? officialDecorSelectionV4(decorSelection, luxor, option.id)
        : decor
      const packageFee = calculateLuxorProposalPackageFee(option.id, guestCount, packageSettings)
      const packageErrors = packageFee.valid ? [] : [packageFee.error || 'Package pricing requires owner review.']
      const packageInclusions = packageInclusionsForDisplay(
        option,
        displayedRentalHours,
        option.id === 'customized' ? selectedCustomAdditions : [],
        proposalPricingPolicyVersion >= 4 ? optionDecor.catalog : undefined,
        Boolean(optionDecor.quantities.tablecloths),
      )
      const lines = [
        ...packageBaseLines.map((item) => ({ ...item })),
        ...(proposalPricingPolicyVersion >= 4 || option.id === 'customized' ? optionDecor.items.map((item) => ({ ...item })) : []),
      ]
  if (packageFee.valid && packageFee.amount && packageFee.amount > 0) {
        const tier = option.price_tiers.find((entry) => guestCount >= entry.min_guests && guestCount <= entry.max_guests)
        lines.push(lineItem({
          id: `package-fee-${option.id}`,
          category: 'Luxor package fee',
          description: `${option.name} decor package fee`,
          unitPrice: packageFee.amount,
          pricingRole: 'add_on',
          paymentBucket: 'venue',
          pricingRuleId: `package_selection_v1.${option.id}.price_tiers`,
          detail: `${guestCount} guests | ${tier?.min_guests}-${tier?.max_guests} guest tier`,
        }))
      }
      lines.push(lineItem({
        id: `package-inclusions-${option.id}`,
        category: 'Package inclusions',
        description: `Included with ${option.name}`,
        unitPrice: 0,
        included: true,
        pricingRole: 'included',
        paymentBucket: 'venue',
        detail: packageInclusions.join(' • '),
        isChecklistItem: true,
      }))
      applyComplimentary(lines, promotion, 'luxor')
      const subtotal = rounded(lines.reduce((sum, item) => sum + item.total, 0))
      const discountAmount = promotion && promotion.discount_type !== 'complimentary'
        ? rounded(promotion.discount_type === 'percent' ? subtotal * promotion.value / 100 : Math.min(subtotal, promotion.value))
        : 0
      const taxAmount = rounded(Math.max(0, subtotal - discountAmount) * taxRate)
      if (taxAmount) lines.push(lineItem({ id: 'luxor-sales-tax', category: 'Luxor tax', description: 'Applicable Luxor sales tax', unitPrice: taxAmount, pricingRole: 'tax', paymentBucket: 'venue' }))
      if (discountAmount) lines.push(lineItem({ id: 'luxor-promotion', category: 'Luxor adjustment', description: promotion?.name || 'Approved promotion', unitPrice: -discountAmount, pricingRole: 'discount', paymentBucket: 'venue' }))
      const finalEventPrice = rounded(subtotal - discountAmount + taxAmount)
      return {
        id: option.id,
        name: option.name,
        description: option.description,
        positioning: option.positioning,
        summaryTitle: option.summary_title,
        summary: option.summary,
        inclusions: packageInclusions,
        packageFeeAmount: packageFee.amount,
        package_fee_amount: packageFee.amount,
        pricingReviewRequired: !packageFee.valid,
        finalEventPrice: packageFee.valid ? finalEventPrice : null,
        final_event_price: packageFee.valid ? finalEventPrice : null,
        refundableSecurityDeposit: securityDeposit,
        refundable_security_deposit: securityDeposit,
        amountDueToBook: amountDueFor(packageFee.valid ? finalEventPrice : null),
        amount_due_to_book: amountDueFor(packageFee.valid ? finalEventPrice : null),
        subtotal,
        discountAmount,
        discount_amount: discountAmount,
        taxAmount,
        tax_amount: taxAmount,
        taxRate,
        tax_rate: taxRate,
        lineItems: lines,
        line_items: lines,
        ...(promotion ? { promotion: { ...promotion, amount: discountAmount } } : {}),
        warnings,
        errors: [...errors, ...packageErrors],
      }
    })
    : []

  let legacyPackage: PackageCalculation | null = null
  if (!packageTierId) {
    const legacyLines = confirmed.map((item) => ({ ...item }))
    applyComplimentary(legacyLines, promotion, 'luxor')
    const subtotal = rounded(legacyLines.reduce((sum, item) => sum + item.total, 0))
    const discountAmount = promotion && promotion.discount_type !== 'complimentary'
      ? rounded(promotion.discount_type === 'percent' ? subtotal * promotion.value / 100 : Math.min(subtotal, promotion.value))
      : 0
    const taxAmount = rounded(Math.max(0, subtotal - discountAmount) * taxRate)
    if (taxAmount) legacyLines.push(lineItem({ id: 'luxor-sales-tax', category: 'Luxor tax', description: 'Applicable Luxor sales tax', unitPrice: taxAmount, pricingRole: 'tax', paymentBucket: 'venue' }))
    if (discountAmount) legacyLines.push(lineItem({ id: 'luxor-promotion', category: 'Luxor adjustment', description: promotion?.name || 'Approved promotion', unitPrice: -discountAmount, pricingRole: 'discount', paymentBucket: 'venue' }))
    legacyPackage = {
      id: 'luxor_venue_proposal',
      name: 'Luxor Venue Proposal',
      description: 'Confirmed venue rental and required Luxor charges.',
      finalEventPrice: rounded(subtotal - discountAmount + taxAmount),
      final_event_price: rounded(subtotal - discountAmount + taxAmount),
      refundableSecurityDeposit: securityDeposit,
      refundable_security_deposit: securityDeposit,
      amountDueToBook: amountDueFor(rounded(subtotal - discountAmount + taxAmount)),
      amount_due_to_book: amountDueFor(rounded(subtotal - discountAmount + taxAmount)),
      subtotal,
      discountAmount,
      discount_amount: discountAmount,
      taxAmount,
      tax_amount: taxAmount,
      taxRate,
      tax_rate: taxRate,
      lineItems: legacyLines,
      line_items: legacyLines,
      ...(promotion ? { promotion: { ...promotion, amount: discountAmount } } : {}),
      warnings,
      errors,
    }
  }
  const packages = packageTierId ? tierPackages : legacyPackage ? [legacyPackage] : []
  const selectedTierPackage = packageTierId ? tierPackages.find((item) => item.id === packageTierId) : null
  const selectedPackageCalculation = selectedTierPackage || legacyPackage
  const confirmedLines = selectedPackageCalculation?.lineItems || confirmed
  const subtotal = selectedPackageCalculation?.subtotal ?? rounded(confirmed.reduce((sum, item) => sum + item.total, 0))
  const discountAmount = selectedPackageCalculation?.discountAmount ?? 0
  const taxAmount = selectedPackageCalculation?.taxAmount ?? 0
  const effectiveTaxRate = selectedPackageCalculation?.taxRate ?? taxRate
  const selectedPackageNeedsPricingReview = selectedPackageCalculation?.pricingReviewRequired === true
  const confirmedLuxorTotal = selectedPackageNeedsPricingReview
    ? null
    : selectedPackageCalculation?.finalEventPrice ?? rounded(subtotal - discountAmount + taxAmount)
  const selectedPackageFinalPrice = confirmedLuxorTotal
  const scheduleBookingDate = paymentPlan?.booking_date || new Date().toISOString().slice(0, 10)
  const previewPaymentSchedule = paymentPlan && paymentPlan.mode !== 'pay_in_full' && confirmedLuxorTotal !== null
    ? calculateLuxorPaymentSchedule({
      eventDate,
      bookingDate: scheduleBookingDate,
      venueServicesTotal: confirmedLuxorTotal,
      eventServicesTotal: 0,
      paymentCount: paymentPlan.payment_count,
      paymentCadence: paymentPlan.payment_cadence,
      bookingPaymentAmount: paymentPlan.booking_payment_amount,
    })
    : null
  const finalPaymentPlan = previewPaymentSchedule
    ? {
      ...paymentPlan!,
      ...paymentPlanFromSchedule(previewPaymentSchedule, proposalPricingPolicyVersion >= 4 ? 'first_deposit_paid_at_v1' : paymentPlan?.schedule_anchor_policy),
      ...(paymentPlan?.preferred_payment_method ? { preferred_payment_method: paymentPlan.preferred_payment_method } : {}),
    }
    : paymentPlan
  const paymentScheduleInvalid = Boolean(paymentPlan && paymentPlan.mode !== 'pay_in_full' && !previewPaymentSchedule)
  const selectedIds = selectedProposalAddOns(selection)
  const quoteErrors: string[] = []
  const selectedByGroup = new Map<ServiceChoiceGroup, string>()
  for (const id of selectedIds) {
    const option = optionForId(id)
    if (!option) continue
    const prior = selectedByGroup.get(option.group)
    if (prior && prior !== id) quoteErrors.push(`Choose one ${option.group === 'photo_booth' ? 'photo booth' : option.group === 'bar' ? 'bar service' : option.group} option.`)
    else selectedByGroup.set(option.group, id)
  }
  const vendorQuotes = ADD_ON_QUOTE_OPTIONS.map((option) => preferredQuote(config, option, guestCount))
  const addOnQuotes = [...vendorQuotes, ...decor.quotes]
  const selectedVendorEstimateLines = vendorQuotes.filter((quote) => selectedIds.includes(quote.id)).flatMap((quote) => quote.lineItems).concat(vendorCustomItems)
  applyComplimentary(selectedVendorEstimateLines, promotion, 'vendor')
  const estimatedVendorTotal = rounded(selectedVendorEstimateLines.reduce((sum, item) => sum + item.total, 0))
  const selectedPackageErrors = selectedPackageCalculation?.errors || errors
  const calculationErrors = [...new Set([...selectedPackageErrors, ...decor.errors, ...quoteErrors])]
  const publicationErrors = !paymentPlan ? [PAYMENT_PLAN_REQUIRED] : paymentScheduleInvalid ? ['The selected payment schedule cannot meet the final-payment deadline.'] : []
  const selectedPackageOption = packageTierId ? packageSettings.options[packageTierId] : null
  const packageSelectionSnapshot = selectedPackageOption && selectedTierPackage ? {
    schema_version: LUXOR_PACKAGE_SELECTION_SCHEMA_VERSION,
    id: selectedPackageOption.id,
    name: selectedPackageOption.name,
    positioning: selectedPackageOption.positioning,
    description: selectedPackageOption.description,
    summary_title: selectedPackageOption.summary_title,
    summary: selectedPackageOption.summary,
    inclusions: selectedTierPackage.inclusions || [],
    package_fee_amount: selectedTierPackage.packageFeeAmount,
    guest_count: guestCount,
  } : null
  const selectedPackageName = selectedPackageOption?.name || 'Luxor Venue Proposal'
  const selectedDecorSubtotal = proposalPricingPolicyVersion >= 4
    ? decor.subtotal
    : packageTierId ? packageTierId === 'customized' ? decor.subtotal : 0 : decor.subtotal
  const finalContext: LuxorProposalContext = {
    version: proposalPricingPolicyVersion >= 4 ? 4 : packageTierId ? 3 : 2,
    proposal_pricing_policy_version: proposalPricingPolicyVersion,
    package_id: 'luxor_venue_proposal',
    package_name: selectedPackageName,
    package_tier_id: packageTierId || undefined,
    package_tier_name: packageTierId ? selectedPackageName : undefined,
    package_selection_snapshot: packageSelectionSnapshot || undefined,
    package_inclusions: selectedTierPackage?.inclusions || undefined,
    event_date: eventDate,
    expected_guest_count: guestCount,
    rental_period: safePeriod,
    rental_hours: displayedRentalHours,
    rental_additional_hours: additionalRentalHours,
    rental_additional_hour_rate: numberValue(additionalRentalLine?.unitPrice) || undefined,
    decor_package_id: packageTierId ? null : decor.packageId || null,
    decor_add_on_quantities: decor.quantities,
    decor_subtotal: selectedDecorSubtotal,
    event_access: eventAccessLabel(luxor, safePeriod),
    guest_arrival_time: trimmedString(selection.guest_arrival_time ?? selection.guestArrivalTime) || undefined,
    guestArrivalTime: trimmedString(selection.guestArrivalTime ?? selection.guest_arrival_time) || undefined,
    event_end_time: trimmedString(selection.event_end_time ?? selection.eventEndTime) || undefined,
    eventEndTime: trimmedString(selection.eventEndTime ?? selection.event_end_time) || undefined,
    ...(customRental ? {
      weekday_custom_rental: customRental,
      start_time: customRental.start_time,
      end_time: customRental.end_time,
      rental_start_time: customRental.start_time,
      rental_end_time: customRental.end_time,
      ...(customRental.version === 4 ? {
        rental_start_at: customRental.rental_start_at,
        rental_end_at: customRental.rental_end_at,
        guest_arrival_at: customRental.guest_arrival_at,
        event_end_at: customRental.event_end_at,
      } : {}),
      rental_hours: customRental.duration_hours,
      rental_hourly_rate: customRental.hourly_rate,
      rental_total: customRental.rental_total,
    } : {}),
    security_rate: security.rate,
    security_guards: security.guards,
    security_hours: securityBillableHours,
    security_duration_minutes: security.valid ? security.duration.durationMinutes : undefined,
    security_time_zone: LUXOR_EVENT_TIME_ZONE,
    security_calculation_version: 1,
    security_total: securityAmount,
    venue_services_total: confirmedLuxorTotal ?? undefined, event_services_total: 0, luxor_services_total: confirmedLuxorTotal ?? undefined, planner_services_total: 0,
    final_event_price: confirmedLuxorTotal ?? undefined, refundable_security_deposit: securityDeposit, payment_collection_scope: 'luxor_services_only', amount_due_to_book: amountDueFor(confirmedLuxorTotal),
    ...(finalPaymentPlan ? { payment_plan: finalPaymentPlan } : {}), ...(promotion ? { promotion: { ...promotion, amount: discountAmount } } : {}),
    package_fee_amount: selectedPackageNeedsPricingReview ? null : selectedTierPackage?.packageFeeAmount || 0,
    confirmed_luxor_total: selectedPackageFinalPrice ?? undefined, estimated_vendor_total: estimatedVendorTotal, estimated_overall_investment: confirmedLuxorTotal === null ? null : rounded(confirmedLuxorTotal + estimatedVendorTotal), preferred_vendor_estimate_lines: selectedVendorEstimateLines,
    vendor_pricing_disclaimer: PREFERRED_VENDOR_PRICING_DISCLAIMER,
    pricing_selection: {
      packageId: 'luxor_venue_proposal',
      ...(packageTierId ? { packageTierId, package_tier_id: packageTierId } : {}),
      eventDate,
      guestCount,
      rentalPeriod: safePeriod,
      guestArrivalTime: trimmedString(selection.guestArrivalTime ?? selection.guest_arrival_time) || undefined,
      guest_arrival_time: trimmedString(selection.guest_arrival_time ?? selection.guestArrivalTime) || undefined,
      eventEndTime: trimmedString(selection.eventEndTime ?? selection.event_end_time) || undefined,
      event_end_time: trimmedString(selection.event_end_time ?? selection.eventEndTime) || undefined,
      ...(customRental ? {
        rentalStartTime: customRental.start_time,
        rental_start_time: customRental.start_time,
        rentalEndTime: customRental.end_time,
        rental_end_time: customRental.end_time,
      } : {}),
      addOns: selectedIds,
      decorPackageId: packageTierId ? null : decor.packageId || null,
      decor_package_id: packageTierId ? null : decor.packageId || null,
      decorAddOnQuantities: decor.quantities,
      decor_add_on_quantities: decor.quantities,
      proposal_pricing_policy_version: proposalPricingPolicyVersion,
      ...(promotion ? { promotionId: promotion.id, promotion_id: promotion.id } : {}),
      customItems: selection.customItems ?? selection.custom_items ?? [],
      ...(finalPaymentPlan ? { paymentPlan: finalPaymentPlan } : {}),
    },
    calculation_warnings: warnings, calculation_errors: calculationErrors, publication_errors: publicationErrors,
  }
  const selectedPackageCalculationWithPlan = selectedPackageCalculation ? {
    ...selectedPackageCalculation,
    amountDueToBook: amountDueFor(selectedPackageCalculation.finalEventPrice),
    amount_due_to_book: amountDueFor(selectedPackageCalculation.finalEventPrice),
  } : null
  const primary = selectedPackageCalculationWithPlan || {
    id: 'luxor_venue_proposal', name: selectedPackageName, description: 'Confirmed venue rental and required Luxor charges.',
    finalEventPrice: confirmedLuxorTotal, final_event_price: confirmedLuxorTotal,
    refundableSecurityDeposit: securityDeposit, refundable_security_deposit: securityDeposit,
    amountDueToBook: amountDueFor(confirmedLuxorTotal), amount_due_to_book: amountDueFor(confirmedLuxorTotal),
    subtotal, discountAmount, discount_amount: discountAmount, taxAmount, tax_amount: taxAmount,
    taxRate: effectiveTaxRate, tax_rate: effectiveTaxRate, lineItems: confirmedLines, line_items: confirmedLines,
    warnings, errors: calculationErrors,
  }
  const finalizedPackages = packageTierId
    ? packages.map((item) => item.id === packageTierId ? primary : item)
    : [primary]
  const snapshot = {
      schema_version: proposalPricingPolicyVersion >= 4 ? 4 : packageTierId ? 3 : 2,
    calculated_at: new Date().toISOString(),
    pricing_mode: 'venue_plus_preferred_vendor_estimates',
    security_pricing: {
      schema_version: 1,
      calculation: 'actual_event_duration',
      time_zone: LUXOR_EVENT_TIME_ZONE,
      rate_per_guard_hour: security.rate,
      guards: security.guards,
      ...(security.valid ? {
        arrival_at: security.duration.arrivalAt,
        event_end_at: security.duration.eventEndAt,
        arrival_local: security.duration.arrivalLocal,
        event_end_local: security.duration.eventEndLocal,
        duration_minutes: security.duration.durationMinutes,
        duration_hours: security.duration.durationHours,
        total: security.total,
      } : { error: security.error }),
    },
    pricing_config: config,
    ...(customRental ? { weekday_custom_rental: customRental, selection: finalContext.pricing_selection } : {}),
    ...(packageSelectionSnapshot ? { package_selection: packageSelectionSnapshot } : {}),
    selected_package: {
      id: primary.id,
      name: primary.name,
      description: primary.description,
      ...(packageSelectionSnapshot ? { package_selection: packageSelectionSnapshot } : {}),
      line_items: confirmedLines,
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      tax_rate: effectiveTaxRate,
      final_event_price: selectedPackageFinalPrice,
      amount_due_to_book: amountDueFor(confirmedLuxorTotal),
      refundable_security_deposit: securityDeposit,
    },
    confirmed_luxor: { line_items: confirmedLines, total: selectedPackageFinalPrice, refundable_security_deposit: securityDeposit },
    preferred_vendor_estimates: { selected_lines: selectedVendorEstimateLines, total: estimatedVendorTotal, disclaimer: PREFERRED_VENDOR_PRICING_DISCLAIMER },
    estimated_overall_investment: confirmedLuxorTotal === null ? null : rounded(confirmedLuxorTotal + estimatedVendorTotal),
  }
  const estimatedOverallInvestment = confirmedLuxorTotal === null ? null : rounded(confirmedLuxorTotal + estimatedVendorTotal)
  return { valid: calculationErrors.length === 0, publishable: calculationErrors.length === 0 && publicationErrors.length === 0, calculationErrors, publicationErrors, requirements: { paymentPlan: !paymentPlan }, errors: [...calculationErrors, ...publicationErrors], warnings, packages: finalizedPackages, packageOptions: Object.values(packageSettings.options), lineItems: confirmedLines, line_items: confirmedLines, subtotal, discountAmount, discount_amount: discountAmount, taxAmount, tax_amount: taxAmount, taxRate: effectiveTaxRate, tax_rate: effectiveTaxRate, total: confirmedLuxorTotal, finalEventPrice: confirmedLuxorTotal, final_event_price: confirmedLuxorTotal, securityDepositAmount: securityDeposit, refundable_security_deposit: securityDeposit, totalWithSecurityDeposit: confirmedLuxorTotal === null ? null : rounded(confirmedLuxorTotal + securityDeposit), amountDueToBook: primary.amountDueToBook, amount_due_to_book: primary.amount_due_to_book, addOnQuotes, selectedVendorEstimateLines, preferred_vendor_estimate_lines: selectedVendorEstimateLines, confirmedLuxorTotal, confirmed_luxor_total: confirmedLuxorTotal, estimatedVendorTotal, estimated_vendor_total: estimatedVendorTotal, estimatedOverallInvestment, estimated_overall_investment: estimatedOverallInvestment, ...(promotion ? { promotion: { ...promotion, amount: discountAmount } } : {}), proposalContext: finalContext, context: finalContext, snapshot }
}

function calculateProposal(
  selection: LuxorProposalSelection,
  config: LuxorProposalPricingConfig = LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG,
  options: LuxorProposalCalculationOptions = {},
): LuxorProposalCalculation {
  if (config.pricing_mode === 'venue_plus_preferred_vendor_estimates') {
    return calculatePreferredVendorProposal(selection, config, options)
  }
  const selectedPackageId = normalizePackageId(selection.packageId)
  const eventDate = typeof selection.eventDate === 'string' ? selection.eventDate : ''
  const guestCount = Math.floor(numberValue(selection.guestCount) || 0)
  const requestedRentalPeriod = normalizeRentalPeriod(selection.rentalPeriod)
  const baseErrors: string[] = []
  const baseWarnings: string[] = []
  if (selection.decorPackageId || selection.decor_package_id || Object.values(record(selection.decorAddOnQuantities ?? selection.decor_add_on_quantities) || {}).some(Boolean)) {
    baseErrors.push('Official decor is unavailable in this saved legacy catalog. Start a new proposal to use the current decor offerings.')
  }
  const requestedPromotionId = trimmedString(selection.promotionId ?? selection.promotion_id)
  const resolvedPromotion = promotionFromOptions(options.promotion)
  const legacyDiscount = rawLegacyDiscount(selection)
  const customItemResult = normalizeCustomItems(selection)
  baseErrors.push(...customItemResult.errors)
  const maxGuests = readNumber(config, 'guest_count', 'maximum') || 200
  const minGuests = readNumber(config, 'guest_count', 'minimum') || 1
  if (!selectedPackageId) baseErrors.push('Choose one of Luxor’s four packages before calculating the final proposal.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !dateRateGroup(eventDate)) baseErrors.push('A valid event date is required.')
  if (!guestCount || guestCount < minGuests || guestCount > maxGuests) {
    baseErrors.push('Expected guest count must be between ' + String(minGuests) + ' and ' + String(maxGuests) + '. Events above this limit need a configured administrator pricing rule before they can be published.')
  }
  if (guestCount > maxGuests && selection.adminOverride === true) {
    baseWarnings.push('Guest-count administrator override is recorded, but no approved pricing rule exists above ' + String(maxGuests) + ' guests.')
  }
  if (!requestedRentalPeriod) baseErrors.push('Choose a morning, evening, or full-day rental period.')
  if (requestedRentalPeriod === 'custom') baseErrors.push('Custom weekday rentals require the current Luxor venue catalog. Saved legacy package pricing remains unchanged.')
  if (requestedPromotionId && !resolvedPromotion) {
    baseErrors.push('The selected promotion could not be verified. Refresh promotions and choose an active saved promotion.')
  }
  if (legacyDiscount && !resolvedPromotion) {
    baseWarnings.push(`Legacy ${legacyDiscount.discount_type === 'fixed' ? 'fixed-dollar' : 'percentage'} draft adjustment is preserved for review but is not applied until it is saved as a promotion.`)
  }
  if (legacyDiscount && resolvedPromotion) {
    baseWarnings.push('A saved promotion was applied. Legacy manual discount fields were ignored.')
  }
  const securityDeposit = readNumber(config, 'security_deposit', 'amount')
  if (securityDeposit === undefined || securityDeposit !== 750) baseErrors.push(CONFIGURATION_ERROR)
  const paymentPlan = planFromSelection(selection, config)
  const selectedTax = selectedTaxRate(selection)
  const taxRate = selectedTax ?? configTaxRate(config)
  if (taxRate === null || taxRate === undefined) baseErrors.push(CONFIGURATION_ERROR)
  const safePackage = selectedPackageId || 'rental_only'
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? eventDate : '2027-01-05'
  const safeGuests = Math.max(1, Math.min(maxGuests, guestCount || 1))
  const safePeriod = requestedRentalPeriod || 'evening'

  const packages = (Object.keys(PACKAGE_NAMES) as LuxorProposalPackageId[]).map((packageId) => {
    const calculation = calculatePackage({
      packageId,
      selection,
      config,
      eventDate: safeDate,
      guestCount: safeGuests,
      requestedRentalPeriod: safePeriod,
      securityDeposit: securityDeposit || 750,
      paymentPlan,
      taxRate: taxRate ?? 0,
      customItems: customItemResult.items,
      promotion: resolvedPromotion,
    })
    return {
      ...calculation,
      errors: packageId === safePackage ? [...new Set([...baseErrors, ...calculation.errors])] : calculation.errors,
      warnings: packageId === safePackage ? [...new Set([...baseWarnings, ...calculation.warnings])] : calculation.warnings,
    }
  })
  const selected = packages.find((item) => item.id === safePackage) || packages[0]
  const addOnQuotes = calculateAddOnQuotes({
    packageId: selected.id,
    selection,
    config,
    eventDate: safeDate,
    guestCount: safeGuests,
    requestedRentalPeriod: safePeriod,
    securityDeposit: securityDeposit || 750,
  })
  const calculationErrors = selected.errors
  // Terms decide what is due after the agreement is signed. They do not make
  // an otherwise complete package price unknown, so keep this message precise
  // and outside the actual pricing-error bucket.
  const publicationErrors = [
    ...(paymentPlan ? [] : [PAYMENT_PLAN_REQUIRED]),
    ...(legacyDiscount && !resolvedPromotion ? ['Save this legacy draft adjustment as a promotion before publishing this proposal.'] : []),
  ]
  const errors = [...new Set([...calculationErrors, ...publicationErrors])]
  const warnings = [...new Set([
    ...selected.warnings,
    ...(paymentPlan ? [] : ['Set the payment plan in Step 5 before publishing this final proposal.']),
  ])]
  const packageName = selected.name
  const luxorServicesTotal = rounded(selected.lineItems
    .filter((item) => item.paymentBucket !== 'security_deposit' && item.pricingRole !== 'discount' && item.pricingRole !== 'tax' && !item.isChecklistItem && isLuxorCollectedLineItem(item))
    .reduce((sum, item) => sum + item.total, 0))
  const secConfig = readRecord(config, 'required_fees', 'security') || readRecord(config, 'security')
  const security = calculateSecurityCharge({
    securityConfig: secConfig,
    guestCount: safeGuests,
    eventDate,
    guestArrivalTime: trimmedString(selection.guestArrivalTime ?? selection.guest_arrival_time),
    eventEndTime: trimmedString(selection.eventEndTime ?? selection.event_end_time),
  })
  const secLine = selected.lineItems.find((item) => item.id === 'required-security')
  const secTotal = secLine?.total ?? (security.valid ? security.total : undefined)

  const finalContext: LuxorProposalContext = {
    version: 1,
    pricing_config_version: numberValue(config.version),
    package_id: selected.id,
    package_name: packageName,
    event_type: typeof selection.eventType === 'string' ? selection.eventType : undefined,
    event_date: eventDate || undefined,
    expected_guest_count: guestCount || undefined,
    rental_period: selected.id === 'gold_all_inclusive' || selected.lineItems.some((item) => item.id === 'full-decor') ? 'full_day' : safePeriod,
    event_access: selected.id === 'gold_all_inclusive' || selected.lineItems.some((item) => item.id === 'full-decor')
      ? '8 hours of event access plus 4 hours for setup and breakdown'
      : safePeriod,
    // Catalog rows keep their established category-based buckets. Custom rows
    // have a freeform category, so use the explicit owner-selected bucket;
    // otherwise the payment-plan breakdown would not add up to the exact
    // Final Event Price after a custom charge is added.
    venue_services_total: rounded(selected.lineItems
      .filter((item) => item.pricingRole === 'custom' ? item.paymentBucket === 'venue' : item.category === 'Venue Services')
      .reduce((sum, item) => sum + item.total, 0)),
    event_services_total: rounded(selected.lineItems
      .filter((item) => item.pricingRole === 'custom' ? item.paymentBucket === 'event' : item.category === 'Event Services')
      .reduce((sum, item) => sum + item.total, 0)),
    luxor_services_total: luxorServicesTotal,
    planner_services_total: rounded(selected.finalEventPrice - luxorServicesTotal),
    final_event_price: selected.finalEventPrice,
    tax_rate: selected.taxRate,
    refundable_security_deposit: securityDeposit || 750,
    guest_arrival_time: trimmedString(selection.guest_arrival_time ?? selection.guestArrivalTime) || undefined,
    guestArrivalTime: trimmedString(selection.guestArrivalTime ?? selection.guest_arrival_time) || undefined,
    event_end_time: trimmedString(selection.event_end_time ?? selection.eventEndTime) || undefined,
    eventEndTime: trimmedString(selection.eventEndTime ?? selection.event_end_time) || undefined,
    security_rate: security.rate,
    security_guards: security.guards,
    security_hours: security.valid ? security.duration.durationHours : undefined,
    security_duration_minutes: security.valid ? security.duration.durationMinutes : undefined,
    security_time_zone: LUXOR_EVENT_TIME_ZONE,
    security_calculation_version: 1,
    security_total: secTotal,
    payment_collection_scope: 'luxor_services_only',
    payment_policy_acknowledged: selection.paymentPolicyAcknowledged === true || selection.payment_policy_acknowledged === true,
    amount_due_to_book: selected.amountDueToBook,
    ...(paymentPlan ? { payment_plan: paymentPlan } : {}),
    pricing_selection: {
      packageId: selected.id,
      eventDate,
      guestCount,
      rentalPeriod: safePeriod,
      guestArrivalTime: trimmedString(selection.guestArrivalTime ?? selection.guest_arrival_time) || undefined,
      guest_arrival_time: trimmedString(selection.guest_arrival_time ?? selection.guestArrivalTime) || undefined,
      eventEndTime: trimmedString(selection.eventEndTime ?? selection.event_end_time) || undefined,
      event_end_time: trimmedString(selection.event_end_time ?? selection.eventEndTime) || undefined,
      addOns: array(selection.addOns ?? selection.add_ons).filter((item): item is string => typeof item === 'string'),
      removedServiceIds: array(selection.removedServiceIds ?? selection.removed_service_ids).filter((item): item is string => typeof item === 'string'),
      ...(resolvedPromotion ? { promotion_id: resolvedPromotion.id } : {}),
      ...(legacyDiscount && !resolvedPromotion ? { legacy_draft_adjustment: legacyDiscount } : {}),
      customItems: customItemResult.items.map((item) => ({
        id: item.id,
        category: item.category,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        paymentBucket: item.paymentBucket,
        ...(item.detail ? { detail: item.detail } : {}),
      })),
      ...(paymentPlan ? { paymentPlan } : {}),
    },
    calculation_warnings: warnings,
    calculation_errors: calculationErrors,
    publication_errors: publicationErrors,
    ...(selected.promotion ? { promotion: selected.promotion } : {}),
  }
  const snapshot = {
    schema_version: 1,
    calculated_at: new Date().toISOString(),
    security_pricing: {
      schema_version: 1,
      calculation: 'actual_event_duration',
      time_zone: LUXOR_EVENT_TIME_ZONE,
      rate_per_guard_hour: security.rate,
      guards: security.guards,
      ...(security.valid ? {
        arrival_at: security.duration.arrivalAt,
        event_end_at: security.duration.eventEndAt,
        arrival_local: security.duration.arrivalLocal,
        event_end_local: security.duration.eventEndLocal,
        duration_minutes: security.duration.durationMinutes,
        duration_hours: security.duration.durationHours,
        total: secTotal,
      } : { error: security.error }),
    },
    selection: finalContext.pricing_selection,
    pricing_config: config,
    ...(selected.promotion ? { promotion: selected.promotion } : {}),
    selected_package: {
      id: selected.id,
      name: selected.name,
      subtotal: selected.subtotal,
      discount_amount: selected.discountAmount,
      tax_amount: selected.taxAmount,
      final_event_price: selected.finalEventPrice,
      refundable_security_deposit: securityDeposit || 750,
      amount_due_to_book: selected.amountDueToBook,
      line_items: selected.lineItems,
      ...(selected.promotion ? { promotion: selected.promotion } : {}),
    },
  }
  return {
    valid: calculationErrors.length === 0,
    publishable: errors.length === 0,
    calculationErrors,
    publicationErrors,
    requirements: { paymentPlan: !paymentPlan },
    errors,
    warnings,
    packages,
    lineItems: selected.lineItems,
    line_items: selected.lineItems,
    subtotal: selected.subtotal,
    discountAmount: selected.discountAmount,
    discount_amount: selected.discountAmount,
    taxAmount: selected.taxAmount,
    tax_amount: selected.taxAmount,
    taxRate: selected.taxRate,
    tax_rate: selected.taxRate,
    total: selected.finalEventPrice,
    finalEventPrice: selected.finalEventPrice,
    final_event_price: selected.finalEventPrice,
    securityDepositAmount: securityDeposit || 750,
    refundable_security_deposit: securityDeposit || 750,
    totalWithSecurityDeposit: rounded(selected.finalEventPrice + (securityDeposit || 750)),
    amountDueToBook: selected.amountDueToBook,
    amount_due_to_book: selected.amountDueToBook,
    addOnQuotes,
    ...(selected.promotion ? { promotion: selected.promotion } : {}),
    proposalContext: finalContext,
    context: finalContext,
    snapshot,
  }
}

export function calculateLuxorProposal(selection: LuxorProposalSelection, config: LuxorProposalPricingConfig = LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG, options: LuxorProposalCalculationOptions = {}): LuxorProposalCalculation {
  const custom = normalizeRentalPeriod(selection.rentalPeriod) === 'custom'
  const rentalStartTime = trimmedString(selection.rentalStartTime ?? selection.rental_start_time ?? selection.guestArrivalTime ?? selection.guest_arrival_time)
  const rentalEndTime = trimmedString(selection.rentalEndTime ?? selection.rental_end_time ?? selection.eventEndTime ?? selection.event_end_time)
  const guestArrivalTime = trimmedString(selection.guestArrivalTime ?? selection.guest_arrival_time)
  const eventEndTime = trimmedString(selection.eventEndTime ?? selection.event_end_time)
  const customSchedule = custom
    ? validateWeekdayCustomRentalSchedule(String(selection.eventDate || ''), rentalStartTime, rentalEndTime, guestArrivalTime, eventEndTime, getWeekdayCustomRentalPolicy(config))
    : null
  const timing = custom
    ? { valid: Boolean(customSchedule?.valid), error: customSchedule?.error, arrival: guestArrivalTime, end: eventEndTime, durationMinutes: customSchedule?.durationMinutes || 0, durationHours: customSchedule?.durationHours || 0, additionalHours: 0 }
    : proposalEventTiming(String(selection.rentalPeriod || 'evening'), guestArrivalTime, eventEndTime)
  const normalized = custom
    ? { ...selection, rentalStartTime, rental_start_time: rentalStartTime, rentalEndTime, rental_end_time: rentalEndTime, guestArrivalTime, guest_arrival_time: guestArrivalTime, eventEndTime, event_end_time: eventEndTime }
    : { ...selection, guestArrivalTime, guest_arrival_time: guestArrivalTime, eventEndTime, event_end_time: eventEndTime }
  const result = calculateProposal(normalized, config, options)
  result.context.booking_payment_default = readNumber(readRecord(config, 'luxor_costs') || config, 'booking_payment', 'amount')
  const extension = result.lineItems.find(item => item.id === 'venue-additional-hours')
  Object.assign(result.context, { event_access: formatCatalogTime(timing.arrival) + '–' + formatCatalogTime(timing.end) + ' access', additional_rental_hours: timing.additionalHours, additional_rental_charge: extension?.total || 0 })
  const requestedCoverage = trimmedString(selection.taxCoveragePromotionId ?? selection.tax_coverage_promotion_id)
  if (requestedCoverage && !options.sameDayBooking) {
    const error = 'The same-day booking promotion could not be verified. Refresh saved promotions.'
    result.calculationErrors.push(error)
    result.errors.push(error)
    result.valid = false
    result.publishable = false
  }
  if (options.sameDayBooking) {
    const terms = options.sameDayBooking
    const selectedForCoverage = result.packages.find((item) => item.id === (result.context.package_tier_id || 'luxor_venue_proposal'))
    const coverage = terms.status === 'active' && selectedForCoverage?.finalEventPrice !== null ? result.taxAmount : 0
    const coveredCalculation = coverage > 0 ? calculateProposal({ ...normalized, taxRate: 0 }, config, { promotion: options.promotion }) : null
    const coverageLine = (amount: number): LuxorInvoiceLineItem => ({ id: 'same-day-sales-tax-coverage', category: 'Seller-paid sales tax',
      description: 'LUXOR pays your applicable sales tax', quantity: 1, unitPrice: -amount, total: -amount,
      pricingRole: 'tax_coverage', paymentBucket: 'venue', pricingRuleId: 'promotion.' + terms.id, detail: terms.terms })
    for (const item of result.packages) {
      const amount = terms.status === 'active' && item.finalEventPrice !== null ? item.taxAmount : 0
      if (amount > 0) item.lineItems.push(coverageLine(amount))
      if (item.finalEventPrice !== null) item.finalEventPrice = item.final_event_price = rounded(item.finalEventPrice - amount)
      const coveredPackage = coveredCalculation?.packages.find(candidate => candidate.id === item.id)
      if (coveredPackage) item.amountDueToBook = item.amount_due_to_book = coveredPackage.amountDueToBook
    }
    // Package and selected lines may share the same array; add exactly once.
    if (coverage > 0 && !result.lineItems.some(item => item.pricingRole === 'tax_coverage')) result.lineItems.push(coverageLine(coverage))
    const oldTotal = result.total
    result.context.same_day_uncovered_amount_due_to_book = result.amountDueToBook
    if (oldTotal !== null) result.total = result.finalEventPrice = result.final_event_price = rounded(oldTotal - coverage)
    result.totalWithSecurityDeposit = result.total === null ? null : rounded(result.total + result.securityDepositAmount)
    if (coveredCalculation) result.amountDueToBook = result.amount_due_to_book = coveredCalculation.amountDueToBook
    for (const key of ['venue_services_total', 'event_services_total', 'luxor_services_total', 'planner_services_total']) {
      if (coveredCalculation && typeof coveredCalculation.context[key] === 'number') result.context[key] = coveredCalculation.context[key]
    }
    const snapshot = { ...terms, coverage_amount: coverage }
    Object.assign(result.context, { same_day_booking: snapshot, original_proposal_created_at: terms.original_created_at,
      final_event_price: result.total, amount_due_to_book: result.amountDueToBook })
    if (result.confirmedLuxorTotal !== undefined) {
      result.confirmedLuxorTotal = result.confirmed_luxor_total = result.total
      result.estimatedOverallInvestment = result.estimated_overall_investment = result.total === null ? null : rounded(result.total + (result.estimatedVendorTotal || 0))
      Object.assign(result.context, { confirmed_luxor_total: result.total, estimated_overall_investment: result.estimatedOverallInvestment })
    }
    result.context.pricing_selection = { ...result.context.pricing_selection, taxCoveragePromotionId: terms.id, tax_coverage_promotion_id: terms.id }
    Object.assign(result.snapshot, { same_day_booking: snapshot, selection: result.context.pricing_selection,
      ...(result.estimatedOverallInvestment !== undefined ? { estimated_overall_investment: result.estimatedOverallInvestment } : {}),
      line_items: result.lineItems, final_event_price: result.total, tax_coverage_amount: coverage,
      ...(typeof result.snapshot.selected_package === 'object' ? { selected_package: { ...result.snapshot.selected_package as Record<string, unknown>, final_event_price: result.total, amount_due_to_book: result.amountDueToBook, tax_coverage_amount: coverage } } : {}),
      ...(typeof result.snapshot.confirmed_luxor === 'object' ? { confirmed_luxor: { ...result.snapshot.confirmed_luxor as Record<string, unknown>, total: result.total, final_event_price: result.total, amount_due_to_book: result.amountDueToBook, tax_coverage_amount: coverage } } : {}),
      ...(typeof result.snapshot.totals === 'object' ? { totals: { ...result.snapshot.totals as Record<string, unknown>, final_event_price: result.total, tax_coverage_amount: coverage } } : {}) })
  }
  return result
}

export const calculateLuxorProposalPricing = calculateLuxorProposal
