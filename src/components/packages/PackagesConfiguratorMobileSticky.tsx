'use client'

import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { getLuxorLenis } from '@/components/SmoothScroll'
import { AnimatedCurrencyTicker } from '@/components/packages/AnimatedCurrencyTicker'

const subscribeNoop = () => () => undefined
const getClientSnapshot = () => true
const getServerSnapshot = () => false

const STICKY_BODY_ATTR = 'data-packages-mobile-sticky'

type PackagesConfiguratorMobileStickyProps = {
  locale?: 'en' | 'es'
  total: number | null
}

export function PackagesConfiguratorMobileSticky({ locale = 'en', total }: PackagesConfiguratorMobileStickyProps) {
  const isMounted = useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot)
  const reduceMotion = useReducedMotion()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const summary = document.getElementById('packages-summary')
    const section = document.getElementById('build-your-experience')
    if (!summary || !section) return

    let summaryIntersecting = false
    let sectionBelowViewport = false

    const recompute = () => {
      setVisible(!summaryIntersecting && !sectionBelowViewport)
    }

    const summaryObserver = new IntersectionObserver(
      ([entry]) => {
        summaryIntersecting = Boolean(entry?.isIntersecting)
        recompute()
      },
      { threshold: 0.12, rootMargin: '-8% 0px -35% 0px' },
    )

    const sectionObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        sectionBelowViewport = !entry.isIntersecting && entry.boundingClientRect.top < 0
        recompute()
      },
      { threshold: 0 },
    )

    summaryObserver.observe(summary)
    sectionObserver.observe(section)

    return () => {
      summaryObserver.disconnect()
      sectionObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!isMounted || typeof document === 'undefined') return
    const mq = window.matchMedia('(max-width: 639px)')
    const syncBodyPadding = () => {
      if (visible && mq.matches) {
        document.body.setAttribute(STICKY_BODY_ATTR, 'true')
      } else {
        document.body.removeAttribute(STICKY_BODY_ATTR)
      }
    }
    syncBodyPadding()
    mq.addEventListener('change', syncBodyPadding)
    return () => {
      mq.removeEventListener('change', syncBodyPadding)
      document.body.removeAttribute(STICKY_BODY_ATTR)
    }
  }, [isMounted, visible])

  if (!isMounted || typeof document === 'undefined') return null
  const runningLabel = locale === 'es' ? 'Total estimado' : 'Running total'
  const summaryLabel = locale === 'es' ? 'Resumen' : 'Summary'

  const scrollToSummary = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    const target = document.getElementById('packages-summary')
    if (!target) return
    const headerHeight = document.getElementById('shared-header')?.getBoundingClientRect().height ?? 112
    const offset = headerHeight + 16
    const lenis = getLuxorLenis()
    if (lenis) {
      lenis.scrollTo(target, { offset: -offset, duration: reduceMotion ? 0 : 0.9 })
      return
    }
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }

  return createPortal(
    <motion.div
      aria-hidden={!visible}
      className="site-floating-action packages-mobile-sticky pointer-events-none fixed inset-x-0 bottom-16 z-[70] sm:hidden"
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        y: visible ? 0 : reduceMotion ? 0 : 12,
      }}
      transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
      style={{ pointerEvents: visible ? undefined : 'none' }}
    >
      <div
        className={`border-y border-[#caa24c]/28 bg-[#faf7f1]/95 p-3 shadow-[0_-16px_40px_-28px_rgba(61,43,23,0.45)] backdrop-blur ${visible ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8d672b]">{runningLabel}</p>
            <p className="truncate font-mono text-lg font-bold tabular-nums text-[#241d17]">
              <AnimatedCurrencyTicker value={total} />
            </p>
          </div>
          <a
            href="#packages-summary"
            onClick={scrollToSummary}
            className="luxor-gold-raised inline-flex min-h-10 shrink-0 items-center justify-center rounded-md px-3 text-[10px] font-semibold uppercase tracking-[0.12em]"
          >
            {summaryLabel}
          </a>
        </div>
      </div>
    </motion.div>,
    document.body,
  )
}