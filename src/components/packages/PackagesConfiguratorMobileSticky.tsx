'use client'

import type { MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from 'framer-motion'
import { getLuxorLenis } from '@/components/SmoothScroll'

type PackagesConfiguratorMobileStickyProps = {
  locale?: 'en' | 'es'
  total: number | null
}

export function PackagesConfiguratorMobileSticky({ locale = 'en', total }: PackagesConfiguratorMobileStickyProps) {
  const reduceMotion = useReducedMotion()
  if (typeof document === 'undefined') return null
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-[140] border-t border-[#caa24c]/20 bg-[#faf7f1]/95 p-3 shadow-[0_-16px_40px_-28px_rgba(61,43,23,0.45)] backdrop-blur md:hidden">
      <div className="pointer-events-auto mx-auto flex max-w-lg items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8d672b]">{runningLabel}</p>
          <p className="truncate font-mono text-lg font-bold tabular-nums text-[#241d17]">
            {total !== null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total) : '—'}
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
    </div>,
    document.body,
  )
}
