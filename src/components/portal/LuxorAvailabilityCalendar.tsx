'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { PortalSelect } from './PortalUI'
import { luxorAvailabilityStatusLabel, type LuxorAvailabilityCalendar, type LuxorAvailabilityDay } from '@/lib/luxorAvailability'
import { luxorTodayKey } from '@/lib/luxorTourMetrics'
import { addCalendarMonthsDateKey, LUXOR_BOOKING_DATE_MAX_MONTHS } from '@/lib/publicEventDate'

type LuxorAvailabilityCalendarProps = {
  availability: LuxorAvailabilityCalendar
  selectedDate: string
  onSelectDate: (date: string) => void
  pendingCounts?: Record<string, number>
  availabilityReady?: boolean
  compact?: boolean
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function localDate(value: string) {
  const parsed = value ? new Date(`${value}T12:00:00`) : new Date()
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function fullDateLabel(value: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(localDate(value))
}

function cellBackground(day?: LuxorAvailabilityDay) {
  if (day?.status === 'fully-booked') return { background: '#bd852d' }
  if (day?.status === 'am-booked') return { background: 'linear-gradient(90deg, #e6c376 0 50%, var(--portal-soft) 50% 100%)' }
  if (day?.status === 'pm-booked') return { background: 'linear-gradient(90deg, var(--portal-soft) 0 50%, #e6c376 50% 100%)' }
  return { background: 'var(--portal-soft)' }
}

function LegendMark({ status }: { status: LuxorAvailabilityDay['status'] }) {
  return <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border border-[#caa24c]/35" style={cellBackground({ amBooked: status === 'am-booked' || status === 'fully-booked', pmBooked: status === 'pm-booked' || status === 'fully-booked', status, blocks: [] })} />
}

export function LuxorAvailabilityCalendar({
  availability,
  selectedDate,
  onSelectDate,
  pendingCounts,
  availabilityReady = true,
  compact = false,
}: LuxorAvailabilityCalendarProps) {
  const selected = useMemo(() => localDate(selectedDate), [selectedDate])
  const [viewOverride, setViewOverride] = useState<{ selectedDate: string; date: Date } | null>(null)
  const activeDate = viewOverride?.selectedDate === selectedDate ? viewOverride.date : selected
  const setViewDate = (date: Date) => setViewOverride({ selectedDate, date })
  const [monthYearOpen, setMonthYearOpen] = useState(false)
  const monthYearRef = useRef<HTMLDivElement>(null)
  const monthYearTriggerRef = useRef<HTMLButtonElement>(null)
  const monthYearDialogRef = useRef<HTMLDivElement>(null)
  const monthYearDialogTitleId = useId()
  const [monthYearPosition, setMonthYearPosition] = useState<{ top: number; left: number; width: number; maxHeight: number; bottom?: number } | null>(null)
  const activeYear = activeDate.getFullYear()
  const activeMonth = activeDate.getMonth()
  const [todayKey, setTodayKey] = useState(() => luxorTodayKey())
  const maxDateKey = addCalendarMonthsDateKey(todayKey, LUXOR_BOOKING_DATE_MAX_MONTHS) || todayKey
  const maxDate = localDate(maxDateKey)
  const canMoveNext = activeYear < maxDate.getFullYear() || (activeYear === maxDate.getFullYear() && activeMonth < maxDate.getMonth())

  useEffect(() => {
    const refreshToday = () => setTodayKey(luxorTodayKey())
    const interval = window.setInterval(refreshToday, 60_000)
    window.addEventListener('focus', refreshToday)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshToday)
    }
  }, [])

  const updateMonthYearPosition = useCallback(() => {
    const trigger = monthYearTriggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewport = window.visualViewport
    const visibleTop = viewport?.offsetTop ?? 0
    const visibleBottom = visibleTop + (viewport?.height ?? window.innerHeight)

    if (window.matchMedia('(max-width: 639px)').matches) {
      const footerTop = document.querySelector<HTMLElement>('[data-proposal-builder-footer]')?.getBoundingClientRect().top
      const top = visibleTop + 12
      const panelBottom = Math.max(top + 1, Math.min(visibleBottom - 12, footerTop === undefined ? visibleBottom - 12 : footerTop - 12))
      const bottom = Math.max(8, window.innerHeight - panelBottom)
      const maxHeight = Math.max(1, panelBottom - top)
      setMonthYearPosition({ top, left: 12, width: Math.max(0, window.innerWidth - 24), maxHeight, bottom })
      return
    }

    const width = Math.min(352, window.innerWidth - 24)
    const maxHeight = Math.max(180, visibleBottom - rect.bottom - 16)
    setMonthYearPosition({ top: Math.min(rect.bottom + 8, visibleBottom - Math.min(360, maxHeight) - 8), left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), width, maxHeight: Math.min(360, maxHeight) })
  }, [])

  const closeMonthYear = useCallback(() => {
    setMonthYearOpen(false)
    window.requestAnimationFrame(() => monthYearTriggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!monthYearOpen) return
    const originalBodyOverflow = document.body.style.overflow
    const originalRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    let frame = window.requestAnimationFrame(updateMonthYearPosition)
    const schedulePosition = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updateMonthYearPosition)
    }
    window.addEventListener('resize', schedulePosition)
    window.addEventListener('scroll', schedulePosition, true)
    window.visualViewport?.addEventListener('resize', schedulePosition)
    window.visualViewport?.addEventListener('scroll', schedulePosition)
    const focusFrame = window.requestAnimationFrame(() => {
      const firstFocusable = monthYearDialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      firstFocusable?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeMonthYear()
        return
      }
      if (event.key !== 'Tab') return

      const dialogFocusables = Array.from(monthYearDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [])
      const portalOptions = Array.from(document.querySelectorAll<HTMLElement>(
        '[data-portal-popover] [role="option"]:not([aria-disabled="true"])',
      ))
      const focusables = [...dialogFocusables, ...portalOptions].filter((element) => element.getClientRects().length > 0)
      if (!focusables.length) {
        event.preventDefault()
        monthYearDialogRef.current?.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !focusables.includes(active as HTMLElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !focusables.includes(active as HTMLElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedulePosition)
      window.removeEventListener('scroll', schedulePosition, true)
      window.visualViewport?.removeEventListener('resize', schedulePosition)
      window.visualViewport?.removeEventListener('scroll', schedulePosition)
      document.body.style.overflow = originalBodyOverflow
      document.documentElement.style.overflow = originalRootOverflow
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [closeMonthYear, monthYearOpen, updateMonthYearPosition])

  const years = useMemo(() => {
    const thisYear = localDate(todayKey).getFullYear()
    const first = Math.min(thisYear - 2, activeYear)
    const lastDate = addCalendarMonthsDateKey(todayKey, LUXOR_BOOKING_DATE_MAX_MONTHS) || todayKey
    const last = Math.max(localDate(lastDate).getFullYear(), activeYear)
    return Array.from({ length: last - first + 1 }, (_, index) => String(first + index))
  }, [activeYear, todayKey])

  const days = useMemo(() => {
    const first = new Date(activeYear, activeMonth, 1)
    const offset = first.getDay()
    const count = new Date(activeYear, activeMonth + 1, 0).getDate()
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(activeYear, activeMonth, index - offset + 1)
      return { date, key: isoDate(date), inMonth: index >= offset && index < offset + count }
    })
  }, [activeMonth, activeYear])

  const moveMonth = (amount: number) => {
    const current = activeDate
    const next = new Date(current.getFullYear(), current.getMonth() + amount, 1)
    if (amount > 0 && (next.getFullYear() > maxDate.getFullYear() || (next.getFullYear() === maxDate.getFullYear() && next.getMonth() > maxDate.getMonth()))) return
    setViewDate(next)
  }
  const selectToday = () => {
    const date = luxorTodayKey()
    const today = localDate(date)
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))
    onSelectDate(date)
    if (monthYearOpen) closeMonthYear()
  }
  const selectDay = (value: string) => {
    if (value > maxDateKey) return
    const date = localDate(value)
    if (date.getMonth() !== activeMonth || date.getFullYear() !== activeYear) {
      setViewDate(new Date(date.getFullYear(), date.getMonth(), 1))
    }
    onSelectDate(value)
    if (monthYearOpen) closeMonthYear()
  }

  return (
    <section aria-label="Event date availability" className="min-w-0 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3.5 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={selectToday} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-xs font-semibold text-[color:var(--portal-text)] transition hover:border-[#caa24c]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">
          <CalendarDays size={14} className="text-[#a8792f]" aria-hidden="true" /> Today
        </button>
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-text)] transition hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
          <div ref={monthYearRef} className="relative min-w-0 flex-1">
            <button ref={monthYearTriggerRef} type="button" aria-haspopup="dialog" aria-expanded={monthYearOpen} onClick={() => setMonthYearOpen((open) => !open)} className="flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-transparent px-2 text-center font-serif text-base font-semibold text-[color:var(--portal-text)] transition hover:border-[color:var(--portal-border)] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 sm:text-lg">
              <span className="truncate">{MONTHS[activeMonth]} {activeYear}</span>
              <ChevronDown size={15} className="shrink-0 text-[#a8792f]" aria-hidden="true" />
            </button>
            {typeof document !== 'undefined' ? createPortal(
              <AnimatePresence>
                {monthYearOpen && monthYearPosition ? (
                <>
                  <motion.button
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    aria-label="Close month and year selector"
                    onClick={closeMonthYear}
                    onTouchMove={(event) => event.preventDefault()}
                    className="fixed inset-0 z-[9990] bg-black/25 sm:bg-transparent"
                  />
                  <motion.div
                    ref={monthYearDialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={monthYearDialogTitleId}
                    tabIndex={-1}
                    initial={{ opacity: 0, scale: 0.95, y: -6, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 0.95, y: -6, filter: 'blur(6px)' }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeMonthYear() } }}
                    className="portal-scrollbar fixed z-[9995] overflow-y-auto overscroll-contain rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-2xl sm:rounded-xl backdrop-blur-md"
                    style={{ top: monthYearPosition.top, left: monthYearPosition.left, width: monthYearPosition.width, maxHeight: `calc(${monthYearPosition.maxHeight}px - env(safe-area-inset-bottom, 0px))`, ...(monthYearPosition.bottom === undefined ? {} : { bottom: `calc(${monthYearPosition.bottom}px + env(safe-area-inset-bottom, 0px))` }) }}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <p id={monthYearDialogTitleId} className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Choose a month and year</p>
                      <button type="button" onClick={closeMonthYear} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-[#8c6529] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">Done</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="min-w-0 space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Month</span>
                        <PortalSelect value={String(activeMonth)} onChange={(value) => setViewDate(new Date(activeYear, Number(value), 1))} options={MONTHS.map((month, index) => ({ value: String(index), label: month }))} className="w-full" buttonClassName="min-h-11 px-3 text-sm font-semibold normal-case tracking-normal" />
                      </label>
                      <label className="min-w-0 space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Year</span>
                        <PortalSelect value={String(activeYear)} onChange={(value) => setViewDate(new Date(Number(value), activeMonth, 1))} options={years.map((year) => ({ value: year, label: year }))} className="w-full" buttonClassName="min-h-11 px-3 text-sm font-semibold normal-case tracking-normal" />
                      </label>
                    </div>
                  </motion.div>
                </>
                ) : null}
              </AnimatePresence>,
              document.body,
            ) : null}
          </div>
          <button type="button" aria-label="Next month" disabled={!canMoveNext} onClick={() => moveMonth(1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-text)] transition hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 disabled:cursor-not-allowed disabled:opacity-40">
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => <span key={day} className="py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">{day}</span>)}
        {days.map(({ date, key, inMonth }) => {
          const state = availability[key]
          const selectedDay = key === selectedDate
          const pending = pendingCounts?.[key] || 0
          const status = availabilityReady ? luxorAvailabilityStatusLabel(state) : 'Availability loading'
          const dateLabel = fullDateLabel(key)
          return (
            <button
              key={key}
              type="button"
              disabled={key > maxDateKey}
              aria-pressed={selectedDay}
              aria-label={`${dateLabel}, ${status}${pending ? `, ${pending} pending proposals` : ''}`}
              onClick={() => selectDay(key)}
              className={`relative mx-auto flex h-11 w-full min-w-0 items-center justify-center rounded-md text-[10px] font-semibold tabular-nums text-[color:var(--portal-text)] transition focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/60 disabled:cursor-not-allowed disabled:opacity-30 sm:text-xs ${inMonth ? '' : 'opacity-45'}`}
            >
              <span className={`relative flex aspect-square w-full max-w-10 items-center justify-center rounded-full border border-[color:var(--portal-border)] text-[10px] font-semibold tabular-nums text-[color:var(--portal-text)] transition sm:text-xs ${selectedDay ? 'ring-2 ring-[#b77d27] ring-offset-2 ring-offset-[color:var(--portal-card)]' : 'hover:border-[#caa24c]/50 hover:shadow-sm'}`} style={cellBackground(availabilityReady ? state : undefined)}>
                {date.getDate()}
                {pending > 0 ? <span title={`${pending} pending`} aria-hidden="true" className="absolute -right-1 -top-1 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full border border-[color:var(--portal-card)] bg-[#f3ead7] px-1 text-[8px] font-black leading-none text-[#6f4e1d] shadow-sm">{pending}</span> : null}
              </span>
            </button>
          )
        })}
      </div>

      {!compact ? <p className="mt-3 min-h-4 text-center text-[10px] font-medium text-[color:var(--portal-muted)]" aria-live="polite">{selectedDate ? fullDateLabel(selectedDate) : 'Select an event date'}</p> : null}

      <div aria-label="Availability legend" className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-[color:var(--portal-border)] pt-3 text-[9px] font-medium text-[color:var(--portal-muted)] sm:gap-x-4 sm:text-[10px]">
        <span className="inline-flex items-center gap-1.5"><LegendMark status="available" />Available</span>
        <span className="inline-flex items-center gap-1.5"><LegendMark status="fully-booked" />Fully booked</span>
        <span className="inline-flex items-center gap-1.5"><LegendMark status="am-booked" />AM slot booked</span>
        <span className="inline-flex items-center gap-1.5"><LegendMark status="pm-booked" />PM slot booked</span>
      </div>
    </section>
  )
}
