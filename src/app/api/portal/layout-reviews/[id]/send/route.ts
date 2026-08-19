import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import {
  buildLuxorLayoutReviewEmail,
  getEffectiveLayoutReviewStatus,
  getLuxorLayoutReviewFeedback,
  getLuxorLayoutReviewForInquiry,
  queueLuxorLayoutReviewEmail,
  revealLuxorLayoutReviewToken,
} from '@/lib/luxorLayoutReviewsServer'
import { normalizeEmailAddress } from '@/lib/zohoMailServer'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function reviewOrigin(request: NextRequest) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return (configuredOrigin || request.nextUrl.origin).replace(/\/$/, '')
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const { id: reviewId } = await params
    const body = await request.json().catch(() => ({})) as { inquiryId?: unknown }
    const inquiryId = typeof body.inquiryId === 'string' ? body.inquiryId.trim() : ''
    if (!UUID_PATTERN.test(inquiryId) || !UUID_PATTERN.test(reviewId)) {
      return NextResponse.json({ error: 'A valid lead and layout review are required.' }, { status: 400 })
    }

    const inquiry = await getLuxorInquiry(inquiryId)
    if (!inquiry) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    if (inquiry.status === 'closed_lost') {
      return NextResponse.json({ error: 'This lead is closed lost, so the review email cannot be sent.' }, { status: 409 })
    }

    const recipientEmail = normalizeEmailAddress(inquiry.email)
    if (!recipientEmail) {
      return NextResponse.json({ error: 'Add a valid client email to this lead before sending the review.' }, { status: 409 })
    }

    const review = await getLuxorLayoutReviewForInquiry(reviewId, inquiryId)
    if (!review) return NextResponse.json({ error: 'Layout review not found for this lead.' }, { status: 404 })

    const feedback = await getLuxorLayoutReviewFeedback(review.id)
    if (getEffectiveLayoutReviewStatus(review, feedback) !== 'open') {
      return NextResponse.json({ error: 'This layout review is no longer waiting for a client response.' }, { status: 409 })
    }

    const reviewUrl = `${reviewOrigin(request)}/layout-review/${encodeURIComponent(revealLuxorLayoutReviewToken(review))}`
    const email = buildLuxorLayoutReviewEmail({
      clientName: inquiry.full_name,
      review,
      reviewUrl,
    })
    const result = await queueLuxorLayoutReviewEmail({
      inquiryId,
      review,
      recipientEmail,
      subject: email.subject,
      body: email.body,
      requestedBy: session.email,
    })

    return NextResponse.json(result, {
      status: result.queued ? 202 : 200,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to queue the layout review email.' }, { status: 500 })
  }
}
