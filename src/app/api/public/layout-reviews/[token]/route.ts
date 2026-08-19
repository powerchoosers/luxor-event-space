import { NextRequest, NextResponse } from 'next/server'
import { getPublicRequestIp, hashPublicRequestIp } from '@/lib/luxorPublicEventsServer'
import {
  getEffectiveLayoutReviewStatus,
  getLuxorLayoutReviewByToken,
  getLuxorLayoutReviewFeedback,
  LayoutReviewNotFoundError,
  LayoutReviewRateLimitError,
  LayoutReviewResponseConflictError,
  LayoutReviewUnavailableError,
  submitLuxorLayoutReviewResponse,
  toPublicLayoutReview,
} from '@/lib/luxorLayoutReviewsServer'
import type { LuxorLayoutReviewAction } from '@/lib/luxorLayoutReviewTypes'

type RouteContext = { params: Promise<{ token: string }> }

const privateHeaders = { 'Cache-Control': 'private, no-store' }

function unavailable(message: string, status = 410) {
  return NextResponse.json({ error: message }, { status, headers: privateHeaders })
}

async function resolveActiveReview(token: string) {
  const review = await getLuxorLayoutReviewByToken(token)
  if (!review) throw new LayoutReviewNotFoundError('This layout review link is unavailable.')
  const feedback = await getLuxorLayoutReviewFeedback(review.id)
  const status = getEffectiveLayoutReviewStatus(review, feedback)
  if (status === 'revoked') throw new LayoutReviewUnavailableError('This layout review link is no longer active.')
  if (status === 'expired') throw new LayoutReviewUnavailableError('This layout review link has expired. Please ask Luxor for a new link.')
  return { review, feedback }
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { token } = await params
    const { review, feedback } = await resolveActiveReview(token)
    return NextResponse.json({ review: toPublicLayoutReview(review, feedback) }, { headers: privateHeaders })
  } catch (error) {
    if (error instanceof LayoutReviewNotFoundError) return unavailable('This layout review link is unavailable.', 404)
    if (error instanceof LayoutReviewUnavailableError) return unavailable(error.message)
    console.error('Unable to load private layout review:', error)
    return unavailable('Unable to load this layout review right now.', 500)
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { token } = await params
    const body = await request.json()
    const action = body.action === 'approved' || body.action === 'feedback'
      ? body.action as LuxorLayoutReviewAction
      : null
    if (!action) return unavailable('Choose an approval or feedback response.', 400)

    const submissionKey = typeof body.submissionKey === 'string' ? body.submissionKey.trim() : ''
    const response = await submitLuxorLayoutReviewResponse({
      token,
      action,
      note: typeof body.note === 'string' ? body.note : null,
      submissionKey,
      ipHash: hashPublicRequestIp(getPublicRequestIp(request.headers)),
      userAgent: request.headers.get('user-agent'),
    })
    return NextResponse.json({ review: toPublicLayoutReview(response.review, response.feedback) }, { headers: privateHeaders })
  } catch (error) {
    if (error instanceof LayoutReviewNotFoundError) return unavailable('This layout review link is unavailable.', 404)
    if (error instanceof LayoutReviewUnavailableError) return unavailable(error.message)
    if (error instanceof LayoutReviewResponseConflictError) return unavailable('This layout review already has a response.', 409)
    if (error instanceof LayoutReviewRateLimitError) return unavailable(error.message, 429)
    const message = error instanceof Error ? error.message : 'Unable to submit your layout response.'
    return unavailable(message, 400)
  }
}
