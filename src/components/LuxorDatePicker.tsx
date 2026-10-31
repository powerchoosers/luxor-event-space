'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatLocalDateKey, getDateKeyInTimeZone } from '@/lib/publicEventDate'

function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function dateLabel(value: string, locale: string) {
  const date = parseDateKey(value)
  return date ? new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date) : ''
}

function currentDateKey(timeZone?: string) {
  if (timeZone) {
    try {
      return getDateKeyInTimeZone(new Date(), timeZone)
    } catch {
      // Invalid zones fall back to the browser's local calendar day.
    }
  }
  return formatLocalDateKey(new Date())
}

export function LuxorDatePicker({
  value,
  onChange,
  placeholder = 'Select a date',
  locale = 'en-US',
  className = '',
  availableDates,
  timeZone,
  label = 'Date',
  theme = 'light',
  minDate,
  allowPastDates = false,
  openToValue = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  locale?: string
  className?: string
  availableDates?: Set<string>
  timeZone?: string
  label?: string
  theme?: 'light' | 'portal'
  minDate?: string
  allowPastDates?: boolean
  openToValue?: boolean
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const monthYearTriggerRef = useRef<HTMLButtonElement>(null)
  const monthYearDialogRef = useRef<HTMLElement>(null)
  const returnFocusToMonthYearRef = useRef(false)
  const returnFocusAfterCloseRef = useRef(false)
  const safeAreaInsetsRef = useRef<{ top: number; right: number; bottom: number; left: number } | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const isPortal = theme === 'portal'
  const motionDuration = prefersReducedMotion ? 0 : 0.18
  const [open, setOpen] = useState(false)
  const [monthYearOpen, setMonthYearOpen] = useState(false)
  const [todayKey, setTodayKey] = useState(() => currentDateKey(timeZone))
  const [view, setView] = useState(() => {
    const selected = openToValue ? parseDateKey(value) : null
    if (selected) return new Date(selected.getFullYear(), selected.getMonth(), 1)
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [draftMonth, setDraftMonth] = useState(new Date().getMonth())
  const [draftYear, setDraftYear] = useState(new Date().getFullYear())
  const [coords, setCoords] = useState({ top: 0, left: 16, width: 328, maxHeight: 420, daySize: 36 })
  const [focusDate, setFocusDate] = useState(() => formatLocalDateKey(new Date()))

  const isSelectableDate = useCallback((date: string, today = todayKey) => {
    return (!minDate || date >= minDate)
      && (allowPastDates || date >= today)
      && (!availableDates || availableDates.has(date))
  }, [allowPastDates, availableDates, minDate, todayKey])

  const hasSelectableDateInMonth = useCallback((monthYear: Date, today = todayKey) => {
    const year = monthYear.getFullYear()
    const month = monthYear.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      if (isSelectableDate(date, today)) return true
    }
    return false
  }, [isSelectableDate, todayKey])

  const firstSelectableDateInMonth = useCallback((monthYear: Date, today = todayKey) => {
    const year = monthYear.getFullYear()
    const month = monthYear.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      if (isSelectableDate(date, today)) return date
    }
    return ''
  }, [isSelectableDate, todayKey])

  const findSelectableMonth = useCallback((from: Date, direction: -1 | 1, today = todayKey) => {
    let candidate = new Date(from.getFullYear(), from.getMonth() + direction, 1)
    const todayYear = Number(today.slice(0, 4))
    const selectedYear = parseDateKey(value)?.getFullYear() ?? todayYear
    const availableYears = availableDates ? [...availableDates].map((date) => Number(date.slice(0, 4))).filter(Number.isFinite) : []
    const lowerYear = minDate ? Number(minDate.slice(0, 4)) : allowPastDates ? Math.min(1900, selectedYear, ...availableYears) : todayYear
    const upperYear = allowPastDates ? Math.max(todayYear + 30, selectedYear, ...availableYears) : todayYear + 30
    const firstAllowedMonth = new Date(lowerYear, 0, 1)
    const lastAllowedMonth = new Date(upperYear, 11, 1)
    while (candidate >= firstAllowedMonth && candidate <= lastAllowedMonth) {
      if (hasSelectableDateInMonth(candidate, today)) return candidate
      candidate = new Date(candidate.getFullYear(), candidate.getMonth() + direction, 1)
    }
    return null
  }, [allowPastDates, availableDates, hasSelectableDateInMonth, minDate, todayKey, value])

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    if (!safeAreaInsetsRef.current) {
      const probe = document.createElement('div')
      probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)'
      document.body.appendChild(probe)
      const styles = window.getComputedStyle(probe)
      safeAreaInsetsRef.current = {
        top: Number.parseFloat(styles.paddingTop) || 0,
        right: Number.parseFloat(styles.paddingRight) || 0,
        bottom: Number.parseFloat(styles.paddingBottom) || 0,
        left: Number.parseFloat(styles.paddingLeft) || 0,
      }
      probe.remove()
    }
    const safeArea = safeAreaInsetsRef.current
    const viewport = window.visualViewport
    const viewportLeft = viewport?.offsetLeft ?? 0
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportWidth = viewport?.width ?? window.innerWidth
    const viewportHeight = viewport?.height ?? window.innerHeight
    const viewportRight = viewportLeft + viewportWidth
    const viewportBottomEdge = viewportTop + viewportHeight
    const isMobileViewport = window.matchMedia('(max-width: 767px)').matches
    const margin = 12
    const horizontalMargin = Math.max(margin, safeArea.left)
    const rightMargin = Math.max(margin, safeArea.right)
    const width = Math.max(1, Math.min(360, viewportWidth - horizontalMargin - rightMargin))
    let stickyBottom = !isPortal && isMobileViewport ? Math.max(76, safeArea.bottom + 8) : Math.max(12, safeArea.bottom + 8)
    if (!isPortal && isMobileViewport) {
      const bottomActions = Array.from(document.querySelectorAll<HTMLElement>('.site-floating-action'))
      for (const action of bottomActions) {
        const actionRect = action.getBoundingClientRect()
        if (actionRect.width < viewportWidth * 0.7 || actionRect.height < 32) continue
        if (actionRect.bottom >= viewportBottomEdge - 4 && actionRect.top < viewportBottomEdge) {
          stickyBottom = Math.max(stickyBottom, viewportBottomEdge - actionRect.top + 8)
        }
      }
    }
    const viewportBottom = viewportBottomEdge - stickyBottom
    const stickyTop = !isPortal ? document.getElementById('shared-header')?.getBoundingClientRect().bottom ?? 0 : 0
    const safeTop = Math.max(viewportTop + Math.max(8, safeArea.top + 8), stickyTop + 8)
    const availableHeight = Math.max(1, viewportBottom - safeTop)
    const contentHeight = panelRef.current?.scrollHeight ?? 320
    const naturalHeight = Math.min(contentHeight, 440)
    const fittedHeight = Math.min(naturalHeight, availableHeight)
    const daySize = isMobileViewport ? Math.max(20, Math.min(32, Math.floor((availableHeight - 108) / 6))) : 40
    const below = Math.max(0, viewportBottom - rect.bottom - 6)
    const above = Math.max(0, rect.top - safeTop - 6)
    const triggerAboveViewport = rect.bottom < safeTop
    const triggerBelowViewport = rect.top > viewportBottom
    const fitsBelow = below >= fittedHeight
    const fitsAbove = above >= fittedHeight
    const desiredTop = triggerAboveViewport
      ? safeTop
      : triggerBelowViewport
        ? viewportBottom - fittedHeight
        : fitsBelow
          ? rect.bottom + 6
          : fitsAbove
            ? rect.top - fittedHeight - 6
            : rect.top + rect.height / 2 - fittedHeight / 2
    const top = Math.max(safeTop, Math.min(desiredTop, viewportBottom - fittedHeight))
    setCoords({
      top,
      left: isMobileViewport
        ? viewportLeft + horizontalMargin + Math.max(0, (viewportWidth - horizontalMargin - rightMargin - width) / 2)
        : Math.max(viewportLeft + horizontalMargin, Math.min(rect.left, viewportRight - width - rightMargin)),
      width,
      maxHeight: fittedHeight,
      daySize,
    })
  }, [isPortal])

  const closeAndReturnFocus = useCallback(() => {
    returnFocusAfterCloseRef.current = true
    setOpen(false)
    setMonthYearOpen(false)
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const schedule = () => requestAnimationFrame(updatePosition)
    const resize = () => {
      safeAreaInsetsRef.current = null
      requestAnimationFrame(updatePosition)
    }
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', schedule, true)
    window.visualViewport?.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('scroll', schedule)
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        if (monthYearOpen) {
          returnFocusToMonthYearRef.current = true
          setMonthYearOpen(false)
        }
        else {
          closeAndReturnFocus()
        }
      }
    }
    window.addEventListener('keydown', keydown)
    const refreshToday = () => {
      const nextToday = currentDateKey(timeZone)
      setTodayKey(nextToday)
      const todayDate = parseDateKey(nextToday) ?? new Date()
      const currentMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
      const nextView = !allowPastDates && view < currentMonth ? currentMonth : view
      setView(nextView)
      setFocusDate((current) => {
        const date = parseDateKey(current)
        const inCurrentView = date && date.getFullYear() === nextView.getFullYear() && date.getMonth() === nextView.getMonth()
        return date && inCurrentView && isSelectableDate(current, nextToday)
          ? current
          : firstSelectableDateInMonth(nextView, nextToday)
      })
    }
    const refreshInterval = window.setInterval(refreshToday, 60_000)
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', schedule, true)
      window.visualViewport?.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('keydown', keydown)
      window.clearInterval(refreshInterval)
    }
  }, [open, monthYearOpen, updatePosition, isSelectableDate, firstSelectableDateInMonth, view, timeZone, allowPastDates])

  useEffect(() => {
    if (!open || monthYearOpen) return
    const frame = requestAnimationFrame(() => {
      if (returnFocusToMonthYearRef.current) {
        returnFocusToMonthYearRef.current = false
        monthYearTriggerRef.current?.focus()
      } else {
        const dayButton = focusDate ? panelRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]:not(:disabled)`) : null
        if (dayButton) dayButton.focus()
        else panelRef.current?.focus()
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [open, monthYearOpen, view, focusDate])

  useEffect(() => {
    if (!monthYearOpen) return
    const frame = requestAnimationFrame(() => {
      monthYearDialogRef.current?.querySelector<HTMLElement>(`[data-month="${draftMonth}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest' })
      monthYearDialogRef.current?.querySelector<HTMLElement>(`[data-year="${draftYear}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest' })
      monthYearDialogRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [draftMonth, draftYear, monthYearOpen])

  useEffect(() => {
    if (!monthYearOpen) return
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !monthYearDialogRef.current) return
      const buttons = Array.from(monthYearDialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)'))
      if (!buttons.length) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', trapFocus)
    return () => window.removeEventListener('keydown', trapFocus)
  }, [monthYearOpen])

  const year = view.getFullYear()
  const month = view.getMonth()
  const today = todayKey || currentDateKey(timeZone)
  const todayYear = Number(today.slice(0, 4))
  const selectedYear = parseDateKey(value)?.getFullYear() ?? todayYear
  const availableYears = availableDates ? [...availableDates].map((date) => Number(date.slice(0, 4))).filter(Number.isFinite) : []
  const firstYear = minDate ? Number(minDate.slice(0, 4)) : allowPastDates ? Math.min(1900, selectedYear, ...availableYears) : todayYear
  const lastYear = allowPastDates ? Math.max(todayYear + 30, selectedYear, ...availableYears) : todayYear + 30
  const localizedMonths = useMemo(() => Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, index, 1))), [locale])
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2023, 0, index + 1))), [locale])
  const days = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => `${year}-${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`),
      ...Array.from({ length: (7 - ((firstWeekday + daysInMonth) % 7)) % 7 }, () => null),
    ] as Array<string | null>
  }, [month, year])

  const previousSelectableMonth = findSelectableMonth(view, -1, today)
  const nextSelectableMonth = findSelectableMonth(view, 1, today)
  const moveMonth = (amount: -1 | 1) => {
    const next = amount === -1 ? previousSelectableMonth : nextSelectableMonth
    if (!next) return
    setView(next)
    const nextFocus = firstSelectableDateInMonth(next, today)
    setFocusDate(nextFocus)
    requestAnimationFrame(() => {
      const dayButton = nextFocus ? panelRef.current?.querySelector<HTMLButtonElement>(`[data-date="${nextFocus}"]`) : null
      if (dayButton) dayButton.focus()
      else monthYearTriggerRef.current?.focus()
    })
  }

  const selectDate = (date: string) => {
    if (!isSelectableDate(date)) return
    onChange(date)
    setFocusDate(date)
    closeAndReturnFocus()
  }

  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const shifts: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    const base = parseDateKey(focusDate || today)
    if (!base) return
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const direction = event.key === 'PageUp' ? -1 : 1
      const requested = new Date(base.getFullYear(), base.getMonth() + direction * (event.shiftKey ? 12 : 1), 1)
      const destination = hasSelectableDateInMonth(requested, today) ? requested : findSelectableMonth(requested, direction, today)
      if (!destination) return
      const date = firstSelectableDateInMonth(destination, today)
      setView(destination)
      setFocusDate(date)
      requestAnimationFrame(() => {
        const button = date ? panelRef.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`) : null
        if (button) button.focus()
        else panelRef.current?.focus()
      })
      return
    }
    let next: Date | null = null
    if (event.key in shifts) {
      next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + shifts[event.key])
    } else if (event.key === 'Home') {
      next = new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay())
    } else if (event.key === 'End') {
      next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (6 - base.getDay()))
    }
    if (!next) return
    event.preventDefault()
    const step = event.key === 'Home' ? 1 : event.key === 'End' ? -1 : Math.sign(shifts[event.key])
    const weekStart = new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay())
    const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)
    let nextKey = formatLocalDateKey(next)
    let attempts = 0
    while (!isSelectableDate(nextKey) && attempts < 366 * 31) {
      next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + step)
      if ((event.key === 'Home' && next > weekEnd) || (event.key === 'End' && next < weekStart)) return
      nextKey = formatLocalDateKey(next)
      attempts += 1
    }
    if (!next || !isSelectableDate(nextKey)) return
    setFocusDate(nextKey)
    setView(new Date(next.getFullYear(), next.getMonth(), 1))
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>(`[data-date="${nextKey}"]`)?.focus())
  }

  const openMonthYear = () => {
    setDraftMonth(month)
    setDraftYear(year)
    setMonthYearOpen(true)
  }

  const chooseDraftYear = (nextYear: number) => {
    setDraftYear(nextYear)
    const currentMonth = new Date(nextYear, draftMonth, 1)
    if (!hasSelectableDateInMonth(currentMonth, today)) {
      const firstMonth = Array.from({ length: 12 }, (_, index) => index).find((index) => hasSelectableDateInMonth(new Date(nextYear, index, 1), today))
      if (firstMonth !== undefined) setDraftMonth(firstMonth)
    }
  }

  const applyDraftMonthYear = () => {
    const today = currentDateKey(timeZone)
    const requestedMonth = new Date(draftYear, draftMonth, 1)
    if (!hasSelectableDateInMonth(requestedMonth, today)) return
    setTodayKey(today)
    setView(requestedMonth)
    const firstDate = firstSelectableDateInMonth(requestedMonth, today)
    setFocusDate(firstDate)
    setMonthYearOpen(false)
    requestAnimationFrame(() => {
      const dayButton = firstDate ? panelRef.current?.querySelector<HTMLButtonElement>(`[data-date="${firstDate}"]`) : null
      if (dayButton) dayButton.focus()
      else monthYearTriggerRef.current?.focus()
    })
  }

  const resetCalendarView = () => {
    const today = currentDateKey(timeZone)
    setTodayKey(today)
    const todayDate = parseDateKey(today) ?? new Date()
    const currentMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
    setView(currentMonth)
    setFocusDate(firstSelectableDateInMonth(currentMonth, today))
    setMonthYearOpen(false)
    requestAnimationFrame(() => {
      const firstDate = firstSelectableDateInMonth(currentMonth, today)
      const dayButton = firstDate ? panelRef.current?.querySelector<HTMLButtonElement>(`[data-date="${firstDate}"]`) : null
      if (dayButton) dayButton.focus()
      else monthYearTriggerRef.current?.focus()
    })
  }

  const years = useMemo(() => Array.from({ length: Math.max(1, lastYear - firstYear + 1) }, (_, index) => firstYear + index), [firstYear, lastYear])

  return (
    <div className={`relative min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `${label}, ${dateLabel(value, locale)}. Change date` : placeholder}
        onClick={() => {
          if (!open) {
            const now = new Date()
            const currentToday = currentDateKey(timeZone)
            setTodayKey(currentToday)
            const todayDate = parseDateKey(currentToday) ?? now
            const selected = openToValue ? parseDateKey(value) : null
            const currentMonth = selected ? new Date(selected.getFullYear(), selected.getMonth(), 1) : new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
            setView(currentMonth)
            setFocusDate(selected && isSelectableDate(value, currentToday) ? value : firstSelectableDateInMonth(currentMonth, currentToday))
            setOpen(true)
          } else closeAndReturnFocus()
        }}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3.5 text-left text-sm transition hover:border-[#caa24c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/30 ${isPortal ? 'border-[color:var(--portal-border,rgba(202,162,76,0.24))] bg-[color:var(--portal-soft,#171310)] text-[color:var(--portal-text,#f7efe3)]' : 'border-[#d8c4a4] bg-[#fffdfa] text-[#3b2b1d]'}`}
      >
        <span className={value ? (isPortal ? 'text-[color:var(--portal-text,#f7efe3)]' : 'text-[#3b2b1d]') : (isPortal ? 'text-[color:var(--portal-muted,#b9ad9f)]' : 'text-[#827567]')}>{value ? dateLabel(value, locale) : placeholder}</span>
        <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-[#8d672b]" />
      </button>

      {typeof document !== 'undefined' ? createPortal(
        <AnimatePresence initial={false} onExitComplete={() => { if (returnFocusAfterCloseRef.current) { returnFocusAfterCloseRef.current = false; triggerRef.current?.focus() } }}>
        {open ? <>
          <motion.button key="calendar-backdrop" type="button" tabIndex={-1} aria-label="Close calendar" onClick={closeAndReturnFocus} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: motionDuration }} className="fixed inset-0 z-[9980] cursor-default bg-transparent" />
          <motion.div key="calendar-panel" initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.99 }} transition={{ duration: motionDuration }} style={{ position: 'fixed', zIndex: 9981, top: coords.top, left: coords.left, width: coords.width }}>
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`Choose ${label.toLowerCase()}`}
            aria-modal="false"
            tabIndex={-1}
            onKeyDown={handleGridKeyDown}
            className={`public-calendar-scroll relative z-[9981] w-full overflow-visible overscroll-contain rounded-2xl border p-2.5 shadow-[0_18px_48px_-24px_rgba(55,37,19,0.48)] focus:outline-none sm:p-4 ${isPortal ? 'border-[color:var(--portal-border,rgba(202,162,76,0.24))] bg-[color:var(--portal-bg,#100d0b)] text-[color:var(--portal-text,#f7efe3)]' : 'border-[#d8c4a4] bg-[#fffdfa] text-[#3b2b1d]'}`}
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className={`flex items-center justify-between gap-2 border-b pb-1.5 sm:pb-2.5 ${isPortal ? 'border-[color:var(--portal-border,rgba(202,162,76,0.24))]' : 'border-[#eadfce]'}`}>
              <button type="button" aria-label="Previous month" disabled={!previousSelectableMonth} onClick={() => moveMonth(-1)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#8d672b] transition hover:bg-[#f7efe3] disabled:cursor-not-allowed disabled:text-[#c8bcae] sm:h-10 sm:w-10">
                <ChevronLeft aria-hidden="true" className="h-5 w-5" />
              </button>
              <button ref={monthYearTriggerRef} type="button" aria-haspopup="dialog" aria-expanded={monthYearOpen} onClick={openMonthYear} className={`flex min-h-8 items-center gap-1 rounded-lg px-2 font-serif text-base font-semibold hover:bg-[#f7efe3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 sm:min-h-10 ${isPortal ? 'text-[color:var(--portal-text,#f7efe3)] hover:bg-[color:var(--portal-soft,rgba(255,255,255,0.06))]' : 'text-[#33291f]'}`}>
                {localizedMonths[month]} {year}<ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-[#8d672b]" />
              </button>
              <button type="button" aria-label="Next month" disabled={!nextSelectableMonth} onClick={() => moveMonth(1)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#8d672b] transition hover:bg-[#f7efe3] disabled:cursor-not-allowed disabled:text-[#c8bcae] sm:h-10 sm:w-10">
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <div role="grid" aria-label={`${localizedMonths[month]} ${year}`} className="mt-1.5 sm:mt-2">
              <div role="row" className={`grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wide ${isPortal ? 'text-[color:var(--portal-muted,#b9ad9f)]' : 'text-[#8b7b6b]'}`}>
                {weekdays.map((weekday, index) => <span role="columnheader" key={`${weekday}-${index}`} className="py-1 sm:py-1.5">{weekday}</span>)}
              </div>
              <div className="space-y-0.5 text-center">
                {Array.from({ length: Math.ceil(days.length / 7) }, (_, weekIndex) => (
                  <div role="row" key={`week-${weekIndex}`} className="grid grid-cols-7 gap-y-0.5">
                    {days.slice(weekIndex * 7, weekIndex * 7 + 7).map((date, dayIndex) => {
                  if (!date) return <div role="gridcell" key={`blank-${weekIndex}-${dayIndex}`} aria-hidden="true" />
                  const day = Number(date.slice(-2))
                  const disabled = !isSelectableDate(date, today)
                  const selected = value === date
                  const isToday = date === today
                  const tabIndex = focusDate === date ? 0 : -1
                  const available = Boolean(availableDates?.has(date))
                  return (
                    <div role="gridcell" key={date} aria-selected={selected}>
                      <button
                        type="button"
                        data-date={date}
                        tabIndex={tabIndex}
                        disabled={disabled}
                        aria-label={`${new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(parseDateKey(date)!)}${available ? ', visit times available' : ''}`}
                        aria-current={isToday ? 'date' : undefined}
                        aria-pressed={selected}
                        onFocus={() => setFocusDate(date)}
                        onClick={() => selectDate(date)}
                        style={{ width: coords.daySize, height: coords.daySize }}
                        className={`relative mx-auto flex items-center justify-center rounded-full text-sm tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8d672b] ${selected ? 'bg-[#caa24c] font-semibold text-white shadow-sm' : disabled ? (isPortal ? 'cursor-not-allowed text-[color:var(--portal-muted,#b9ad9f)] opacity-50' : 'cursor-not-allowed text-[#c9c1b7]') : isToday ? 'border border-[#caa24c] font-semibold text-[#6f4d1f]' : isPortal ? 'text-[color:var(--portal-text,#f7efe3)] hover:bg-[color:var(--portal-soft,rgba(255,255,255,0.06))]' : 'text-[#3b2b1d] hover:bg-[#f5ead8]'}`}
                      >{day}{available ? <span aria-hidden="true" className={`absolute bottom-0.5 h-1 w-1 rounded-full ${selected ? 'bg-white' : 'bg-emerald-600'}`} /> : null}</button>
                    </div>
                  )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          </motion.div>
          {monthYearOpen ? (
            <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-[#241d17]/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { returnFocusToMonthYearRef.current = true; setMonthYearOpen(false) } }}>
              <section ref={monthYearDialogRef} role="dialog" aria-modal="true" aria-label="Select Month & Year" tabIndex={-1} className={`flex max-h-[min(440px,calc(100dvh-2rem))] w-full max-w-[320px] flex-col overflow-hidden rounded-2xl border p-4 shadow-2xl ${isPortal ? 'border-[color:var(--portal-border,rgba(202,162,76,0.24))] bg-[color:var(--portal-bg,#100d0b)] text-[color:var(--portal-text,#f7efe3)]' : 'border-[#e4d4bf] bg-[#fffdfa]'}`}>
                <h2 className={`text-center font-serif text-lg font-semibold ${isPortal ? 'text-[color:var(--portal-text,#f7efe3)]' : 'text-[#33291f]'}`}>Select Month &amp; Year</h2>
                <div className="mt-3 grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-hidden">
                  <div aria-label="Months" className={`public-calendar-scroll overflow-y-auto overscroll-contain rounded-xl border p-1 ${isPortal ? 'border-[color:var(--portal-border,rgba(202,162,76,0.24))]' : 'border-[#eadfce]'}`} style={{ WebkitOverflowScrolling: 'touch' }}>
                    {localizedMonths.map((item, index) => {
                      const disabled = !hasSelectableDateInMonth(new Date(draftYear, index, 1), today)
                      return <button key={item} type="button" data-month={index} disabled={disabled} aria-pressed={draftMonth === index} onClick={() => setDraftMonth(index)} className={`w-full rounded-lg px-2 py-2.5 text-left text-sm transition ${disabled ? (isPortal ? 'cursor-not-allowed text-[color:var(--portal-muted,#b9ad9f)] opacity-50' : 'cursor-not-allowed text-[#c9c1b7]') : draftMonth === index ? 'bg-[#f0e7d9] font-semibold text-[#33291f]' : isPortal ? 'text-[color:var(--portal-text,#f7efe3)] hover:bg-[color:var(--portal-soft,rgba(255,255,255,0.06))]' : 'text-[#6f5f4f] hover:bg-[#f7efe3]'}`}>{item}</button>
                    })}
                  </div>
                  <div aria-label="Years" className={`public-calendar-scroll overflow-y-auto overscroll-contain rounded-xl border p-1 ${isPortal ? 'border-[color:var(--portal-border,rgba(202,162,76,0.24))]' : 'border-[#eadfce]'}`} style={{ WebkitOverflowScrolling: 'touch' }}>
                    {years.map((item) => {
                      const disabled = !Array.from({ length: 12 }, (_, index) => new Date(item, index, 1)).some((monthDate) => hasSelectableDateInMonth(monthDate, today))
                      return <button key={item} type="button" data-year={item} disabled={disabled} aria-pressed={draftYear === item} onClick={() => chooseDraftYear(item)} className={`w-full rounded-lg px-2 py-2.5 text-center text-sm tabular-nums transition disabled:cursor-not-allowed ${disabled ? (isPortal ? 'text-[color:var(--portal-muted,#b9ad9f)] opacity-50' : 'text-[#c9c1b7]') : draftYear === item ? 'bg-[#f0e7d9] font-semibold text-[#33291f]' : isPortal ? 'text-[color:var(--portal-text,#f7efe3)] hover:bg-[color:var(--portal-soft,rgba(255,255,255,0.06))]' : 'text-[#6f5f4f] hover:bg-[#f7efe3]'}`}>{item}</button>
                    })}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button type="button" onClick={resetCalendarView} className={`min-h-10 rounded-xl border px-4 text-sm font-medium text-[#6f4d1f] hover:bg-[#f7efe3] ${isPortal ? 'border-[color:var(--portal-border,rgba(202,162,76,0.24))] text-[color:var(--portal-muted,#d7c29a)] hover:bg-[color:var(--portal-soft,rgba(255,255,255,0.06))]' : 'border-[#d8c4a4]'}`}>Reset</button>
                  <button type="button" disabled={!hasSelectableDateInMonth(new Date(draftYear, draftMonth, 1), today)} onClick={applyDraftMonthYear} className="min-h-10 rounded-xl bg-[#caa24c] px-5 text-sm font-semibold text-white hover:bg-[#b98a3d] disabled:cursor-not-allowed disabled:opacity-50">Done</button>
                </div>
              </section>
            </div>
          ) : null}
        </> : null}
        </AnimatePresence>,
        document.body,
      ) : null}
    </div>
  )
}
