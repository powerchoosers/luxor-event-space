import 'server-only'

import crypto from 'crypto'
import { supabaseRest } from './supabaseRestServer'
import { broadcastLuxorPortalNotification } from './luxorZohoWebhookServer'
import type {
  LayoutReviewSnapshot,
  LayoutReviewSnapshotItem,
  LuxorLayoutReview,
  LuxorLayoutReviewAction,
  LuxorLayoutReviewFeedback,
  LuxorLayoutReviewStatus,
  PublicLayoutReview,
} from './luxorLayoutReviewTypes'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_LAYOUT_ITEMS = 500
const MAX_LAYOUT_SNAPSHOT_BYTES = 250_000
const REVIEW_EXPIRY_DAYS = 30
const ALLOWED_LAYOUT_KINDS = new Set([
  'round-table',
  'rectangle-table',
  'cocktail-table',
  'chair',
  'throne-chair',
  'sofa',
  'stage',
  'dj-booth',
  'dance-floor',
  'bar',
  'backdrop',
  'balloon-arch',
  'pipe-drape',
  'stanchions',
  'vip-area',
  'florals',
])

type ReviewScope = {
  inquiryId: string
  leadEventId?: string | null
}

export class LayoutReviewNotFoundError extends Error {}
export class LayoutReviewUnavailableError extends Error {}
export class LayoutReviewResponseConflictError extends Error {}
export class LayoutReviewRateLimitError extends Error {}

function layoutReviewSecret() {
  const secret = process.env.LUXOR_PORTAL_SESSION_SECRET
  if (!secret) throw new Error('Missing LUXOR_PORTAL_SESSION_SECRET for layout review links.')
  return secret
}

function cryptoKey(purpose: string) {
  return crypto.createHash('sha256').update(`${layoutReviewSecret()}:${purpose}`).digest()
}

function tokenHash(token: string) {
  return crypto.createHmac('sha256', cryptoKey('lookup:v1')).update(token).digest('hex')
}

function encryptToken(token: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', cryptoKey('encryption:v1'), iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

function decryptToken(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split('.')
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('Invalid layout review token format.')
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', cryptoKey('encryption:v1'), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

function normalizedString(value: unknown, label: string, maxLength: number, required = true) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (required && !text) throw new Error(`${label} is required.`)
  if (text.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`)
  return text
}

function boundedNumber(value: unknown, label: string, min: number, max: number) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`)
  }
  return Math.round(number * 100) / 100
}

function optionalIsoDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

function normalizeLayoutItem(value: unknown, index: number): LayoutReviewSnapshotItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Layout item ${index + 1} is invalid.`)
  }
  const item = value as Record<string, unknown>
  const kind = normalizedString(item.kind, `Layout item ${index + 1} type`, 40)
  if (!ALLOWED_LAYOUT_KINDS.has(kind)) throw new Error(`Layout item ${index + 1} has an unsupported type.`)

  const color = typeof item.color === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(item.color.trim())
    ? item.color.trim().toLowerCase()
    : undefined

  return {
    id: normalizedString(item.id, `Layout item ${index + 1} id`, 120),
    kind,
    x: boundedNumber(item.x, `Layout item ${index + 1} x position`, 0, 100),
    y: boundedNumber(item.y, `Layout item ${index + 1} y position`, 0, 100),
    width: boundedNumber(item.width, `Layout item ${index + 1} width`, 0.1, 100),
    height: boundedNumber(item.height, `Layout item ${index + 1} height`, 0.1, 100),
    rotation: boundedNumber(item.rotation, `Layout item ${index + 1} rotation`, -360, 360),
    label: normalizedString(item.label, `Layout item ${index + 1} label`, 160),
    seats: Math.round(boundedNumber(item.seats ?? 0, `Layout item ${index + 1} seats`, 0, 500)),
    ...(color ? { color } : {}),
  }
}

/** Converts a saved designer document into a bounded, immutable public snapshot. */
export function normalizeLayoutReviewSnapshot(value: unknown): LayoutReviewSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Save a valid layout before creating a review link.')
  }
  const layout = value as Record<string, unknown>
  if (!Array.isArray(layout.items)) throw new Error('Save a valid layout before creating a review link.')
  if (layout.items.length > MAX_LAYOUT_ITEMS) throw new Error('This layout has too many items to share.')

  const updatedAt = optionalIsoDate(layout.updatedAt)
  const snapshot: LayoutReviewSnapshot = {
    version: 1,
    name: normalizedString(layout.name, 'Layout name', 180),
    items: layout.items.map((item, index) => normalizeLayoutItem(item, index)),
    roomWidthFeet: boundedNumber(layout.roomWidthFeet ?? 33, 'Room width', 12, 150),
    roomHeightFeet: boundedNumber(layout.roomHeightFeet ?? 75, 'Main room depth', 12, 200),
    secondaryRoomWidthFeet: boundedNumber(layout.secondaryRoomWidthFeet ?? 20.83, 'Lower room width', 8, 150),
    secondaryRoomDepthFeet: boundedNumber(layout.secondaryRoomDepthFeet ?? 21.58, 'Lower room depth', 8, 100),
    ...(updatedAt ? { updatedAt } : {}),
  }

  if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_LAYOUT_SNAPSHOT_BYTES) {
    throw new Error('This layout is too large to share.')
  }
  return snapshot
}

function scopeFilter(scope: ReviewScope) {
  const inquiryFilter = `inquiry_id=eq.${encodeURIComponent(scope.inquiryId)}`
  const leadEventFilter = scope.leadEventId
    ? `lead_event_id=eq.${encodeURIComponent(scope.leadEventId)}`
    : 'lead_event_id=is.null'
  return `${inquiryFilter}&${leadEventFilter}`
}

function isExpired(review: Pick<LuxorLayoutReview, 'expires_at'>) {
  return Number.isFinite(new Date(review.expires_at).getTime()) && new Date(review.expires_at).getTime() <= Date.now()
}

export function getEffectiveLayoutReviewStatus(
  review: Pick<LuxorLayoutReview, 'status' | 'expires_at' | 'revoked_at'>,
  feedback?: Pick<LuxorLayoutReviewFeedback, 'action'> | null,
): LuxorLayoutReviewStatus {
  if (review.revoked_at || review.status === 'revoked') return 'revoked'
  if (isExpired(review)) return 'expired'
  if (feedback?.action === 'approved') return 'approved'
  if (feedback?.action === 'feedback') return 'feedback'
  return review.status
}

function assertTokenFormat(token: string) {
  return TOKEN_PATTERN.test(token)
}

function assertUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} must be a valid id.`)
}

export async function listLuxorLayoutReviews(scope: ReviewScope) {
  assertUuid(scope.inquiryId, 'Inquiry id')
  if (scope.leadEventId) assertUuid(scope.leadEventId, 'Lead event id')
  return supabaseRest<LuxorLayoutReview[]>(
    `luxor_layout_reviews?select=*&${scopeFilter(scope)}&order=created_at.desc&limit=50`,
  )
}

export async function getLuxorLayoutReviewForInquiry(reviewId: string, inquiryId: string) {
  assertUuid(reviewId, 'Review id')
  assertUuid(inquiryId, 'Inquiry id')
  const [review] = await supabaseRest<LuxorLayoutReview[]>(
    `luxor_layout_reviews?select=*&id=eq.${encodeURIComponent(reviewId)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1`,
  )
  return review ?? null
}

export async function getLuxorLayoutReviewByToken(token: string) {
  if (!assertTokenFormat(token)) return null
  const [review] = await supabaseRest<LuxorLayoutReview[]>(
    `luxor_layout_reviews?select=*&token_hash=eq.${encodeURIComponent(tokenHash(token))}&limit=1`,
  )
  return review ?? null
}

export async function getLuxorLayoutReviewFeedback(reviewId: string) {
  assertUuid(reviewId, 'Review id')
  const [feedback] = await supabaseRest<LuxorLayoutReviewFeedback[]>(
    `luxor_layout_review_feedback?select=*&review_id=eq.${encodeURIComponent(reviewId)}&limit=1`,
  )
  return feedback ?? null
}

export async function listLuxorLayoutReviewFeedback(reviewIds: string[]) {
  const ids = Array.from(new Set(reviewIds.filter((id) => UUID_PATTERN.test(id))))
  if (!ids.length) return []
  return supabaseRest<LuxorLayoutReviewFeedback[]>(
    `luxor_layout_review_feedback?select=*&review_id=in.(${ids.join(',')})&order=created_at.desc`,
  )
}

export async function createLuxorLayoutReview(input: ReviewScope & {
  layout: LayoutReviewSnapshot
  createdBy: string
}) {
  assertUuid(input.inquiryId, 'Inquiry id')
  if (input.leadEventId) assertUuid(input.leadEventId, 'Lead event id')
  const createdBy = normalizedString(input.createdBy, 'Portal user', 320)

  const now = new Date()
  const rawToken = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + REVIEW_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // A new snapshot deliberately invalidates prior links for this exact event.
  // Revoking before creation favors privacy if a subsequent write has to retry.
  await supabaseRest(`luxor_layout_reviews?${scopeFilter(input)}&revoked_at=is.null`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'revoked',
      revoked_at: now.toISOString(),
      updated_at: now.toISOString(),
    }),
  })

  const [review] = await supabaseRest<LuxorLayoutReview[]>('luxor_layout_reviews?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      inquiry_id: input.inquiryId,
      lead_event_id: input.leadEventId || null,
      layout_name: input.layout.name,
      layout_snapshot: input.layout,
      token_hash: tokenHash(rawToken),
      token_ciphertext: encryptToken(rawToken),
      status: 'open',
      created_by: createdBy,
      expires_at: expiresAt,
    }),
  })

  if (!review) throw new Error('Unable to create the private layout review link.')
  return { review, token: rawToken }
}

export async function revokeLuxorLayoutReview(reviewId: string, inquiryId: string) {
  const review = await getLuxorLayoutReviewForInquiry(reviewId, inquiryId)
  if (!review) return null
  if (review.revoked_at || review.status === 'revoked') return review

  const now = new Date().toISOString()
  const [updated] = await supabaseRest<LuxorLayoutReview[]>(
    `luxor_layout_reviews?select=*&id=eq.${encodeURIComponent(review.id)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'revoked', revoked_at: now, updated_at: now }),
    },
  )
  return updated ?? review
}

export function revealLuxorLayoutReviewToken(review: LuxorLayoutReview) {
  const token = decryptToken(review.token_ciphertext)
  if (!assertTokenFormat(token)) throw new Error('Unable to retrieve the existing private link.')
  return token
}

function assertReviewCanReceiveResponse(review: LuxorLayoutReview) {
  if (review.revoked_at || review.status === 'revoked') {
    throw new LayoutReviewUnavailableError('This review link is no longer active.')
  }
  if (isExpired(review) || review.status === 'expired') {
    throw new LayoutReviewUnavailableError('This review link has expired.')
  }
}

async function countRecentLayoutReviewFeedback(ipHash: string, minutes = 10) {
  if (!ipHash) return 0
  const since = new Date(Date.now() - minutes * 60_000).toISOString()
  const rows = await supabaseRest<Array<{ id: string }>>(
    `luxor_layout_review_feedback?select=id&ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gte.${encodeURIComponent(since)}&limit=8`,
  )
  return rows.length
}

export async function submitLuxorLayoutReviewResponse(input: {
  token: string
  action: LuxorLayoutReviewAction
  note?: string | null
  submissionKey: string
  ipHash?: string | null
  userAgent?: string | null
}) {
  if (!assertTokenFormat(input.token)) throw new LayoutReviewNotFoundError('Layout review not found.')
  if (!UUID_PATTERN.test(input.submissionKey)) throw new Error('Please refresh the page and try again.')
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  if (input.action !== 'approved' && input.action !== 'feedback') throw new Error('Choose an approval or feedback response.')
  if (input.action === 'feedback' && !note) throw new Error('Please add a note so the team knows what to change.')
  if (note.length > 2000) throw new Error('Please shorten your note to 2,000 characters or fewer.')

  const review = await getLuxorLayoutReviewByToken(input.token)
  if (!review) throw new LayoutReviewNotFoundError('Layout review not found.')
  assertReviewCanReceiveResponse(review)

  const existing = await getLuxorLayoutReviewFeedback(review.id)
  if (existing) {
    if (existing.submission_key === input.submissionKey) return { review, feedback: existing, created: false }
    throw new LayoutReviewResponseConflictError('This layout review already has a response.')
  }

  const ipHash = input.ipHash || ''
  if (ipHash && await countRecentLayoutReviewFeedback(ipHash) >= 6) {
    throw new LayoutReviewRateLimitError('Please wait a few minutes before submitting another layout response.')
  }

  let feedback: LuxorLayoutReviewFeedback | null = null
  try {
    ;[feedback] = await supabaseRest<LuxorLayoutReviewFeedback[]>('luxor_layout_review_feedback?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        review_id: review.id,
        action: input.action,
        note: note || null,
        submission_key: input.submissionKey,
        ip_hash: ipHash || null,
        user_agent: input.userAgent?.slice(0, 500) || null,
      }),
    })
  } catch (error) {
    const concurrentFeedback = await getLuxorLayoutReviewFeedback(review.id)
    if (concurrentFeedback) {
      if (concurrentFeedback.submission_key === input.submissionKey) {
        return { review, feedback: concurrentFeedback, created: false }
      }
      throw new LayoutReviewResponseConflictError('This layout review already has a response.')
    }
    throw error
  }

  if (!feedback) throw new Error('Unable to save your layout response.')

  const now = new Date().toISOString()
  let updatedReview = review
  try {
    const [updated] = await supabaseRest<LuxorLayoutReview[]>(
      `luxor_layout_reviews?select=*&id=eq.${encodeURIComponent(review.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status: input.action === 'approved' ? 'approved' : 'feedback',
          responded_at: now,
          updated_at: now,
        }),
      },
    )
    updatedReview = updated ?? review
  } catch (error) {
    // The durable feedback row is enough to render the final public state. A
    // later portal read derives the status from it if this display update fails.
    console.error('Layout feedback was recorded, but its review status could not be updated:', error)
  }

  void broadcastLuxorPortalNotification('layout-review-feedback', {
    inquiryId: review.inquiry_id,
    reviewId: review.id,
    feedbackId: feedback.id,
  }).catch((error) => {
    // Realtime is the fast path. Portal polling still reveals the saved reply.
    console.error('Layout feedback was recorded, but its realtime notice failed:', error)
  })

  return { review: updatedReview, feedback, created: true }
}

export function toPublicLayoutReview(review: LuxorLayoutReview, feedback: LuxorLayoutReviewFeedback | null): PublicLayoutReview {
  return {
    layout_name: review.layout_name,
    layout_snapshot: review.layout_snapshot,
    status: getEffectiveLayoutReviewStatus(review, feedback),
    created_at: review.created_at,
    expires_at: review.expires_at,
    response: feedback
      ? {
          action: feedback.action,
          note: feedback.note,
          created_at: feedback.created_at,
        }
      : null,
  }
}

export async function listLuxorLayoutReviewNotifications(limit = 50) {
  const feedback = await supabaseRest<LuxorLayoutReviewFeedback[]>(
    `luxor_layout_review_feedback?select=*&order=created_at.desc&limit=${Math.max(1, Math.min(100, Math.round(limit)))}`,
  )
  const reviews = await listLuxorLayoutReviewsForNotificationRows(feedback.map((entry) => entry.review_id))
  const reviewById = new Map(reviews.map((review) => [review.id, review]))

  return feedback.flatMap((entry) => {
    const review = reviewById.get(entry.review_id)
    if (!review) return []
    return [{
      id: entry.id,
      created_at: entry.created_at,
      action: entry.action,
      note: entry.note,
      inquiry_id: review.inquiry_id,
      layout_name: review.layout_name,
      review_id: review.id,
    }]
  })
}

async function listLuxorLayoutReviewsForNotificationRows(reviewIds: string[]) {
  const ids = Array.from(new Set(reviewIds.filter((id) => UUID_PATTERN.test(id))))
  if (!ids.length) return []
  return supabaseRest<Array<Pick<LuxorLayoutReview, 'id' | 'inquiry_id' | 'layout_name'>>>(
    `luxor_layout_reviews?select=id,inquiry_id,layout_name&id=in.(${ids.join(',')})`,
  )
}
