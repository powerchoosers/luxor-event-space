'use client'

import type { LuxorPublicAttribution } from './luxorInquiryTypes'

const ATTRIBUTION_KEY = 'luxor_public_attribution'
const SESSION_KEY = 'luxor_public_session_id'

function compact(value: string | null) {
  return value?.trim().slice(0, 500) || undefined
}

export function getLuxorPublicSessionId() {
  if (typeof window === 'undefined') return ''

  const existing = window.sessionStorage.getItem(SESSION_KEY)
  if (existing) return existing

  const created = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  window.sessionStorage.setItem(SESSION_KEY, created)
  return created
}

export function getLuxorPublicAttribution(): LuxorPublicAttribution {
  if (typeof window === 'undefined') return {}

  const stored = window.sessionStorage.getItem(ATTRIBUTION_KEY)
  if (stored) {
    try {
      return JSON.parse(stored) as LuxorPublicAttribution
    } catch {
      window.sessionStorage.removeItem(ATTRIBUTION_KEY)
    }
  }

  const params = new URLSearchParams(window.location.search)
  const attribution: LuxorPublicAttribution = {
    landingPage: `${window.location.pathname}${window.location.search}`.slice(0, 500),
    initialReferrer: compact(document.referrer),
    utmSource: compact(params.get('utm_source')),
    utmMedium: compact(params.get('utm_medium')),
    utmCampaign: compact(params.get('utm_campaign')),
    utmContent: compact(params.get('utm_content')),
    utmTerm: compact(params.get('utm_term')),
    gclid: compact(params.get('gclid')),
    fbclid: compact(params.get('fbclid')),
  }

  window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution))
  return attribution
}

export function trackLuxorPublicEvent(eventName: string, metadata: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return

  const payload = JSON.stringify({
    eventName,
    sessionId: getLuxorPublicSessionId(),
    pagePath: window.location.pathname,
    source: getLuxorPublicAttribution().utmSource || 'direct',
    metadata: {
      ...metadata,
      attribution: getLuxorPublicAttribution(),
    },
  })

  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/public/events', new Blob([payload], { type: 'application/json' }))
    return
  }

  void fetch('/api/public/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  })
}
