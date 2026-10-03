'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  push?: (...args: unknown[]) => void
  queue?: unknown[][]
  loaded?: boolean
  version?: string
}

declare global {
  interface Window {
    fbq?: Fbq
    _fbq?: Fbq
    __luxorMetaPixelReady?: boolean
  }
}

const pixelId = '28920520380920564'

const publicMarketingPaths = new Set([
  '/',
  '/contact',
  '/es',
  '/es/contact',
  '/es/tour',
  '/es/visit',
  '/events',
  '/gallery',
  '/grand-opening-rsvp',
  '/spaces',
  '/tour',
  '/visit',
])

function isPublicMarketingPage(pathname: string) {
  if (publicMarketingPaths.has(pathname)) return true

  const eventSlugMatch = pathname.match(/^\/events\/([a-z0-9]+(?:-[a-z0-9]+)*)$/)
  return Boolean(eventSlugMatch)
}

function hasUnsafeSameOriginReferrer() {
  if (!document.referrer) return false

  try {
    const referrer = new URL(document.referrer)
    return referrer.origin === window.location.origin && (
      !isPublicMarketingPage(referrer.pathname) ||
      Boolean(referrer.hash) ||
      !isSafeCampaignQuery(referrer.search)
    )
  } catch {
    return true
  }
}

const utmParameterNames = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
])

function isSafeCampaignQuery(search: string) {
  if (!search) return true

  const params = new URLSearchParams(search)
  const seen = new Set<string>()
  for (const [key, value] of params) {
    if (seen.has(key)) return false
    seen.add(key)

    if (key === 'fbclid') {
      if (!/^[A-Za-z0-9_-]{20,300}$/.test(value)) return false
      continue
    }

    // UTM values are campaign labels, not arbitrary input. Restrict them to
    // short URL-safe slugs and reject email/phone-like values. All other query
    // keys (including booking and form fields) disable tracking for this SPA.
    if (
      !utmParameterNames.has(key) ||
      value.length > 60 ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ||
      /\d{7,}/.test(value) ||
      /(?:email|phone|mobile|guest|customer|full[-_]?name)/i.test(value)
    ) return false
  }
  return true
}

function isSafeCampaignLanding() {
  if (!isSafeCampaignQuery(window.location.search)) return false
  // Only short UTM campaign slugs and Meta's opaque click identifier can reach
  // Meta. Other query values can contain customer or event details, so they
  // disable tracking for this SPA session.
  return true
}

function MetaPixelTrackerInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const [hash, setHash] = useState(() => typeof window === 'undefined' ? '' : window.location.hash)
  const trackingDisabled = useRef(false)
  const lastPageViewPath = useRef<string | null>(null)

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash)
    updateHash()
    window.addEventListener('hashchange', updateHash)
    return () => window.removeEventListener('hashchange', updateHash)
  }, [])

  useEffect(() => {
    if (
      !isPublicMarketingPage(pathname) ||
      !isSafeCampaignLanding() ||
      hash ||
      hasUnsafeSameOriginReferrer()
    ) {
      trackingDisabled.current = true
    }

    if (trackingDisabled.current) {
      // If the script was loaded on an earlier route in this SPA session,
      // disable pixel tracking before the visitor interacts with this page.
      window.fbq?.('consent', 'revoke')
      return
    }

    // Only allowlisted campaign metadata and Meta's opaque click id may remain
    // in the URL when the browser Pixel reports the page location.
    if (typeof window.fbq !== 'function') {
      const fbq = ((...args: unknown[]) => {
        if (fbq.callMethod) fbq.callMethod(...args)
        else fbq.queue?.push(args)
      }) as Fbq
      fbq.queue = []
      fbq.loaded = true
      fbq.version = '2.0'
      window.fbq = fbq
      if (!window._fbq) window._fbq = fbq
      fbq.push = fbq

      const script = document.createElement('script')
      script.async = true
      script.id = 'luxor-meta-pixel-script'
      script.src = 'https://connect.facebook.net/en_US/fbevents.js'
      script.onload = () => {
        window.__luxorMetaPixelReady = true
        if (
          !trackingDisabled.current &&
          isPublicMarketingPage(window.location.pathname) &&
          isSafeCampaignQuery(window.location.search) &&
          !window.location.hash &&
          !hasUnsafeSameOriginReferrer()
        ) {
          lastPageViewPath.current = window.location.pathname
          window.fbq?.('consent', 'grant')
          window.fbq?.('track', 'PageView')
        } else {
          window.fbq?.('consent', 'revoke')
        }
      }
      document.head.appendChild(script)

      fbq('set', 'autoConfig', false, pixelId)
      fbq('init', pixelId)
    }

    if (window.__luxorMetaPixelReady && lastPageViewPath.current !== pathname) {
      lastPageViewPath.current = pathname
      window.fbq?.('consent', 'grant')
      window.fbq?.('track', 'PageView')
    }
  }, [hash, pathname, search])

  return null
}

export function MetaPixelTracker() {
  return (
    <Suspense fallback={null}>
      <MetaPixelTrackerInner />
    </Suspense>
  )
}
