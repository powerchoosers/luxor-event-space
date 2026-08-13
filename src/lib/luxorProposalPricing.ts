import type { LuxorInvoiceLineItem, LuxorProposalContext, LuxorProposalPaymentPlan } from './luxorInquiryTypes'

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
  rateTier: 'retail' | 'all_inclusive'
  available: boolean
  total: number | null
  lineItems: LuxorInvoiceLineItem[]
  error?: string
}

export type LuxorProposalSelection = {
  packageId?: LuxorProposalPackageId | string | null
  eventDate?: string | null
  guestCount?: number | string | null
  eventType?: string | null
  rentalPeriod?: LuxorRentalPeriod | string | null
  addOns?: string[] | null
  discountType?: 'percent' | 'fixed' | string | null
  discountValue?: number | string | null
  discountApproved?: boolean | null
  taxRate?: number | string | null
  paymentPlan?: Partial<LuxorProposalPaymentPlan> | Record<string, unknown> | null
  adminOverride?: boolean | null
  bartenderAdditionalHours?: number | string | null
  bartenderStaffCount?: number | string | null
  customItems?: LuxorProposalCustomItem[] | null
  custom_items?: LuxorProposalCustomItem[] | null
  [key: string]: unknown
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
    morning: { start: '09:00', end: '16:00', hours: 7 },
    evening: { start: '18:00', end: '01:00', hours: 7 },
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
  // Rental Only and Bronze packages. Keeping it explicit here prevents the
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
  rental_only: 'Rental Only',
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
  { id: 'essential_decor', label: 'Essential Decor', category: 'Decor' },
  { id: 'full_decor', label: 'Full Decor & Planning', category: 'Decor' },
  { id: 'buffet_catering', label: 'Buffet catering', category: 'Catering' },
  { id: 'plated_catering', label: 'Plated catering', category: 'Catering' },
  { id: 'dj', label: 'DJ (6 hours)', category: 'Entertainment' },
  { id: 'photo_booth_signature', label: 'Signature Photo Booth', category: 'Photo booth' },
  { id: 'photo_booth_celebration', label: 'Celebration Photo Booth', category: 'Photo booth' },
  { id: 'photo_booth_forever', label: 'Forever Photo Booth', category: 'Photo booth' },
  { id: 'bartender_service', label: 'Bartender service', category: 'Bar' },
  { id: 'byob_signature', label: 'Signature BYOB bar', category: 'Bar' },
  { id: 'byob_premium', label: 'Premium BYOB bar', category: 'Bar' },
  { id: 'byob_non_alcoholic', label: 'Non-alcoholic bar package', category: 'Bar' },
] as const

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
  if (normalized === 'rentalonly' || normalized === 'rentonly' || normalized === 'venue') return 'rental_only'
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
    pricingRole: input.pricingRole || (input.included ? 'included' : input.required ? 'required' : 'add_on'),
    paymentBucket: 'event' as const,
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
    }))
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
}) {
  const { packageId, selection, config, eventDate, guestCount, requestedRentalPeriod, securityDeposit, paymentPlan, taxRate, customItems } = input
  const errors: string[] = []
  const warnings: string[] = []
  const items: LuxorInvoiceLineItem[] = []
  const allInclusive = packageId === 'gold_all_inclusive'
  const rateTier = allInclusive ? 'all_inclusive' : 'retail'
  const selectedAddOns = [...new Set(array(selection.addOns).map(normalizeAddOn).filter((value): value is string => Boolean(value)))]
  const included = new Set<string>()
  let rentalPeriod = requestedRentalPeriod

  if (packageId === 'silver_premier' || packageId === 'gold_all_inclusive') {
    rentalPeriod = 'full_day'
    if (requestedRentalPeriod !== 'full_day') warnings.push('Full Decor and Gold packages use full-day venue access: 8 event hours plus 4 hours for setup and breakdown.')
  }

  const rentalGroup = dateRateGroup(eventDate)
  const rentalAmount = rentalGroup ? readNumber(config, 'rental_rates', rentalGroup, rentalPeriod) : undefined
  if (rentalAmount === undefined) {
    errors.push(CONFIGURATION_ERROR)
  } else {
    const accessDetail = rentalPeriod === 'full_day' && (packageId === 'silver_premier' || packageId === 'gold_all_inclusive')
      ? '8 hours of event access plus 4 hours for setup and breakdown'
      : rentalPeriod === 'morning' ? '9:00 AM–4:00 PM access' : rentalPeriod === 'evening' ? '6:00 PM–1:00 AM access' : '11:00 AM–11:00 PM access'
    items.push(lineItem({ id: 'venue-rental', category: 'Venue Services', description: 'Venue rental', unitPrice: rentalAmount, required: true, detail: accessDetail }))
  }

  const cleaningTier = tierForGuestCount(readRecord(config, 'required_fees', 'cleaning')?.[rateTier], guestCount)
  const cleaningAmount = cleaningTier ? numberValue(cleaningTier.amount) : undefined
  if (cleaningAmount === undefined) errors.push(CONFIGURATION_ERROR)
  else items.push(lineItem({ id: 'required-cleaning', category: 'Venue Services', description: 'Required cleaning', unitPrice: cleaningAmount, required: true }))

  const securityTier = tierForGuestCount(readRecord(config, 'required_fees', 'security')?.[rateTier], guestCount)
  const securityAmount = securityTier ? numberValue(securityTier.amount) : undefined
  if (securityAmount === undefined) errors.push(CONFIGURATION_ERROR)
  else {
    const officers = numberValue(securityTier?.officers)
    items.push(lineItem({
      id: 'required-security',
      category: 'Venue Services',
      description: 'Required security',
      unitPrice: securityAmount,
      required: true,
      detail: officers ? String(officers) + ' officer' + (officers === 1 ? '' : 's') + ' required for this guest count' : undefined,
    }))
  }

  if (requiresTableSetup(packageId)) {
    const setupAmount = readNumber(config, 'tables_and_chairs_setup', rateTier)
    if (setupAmount === undefined) {
      errors.push(CONFIGURATION_ERROR)
      warnings.push('Tables and chairs setup needs an approved pricing rule before this package can be published.')
    } else {
      items.push(lineItem({ id: 'tables-chairs-setup', category: 'Venue Services', description: 'Tables & chairs setup', unitPrice: setupAmount, included: setupAmount === 0, required: true }))
    }
  } else {
    items.push(lineItem({ id: 'tables-chairs-setup', category: 'What’s Included', description: 'Tables & chairs setup', unitPrice: 0, included: true, required: true }))
  }

  const decorKind = packageId === 'bronze_essentials' ? 'essential'
    : packageId === 'silver_premier' || packageId === 'gold_all_inclusive' ? 'full'
      : null
  const cateringIncluded = packageId !== 'rental_only'
  const djIncluded = packageId !== 'rental_only'
  const photoIncluded = packageId === 'silver_premier' || packageId === 'gold_all_inclusive'
  const bartenderIncluded = packageId === 'gold_all_inclusive'

  const addDecor = (kind: 'essential' | 'full', wasIncluded: boolean) => {
    const configKey = kind === 'essential' ? 'essential' : 'full_decor_and_planning'
    const amount = readNumber(config, 'decor', configKey, rateTier)
    if (amount === undefined) {
      errors.push(CONFIGURATION_ERROR)
      return
    }
    const description = kind === 'essential' ? 'Essential Decor' : 'Full Decor & Planning'
    items.push(lineItem({ id: kind === 'essential' ? 'essential-decor' : 'full-decor', category: 'Event Services', description, unitPrice: amount, included: wasIncluded, detail: wasIncluded ? 'Included with ' + PACKAGE_NAMES[packageId] : 'Optional upgrade' }))
    addDecorInclusions(items, kind, packageId, wasIncluded)
    const tablesNeeded = Math.ceil(guestCount / (readNumber(config, 'tables', 'guests_per_table') || 10))
    const includedTables = readNumber(config, 'tables', 'included_tables') ?? 0
    const extraTables = Math.max(0, tablesNeeded - includedTables)
    const tableRateKey = kind === 'essential' ? 'essential_decor' : 'full_decor_and_planning'
    const tableRate = readNumber(config, 'tables', 'additional_table_rates', tableRateKey, rateTier)
    if (extraTables > 0) {
      if (tableRate === undefined) errors.push(CONFIGURATION_ERROR)
      else items.push(lineItem({ id: 'additional-tables-' + kind, category: 'Event Services', description: 'Additional guest tables', quantity: extraTables, unitPrice: tableRate, required: true, detail: String(tablesNeeded) + ' tables required for ' + String(guestCount) + ' guests' }))
    }
  }

  const addCatering = (style: 'buffet' | 'plated', wasIncluded: boolean) => {
    const perGuest = readNumber(config, 'catering', style, rateTier + '_per_guest')
    if (perGuest === undefined) {
      errors.push(CONFIGURATION_ERROR)
      return
    }
    items.push(lineItem({
      id: style === 'buffet' ? 'buffet-catering' : 'plated-catering',
      category: 'Event Services',
      description: style === 'buffet' ? 'Buffet catering' : 'Plated catering',
      quantity: guestCount,
      unitPrice: perGuest,
      included: wasIncluded,
      detail: String(guestCount) + ' guests at the configured per-guest rate',
    }))
  }

  const addDj = (wasIncluded: boolean) => {
    const amount = readNumber(config, 'dj', rateTier)
    if (amount === undefined) errors.push(CONFIGURATION_ERROR)
    else items.push(lineItem({ id: 'dj', category: 'Event Services', description: 'DJ (6 hours)', unitPrice: amount, included: wasIncluded, detail: wasIncluded ? 'Included with ' + PACKAGE_NAMES[packageId] : 'Optional upgrade' }))
  }

  const addPhotoBooth = (tier: 'signature_experience' | 'celebration_experience' | 'forever_experience', wasIncluded: boolean) => {
    const amount = readNumber(config, 'photo_booth', tier, rateTier)
    if (amount === undefined) {
      errors.push(CONFIGURATION_ERROR)
      return
    }
    const names = { signature_experience: 'Signature Photo Booth', celebration_experience: 'Celebration Photo Booth', forever_experience: 'Forever Photo Booth' }
    items.push(lineItem({ id: 'photo-booth-' + tier, category: 'Event Services', description: names[tier], unitPrice: amount, included: wasIncluded, detail: wasIncluded ? 'Included with ' + PACKAGE_NAMES[packageId] : 'Optional upgrade' }))
  }

  const addBartender = (wasIncluded: boolean) => {
    const tier = tierForGuestCount(readRecord(config, 'bartending', rateTier)?.staffing, guestCount)
    const amount = tier ? numberValue(tier.amount) : undefined
    if (amount === undefined) {
      errors.push(CONFIGURATION_ERROR)
      return
    }
    items.push(lineItem({ id: 'bartender-service', category: 'Event Services', description: 'Bartender service (up to 5 hours)', unitPrice: amount, included: wasIncluded, detail: wasIncluded ? 'Included with ' + PACKAGE_NAMES[packageId] : 'Optional upgrade' }))
    const additionalHours = Math.max(0, Math.floor(numberValue(selection.bartenderAdditionalHours) || 0))
    if (additionalHours > 0) {
      const staffCount = numberValue(selection.bartenderStaffCount)
      const hourlyRate = readNumber(config, 'bartending', rateTier, 'additional_hour_per_bartender')
      if (!staffCount || staffCount < 1 || hourlyRate === undefined) {
        errors.push(CONFIGURATION_ERROR)
        warnings.push('Additional bartender hours require an approved bartender staffing count.')
      } else {
        items.push(lineItem({ id: 'bartender-additional-hours', category: 'Event Services', description: 'Additional bartender hours', quantity: additionalHours * staffCount, unitPrice: hourlyRate, detail: String(additionalHours) + ' additional hours × ' + String(staffCount) + ' bartender(s)' }))
      }
    }
  }

  const addBar = (kind: 'signature_byob' | 'premium_byob' | 'non_alcoholic') => {
    const bar = readRecord(config, 'bartending', rateTier, 'bars', kind)
    const perGuest = numberValue(bar?.per_guest)
    const minimum = numberValue(bar?.minimum)
    if (perGuest === undefined || minimum === undefined) {
      errors.push(CONFIGURATION_ERROR)
      return
    }
    const amount = Math.max(rounded(guestCount * perGuest), minimum)
    const name = kind === 'signature_byob' ? 'Signature BYOB bar package' : kind === 'premium_byob' ? 'Premium BYOB bar package' : 'Non-Alcoholic bar package'
    items.push(lineItem({ id: 'bar-' + kind, category: 'Event Services', description: name, unitPrice: amount, detail: 'Guest-count price with configured minimum' }))
  }

  const decorChoices = selectedAddOns.filter((item) => item === 'essential_decor' || item === 'full_decor')
  const cateringChoices = selectedAddOns.filter((item) => item === 'buffet_catering' || item === 'plated_catering')
  const blockedAddOns = new Set<string>()

  if (decorChoices.length > 1) {
    errors.push('Choose either Essential Decor or Full Decor & Planning, not both.')
    decorChoices.forEach((choice) => blockedAddOns.add(choice))
  }
  if (cateringChoices.length > 1) {
    errors.push('Choose either buffet or plated catering, not both.')
    cateringChoices.forEach((choice) => blockedAddOns.add(choice))
  }

  const includedDecorId = decorKind === 'essential'
    ? 'essential_decor'
    : decorKind === 'full'
      ? 'full_decor'
      : null
  const replacementDecor = includedDecorId
    ? decorChoices.find((choice) => choice !== includedDecorId)
    : null
  if (replacementDecor) {
    const replacementName = replacementDecor === 'essential_decor' ? 'Essential Decor' : 'Full Decor & Planning'
    errors.push(`${CONFIGURATION_ERROR} ${replacementName} cannot be added on top of the included ${decorKind === 'essential' ? 'Essential Decor' : 'Full Decor & Planning'} without an approved replacement rule.`)
    blockedAddOns.add(replacementDecor)
  }

  const replacementCatering = cateringIncluded
    ? cateringChoices.find((choice) => choice !== 'buffet_catering')
    : null
  if (replacementCatering) {
    errors.push(`${CONFIGURATION_ERROR} Plated catering cannot be added on top of the included buffet catering without an approved replacement rule.`)
    blockedAddOns.add(replacementCatering)
  }

  if (decorKind) {
    addDecor(decorKind, true)
    included.add(decorKind === 'essential' ? 'essential_decor' : 'full_decor')
  }
  if (cateringIncluded) {
    addCatering('buffet', true)
    included.add('buffet_catering')
  }
  if (djIncluded) {
    addDj(true)
    included.add('dj')
  }
  if (photoIncluded) {
    addPhotoBooth('signature_experience', true)
    included.add('photo_booth_signature')
  }
  if (bartenderIncluded) {
    addBartender(true)
    included.add('bartender_service')
  }

  const photoChoices = selectedAddOns.filter((item) => item.startsWith('photo_booth_'))
  if (photoChoices.length > 1) {
    errors.push('Choose only one photo booth option for this proposal.')
  }
  const barChoices = selectedAddOns.filter((item) => item.startsWith('byob_'))
  if (barChoices.length > 1) errors.push('Choose only one bar package unless an administrator has approved an exception.')

  for (const addOn of selectedAddOns) {
    if (blockedAddOns.has(addOn)) continue
    if (included.has(addOn)) {
      warnings.push('' + addOn.replaceAll('_', ' ') + ' is already included and was not charged twice.')
      continue
    }
    if (addOn === 'essential_decor') addDecor('essential', false)
    else if (addOn === 'full_decor') addDecor('full', false)
    else if (addOn === 'buffet_catering') addCatering('buffet', false)
    else if (addOn === 'plated_catering') addCatering('plated', false)
    else if (addOn === 'dj') addDj(false)
    else if (addOn === 'photo_booth_signature') addPhotoBooth('signature_experience', false)
    else if (addOn === 'photo_booth_celebration') addPhotoBooth('celebration_experience', false)
    else if (addOn === 'photo_booth_forever') addPhotoBooth('forever_experience', false)
    else if (addOn === 'bartender_service') addBartender(false)
    else if (addOn === 'byob_signature') addBar('signature_byob')
    else if (addOn === 'byob_premium') addBar('premium_byob')
    else if (addOn === 'byob_non_alcoholic') addBar('non_alcoholic')
  }

  // Custom items are owner-entered, but their arithmetic is still calculated
  // here and preserved in the immutable proposal snapshot. They are never
  // treated as a package-rate exception or a client-editable price.
  items.push(...customItems)

  const subtotal = rounded(items.reduce((sum, item) => sum + Number(item.total || 0), 0))
  const nestedDiscount = record(selection.discount)
  const requestedDiscount = Math.max(0, numberValue(selection.discountValue ?? nestedDiscount?.value) || 0)
  const discountType = selection.discountType === 'fixed' || nestedDiscount?.type === 'fixed' ? 'fixed' : 'percent'
  const discountIsApproved = requestedDiscount <= 0 || selection.discountApproved === true || nestedDiscount?.approved === true
  if (requestedDiscount > 0 && !discountIsApproved) errors.push('An approved discount is required before it can be included in a final proposal.')
  const discountAmount = discountIsApproved
    ? discountType === 'fixed' ? Math.min(subtotal, requestedDiscount) : Math.min(subtotal, rounded(subtotal * Math.min(100, requestedDiscount) / 100))
    : 0
  if (discountAmount > 0) items.push(lineItem({ id: 'approved-discount', category: 'Approved Discount', description: 'Approved discount', unitPrice: -discountAmount, pricingRole: 'discount', detail: discountType === 'fixed' ? 'Approved fixed adjustment' : 'Approved ' + String(requestedDiscount) + '% adjustment' }))
  const taxableAmount = Math.max(0, rounded(subtotal - discountAmount))
  const taxAmount = rounded(taxableAmount * Math.max(0, taxRate))
  if (taxAmount > 0) items.push(lineItem({ id: 'sales-tax', category: 'Tax', description: 'Sales tax', unitPrice: taxAmount, pricingRole: 'tax' }))
  const total = rounded(subtotal - discountAmount + taxAmount)
  const amountDueToBook = paymentPlan
    ? paymentPlan.mode === 'pay_in_full' ? total : rounded(total * paymentPlan.booking_payment_percent / 100)
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
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
  } satisfies PackageCalculation
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
    customItems: [],
    custom_items: [],
    discountType: 'percent',
    discountValue: 0,
    discountApproved: true,
    taxRate: 0,
    paymentPlan: null,
  }
  const base = calculatePackage({ ...input, selection: quoteSelection, paymentPlan: null, taxRate: 0, customItems: [] })
  const baseError = base.errors[0]

  return ADD_ON_QUOTE_OPTIONS.map((option): LuxorProposalAddOnQuote => {
    if (baseError) {
      return {
        ...option,
        rateTier,
        available: false,
        total: null,
        lineItems: [],
        error: baseError,
      }
    }

    const quoted = calculatePackage({
      ...input,
      selection: { ...quoteSelection, addOns: [option.id] },
      paymentPlan: null,
      taxRate: 0,
      customItems: [],
    })
    const quoteError = quoted.errors.find((error) => !base.errors.includes(error))
    const lineItems = addedLineItems(base.lineItems, quoted.lineItems)
    const total = rounded(quoted.subtotal - base.subtotal)

    if (quoteError) {
      return {
        ...option,
        rateTier,
        available: false,
        total: null,
        lineItems: [],
        error: quoteError,
      }
    }
    if (total <= 0 || !lineItems.length) {
      return {
        ...option,
        rateTier,
        available: false,
        total: 0,
        lineItems: [],
        error: 'Included with the selected package.',
      }
    }

    return { ...option, rateTier, available: true, total, lineItems }
  })
}

export function calculateLuxorProposal(selection: LuxorProposalSelection, config: LuxorProposalPricingConfig = LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG): LuxorProposalCalculation {
  const selectedPackageId = normalizePackageId(selection.packageId)
  const eventDate = typeof selection.eventDate === 'string' ? selection.eventDate : ''
  const guestCount = Math.floor(numberValue(selection.guestCount) || 0)
  const requestedRentalPeriod = normalizeRentalPeriod(selection.rentalPeriod)
  const baseErrors: string[] = []
  const baseWarnings: string[] = []
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
  const publicationErrors = paymentPlan ? [] : [PAYMENT_PLAN_REQUIRED]
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
    rental_period: selected.id === 'silver_premier' || selected.id === 'gold_all_inclusive' ? 'full_day' : safePeriod,
    event_access: selected.id === 'silver_premier' || selected.id === 'gold_all_inclusive'
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
    amount_due_to_book: selected.amountDueToBook,
    ...(paymentPlan ? { payment_plan: paymentPlan } : {}),
    pricing_selection: {
      packageId: selected.id,
      eventDate,
      guestCount,
      rentalPeriod: safePeriod,
      addOns: array(selection.addOns).filter((item): item is string => typeof item === 'string'),
      discountType: selection.discountType === 'fixed' ? 'fixed' : 'percent',
      discountValue: Math.max(0, numberValue(selection.discountValue ?? record(selection.discount)?.value) || 0),
      discountApproved: Math.max(0, numberValue(selection.discountValue ?? record(selection.discount)?.value) || 0) <= 0 || selection.discountApproved === true || record(selection.discount)?.approved === true,
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
  }
  const snapshot = {
    schema_version: 1,
    calculated_at: new Date().toISOString(),
    selection: finalContext.pricing_selection,
    pricing_config: config,
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
    proposalContext: finalContext,
    context: finalContext,
    snapshot,
  }
}

export const calculateLuxorProposalPricing = calculateLuxorProposal
