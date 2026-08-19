import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorLeadEventForInquiry } from '@/lib/luxorLeadEventsServer'
import {
  createLuxorLayoutReview,
  getLuxorLayoutReviewForInquiry,
  listLuxorLayoutReviewFeedback,
  listLuxorLayoutReviews,
  normalizeLayoutReviewSnapshot,
  revealLuxorLayoutReviewToken,
  revokeLuxorLayoutReview,
} from '@/lib/luxorLayoutReviewsServer'
import type { LuxorLayoutReview, PortalLayoutReview } from '@/lib/luxorLayoutReviewTypes'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validId(value: string) {
  return UUID_PATTERN.test(value)
}

function optionalLeadEventId(value: unknown) {
  const id = typeof value === 'string' ? value.trim() : ''
  return id || null
}

function reviewOrigin(request: NextRequest) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return (configuredOrigin || request.nextUrl.origin).replace(/\/$/, '')
}

function portalReview(review: LuxorLayoutReview, request: NextRequest): PortalLayoutReview {
  const { token_hash: _tokenHash, token_ciphertext: _tokenCiphertext, ...safeReview } = review
  let shareUrl: string | null = null
  try {
    shareUrl = `${reviewOrigin(request)}/layout-review/${encodeURIComponent(revealLuxorLayoutReviewToken(review))}`
  } catch (error) {
    // The review itself remains visible. A replacement link can be created if
    // an old encrypted recovery value is no longer decryptable.
    console.error('Unable to reveal a saved layout review link:', error)
  }
  return { ...safeReview, share_url: shareUrl }
}

async function assertReviewScope(inquiryId: string, leadEventId: string | null) {
  if (!validId(inquiryId)) throw new Error('A valid lead id is required.')
  if (!await getLuxorInquiry(inquiryId)) throw new Error('Lead not found.')
  if (leadEventId) {
    if (!validId(leadEventId)) throw new Error('A valid event id is required.')
    if (!await getLuxorLeadEventForInquiry(leadEventId, inquiryId)) throw new Error('Event not found for this lead.')
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const inquiryId = request.nextUrl.searchParams.get('inquiryId')?.trim() || ''
    const leadEventId = optionalLeadEventId(request.nextUrl.searchParams.get('leadEventId'))
    await assertReviewScope(inquiryId, leadEventId)

    const reviews = await listLuxorLayoutReviews({ inquiryId, leadEventId })
    const feedback = await listLuxorLayoutReviewFeedback(reviews.map((review) => review.id))
    return NextResponse.json({
      reviews: reviews.map((review) => portalReview(review, request)),
      feedback,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load layout reviews.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const body = await request.json()
    const inquiryId = String(body.inquiryId || body.inquiry_id || '').trim()
    const leadEventId = optionalLeadEventId(body.leadEventId || body.lead_event_id)
    await assertReviewScope(inquiryId, leadEventId)

    const layout = normalizeLayoutReviewSnapshot(body.layout)
    const { review } = await createLuxorLayoutReview({
      inquiryId,
      leadEventId,
      layout,
      createdBy: session.email,
    })

    return NextResponse.json({ review: portalReview(review, request) }, {
      status: 201,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create a private layout link.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const body = await request.json()
    const inquiryId = String(body.inquiryId || body.inquiry_id || '').trim()
    const reviewId = String(body.reviewId || body.review_id || '').trim()
    if (!validId(inquiryId) || !validId(reviewId)) {
      return NextResponse.json({ error: 'A valid lead and review id are required.' }, { status: 400 })
    }
    if (!await getLuxorInquiry(inquiryId)) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    if (!await getLuxorLayoutReviewForInquiry(reviewId, inquiryId)) {
      return NextResponse.json({ error: 'Layout review not found for this lead.' }, { status: 404 })
    }

    const review = await revokeLuxorLayoutReview(reviewId, inquiryId)
    if (!review) return NextResponse.json({ error: 'Layout review not found.' }, { status: 404 })
    return NextResponse.json({ review: portalReview(review, request) }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to revoke the layout review link.' }, { status: 500 })
  }
}
