'use client'

import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Calendar, ChevronLeft, ChevronRight } from '@/lib/icons/phosphor-compat'
import Link from 'next/link'
import { PortalCloseButton } from '@/components/portal/PortalUI'
import { LuxorInquiry, LuxorBooking, LuxorBill, LuxorTask } from '@/lib/luxorInquiryTypes'

function billAmountLabel(bill: LuxorBill) {
  if (bill.amount_state === 'unknown') return 'Amount unknown'
  if (bill.amount_state === 'variable') return 'Variable amount'
  const amount = Number(bill.amount)
  if (bill.amount_state !== 'known' || !Number.isFinite(amount) || amount < 0) return 'Amount pending'
  return amount.toLocaleString('en-US', { style: 'currency', currency: bill.currency || 'USD' })
}

export type EnrichedCalendarTask = LuxorTask & {
  client_name?: string | null;
  event_type?: string | null;
}

export interface CalendarDayData {
  weekday: string;
  label: string;
  isToday: boolean;
  dayNum: number;
  dayStr: string;
  tours: LuxorInquiry[];
  events: LuxorBooking[];
  payments: LuxorBill[];
  tasks: EnrichedCalendarTask[];
}

interface ThisWeekCalendarProps {
  days: CalendarDayData[];
}

export function ThisWeekCalendar({ days }: ThisWeekCalendarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [selectedDay, setSelectedDay] = useState<CalendarDayData | null>(null)
  const todayDay = days.find((d) => d.isToday) || days[0] || null
  const [activeDesktopDay, setActiveDesktopDay] = useState<CalendarDayData | null>(todayDay)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const closeRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = useReducedMotion()
  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!selectedDay) return
    closeRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedDay(null); triggerRef.current?.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedDay])

  useEffect(() => {
    // Horizontally align the strip so yesterday/today start cleanly at the left edge without mid-card clipping
    const container = scrollContainerRef.current;
    if (!container) return;

    const todayElement = container.querySelector<HTMLElement>('[data-today="true"]');
    if (todayElement) {
      const prevElement = todayElement.previousElementSibling as HTMLElement | null;
      const anchorElement = prevElement || todayElement;
      const containerRect = container.getBoundingClientRect();
      const elementRect = anchorElement.getBoundingClientRect();
      const relativeLeft = elementRect.left - containerRect.left + container.scrollLeft;

      container.scrollTo({
        left: Math.max(0, relativeLeft - 4),
        behavior: 'auto',
      });
    }
  }, []);

  const getScrollStep = () => {
    const container = scrollContainerRef.current;
    if (!container) return 212;
    const firstCard = container.querySelector<HTMLElement>('button[data-day-card="true"]');
    if (!firstCard) return 212;
    return (firstCard.offsetWidth + 10) * 2;
  };

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -getScrollStep(), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: getScrollStep(), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  };

  const handleDayClick = (day: CalendarDayData, event: React.MouseEvent<HTMLButtonElement>) => {
    setActiveDesktopDay(day)
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      triggerRef.current = event.currentTarget
      setSelectedDay(day)
    }
  }

  return (
    <div className="relative flex flex-col h-full justify-between">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Calendar className="h-5 w-5 text-[#caa24c] shrink-0" strokeWidth={1.5} />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)] truncate">
              CALENDAR OUTLOOK
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5" aria-label="Calendar navigation">
            <button
              type="button"
              onClick={scrollLeft}
              className="portal-inline-action flex h-8 w-8 sm:h-8.5 sm:w-8.5 items-center justify-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/35 hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] cursor-pointer"
              aria-label="Previous calendar dates"
              title="Previous calendar dates"
            >
              <ChevronLeft size={15} strokeWidth={2.25} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={scrollRight}
              className="portal-inline-action flex h-8 w-8 sm:h-8.5 sm:w-8.5 items-center justify-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/35 hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] cursor-pointer"
              aria-label="Next calendar dates"
              title="Next calendar dates"
            >
              <ChevronRight size={15} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Horizontal Scroll Container */}
        <div
          ref={scrollContainerRef}
          className="flex gap-2.5 overflow-x-auto pb-2 pt-1 px-0.5 snap-x snap-mandatory shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {days.map((day) => {
            const totalEventsCount = day.tours.length + day.events.length + day.payments.length + day.tasks.length;
            const isSelectedDesktop = activeDesktopDay?.dayStr === day.dayStr;
            
            return (
              <motion.button
                key={day.dayStr}
                type="button"
                data-day-card="true"
                data-today={day.isToday}
                layoutId={reduceMotion ? undefined : `calendar-day-${day.dayStr}`}
                onClick={(event) => handleDayClick(day, event)}
                aria-label={`View schedule for ${day.label}`}
                className={`flex flex-col justify-between w-[92px] sm:w-24 h-28 shrink-0 p-2.5 text-left rounded-xl border transition-all duration-200 snap-start cursor-pointer ${
                  day.isToday
                    ? 'bg-[#fcf8f2] dark:bg-[#caa24c]/10 border-[#caa24c] shadow-[0_2px_12px_-3px_rgba(202,162,76,0.22)]'
                    : isSelectedDesktop
                      ? 'bg-[color:var(--portal-soft)] border-[#caa24c]/70 ring-1 ring-[#caa24c]/25'
                      : 'bg-[color:var(--portal-soft)]/35 dark:bg-black/15 border-[color:var(--portal-border)]/60 hover:border-[#caa24c]/45 hover:bg-[color:var(--portal-soft)]/60'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center gap-1">
                    <span className={`text-[9px] font-extrabold uppercase tracking-wider ${day.isToday ? 'text-[#a8792f] dark:text-[#caa24c]' : 'text-[color:var(--portal-muted)]'}`}>
                      {day.weekday}
                    </span>
                    {day.isToday && (
                      <span className="text-[7px] font-extrabold text-[#9a6e25] dark:text-[#dfbd68] bg-[#caa24c]/15 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                        Today
                      </span>
                    )}
                  </div>
                  <p className={`text-lg font-extrabold tabular-nums mt-0.5 leading-none ${day.isToday ? 'text-[#a8792f] dark:text-[#caa24c]' : 'text-[color:var(--portal-text)]'}`}>
                    {day.dayNum}
                  </p>
                  <p className="text-[8px] font-semibold text-[color:var(--portal-muted)] mt-0.5 uppercase tracking-wider">
                    {day.label.split(' ')[0]}
                  </p>
                </div>

                <div className="space-y-0.5 overflow-hidden">
                  {/* Tours (Blue) */}
                  {day.tours.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      <span className="text-[8px] font-bold text-[color:var(--portal-text)] leading-none truncate">
                        {day.tours.length} Tour{day.tours.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  )}

                  {/* Events (Purple) */}
                  {day.events.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                      <span className="text-[8px] font-bold text-[color:var(--portal-text)] leading-none truncate">
                        {day.events.length === 1 ? (day.events[0].event_type || 'Event') : `${day.events.length} Events`}
                      </span>
                    </div>
                  )}

                  {/* Payments (Amber) */}
                  {day.payments.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-[8px] font-bold text-[color:var(--portal-text)] leading-none truncate">
                        {day.payments.length === 1 ? 'Payment Due' : `${day.payments.length} Payments`}
                      </span>
                    </div>
                  )}

                  {/* Tasks (Emerald) */}
                  {day.tasks.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-[8px] font-bold text-[color:var(--portal-text)] leading-none truncate">
                        {day.tasks.length === 1 ? day.tasks[0].title : `${day.tasks.length} Tasks`}
                      </span>
                    </div>
                  )}

                  {totalEventsCount === 0 && (
                    <span className="text-[8px] text-[color:var(--portal-muted)]/50 block italic">
                      No schedule
                    </span>
                  )}
                </div>
              </motion.button>
            )
          })}
        </div>

        {/* Desktop Inline Agenda Panel: strictly locked height to keep container heights invariant */}
        {activeDesktopDay && (
          <div className="hidden md:flex flex-col h-[175px] min-h-[175px] max-h-[175px] mt-2 pt-2.5 border-t border-[color:var(--portal-border)]/40 overflow-hidden shrink-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-text)]">
                  {activeDesktopDay.weekday}, {activeDesktopDay.label}
                </span>
                {activeDesktopDay.isToday && (
                  <span className="text-[8px] font-extrabold uppercase tracking-wider text-[#9a6e25] dark:text-[#dfbd68] bg-[#caa24c]/15 px-1.5 py-0.5 rounded-full">
                    Today
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium text-[color:var(--portal-muted)]">
                {activeDesktopDay.tours.length + activeDesktopDay.events.length + activeDesktopDay.tasks.length + activeDesktopDay.payments.length} items
              </span>
            </div>

            {/* Scrollable list of items for active day with smooth blur transition */}
            <div className="portal-scrollbar flex-1 h-[140px] max-h-[140px] overflow-y-auto pr-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeDesktopDay.dayStr}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(5px)', y: 3 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(5px)', y: -3 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-1.5"
                >
                  {/* Tours */}
                  {activeDesktopDay.tours.map((tour) => (
                    <Link
                      key={`tour-${tour.id}`}
                      href={`/portal/leads/${tour.id}`}
                      className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg bg-[color:var(--portal-soft)]/60 hover:bg-[#caa24c]/10 border border-[color:var(--portal-border)]/30 transition-colors text-left no-underline"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[color:var(--portal-text)] truncate">
                            Tour · {tour.full_name}
                          </p>
                          <p className="text-[10px] text-[color:var(--portal-muted)] truncate">
                            {tour.event_type || 'Event consultation'}{tour.guest_count ? ` · ${tour.guest_count} guests` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 shrink-0">
                        {tour.preferred_tour_time || 'Scheduled'}
                      </span>
                    </Link>
                  ))}

                  {/* Events / Bookings */}
                  {activeDesktopDay.events.map((event) => (
                    <Link
                      key={`event-${event.id}`}
                      href={event.inquiry_id ? `/portal/leads/${event.inquiry_id}` : '/portal/calendar'}
                      className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg bg-[color:var(--portal-soft)]/60 hover:bg-[#caa24c]/10 border border-[color:var(--portal-border)]/30 transition-colors text-left no-underline"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[color:var(--portal-text)] truncate">
                            {event.client_name}
                          </p>
                          <p className="text-[10px] text-[color:var(--portal-muted)] truncate">
                            {event.event_type || 'Reserved Event'}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 shrink-0">
                        {event.start_time || 'Event'}
                      </span>
                    </Link>
                  ))}

                  {/* Tasks with Client Name & Context */}
                  {activeDesktopDay.tasks.map((task) => {
                    const hasClientInTitle = Boolean(
                      task.client_name && task.title.toLowerCase().includes(task.client_name.toLowerCase())
                    )
                    const primaryText = task.client_name && !hasClientInTitle
                      ? `${task.title} · ${task.client_name}`
                      : task.title
                    const secondaryText = task.event_type || null
                    return (
                      <Link
                        key={`task-${task.id}`}
                        href={task.inquiry_id ? `/portal/leads/${task.inquiry_id}?tab=tasks` : '/portal/leads'}
                        className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg bg-[color:var(--portal-soft)]/60 hover:bg-[#caa24c]/10 border border-[color:var(--portal-border)]/30 transition-colors text-left no-underline"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[color:var(--portal-text)] truncate">
                              {primaryText}
                            </p>
                            {secondaryText && (
                              <p className="text-[10px] text-[color:var(--portal-muted)] truncate">
                                {secondaryText}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                          Task
                        </span>
                      </Link>
                    )
                  })}

                  {/* Payments */}
                  {activeDesktopDay.payments.map((bill) => (
                    <Link
                      key={`bill-${bill.id}`}
                      href="/portal/invoices"
                      className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg bg-[color:var(--portal-soft)]/60 hover:bg-[#caa24c]/10 border border-[color:var(--portal-border)]/30 transition-colors text-left no-underline"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        <p className="text-xs font-medium text-[color:var(--portal-text)] truncate">
                          Bill due: {bill.service}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                        {billAmountLabel(bill)}
                      </span>
                    </Link>
                  ))}

                  {activeDesktopDay.tours.length === 0 &&
                    activeDesktopDay.events.length === 0 &&
                    activeDesktopDay.tasks.length === 0 &&
                    activeDesktopDay.payments.length === 0 && (
                      <div className="h-full flex items-center justify-center py-6">
                        <p className="text-xs text-[color:var(--portal-muted)] italic">
                          No tours, events, or tasks scheduled for this day.
                        </p>
                      </div>
                    )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-[color:var(--portal-border)]/50 shrink-0">
        <Link href="/portal/calendar" className="text-[#caa24c] hover:text-[#b0883b] transition-colors flex items-center justify-center gap-1 font-bold text-xs">
          View full calendar <ChevronRight size={14} className="translate-y-[0.5px]" />
        </Link>
      </div>

      {/* Mobile-only rich schedule overlay drawer */}
      <AnimatePresence>
        {selectedDay ? (
          <motion.div
            ref={closeRef}
            layoutId={reduceMotion ? undefined : `calendar-day-${selectedDay.dayStr}`}
            initial={reduceMotion ? { opacity: 0 } : undefined}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="md:hidden absolute inset-0 z-10 flex min-h-0 flex-col overflow-hidden rounded-xl bg-[color:var(--portal-card)] p-4"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">
                  {selectedDay.weekday}, {selectedDay.label}
                </h3>
                <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
                  {selectedDay.tours.length + selectedDay.events.length + selectedDay.tasks.length + selectedDay.payments.length} items scheduled
                </p>
              </div>
              <PortalCloseButton aria-label="Close day schedule" onClick={() => { setSelectedDay(null); triggerRef.current?.focus() }} />
            </div>
            <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto py-2.5 space-y-2">
              {/* Tours */}
              {selectedDay.tours.map((tour) => (
                <Link
                  key={`m-tour-${tour.id}`}
                  href={`/portal/leads/${tour.id}`}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[color:var(--portal-soft)]/70 border border-[color:var(--portal-border)]/30 text-left no-underline"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[color:var(--portal-text)] truncate">
                        Tour · {tour.full_name}
                      </p>
                      <p className="text-[10px] text-[color:var(--portal-muted)] truncate">
                        {tour.event_type || 'Event consultation'}{tour.guest_count ? ` · ${tour.guest_count} guests` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 shrink-0">
                    {tour.preferred_tour_time || 'Scheduled'}
                  </span>
                </Link>
              ))}

              {/* Events */}
              {selectedDay.events.map((event) => (
                <Link
                  key={`m-event-${event.id}`}
                  href={event.inquiry_id ? `/portal/leads/${event.inquiry_id}` : '/portal/calendar'}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[color:var(--portal-soft)]/70 border border-[color:var(--portal-border)]/30 text-left no-underline"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[color:var(--portal-text)] truncate">
                        {event.client_name}
                      </p>
                      <p className="text-[10px] text-[color:var(--portal-muted)] truncate">
                        {event.event_type || 'Reserved Event'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 shrink-0">
                    {event.start_time || 'Event'}
                  </span>
                </Link>
              ))}

              {/* Tasks with Client Name */}
              {selectedDay.tasks.map((task) => {
                const hasClientInTitle = Boolean(
                  task.client_name && task.title.toLowerCase().includes(task.client_name.toLowerCase())
                )
                const primaryText = task.client_name && !hasClientInTitle
                  ? `${task.title} · ${task.client_name}`
                  : task.title
                const secondaryText = task.event_type || null
                return (
                  <Link
                    key={`m-task-${task.id}`}
                    href={task.inquiry_id ? `/portal/leads/${task.inquiry_id}?tab=tasks` : '/portal/leads'}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[color:var(--portal-soft)]/70 border border-[color:var(--portal-border)]/30 text-left no-underline"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[color:var(--portal-text)] truncate">
                          {primaryText}
                        </p>
                        {secondaryText && (
                          <p className="text-[10px] text-[color:var(--portal-muted)] truncate">
                            {secondaryText}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                      Task
                    </span>
                  </Link>
                )
              })}

              {/* Payments */}
              {selectedDay.payments.map((bill) => (
                <Link
                  key={`m-bill-${bill.id}`}
                  href="/portal/invoices"
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[color:var(--portal-soft)]/70 border border-[color:var(--portal-border)]/30 text-left no-underline"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <p className="text-xs font-medium text-[color:var(--portal-text)] truncate">
                      Bill due: {bill.service}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                    {billAmountLabel(bill)}
                  </span>
                </Link>
              ))}

              {selectedDay.tours.length === 0 &&
                selectedDay.events.length === 0 &&
                selectedDay.tasks.length === 0 &&
                selectedDay.payments.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-xs text-[color:var(--portal-muted)] italic">
                      No tours, events, or tasks scheduled for this day.
                    </p>
                  </div>
                )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
