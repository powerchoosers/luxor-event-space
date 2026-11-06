import { NextRequest, NextResponse } from 'next/server'
import { generateAndSaveLuxorDailyPriorities } from '@/lib/luxorDailyPrioritiesServer'
import { safelyRecordLuxorWorkerHealth } from '@/lib/luxorWorkerHealthServer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const suppliedSecret = request.headers.get('x-cron-secret') || ''
  const expectedSecret = process.env.LUXOR_EMAIL_CRON_SECRET || ''

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  if (request.nextUrl.searchParams.get('health') === '1') {
    await safelyRecordLuxorWorkerHealth('daily_priorities', {
      status: 'healthy',
      metadata: { check: 'authentication' },
    })
    return NextResponse.json({ ok: true, health: 'healthy' })
  }

  try {
    const priorities = await generateAndSaveLuxorDailyPriorities(undefined, true)
    await safelyRecordLuxorWorkerHealth('daily_priorities', {
      status: 'healthy',
      metadata: { count: priorities.length },
    })
    return NextResponse.json({
      ok: true,
      count: priorities.length,
      priorities,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate daily priorities.'
    await safelyRecordLuxorWorkerHealth('daily_priorities', {
      status: 'error',
      error: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
