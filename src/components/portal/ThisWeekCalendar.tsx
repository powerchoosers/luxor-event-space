'use client'

import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { PortalCloseButton } from '@/components/portal/PortalUI'
import { LuxorInquiry, LuxorBooking, LuxorBill, LuxorTask } from '@/lib/luxorInquiryTypes'

export interface CalendarDayData {
  weekday: string;
  label: string;
  isToday: boolean;
  dayNum: number;
  dayStr: string;
  tours: LuxorInquiry[];
  events: LuxorBooking[];
  payments: LuxorBill[];
  tasks: LuxorTask[];
}

interface ThisWeekCalendarProps {
  days: CalendarDayData[];
}

export function ThisWeekCalendar({ days }: ThisWeekCalendarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [selectedDay, setSelectedDay] = useState<CalendarDayData | null>(null)
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
    // Horizontally scroll today's card into view inside the container without scrolling the page
    const container = scrollContainerRef.current;
    if (!container) return;

    const todayElement = container.querySelector<HTMLElement>('[data-today="true"]');
    if (todayElement) {
      const containerRect = container.getBoundingClientRect();
      const elementRect = todayElement.getBoundingClientRect();
      const relativeLeft = elementRect.left - containerRect.left + container.scrollLeft;
      const targetScrollLeft = relativeLeft - (container.clientWidth / 2) + (elementRect.width / 2);

      container.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: 'auto',
      });
    }
  }, []);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -220, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 220, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  };

  return (
    <div className="relative flex flex-col h-full justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">CALENDAR OUTLOOK</h3>
          <div className="flex items-center gap-1.5">
            <button
              onClick={scrollLeft}
              className="p-1 rounded-lg border border-[color:var(--portal-border)]/50 hover:bg-[#caa24c]/10 text-[color:var(--portal-text)] transition-colors cursor-pointer"
              aria-label="Scroll Left"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={scrollRight}
              className="p-1 rounded-lg border border-[color:var(--portal-border)]/50 hover:bg-[#caa24c]/10 text-[color:var(--portal-text)] transition-colors cursor-pointer"
              aria-label="Scroll Right"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Horizontal Scroll Container */}
        <div
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto pb-5 pt-3 px-3 scrollbar-thin scrollbar-thumb-amber-500/20 scrollbar-track-transparent snap-x"
          style={{ scrollbarWidth: 'thin' }}
        >
          {days.map((day) => {
            const totalEventsCount = day.tours.length + day.events.length + day.payments.length + day.tasks.length;
            
            return (
              <motion.button
                key={day.dayStr}
                type="button"
                data-today={day.isToday}
                layoutId={reduceMotion ? undefined : `calendar-day-${day.dayStr}`}
                onClick={(event) => { triggerRef.current = event.currentTarget; setSelectedDay(day) }}
                aria-label={`View tasks for ${day.label}`}
                className={`flex flex-col justify-between w-28 h-40 shrink-0 p-3 text-left rounded-xl border transition-colors snap-center ${
                  day.isToday
                    ? 'bg-[#fcf8f2] dark:bg-[#caa24c]/10 border-[#caa24c] shadow-[0_0_12px_rgba(202,162,76,0.15)] scale-[1.02]'
                    : 'bg-white/40 dark:bg-black/10 border-[color:var(--portal-border)]/40 hover:border-[#caa24c]/50'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className={`text-[8.5px] font-black uppercase tracking-wider ${day.isToday ? 'text-[#caa24c]' : 'text-[color:var(--portal-muted)]'}`}>
                      {day.weekday}
                    </span>
                    {day.isToday && (
                      <span className="text-[7px] font-extrabold text-[#caa24c] bg-[#caa24c]/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                        Today
                      </span>
                    )}
                  </div>
                  <p className={`text-2xl font-black mt-1 leading-none ${day.isToday ? 'text-[#caa24c]' : 'text-[color:var(--portal-text)]'}`}>
                    {day.dayNum}
                  </p>
                  <p className="text-[8px] font-bold text-[color:var(--portal-muted)] mt-0.5 uppercase tracking-wider">
                    {day.label.split(' ')[0]}
                  </p>
                </div>

                <div className="space-y-1.5 overflow-hidden">
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
      </div>

      <div className="mt-4 pt-4 border-t border-[color:var(--portal-border)]/50">
        <Link href="/portal/calendar" className="text-[#caa24c] hover:text-[#b0883b] transition-colors flex items-center justify-center gap-1 font-bold text-xs">
          View full calendar <ChevronRight size={14} className="translate-y-[0.5px]" />
        </Link>
      </div>
      <AnimatePresence>
        {selectedDay ? (
          <motion.div
            ref={closeRef}
            layoutId={reduceMotion ? undefined : `calendar-day-${selectedDay.dayStr}`}
            initial={reduceMotion ? { opacity: 0 } : undefined}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-0 z-10 flex min-h-0 flex-col overflow-hidden rounded-xl bg-[color:var(--portal-card)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
              <div><h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Tasks</h3><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{selectedDay.label}</p></div>
              <PortalCloseButton aria-label="Close day tasks" onClick={() => { setSelectedDay(null); triggerRef.current?.focus() }} />
            </div>
            <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto py-2">
              {selectedDay.tasks.length ? selectedDay.tasks.map((task) => (
                <Link key={task.id} href={task.inquiry_id ? `/portal/leads/${task.inquiry_id}?tab=tasks` : '/portal/planner/tasks'} className="flex min-h-11 items-center justify-between gap-3 border-b border-[color:var(--portal-border)] py-3 text-sm text-[color:var(--portal-text)] hover:text-[#a8792f] dark:hover:text-[#f1d27a]">
                  <span>{task.title}</span><ChevronRight size={15} className="shrink-0" />
                </Link>
              )) : <p className="py-6 text-sm text-[color:var(--portal-muted)]">No tasks scheduled for this day.</p>}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
