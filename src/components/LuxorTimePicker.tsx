'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Clock3, ChevronDown } from 'lucide-react'

type TimeColumn<T extends string | number> = { name: string; options: T[]; selected: T; set: (value: T) => void; format: (value: T) => string }

function timePickerParts(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return { hour: 4, minute: 0, period: 'PM' as const }
  const hour24 = Number(match[1])
  const minute = Number(match[2])
  if (hour24 > 23 || minute > 59) return { hour: 4, minute: 0, period: 'PM' as const }
  return {
    hour: hour24 % 12 || 12,
    minute,
    period: (hour24 >= 12 ? 'PM' : 'AM') as 'AM' | 'PM',
  }
}

export function LuxorTimePicker({ value, onChange, placeholder = 'Select a time', label = 'Preferred time', className = '' }: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string; className?: string }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const periodButtons = useRef<Array<HTMLButtonElement | null>>([])
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [initialTime] = useState(() => timePickerParts(value))
  const [hour, setHour] = useState(initialTime.hour)
  const [minute, setMinute] = useState(initialTime.minute)
  const [period, setPeriod] = useState<'AM' | 'PM'>(initialTime.period)
  const [position, setPosition] = useState({ top: 0, left: 12, width: 300, maxHeight: 300, wheelHeight: 144 })
  const display = value ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date('2000-01-01T' + value + ':00')) : placeholder
  const updatePosition = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect) return
    const viewport = window.visualViewport
    const viewportLeft = viewport?.offsetLeft ?? 0
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportWidth = viewport?.width ?? window.innerWidth
    const viewportHeight = viewport?.height ?? window.innerHeight
    const viewportBottomEdge = viewportTop + viewportHeight
    const isMobileViewport = window.matchMedia('(max-width: 767px)').matches
    const margin = 12
    const width = Math.max(1, Math.min(320, viewportWidth - margin * 2))
    let stickyBottom = isMobileViewport ? 76 : 8
    if (isMobileViewport) {
      for (const action of Array.from(document.querySelectorAll<HTMLElement>('.site-floating-action'))) {
        const actionRect = action.getBoundingClientRect()
        if (actionRect.width < viewportWidth * 0.7 || actionRect.height < 32) continue
        if (actionRect.bottom >= viewportBottomEdge - 4 && actionRect.top < viewportBottomEdge) {
          stickyBottom = Math.max(stickyBottom, viewportBottomEdge - actionRect.top + 8)
        }
      }
    }
    const viewportBottom = viewportBottomEdge - stickyBottom - 8
    const stickyTop = document.getElementById('shared-header')?.getBoundingClientRect().bottom ?? 0
    const safeTop = Math.max(viewportTop + 8, stickyTop + 8)
    const availableHeight = Math.max(1, viewportBottom - safeTop)
    // Keep the wheel size tied to the available viewport, not the rendered
    // dialog's scrollHeight. On mobile Safari, measuring a scrollable dialog
    // during an inner wheel scroll can report the temporarily clipped height;
    // feeding that value back into wheelHeight makes the columns collapse.
    const fittedHeight = Math.min(304, availableHeight)
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
    const wheelHeight = Math.max(32, Math.min(160, fittedHeight - 144))
    const left = isMobileViewport
      ? viewportLeft + Math.max(margin, (viewportWidth - width) / 2)
      : Math.max(viewportLeft + margin, Math.min(rect.left, viewportLeft + viewportWidth - width - margin))
    setPosition((current) => current.top === top && current.left === left && current.width === width && current.maxHeight === fittedHeight && current.wheelHeight === wheelHeight
      ? current
      : { top, left, width, maxHeight: fittedHeight, wheelHeight })
  }, [])
  const show = () => {
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect) return
    const selectedTime = timePickerParts(value)
    setHour(selectedTime.hour)
    setMinute(selectedTime.minute)
    setPeriod(selectedTime.period)
    updatePosition()
    setOpen(true)
  }
  const close = useCallback(() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()) }, [])
  useEffect(() => {
    if (!open) return
    const positionFrame = requestAnimationFrame(updatePosition)
    const schedule = () => requestAnimationFrame(updatePosition)
    const scheduleForPageScroll = (event: Event) => {
      if (event.target instanceof Node && dialog.current?.contains(event.target)) return
      schedule()
    }
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', scheduleForPageScroll, true)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    const frame = requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(positionFrame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', scheduleForPageScroll, true)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close, updatePosition])
  const columns: TimeColumn<string | number>[] = [
    { name: 'Hour', options: Array.from({ length: 12 }, (_, i) => i + 1), selected: hour, set: (n) => setHour(Number(n)), format: (n) => String(n) },
    { name: 'Minute', options: Array.from({ length: 60 }, (_, i) => i), selected: minute, set: (n) => setMinute(Number(n)), format: (n) => String(n).padStart(2, '0') },
  ]
  const handleColumnKeyDown = (event: KeyboardEvent<HTMLDivElement>, columnIndex: number) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    let target = current
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const nextColumn = columnIndex + (event.key === 'ArrowRight' ? 1 : -1)
      const listboxes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('[role="listbox"]') ?? [])
      const selected = listboxes[nextColumn]?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      if (selected) {
        event.preventDefault()
        selected.focus()
        return
      }
      if (columnIndex === 1 && event.key === 'ArrowRight') {
        event.preventDefault()
        periodButtons.current[period === 'AM' ? 0 : 1]?.focus()
      }
      return
    }
    if (event.key === 'ArrowDown') target = Math.min(buttons.length - 1, current + 1)
    else if (event.key === 'ArrowUp') target = Math.max(0, current - 1)
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = buttons.length - 1
    else return
    event.preventDefault()
    const option = columns[columnIndex]?.options[target]
    if (option !== undefined) columns[columnIndex].set(option)
    requestAnimationFrame(() => buttons[target]?.focus())
  }
  const apply = () => { let h = hour % 12; if (period === 'PM') h += 12; onChange(String(h).padStart(2, '0') + ':' + String(minute).padStart(2, '0')); close() }
  return <div className={'relative min-w-0 ' + className}>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={value ? label + ', ' + display + '. Change time' : placeholder} onClick={() => open ? close() : show()} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-[#d8c4a4] bg-[#fffdfa] px-3.5 text-left text-sm text-[#3b2b1d] transition hover:border-[#caa24c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/30">
      {display}<span className="flex items-center gap-2 text-[#8d672b]"><Clock3 aria-hidden="true" className="h-4 w-4"/><ChevronDown aria-hidden="true" className="h-3.5 w-3.5"/></span>
    </button>
    {typeof document !== 'undefined' ? createPortal(<AnimatePresence initial={false}>
      {open ? <>
        <motion.button type="button" aria-label="Close time picker" tabIndex={-1} onClick={close} className="fixed inset-0 z-[9980] bg-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}/>
        <motion.div ref={dialog} role="dialog" aria-modal="false" aria-label={label} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.99 }} transition={{ duration: reduced ? 0 : 0.18 }} style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, colorScheme: 'light' }} className="public-calendar-scroll luxor-public-time-scroll z-[9981] overflow-visible overscroll-contain rounded-2xl border border-[#d8c4a4] bg-[#fffdfa] p-3 text-[#3b2b1d] shadow-[0_18px_48px_-24px_rgba(55,37,19,0.48)] sm:p-4">
          <div className="grid grid-cols-2 gap-2">{columns.map((column, columnIndex) => <div key={column.name} role="listbox" aria-label={column.name} onKeyDown={(event) => handleColumnKeyDown(event, columnIndex)} className="public-calendar-scroll luxor-public-time-scroll overflow-y-auto overscroll-contain rounded-xl border border-[#eadfce] p-1" style={{ height: position.wheelHeight }}>{column.options.map((option) => <button key={String(option)} type="button" role="option" aria-selected={column.selected === option} tabIndex={column.selected === option ? 0 : -1} onClick={() => column.set(option)} className={'w-full rounded-lg px-2 py-2 text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] ' + (column.selected === option ? 'bg-[#f0e7d9] font-semibold text-[#33291f]' : 'text-[#6f5f4f] hover:bg-[#f7efe3]')}>{column.format(option)}</button>)}</div>)}</div>
          <div role="group" aria-label="AM or PM" className="mt-2 grid grid-cols-2 gap-2">
            {(['AM', 'PM'] as const).map((option, index) => <button key={option} ref={(node) => { periodButtons.current[index] = node }} type="button" aria-pressed={period === option} onClick={() => setPeriod(option)} className={'min-h-9 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] ' + (period === option ? 'border-[#caa24c] bg-[#f0e7d9] text-[#33291f]' : 'border-[#eadfce] text-[#6f5f4f] hover:bg-[#f7efe3]')}>{option}</button>)}
          </div>
          <div className="mt-3 flex justify-end gap-2 border-t border-[#eadfce] pt-3"><button type="button" onClick={close} className="min-h-10 rounded-xl border border-[#d8c4a4] px-4 text-sm font-medium text-[#6f4d1f] hover:bg-[#f7efe3]">Cancel</button><button type="button" onClick={apply} className="min-h-10 rounded-xl bg-[#caa24c] px-5 text-sm font-semibold text-white hover:bg-[#b98a3d]">Done</button></div>
        </motion.div>
      </> : null}
    </AnimatePresence>, document.body) : null}
  </div>
}
