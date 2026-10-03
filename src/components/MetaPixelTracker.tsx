'use client'

import { useEffect } from 'react'
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
  }
}

const pixelId = '28920520380920564'

function isPrivateOrTransactionalPage(pathname: string) {
  return (
    pathname === '/tour-response' ||
    pathname.startsWith('/tour-response/') ||
    pathname === '/payment/success' ||
    pathname.startsWith('/payment/success/') ||
    pathname === '/payment/cancelled' ||
    pathname.startsWith('/payment/cancelled/')
  )
}

export function MetaPixelTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (isPrivateOrTransactionalPage(pathname)) return

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
      script.src = 'https://connect.facebook.net/en_US/fbevents.js'
      document.head.appendChild(script)

      fbq('init', pixelId)
    }

    window.fbq?.('track', 'PageView')
  }, [pathname])

  return (
    <noscript>
      <img
        height="1"
        width="1"
        style={{ display: 'none' }}
        src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  )
}
