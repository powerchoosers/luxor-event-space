import { NextRequest, NextResponse } from 'next/server'
import { isWithinSmsSendWindow, processDueTextJobs } from '@/lib/luxorTextCampaignsServer'
import { safelyRecordLuxorWorkerHealth } from '@/lib/luxorWorkerHealthServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const suppliedSecret = request.headers.get('x-cron-secret') || ''
  const acceptedSecrets = [
    process.env.LUXOR_TEXT_CRON_SECRET,
    process.env.LUXOR_EMAIL_CRON_SECRET,
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value))
  if (!suppliedSecret || !acceptedSecrets.includes(suppliedSecret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  if (request.nextUrl.searchParams.get('health') === '1') {
    await safelyRecordLuxorWorkerHealth('text_jobs', {
      status: 'healthy',
      metadata: { check: 'authentication' },
    })
    return NextResponse.json({ success: true, authenticated: true, processed: 0 })
  }
  if (!isWithinSmsSendWindow()) {
    await safelyRecordLuxorWorkerHealth('text_jobs', {
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
    const result = await processDueTextJobs()
    await safelyRecordLuxorWorkerHealth('text_jobs', {
      status: 'healthy',
      processed: result.results.length,
    })
    return NextResponse.json({
      success: true,
      processed: result.results.length,
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Text processing failed.'
    console.error('Luxor scheduled text worker failed:', message)
    await safelyRecordLuxorWorkerHealth('text_jobs', { status: 'error', error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
