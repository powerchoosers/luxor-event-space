'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function SiteDocumentLang() {
  const pathname = usePathname()

  useEffect(() => {
    const lang = pathname.startsWith('/es') ? 'es' : 'en'
    document.documentElement.lang = lang
  }, [pathname])

  return null
}