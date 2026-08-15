import type {
  LuxorInvoiceLineItem,
  LuxorProposalContext,
  LuxorProposalPaymentPlan,
  LuxorProposalPromotionSnapshot,
  LuxorProposalPriceBreakdown,
} from './luxorInquiryTypes'

export type LuxorProposalPackageId =
  | 'rental_only'
  | 'bronze_essentials'
  | 'silver_premier'
  | 'gold_all_inclusive'

export type LuxorRentalPeriod = 'morning' | 'evening' | 'full_day'

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
  detail?: string
}

export type LuxorProposalAddOnQuote = {
  id: string
  label: string
  category: string
  /** Mutually exclusive service family used for replacement semantics. */
  group: 'decor' | 'catering' | 'dj' | 'photo_booth' | 'bar'
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
}

export type LuxorProposalSelection = {
  packageId?: LuxorProposalPackageId | string | null
  eventDate?: string | null
  guestCount?: number | string | null
  eventType?: string | null
  rentalPeriod?: LuxorRentalPeriod | string | null
  addOns?: string[] | null
  add_ons?: string[] | null
  removedServiceIds?: string[] | null
  removed_service_ids?: string[] | null
  /** Only the server resolves this to a saved promotion and its exact terms. */
  promotionId?: string | null
  promotion_id?: string | null
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
  customItems?: LuxorProposalCustomItem[] | null
  custom_items?: LuxorProposalCustomItem[] | null
  [key: string]: unknown
}

export type LuxorProposalResolvedPromotion = Omit<LuxorProposalPromotionSnapshot, 'amount'>

export type LuxorProposalCalculationOptions = {
  /** Only server-resolved saved promotions are eligible to change the total. */
  promotion?: LuxorProposalResolvedPromotion | null
}

/**
 * The JSONB pricing record is deliberately data-led. Its shape is validated
 * at calculation time so a malformed owner config can never produce a made-up
 * final proposal.
 */
export type LuxorProposalPricingConfig = Record<string, unknown>

type PricingRecord = Record<string, unknown>
type Tier = { min_guests?: unknown; max_guests?: unknown; amount?: unknown; officers?: unknown }

type PackageCalculation = {
  id: LuxorProposalPackageId
  name: string
  description: string
  finalEventPrice: number
  final_event_price: number
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
  lineItems: LuxorInvoiceLineItem[]
  line_items: LuxorInvoiceLineItem[]
  subtotal: number
  discountAmount: number
  discount_amount: number
  taxAmount: number
  tax_amount: number
  taxRate: number
  tax_rate: number
  total: number
  finalEventPrice: number
  final_event_price: number
  securityDepositAmount: number
  refundable_security_deposit: number
  totalWithSecurityDeposit: number
  amountDueToBook: number | null
  amount_due_to_book: number | null
  /** Exact pre-tax quotes for each catalog add-on under the selected package's rate tier. */
  addOnQuotes: LuxorProposalAddOnQuote[]
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
    morning: { start: '08:00', end: '15:00', hours: 7 },
    evening: { start: '17:00', end: '00:00', hours: 7 },
    full_day: { start: '11:00', end: '23:00', hours: 12 },
    full_decor_or_all_inclusive: {
      event_access_hours: 8,
      setup_and_breakdown_hours: 4,
      total_venue_access_hours: 12,
      display_note: '8 hours of event access plus 4 hours for setup and breakdown',
    },
  },
  rental_rates: {
    monday_thursday: { morning: 1000, evening: 1200, full_day: 1600 },
    friday: { morning: 1500, evening: 1700, full_day: 2500 },
    saturday: { morning: 1900, evening: 2100, full_day: 3000 },
    sunday: { morning: 1400, evening: 1600, full_day: 2200 },
  },
  required_fees: {
    cleaning: {
      retail: [{ min_guests: 1, max_guests: 75, amount: 250 }, { min_guests: 76, max_guests: 150, amount: 325 }, { min_guests: 151, max_guests: 200, amount: 400 }],
      all_inclusive: [{ min_guests: 1, max_guests: 75, amount: 200 }, { min_guests: 76, max_guests: 150, amount: 260 }, { min_guests: 151, max_guests: 200, amount: 320 }],
    },
    security: {
      retail: [{ min_guests: 1, max_guests: 150, officers: 1, amount: 250 }, { min_guests: 151, max_guests: 200, officers: 2, amount: 450 }],
      all_inclusive: [{ min_guests: 1, max_guests: 150, officers: 1, amount: 200 }, { min_guests: 151, max_guests: 200, officers: 2, amount: 400 }],
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
  // The supporting package workbook prices this setup at $500 for the
  // Custom Package and Bronze packages. Keeping it explicit here prevents the
  // component from disappearing into a made-up package total.
  tables_and_chairs_setup: { retail: 500, all_inclusive: 0 },
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
  return null
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

function planFromSelection(selection: LuxorProposalSelection): LuxorProposalPaymentPlan | null {
  const plan = record(selection.paymentPlan || selection.payment_plan)
  if (!plan) return null
  const paymentCount = numberValue(plan.payment_count ?? plan.paymentCount)
  if (paymentCount !== undefined && [2, 3, 4, 5].includes(paymentCount)) {
    return {
      mode: 'deposit_and_balance',
      booking_payment_percent: 25,
      final_payment_due_days_before_event: 60,
      payment_count: paymentCount as 2 | 3 | 4 | 5,
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

function requiresTableSetup(packageId: LuxorProposalPackageId) {
  return packageId === 'rental_only' || packageId === 'bronze_essentials'
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
  if (!value || !value.id || !value.name || !value.code || (value.discount_type !== 'percent' && value.discount_type !== 'fixed')) return null
  const amount = numberValue(value.value)
  if (amount === undefined || amount <= 0 || (value.discount_type === 'percent' && amount > 100)) return null
  return {
    id: value.id,
    name: value.name.trim(),
    code: value.code.trim().toUpperCase(),
    discount_type: value.discount_type,
    value: rounded(amount),
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

  const rentalGroup = dateRateGroup(eventDate)
  const rentalAmount = rentalGroup ? readNumber(config, 'rental_rates', rentalGroup, rentalPeriod) : undefined
  if (rentalAmount === undefined) {
    errors.push(CONFIGURATION_ERROR)
  } else {
    const accessDetail = rentalPeriod === 'full_day' && fullDecorAccess
      ? '8 hours of event access plus 4 hours for setup and breakdown'
      : rentalPeriod === 'morning' ? '8:00 AM–3:00 PM access' : rentalPeriod === 'evening' ? '5:00 PM–12:00 AM access' : '11:00 AM–11:00 PM access'
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

  const cleaningTier = tierForGuestCount(readRecord(config, 'required_fees', 'cleaning')?.[rateTier], guestCount)
  const cleaningAmount = cleaningTier ? numberValue(cleaningTier.amount) : undefined
  if (cleaningAmount === undefined) errors.push(CONFIGURATION_ERROR)
  else items.push(lineItem({
    id: 'required-cleaning', category: 'Venue Services', description: 'Required cleaning', unitPrice: cleaningAmount, required: true,
    pricingRuleId: `required_fees.cleaning.${rateTier}`, paymentBucket: 'venue', quoteBreakdown: { quantity: 1, unit_price: cleaningAmount, subtotal: cleaningAmount },
  }))

  const securityTier = tierForGuestCount(readRecord(config, 'required_fees', 'security')?.[rateTier], guestCount)
  const securityAmount = securityTier ? numberValue(securityTier.amount) : undefined
  if (securityAmount === undefined) errors.push(CONFIGURATION_ERROR)
  else {
    const officers = numberValue(securityTier?.officers)
    items.push(lineItem({
      id: 'required-security', category: 'Venue Services', description: 'Required security', unitPrice: securityAmount, required: true,
      detail: officers ? `${officers} officer${officers === 1 ? '' : 's'} required for this guest count` : undefined,
      pricingRuleId: `required_fees.security.${rateTier}`, paymentBucket: 'venue', quoteBreakdown: { quantity: 1, unit_price: securityAmount, subtotal: securityAmount },
    }))
  }

  if (requiresTableSetup(packageId)) {
    const setupAmount = readNumber(config, 'tables_and_chairs_setup', rateTier)
    if (setupAmount === undefined) {
      errors.push(CONFIGURATION_ERROR)
      warnings.push('Tables and chairs setup needs an approved pricing rule before this package can be published.')
    } else {
      items.push(lineItem({
        id: 'tables-chairs-setup', category: 'Venue Services', description: 'Tables & chairs setup', unitPrice: setupAmount,
        included: setupAmount === 0, required: true, pricingRuleId: `tables_and_chairs_setup.${rateTier}`, paymentBucket: 'venue',
        quoteBreakdown: { quantity: 1, unit_price: setupAmount, subtotal: setupAmount },
      }))
    }
  } else {
    items.push(lineItem({
      id: 'tables-chairs-setup', category: 'What’s Included', description: 'Tables & chairs setup', unitPrice: 0,
      included: true, required: true, isChecklistItem: true, detail: `Included with ${PACKAGE_NAMES[packageId]}`,
    }))
  }

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

  const subtotal = rounded(items.reduce((sum, item) => sum + Number(item.total || 0), 0))
  const promotionTerms = promotionFromOptions(input.promotion)
  const discountAmount = promotionTerms
    ? promotionTerms.discount_type === 'fixed'
      ? Math.min(subtotal, promotionTerms.value)
      : Math.min(subtotal, rounded(subtotal * promotionTerms.value / 100))
    : 0
  const promotion = promotionTerms && discountAmount > 0
    ? { ...promotionTerms, amount: discountAmount } satisfies LuxorProposalPromotionSnapshot
    : undefined
  if (promotion) {
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
  const paymentCount = paymentPlan ? Number(paymentPlan.payment_count) : null
  const amountDueToBook = paymentPlan
    ? paymentPlan.mode === 'pay_in_full'
      ? total
      : paymentCount !== null && paymentCount <= 3
        ? venueServicesTotal
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

export function calculateLuxorProposal(
  selection: LuxorProposalSelection,
  config: LuxorProposalPricingConfig = LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG,
  options: LuxorProposalCalculationOptions = {},
): LuxorProposalCalculation {
  const selectedPackageId = normalizePackageId(selection.packageId)
  const eventDate = typeof selection.eventDate === 'string' ? selection.eventDate : ''
  const guestCount = Math.floor(numberValue(selection.guestCount) || 0)
  const requestedRentalPeriod = normalizeRentalPeriod(selection.rentalPeriod)
  const baseErrors: string[] = []
  const baseWarnings: string[] = []
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
  const paymentPlan = planFromSelection(selection)
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
    final_event_price: selected.finalEventPrice,
    tax_rate: selected.taxRate,
    refundable_security_deposit: securityDeposit || 750,
    payment_policy_acknowledged: selection.paymentPolicyAcknowledged === true || selection.payment_policy_acknowledged === true,
    amount_due_to_book: selected.amountDueToBook,
    ...(paymentPlan ? { payment_plan: paymentPlan } : {}),
    pricing_selection: {
      packageId: selected.id,
      eventDate,
      guestCount,
      rentalPeriod: safePeriod,
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

export const calculateLuxorProposalPricing = calculateLuxorProposal
