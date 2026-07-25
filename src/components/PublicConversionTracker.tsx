'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { getLuxorPublicAttribution, getLuxorPublicSessionId, trackLuxorPublicEvent } from '@/lib/luxorPublicAttribution'

export function PublicConversionTracker() {
  const pathname = usePathname()
  const previousPath = useRef<string | null>(null)

  useEffect(() => {
    getLuxorPublicAttribution()
    getLuxorPublicSessionId()

    if (previousPath.current !== pathname) {
      previousPath.current = pathname
      trackLuxorPublicEvent('page_view')
    }
  }, [pathname])

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-conversion]') : null
      if (!target) return

      trackLuxorPublicEvent(target.dataset.conversion || 'cta_click', {
        label: target.dataset.conversionLabel || target.textContent?.trim().slice(0, 120) || null,
        href: target instanceof HTMLAnchorElement ? target.href : null,
      })
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return null
}
