'use client'

import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { PublicPhoneLink } from '@/components/PublicPhoneLink'

export function PublicMobileActions() {
  return (
    <aside aria-label="Quick contact actions" className="site-floating-action fixed inset-x-0 bottom-0 z-[120] border-t border-[#caa24c]/25 bg-black/88 p-2 backdrop-blur-xl sm:hidden">
      <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
        <PublicPhoneLink compact className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#caa24c]/35 bg-black/35 px-3 text-xs font-bold uppercase tracking-[.14em] text-[#f1d27a]" />
        <Link href="/visit" data-conversion="tour_cta_click" data-conversion-label="Mobile sticky bar" className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#caa24c] px-3 text-xs font-bold uppercase tracking-[.14em] text-[#050505]"><CalendarDays className="h-4 w-4" />Check times</Link>
      </div>
    </aside>
  )
}
