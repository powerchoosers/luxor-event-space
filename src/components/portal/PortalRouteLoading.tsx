'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { PortalSkeleton } from './PortalUI'

export function PortalRouteLoading({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/portal' || pathname === '/portal/') return <>{children}</>

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-6" role="status" aria-label="Loading page">
      <span className="sr-only">Loading page</span>
      <PortalSkeleton className="h-9 w-48 rounded-lg" />
      <PortalSkeleton className="h-14 w-full rounded-xl" />
      <PortalSkeleton className="min-h-64 w-full flex-1 rounded-xl" />
    </div>
  )
}
