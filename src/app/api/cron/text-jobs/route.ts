import { NextRequest, NextResponse } from 'next/server'
import { isWithinSmsSendWindow, processDueTextJobs } from '@/lib/luxorTextCampaignsServer'

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
  if (!isWithinSmsSendWindow()) {
    return NextResponse.json({
      success: true,
      processed: 0,
      skipped: 'outside_send_window',
      sendWindow: '8:00 AM–8:00 PM America/Chicago',
    })
  }

  try {
    const result = await processDueTextJobs()
    return NextResponse.json({
      success: true,
      processed: result.results.length,
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Text processing failed.'
    console.error('Luxor scheduled text worker failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
