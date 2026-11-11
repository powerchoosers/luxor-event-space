'use client'

import { useEffect, useRef } from 'react'

interface PortalFloatingScrollbarProps {
  containerRef: React.RefObject<HTMLElement | null>
}

/**
 * PortalFloatingScrollbar
 * Replicates the native mobile overlay scrollbar on desktop:
 * - 0 layout width (absolute floating overlay).
 * - 1:1 instantaneous, zero-lag position sync via direct DOM transform (bypasses React state overhead).
 * - Appears on initial mount / navigation.
 * - Stays visible while scrolling, then smoothly fades out ~1.1s after scrolling stops.
 * - Instant fade-in upon scrolling.
 * - Draggable thumb that matches Luxor's signature gold button style.
 */
export function PortalFloatingScrollbar({ containerRef }: PortalFloatingScrollbarProps) {
  const barWrapperRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLDivElement | null>(null)
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null)
  const dragStartRef = useRef<{ startY: number; startScrollTop: number; trackSpace: number; maxScroll: number }>({
    startY: 0,
    startScrollTop: 0,
    trackSpace: 0,
    maxScroll: 0,
  })
  const isDraggingRef = useRef(false)
  const currentThumbHeightRef = useRef(36)

  useEffect(() => {
    const el = containerRef.current
    const wrapper = barWrapperRef.current
    const thumb = thumbRef.current
    if (!el || !wrapper || !thumb) return

    const showBar = () => {
      wrapper.style.opacity = '1'
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
      hideTimerRef.current = setTimeout(() => {
        if (!isDraggingRef.current) {
          wrapper.style.opacity = '0'
        }
      }, 1100)
    }

    // Direct synchronous DOM update for 1:1 instant tracking with zero frame delay
    const updateGeometry = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const maxScroll = scrollHeight - clientHeight

      if (maxScroll <= 4) {
        wrapper.style.display = 'none'
        return
      }

      wrapper.style.display = 'block'

      const ratio = clientHeight / scrollHeight
      const calculatedHeight = Math.max(36, clientHeight * ratio)
      currentThumbHeightRef.current = calculatedHeight
      thumb.style.height = `${calculatedHeight}px`

      const trackSpace = clientHeight - calculatedHeight
      const currentTop = (scrollTop / maxScroll) * trackSpace
      thumb.style.transform = `translate3d(0, ${currentTop}px, 0)`
    }

    const handleScroll = () => {
      updateGeometry()
      showBar()
    }

    el.addEventListener('scroll', handleScroll, { passive: true })

    const resizeObserver = new ResizeObserver(() => {
      updateGeometry()
    })
    resizeObserver.observe(el)

    // Flash on page mount/load
    updateGeometry()
    showBar()

    // Handle dragging directly on the thumb
    const handleThumbPointerDown = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      isDraggingRef.current = true
      wrapper.style.opacity = '1'

      const { scrollHeight, clientHeight, scrollTop } = el
      const maxScroll = scrollHeight - clientHeight
      const trackSpace = clientHeight - currentThumbHeightRef.current

      dragStartRef.current = {
        startY: e.clientY,
        startScrollTop: scrollTop,
        trackSpace,
        maxScroll,
      }

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!isDraggingRef.current) return
        const { startY, startScrollTop, trackSpace: space, maxScroll: max } = dragStartRef.current
        if (space <= 0) return

        const deltaY = moveEvent.clientY - startY
        const scrollDelta = (deltaY / space) * max
        el.scrollTop = startScrollTop + scrollDelta
        updateGeometry()
      }

      const handlePointerUp = () => {
        isDraggingRef.current = false
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        showBar()
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    }

    thumb.addEventListener('pointerdown', handleThumbPointerDown)

    return () => {
      el.removeEventListener('scroll', handleScroll)
      thumb.removeEventListener('pointerdown', handleThumbPointerDown)
      resizeObserver.disconnect()
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [containerRef])

  return (
    <div
      ref={barWrapperRef}
      aria-hidden="true"
      className="pointer-events-none absolute right-1.5 top-0 bottom-0 z-30 w-2.5 opacity-0 transition-opacity duration-200 ease-out hidden lg:block"
      style={{ willChange: 'opacity' }}
    >
      <div
        ref={thumbRef}
        className="pointer-events-auto absolute right-0 w-1.5 cursor-grab active:cursor-grabbing rounded-full border border-[#b88d37]/60 bg-gradient-to-b from-[#d4af54] to-[#ba8e35] shadow-[0_1px_3px_rgba(36,24,6,0.35)] hover:w-2 hover:border-[#b88d37]"
        style={{
          willChange: 'transform',
          transform: 'translate3d(0, 0, 0)',
        }}
      />
    </div>
  )
}
