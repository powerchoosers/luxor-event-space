'use client'

import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

declare global {
  interface Window {
    __luxorLenis?: Lenis
  }
}

export function getLuxorLenis(): Lenis | undefined {
  if (typeof window === 'undefined') return undefined
  return window.__luxorLenis
}

const NATIVE_SCROLL_SELECTOR = [
  '[data-lenis-prevent]',
  '.portal-scrollbar',
  '.portal-modal-layer',
  '.portal-modal-body',
  '.portal-sheet',
  '[data-site-scroll-prevent]',
  '[role="dialog"]',
  'textarea',
].join(',')

const SCROLL_LOCK_SELECTOR = '[data-scroll-lock]'

function isScrollable(element: Element, deltaY: number) {
  if (!(element instanceof HTMLElement) || deltaY === 0) return false
  const style = window.getComputedStyle(element)
  if (!['auto', 'overlay', 'scroll'].includes(style.overflowY)) return false
  const max = element.scrollHeight - element.clientHeight
  if (max <= 0) return false
  return deltaY < 0 ? element.scrollTop > 0 : element.scrollTop < max
}

function findNativeScroller(event: Event, deltaY: number) {
  for (const item of event.composedPath()) {
    if (!(item instanceof HTMLElement)) continue
    if (item.matches(NATIVE_SCROLL_SELECTOR) && isScrollable(item, deltaY)) return item
  }
  return null
}

function locksPageScroll(event: Event) {
  return event.composedPath().some((item) => item instanceof HTMLElement && item.matches(SCROLL_LOCK_SELECTOR))
}

/**
 * Smooth luxury page-level scrolling with explicit native-panel handoff
 * and automatic synchronization with route navigation.
 * Reduced-motion users retain the browser's native behavior.
 */
export function SmoothScroll() {
  const pathname = usePathname()
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const lenis = new Lenis({
      autoRaf: true,
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.2,
      infinite: false,
      prevent: (node) => node.matches(NATIVE_SCROLL_SELECTOR),
      virtualScroll: ({ deltaY, event }) => !locksPageScroll(event) && findNativeScroller(event, deltaY) === null,
      stopInertiaOnNavigate: true,
    })

    lenisRef.current = lenis
    window.__luxorLenis = lenis

    return () => {
      lenis.destroy()
      lenisRef.current = null
      if (window.__luxorLenis === lenis) {
        delete window.__luxorLenis
      }
    }
  }, [])

  // Sync scroll position seamlessly on route change
  useEffect(() => {
    const lenis = lenisRef.current
    const hash = typeof window !== 'undefined' ? window.location.hash : ''

    if (hash) {
      const timer = window.setTimeout(() => {
        try {
          const target = document.querySelector(hash)
          if (target) {
            if (lenis) {
              lenis.scrollTo(target as HTMLElement, { offset: -80, duration: 1.1 })
            } else {
              target.scrollIntoView({ behavior: 'smooth' })
            }
          }
        } catch {
          // ignore selector errors
        }
      }, 80)
      return () => window.clearTimeout(timer)
    }

    if (lenis) {
      lenis.scrollTo(0, { immediate: true })
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  return null
}
