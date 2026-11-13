import {
  calculateLuxorProposal,
  withLuxorProposalPricingPolicyVersion,
  type LuxorProposalCalculation,
  type LuxorProposalPricingConfig,
  type LuxorProposalSelection,
  type LuxorRentalPeriod,
} from '@/lib/luxorProposalPricing'
import type { LuxorInvoiceLineItem, LuxorProposalPaymentPlan } from '@/lib/luxorInquiryTypes'
import {
  LUXOR_PUBLIC_PACKAGE_TIER_IDS,
  normalizeLuxorProposalPackageTierId,
  type LuxorPublicPackageTierId,
} from '@/lib/luxorProposalPackages'
import { readLuxorDecorCatalog, type LuxorDecorCatalogItem } from '@/lib/luxorDecorCatalogV2'
import { calculateLuxorPaymentSchedule } from '@/lib/luxorPaymentSchedule'
import { RENTAL_WINDOWS } from '@/lib/luxorProposalTerms'
import { LUXOR_MAX_GUESTS } from '@/lib/luxorInquiryTypes'

export const PUBLIC_PACKAGES_CONFIGURATOR_SCHEMA_VERSION = 1

export type PublicPackagesRentalPeriod = Exclude<LuxorRentalPeriod, 'custom'>

export type PublicPackagesConfiguratorInput = {
  eventDate: string
  eventType?: string | null
  guestCount: number
  rentalPeriod: PublicPackagesRentalPeriod
  packageTierId: LuxorPublicPackageTierId
  decorAddOnQuantities?: Record<string, number>
  browserTimeZone?: string
}

export type PublicPackagesSummaryLine = {
  id: string
  label: string
  amount: number
  obligation: 'mandatory' | 'optional'
  category: 'venue' | 'package' | 'cleaning' | 'security' | 'enhancement' | 'other' | 'tax' | 'total' | 'deposit' | 'reserve' | 'balance' | 'schedule'
  detail?: string
}

export type PublicPackagesQuote = {
  schemaVersion: typeof PUBLIC_PACKAGES_CONFIGURATOR_SCHEMA_VERSION
  selection: LuxorProposalSelection
  calculation: LuxorProposalCalculation
  packageCalculation: LuxorProposalCalculation['packages'][number] | null
  summaryLines: PublicPackagesSummaryLine[]
  totals: {
    subtotalExTax: number | null
    taxAmount: number
    totalEstimate: number | null
    refundableSecurityDeposit: number
    amountToReserve: number | null
    remainingBalance: number | null
  }
  paymentSchedulePreview: PublicPackagesPaymentSchedulePreview
  enhancementOptions: PublicPackagesEnhancementOption[]
  errors: string[]
  pricingConfigVersion?: number | null
}

export type PublicPackagesPaymentScheduleRow = {
  id: string
  label?: string
  description: string
  dueDate: string | null
  amount: number
}

export type PublicPackagesPaymentSchedulePreview = {
  finalEventBalance: number | null
  amountDueAfterSignature: number | null
  finalPaymentDueDate: string | null
  rows: PublicPackagesPaymentScheduleRow[]
  errors: string[]
}

export type PublicPackagesEnhancementOption = {
  id: string
  name: string
  description: string
  category: string
  amount: number
  minimumQuantity: number
  pricingUnit: string
  includedWithPackage: boolean
}

const DEFAULT_GUEST_OPTIONS = [50, 75, 100, 125, 150, 175, 180] as const

const RENTAL_PERIOD_OPTIONS: PublicPackagesRentalPeriod[] = ['morning', 'evening', 'full_day']

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readNumber(root: unknown, ...path: string[]) {
  let current: unknown = root
  for (const key of path) {
    current = record(current)?.[key]
  }
  const next = typeof current === 'number' ? current : typeof current === 'string' ? Number(current) : NaN
  return Number.isFinite(next) ? next : undefined
}

export function defaultPublicPackagesPaymentPlan(config: LuxorProposalPricingConfig): LuxorProposalPaymentPlan {
  const luxor = record(config.luxor_costs) || config
  const bookingAmount = readNumber(luxor, 'booking_payment', 'amount')
  const percent = readNumber(luxor, 'booking_payment', 'percent') ?? 25
  return {
    mode: 'deposit_and_balance',
    booking_payment_percent: percent,
    final_payment_due_days_before_event: 60,
    payment_count: 4,
    payment_cadence: 'evenly_spaced',
    ...(bookingAmount !== undefined ? { booking_payment_amount: bookingAmount } : {}),
  }
}

export function listPublicPackageGuestCountOptions(config: LuxorProposalPricingConfig) {
  const luxor = record(config.luxor_costs) || config
  const min = Math.max(1, Math.floor(readNumber(luxor, 'guest_count', 'minimum') ?? 1))
  const max = Math.min(LUXOR_MAX_GUESTS, Math.floor(readNumber(luxor, 'guest_count', 'maximum') ?? LUXOR_MAX_GUESTS))
  const tierMids = new Set<number>()
  const cleaning = record(record(luxor)?.required_fees)?.cleaning
  const retailTiers = Array.isArray(record(cleaning)?.retail) ? record(cleaning)?.retail as unknown[] : []
  for (const tier of retailTiers) {
    const row = record(tier)
    const minGuests = Math.floor(Number(row?.min_guests))
    const maxGuests = Math.floor(Number(row?.max_guests))
    if (Number.isInteger(minGuests) && Number.isInteger(maxGuests)) {
      tierMids.add(Math.min(max, Math.max(min, Math.round((minGuests + maxGuests) / 2))))
    }
  }
  const merged = [...new Set([...DEFAULT_GUEST_OPTIONS, ...tierMids])]
    .filter((value) => value >= min && value <= max)
    .sort((left, right) => left - right)
  return merged.length ? merged : [min, max].filter((value, index, array) => array.indexOf(value) === index)
}

function buildPublicPackagesPaymentSchedulePreview(
  input: PublicPackagesConfiguratorInput,
  calculation: LuxorProposalCalculation,
  packageCalculation: LuxorProposalCalculation['packages'][number] | null,
  paymentPlan: LuxorProposalPaymentPlan,
): PublicPackagesPaymentSchedulePreview {
  const finalEventPrice = packageCalculation?.finalEventPrice ?? calculation.finalEventPrice
  const venueServicesTotal = typeof calculation.context?.venue_services_total === 'number'
    ? calculation.context.venue_services_total
    : finalEventPrice
  const eventServicesTotal = typeof calculation.context?.event_services_total === 'number'
    ? calculation.context.event_services_total
    : 0
  if (finalEventPrice === null || venueServicesTotal === null || venueServicesTotal === undefined) {
    return { finalEventBalance: null, amountDueAfterSignature: null, finalPaymentDueDate: null, rows: [], errors: ['Complete event details to calculate the payment schedule.'] }
  }
  const scheduledVenueTotal = Math.min(venueServicesTotal, finalEventPrice)
  const scheduledEventTotal = Math.max(0, finalEventPrice - scheduledVenueTotal)
  const schedule = calculateLuxorPaymentSchedule({
    eventDate: input.eventDate,
    bookingDate: new Date().toISOString().slice(0, 10),
    venueServicesTotal: scheduledVenueTotal,
    eventServicesTotal: scheduledEventTotal,
    paymentCount: paymentPlan.payment_count ?? 4,
    paymentCadence: paymentPlan.payment_cadence,
    bookingPaymentAmount: paymentPlan.booking_payment_amount,
  })
  if (!schedule) {
    return { finalEventBalance: null, amountDueAfterSignature: null, finalPaymentDueDate: null, rows: [], errors: ['The selected payment schedule cannot meet the final-payment deadline.'] }
  }
  return {
    finalEventBalance: schedule.remaining_event_balance,
    amountDueAfterSignature: schedule.booking_payment,
    finalPaymentDueDate: schedule.final_payment_due_date,
    rows: schedule.rows.map((row) => ({
      id: `installment-${row.installment_order}`,
      label: row.label,
      description: row.description,
      dueDate: row.due_at?.slice(0, 10) || null,
      amount: row.amount,
    })),
    errors: schedule.warnings,
  }
}

export function listPublicPackageRentalPeriodOptions(locale: 'en' | 'es' = 'en') {
  const labels: Record<PublicPackagesRentalPeriod, { en: string; es: string }> = {
    morning: {
      en: `Morning (${formatWindowLabel('morning')})`,
      es: `Mañana (${formatWindowLabel('morning')})`,
    },
    evening: {
      en: `Evening (${formatWindowLabel('evening')})`,
      es: `Noche (${formatWindowLabel('evening')})`,
    },
    full_day: {
      en: `Full day (${formatWindowLabel('full_day')})`,
      es: `Día completo (${formatWindowLabel('full_day')})`,
    },
  }
  return RENTAL_PERIOD_OPTIONS.map((value) => ({
    value,
    label: labels[value][locale],
    startTime: RENTAL_WINDOWS[value].start,
    endTime: RENTAL_WINDOWS[value].end,
  }))
}

function formatWindowLabel(period: PublicPackagesRentalPeriod) {
  const window = RENTAL_WINDOWS[period]
  return `${formatTimeLabel(window.start)} – ${formatTimeLabel(window.end)}`
}

function formatTimeLabel(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  const date = new Date(2000, 0, 1, hours, minutes)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

export function listPublicPackageEnhancementOptions(
  config: LuxorProposalPricingConfig,
  packageTierId: LuxorPublicPackageTierId,
): PublicPackagesEnhancementOption[] {
  const catalog = readLuxorDecorCatalog(config, false)
  return catalog
    .filter((item) => item.category === 'premium_add_ons' || item.category === 'signature_package_add_ons' || item.category === 'luxor_package_add_ons')
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      amount: item.amount,
      minimumQuantity: item.minimum_quantity,
      pricingUnit: item.pricing_unit,
      includedWithPackage: item.included_in_packages.includes(packageTierId),
    }))
}

export function buildLuxorProposalSelectionFromPublicInput(
  input: PublicPackagesConfiguratorInput,
  config: LuxorProposalPricingConfig,
): LuxorProposalSelection {
  const tier = normalizeLuxorProposalPackageTierId(input.packageTierId)
  if (!tier || !LUXOR_PUBLIC_PACKAGE_TIER_IDS.includes(tier as LuxorPublicPackageTierId)) {
    throw new Error('Choose Essentials, Signature, or Luxor.')
  }
  const window = RENTAL_WINDOWS[input.rentalPeriod]
  const paymentPlan = defaultPublicPackagesPaymentPlan(config)
  const quantities = Object.fromEntries(
    Object.entries(input.decorAddOnQuantities || {}).filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0),
  )
  return withLuxorProposalPricingPolicyVersion({
    packageTierId: tier,
    package_tier_id: tier,
    eventDate: input.eventDate,
    eventType: input.eventType?.trim() || null,
    guestCount: input.guestCount,
    rentalPeriod: input.rentalPeriod,
    guestArrivalTime: window.start,
    guest_arrival_time: window.start,
    eventEndTime: window.end,
    event_end_time: window.end,
    rentalStartTime: window.start,
    rental_start_time: window.start,
    rentalEndTime: window.end,
    rental_end_time: window.end,
    decorAddOnQuantities: quantities,
    decor_add_on_quantities: quantities,
    addOns: [],
    add_ons: [],
    paymentPlan,
    payment_plan: paymentPlan,
  }, 4)
}

function classifyLineItem(item: LuxorInvoiceLineItem): PublicPackagesSummaryLine['category'] {
  const id = String(item.id || '')
  if (id === 'venue-rental' || id.startsWith('venue-')) return 'venue'
  if (id.startsWith('package-fee-') || id.includes('package-fee')) return 'package'
  if (id.includes('cleaning')) return 'cleaning'
  if (id.includes('security')) return 'security'
  if (item.pricingRole === 'tax') return 'tax'
  if (id.startsWith('decor-') || item.category?.toLowerCase().includes('decor')) return 'enhancement'
  return 'other'
}

function lineObligation(item: LuxorInvoiceLineItem): 'mandatory' | 'optional' {
  if (item.pricingRole === 'tax' || item.pricingRole === 'required' || item.required) return 'mandatory'
  if (item.pricingRole === 'add_on' && item.costClassification !== 'preferred_vendor_estimate') return 'optional'
  if (item.pricingRole === 'included') return 'mandatory'
  return item.pricingRole === 'add_on' ? 'optional' : 'mandatory'
}

function summaryLinesFromPackage(
  pkg: NonNullable<LuxorProposalCalculation['packages'][number]>,
  calculation: LuxorProposalCalculation,
  input: PublicPackagesConfiguratorInput,
): PublicPackagesSummaryLine[] {
  const chargeable = pkg.lineItems.filter((item) => {
    if (item.isChecklistItem) return false
    if (item.pricingRole === 'included' && item.total === 0) return false
    if (item.pricingRole === 'discount' || item.pricingRole === 'tax_coverage') return false
  })
  const lines: PublicPackagesSummaryLine[] = chargeable.map((item) => ({
    id: String(item.id || item.description),
    label: item.description,
    amount: item.total,
    obligation: lineObligation(item),
    category: classifyLineItem(item),
    detail: item.detail,
  }))
  if (calculation.taxAmount > 0 && !lines.some((line) => line.category === 'tax')) {
    lines.push({
      id: 'sales-tax',
      label: 'Sales tax',
      amount: calculation.taxAmount,
      obligation: 'mandatory',
      category: 'tax',
    })
  }
  lines.push({
    id: 'total-estimate',
    label: 'Total estimate',
    amount: pkg.finalEventPrice ?? calculation.finalEventPrice ?? 0,
    obligation: 'mandatory',
    category: 'total',
  })
  lines.push({
    id: 'security-deposit',
    label: 'Refundable security deposit',
    amount: calculation.securityDepositAmount,
    obligation: 'mandatory',
    category: 'deposit',
    detail: 'Due before the event; separate from the event total.',
  })
  const amountToReserve = pkg.amountDueToBook ?? calculation.amountDueToBook
  if (amountToReserve !== null && amountToReserve !== undefined) {
    lines.push({
      id: 'amount-to-reserve',
      label: 'Amount to reserve',
      amount: amountToReserve,
      obligation: 'mandatory',
      category: 'reserve',
      detail: 'Non-refundable booking payment after agreement.',
    })
  }
  return lines
}

export function calculatePublicPackagesQuote(
  input: PublicPackagesConfiguratorInput,
  config: LuxorProposalPricingConfig,
  pricingConfigVersion?: number | null,
): PublicPackagesQuote {
  const selection = buildLuxorProposalSelectionFromPublicInput(input, config)
  const calculation = calculateLuxorProposal(selection, config)
  const tier = normalizeLuxorProposalPackageTierId(input.packageTierId)
  const packageCalculation = tier
    ? calculation.packages.find((item) => item.id === tier) || null
    : null
  const errors = [...new Set([
    ...calculation.calculationErrors,
    ...(packageCalculation?.errors || []),
    ...(packageCalculation?.finalEventPrice === null ? ['Pricing is unavailable for the selected package.'] : []),
  ])]
  const paymentSchedulePreview = buildPublicPackagesPaymentSchedulePreview(
    input,
    calculation,
    packageCalculation,
    selection.paymentPlan as LuxorProposalPaymentPlan,
  )
  const summaryLines = packageCalculation
    ? [
        ...summaryLinesFromPackage(packageCalculation, calculation, input),
        ...paymentSchedulePreview.rows.map((row) => ({
          id: row.id,
          label: row.label || row.description,
          amount: row.amount,
          obligation: 'mandatory' as const,
          category: 'schedule' as const,
          detail: row.dueDate ? `Due ${row.dueDate}` : row.description,
        })),
      ]
    : []
  const totalEstimate = packageCalculation?.finalEventPrice ?? calculation.finalEventPrice
  const amountToReserve = packageCalculation?.amountDueToBook ?? calculation.amountDueToBook
  const remainingBalance = paymentSchedulePreview.finalEventBalance
  const enhancementOptions = listPublicPackageEnhancementOptions(config, input.packageTierId)
  return {
    schemaVersion: PUBLIC_PACKAGES_CONFIGURATOR_SCHEMA_VERSION,
    selection,
    calculation,
    packageCalculation,
    summaryLines,
    totals: {
      subtotalExTax: totalEstimate === null ? null : Math.max(0, totalEstimate - calculation.taxAmount),
      taxAmount: calculation.taxAmount,
      totalEstimate,
      refundableSecurityDeposit: calculation.securityDepositAmount,
      amountToReserve,
      remainingBalance,
    },
    paymentSchedulePreview,
    enhancementOptions,
    errors,
    pricingConfigVersion: pricingConfigVersion ?? null,
  }
}

/** Proposal-builder parity: same selection object passed directly to calculateLuxorProposal. */
export function calculateProposalBuilderParityTotal(
  input: PublicPackagesConfiguratorInput,
  config: LuxorProposalPricingConfig,
) {
  const selection = buildLuxorProposalSelectionFromPublicInput(input, config)
  const calculation = calculateLuxorProposal(selection, config)
  const tier = normalizeLuxorProposalPackageTierId(input.packageTierId)
  const pkg = tier ? calculation.packages.find((item) => item.id === tier) : null
  return pkg?.finalEventPrice ?? calculation.finalEventPrice
}

export function publicPackagesSelectionForProposalConversion(quote: PublicPackagesQuote) {
  return {
    schema_version: PUBLIC_PACKAGES_CONFIGURATOR_SCHEMA_VERSION,
    pricing_selection: quote.calculation.context?.pricing_selection || quote.selection,
    line_items: quote.packageCalculation?.lineItems || quote.calculation.lineItems,
    totals: quote.totals,
    summary_lines: quote.summaryLines.filter((line) => !['total', 'deposit', 'reserve', 'schedule'].includes(line.category)),
    proposal_pricing_policy_version: 4,
    pricing_config_version: quote.pricingConfigVersion,
  }
}

export function serializePublicPackagesEnhancementCatalog(items: LuxorDecorCatalogItem[]) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    amount: item.amount,
    minimum_quantity: item.minimum_quantity,
    pricing_unit: item.pricing_unit,
    included_in_packages: item.included_in_packages,
  }))
}
