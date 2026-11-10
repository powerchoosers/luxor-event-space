import { after, NextRequest, NextResponse } from 'next/server'
import { syncPendingLuxorEmailBodies } from '@/lib/luxorEmailArchiveServer'
import { processDueLuxorEmailJobs, processDueLuxorFollowUpEmailJobs, processDueLuxorInquiryNotifications, processDueLuxorTestEmailJobs, reconcileLuxorFollowUpFinalizations } from '@/lib/luxorEmailJobsServer'
import { getLuxorWorkerHealth, safelyRecordLuxorWorkerHealth } from '@/lib/luxorWorkerHealthServer'
import { isLuxorZohoAuthorizationError, verifyLuxorMailConnection } from '@/lib/zohoMailServer'
import { processPendingLuxorResendEvents } from '@/lib/luxorResendWebhookServer'
import { luxorMailProvider } from '@/lib/luxorMailConfig'
import { processPendingLuxorBillIntakes } from '@/lib/luxorBillIntakeServer'
import { processRecurringCostSummaries } from '@/lib/luxorRecurringCostSummaryServer'
import { processPendingManualBillAnalyses } from '@/lib/luxorManualBillAnalysisServer'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { generateLuxorExpenseOccurrences } from '@/lib/luxorExpensesServer'
import { reconcileEventEmailReminders } from '@/lib/luxorBookingEmailAutomationsServer'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const EMAIL_TIME_ZONE = 'America/Chicago'
const SEND_WINDOW_START_HOUR = 8
const SEND_WINDOW_END_HOUR = 20

function isHourlyConnectionCheck(date: Date) {
  return date.getUTCMinutes() === 0
}

function isDailyExpenseGenerationWindow(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EMAIL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  return hour === 1 && Number.isFinite(minute) && minute >= 0 && minute < 10
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
      await verifyLuxorMailConnection()
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

  const now = new Date()
  try {
    await reconcileEventEmailReminders(10)
  } catch (error) {
    console.warn('Event reminder reconciliation is unavailable; pending work will retry:', error instanceof Error ? error.message : error)
  }
  let expenseGeneration: { status: 'outside_window' | 'processed' | 'failed'; inserted?: number } = { status: 'outside_window' }
  if (isDailyExpenseGenerationWindow(now)) {
    try {
      const generated = await generateLuxorExpenseOccurrences(now)
      expenseGeneration = { status: 'processed', inserted: generated.inserted }
    } catch {
      // Occurrence inserts are unique by recurring template and billing period,
      // so a later authenticated invocation in this Chicago-time window can
      // retry safely without duplicating obligations.
      console.warn('Daily expense generation failed; a later authenticated invocation can retry safely.')
      expenseGeneration = { status: 'failed' }
    }
  }

  // Each recovery task retains its own durable retry state. A failure in one
  // must not prevent the other tasks from being attempted on this invocation.
  after(async () => {
    try {
      if (process.env.RESEND_WEBHOOK_SECRET && process.env.RESEND_API_KEY) await processPendingLuxorResendEvents(3)
    } catch { console.warn('[resend-events] background recovery failed; pending records retained') }
    try {
      if (process.env.OPEN_ROUTER_API_KEY) await processPendingLuxorBillIntakes(1)
    } catch { console.warn('[bill-intake] background recovery failed; pending records retained') }
    try {
      if (process.env.OPEN_ROUTER_API_KEY) await processRecurringCostSummaries(1)
    } catch { console.warn('[recurring-summaries] background update failed; pending work will retry') }
    try {
      if (luxorMailProvider() === 'zoho') await syncPendingLuxorEmailBodies(3)
    } catch { console.warn('[email-archive] background sync failed; pending records retained') }
  })

  // Keep manual analysis independent from mail sync and the delivery budget.
  // The health-only response above never schedules this work.
  after(async () => {
    try {
      if (!process.env.OPEN_ROUTER_API_KEY) throw new Error('Manual bill analysis is not configured.')
      const result = await processPendingManualBillAnalyses(1)
      await safelyRecordLuxorWorkerHealth('manual_bill_analysis', {
        status: result.failed ? 'error' : result.pending ? 'healthy' : 'idle',
        processed: result.processed,
        metadata: { pending: result.pending, failed: result.failed, checked: result.checked },
        ...(result.failed ? { error: 'Some manual bill analyses need a retry.' } : {}),
      })
    } catch {
      console.warn('Manual bill analysis recovery could not run; queued records retained.')
      await safelyRecordLuxorWorkerHealth('manual_bill_analysis', {
        status: 'error', error: 'Manual bill analysis recovery could not run.',
      })
    }
  })

  const centralHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: EMAIL_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now).find((part) => part.type === 'hour')?.value,
  )

  if (isHourlyConnectionCheck(now)) {
    try {
      await verifyLuxorMailConnection()
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
    // The bounded RPC only cancels acquisition work; it never calls a provider.
    // Acquisition delivery has its own fail-closed eligibility check, so an
    // unavailable reconciliation should not block unrelated receipts.
    let reconciliationError: string | null = null
    try {
      await supabaseRestStrict<number>('rpc/luxor_reconcile_signed_booking_followups', {
        method: 'POST', body: JSON.stringify({ p_limit: 25 }),
      })
    } catch (error) {
      reconciliationError = error instanceof Error ? error.message : 'Unknown database error.'
      console.error('Signed-booking follow-up reconciliation failed; check the database migration and retry:', reconciliationError)
    }
    const outsideSendWindow = !Number.isFinite(centralHour) || centralHour < SEND_WINDOW_START_HOUR || centralHour >= SEND_WINDOW_END_HOUR
    // Reconcile finished sequences before claiming other work so a busy
    // transactional queue cannot starve day-30 recovery.
    await reconcileLuxorFollowUpFinalizations()
    // Controlled test confirmations can reach only the verified owner inbox;
    // process that isolated queue outside customer hours without opening the
    // ordinary mail queue or exceeding the one-message worker budget.
    const testResults = outsideSendWindow ? await processDueLuxorTestEmailJobs(1) : []
    // This all-hours claim includes internal alerts and requested transactional receipts.
    const internalResults = testResults.length ? [] : await processDueLuxorInquiryNotifications(1)
    // Preserve the one-message runtime budget: summary rendering plus two
    // sequential provider calls could exceed the function's 60-second limit.
    const followUpResults = testResults.length || internalResults.length ? [] : await processDueLuxorFollowUpEmailJobs()
    const results = testResults.length ? testResults
      : internalResults.length ? internalResults
      : followUpResults.length ? followUpResults
        : outsideSendWindow ? [] : await processDueLuxorEmailJobs(1)
    const failed = results.find((result) => result.status === 'failed')
    if (failed) {
      await safelyRecordLuxorWorkerHealth('email_jobs', {
        status: 'error',
        error: failed.error || 'Scheduled email delivery failed.',
        metadata: { reason: provider === 'zoho' && isLuxorZohoAuthorizationError(failed.error) ? authorizationReason : 'delivery', provider },
      })
    } else if (reconciliationError) {
      await safelyRecordLuxorWorkerHealth('email_jobs', {
        status: 'error',
        error: `Signed-booking follow-up reconciliation failed: ${reconciliationError}`,
        processed: results.length,
        metadata: { reason: 'follow_up_reconciliation', provider },
      })
    } else {
      await safelyRecordLuxorWorkerHealth('email_jobs', {
        status: outsideSendWindow && !results.length ? 'idle' : 'healthy',
        processed: results.length,
        metadata: { provider, mailConnection: 'healthy', ...(outsideSendWindow ? { reason: 'outside_customer_send_window' } : {}) },
      })
    }
    return NextResponse.json({ success: true, processed: results.length, results, expenseGeneration,
      ...(reconciliationError ? { reconciliationWarning: 'Signed-booking follow-up cleanup failed. Check worker health and the database migration.' } : {}),
      ...(outsideSendWindow && !testResults.length && !followUpResults.length ? { skipped: 'outside_customer_send_window', sendWindow: '8:00 AM-8:00 PM America/Chicago' } : {}) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email processing failed.'
    console.error('Luxor scheduled email worker failed:', message)
    await safelyRecordLuxorWorkerHealth('email_jobs', { status: 'error', error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
