'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue?: unknown[][]
  loaded?: boolean
  version?: string
}

declare global {
  interface Window {
    fbq?: Fbq
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
      !isPublicMarketingPage(referrer.pathname) || Boolean(referrer.search || referrer.hash)
    )
  } catch {
    return true
  }
}

export function MetaPixelTracker() {
  const pathname = usePathname()
  const trackingDisabled = useRef(false)

  useEffect(() => {
    if (
      !isPublicMarketingPage(pathname) ||
      window.location.search ||
      window.location.hash ||
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

    // Meta derives the page URL from window.location.href; only clean URLs reach it.
    if (typeof window.fbq !== 'function') {
      const fbq = ((...args: unknown[]) => {
        if (fbq.callMethod) fbq.callMethod(...args)
        else fbq.queue?.push(args)
      }) as Fbq
      fbq.queue = []
      fbq.loaded = true
      fbq.version = '2.0'
      window.fbq = fbq

      const script = document.createElement('script')
      script.async = true
      script.id = 'luxor-meta-pixel-script'
      script.src = 'https://connect.facebook.net/en_US/fbevents.js'
      script.onload = () => {
        window.__luxorMetaPixelReady = true
        if (
          !trackingDisabled.current &&
          isPublicMarketingPage(window.location.pathname) &&
          !window.location.search &&
          !window.location.hash &&
          !hasUnsafeSameOriginReferrer()
        ) {
          window.fbq?.('consent', 'grant')
          window.fbq?.('track', 'PageView')
        } else {
          window.fbq?.('consent', 'revoke')
        }
      }
      document.head.appendChild(script)

      fbq('init', pixelId)
    }

    if (window.__luxorMetaPixelReady) {
      window.fbq?.('consent', 'grant')
      window.fbq?.('track', 'PageView')
    }
  }, [pathname])

  return null
}
