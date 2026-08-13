import { NextRequest, NextResponse } from 'next/server'
import { closeLuxorDealAsLost, LuxorDealLostPaymentLinkAttentionError } from '@/lib/luxorDealLostServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const { id } = await params
    const inquiry = await getLuxorInquiry(id)
    if (!inquiry) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })

    const body = await request.json().catch(() => ({})) as { reason?: unknown; cancelTour?: unknown }
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
    const result = await closeLuxorDealAsLost({
      inquiry,
      requestedBy: session.email,
      reason,
      // The owner action sheet sends a boolean. Defaulting to true protects a
      // pending tour when another caller uses this endpoint without the field.
      cancelTour: body.cancelTour !== false,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof LuxorDealLostPaymentLinkAttentionError) {
      return NextResponse.json({
        error: 'A Stripe payment link could not be safely stopped. Review the payment-link warning before marking this deal lost.',
        outcome: error.outcome,
      }, { status: 409 })
    }
    console.error('[deal-lost] failed', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to mark this deal as lost.' }, { status: 500 })
  }
}
