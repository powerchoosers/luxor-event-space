'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export function SiteScrollGuard() {
  const pathname = usePathname()

  useEffect(() => {
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
    document.body.style.position = ''
    document.body.style.width = ''
  }, [pathname])

  return null
}
