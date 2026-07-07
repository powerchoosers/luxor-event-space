'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import React from 'react'
import { PortalModal } from './PortalUI'

export type PortalCalendarView = 'month' | 'week' | 'day'

export type PortalCalendarItem = {
  id: string
  date: string
  title: string
  subtitle?: string
  tone?: 'gold' | 'blue' | 'green' | 'rose' | 'zinc'
  content?: React.ReactNode
}

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
  if (view === 'month') next.setMonth(anchor.getMonth() + direction)
  if (view === 'week') next.setDate(anchor.getDate() + direction * 7)
  if (view === 'day') next.setDate(anchor.getDate() + direction)
  return next
}

function formatRange(anchor: Date, view: PortalCalendarView) {
  if (view === 'month') {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(anchor)
  }

  if (view === 'day') {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(anchor)
  }

  const days = getVisibleDays(anchor, 'week')
  return `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(days[0])} - ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(days[6])}`
}

export function PortalCalendar({
  title,
  items,
  view,
  onViewChange,
}: {
  title: string
  items: PortalCalendarItem[]
  view: PortalCalendarView
  onViewChange: (view: PortalCalendarView) => void
}) {
  const [anchor, setAnchor] = React.useState(() => new Date())
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null)
  const [selectedItem, setSelectedItem] = React.useState<PortalCalendarItem | null>(null)
  const visibleDays = React.useMemo(() => getVisibleDays(anchor, view), [anchor, view])
  const itemsByDate = React.useMemo(() => {
    return items.reduce<Record<string, PortalCalendarItem[]>>((groups, item) => {
      groups[item.date] ??= []
      groups[item.date].push(item)
      return groups
    }, {})
  }, [items])
  const formattedRange = React.useMemo(() => formatRange(anchor, view), [anchor, view])

  return (
    <section className="portal-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl">
      <div className="flex flex-col gap-4 border-b border-[color:var(--portal-border)] p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">{title}</p>
          <h2 className="mt-1 font-serif text-2xl font-bold text-[color:var(--portal-text)]">{formattedRange}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1">
            {(['month', 'week', 'day'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onViewChange(option)}
                className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                  view === option ? 'bg-[#caa24c]/15 text-[#f1d27a]' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setAnchor((date) => moveAnchor(date, view, -1))} className="rounded-lg border border-[color:var(--portal-border)] p-2 text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => setAnchor(new Date())} className="rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">
            Today
          </button>
          <button type="button" onClick={() => setAnchor((date) => moveAnchor(date, view, 1))} className="rounded-lg border border-[color:var(--portal-border)] p-2 text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="portal-scrollbar min-h-[36rem] flex-1 overflow-auto p-4">
        <div className={`grid gap-3 ${view === 'day' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-7'}`}>
          {visibleDays.map((day) => {
            const iso = toIsoDate(day)
            const dayItems = itemsByDate[iso] || []
            const outsideMonth = view === 'month' && day.getMonth() !== anchor.getMonth()
            const visibleItems = view === 'month' ? dayItems.slice(0, 2) : dayItems

            return (
              <div
                key={iso}
                className={`flex h-[15rem] min-h-[15rem] flex-col rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 ${outsideMonth ? 'opacity-45' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">
                      {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(day)}
                    </p>
                    {view !== 'day' ? (
                      <button
                        type="button"
                        onClick={() => setSelectedDay(iso)}
                        className="mt-1 text-left font-mono text-sm font-bold text-[color:var(--portal-text)] hover:text-[#f1d27a]"
                      >
                        {day.getDate()}
                      </button>
                    ) : (
                      <p className="mt-1 font-mono text-sm font-bold text-[color:var(--portal-text)]">{day.getDate()}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDay(iso)}
                    className="rounded-md border border-[color:var(--portal-border)] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]"
                  >
                    Open day
                  </button>
                </div>
                <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                  {dayItems.length === 0 ? (
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--portal-faint)]">No items</p>
                  ) : (
                    <>
                      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                        {visibleItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            className={`w-full rounded-lg border p-3 text-left transition-transform hover:-translate-y-0.5 hover:shadow-lg ${toneClass(item.tone)}`}
                          >
                            <p className="text-xs font-bold text-[color:var(--portal-text)] line-clamp-1">{item.title}</p>
                            {item.subtitle ? <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)] line-clamp-2">{item.subtitle}</p> : null}
                          </button>
                        ))}
                      </div>
                      {dayItems.length > visibleItems.length ? (
                        <button
                          type="button"
                          onClick={() => setSelectedDay(iso)}
                          className="mt-auto text-left text-[10px] font-black uppercase tracking-widest text-[#f1d27a] hover:text-[#f7de98]"
                        >
                          +{dayItems.length - visibleItems.length} more
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <PortalModal
        isOpen={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? formatDayHeading(selectedDay) : 'Day details'}
      >
        {selectedDay ? (
          <div className="space-y-4 max-h-[70vh] overflow-auto pr-1 portal-scrollbar">
            {renderDayDetails(itemsByDate[selectedDay] || [], setSelectedItem)}
          </div>
        ) : null}
      </PortalModal>

      <PortalModal
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem ? selectedItem.title : 'Event details'}
      >
        {selectedItem ? (
          <div className="space-y-3 max-h-[70vh] overflow-auto pr-1 portal-scrollbar">
            <div className={`rounded-xl border p-4 ${toneClass(selectedItem.tone)}`}>
              <p className="text-lg font-bold text-[color:var(--portal-text)]">{selectedItem.title}</p>
              {selectedItem.subtitle ? <p className="mt-1 text-sm text-[color:var(--portal-muted)]">{selectedItem.subtitle}</p> : null}
            </div>
            {selectedItem.content ? <div>{selectedItem.content}</div> : null}
          </div>
        ) : null}
      </PortalModal>
    </section>
  )
}

function renderDayDetails(items: PortalCalendarItem[], onSelectItem: (item: PortalCalendarItem) => void) {
  if (items.length === 0) {
    return <p className="text-sm text-[color:var(--portal-muted)]">No items on this day.</p>
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelectItem(item)}
          className={`w-full rounded-xl border p-4 text-left transition-transform hover:-translate-y-0.5 hover:shadow-lg ${toneClass(item.tone)}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-bold text-[color:var(--portal-text)]">{item.title}</p>
              {item.subtitle ? <p className="mt-1 text-sm text-[color:var(--portal-muted)]">{item.subtitle}</p> : null}
            </div>
            <span className="rounded-full border border-[color:var(--portal-border)] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">
              Open
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

function toneClass(tone: PortalCalendarItem['tone'] = 'zinc') {
  const classes = {
    gold: 'border-[#caa24c]/25 bg-[#caa24c]/8',
    blue: 'border-blue-500/20 bg-blue-500/8',
    green: 'border-emerald-500/20 bg-emerald-500/8',
    rose: 'border-rose-500/20 bg-rose-500/8',
    zinc: 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)]',
  }

  return classes[tone]
}
