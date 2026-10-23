'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

type RectSnapshot = {
  x: number
  y: number
  width: number
  height: number
  top: number
  bottom: number
}

type ViewportSnapshot = {
  innerHeight: number
  clientHeight: number
  outerHeight: number
  screenHeight: number
  screenAvailHeight: number
  screenAvailTop: number | null
  screenY: number
  devicePixelRatio: number
  visualHeight: number | null
  visualOffsetTop: number | null
  visualScale: number | null
  standalone: boolean
  iosStandalone: boolean
  body: RectSnapshot
  main: RectSnapshot | null
  nav: RectSnapshot | null
  navPaddingTop: string
  navPaddingBottom: string
  safeAreaTop: string
  safeAreaBottom: string
  dynamicViewportHeight: number | null
  largeViewportHeight: number | null
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function rectSnapshot(element: Element | null): RectSnapshot | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
    top: round(rect.top),
    bottom: round(rect.bottom),
  }
}

function readViewportSnapshot(
  safeAreaProbe: HTMLDivElement | null,
  dynamicViewportProbe: HTMLDivElement | null,
  largeViewportProbe: HTMLDivElement | null,
): ViewportSnapshot {
  const nav = document.querySelector('.portal-mobile-nav')
  const navStyle = nav ? window.getComputedStyle(nav) : null
  const visualViewport = window.visualViewport
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  const screenWithAvailTop = window.screen as Screen & { availTop?: number }

  return {
    innerHeight: round(window.innerHeight),
    clientHeight: round(document.documentElement.clientHeight),
    outerHeight: round(window.outerHeight),
    screenHeight: round(window.screen.height),
    screenAvailHeight: round(window.screen.availHeight),
    screenAvailTop: Number.isFinite(screenWithAvailTop.availTop) ? round(screenWithAvailTop.availTop!) : null,
    screenY: round(window.screenY),
    devicePixelRatio: round(window.devicePixelRatio),
    visualHeight: visualViewport ? round(visualViewport.height) : null,
    visualOffsetTop: visualViewport ? round(visualViewport.offsetTop) : null,
    visualScale: visualViewport ? round(visualViewport.scale) : null,
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    iosStandalone: navigatorWithStandalone.standalone === true,
    body: rectSnapshot(document.body) ?? { x: 0, y: 0, width: 0, height: 0, top: 0, bottom: 0 },
    main: rectSnapshot(document.querySelector('.portal-main')),
    nav: rectSnapshot(nav),
    navPaddingTop: navStyle?.paddingTop ?? 'unavailable',
    navPaddingBottom: navStyle?.paddingBottom ?? 'unavailable',
    safeAreaTop: safeAreaProbe ? window.getComputedStyle(safeAreaProbe).paddingTop : 'unavailable',
    safeAreaBottom: safeAreaProbe ? window.getComputedStyle(safeAreaProbe).paddingBottom : 'unavailable',
    dynamicViewportHeight: dynamicViewportProbe ? round(dynamicViewportProbe.getBoundingClientRect().height) : null,
    largeViewportHeight: largeViewportProbe ? round(largeViewportProbe.getBoundingClientRect().height) : null,
  }
}

function formatRect(rect: RectSnapshot | null) {
  if (!rect) return 'not found'
  return `x${rect.x} y${rect.y} | ${rect.width}x${rect.height} | bottom ${rect.bottom}`
}

export function PortalViewportDiagnostics({
  buildId,
  onClose,
}: {
  buildId?: string
  onClose: () => void
}) {
  const safeAreaProbeRef = useRef<HTMLDivElement>(null)
  const dynamicViewportProbeRef = useRef<HTMLDivElement>(null)
  const largeViewportProbeRef = useRef<HTMLDivElement>(null)
  const [snapshot, setSnapshot] = useState<ViewportSnapshot | null>(null)

  const refresh = useCallback(() => {
    setSnapshot(readViewportSnapshot(
      safeAreaProbeRef.current,
      dynamicViewportProbeRef.current,
      largeViewportProbeRef.current,
    ))
  }, [])

  useEffect(() => {
    refresh()
    const visualViewport = window.visualViewport
    window.addEventListener('resize', refresh)
    window.addEventListener('orientationchange', refresh)
    visualViewport?.addEventListener('resize', refresh)
    visualViewport?.addEventListener('scroll', refresh)

    return () => {
      window.removeEventListener('resize', refresh)
      window.removeEventListener('orientationchange', refresh)
      visualViewport?.removeEventListener('resize', refresh)
      visualViewport?.removeEventListener('scroll', refresh)
    }
  }, [refresh])

  return (
    <>
      <div
        aria-hidden="true"
        ref={safeAreaProbeRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      />
      <div aria-hidden="true" ref={dynamicViewportProbeRef} className="pointer-events-none invisible fixed left-0 top-0 h-[100dvh] w-0" />
      <div aria-hidden="true" ref={largeViewportProbeRef} className="pointer-events-none invisible fixed left-0 top-0 h-[100lvh] w-0" />
      <section
        aria-label="Viewport diagnostics"
        className="fixed left-2 right-2 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-[100] max-h-[75dvh] overflow-y-auto rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-[color:var(--portal-text)] shadow-xl"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold">Viewport check</h2>
            <p className="text-[10px] text-[color:var(--portal-muted)]">Read-only device measurements</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close viewport diagnostics"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-text)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {snapshot ? (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-[10px] leading-4">
            <dt className="text-[color:var(--portal-muted)]">inner / client</dt><dd>{snapshot.innerHeight} / {snapshot.clientHeight}px</dd>
            <dt className="text-[color:var(--portal-muted)]">screen h / avail / top</dt><dd>{snapshot.screenHeight} / {snapshot.screenAvailHeight} / {snapshot.screenAvailTop ?? 'n/a'}px</dd>
            <dt className="text-[color:var(--portal-muted)]">window outer / screenY</dt><dd>{snapshot.outerHeight} / {snapshot.screenY}px</dd>
            <dt className="text-[color:var(--portal-muted)]">100dvh / 100lvh</dt><dd>{snapshot.dynamicViewportHeight ?? 'n/a'} / {snapshot.largeViewportHeight ?? 'n/a'}px</dd>
            <dt className="text-[color:var(--portal-muted)]">pixel ratio</dt><dd>{snapshot.devicePixelRatio}</dd>
            <dt className="text-[color:var(--portal-muted)]">visual h / top / scale</dt><dd>{snapshot.visualHeight ?? 'n/a'} / {snapshot.visualOffsetTop ?? 'n/a'} / {snapshot.visualScale ?? 'n/a'}</dd>
            <dt className="text-[color:var(--portal-muted)]">standalone</dt><dd>display-mode {snapshot.standalone ? 'yes' : 'no'} | iOS {snapshot.iosStandalone ? 'yes' : 'no'}</dd>
            <dt className="text-[color:var(--portal-muted)]">body</dt><dd className="break-words">{formatRect(snapshot.body)}</dd>
            <dt className="text-[color:var(--portal-muted)]">main</dt><dd className="break-words">{formatRect(snapshot.main)}</dd>
            <dt className="text-[color:var(--portal-muted)]">nav</dt><dd className="break-words">{formatRect(snapshot.nav)}</dd>
            <dt className="text-[color:var(--portal-muted)]">nav padding T/B</dt><dd>{snapshot.navPaddingTop} / {snapshot.navPaddingBottom}</dd>
            <dt className="text-[color:var(--portal-muted)]">safe top / bottom</dt><dd>{snapshot.safeAreaTop} / {snapshot.safeAreaBottom}</dd>
            <dt className="text-[color:var(--portal-muted)]">build</dt><dd>{buildId || 'unavailable'}</dd>
          </dl>
        ) : <p className="text-[10px] text-[color:var(--portal-muted)]">Measuring...</p>}
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={refresh} className="min-h-9 rounded-lg px-3 text-[10px] font-semibold text-[#a8792f]">Refresh values</button>
        </div>
      </section>
    </>
  )
}
