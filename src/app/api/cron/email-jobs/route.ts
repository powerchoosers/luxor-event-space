import { NextRequest, NextResponse } from 'next/server'
import { processDueLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'
import { safelyRecordLuxorWorkerHealth } from '@/lib/luxorWorkerHealthServer'

export const dynamic = 'force-dynamic'

const EMAIL_TIME_ZONE = 'America/Chicago'
const SEND_WINDOW_START_HOUR = 8
const SEND_WINDOW_END_HOUR = 20

export async function POST(request: NextRequest) {
  const suppliedSecret = request.headers.get('x-cron-secret') || ''
  const expectedSecret = process.env.LUXOR_EMAIL_CRON_SECRET || ''

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  if (request.nextUrl.searchParams.get('health') === '1') {
    await safelyRecordLuxorWorkerHealth('email_jobs', {
      status: 'healthy',
      metadata: { check: 'authentication' },
    })
    return NextResponse.json({ success: true, authenticated: true, processed: 0 })
  }

  const centralHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: EMAIL_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date()).find((part) => part.type === 'hour')?.value,
  )

  if (!Number.isFinite(centralHour) || centralHour < SEND_WINDOW_START_HOUR || centralHour >= SEND_WINDOW_END_HOUR) {
    await safelyRecordLuxorWorkerHealth('email_jobs', {
      status: 'idle',
      metadata: { reason: 'outside_send_window' },
    })
    return NextResponse.json({
      success: true,
      processed: 0,
      skipped: 'outside_send_window',
      sendWindow: '8:00 AM–8:00 PM America/Chicago',
    })
  }

  try {
    const results = await processDueLuxorEmailJobs(1)
    await safelyRecordLuxorWorkerHealth('email_jobs', {
      status: 'healthy',
      processed: results.length,
    })
    return NextResponse.json({ success: true, processed: results.length, results })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email processing failed.'
    console.error('Luxor scheduled email worker failed:', message)
    await safelyRecordLuxorWorkerHealth('email_jobs', { status: 'error', error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
