'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Clock3, ChevronDown } from 'lucide-react'

type TimeColumn<T extends string | number> = { name: string; options: T[]; selected: T; set: (value: T) => void; format: (value: T) => string }

export function LuxorTimePicker({ value, onChange, placeholder = 'Select a time', label = 'Preferred time', className = '' }: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string; className?: string }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [hour, setHour] = useState(() => { const h = Number(value.split(':')[0]); return Number.isFinite(h) && h > 0 ? ((h + 11) % 12) + 1 : 9 })
  const [minute, setMinute] = useState(() => { const m = Number(value.split(':')[1]); return Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0 })
  const [period, setPeriod] = useState<'AM' | 'PM'>(() => Number(value.split(':')[0]) >= 12 ? 'PM' : 'AM')
  const [position, setPosition] = useState({ top: 0, left: 12, width: 300, maxHeight: 300 })
  const display = value ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date('2000-01-01T' + value + ':00')) : placeholder
  const updatePosition = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect) return
    const margin = 12
    const width = Math.min(320, window.innerWidth - margin * 2)
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const viewportTop = window.visualViewport?.offsetTop ?? 0
    const stickyBottom = window.matchMedia('(max-width: 767px)').matches ? 76 : 8
    const viewportBottom = viewportTop + viewportHeight - stickyBottom - 8
    const stickyTop = document.getElementById('shared-header')?.getBoundingClientRect().bottom ?? 0
    const safeTop = Math.max(viewportTop + 8, stickyTop + 8)
    const availableHeight = Math.max(1, viewportBottom - safeTop)
    const naturalHeight = Math.min(dialog.current?.scrollHeight ?? 284, 300, availableHeight)
    const below = Math.max(0, viewportBottom - rect.bottom - 6)
    const above = Math.max(0, rect.top - safeTop - 6)
    const triggerAboveViewport = rect.bottom < safeTop
    const triggerBelowViewport = rect.top > viewportBottom
    const openAbove = !triggerAboveViewport && !triggerBelowViewport && below < naturalHeight && above > below
    const availableSpace = triggerAboveViewport || triggerBelowViewport ? availableHeight : openAbove ? above : below
    const maxHeight = Math.max(1, Math.min(naturalHeight, availableSpace))
    const desiredTop = triggerAboveViewport ? safeTop : triggerBelowViewport ? viewportBottom - maxHeight : openAbove ? rect.top - maxHeight - 6 : rect.bottom + 6
    const top = Math.max(safeTop, Math.min(desiredTop, viewportBottom - maxHeight))
    setPosition({ top, left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)), width, maxHeight })
  }, [])
  const show = () => {
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect) return
    if (value) { const [h, m] = value.split(':').map(Number); setHour(((h + 11) % 12) + 1); setMinute(m); setPeriod(h >= 12 ? 'PM' : 'AM') }
    updatePosition()
    setOpen(true)
  }
  const close = useCallback(() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()) }, [])
  useEffect(() => {
    if (!open) return
    const positionFrame = requestAnimationFrame(updatePosition)
    const schedule = () => requestAnimationFrame(updatePosition)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
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
      window.removeEventListener('scroll', schedule, true)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close, updatePosition])
  const handleColumnKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    let target = current
    if (event.key === 'ArrowDown') target = Math.min(buttons.length - 1, current + 1)
    else if (event.key === 'ArrowUp') target = Math.max(0, current - 1)
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = buttons.length - 1
    else return
    event.preventDefault()
    buttons[target]?.focus()
  }
  const apply = () => { let h = hour % 12; if (period === 'PM') h += 12; onChange(String(h).padStart(2, '0') + ':' + String(minute).padStart(2, '0')); close() }
  const columns: TimeColumn<string | number>[] = [
    { name: 'Hour', options: Array.from({ length: 12 }, (_, i) => i + 1), selected: hour, set: (n) => setHour(Number(n)), format: (n) => String(n) },
    { name: 'Minute', options: Array.from({ length: 60 }, (_, i) => i), selected: minute, set: (n) => setMinute(Number(n)), format: (n) => String(n).padStart(2, '0') },
    { name: 'AM/PM', options: ['AM', 'PM'], selected: period, set: (n) => setPeriod(n === 'PM' ? 'PM' : 'AM'), format: (n) => String(n) },
  ]
  return <div className={'relative min-w-0 ' + className}>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={value ? label + ', ' + display + '. Change time' : placeholder} onClick={() => open ? close() : show()} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-[#d8c4a4] bg-[#fffdfa] px-3.5 text-left text-sm text-[#3b2b1d] transition hover:border-[#caa24c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/30">
      {display}<span className="flex items-center gap-2 text-[#8d672b]"><Clock3 aria-hidden="true" className="h-4 w-4"/><ChevronDown aria-hidden="true" className="h-3.5 w-3.5"/></span>
    </button>
    {typeof document !== 'undefined' ? createPortal(<AnimatePresence initial={false}>
      {open ? <>
        <motion.button type="button" aria-label="Close time picker" tabIndex={-1} onClick={close} className="fixed inset-0 z-[9980] bg-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 0.16 }}/>
        <motion.div ref={dialog} role="dialog" aria-modal="false" aria-label={label} initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.99 }} transition={{ duration: reduced ? 0 : 0.18 }} style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }} className="z-[9981] overflow-y-auto overscroll-contain rounded-2xl border border-[#d8c4a4] bg-[#fffdfa] p-4 text-[#3b2b1d] shadow-[0_18px_48px_-24px_rgba(55,37,19,0.48)]">
          <div className="grid grid-cols-3 gap-2">{columns.map((column) => <div key={column.name} role="listbox" aria-label={column.name} onKeyDown={handleColumnKeyDown} className="public-calendar-scroll max-h-44 overflow-y-auto overscroll-contain rounded-xl border border-[#eadfce] p-1">{column.options.map((option) => <button key={String(option)} type="button" role="option" aria-selected={column.selected === option} onClick={() => column.set(option)} className={'w-full rounded-lg px-2 py-2 text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] ' + (column.selected === option ? 'bg-[#f0e7d9] font-semibold text-[#33291f]' : 'text-[#6f5f4f] hover:bg-[#f7efe3]')}>{column.format(option)}</button>)}</div>)}</div>
          <div className="mt-4 flex justify-end gap-2 border-t border-[#eadfce] pt-3"><button type="button" onClick={close} className="min-h-10 rounded-xl border border-[#d8c4a4] px-4 text-sm font-medium text-[#6f4d1f] hover:bg-[#f7efe3]">Cancel</button><button type="button" onClick={apply} className="min-h-10 rounded-xl bg-[#caa24c] px-5 text-sm font-semibold text-white hover:bg-[#b98a3d]">Done</button></div>
        </motion.div>
      </> : null}
    </AnimatePresence>, document.body) : null}
  </div>
}
