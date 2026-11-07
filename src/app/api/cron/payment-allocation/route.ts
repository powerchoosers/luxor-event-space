import { NextRequest, NextResponse } from 'next/server'
import { processPendingPaymentAllocations } from '@/lib/luxorExistingPaymentAllocationServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const supplied = request.headers.get('x-cron-secret') || ''
  const expected = process.env.LUXOR_EMAIL_CRON_SECRET || ''
  if (!expected || supplied !== expected) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  if (request.nextUrl.searchParams.get('health') === '1') return NextResponse.json({ success: true, authenticated: true, processed: 0 })
  if (process.env.LUXOR_PAYMENT_AUTO_ALLOCATION_READY === 'false') return NextResponse.json({ success: true, processed: 0, skipped: 'disabled' })
  try {
    const result = await processPendingPaymentAllocations()
    return NextResponse.json({ success: result.failed === 0, ...result }, { status: result.failed ? 503 : 200 })
  } catch {
    return NextResponse.json({ error: 'Payment allocation recovery is incomplete; the next scheduled run will retry.' }, { status: 503 })
  }
}
