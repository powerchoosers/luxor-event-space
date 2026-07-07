'use client'

import React, { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
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
  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    // Scroll today's card into view on mount
    const todayElement = scrollContainerRef.current?.querySelector('[data-today="true"]');
    if (todayElement) {
      todayElement.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'center'
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
    <div className="flex flex-col h-full justify-between">
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
              <div
                key={day.dayStr}
                data-today={day.isToday}
                className={`flex flex-col justify-between w-28 h-40 shrink-0 p-3 rounded-xl border transition-all snap-center ${
                  day.isToday
                    ? 'bg-[#fcf8f2] dark:bg-[#caa24c]/10 border-[#caa24c] shadow-[0_0_12px_rgba(202,162,76,0.15)] scale-[1.02]'
                    : 'bg-white/40 dark:bg-black/10 border-[color:var(--portal-border)]/40 hover:border-[color:var(--portal-border)]'
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
                    <span className="text-[8px] text-[color:var(--portal-muted)]/40 block font-mono italic">
                      No schedule
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-[color:var(--portal-border)]/50">
        <Link href="/portal/calendar" className="text-[#caa24c] hover:text-[#b0883b] transition-colors flex items-center justify-center gap-1 font-bold text-xs">
          View full calendar <ChevronRight size={14} className="translate-y-[0.5px]" />
        </Link>
      </div>
    </div>
  )
}
