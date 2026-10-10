import { normalizeLuxorEmailAddress } from './luxorEmailBounce'

export const LUXOR_EMAIL_NOTICE_TTL_MS = 60 * 60 * 1000
export const LUXOR_EMAIL_SENT_EVENT = 'luxor-email-sent'

export type LeadEmailHistoryMessage = {
  id?: string | null
  direction?: string | null
  to?: string | null
  receivedAt?: string | null
  deliveryStatus?: string | null
}

export type LeadEmailBounce = {
  address?: unknown
  occurredAt?: unknown
  providerEventId?: unknown
  providerEmailId?: unknown
  reason?: unknown
  type?: unknown
} | null | undefined

export type LeadEmailNoticeResolution =
  | {
      kind: 'warning'
      leadId: string
      recipient: string
      bounceAddress: string
      bounceEventKey: string
      bounceAt: number | null
      currentAddress: boolean
    }
  | {
      kind: 'resolved'
      leadId: string
      recipient: string
      bounceAddress: string
      bounceEventKey: string
      bounceAt: number
      successEventId: string
      sentAt: number
      delivery: 'sent' | 'delivered'
      supersededByLaterEmail: boolean
    }

export type LeadEmailNoticeTracker = {
  recipient: string
  bounceEventKey: string
  successEventId: string
  firstSeenAt: number
  dismissedAt: number | null
}

export type LeadEmailSentEventDetail = {
  leadId?: string | null
  recipient: string
  messageId?: string | null
}

type NoticeStorage = Pick<Storage, 'getItem' | 'setItem'>

function finiteTime(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const parsed = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function addressesFromHeader(value: unknown) {
  const header = String(value || '')
  const bracketed = Array.from(header.matchAll(/<([^<>]+)>/g), (match) => normalizeLuxorEmailAddress(match[1]))
  const raw = bracketed.length ? bracketed : header.split(/[;,]/).map(normalizeLuxorEmailAddress)
  return new Set(raw.filter((address) => address.includes('@')))
}

function resolvedDelivery(status: unknown): 'sent' | 'delivered' | null {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'sent') return 'sent'
  if (normalized === 'delivered' || normalized === 'opened' || normalized === 'clicked') return 'delivered'
  return null
}

function bounceIdentity(leadId: string, recipient: string, bounceAddress: string, bounceAt: number | null, eventId: unknown) {
  const providerEventId = String(eventId || '').trim()
  return providerEventId || `${leadId}:${bounceAddress || recipient}:${bounceAt ?? 'unknown'}`
}

export function getLeadEmailNoticeResolution(input: {
  leadId: string
  currentEmail: string | null | undefined
  bounce: LeadEmailBounce
  messages: LeadEmailHistoryMessage[]
}): LeadEmailNoticeResolution | null {
  const leadId = String(input.leadId || '').trim()
  const recipient = normalizeLuxorEmailAddress(input.currentEmail)
  const bounce = input.bounce && typeof input.bounce === 'object' ? input.bounce : null
  if (!leadId || !bounce) return null

  const bounceAddress = normalizeLuxorEmailAddress(bounce.address)
  const bounceAt = finiteTime(bounce.occurredAt)
  const bounceEventKey = bounceIdentity(leadId, recipient, bounceAddress, bounceAt, bounce.providerEventId)
  if (!recipient) {
    return { kind: 'warning', leadId, recipient, bounceAddress, bounceEventKey, bounceAt, currentAddress: false }
  }

  const matching = input.messages
    .map((message, index) => ({ message, index, at: finiteTime(message.receivedAt) }))
    .filter(({ message, at }) => message.direction === 'outgoing' && Boolean(message.id) && at !== null && addressesFromHeader(message.to).has(recipient))

  const correction = bounceAt === null
    ? null
    : matching
      .map(({ message, index, at }) => ({
        message,
        index,
        at: at as number,
        delivery: resolvedDelivery(message.deliveryStatus),
      }))
      .filter((entry) => entry.at > bounceAt && entry.delivery !== null)
      .sort((a, b) => a.at - b.at || b.index - a.index)[0] || null

  if (!correction || !recipient) {
    return {
      kind: 'warning',
      leadId,
      recipient,
      bounceAddress,
      bounceEventKey,
      bounceAt,
      currentAddress: Boolean(recipient && bounceAddress === recipient),
    }
  }

  const supersededByLaterEmail = matching.some(({ message, index, at }) => {
    if (!message.id || message.id === correction.message.id || at === null) return false
    if (!resolvedDelivery(message.deliveryStatus)) return false
    return at > correction.at || (at === correction.at && index < correction.index)
  })

  return {
    kind: 'resolved',
    leadId,
    recipient,
    bounceAddress,
    bounceEventKey,
    bounceAt: bounceAt as number,
    successEventId: String(correction.message.id),
    sentAt: correction.at,
    delivery: correction.delivery as 'sent' | 'delivered',
    supersededByLaterEmail,
  }
}

export function leadEmailNoticeStorageKey(leadId: string) {
  return `luxor-lead-email-notice:v1:${encodeURIComponent(leadId)}`
}

function trackerMatches(tracker: unknown, resolution: Extract<LeadEmailNoticeResolution, { kind: 'resolved' }>): tracker is LeadEmailNoticeTracker {
  if (!tracker || typeof tracker !== 'object') return false
  const value = tracker as Partial<LeadEmailNoticeTracker>
  return normalizeLuxorEmailAddress(value.recipient) === resolution.recipient
    && value.bounceEventKey === resolution.bounceEventKey
    && value.successEventId === resolution.successEventId
    && typeof value.firstSeenAt === 'number'
    && Number.isFinite(value.firstSeenAt)
    && (value.dismissedAt === null || (typeof value.dismissedAt === 'number' && Number.isFinite(value.dismissedAt)))
}

export function loadLeadEmailNoticeTracker(
  storage: NoticeStorage | null | undefined,
  resolution: Extract<LeadEmailNoticeResolution, { kind: 'resolved' }>,
) {
  if (!storage) return null
  try {
    const saved = storage.getItem(leadEmailNoticeStorageKey(resolution.leadId))
    if (!saved) return null
    const parsed: unknown = JSON.parse(saved)
    return trackerMatches(parsed, resolution) ? parsed : null
  } catch {
    return null
  }
}

export function ensureLeadEmailNoticeTracker(
  storage: NoticeStorage | null | undefined,
  resolution: Extract<LeadEmailNoticeResolution, { kind: 'resolved' }>,
  now = Date.now(),
) {
  const existing = loadLeadEmailNoticeTracker(storage, resolution)
  if (existing) return existing

  const tracker: LeadEmailNoticeTracker = {
    recipient: resolution.recipient,
    bounceEventKey: resolution.bounceEventKey,
    successEventId: resolution.successEventId,
    firstSeenAt: now,
    dismissedAt: null,
  }
  try {
    storage?.setItem(leadEmailNoticeStorageKey(resolution.leadId), JSON.stringify(tracker))
  } catch {
    // The in-memory notice still works when browser storage is unavailable.
  }
  return tracker
}

export function dismissLeadEmailNoticeTracker(
  storage: NoticeStorage | null | undefined,
  resolution: Extract<LeadEmailNoticeResolution, { kind: 'resolved' }>,
  tracker: LeadEmailNoticeTracker,
  now = Date.now(),
) {
  if (!trackerMatches(tracker, resolution)) return tracker
  const dismissed = { ...tracker, dismissedAt: now }
  try {
    storage?.setItem(leadEmailNoticeStorageKey(resolution.leadId), JSON.stringify(dismissed))
  } catch {
    // Keep the dismissal for this page session if browser storage is unavailable.
  }
  return dismissed
}

export function isLeadEmailNoticeVisible(
  resolution: LeadEmailNoticeResolution | null,
  tracker: LeadEmailNoticeTracker | null,
  now = Date.now(),
) {
  return Boolean(
    resolution?.kind === 'resolved'
    && !resolution.supersededByLaterEmail
    && tracker
    && trackerMatches(tracker, resolution)
    && tracker.dismissedAt === null
    && now >= tracker.firstSeenAt
    && now < tracker.firstSeenAt + LUXOR_EMAIL_NOTICE_TTL_MS,
  )
}

export function publishLuxorEmailSent(detail: LeadEmailSentEventDetail) {
  if (typeof window === 'undefined' || !detail.recipient) return
  window.dispatchEvent(new CustomEvent<LeadEmailSentEventDetail>(LUXOR_EMAIL_SENT_EVENT, { detail }))
}
