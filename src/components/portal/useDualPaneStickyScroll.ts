'use client'

import { useEffect, useRef } from 'react'

interface DualPaneStickyScrollOptions {
  enabled?: boolean
  topOffset?: number
  bottomOffset?: number
  minBreakpointWidth?: number
}

/**
 * Synchronizes dual-column scrolling with a single page scrollbar:
 * Whichever column has shorter content stops scrolling when its bottom reaches the
 * bottom of the viewport (or its top reaches below the header if shorter than the viewport),
 * eliminating empty whitespace while the longer column finishes scrolling.
 * When scrolling up, it scrolls naturally so content above remains easily readable.
 */
export function useDualPaneStickyScroll({
  enabled = true,
  topOffset = 80,
  bottomOffset = 24,
  minBreakpointWidth = 1280, // xl breakpoint
}: DualPaneStickyScrollOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const leftPaneRef = useRef<HTMLDivElement | null>(null)
  const rightPaneRef = useRef<HTMLDivElement | null>(null)

  const stateRef = useRef({
    prevScrollY: 0,
    leftTranslate: 0,
    rightTranslate: 0,
    rafId: 0,
  })

  useEffect(() => {
    stateRef.current.prevScrollY = typeof window !== 'undefined' ? window.scrollY : 0

    const updateTransforms = () => {
      const container = containerRef.current
      const leftPane = leftPaneRef.current
      const rightPane = rightPaneRef.current

      if (!container || !leftPane || !rightPane) return

      // Disabled or screen narrower than breakpoint (columns stacked vertically)
      if (!enabled || window.innerWidth < minBreakpointWidth) {
        if (stateRef.current.leftTranslate !== 0) {
          leftPane.style.transform = ''
          stateRef.current.leftTranslate = 0
        }
        if (stateRef.current.rightTranslate !== 0) {
          rightPane.style.transform = ''
          stateRef.current.rightTranslate = 0
        }
        return
      }

      const leftHeight = leftPane.offsetHeight
      const rightHeight = rightPane.offsetHeight

      // If heights are almost equal, no translation needed
      if (Math.abs(leftHeight - rightHeight) < 16) {
        if (stateRef.current.leftTranslate !== 0) {
          leftPane.style.transform = ''
          stateRef.current.leftTranslate = 0
        }
        if (stateRef.current.rightTranslate !== 0) {
          rightPane.style.transform = ''
          stateRef.current.rightTranslate = 0
        }
        return
      }

      const scrollY = window.scrollY || window.pageYOffset || 0
      const delta = scrollY - stateRef.current.prevScrollY
      stateRef.current.prevScrollY = scrollY

      const viewportHeight = window.innerHeight

      if (leftHeight < rightHeight) {
        // Left pane is shorter
        if (stateRef.current.rightTranslate !== 0) {
          rightPane.style.transform = ''
          stateRef.current.rightTranslate = 0
        }

        const maxTranslate = rightHeight - leftHeight
        const isTallerThanViewport = leftHeight > (viewportHeight - topOffset - bottomOffset)
        const leftRect = leftPane.getBoundingClientRect()
        let nextTranslate = stateRef.current.leftTranslate

        if (isTallerThanViewport) {
          const bottomTarget = viewportHeight - bottomOffset
          if (delta > 0 && leftRect.bottom <= bottomTarget) {
            nextTranslate = Math.min(maxTranslate, nextTranslate + delta)
          } else if (delta < 0 && leftRect.top >= topOffset) {
            nextTranslate = Math.max(0, nextTranslate + delta)
          }
        } else {
          // Shorter than viewport: pin to topOffset when scrolling down
          if (delta > 0 && leftRect.top <= topOffset) {
            nextTranslate = Math.min(maxTranslate, nextTranslate + delta)
          } else if (delta < 0) {
            nextTranslate = Math.max(0, nextTranslate + delta)
          }
        }

        // Clamp within allowable bounds
        nextTranslate = Math.max(0, Math.min(maxTranslate, nextTranslate))

        if (nextTranslate !== stateRef.current.leftTranslate) {
          stateRef.current.leftTranslate = nextTranslate
          leftPane.style.transform = nextTranslate > 0 ? `translate3d(0, ${Math.round(nextTranslate)}px, 0)` : ''
        }
      } else {
        // Right pane is shorter
        if (stateRef.current.leftTranslate !== 0) {
          leftPane.style.transform = ''
          stateRef.current.leftTranslate = 0
        }

        const maxTranslate = leftHeight - rightHeight
        const isTallerThanViewport = rightHeight > (viewportHeight - topOffset - bottomOffset)
        const rightRect = rightPane.getBoundingClientRect()
        let nextTranslate = stateRef.current.rightTranslate

        if (isTallerThanViewport) {
          const bottomTarget = viewportHeight - bottomOffset
          if (delta > 0 && rightRect.bottom <= bottomTarget) {
            nextTranslate = Math.min(maxTranslate, nextTranslate + delta)
          } else if (delta < 0 && rightRect.top >= topOffset) {
            nextTranslate = Math.max(0, nextTranslate + delta)
          }
        } else {
          // Shorter than viewport: pin to topOffset when scrolling down
          if (delta > 0 && rightRect.top <= topOffset) {
            nextTranslate = Math.min(maxTranslate, nextTranslate + delta)
          } else if (delta < 0) {
            nextTranslate = Math.max(0, nextTranslate + delta)
          }
        }

        // Clamp within allowable bounds
        nextTranslate = Math.max(0, Math.min(maxTranslate, nextTranslate))

        if (nextTranslate !== stateRef.current.rightTranslate) {
          stateRef.current.rightTranslate = nextTranslate
          rightPane.style.transform = nextTranslate > 0 ? `translate3d(0, ${Math.round(nextTranslate)}px, 0)` : ''
        }
      }
    }

    const onScrollOrResize = () => {
      if (stateRef.current.rafId) {
        cancelAnimationFrame(stateRef.current.rafId)
      }
      stateRef.current.rafId = requestAnimationFrame(updateTransforms)
    }

    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize, { passive: true })

    // Observe changes in element heights (e.g., accordions toggling, dynamic lines loaded)
    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        onScrollOrResize()
      })
      if (containerRef.current) resizeObserver.observe(containerRef.current)
      if (leftPaneRef.current) resizeObserver.observe(leftPaneRef.current)
      if (rightPaneRef.current) resizeObserver.observe(rightPaneRef.current)
    }

    // Initial check
    onScrollOrResize()

    return () => {
      window.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
      if (resizeObserver) resizeObserver.disconnect()
      if (stateRef.current.rafId) cancelAnimationFrame(stateRef.current.rafId)
      if (leftPaneRef.current) leftPaneRef.current.style.transform = ''
      if (rightPaneRef.current) rightPaneRef.current.style.transform = ''
    }
  }, [enabled, topOffset, bottomOffset, minBreakpointWidth])

  return {
    containerRef,
    leftPaneRef,
    rightPaneRef,
  }
}
