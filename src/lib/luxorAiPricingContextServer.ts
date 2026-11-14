import 'server-only'

import { getDefaultLuxorProposalPricing } from './luxorProposalPricingServer'
import { buildPublicPricingDays } from './luxorPricingCatalog'
import { getLuxorCustomTimeRentalPolicyV4, type LuxorCustomTimeDayGroup } from './luxorCustomTimeRentalV4'
import { catalogValue } from './luxorPricingCatalog'
import { getLuxorProposalPackageSettings, LUXOR_PUBLIC_PACKAGE_TIER_IDS } from './luxorProposalPackages'

/** Only publishable rental rates and active package tiers are supplied to customer-facing generators. */
export async function getLuxorAiPricingContext(): Promise<string> {
  try {
    const pricing = await getDefaultLuxorProposalPricing()
    const days = buildPublicPricingDays(pricing.config)
    const packageSettings = getLuxorProposalPackageSettings(pricing.config)
    const activePackages = LUXOR_PUBLIC_PACKAGE_TIER_IDS.map((id) => {
      const opt = packageSettings.options[id]
      return {
        id: opt.id,
        name: opt.name,
        positioning: opt.positioning,
        summary: opt.summary,
        description: opt.description,
        price_tiers: opt.price_tiers,
      }
    })
    const customDays: Array<{ day: LuxorCustomTimeDayGroup; date: string }> = [
      { day: 'monday_thursday', date: '2026-10-19' }, { day: 'friday', date: '2026-10-23' },
      { day: 'saturday', date: '2026-10-24' }, { day: 'sunday', date: '2026-10-25' },
    ]
    const custom = process.env.LUXOR_CUSTOM_TIME_V4_READY === 'true' && process.env.LUXOR_CUSTOM_TIME_V4_BOOKING_GUARD_READY === 'true'
      ? customDays.flatMap(({ day, date }) => {
        if (catalogValue(pricing.config, 'luxor_costs', 'custom_time_rental_v4', day, 'show_publicly') !== true) return []
        const policy = getLuxorCustomTimeRentalPolicyV4(pricing.config, date)
        return policy ? [{ day, minimum_price: policy.minimum_price, minimum_hours: policy.minimum_hours }] : []
      }) : []
    const costs = pricing.config?.luxor_costs && typeof pricing.config.luxor_costs === 'object' ? pricing.config.luxor_costs as Record<string, unknown> : {}
    const bookingRecord = costs.booking_payment && typeof costs.booking_payment === 'object' ? costs.booking_payment as Record<string, unknown> : null
    const depositRecord = costs.security_deposit && typeof costs.security_deposit === 'object' ? costs.security_deposit as Record<string, unknown> : null
    const bookingPayment = typeof bookingRecord?.amount === 'number' ? bookingRecord.amount : null
    const securityDeposit = typeof depositRecord?.amount === 'number' ? depositRecord.amount : null
    if (!days.some((day) => day.options.length) && !custom.length) throw new Error('No public rental rates')
    return `ACTIVE PROPOSAL CATALOG CONTEXT — current approved Settings pricing and packages, version ${pricing.version}:
STANDARD DEPOSITS (from current Settings — state these when callers ask about reserving or deposits):
${JSON.stringify({
      initial_booking_payment_usd: bookingPayment,
      refundable_security_deposit_usd: securityDeposit,
      note: 'The initial booking payment reserves the date after agreement signing. The refundable security deposit is separate from package pricing.',
    })}
VENUE RENTAL DAYS:
${JSON.stringify(days)}
PACKAGES (single source of truth from portal Settings; do not use obsolete Bronze/Silver/Gold names):
${JSON.stringify(activePackages, null, 2)}
Public Custom Time starting prices (only when enabled and published): ${JSON.stringify(custom)}.
These are venue rental starting rates, package options, and time windows, not final event prices. Only quote a rate when its day, period and conditions match. Include hourly minimums when shown. You may quote the standard initial booking payment and refundable security deposit amounts from STANDARD DEPOSITS when asked. Do not say website or online prices may be outdated; current Settings and luxoratlaspalmas.com reflect the published catalog. Missing or non-public rates, custom time totals, fees, package totals, promotions, tax and availability are not established by this list: do not guess them. Do not calculate or promise a final quote; use the proposal builder and its server calculator. A client's accepted or locked proposal remains the authority for that specific existing agreement, not a new current-rate quote.`
  } catch {
    return 'ACTIVE PROPOSAL CATALOG CONTEXT: unavailable. Do not quote current prices from old emails, knowledge, examples or memory. Ask the Luxor team to confirm current pricing.'
  }
}
