'use client'

import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Circle, MoreHorizontal, X } from 'lucide-react'
import Link from 'next/link'
import React from 'react'
import { PortalAnimatedTabs, PortalModal, PortalSkeleton, PortalSkeletonTransition } from './PortalUI'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { luxorTodayKey } from '@/lib/luxorTourMetrics'

export type PortalCalendarView = 'month' | 'week' | 'day' | 'schedule'

export type PortalCalendarItem = {
  id: string
  date: string
  title: string
  subtitle?: string
  tone?: 'gold' | 'blue' | 'green' | 'rose' | 'zinc' | 'warning'
  warningLabel?: string
  href?: string
  openLabel?: string
  taskContext?: {
    leadName: string | null
    eventType: string | null
    eventDate: string | null
    leadHref?: string
    linked: boolean
    unavailable: boolean
  }
  content?: React.ReactNode
  dismissLabel?: string
  onDismiss?: () => Promise<void>
  onDismissed?: () => void
}

export type PortalCalendarDayStatus = 'open' | 'closed'

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function getVisibleDays(anchor: Date, view: PortalCalendarView) {
  if (view === 'schedule') return []
  if (view === 'day') return [anchor]

  if (view === 'week') {
    const start = addDays(anchor, -anchor.getDay())
    return Array.from({ length: 7 }, (_, index) => addDays(start, index))
  }

  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = addDays(first, -first.getDay())
  return Array.from({ length: 42 }, (_, index) => addDays(start, index))
}

function moveAnchor(anchor: Date, view: PortalCalendarView, direction: -1 | 1) {
  const next = new Date(anchor)
  if (view === 'month') {
    next.setDate(1)
    next.setMonth(anchor.getMonth() + direction)
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(anchor.getDate(), lastDay))
  }
  if (view === 'week' || view === 'schedule') next.setDate(anchor.getDate() + direction * 7)
  if (view === 'day') next.setDate(anchor.getDate() + direction)
  return next
}

function venueToday() {
  return new Date(`${luxorTodayKey()}T12:00:00`)
}

function formatRange(anchor: Date, view: PortalCalendarView) {
  if (view === 'schedule') return 'Upcoming schedule'
  if (view === 'month') {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(anchor)
  }

  if (view === 'day') {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(anchor)
  }

  const days = getVisibleDays(anchor, 'week')
  return `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(days[0])} - ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(days[6])}`
}

function formatContextDate(value: string) {
  const dateKey = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return value
  const date = new Date(`${dateKey}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function TaskContext({ item, compact = false }: { item: PortalCalendarItem; compact?: boolean }) {
  const context = item.taskContext
  if (!context) return null
  if (!context.linked && !context.unavailable) return null
  const leadName = context.leadName || (context.unavailable ? 'Lead details unavailable' : context.linked ? 'Lead name unavailable' : 'No linked lead')
  const eventType = context.eventType || 'Event type unavailable'
  const eventDate = context.eventDate ? formatContextDate(context.eventDate) : 'Date not provided'

  return (
    <span className={`block min-w-0 ${compact ? 'mt-0.5 text-[10px] leading-4 sm:text-xs sm:leading-5' : 'mt-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs leading-5'}`}>
      {!compact && context.leadHref ? <Link href={context.leadHref} className="block break-words font-semibold text-[color:var(--portal-text)] no-underline transition-colors hover:text-[#a8792f] dark:hover:text-[#f1d27a]">{leadName}</Link> : <span className={`block font-semibold text-[color:var(--portal-text)] ${compact ? 'truncate' : 'break-words'}`}>{leadName}</span>}
      <span className="block break-words text-[color:var(--portal-muted)]">{compact ? <>{eventType} <span aria-hidden="true">·</span> Event {eventDate}</> : <>{eventType} <span aria-hidden="true">·</span> Requested event date: {eventDate}</>}</span>
      {!context.linked ? <span className="sr-only">{context.unavailable ? 'Lead details could not be loaded.' : 'This task has no linked lead record.'}</span> : null}
    </span>
  )
}

const COARSE_POINTER_QUERY = '(hover: none) and (pointer: coarse)'

function subscribeToCoarsePointer(callback: () => void) {
  const mediaQuery = window.matchMedia(COARSE_POINTER_QUERY)
  mediaQuery.addEventListener('change', callback)
  return () => mediaQuery.removeEventListener('change', callback)
}

function getCoarsePointerSnapshot() {
  return window.matchMedia(COARSE_POINTER_QUERY).matches
}

export function PortalCalendar({
  title,
  items,
  view,
  onViewChange,
  dayStatuses,
  supplementalItems = [],
  loading = false,
  animateLoadingTransition = false,
  initialDate,
  onAnchorChange,
}: {
  title: string
  items: PortalCalendarItem[]
  view: PortalCalendarView
  onViewChange: (view: PortalCalendarView) => void
  dayStatuses?: Record<string, PortalCalendarDayStatus>
  supplementalItems?: PortalCalendarItem[]
  loading?: boolean
  animateLoadingTransition?: boolean
  initialDate?: string
  onAnchorChange?: (date: string) => void
}) {
  const [anchor, setAnchor] = React.useState(() => initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? new Date(`${initialDate}T12:00:00`) : venueToday())
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null)
  const [selectedItem, setSelectedItem] = React.useState<PortalCalendarItem | null>(null)
  const [selectedItemSource, setSelectedItemSource] = React.useState<'primary' | 'supplemental'>('primary')
  const [dismissPendingId, setDismissPendingId] = React.useState<string | null>(null)
  const [dismissedId, setDismissedId] = React.useState<string | null>(null)
  const [dismissAnimatingItem, setDismissAnimatingItem] = React.useState<{ item: PortalCalendarItem; source: 'primary' | 'supplemental' } | null>(null)
  const [dismissError, setDismissError] = React.useState<{ id: string; message: string } | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const mobileMenuRef = React.useRef<HTMLDivElement>(null)
  const isCoarsePointer = React.useSyncExternalStore(subscribeToCoarsePointer, getCoarsePointerSnapshot, () => false)
  const visibleDays = React.useMemo(() => getVisibleDays(anchor, view), [anchor, view])
  const itemsByDate = React.useMemo(() => {
    return items.reduce<Record<string, PortalCalendarItem[]>>((groups, item) => {
      groups[item.date] ??= []
      groups[item.date].push(item)
      return groups
    }, {})
  }, [items])
  const formattedRange = React.useMemo(() => formatRange(anchor, view), [anchor, view])
  const todayIso = luxorTodayKey()

  React.useEffect(() => { onAnchorChange?.(toIsoDate(anchor)) }, [anchor, onAnchorChange])

  const selectDay = (date: string) => {
    setSelectedDay(date)
    setAnchor(new Date(`${date}T12:00:00`))
    onAnchorChange?.(date)
  }

  const selectItem = React.useCallback((item: PortalCalendarItem, source: 'primary' | 'supplemental' = 'primary') => {
    setDismissError(null)
    setSelectedItemSource(source)
    setSelectedItem(item)
  }, [])

  const dismissItem = React.useCallback(async (item: PortalCalendarItem, source: 'primary' | 'supplemental' = selectedItemSource) => {
    if (!item.onDismiss || dismissPendingId) return
    setDismissPendingId(item.id)
    setDismissError(null)
    setDismissAnimatingItem({ item, source })
    try {
      await item.onDismiss()
      setDismissedId(item.id)
      await new Promise((resolve) => window.setTimeout(resolve, 450))
      item.onDismissed?.()
      setSelectedItem((current) => current?.id === item.id ? null : current)
      setDismissAnimatingItem(null)
    } catch (error) {
      setDismissAnimatingItem(null)
      setDismissError({ id: item.id, message: error instanceof Error ? error.message : 'Task could not be dismissed. Try again.' })
    } finally {
      setDismissPendingId(null)
      setDismissedId(null)
    }
  }, [dismissPendingId, selectedItemSource])

  const scheduledItems = dismissAnimatingItem?.source === 'primary' && !items.some((item) => item.id === dismissAnimatingItem.item.id)
    ? [...items, dismissAnimatingItem.item]
    : items
  const overdueItems = dismissAnimatingItem?.source === 'supplemental' && !supplementalItems.some((item) => item.id === dismissAnimatingItem.item.id)
    ? [...supplementalItems, dismissAnimatingItem.item]
    : supplementalItems

  React.useEffect(() => {
    if (!mobileMenuOpen) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!mobileMenuRef.current?.contains(event.target as Node)) setMobileMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileMenuOpen])

  return (
    <section className="portal-card-surface portal-surface flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-[color:var(--portal-border)] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">{title}</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h2 className="min-w-0 font-serif text-2xl font-bold text-[color:var(--portal-text)]">{formattedRange}</h2>
            <div ref={mobileMenuRef} className="relative flex shrink-0 items-center gap-1 sm:hidden">
              {view !== 'schedule' ? <button type="button" aria-label="Previous date range" onClick={() => setAnchor((date) => moveAnchor(date, view, -1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)]">
                <ChevronLeft size={16} />
              </button> : null}
              {view !== 'schedule' ? <button type="button" aria-label="Next date range" onClick={() => setAnchor((date) => moveAnchor(date, view, 1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)]">
                <ChevronRight size={16} />
              </button> : null}
              <button type="button" aria-label="Calendar options" aria-haspopup="menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)} className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]">
                <MoreHorizontal size={18} />
              </button>
              <AnimatePresence>
                {mobileMenuOpen && (
                  <motion.div
                    role="menu"
                    aria-label="Calendar view options"
                    initial={{ opacity: 0, scale: 0.95, y: -6, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 0.95, y: -6, filter: 'blur(6px)' }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute right-0 top-11 z-30 w-52 overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1.5 shadow-2xl backdrop-blur-md"
                  >
                    <p className="px-2.5 pb-1.5 pt-1 text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-faint)]">Calendar view</p>
                    {(['month', 'week', 'day', 'schedule'] as const).map((option) => (
                      <button key={option} type="button" role="menuitemradio" aria-checked={view === option} onClick={() => { onViewChange(option); setMobileMenuOpen(false) }} className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-bold capitalize text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">
                        {option}
                        {view === option ? <Check size={15} className="text-[#a8792f]" /> : null}
                      </button>
                    ))}
                    {view !== 'schedule' ? <><div className="my-1 border-t border-[color:var(--portal-border)]" />
                    <button type="button" role="menuitem" onClick={() => { setAnchor(venueToday()); setMobileMenuOpen(false) }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-bold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">
                      <CalendarDays size={15} className="text-[#a8792f]" /> Today
                    </button></> : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
        <div className="hidden w-full min-w-0 items-center gap-2 overflow-x-auto pb-1 sm:flex lg:w-auto lg:overflow-visible lg:pb-0">
          <PortalAnimatedTabs ariaLabel={`${title} calendar view`} tabs={[{ id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }, { id: 'day', label: 'Day' }, { id: 'schedule', label: 'Schedule' }] as const} activeTab={view} onTabChange={onViewChange} className="!w-auto" buttonClassName="!px-3" />
          {view !== 'schedule' ? <>
          <button type="button" aria-label="Previous date range" onClick={() => setAnchor((date) => moveAnchor(date, view, -1))} className="shrink-0 rounded-lg border border-[color:var(--portal-border)] p-2 text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => setAnchor(venueToday())} className="shrink-0 rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">
            Today
          </button>
          <button type="button" aria-label="Next date range" onClick={() => setAnchor((date) => moveAnchor(date, view, 1))} className="shrink-0 rounded-lg border border-[color:var(--portal-border)] p-2 text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">
            <ChevronRight size={16} />
          </button>
          </> : null}
        </div>
      </div>

      <div aria-busy={loading} className="portal-scrollbar min-h-[26rem] flex-1 overflow-auto p-1 sm:min-h-[36rem] sm:p-4">
        <CalendarSkeletonHandoff
          enabled={animateLoadingTransition}
          loading={loading}
          view={view}
        >
          {view === 'schedule' ? (
            <>
              {overdueItems.length ? (
                <details className="mx-auto mt-2 max-w-4xl rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50">
                  <summary className="group flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[color:var(--portal-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c] sm:px-6">
                    <span>Overdue tasks <span className="ml-1 text-xs font-normal">({overdueItems.length})</span></span>
                    <ChevronRight size={15} className="shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
                  </summary>
                  <div className="space-y-1 border-t border-[color:var(--portal-border)] p-2 sm:p-3">
                    {[...overdueItems].sort((a, b) => a.date.localeCompare(b.date)).map((item) => (
                      <div key={item.id} className="min-w-0 rounded-lg hover:bg-[color:var(--portal-card)]">
                        <div className="flex min-w-0 items-center gap-2 px-2.5 py-1.5 sm:px-3">
                          <button type="button" onClick={() => selectItem(item, 'supplemental')} className="flex min-h-10 min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]">
                            <span className="w-24 shrink-0 text-xs text-[color:var(--portal-muted)]">{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${item.date}T12:00:00`))}</span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{item.title}</span>{item.taskContext?.leadName ? <span className="block truncate text-xs text-[color:var(--portal-muted)]">{item.taskContext.leadName}</span> : null}</span>
                          </button>
                          {item.onDismiss ? <button type="button" aria-label={`${item.dismissLabel || 'Dismiss task'}: ${item.title}`} title={item.dismissLabel || 'Dismiss task'} disabled={Boolean(dismissPendingId)} onClick={() => void dismissItem(item, 'supplemental')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--portal-muted)] transition hover:bg-[color:var(--portal-card)] hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] disabled:cursor-wait disabled:opacity-60">{item.dismissLabel === 'Complete task' || dismissedId === item.id ? <DismissIcon complete={dismissedId === item.id} /> : <X size={16} aria-hidden="true" />}</button> : null}
                        </div>
                        {dismissError?.id === item.id ? <p role="alert" className="px-3 pb-2 text-xs text-rose-700 dark:text-rose-300">{dismissError.message}</p> : null}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              <ScheduleView items={scheduledItems} onSelectItem={(item) => selectItem(item)} onDismissItem={(item) => void dismissItem(item, 'primary')} dismissPendingId={dismissPendingId} dismissedId={dismissedId} dismissError={dismissError} />
            </>
          ) : (
        <div className={`grid overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-border)] gap-px ${view === 'day' ? 'mx-auto w-full max-w-4xl grid-cols-1' : view === 'month' ? 'grid-cols-7 min-w-[316px]' : 'grid-cols-1 sm:grid-cols-7'}`}>
          {visibleDays.map((day) => {
            const iso = toIsoDate(day)
            const dayItems = itemsByDate[iso] || []
            const outsideMonth = view === 'month' && day.getMonth() !== anchor.getMonth()
            const visibleItems = view === 'month' ? dayItems.slice(0, isCoarsePointer ? 3 : 2) : dayItems
            const hiddenItemCount = dayItems.length - visibleItems.length
            const isToday = iso === todayIso

            return (
              <div
                key={iso}
                className={`relative flex min-w-0 flex-col p-2 transition-colors duration-150 sm:p-3 ${view === 'day' ? 'min-h-[28rem] flex-1' : view === 'month' ? 'h-20 min-h-20 sm:h-32 sm:min-h-32 lg:h-40 lg:min-h-40' : 'min-h-32 sm:h-64 sm:min-h-64'} ${isToday && view !== 'day' ? 'bg-[#caa24c]/[0.07]' : 'bg-[color:var(--portal-card)] hover:bg-[color:var(--portal-soft)]'} ${outsideMonth ? 'opacity-50' : ''}`}
              >
                <button type="button" aria-label={`View schedule for ${formatDayHeading(iso)}${isToday ? ', today' : ''}${view === 'month' && dayItems.length ? `, ${dayItems.length} scheduled items: ${dayItems.map((item) => `${item.warningLabel ? `Warning: ${item.warningLabel}. ` : ''}${item.title}`).join(', ')}` : ''}`} onClick={() => selectDay(iso)} className="portal-calendar-day-hit absolute inset-0 z-0 cursor-pointer rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]" />
                <div className="pointer-events-none relative z-10 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] sm:text-[10px]">
                      {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(day)}
                    </p>
                    {view !== 'day' ? (
                      <p className={`mt-0.5 text-left text-xs font-semibold tabular-nums sm:mt-1 sm:text-sm ${isToday ? 'text-[#8c6529] dark:text-[#f1d27a]' : 'text-[color:var(--portal-text)]'}`}>
                        {day.getDate()}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{day.getDate()}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                    {isToday ? <span className="hidden rounded bg-[#caa24c]/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#a8792f] sm:inline">Today</span> : null}
                    {dayStatuses ? (
                      view === 'day' ? <p title={dayStatuses[iso] === 'open' ? 'At least one public tour time is available.' : 'No public tour times are currently available. This does not mean the venue is closed.'} className={`text-[9px] font-black uppercase tracking-wider ${dayStatuses[iso] === 'open' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{dayStatuses[iso] === 'open' ? 'TOUR TIMES OPEN' : 'NO TOUR TIMES'}</p> : <span title={dayStatuses[iso] === 'open' ? 'Public tour times are available.' : 'No public tour times are available.'} className={`h-1.5 w-1.5 rounded-full ${dayStatuses[iso] === 'open' ? 'bg-emerald-500' : 'bg-[color:var(--portal-faint)]'}`} />
                    ) : null}
                    </div>
                  </div>
                  <span aria-hidden="true" className="h-6 w-2" />
                </div>
                <div className="pointer-events-none relative z-10 mt-1.5 flex min-h-0 flex-1 flex-col gap-1 sm:mt-3 sm:gap-2">
                  {dayItems.length === 0 && view !== 'month' ? (
                    <p className="text-xs text-[color:var(--portal-muted)]">No items scheduled</p>
                  ) : dayItems.length > 0 ? (
                    <>
                      <div className={`portal-scrollbar flex min-h-0 flex-1 pr-1 ${view === 'month' && isCoarsePointer ? 'flex-row flex-wrap content-start gap-1 overflow-hidden' : view === 'month' ? 'flex-row flex-wrap content-start gap-1 overflow-hidden sm:flex-col sm:flex-nowrap sm:gap-2 sm:overflow-y-auto' : 'flex-col gap-2 overflow-y-auto'}`}>
                        {visibleItems.map((item) => (
                          view === 'month' && isCoarsePointer ? (
                            <span key={item.id} aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${scheduleToneClass(item.tone)}`} />
                          ) : (
                            <React.Fragment key={item.id}>
                            {view === 'month' ? <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full sm:hidden ${scheduleToneClass(item.tone)}`} /> : null}
                            <button
                              type="button"
                              onClick={() => selectItem(item)}
                              aria-label={`${item.warningLabel ? `Warning: ${item.warningLabel}. ` : ''}Open ${item.title}`}
                              className={`${view === 'month' ? 'hidden sm:block sm:min-h-11 sm:w-full sm:rounded-md sm:px-2 sm:py-1' : 'min-h-11 w-full rounded-md px-2 py-1.5'} pointer-events-auto relative text-left transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]`}
                            >
                              <span aria-hidden="true" className={`absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-full ${scheduleToneClass(item.tone)} ${view === 'month' ? 'hidden sm:block' : ''}`} />
                              {item.warningLabel ? <span className={`mb-0.5 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200 ${view === 'month' ? 'hidden sm:inline-flex' : ''}`}><AlertTriangle size={10} aria-hidden="true" />{item.warningLabel}</span> : null}
                              <p className={`font-semibold text-[color:var(--portal-text)] line-clamp-1 ${view === 'month' ? 'hidden text-xs sm:block' : 'text-sm sm:text-xs'}`}>{item.title}</p>
                              {view !== 'month' && item.taskContext?.leadName ? <p className="truncate text-xs text-[color:var(--portal-muted)] sm:text-[10px]">{item.taskContext.leadName}</p> : null}
                              {item.subtitle && (view === 'day' || !item.taskContext) ? <p className={`mt-0.5 leading-4 text-[color:var(--portal-muted)] line-clamp-1 ${view === 'month' ? 'hidden text-[10px] sm:block' : 'text-xs sm:mt-1 sm:text-[10px]'}`}>{item.subtitle}</p> : null}
                            </button>
                            </React.Fragment>
                          )
                        ))}
                      </div>
                    </>
                  ) : null}
                  {hiddenItemCount > 0 ? (isCoarsePointer ? <span aria-hidden="true" className="text-[8px] font-bold text-[#a8792f]">+{hiddenItemCount}</span> : <><span aria-hidden="true" className="text-[8px] font-bold text-[#a8792f] sm:hidden">+{hiddenItemCount}</span><button type="button" onClick={() => selectDay(iso)} className="pointer-events-auto hidden text-left text-[9px] font-bold text-[#a8792f] hover:text-[#caa24c] sm:block">+{hiddenItemCount} more</button></>) : null}
                </div>
              </div>
            )
          })}
        </div>
          )}
        </CalendarSkeletonHandoff>
      </div>

      <PortalModal
        isOpen={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? formatDayHeading(selectedDay) : 'Day details'}
        footer={
          selectedDay ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setAnchor(new Date(`${selectedDay}T12:00:00`))
                  onViewChange('day')
                  setSelectedDay(null)
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[color:var(--portal-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--portal-text)] transition-colors hover:text-[#8c6529] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
              >
                <CalendarDays size={14} className="text-[#caa24c]" />
                View full day in calendar
              </button>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="min-h-11 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
              >
                Close
              </button>
            </div>
          ) : null
        }
      >
        {selectedDay ? (
          <div className="space-y-3">
            {dayStatuses?.[selectedDay] ? (
              <div className="flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs">
                <span className={`h-2 w-2 rounded-full ${dayStatuses[selectedDay] === 'open' ? 'bg-emerald-500' : 'bg-[color:var(--portal-faint)]'}`} />
                <span className="font-semibold text-[color:var(--portal-text)]">
                  {dayStatuses[selectedDay] === 'open' ? 'Public tour times available' : 'No public tour times scheduled'}
                </span>
              </div>
            ) : null}
            {renderDayDetails(itemsByDate[selectedDay] || [], (item) => selectItem(item))}
          </div>
        ) : null}
      </PortalModal>

      <PortalModal
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem ? selectedItem.title : 'Event details'}
      >
        {selectedItem ? (
          <div className="space-y-3">
            <div className="flex min-w-0 gap-3 rounded-xl bg-[color:var(--portal-soft)]/60 p-4">
              <span aria-hidden="true" className={`w-1 shrink-0 self-stretch rounded-full ${scheduleToneClass(selectedItem.tone)}`} />
              <div className="min-w-0 flex-1">
              <TaskContext item={selectedItem} />
              {selectedItem.warningLabel ? <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200"><AlertTriangle size={11} aria-hidden="true" />{selectedItem.warningLabel}</span> : null}
              {selectedItem.subtitle ? <p className="text-sm text-[color:var(--portal-muted)]">{selectedItem.subtitle}</p> : null}
              {!selectedItem.subtitle && !selectedItem.taskContext && !selectedItem.warningLabel ? <p className="text-sm text-[color:var(--portal-muted)]">{selectedItem.date ? formatDayHeading(selectedItem.date) : 'Details'}</p> : null}
              </div>
            </div>
            {selectedItem.taskContext?.leadHref ? <a href={selectedItem.taskContext.leadHref} className="inline-flex items-center justify-center rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">Open linked lead</a> : null}
            {selectedItem.href ? (
              <a
                href={selectedItem.href}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#caa24c]/10 px-3 py-2 text-xs font-semibold text-[#76591f] transition-colors hover:bg-[#caa24c]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:text-[#f1d27a]"
              >
                {selectedItem.openLabel || 'Open record'}
              </a>
            ) : null}
            {selectedItem.content ? <div>{selectedItem.content}</div> : null}
            {dismissError?.id === selectedItem.id ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{dismissError.message}</p> : null}
            {selectedItem.onDismiss ? (
              <div className="flex justify-end border-t border-[color:var(--portal-border)] pt-3">
                <button
                  type="button"
                  disabled={Boolean(dismissPendingId)}
                  onClick={() => void dismissItem(selectedItem)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-xs font-bold text-[color:var(--portal-muted)] transition hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current" aria-hidden="true">
                    <DismissIcon complete={dismissedId === selectedItem.id} />
                  </span>
                  {dismissPendingId === selectedItem.id ? 'Saving…' : dismissedId === selectedItem.id ? 'Done' : selectedItem.dismissLabel || 'Dismiss task'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </PortalModal>
    </section>
  )
}

function ScheduleView({
  items,
  onSelectItem,
  onDismissItem,
  dismissPendingId,
  dismissedId,
  dismissError,
}: {
  items: PortalCalendarItem[]
  onSelectItem: (item: PortalCalendarItem) => void
  onDismissItem: (item: PortalCalendarItem) => void
  dismissPendingId: string | null
  dismissedId: string | null
  dismissError: { id: string; message: string } | null
}) {
  const itemsByDate = items.reduce<Record<string, PortalCalendarItem[]>>((groups, item) => {
    groups[item.date] ??= []
    groups[item.date].push(item)
    return groups
  }, {})
  const dates = Object.keys(itemsByDate).sort()

  if (!dates.length) {
    return <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-6 text-center"><p className="text-sm text-[color:var(--portal-muted)]">No upcoming items.</p></div>
  }

  return (
    <div className="mx-auto max-w-4xl px-3 py-2 sm:px-6 sm:py-3">
      <div>
        {dates.map((date) => (
          <article key={date} className="border-b border-[color:var(--portal-border)] py-4 last:border-b-0 sm:py-5">
            <div className="grid gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-6">
              <div className="px-2 sm:pt-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#a8792f] dark:text-[#dfbd68]">{new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(`${date}T12:00:00`))}</p>
                <p className="mt-0.5 text-base font-semibold tracking-tight text-[color:var(--portal-text)]">{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`))}</p>
              </div>
              <div className="divide-y divide-[color:var(--portal-border)]">
                {itemsByDate[date].map((item) => (
                  <div key={item.id} className="group flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-[color:var(--portal-soft)]/60">
                    <span className={`h-9 w-1 shrink-0 rounded-full ${scheduleToneClass(item.tone)}`} aria-hidden="true" />
                    <button type="button" aria-label={`${item.warningLabel ? `Warning: ${item.warningLabel}. ` : ''}Open ${item.title}`} onClick={() => onSelectItem(item)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]">
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-bold text-[color:var(--portal-text)]">{item.title}</span>
                        <TaskContext item={item} compact />
                        {item.warningLabel ? <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200"><AlertTriangle size={11} aria-hidden="true" />{item.warningLabel}</span> : null}
                        {item.subtitle ? <span className="mt-1 block break-words text-xs text-[color:var(--portal-muted)]">{item.subtitle}</span> : null}
                      </span>
                      <span className="hidden shrink-0 text-xs font-medium text-[color:var(--portal-muted)] sm:inline">{item.openLabel || 'Open'}</span>
                    </button>
                    {item.onDismiss ? (
                      <div className="flex shrink-0 flex-col items-center">
                        <button type="button" aria-label={`${item.dismissLabel || 'Dismiss task'}: ${item.title}`} title={item.dismissLabel || 'Dismiss task'} disabled={Boolean(dismissPendingId)} onClick={() => onDismissItem(item)} className="flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--portal-muted)] transition hover:bg-[color:var(--portal-card)] hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] disabled:cursor-wait disabled:opacity-60">
                          {item.dismissLabel === 'Complete task' || dismissedId === item.id ? <DismissIcon complete={dismissedId === item.id} /> : <X size={16} aria-hidden="true" />}
                        </button>
                        {dismissError?.id === item.id ? <span role="alert" className="mt-1 max-w-36 text-center text-[10px] text-rose-700 dark:text-rose-300">{dismissError.message}</span> : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function scheduleToneClass(tone: PortalCalendarItem['tone'] = 'zinc') {
  return { gold: 'bg-[#caa24c]', blue: 'bg-sky-500', green: 'bg-emerald-500', rose: 'bg-rose-500', zinc: 'bg-[color:var(--portal-muted)]', warning: 'bg-amber-600 dark:bg-amber-400' }[tone]
}

function DismissIcon({ complete }: { complete: boolean }) {
  const reduceMotion = useReducedMotion()
  return (
    <AnimatePresence mode="wait" initial={false}>
      {complete ? (
        <motion.span key="complete" initial={reduceMotion ? false : { scale: 0.5, opacity: 0, rotate: -25 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={reduceMotion ? undefined : { scale: 0.7, opacity: 0 }} transition={reduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 500, damping: 25 }}>
          <Check size={18} aria-hidden="true" />
        </motion.span>
      ) : (
        <motion.span key="open" initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={reduceMotion ? undefined : { scale: 0.55, opacity: 0 }} transition={reduceMotion ? { duration: 0.01 } : { duration: 0.16 }}>
          <Circle size={18} aria-hidden="true" />
        </motion.span>
      )}
    </AnimatePresence>
  )
}

function CalendarViewSkeleton({ view }: { view: PortalCalendarView }) {
  if (view === 'schedule') {
    return (
      <div className="mx-auto max-w-4xl px-3 py-2 sm:px-6 sm:py-3" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => {
          const warningRow = index % 2 === 0
          return (
          <div key={index} className="border-b border-[color:var(--portal-border)] py-4 last:border-b-0 sm:py-5">
            <div className="grid gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-6">
              <div className="px-2 sm:pt-3">
                <PortalSkeleton className="h-3 w-16 rounded" />
                <PortalSkeleton className="mt-1 h-5 w-16 rounded" />
              </div>
              <div>
                <div className={`flex ${warningRow ? 'min-h-[6.125rem]' : 'min-h-[4.5625rem]'} items-center gap-3 px-2 py-3`}>
                  <span className="h-9 w-1 shrink-0 rounded-full bg-[color:var(--portal-border)]" />
                  <span className="min-w-0 flex-1 space-y-1">
                    <PortalSkeleton className="h-4 w-2/5 rounded" />
                    {warningRow ? <PortalSkeleton className="h-3 w-1/3 rounded" /> : null}
                    <PortalSkeleton className="h-4 w-3/5 rounded" />
                  </span>
                  <PortalSkeleton className="h-4 w-16 shrink-0 rounded" />
                </div>
              </div>
            </div>
          </div>
          )
        })}
      </div>
    )
  }

  const rows = view === 'month' ? 42 : view === 'week' ? 7 : 1
  return (
    <div
      aria-hidden="true"
      className={`grid gap-px overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-border)] ${view === 'month' ? 'grid-cols-7 min-w-[316px]' : view === 'day' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-7'}`}
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className={`flex min-w-0 flex-col bg-[color:var(--portal-card)] p-2 sm:p-3 ${view === 'month' ? 'h-20 min-h-20 sm:h-32 sm:min-h-32 lg:h-40 lg:min-h-40' : view === 'day' ? 'min-h-[28rem]' : 'min-h-32 sm:h-64 sm:min-h-64'}`}>
          <PortalSkeleton className="h-3 w-10 rounded" />
          <PortalSkeleton className="mt-2 h-4 w-7 rounded" />
          <PortalSkeleton className="mt-3 h-8 w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}

function CalendarSkeletonHandoff({
  enabled,
  loading,
  view,
  children,
}: {
  enabled: boolean
  loading: boolean
  view: PortalCalendarView
  children: React.ReactNode
}) {
  if (!enabled) return <>{children}</>

  return (
    <PortalSkeletonTransition
      loading={loading}
      overlap
      className="min-w-0"
      skeleton={<CalendarViewSkeleton view={view} />}
    >
      {children}
    </PortalSkeletonTransition>
  )
}

function renderDayDetails(items: PortalCalendarItem[], onSelectItem: (item: PortalCalendarItem) => void) {
  if (items.length === 0) {
    return <p className="text-sm text-[color:var(--portal-muted)]">No items on this day.</p>
  }

  return (
    <div className="divide-y divide-[color:var(--portal-border)]">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelectItem(item)}
          aria-label={`${item.warningLabel ? `Warning: ${item.warningLabel}. ` : ''}Open ${item.title}`}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]"
        >
          <span aria-hidden="true" className={`h-9 w-1 shrink-0 rounded-full ${scheduleToneClass(item.tone)}`} />
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold text-[color:var(--portal-text)]">{item.title}</p>
              <TaskContext item={item} compact />
              {item.warningLabel ? <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-200"><AlertTriangle size={11} aria-hidden="true" />{item.warningLabel}</span> : null}
              {item.subtitle ? <p className="mt-1 text-sm text-[color:var(--portal-muted)]">{item.subtitle}</p> : null}
            </div>
            <span className="hidden shrink-0 text-xs font-medium text-[color:var(--portal-muted)] sm:inline">
              {item.openLabel || 'Open'}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}

function formatDayHeading(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`)
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}
