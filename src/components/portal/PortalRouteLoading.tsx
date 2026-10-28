'use client'

import React from 'react'
import { usePathname } from 'next/navigation'

export function PortalRouteLoading({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/portal' || pathname === '/portal/') return <>{children}</>

  return null
}
