'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const DAY_MINUTES = 24 * 60
const TRACK_WIDTH = 1140

function clockMinutes(value: string) {
  if (!/^(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?|24:00(?::00(?:\.0+)?)?)$/.test(value)) return null
  const minutes = Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
  return minutes < 6 * 60 ? minutes + DAY_MINUTES : minutes
}

export function timeAtMinutes(value: number) {
  const clock = ((value % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`
}

function formatClock(value: number) {
  const clock = ((value % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  const hour = Math.floor(clock / 60)
  const minute = clock % 60
  const displayHour = hour % 12 || 12
  return `${displayHour}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${remainder} minutes`
  return remainder ? `${hours} hr ${remainder} min` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function snap(value: number, minimum: number, step: number) {
  return minimum + Math.round((value - minimum) / step) * step
}

type DragMode = 'start' | 'end' | 'range'
type DragOrigin = { mode: DragMode; pointerMinute: number; start: number; end: number }

type LuxorTimeRangeTimelineProps = {
  title: string
  startTime: string
  endTime: string
  startLabel: string
  endLabel: string
  onChange: (startTime: string, endTime: string) => void
  scrollKey: string
  stepMinutes?: number
  minMinutes?: number
  maxMinutes?: number
  minRangeMinutes?: number
  helper?: string
  disabled?: boolean
}

export function LuxorTimeRangeTimeline({
  title,
  startTime,
  endTime,
  startLabel,
  endLabel,
  onChange,
  scrollKey,
  stepMinutes = 60,
  minMinutes = 6 * 60,
  maxMinutes = 25 * 60,
  minRangeMinutes = stepMinutes,
  helper,
  disabled = false,
}: LuxorTimeRangeTimelineProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const originRef = useRef<DragOrigin | null>(null)
  const range = useMemo(() => {
    const start = clockMinutes(startTime)
    const rawEnd = clockMinutes(endTime)
    if (start === null || rawEnd === null) return null
    const end = rawEnd <= start ? rawEnd + DAY_MINUTES : rawEnd
    return end > start ? { start, end } : null
  }, [endTime, startTime])

  useEffect(() => {
    if (!range || !viewportRef.current) return
    const startRatio = (range.start - minMinutes) / (maxMinutes - minMinutes)
    const target = startRatio * TRACK_WIDTH - Math.min(viewportRef.current.clientWidth * 0.25, 120)
    viewportRef.current.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  // A key change means a new date or rental mode; ordinary drags keep the current viewport.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey, minMinutes, maxMinutes])

  if (!range) {
    return (
      <section className="space-y-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3.5 sm:p-4">
        <h4 className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{title}</h4>
        <p className="text-sm leading-5 text-[color:var(--portal-muted)]">Choose the period start and end to set this timeline.</p>
      </section>
    )
  }

  const duration = range.end - range.start
  const startRatio = clamp((range.start - minMinutes) / (maxMinutes - minMinutes), 0, 1)
  const endRatio = clamp((range.end - minMinutes) / (maxMinutes - minMinutes), 0, 1)
  const startX = startRatio * TRACK_WIDTH
  const endX = endRatio * TRACK_WIDTH
  const ticks = Array.from({ length: Math.floor((maxMinutes - minMinutes) / 60) + 1 }, (_, index) => minMinutes + index * 60)

  const setRange = (start: number, end: number) => onChange(timeAtMinutes(start), timeAtMinutes(end))
  const pointerMinute = (clientX: number) => {
    const track = trackRef.current
    const viewport = viewportRef.current
    if (!track || !viewport) return minMinutes
    const rect = track.getBoundingClientRect()
    const x = clamp(clientX - rect.left + viewport.scrollLeft, 0, TRACK_WIDTH)
    return snap(minMinutes + (x / TRACK_WIDTH) * (maxMinutes - minMinutes), minMinutes, stepMinutes)
  }

  const startDrag = (mode: DragMode, event: ReactPointerEvent) => {
    if (disabled) return
    event.preventDefault()
    const currentMinute = pointerMinute(event.clientX)
    originRef.current = { mode, pointerMinute: currentMinute, start: range.start, end: range.end }
    trackRef.current?.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent) => {
    const origin = originRef.current
    if (!origin) return
    const next = pointerMinute(event.clientX)
    if (origin.mode === 'start') {
      setRange(clamp(next, minMinutes, origin.end - minRangeMinutes), origin.end)
    } else if (origin.mode === 'end') {
      setRange(origin.start, clamp(next, origin.start + minRangeMinutes, maxMinutes))
    } else {
      const delta = next - origin.pointerMinute
      const start = clamp(origin.start + delta, minMinutes, maxMinutes - (origin.end - origin.start))
      setRange(start, start + (origin.end - origin.start))
    }
  }

  const stopDrag = () => { originRef.current = null }
  const handleKeyDown = (mode: 'start' | 'end', event: ReactKeyboardEvent) => {
    if (disabled) return
    const keys = ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1
    if (mode === 'start') {
      const value = event.key === 'Home' ? minMinutes : event.key === 'End' ? range.end - minRangeMinutes : clamp(range.start + direction * stepMinutes, minMinutes, range.end - minRangeMinutes)
      setRange(value, range.end)
    } else {
      const value = event.key === 'Home' ? range.start + minRangeMinutes : event.key === 'End' ? maxMinutes : clamp(range.end + direction * stepMinutes, range.start + minRangeMinutes, maxMinutes)
      setRange(range.start, value)
    }
  }

  const scrollTimeline = (direction: -1 | 1) => {
    viewportRef.current?.scrollBy({ left: direction * Math.max(180, (viewportRef.current.clientWidth || 360) * 0.7), behavior: 'smooth' })
  }

  return (
    <section className="min-w-0 space-y-2.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3.5 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <h4 className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{title}</h4>
        <p aria-live="polite" className="text-sm font-bold tabular-nums text-[color:var(--portal-text)] sm:text-base">
          {formatClock(range.start)} <span className="px-1 text-[#a8792f]">–</span> {formatClock(range.end)}
          <span className="ml-2 text-xs font-medium text-[color:var(--portal-muted)]">{formatDuration(duration)}</span>
        </p>
      </div>
      <div className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-1">
        <button type="button" aria-label={`Scroll ${title.toLowerCase()} earlier`} onClick={() => scrollTimeline(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-muted)] transition hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">
          <ChevronLeft size={15} aria-hidden="true" />
        </button>
        <div ref={viewportRef} className="luxor-timeline-scroll min-w-0 overflow-x-auto overscroll-x-contain" role="group" aria-label={`${title} timeline`}>
          <div
            ref={trackRef}
            className="relative h-[4.1rem] select-none"
            style={{ width: TRACK_WIDTH, touchAction: 'pan-x' }}
            onPointerMove={moveDrag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
            onLostPointerCapture={stopDrag}
          >
            <div className="absolute left-0 right-0 top-[1.55rem] h-2 rounded-full bg-[color:var(--portal-soft)] ring-1 ring-inset ring-[color:var(--portal-border)]" />
            <div
              aria-hidden="true"
              onPointerDown={(event) => startDrag('range', event)}
              className={`absolute top-[1.35rem] h-[1.35rem] rounded-full border border-[#c28a34] bg-[#dbb365]/40 ${disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
              style={{ left: startX, width: Math.max(1, endX - startX), touchAction: 'none' }}
            />
            {ticks.map((minute) => {
              const x = ((minute - minMinutes) / (maxMinutes - minMinutes)) * TRACK_WIDTH
              const label = formatClock(minute).replace(':00 ', ' ')
              return <div key={minute} aria-hidden="true" className="absolute top-0 h-full" style={{ left: x }}>
                <span className="absolute left-0 top-[1.15rem] h-[0.7rem] w-px -translate-x-1/2 bg-[#a8792f]/55" />
                <span className="absolute left-0 top-[2.8rem] -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold tabular-nums text-[color:var(--portal-muted)]">{label}</span>
              </div>
            })}
            <button
              type="button"
              role="slider"
              aria-label={startLabel}
              aria-valuemin={minMinutes}
              aria-valuemax={range.end - minRangeMinutes}
              aria-valuenow={range.start}
              aria-valuetext={formatClock(range.start)}
              disabled={disabled}
              onPointerDown={(event) => startDrag('start', event)}
              onKeyDown={(event) => handleKeyDown('start', event)}
              className="absolute top-[0.95rem] z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full cursor-ew-resize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c6529]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--portal-card)] disabled:cursor-not-allowed"
              style={{ left: startX, touchAction: 'none' }}
            >
              <span aria-hidden="true" className="h-6 w-6 rounded-full border-[5px] border-[#ba822d] bg-[color:var(--portal-card)] shadow-sm" />
            </button>
            <button
              type="button"
              role="slider"
              aria-label={endLabel}
              aria-valuemin={range.start + minRangeMinutes}
              aria-valuemax={maxMinutes}
              aria-valuenow={range.end}
              aria-valuetext={formatClock(range.end)}
              disabled={disabled}
              onPointerDown={(event) => startDrag('end', event)}
              onKeyDown={(event) => handleKeyDown('end', event)}
              className="absolute top-[0.95rem] z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full cursor-ew-resize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c6529]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--portal-card)] disabled:cursor-not-allowed"
              style={{ left: endX, touchAction: 'none' }}
            >
              <span aria-hidden="true" className="h-6 w-6 rounded-full border-[5px] border-[#ba822d] bg-[color:var(--portal-card)] shadow-sm" />
            </button>
          </div>
        </div>
        <button type="button" aria-label={`Scroll ${title.toLowerCase()} later`} onClick={() => scrollTimeline(1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-muted)] transition hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
      {helper ? <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">{helper}</p> : null}
    </section>
  )
}
