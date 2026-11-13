import {
  calculateLuxorProposal,
  type LuxorProposalPricingConfig,
  type LuxorRentalPeriod,
} from '@/lib/luxorProposalPricing'
import {
  getLuxorProposalPackageSettings,
  LUXOR_PUBLIC_PACKAGE_TIER_IDS,
  type LuxorPublicPackageTierId,
} from '@/lib/luxorProposalPackages'
import type { LuxorInvoiceLineItem } from '@/lib/luxorInquiryTypes'
import { RENTAL_WINDOWS } from '@/lib/luxorProposalTerms'

const WEEKEND_DAY_SCENARIOS = [
  { day: 'friday' as const, eventDate: '2026-10-23' },
  { day: 'saturday' as const, eventDate: '2026-10-24' },
  { day: 'sunday' as const, eventDate: '2026-10-25' },
]

const WEEKEND_RENTAL_PERIODS: LuxorRentalPeriod[] = ['morning', 'evening', 'full_day']

export type PublicPackageStartingPriceLine = {
  id: string
  description: string
  total: number
}

export type PublicPackageStartingPriceScenario = {
  day: 'friday' | 'saturday' | 'sunday'
  eventDate: string
  rentalPeriod: LuxorRentalPeriod
  guestCount: number
  totalExTax: number
  lineItems: PublicPackageStartingPriceLine[]
}

export type PublicPackageStartingPriceResult = {
  packageId: LuxorPublicPackageTierId
  startingPrice: number | null
  scenario: PublicPackageStartingPriceScenario | null
  unavailableReason?: string
}

export type PublicPackagesPricingSnapshot = {
  showCardPrices: boolean
  packages: PublicPackageStartingPriceResult[]
  pricingVersion: number | null
  unavailableReason?: string
}

export const PUBLIC_PACKAGES_STARTING_PRICE_FOOTNOTE = {
  en: 'Starting prices for Friday–Sunday events; final price depends on date, guests, and time.',
  es: 'Precios desde para eventos de viernes a domingo; el precio final depende de la fecha, los invitados y el horario.',
} as const

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function numberValue(value: unknown) {
  const next = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(next) ? next : null
}

function smallestGuestCountForPackage(config: LuxorProposalPricingConfig, packageId: LuxorPublicPackageTierId) {
  const luxor = record((config as Record<string, unknown>).luxor_costs) || (config as Record<string, unknown>)
  const configuredMin = numberValue(record(luxor?.guest_count)?.minimum) ?? 1
  const option = getLuxorProposalPackageSettings(config).options[packageId]
  if (!option.price_tiers.length) return Math.max(configuredMin, 1)
  const tierMin = Math.min(...option.price_tiers.map((tier) => tier.min_guests))
  return Math.max(configuredMin, tierMin, 1)
}

function pricingPolicyVersion(config: LuxorProposalPricingConfig) {
  const luxor = record((config as Record<string, unknown>).luxor_costs) || (config as Record<string, unknown>)
  const version = numberValue(luxor?.proposal_pricing_policy_version)
  return version && version >= 4 ? version : 4
}

function mandatoryLines(lineItems: LuxorInvoiceLineItem[]): PublicPackageStartingPriceLine[] {
  return lineItems
    .filter((item) => {
      if (item.pricingRole === 'tax' || item.pricingRole === 'discount' || item.pricingRole === 'included' || item.isChecklistItem) return false
      if (item.id?.startsWith('package-inclusions-')) return false
      if (item.paymentBucket === 'security_deposit') return false
      return item.pricingRole === 'required' || item.pricingRole === 'add_on' || item.id === 'venue-rental' || item.id?.startsWith('package-fee-')
    })
    .map((item) => ({
      id: String(item.id || item.description),
      description: item.description,
      total: item.total,
    }))
}

function scenarioTotalExTax(lineItems: LuxorInvoiceLineItem[]) {
  return Math.round(lineItems
    .filter((item) => item.pricingRole !== 'tax' && item.pricingRole !== 'discount' && !item.isChecklistItem)
    .reduce((sum, item) => sum + item.total, 0) * 100) / 100
}

export function assertPublicPackageStartingPriceConfig(config: LuxorProposalPricingConfig): string | null {
  if (config.pricing_mode !== 'venue_plus_preferred_vendor_estimates') {
    return 'Default pricing catalog must use venue_plus_preferred_vendor_estimates mode before public package starting prices can be calculated.'
  }
  return null
}

function defaultRentalTimes(rentalPeriod: LuxorRentalPeriod) {
  const window = RENTAL_WINDOWS[rentalPeriod as keyof typeof RENTAL_WINDOWS]
  return {
    guestArrivalTime: window?.start || '17:00',
    guest_arrival_time: window?.start || '17:00',
    eventEndTime: window?.end || '23:00',
    event_end_time: window?.end || '23:00',
  }
}

function calculateScenario(
  config: LuxorProposalPricingConfig,
  packageId: LuxorPublicPackageTierId,
  eventDate: string,
  rentalPeriod: LuxorRentalPeriod,
  guestCount: number,
) {
  const calculation = calculateLuxorProposal({
    packageTierId: packageId,
    package_tier_id: packageId,
    proposalPricingPolicyVersion: pricingPolicyVersion(config),
    proposal_pricing_policy_version: pricingPolicyVersion(config),
    eventDate,
    guestCount,
    rentalPeriod,
    taxRate: 0,
    addOns: [],
    add_ons: [],
    ...defaultRentalTimes(rentalPeriod),
  }, config)
  const pkg = calculation.packages.find((item) => item.id === packageId)
  if (!pkg) return { error: `Pricing engine did not return ${packageId}.`, pkg: null, calculation }
  const blockingErrors = [...new Set([...pkg.errors, ...calculation.calculationErrors])]
    .filter((error) => !/payment plan/i.test(error))
  if (pkg.finalEventPrice === null || blockingErrors.length) {
    return { error: blockingErrors[0] || `Pricing is unavailable for ${packageId}.`, pkg: null, calculation }
  }
  const lines = mandatoryLines(pkg.lineItems)
  const totalExTax = scenarioTotalExTax(pkg.lineItems)
  return { error: null, pkg, totalExTax, lines }
}

export function computePublicPackageWeekendStartingPrice(
  config: LuxorProposalPricingConfig,
  packageId: LuxorPublicPackageTierId,
): PublicPackageStartingPriceResult {
  const configError = assertPublicPackageStartingPriceConfig(config)
  if (configError) {
    return { packageId, startingPrice: null, scenario: null, unavailableReason: configError }
  }
  const guestCount = smallestGuestCountForPackage(config, packageId)
  let best: PublicPackageStartingPriceScenario | null = null
  let lastError: string | undefined
  for (const dayScenario of WEEKEND_DAY_SCENARIOS) {
    for (const rentalPeriod of WEEKEND_RENTAL_PERIODS) {
      const result = calculateScenario(config, packageId, dayScenario.eventDate, rentalPeriod, guestCount)
      if (result.error || result.totalExTax === undefined) {
        lastError = result.error || lastError
        continue
      }
      const candidate: PublicPackageStartingPriceScenario = {
        day: dayScenario.day,
        eventDate: dayScenario.eventDate,
        rentalPeriod,
        guestCount,
        totalExTax: result.totalExTax,
        lineItems: result.lines,
      }
      if (!best || candidate.totalExTax < best.totalExTax) best = candidate
    }
  }
  if (!best) {
    return {
      packageId,
      startingPrice: null,
      scenario: null,
      unavailableReason: lastError || `No Friday–Sunday starting price is available for ${packageId}.`,
    }
  }
  return { packageId, startingPrice: best.totalExTax, scenario: best }
}

export function buildPublicPackagesPricingSnapshot(
  config: LuxorProposalPricingConfig,
  pricingVersion: number | null,
): PublicPackagesPricingSnapshot {
  const configError = assertPublicPackageStartingPriceConfig(config)
  if (configError) {
    return {
      showCardPrices: false,
      packages: LUXOR_PUBLIC_PACKAGE_TIER_IDS.map((packageId) => ({
        packageId,
        startingPrice: null,
        scenario: null,
        unavailableReason: configError,
      })),
      pricingVersion,
      unavailableReason: configError,
    }
  }
  const packages = LUXOR_PUBLIC_PACKAGE_TIER_IDS.map((packageId) => computePublicPackageWeekendStartingPrice(config, packageId))
  const showCardPrices = packages.every((item) => item.startingPrice !== null)
  return {
    showCardPrices,
    packages,
    pricingVersion,
    unavailableReason: showCardPrices ? undefined : packages.find((item) => item.unavailableReason)?.unavailableReason,
  }
}
