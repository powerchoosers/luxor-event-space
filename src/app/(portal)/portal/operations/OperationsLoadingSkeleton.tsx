import React from 'react'
import { PortalSkeleton } from '@/components/portal/PortalUI'

export function OperationsLoadingSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading Operations"
      className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col gap-4 sm:gap-6"
    >
      <span className="sr-only" role="status">Loading Operations</span>

      <header className="flex min-w-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <PortalSkeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 space-y-2">
            <PortalSkeleton className="h-6 w-44 max-w-[55vw] rounded" />
            <PortalSkeleton className="h-3 w-64 max-w-[70vw] rounded" />
          </div>
        </div>
        <PortalSkeleton className="hidden h-9 w-32 shrink-0 rounded-xl sm:block" />
      </header>

      <div className="flex shrink-0 gap-2 overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1.5" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <PortalSkeleton key={index} className="h-9 min-w-20 flex-1 rounded-lg" />
        ))}
      </div>

      <section className="min-h-0 flex-1 space-y-4 overflow-hidden" aria-hidden="true">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
              <PortalSkeleton className="h-3 w-24 rounded" />
              <PortalSkeleton className="mt-4 h-7 w-20 rounded" />
              <PortalSkeleton className="mt-3 h-3 w-32 max-w-full rounded" />
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4 border-b border-[color:var(--portal-border)] pb-4">
            <PortalSkeleton className="h-5 w-40 rounded" />
            <PortalSkeleton className="h-8 w-24 rounded-lg" />
          </div>
          <div className="space-y-4 pt-5">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 border-b border-[color:var(--portal-border)]/70 pb-4 last:border-0 last:pb-0">
                <PortalSkeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <PortalSkeleton className="h-3 w-2/5 max-w-48 rounded" />
                  <PortalSkeleton className="h-3 w-3/5 max-w-72 rounded" />
                </div>
                <PortalSkeleton className="hidden h-3 w-20 rounded sm:block" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
