'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { getLuxorPublicAttribution, getLuxorPublicSessionId, trackLuxorPublicEvent } from '@/lib/luxorPublicAttribution'

export function PublicConversionTracker() {
  const pathname = usePathname()
  const previousPath = useRef<string | null>(null)
  const sessionVisitLogged = useRef<boolean>(false)

  useEffect(() => {
    getLuxorPublicAttribution()
    const sessionId = getLuxorPublicSessionId()

    // Log website_visit once per session in this window
    if (!sessionVisitLogged.current && typeof window !== 'undefined') {
      const visitKey = `luxor_visit_logged_${sessionId}`
      if (!window.sessionStorage.getItem(visitKey)) {
        window.sessionStorage.setItem(visitKey, 'true')
        trackLuxorPublicEvent('website_visit')
      }
      sessionVisitLogged.current = true
    }

    if (previousPath.current !== pathname) {
      previousPath.current = pathname
      trackLuxorPublicEvent('page_view')

      if (pathname === '/tour' || pathname === '/es/tour' || pathname.startsWith('/tour') || pathname.startsWith('/visit')) {
        trackLuxorPublicEvent('visit_page_view')
      }
    }
  }, [pathname])

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-conversion], a, button') : null
      if (!target) return

      const conversion = target.dataset?.conversion
      const href = target instanceof HTMLAnchorElement ? target.href : ''
      const text = target.textContent?.trim().slice(0, 120) || ''

      // Explicit conversion attribute
      if (conversion) {
        trackLuxorPublicEvent(conversion, {
          label: target.dataset.conversionLabel || text || null,
          href: href || null,
        })
        return
      }

      // Legacy /tour links are retained only as redirects. Public analytics use the current visit vocabulary.
      const isVisitCta =
        (href && (href.includes('/tour') || href.includes('/visit') || href.includes('#visit-booking'))) ||
        /book a tour|schedule a tour|reservar recorrido|agendar recorrido|schedule a visit|schedule your visit|agendar visita|agendar una visita/i.test(text)

      if (isVisitCta && !target.closest('form#visit-booking')) {
        trackLuxorPublicEvent('visit_cta_click', {
          label: text || 'Visit Link',
          href: href || null,
        })
      }
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}
