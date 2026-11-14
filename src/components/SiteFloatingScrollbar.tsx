'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { getLuxorLenis } from '@/components/SmoothScroll'

/**
 * Custom viewport scrollbar for the public site that starts cleanly
 * at the bottom edge of `#shared-header` on both desktop and mobile,
 * replacing the native root scrollbar that otherwise extends to y=0.
 */
export function SiteFloatingScrollbar() {
  const pathname = usePathname()
  const trackRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLDivElement | null>(null)
  const isDraggingRef = useRef(false)
  const thumbHeightRef = useRef(56)
  const dragStartRef = useRef({
    startY: 0,
    startScrollY: 0,
    trackSpace: 0,
    maxScroll: 0,
  })

  useEffect(() => {
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!track || !thumb) return

    let rafId: number | null = null

    const getHeaderBottom = () => {
      const header = document.getElementById('shared-header')
      if (!header) return 112
      return Math.max(0, Math.round(header.getBoundingClientRect().bottom))
    }

    const updateGeometry = () => {
      const headerBottom = getHeaderBottom()
      track.style.top = `${headerBottom}px`

      const docHeight = document.documentElement.scrollHeight
      const winHeight = window.innerHeight
      const maxScroll = docHeight - winHeight

      if (maxScroll <= 4 || document.body.dataset.mobileMenuOpen === 'true') {
        track.style.display = 'none'
        return
      }

      track.style.display = 'block'

      const trackHeight = track.clientHeight
      if (trackHeight <= 0) return

      const calculatedHeight = Math.max(48, Math.min(trackHeight * 0.6, (winHeight / docHeight) * trackHeight))
      thumbHeightRef.current = calculatedHeight
      thumb.style.height = `${calculatedHeight}px`

      const trackSpace = Math.max(0, trackHeight - calculatedHeight)
      const ratio = Math.min(1, Math.max(0, window.scrollY / maxScroll))
      const top = ratio * trackSpace
      thumb.style.transform = `translate3d(0, ${top}px, 0)`
    }

    const scheduleUpdate = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        updateGeometry()
      })
    }

    const scrollToY = (targetY: number) => {
      const lenis = getLuxorLenis()
      if (lenis) {
        lenis.scrollTo(targetY, { immediate: true })
      } else {
        window.scrollTo(0, targetY)
      }
    }

    const handleThumbPointerDown = (event: PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      isDraggingRef.current = true

      const docHeight = document.documentElement.scrollHeight
      const winHeight = window.innerHeight
      const maxScroll = Math.max(0, docHeight - winHeight)
      const trackSpace = Math.max(0, track.clientHeight - thumbHeightRef.current)

      dragStartRef.current = {
        startY: event.clientY,
        startScrollY: window.scrollY,
        trackSpace,
        maxScroll,
      }

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!isDraggingRef.current) return
        const { startY, startScrollY, trackSpace: space, maxScroll: max } = dragStartRef.current
        if (space <= 0 || max <= 0) return
        const deltaY = moveEvent.clientY - startY
        const nextY = Math.min(max, Math.max(0, startScrollY + (deltaY / space) * max))
        scrollToY(nextY)
        updateGeometry()
      }

      const handlePointerUp = () => {
        isDraggingRef.current = false
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    }

    const handleTrackPointerDown = (event: PointerEvent) => {
      if (event.target !== track) return
      event.preventDefault()
      const rect = track.getBoundingClientRect()
      const clickY = event.clientY - rect.top - thumbHeightRef.current / 2
      const trackSpace = Math.max(1, track.clientHeight - thumbHeightRef.current)
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      const ratio = Math.min(1, Math.max(0, clickY / trackSpace))
      scrollToY(ratio * maxScroll)
      updateGeometry()
    }

    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate, { passive: true })
    thumb.addEventListener('pointerdown', handleThumbPointerDown)
    track.addEventListener('pointerdown', handleTrackPointerDown)

    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(document.documentElement)
    const header = document.getElementById('shared-header')
    if (header) resizeObserver.observe(header)

    const mutationObserver = new MutationObserver(scheduleUpdate)
    mutationObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-mobile-menu-open', 'data-header-scrolled'],
    })

    updateGeometry()

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      thumb.removeEventListener('pointerdown', handleThumbPointerDown)
      track.removeEventListener('pointerdown', handleTrackPointerDown)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [pathname])

  return (
    <div
      ref={trackRef}
      aria-hidden="true"
      className="fixed right-0 bottom-16 sm:bottom-0 z-[85] w-2 sm:w-2.5 border-l border-[#caa24c]/12 bg-white/95 select-none"
      style={{ top: '7rem' }}
    >
      <div
        ref={thumbRef}
        className="mx-auto w-1.5 sm:w-[7px] rounded-full cursor-grab active:cursor-grabbing"
        style={{
          background: 'linear-gradient(180deg, #e7c36f 0%, #b27d2b 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(255, 240, 190, 0.2)',
          willChange: 'transform',
          transform: 'translate3d(0, 0, 0)',
        }}
      />
    </div>
  )
}
