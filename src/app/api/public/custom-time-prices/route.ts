import { NextResponse } from 'next/server'
import { getDefaultLuxorProposalPricing } from '@/lib/luxorProposalPricingServer'
import { getLuxorCustomTimeRentalPolicyV4, validateLuxorCustomTimeRentalV4Config, type LuxorCustomTimeDayGroup } from '@/lib/luxorCustomTimeRentalV4'

export const dynamic = 'force-dynamic'

const DAYS: Array<{ day: LuxorCustomTimeDayGroup; label: string; date: string }> = [
  { day: 'monday_thursday', label: 'Monday–Thursday', date: '2026-10-19' },
  { day: 'friday', label: 'Friday', date: '2026-10-23' },
  { day: 'saturday', label: 'Saturday', date: '2026-10-24' },
  { day: 'sunday', label: 'Sunday', date: '2026-10-25' },
]

export async function GET() {
  if (process.env.LUXOR_CUSTOM_TIME_V4_READY !== 'true' || process.env.LUXOR_CUSTOM_TIME_V4_BOOKING_GUARD_READY !== 'true') {
    return NextResponse.json({ prices: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
  try {
    const { config } = await getDefaultLuxorProposalPricing()
    const root = config as Record<string, unknown>
    const costs = root.luxor_costs && typeof root.luxor_costs === 'object' ? root.luxor_costs as Record<string, unknown> : root
    const dayConfig = costs.custom_time_rental_v4 && typeof costs.custom_time_rental_v4 === 'object'
      ? costs.custom_time_rental_v4 as Record<string, unknown>
      : {}
    const prices = DAYS.flatMap(({ day, label, date }) => {
      const value = dayConfig[day]
      if (!value || typeof value !== 'object' || Array.isArray(value) || (value as Record<string, unknown>).show_publicly !== true) return []
      if (validateLuxorCustomTimeRentalV4Config({ custom_time_rental_v4: { [day]: value } }).length) return []
      const policy = getLuxorCustomTimeRentalPolicyV4(config, date)
      return policy ? [{ day, label, minimum_price: policy.minimum_price, minimum_hours: policy.minimum_hours }] : []
    })
    return NextResponse.json({ prices }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ prices: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
