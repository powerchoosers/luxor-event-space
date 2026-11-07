'use client'

import React, { useEffect, useState, useRef, useLayoutEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'framer-motion'

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

interface ActiveTooltipData {
  id: string
  text: string
  rect: DOMRect
  side: TooltipSide
  target: HTMLElement
  left: number
  top: number
}

const SHOW_DELAY_MS = 450
const WARM_DELAY_MS = 80
const WARM_WINDOW_MS = 320

const emptySubscribe = () => () => {}

function determineSide(rect: DOMRect, preferredSide?: string | null): TooltipSide {
  if (
    preferredSide === 'top' ||
    preferredSide === 'bottom' ||
    preferredSide === 'left' ||
    preferredSide === 'right'
  ) {
    return preferredSide
  }
  // Collapsed left-hand nav or elements against left edge
  if (rect.left < 90 && rect.top > 55) {
    return 'right'
  }
  // Header items near the top of the viewport
  if (rect.top < 52) {
    return 'bottom'
  }
  // Default to top if there is room, otherwise bottom
  if (rect.top >= 40) {
    return 'top'
  }
  return 'bottom'
}

function computeInitialPosition(
  rect: DOMRect,
  side: TooltipSide,
  estimatedWidth: number,
  estimatedHeight: number
) {
  const margin = 8
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800

  let left = 0
  let top = 0

  if (side === 'top') {
    left = rect.left + rect.width / 2 - estimatedWidth / 2
    top = rect.top - 8 - estimatedHeight
  } else if (side === 'bottom') {
    left = rect.left + rect.width / 2 - estimatedWidth / 2
    top = rect.bottom + 8
  } else if (side === 'right') {
    left = rect.right + 10
    top = rect.top + rect.height / 2 - estimatedHeight / 2
  } else {
    // left
    left = rect.left - 10 - estimatedWidth
    top = rect.top + rect.height / 2 - estimatedHeight / 2
  }

  // Viewport clamping
  left = Math.max(margin, Math.min(left, viewportWidth - margin - estimatedWidth))
  top = Math.max(margin, Math.min(top, viewportHeight - margin - estimatedHeight))

  return { left, top }
}

export function PortalGlobalTooltip() {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltipData | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  const activeTargetRef = useRef<HTMLElement | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const lastClosedTimeRef = useRef<number>(0)
  const prefersReduced = useReducedMotion()

  // Restore title and reset cached attributes
  const cleanupTarget = (el: HTMLElement) => {
    if (el.hasAttribute('data-portal-cached-title')) {
      const cached = el.getAttribute('data-portal-cached-title')
      if (cached) {
        el.setAttribute('title', cached)
      }
      el.removeAttribute('data-portal-cached-title')
    }
    if (el.getAttribute('data-portal-added-aria') === 'true') {
      el.removeAttribute('aria-label')
      el.removeAttribute('data-portal-added-aria')
    }
  }

  const hideTooltipImmediate = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (activeTargetRef.current) {
      cleanupTarget(activeTargetRef.current)
      activeTargetRef.current = null
    }
    setActiveTooltip((prev) => {
      if (prev) {
        lastClosedTimeRef.current = Date.now()
      }
      return null
    })
  }

  // Precisely measure the rendered tooltip element and center it dead-on the target
  useLayoutEffect(() => {
    if (!activeTooltip || !tooltipRef.current) return

    const tooltipEl = tooltipRef.current
    const width = tooltipEl.offsetWidth
    const height = tooltipEl.offsetHeight
    const { rect, side } = activeTooltip

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const margin = 8

    let left = 0
    let top = 0

    if (side === 'top') {
      left = rect.left + rect.width / 2 - width / 2
      top = rect.top - 8 - height
    } else if (side === 'bottom') {
      left = rect.left + rect.width / 2 - width / 2
      top = rect.bottom + 8
    } else if (side === 'right') {
      left = rect.right + 10
      top = rect.top + rect.height / 2 - height / 2
    } else {
      // left
      left = rect.left - 10 - width
      top = rect.top + rect.height / 2 - height / 2
    }

    // Clamp within viewport
    left = Math.max(margin, Math.min(left, viewportWidth - margin - width))
    top = Math.max(margin, Math.min(top, viewportHeight - margin - height))

    tooltipEl.style.left = `${left}px`
    tooltipEl.style.top = `${top}px`
  }, [activeTooltip])

  useEffect(() => {
    if (!mounted) return

    const handlePointerOver = (event: PointerEvent) => {
      // Skip touch interactions
      if (event.pointerType === 'touch') return

      const rawTarget = event.target as Element | null
      const target = rawTarget?.closest?.('[title], [data-portal-tooltip], [data-tooltip]') as HTMLElement | null

      if (!target) return

      // Ignore if user moved within the same active target
      if (activeTargetRef.current === target) return

      // Clean up previous target if any
      if (activeTargetRef.current && activeTargetRef.current !== target) {
        cleanupTarget(activeTargetRef.current)
      }

      const titleAttr = target.getAttribute('title')
      const customAttr = target.getAttribute('data-portal-tooltip') || target.getAttribute('data-tooltip')
      const text = (customAttr || titleAttr || '').trim()

      if (!text) {
        activeTargetRef.current = null
        return
      }

      // Temporarily stash the native title attribute to prevent system tooltip
      if (titleAttr) {
        target.setAttribute('data-portal-cached-title', titleAttr)
        target.removeAttribute('title')
      }

      // Ensure screen readers still have an accessible name if none was set
      if (!target.getAttribute('aria-label')) {
        target.setAttribute('aria-label', text)
        target.setAttribute('data-portal-added-aria', 'true')
      }

      activeTargetRef.current = target

      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }

      const now = Date.now()
      const isWarm = lastClosedTimeRef.current && now - lastClosedTimeRef.current < WARM_WINDOW_MS
      const delay = isWarm ? WARM_DELAY_MS : SHOW_DELAY_MS

      const targetSide = target.getAttribute('data-tooltip-side')

      timerRef.current = setTimeout(() => {
        if (!target.isConnected) {
          cleanupTarget(target)
          activeTargetRef.current = null
          return
        }

        const rect = target.getBoundingClientRect()
        const side = determineSide(rect, targetSide)
        const estimatedWidth = Math.min(300, Math.max(48, text.length * 6.5 + 24))
        const estimatedHeight = 26
        const initialPos = computeInitialPosition(rect, side, estimatedWidth, estimatedHeight)

        setActiveTooltip({
          id: `tooltip-${Math.random().toString(36).slice(2, 9)}`,
          text,
          rect,
          side,
          target,
          left: initialPos.left,
          top: initialPos.top,
        })
      }, delay)
    }

    const handlePointerOut = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return

      const current = activeTargetRef.current
      if (!current) return

      const related = event.relatedTarget as Node | null
      // Moving inside the same target or its descendants
      if (related && current.contains(related)) {
        return
      }

      cleanupTarget(current)
      activeTargetRef.current = null

      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }

      setActiveTooltip((prev) => {
        if (prev) {
          lastClosedTimeRef.current = Date.now()
        }
        return null
      })
    }

    const handleFocusIn = (event: FocusEvent) => {
      const rawTarget = event.target as Element | null
      const target = rawTarget?.closest?.('[title], [data-portal-tooltip], [data-tooltip]') as HTMLElement | null

      if (!target || activeTargetRef.current === target) return

      if (activeTargetRef.current && activeTargetRef.current !== target) {
        cleanupTarget(activeTargetRef.current)
      }

      const titleAttr = target.getAttribute('title')
      const customAttr = target.getAttribute('data-portal-tooltip') || target.getAttribute('data-tooltip')
      const text = (customAttr || titleAttr || '').trim()

      if (!text) return

      if (titleAttr) {
        target.setAttribute('data-portal-cached-title', titleAttr)
        target.removeAttribute('title')
      }

      activeTargetRef.current = target

      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }

      const targetSide = target.getAttribute('data-tooltip-side')

      timerRef.current = setTimeout(() => {
        if (!target.isConnected) {
          cleanupTarget(target)
          activeTargetRef.current = null
          return
        }

        const rect = target.getBoundingClientRect()
        const side = determineSide(rect, targetSide)
        const estimatedWidth = Math.min(300, Math.max(48, text.length * 6.5 + 24))
        const estimatedHeight = 26
        const initialPos = computeInitialPosition(rect, side, estimatedWidth, estimatedHeight)

        setActiveTooltip({
          id: `tooltip-${Math.random().toString(36).slice(2, 9)}`,
          text,
          rect,
          side,
          target,
          left: initialPos.left,
          top: initialPos.top,
        })
      }, SHOW_DELAY_MS)
    }

    const handleFocusOut = (event: FocusEvent) => {
      const current = activeTargetRef.current
      if (!current) return

      const related = event.relatedTarget as Node | null
      if (related && current.contains(related)) return

      cleanupTarget(current)
      activeTargetRef.current = null

      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }

      setActiveTooltip((prev) => {
        if (prev) {
          lastClosedTimeRef.current = Date.now()
        }
        return null
      })
    }

    const handleDismissImmediate = () => {
      hideTooltipImmediate()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        hideTooltipImmediate()
      }
    }

    document.addEventListener('pointerover', handlePointerOver, { capture: true })
    document.addEventListener('pointerout', handlePointerOut, { capture: true })
    document.addEventListener('focusin', handleFocusIn, { capture: true })
    document.addEventListener('focusout', handleFocusOut, { capture: true })
    document.addEventListener('pointerdown', handleDismissImmediate, { capture: true })
    document.addEventListener('scroll', handleDismissImmediate, { capture: true, passive: true })
    window.addEventListener('resize', handleDismissImmediate, { passive: true })
    window.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      document.removeEventListener('pointerover', handlePointerOver, { capture: true })
      document.removeEventListener('pointerout', handlePointerOut, { capture: true })
      document.removeEventListener('focusin', handleFocusIn, { capture: true })
      document.removeEventListener('focusout', handleFocusOut, { capture: true })
      document.removeEventListener('pointerdown', handleDismissImmediate, { capture: true })
      document.removeEventListener('scroll', handleDismissImmediate, { capture: true })
      window.removeEventListener('resize', handleDismissImmediate)
      window.removeEventListener('keydown', handleKeyDown, { capture: true })

      if (activeTargetRef.current) {
        cleanupTarget(activeTargetRef.current)
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [mounted])

  if (!mounted) return null

  const getMotionConfig = (side: TooltipSide) => {
    if (prefersReduced) {
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.01 },
      }
    }

    let initialOffset = { x: 0, y: 0 }
    let exitOffset = { x: 0, y: 0 }

    if (side === 'top') {
      initialOffset = { x: 0, y: 4 }
      exitOffset = { x: 0, y: 2 }
    } else if (side === 'bottom') {
      initialOffset = { x: 0, y: -4 }
      exitOffset = { x: 0, y: -2 }
    } else if (side === 'right') {
      initialOffset = { x: -6, y: 0 }
      exitOffset = { x: -4, y: 0 }
    } else if (side === 'left') {
      initialOffset = { x: 6, y: 0 }
      exitOffset = { x: 4, y: 0 }
    }

    const transition: Transition = { duration: 0.15, ease: [0.16, 1, 0.3, 1] }

    return {
      initial: { opacity: 0, scale: 0.96, ...initialOffset },
      animate: { opacity: 1, scale: 1, x: 0, y: 0 },
      exit: { opacity: 0, scale: 0.96, ...exitOffset },
      transition,
    }
  }

  return createPortal(
    <AnimatePresence>
      {activeTooltip && (
        <motion.div
          key={activeTooltip.id}
          ref={tooltipRef}
          role="tooltip"
          {...getMotionConfig(activeTooltip.side)}
          style={{
            position: 'fixed',
            left: `${activeTooltip.left}px`,
            top: `${activeTooltip.top}px`,
            pointerEvents: 'none',
          }}
          className={`z-[9999] select-none rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95 px-2.5 py-1.5 font-sans text-[10px] font-bold text-[color:var(--portal-text)] shadow-xl backdrop-blur-xl ${
            activeTooltip.text.length > 40 || activeTooltip.text.includes('\n')
              ? 'max-w-xs whitespace-normal leading-tight text-left'
              : 'whitespace-nowrap'
          }`}
        >
          {activeTooltip.text}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
