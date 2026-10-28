import { PortalHomeFrame } from '@/components/portal/PortalHomeFrame'
import React from 'react'
import { Calendar, DollarSign, Bell, ListTodo, Clock } from 'lucide-react'
import { PortalSkeleton } from '@/components/portal/PortalUI'
import { PortalRouteLoading } from '@/components/portal/PortalRouteLoading'

export default function PortalOverviewLoading() {
  return <PortalRouteLoading><PortalHomeFrame><PortalOverviewSkeleton /></PortalHomeFrame></PortalRouteLoading>
}

export function PortalOverviewSkeleton() {
  return (
    <div data-luxor-loading="true" className="w-full flex-1">
      <div className="flex flex-col gap-2.5 pb-28 sm:gap-6 sm:pb-10">
        <div className="space-y-4 sm:space-y-6" role="status" aria-label="Loading portal overview">
          <div className="rounded-2xl border border-[#caa24c]/30 bg-[color:var(--portal-card)] p-4 sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="max-w-md">
                <div className="flex h-5 items-center gap-2"><PortalSkeleton className="h-5 w-5 rounded-full" /><PortalSkeleton className="h-3 w-48 rounded" /></div>
                <h3 className="mt-1.5 text-base font-bold tracking-tight text-[color:var(--portal-text)] sm:text-lg">Brochure Leads vs. Schedule a Visit Leads</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--portal-muted)]">Capturing top-of-funnel leads via the free venue brochure while nurturing them toward scheduling a visit.</p>
              </div>
              <div className="flex flex-col items-stretch gap-3 sm:flex-row xl:w-[680px]">
                {[0, 1, 2].map((i) => <div key={i} className="flex min-w-0 flex-1 flex-col justify-between rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3.5">
                  <div><div className="flex h-5 items-center justify-between"><PortalSkeleton className="h-3 w-28 rounded" /><PortalSkeleton className="h-4 w-12 rounded-full" /></div><PortalSkeleton className="mt-1.5 h-8 w-14 rounded" />{i === 0 && <p className="mt-1 text-[11px] text-transparent">21 unique leads with recorded brochure clicks</p>}<PortalSkeleton className="mt-2.5 h-1.5 w-full rounded-full" /></div>
                  <div className="mt-2.5 flex items-center justify-between border-t border-[color:var(--portal-border)]/50 pt-2"><PortalSkeleton className="h-4 w-16 rounded" /><PortalSkeleton className="h-4 w-12 rounded" /></div>
                </div>)}
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
            <div className="grid grid-cols-1 divide-y divide-[color:var(--portal-border)] xl:grid-cols-12 xl:divide-x xl:divide-y-0">
              {[3, 2, 3].map((count, i) => <div key={i} className={`flex flex-col justify-between p-4 sm:p-5 ${i === 0 ? 'xl:col-span-5' : i === 1 ? 'xl:col-span-3' : 'xl:col-span-4'}`}>
                <div className="mb-4 flex h-10 items-center border-b border-[color:var(--portal-border)]/60 pb-3"><PortalSkeleton className="h-6 w-40 rounded" /></div>
                <div className={`grid grid-cols-1 gap-3 ${i === 1 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>{Array.from({ length: count }, (_, j) => <div key={j} className="space-y-3 rounded-xl border border-[color:var(--portal-border)] p-3.5"><PortalSkeleton className="h-3 w-3/4 rounded" /><PortalSkeleton className="h-8 w-1/2 rounded" /><PortalSkeleton className="h-1.5 w-full rounded-full" /><PortalSkeleton className="h-3 w-2/3 rounded" /></div>)}</div>
              </div>)}
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-6">
            <div className="space-y-1"><PortalSkeleton className="h-4 w-32 rounded" /><PortalSkeleton className="h-4 w-full max-w-lg rounded" /></div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2 rounded-xl border border-[color:var(--portal-border)] p-4"><PortalSkeleton className="h-4 w-2/3 rounded" /><PortalSkeleton className="h-8 w-16 rounded" /><PortalSkeleton className="h-1.5 w-full rounded-full" /></div>)}</div>
          </div>
          <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-6">
            <div className="mb-5 space-y-1"><PortalSkeleton className="h-4 w-40 rounded" /><PortalSkeleton className="h-4 w-full max-w-md rounded" /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">{Array.from({ length: 7 }, (_, i) => <div key={i} className="space-y-3 rounded-xl border border-[color:var(--portal-border)] p-3.5"><PortalSkeleton className="h-3 w-2/3 rounded" /><PortalSkeleton className="h-8 w-1/2 rounded" /><PortalSkeleton className="h-2 w-full rounded-full" /><PortalSkeleton className="h-3 w-3/4 rounded" /></div>)}</div>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{[0, 1].map(i => <div key={i} className="space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-6"><PortalSkeleton className="h-4 w-48 rounded" /><PortalSkeleton className="h-4 w-3/4 rounded" />{[0, 1, 2, 3].map(j => <PortalSkeleton key={j} className="h-8 w-full rounded" />)}</div>)}</div>
          <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-6"><PortalSkeleton className="h-4 w-40 rounded" /><div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(i => <PortalSkeleton key={i} className="h-20 w-full rounded-xl" />)}</div></div>
        </div>

        {/* 2. VENUE OPERATIONS & FINANCIAL HEALTH HEADER */}
        <div className="pt-6 border-t border-[color:var(--portal-border)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[color:var(--portal-text)] tracking-tight">
                Venue Operations & Cash Flow
              </h2>
              <p className="text-xs text-[color:var(--portal-muted)]">
                Daily bookings pace, active tasks, and upcoming commitments.
              </p>
            </div>
          </div>
        </div>

        {/* TOP ROW: 4 Metric Cards Skeletons */}
        <div className="grid auto-rows-fr grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 2xl:grid-cols-4">
          {/* Bookings Card Skeleton */}
          <div className="portal-card-surface flex h-full min-h-[156px] w-full flex-col justify-between rounded-2xl p-4 sm:min-h-[180px] sm:p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
            <div className="flex items-start justify-between gap-3 w-full">
              <div className="min-w-0 flex-1 pr-2">
                <span className="text-[#caa24c] mb-3 block opacity-60">
                  <Calendar size={22} strokeWidth={1.5} />
                </span>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">BOOKINGS</p>
                <div className="my-1">
                  <PortalSkeleton className="h-8 w-24 rounded-lg" />
                </div>
                <PortalSkeleton className="h-3 w-20 rounded opacity-60 mt-1" />
              </div>
              <div className="ml-auto shrink-0">
                <PortalSkeleton className="h-14 w-14 rounded-full" />
              </div>
            </div>
            <div className="mt-4 w-full space-y-2">
              <PortalSkeleton className="h-2 w-full rounded-full" />
              <PortalSkeleton className="h-2.5 w-28 rounded opacity-60" />
            </div>
          </div>

          {/* Cash Flow Card Skeleton */}
          <div className="portal-card-surface flex h-full min-h-[156px] w-full flex-col justify-between rounded-2xl p-4 sm:min-h-[180px] sm:p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
            <div className="flex justify-between items-start w-full">
              <div>
                <span className="text-[#caa24c] mb-3 block opacity-60">
                  <DollarSign size={22} strokeWidth={1.5} />
                </span>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">
                  CASH FLOW <span className="text-[9px] font-medium opacity-85">(THIS MONTH)</span>
                </p>
                <div className="my-1">
                  <PortalSkeleton className="h-8 w-28 rounded-lg" />
                </div>
                <PortalSkeleton className="h-3 w-20 rounded opacity-60 mt-1" />
              </div>
            </div>
            <div className="mt-3 h-14 w-full">
              <PortalSkeleton className="h-full w-full rounded-lg opacity-40" />
            </div>
            <div className="flex items-center gap-2 mt-4 pt-2 border-t border-[color:var(--portal-border)]/50">
              <PortalSkeleton className="h-3 w-16 rounded opacity-70" />
              <span className="text-[color:var(--portal-muted)]/40">•</span>
              <PortalSkeleton className="h-3 w-16 rounded opacity-50" />
            </div>
          </div>

          {/* Next Event Card Skeleton */}
          <div className="portal-card-surface flex h-full min-h-[156px] w-full flex-col justify-between rounded-2xl p-4 sm:min-h-[180px] sm:p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
            <div>
              <span className="text-[#caa24c] mb-3 block opacity-60">
                <Calendar size={22} strokeWidth={1.5} />
              </span>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">NEXT EVENT</p>
              <div className="my-1 space-y-1.5">
                <PortalSkeleton className="h-5 w-40 rounded-lg" />
                <PortalSkeleton className="h-3.5 w-24 rounded opacity-70" />
              </div>
            </div>
            <div className="mt-4 pt-2 border-t border-[color:var(--portal-border)]/50">
              <PortalSkeleton className="h-3 w-32 rounded opacity-60" />
            </div>
          </div>

          {/* Needs Attention Card Skeleton */}
          <div className="portal-card-surface flex h-full min-h-[156px] w-full flex-col justify-between rounded-2xl p-4 sm:min-h-[180px] sm:p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
            <div>
              <span className="text-[#caa24c] mb-3 block opacity-60">
                <Bell size={22} strokeWidth={1.5} />
              </span>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)] mb-1">NEEDS ATTENTION</p>
              <div className="my-1">
                <PortalSkeleton className="h-8 w-16 rounded-lg" />
              </div>
              <PortalSkeleton className="h-3 w-12 rounded opacity-60 mt-1" />
            </div>
            <div className="mt-4 pt-2 border-t border-[color:var(--portal-border)]/50">
              <PortalSkeleton className="h-3.5 w-28 rounded opacity-70" />
            </div>
          </div>
        </div>

        {/* MIDDLE ROW: 3 Columns Skeletons */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 2xl:grid-cols-3">
          {/* Priorities Skeleton */}
          <div className="portal-card-surface flex flex-col justify-between p-6 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
            <div>
              <div className="flex items-center gap-2.5 mb-6">
                <ListTodo className="h-5 w-5 text-[#caa24c] opacity-60" strokeWidth={1.5} />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">TODAY&apos;S PRIORITIES</h3>
              </div>
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-[color:var(--portal-border)]/30 pb-3 last:border-b-0">
                    <div className="flex items-center gap-3 flex-1">
                      <PortalSkeleton className="w-4 h-4 rounded" />
                      <PortalSkeleton className="h-3.5 w-3/5 rounded" />
                    </div>
                    <PortalSkeleton className="h-3 w-16 rounded opacity-60" />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-[color:var(--portal-border)]/50">
              <PortalSkeleton className="h-3.5 w-24 mx-auto rounded opacity-60" />
            </div>
          </div>

          {/* This Week Calendar Skeleton */}
          <div className="portal-card-surface flex flex-col justify-between p-6 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
            <div>
              <div className="flex items-center gap-2.5 mb-6">
                <Calendar className="h-5 w-5 text-[#caa24c] opacity-60" strokeWidth={1.5} />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">THIS WEEK</h3>
              </div>
              <div className="grid grid-cols-7 gap-1.5 pt-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 p-2 rounded-xl border border-[color:var(--portal-border)]/40 bg-[color:var(--portal-soft)]/20">
                    <PortalSkeleton className="h-2.5 w-6 rounded opacity-60" />
                    <PortalSkeleton className="h-4 w-4 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-[color:var(--portal-border)]/50">
              <PortalSkeleton className="h-3.5 w-28 mx-auto rounded opacity-60" />
            </div>
          </div>

          {/* Bills Due Skeleton */}
          <div className="portal-card-surface flex flex-col justify-between p-6 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] md:col-span-2 2xl:col-span-1">
            <div>
              <div className="flex items-center gap-2.5 mb-6">
                <Clock className="h-5 w-5 text-[#caa24c] opacity-60" strokeWidth={1.5} />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">BILLS &amp; FINANCIAL OBLIGATIONS</h3>
              </div>
              <div className="space-y-3.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-[color:var(--portal-border)]/30 pb-3 last:border-b-0">
                    <div className="space-y-1.5 flex-1">
                      <PortalSkeleton className="h-3.5 w-2/5 rounded" />
                      <PortalSkeleton className="h-2.5 w-1/4 rounded opacity-60" />
                    </div>
                    <PortalSkeleton className="h-4 w-16 rounded" />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-[color:var(--portal-border)]/50">
              <PortalSkeleton className="h-3.5 w-32 mx-auto rounded opacity-60" />
            </div>
          </div>
        </div>

        {/* BOTTOM ROW: 3 Columns Skeletons */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 2xl:grid-cols-3 items-stretch">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="portal-card-surface flex flex-col justify-between p-5 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <PortalSkeleton className="h-4 w-4 rounded" />
                  <PortalSkeleton className="h-3.5 w-32 rounded" />
                </div>
                <div className="space-y-3 pt-2">
                  <PortalSkeleton className="h-3 w-4/5 rounded opacity-70" />
                  <PortalSkeleton className="h-3 w-3/5 rounded opacity-50" />
                  <PortalSkeleton className="h-3 w-2/3 rounded opacity-40" />
                </div>
              </div>
              <div className="pt-4 border-t border-[color:var(--portal-border)]/50">
                <PortalSkeleton className="h-3 w-24 rounded opacity-60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
;(PortalOverviewLoading as unknown as { isLuxorLoading?: boolean }).isLuxorLoading = true
