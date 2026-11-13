'use client'

import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CalendarDots } from '@phosphor-icons/react'
import { ChevronDown } from '@/lib/icons/phosphor-compat'
import { PortalDatePicker } from '@/components/portal/PortalUI'

export type PortalDateRange = { start: string; end: string }

type PortalDateRangeControlProps = {
  range: PortalDateRange
  onRangeChange: (range: PortalDateRange) => void
  className?: string
  alignment?: 'left' | 'right'
  dialogLabel?: string
  controlId?: string
  /** Shown on the trigger when set (for example the funnel week label). */
  rangeLabel?: string
  rangeHint?: string
}

export function PortalDateRangeControl({
  range,
  onRangeChange,
  className = '',
  alignment = 'left',
  dialogLabel = 'Choose date range',
  controlId = 'portal-date-range',
  rangeLabel,
  rangeHint,
}: PortalDateRangeControlProps) {
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(`[data-portal-date-range-control="${controlId}"]`) || target.closest('[data-portal-popover="true"]') || target.closest('[aria-label="Close calendar"]')) return
      setOpen(false)
    }
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('keydown', dismissOnEscape)
    }
  }, [controlId, open])

  const periodFields = (
    <>
      <div className="min-w-0 flex-1 md:w-[176px] md:flex-none" aria-label="From date">
        <PortalDatePicker
          value={range.start}
          onChange={(value) => { if (value) onRangeChange({ start: value, end: value > range.end ? value : range.end }) }}
          placeholder="From date"
          label="From date"
          triggerPrefix="From"
          triggerClassName="!min-h-10 !justify-start !gap-1.5 !px-2.5 !text-xs !border-[color:var(--portal-border)]"
          omitWeekday
          timeZone="America/Chicago"
        />
      </div>
      <div className="min-w-0 flex-1 md:w-[176px] md:flex-none" aria-label="To date">
        <PortalDatePicker
          value={range.end}
          onChange={(value) => { if (value) onRangeChange({ start: value < range.start ? value : range.start, end: value }) }}
          placeholder="To date"
          label="To date"
          triggerPrefix="To"
          triggerClassName="!min-h-10 !justify-start !gap-1.5 !px-2.5 !text-xs !border-[color:var(--portal-border)]"
          omitWeekday
          timeZone="America/Chicago"
        />
      </div>
    </>
  )

  return (
    <div className={`relative ${className}`} data-portal-date-range-control={controlId}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={rangeHint}
        aria-label={rangeLabel ? `Date range, ${rangeLabel}` : 'Date range'}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${
          open
            ? 'border-[#caa24c]/60 bg-[#caa24c]/10 text-[#8c6420] shadow-sm dark:bg-[#caa24c]/15 dark:text-[#f3d48d]'
            : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-xs hover:border-[#caa24c]/45 hover:bg-[color:var(--portal-soft)]'
        }`}
      >
        <CalendarDots aria-hidden="true" size={16} className="shrink-0 text-[#a8792f] dark:text-[#e6c77f]" />
        <span className="max-w-[11rem] truncate text-left leading-tight sm:max-w-[14rem]">
          {rangeLabel ? <span className="block truncate">{rangeLabel}</span> : 'Date range'}
        </span>
        <ChevronDown aria-hidden="true" size={14} className={`shrink-0 text-[color:var(--portal-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key={`${controlId}-popover`}
            role="dialog"
            aria-label={dialogLabel}
            aria-modal="false"
            initial={reduceMotion ? false : { opacity: 0, y: -5, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute ${alignment === 'left' ? 'left-0' : 'right-0'} top-full z-50 mt-2 w-max max-w-[calc(100vw-2rem)] rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-[0_18px_48px_-24px_rgba(55,37,19,0.48)]`}
          >
            <div className="flex w-max max-w-[calc(100vw-4rem)] items-center gap-2">{periodFields}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
