"use client"

import React, { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { Activity } from 'lucide-react'
import { PortalPageFrame, PortalPageHeader, PortalSkeleton } from './PortalUI'

const DateSlot = createContext<{ mobile: HTMLElement | null; desktop: HTMLElement | null }>({ mobile: null, desktop: null })

export function PortalHomeDateControl({ children }: { children: React.ReactNode }) {
  const targets = useContext(DateSlot)
  return <>
    {targets.mobile ? createPortal(children, targets.mobile, 'mobile') : null}
    {targets.desktop ? createPortal(children, targets.desktop, 'desktop') : null}
  </>
}

export function PortalHomeFrame({ children }: { children: React.ReactNode }) {
  const [mobileDateSlot, setMobileDateSlot] = useState<HTMLDivElement | null>(null)
  const [desktopDateSlot, setDesktopDateSlot] = useState<HTMLDivElement | null>(null)
  return <DateSlot.Provider value={{ mobile: mobileDateSlot, desktop: desktopDateSlot }}>
    <PortalPageFrame className="min-h-full group/portal !gap-2.5 sm:!gap-6">
      <PortalPageHeader
        icon={<Activity size={18} />}
        title="Luxor Operations Hub"
        description="Your daily view of bookings, revenue, and venue operations."
        actions={
          <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-1.5 md:pt-1">
            <span className="text-[10px] font-semibold tracking-wider text-[color:var(--portal-faint)]">
              LUXOR AT LAS PALMAS • HQ
            </span>
          </div>
        }
      />
      <div className="space-y-4 pt-0 sm:space-y-6 sm:pt-2">
        <div className="flex flex-col gap-2.5 sm:gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[color:var(--portal-border)] pb-3 sm:pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-bold text-[color:var(--portal-text)] tracking-tight">
              Marketing & Sales
            </h2>
            <div ref={setMobileDateSlot} className="ml-auto w-32 shrink-0 sm:hidden [&:has(button)>.luxor-skeleton]:hidden">
              <PortalSkeleton className="h-9 w-full rounded-lg" />
            </div>
          </div>
          <p className="mt-0.5 text-xs sm:mt-1 sm:text-sm text-[color:var(--portal-muted)]">
            <span className="sm:hidden">From website visitor to booked event.</span>
            <span className="hidden sm:inline">
              See how people are discovering Luxor and moving from website visitor to booked event.
            </span>
          </p>
        </div>


          <div className="hidden items-center gap-2.5 self-auto sm:flex">
            <div ref={setDesktopDateSlot} className="w-44 min-h-9 [&:has(button)>.luxor-skeleton]:hidden"><PortalSkeleton className="h-9 w-44 rounded-lg" /></div>
          </div>
        </div>
        {children}
      </div>
    </PortalPageFrame>
  </DateSlot.Provider>
}
