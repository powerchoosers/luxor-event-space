'use client'

import React, { useSyncExternalStore } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { LuxorAxisLockup } from '@/components/LuxorWordmark'
import { usePortalLoadingSignal } from '@/lib/luxorLoadingSignal'

const LUXOR_EASE = [0.22, 1, 0.36, 1] as const
const subscribeToHydration = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

export function SiteLoading() {
  const reduceMotion = useReducedMotion()

  return (
    <motion.main
      data-luxor-loading="true"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0.65, filter: 'blur(10px)' }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)' }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(14px)' }}
      transition={{ duration: 0.28, ease: LUXOR_EASE }}
      className="relative isolate flex min-h-[72vh] items-center justify-center overflow-hidden bg-[#050505] px-6 pt-28 text-[#f7efe3] transform-gpu"
    >
      <div className="absolute inset-0 luxor-noise opacity-20" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(202,162,76,0.16),transparent_24rem)]" />
      <div className="relative w-full max-w-md text-center">
        <LuxorAxisLockup className="mx-auto w-full max-w-[300px]" />
        <div className="mx-auto mt-8 h-1 w-44 overflow-hidden rounded-full bg-[#caa24c]/12">
          <div className="luxor-loading-bar h-full w-1/2 rounded-full bg-[#caa24c]" />
        </div>
        <p className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-[#caa24c]">
          Preparing the experience
        </p>
      </div>
    </motion.main>
  )
}

export function PortalLoadingCard({ className = '' }: { className?: string }) {
  return (
    <div
      data-luxor-loading="true"
      className={`w-full max-w-md rounded-3xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-8 text-center shadow-2xl shadow-black/20 backdrop-blur-2xl transition-all duration-300 ${className}`}
    >
      <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#caa24c]">
        <span className="absolute inset-0 rounded-2xl bg-[#caa24c]/20 animate-ping opacity-30" />
        <span className="h-4 w-4 rounded-full bg-[#caa24c] shadow-[0_0_12px_rgba(202,162,76,0.8)]" />
      </div>
      <h2 className="mt-6 text-xl font-extrabold tracking-tight text-[color:var(--portal-text)]">
        Syncing Workspace
      </h2>
      <p className="mt-2 text-xs font-medium leading-relaxed text-[color:var(--portal-muted)]">
        Connecting client dossiers, venue telemetry, and operational schedules...
      </p>
      <div className="mt-7 space-y-3">
        <div className="luxor-skeleton h-3.5 w-full rounded-md" />
        <div className="luxor-skeleton h-3.5 w-4/5 mx-auto rounded-md" />
        <div className="luxor-skeleton h-3.5 w-3/5 mx-auto rounded-md" />
      </div>
    </div>
  )
}
;(PortalLoadingCard as unknown as { isLuxorLoading?: boolean }).isLuxorLoading = true

export function PortalLoading({ className = '' }: { className?: string }) {
  const pathname = usePathname()
  usePortalLoadingSignal(pathname)
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot)

  // During SSR before hydration on initial home entrance, render the static card
  if (!hydrated && pathname === '/portal') {
    return (
      <div
        data-luxor-loading="true"
        className={`flex flex-1 flex-col items-center justify-center my-auto min-h-[calc(100vh-10rem)] w-full py-10 px-4 ${className}`}
      >
        <PortalLoadingCard />
      </div>
    )
  }

  // Structured in-page skeleton for subpages or initial suspense to fill layout gaps smoothly
  return (
    <div
      data-luxor-loading="true"
      aria-busy="true"
      className={`flex flex-1 flex-col w-full py-6 px-4 sm:px-8 space-y-6 ${className}`}
    >
      <div className="flex flex-col gap-2">
        <div className="h-6 w-44 rounded-xl luxor-skeleton" />
        <div className="h-3 w-60 rounded-lg luxor-skeleton opacity-60" />
      </div>
      <div className="flex items-center justify-between gap-4 pt-1">
        <div className="h-9 w-64 rounded-xl luxor-skeleton" />
        <div className="h-9 w-24 rounded-xl luxor-skeleton" />
      </div>
      <div className="h-72 w-full rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 space-y-3.5">
        <div className="h-3.5 w-full rounded luxor-skeleton opacity-75" />
        <div className="h-3.5 w-11/12 rounded luxor-skeleton opacity-60" />
        <div className="h-3.5 w-4/5 rounded luxor-skeleton opacity-45" />
        <div className="h-3.5 w-3/4 rounded luxor-skeleton opacity-30" />
      </div>
    </div>
  )
}
;(PortalLoading as unknown as { isLuxorLoading?: boolean }).isLuxorLoading = true
