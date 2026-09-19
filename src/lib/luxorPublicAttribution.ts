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

export function classifyTrafficSource(attr: LuxorPublicAttribution): string {
  const utmSource = (attr.utmSource || '').toLowerCase()
  const utmMedium = (attr.utmMedium || '').toLowerCase()
  const referrer = (attr.initialReferrer || '').toLowerCase()

  if (attr.gclid || utmMedium === 'cpc' || utmMedium === 'paidsearch' || utmSource.includes('adwords') || utmSource.includes('googleads')) {
    return 'Google Ads'
  }
  if (attr.fbclid || utmMedium === 'paidsocial' || utmSource.includes('meta_ads') || utmSource.includes('facebook_ads') || utmSource.includes('instagram_ads')) {
    return 'Meta Ads'
  }
  if (utmSource.includes('instagram') || referrer.includes('instagram.com') || referrer.includes('l.instagram.com')) {
    return 'Instagram'
  }
  if (utmSource.includes('facebook') || referrer.includes('facebook.com') || referrer.includes('l.facebook.com') || referrer.includes('fb.com')) {
    return 'Facebook'
  }
  if (utmSource.includes('tiktok') || referrer.includes('tiktok.com')) {
    return 'TikTok'
  }
  if (utmSource.includes('google') || referrer.includes('google.com') || referrer.includes('google.es')) {
    return 'Google / Organic Search'
  }
  if (utmSource.includes('bing') || utmSource.includes('yahoo') || utmSource.includes('duckduckgo')) {
    return 'Google / Organic Search'
  }
  if (referrer && !referrer.includes('luxoratlaspalmas.com') && !referrer.includes('localhost')) {
    return 'Referral'
  }
  if (!referrer || referrer.includes('luxoratlaspalmas.com') || referrer.includes('localhost')) {
    return 'Direct'
  }
  return 'Other'
}

export function trackLuxorPublicEvent(eventName: string, metadata: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return

  const attribution = getLuxorPublicAttribution()
  const channel = classifyTrafficSource(attribution)
  const source = attribution.utmSource || channel

  // Forward event to Google Analytics (gtag) if loaded
  try {
    if (typeof (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag === 'function') {
      ;(window as unknown as { gtag: (...args: unknown[]) => void }).gtag('event', eventName, {
        event_category: 'engagement',
        event_label: metadata.label || eventName,
        page_path: window.location.pathname,
        traffic_channel: channel,
        ...metadata,
      })
    }
  } catch {
    // Ignore gtag error
  }

  const payload = JSON.stringify({
    eventName,
    sessionId: getLuxorPublicSessionId(),
    pagePath: window.location.pathname,
    source,
    metadata: {
      ...metadata,
      channel,
      attribution,
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
