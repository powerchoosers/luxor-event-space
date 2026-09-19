import { NextRequest, NextResponse } from 'next/server'
import { fetchMarketingAndSalesMetrics, getDateRangeFromPreset, AnalyticsDatePreset } from '@/lib/luxorAnalyticsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const preset = (searchParams.get('preset') || '30d') as AnalyticsDatePreset
  const customStart = searchParams.get('start') || undefined
  const customEnd = searchParams.get('end') || undefined

  try {
    const range = getDateRangeFromPreset(preset, customStart, customEnd)
    const metrics = await fetchMarketingAndSalesMetrics(range)

    return NextResponse.json({
      range: {
        label: range.label,
        comparisonLabel: range.comparisonLabel,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      metrics,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch analytics'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
