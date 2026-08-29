'use client'

import Lenis from 'lenis'
import { useEffect } from 'react'

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
 * Smooth page-level scrolling with explicit native-panel handoff.
 * Reduced-motion users retain the browser's native behavior.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const lenis = new Lenis({
      anchors: true,
      autoRaf: true,
      lerp: 0.12,
      smoothWheel: true,
      allowNestedScroll: false,
      prevent: (node) => node.matches(NATIVE_SCROLL_SELECTOR),
      virtualScroll: ({ deltaY, event }) => !locksPageScroll(event) && findNativeScroller(event, deltaY) === null,
      stopInertiaOnNavigate: true,
    })

    return () => lenis.destroy()
  }, [])

  return null
}
