'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import React from 'react'
import { PortalModal } from './PortalUI'

export type PortalCalendarView = 'month' | 'week' | 'day' | 'schedule'

export type PortalCalendarItem = {
  id: string
  date: string
  title: string
  subtitle?: string
  tone?: 'gold' | 'blue' | 'green' | 'rose' | 'zinc'
  href?: string
  openLabel?: string
  content?: React.ReactNode
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
  if (view === 'month') next.setMonth(anchor.getMonth() + direction)
  if (view === 'week' || view === 'schedule') next.setDate(anchor.getDate() + direction * 7)
  if (view === 'day') next.setDate(anchor.getDate() + direction)
  return next
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

export function PortalCalendar({
  title,
  items,
  view,
  onViewChange,
  dayStatuses,
}: {
  title: string
  items: PortalCalendarItem[]
  view: PortalCalendarView
  onViewChange: (view: PortalCalendarView) => void
  dayStatuses?: Record<string, PortalCalendarDayStatus>
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
  const todayIso = toIsoDate(new Date())

  return (
    <section className="portal-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl">
      <div className="flex flex-col gap-4 border-b border-[color:var(--portal-border)] p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">{title}</p>
          <h2 className="mt-1 font-serif text-2xl font-bold text-[color:var(--portal-text)]">{formattedRange}</h2>
          {dayStatuses ? <p className="mt-2 max-w-xl text-[10px] leading-4 text-[color:var(--portal-muted)]">“No tour times” means no public tour slot is currently available that day; it does not mean the venue is closed.</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1">
            {(['month', 'week', 'day', 'schedule'] as const).map((option) => (
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

      <div className="portal-scrollbar min-h-[36rem] flex-1 overflow-auto p-3 sm:p-4">
        {view === 'schedule' ? (
          <ScheduleView items={items} onSelectItem={setSelectedItem} />
        ) : (
        <div className={`grid overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-border)] gap-px ${view === 'day' ? 'grid-cols-1' : view === 'month' ? 'grid-cols-7' : 'grid-cols-1 sm:grid-cols-7'}`}>
          {visibleDays.map((day) => {
            const iso = toIsoDate(day)
            const dayItems = itemsByDate[iso] || []
            const outsideMonth = view === 'month' && day.getMonth() !== anchor.getMonth()
            const visibleItems = view === 'month' ? dayItems.slice(0, 2) : dayItems
            const hiddenItemCount = dayItems.length - visibleItems.length
            const isToday = iso === todayIso

            return (
              <div
                key={iso}
                aria-label={`${formatDayHeading(iso)}${isToday ? ', today' : ''}`}
                className={`flex min-w-0 flex-col p-2 transition-colors duration-150 sm:p-3 ${view === 'month' ? 'h-28 min-h-28 sm:h-40 sm:min-h-40' : 'h-64 min-h-64'} ${isToday ? 'bg-[#caa24c]/[0.09] shadow-[inset_0_0_0_1px_rgba(202,162,76,0.7)]' : 'bg-[color:var(--portal-card)] hover:bg-[color:var(--portal-soft)]'} ${outsideMonth ? 'opacity-40' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] sm:text-[10px]">
                      {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(day)}
                    </p>
                    {view !== 'day' ? (
                      <button
                        type="button"
                        onClick={() => setSelectedDay(iso)}
                        className="mt-0.5 text-left font-mono text-xs font-bold text-[color:var(--portal-text)] hover:text-[#a8792f] sm:mt-1 sm:text-sm"
                      >
                        {day.getDate()}
                      </button>
                    ) : (
                      <p className="mt-1 font-mono text-sm font-bold text-[color:var(--portal-text)]">{day.getDate()}</p>
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
                <div className="mt-1.5 flex min-h-0 flex-1 flex-col gap-1 sm:mt-3 sm:gap-2">
                  {dayItems.length === 0 && !dayStatuses ? (
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--portal-faint)]">No items</p>
                  ) : dayItems.length > 0 ? (
                    <>
                      <div className="portal-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                        {visibleItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            className={`${view === 'month' ? 'h-1.5 w-1.5 shrink-0 rounded-full border-0 p-0 sm:h-auto sm:w-full sm:rounded-lg sm:border sm:p-2' : 'w-full rounded-md border px-1.5 py-1 sm:rounded-lg sm:p-2'} text-left transition-transform hover:-translate-y-0.5 hover:shadow-lg ${toneClass(item.tone)}`}
                          >
                            <p className={`text-[9px] font-bold text-[color:var(--portal-text)] line-clamp-1 sm:text-xs ${view === 'month' ? 'hidden sm:block' : ''}`}>{item.title}</p>
                            {item.subtitle ? <p className={`mt-0.5 text-[9px] leading-3 text-[color:var(--portal-muted)] line-clamp-1 sm:mt-1 sm:text-[10px] sm:leading-4 ${view === 'month' ? 'hidden sm:block' : ''}`}>{item.subtitle}</p> : null}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {hiddenItemCount > 0 ? <button type="button" onClick={() => setSelectedDay(iso)} className="hidden text-left text-[9px] font-bold text-[#a8792f] hover:text-[#caa24c] sm:block">+{hiddenItemCount} more</button> : null}
                </div>
              </div>
            )
          })}
        </div>
        )}
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
            {selectedItem.href ? (
              <a
                href={selectedItem.href}
                className="inline-flex items-center justify-center rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#f1d27a] transition-colors hover:bg-[#caa24c]/15"
              >
                {selectedItem.openLabel || 'Open record'}
              </a>
            ) : null}
            {selectedItem.content ? <div>{selectedItem.content}</div> : null}
          </div>
        ) : null}
      </PortalModal>
    </section>
  )
}

function ScheduleView({
  items,
  onSelectItem,
}: {
  items: PortalCalendarItem[]
  onSelectItem: (item: PortalCalendarItem) => void
}) {
  const itemsByDate = items.reduce<Record<string, PortalCalendarItem[]>>((groups, item) => {
    groups[item.date] ??= []
    groups[item.date].push(item)
    return groups
  }, {})
  const dates = Object.keys(itemsByDate).sort()

  if (!dates.length) {
    return <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-6 text-center"><p className="text-sm text-[color:var(--portal-muted)]">No scheduled items yet.</p></div>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-2">
      {dates.map((date) => (
        <section key={date} className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-6">
          <div className="border-b border-[color:var(--portal-border)] pb-2 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#a8792f]">{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(`${date}T12:00:00`))}</p>
            <p className="mt-1 font-serif text-2xl font-semibold text-[color:var(--portal-text)]">{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`))}</p>
          </div>
          <div className="space-y-2">
            {itemsByDate[date].map((item) => (
              <button key={item.id} type="button" onClick={() => onSelectItem(item)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-transform hover:-translate-y-0.5 hover:shadow-lg sm:p-4 ${toneClass(item.tone)}`}>
                <span className="h-9 w-1 shrink-0 rounded-full bg-current opacity-70" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[color:var(--portal-text)]">{item.title}</span>
                  {item.subtitle ? <span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{item.subtitle}</span> : null}
                </span>
                <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">{item.openLabel || 'Open'}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
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
