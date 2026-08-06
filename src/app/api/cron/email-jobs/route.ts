import { NextRequest, NextResponse } from 'next/server'
import { processDueLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'
import { getLuxorWorkerHealth, safelyRecordLuxorWorkerHealth } from '@/lib/luxorWorkerHealthServer'
import { isLuxorZohoAuthorizationError, verifyLuxorZohoMailConnection } from '@/lib/zohoMailServer'

export const dynamic = 'force-dynamic'

const EMAIL_TIME_ZONE = 'America/Chicago'
const SEND_WINDOW_START_HOUR = 8
const SEND_WINDOW_END_HOUR = 20

function isHourlyZohoConnectionCheck(date: Date) {
  return date.getUTCMinutes() === 0
}

export async function POST(request: NextRequest) {
  const suppliedSecret = request.headers.get('x-cron-secret') || ''
  const expectedSecret = process.env.LUXOR_EMAIL_CRON_SECRET || ''

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  if (request.nextUrl.searchParams.get('health') === '1') {
    try {
      await verifyLuxorZohoMailConnection()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Zoho connection check failed.'
      await safelyRecordLuxorWorkerHealth('email_jobs', {
        status: 'error',
        error: message,
        metadata: { reason: 'zoho_authorization' },
      })
      return NextResponse.json({ error: message, code: 'ZOHO_AUTHORIZATION_REQUIRED' }, { status: 503 })
    }
    await safelyRecordLuxorWorkerHealth('email_jobs', {
      status: 'healthy',
      metadata: { check: 'authentication', zohoConnection: 'healthy' },
    })
    return NextResponse.json({ success: true, authenticated: true, processed: 0 })
  }

  const now = new Date()
  const centralHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: EMAIL_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now).find((part) => part.type === 'hour')?.value,
  )

  if (isHourlyZohoConnectionCheck(now)) {
    try {
      await verifyLuxorZohoMailConnection()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Zoho connection check failed.'
      console.error('Luxor Zoho authorization check failed:', message)
      await safelyRecordLuxorWorkerHealth('email_jobs', {
        status: 'error',
        error: message,
        metadata: { reason: 'zoho_authorization' },
      })
      return NextResponse.json({ error: message, code: 'ZOHO_AUTHORIZATION_REQUIRED' }, { status: 503 })
    }
  } else {
    const previousHealth = await getLuxorWorkerHealth('email_jobs').catch(() => null)
    if (previousHealth?.last_status === 'error' && previousHealth.metadata?.reason === 'zoho_authorization') {
      return NextResponse.json({
        error: previousHealth.last_error || 'Zoho connection needs reconnecting.',
        code: 'ZOHO_AUTHORIZATION_REQUIRED',
      }, { status: 503 })
    }
  }

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
    const failed = results.find((result) => result.status === 'failed')
    if (failed) {
      await safelyRecordLuxorWorkerHealth('email_jobs', {
        status: 'error',
        error: failed.error || 'Scheduled email delivery failed.',
        metadata: { reason: isLuxorZohoAuthorizationError(failed.error) ? 'zoho_authorization' : 'delivery' },
      })
    } else {
      await safelyRecordLuxorWorkerHealth('email_jobs', {
        status: 'healthy',
        processed: results.length,
        metadata: { zohoConnection: 'healthy' },
      })
    }
    return NextResponse.json({ success: true, processed: results.length, results })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email processing failed.'
    console.error('Luxor scheduled email worker failed:', message)
    await safelyRecordLuxorWorkerHealth('email_jobs', { status: 'error', error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
