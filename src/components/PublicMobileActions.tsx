'use client'

import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { PublicPhoneLink } from '@/components/PublicPhoneLink'

export function PublicMobileActions() {
  return (
    <aside aria-label="Quick contact actions" className="site-floating-action fixed inset-x-0 bottom-0 z-[120] border-t border-[#9b6f24]/20 bg-[#faf7f1]/95 p-2 shadow-[0_-12px_30px_-24px_rgba(61,43,23,0.5)] backdrop-blur-xl sm:hidden">
      <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
        <PublicPhoneLink compact className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#9b6f24]/30 bg-white/85 px-3 text-xs font-bold uppercase tracking-[.14em] text-[#805b1f]" />
        <Link href="/tour#tour-availability" data-conversion="tour_cta_click" data-conversion-label="Mobile sticky bar" className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#caa24c] px-3 text-xs font-bold uppercase tracking-[.14em] text-[#050505]"><CalendarDays className="h-4 w-4" />Check times</Link>
      </div>
    </aside>
  )
}
