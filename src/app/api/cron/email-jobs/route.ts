import { after, NextRequest, NextResponse } from 'next/server'
import { syncPendingLuxorEmailBodies } from '@/lib/luxorEmailArchiveServer'
import { processDueLuxorEmailJobs, processDueLuxorInquiryNotifications } from '@/lib/luxorEmailJobsServer'
import { getLuxorWorkerHealth, safelyRecordLuxorWorkerHealth } from '@/lib/luxorWorkerHealthServer'
import { isLuxorZohoAuthorizationError, verifyLuxorZohoMailConnection } from '@/lib/zohoMailServer'
import { processPendingLuxorResendEvents } from '@/lib/luxorResendWebhookServer'
import { luxorMailProvider } from '@/lib/luxorMailConfig'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EMAIL_TIME_ZONE = 'America/Chicago'
const SEND_WINDOW_START_HOUR = 8
const SEND_WINDOW_END_HOUR = 20

function isHourlyConnectionCheck(date: Date) {
  return date.getUTCMinutes() === 0
}

export async function POST(request: NextRequest) {
  const suppliedSecret = request.headers.get('x-cron-secret') || ''
  const expectedSecret = process.env.LUXOR_EMAIL_CRON_SECRET || ''

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const provider = luxorMailProvider()
  const authorizationReason = `${provider}_authorization`
  const authorizationCode = provider === 'resend' ? 'RESEND_AUTHORIZATION_REQUIRED' : 'ZOHO_AUTHORIZATION_REQUIRED'
  const providerLabel = provider === 'resend' ? 'Resend' : 'Zoho'

  if (request.nextUrl.searchParams.get('health') === '1') {
    try {
      await verifyLuxorZohoMailConnection()
    } catch (error) {
      const message = error instanceof Error ? error.message : `${providerLabel} connection check failed.`
      await safelyRecordLuxorWorkerHealth('email_jobs', {
        status: 'error',
        error: message,
        metadata: { reason: authorizationReason, provider },
      })
      return NextResponse.json({ error: message, code: authorizationCode }, { status: 503 })
    }
    await safelyRecordLuxorWorkerHealth('email_jobs', {
      status: 'healthy',
      metadata: { check: 'authentication', provider, mailConnection: 'healthy' },
    })
    return NextResponse.json({ success: true, authenticated: true, processed: 0 })
  }

  // Independent read-only Zoho sync; health=1 above still performs no queue processing.
  // Durable event metadata tracks retries and leases if this invocation is interrupted.
  after(async () => {
    try {
      if (process.env.RESEND_WEBHOOK_SECRET && process.env.RESEND_API_KEY) await processPendingLuxorResendEvents(3)
      if (luxorMailProvider() === 'zoho') await syncPendingLuxorEmailBodies(3)
    }
    catch { console.warn('[email-archive] background sync could not run; pending records retained') }
  })

  const now = new Date()
  const centralHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: EMAIL_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now).find((part) => part.type === 'hour')?.value,
  )

  if (isHourlyConnectionCheck(now)) {
    try {
      await verifyLuxorZohoMailConnection()
    } catch (error) {
      const message = error instanceof Error ? error.message : `${providerLabel} connection check failed.`
      console.error('Luxor mail authorization check failed:', message)
      await safelyRecordLuxorWorkerHealth('email_jobs', {
        status: 'error',
        error: message,
        metadata: { reason: authorizationReason, provider },
      })
      return NextResponse.json({ error: message, code: authorizationCode }, { status: 503 })
    }
  } else {
    const previousHealth = await getLuxorWorkerHealth('email_jobs').catch(() => null)
    if (previousHealth?.last_status === 'error' && previousHealth.metadata?.reason === authorizationReason) {
      return NextResponse.json({
        error: previousHealth.last_error || `${providerLabel} connection needs attention in Settings.`,
        code: authorizationCode,
      }, { status: 503 })
    }
  }

  try {
    const outsideSendWindow = !Number.isFinite(centralHour) || centralHour < SEND_WINDOW_START_HOUR || centralHour >= SEND_WINDOW_END_HOUR
    // This all-hours claim includes internal alerts and requested transactional receipts.
    const internalResults = await processDueLuxorInquiryNotifications(1)
    // Preserve the one-message runtime budget: summary rendering plus two
    // sequential provider calls could exceed the function's 60-second limit.
    const results = internalResults.length || outsideSendWindow ? internalResults : await processDueLuxorEmailJobs(1)
    const failed = results.find((result) => result.status === 'failed')
    if (failed) {
      await safelyRecordLuxorWorkerHealth('email_jobs', {
        status: 'error',
        error: failed.error || 'Scheduled email delivery failed.',
        metadata: { reason: provider === 'zoho' && isLuxorZohoAuthorizationError(failed.error) ? authorizationReason : 'delivery', provider },
      })
    } else {
      await safelyRecordLuxorWorkerHealth('email_jobs', {
        status: outsideSendWindow && !results.length ? 'idle' : 'healthy',
        processed: results.length,
        metadata: { provider, mailConnection: 'healthy', ...(outsideSendWindow ? { reason: 'outside_customer_send_window' } : {}) },
      })
    }
    return NextResponse.json({ success: true, processed: results.length, results,
      ...(outsideSendWindow ? { skipped: 'outside_customer_send_window', sendWindow: '8:00 AM–8:00 PM America/Chicago' } : {}) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email processing failed.'
    console.error('Luxor scheduled email worker failed:', message)
    await safelyRecordLuxorWorkerHealth('email_jobs', { status: 'error', error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
