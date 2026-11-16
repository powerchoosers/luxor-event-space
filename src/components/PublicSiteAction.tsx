'use client'

import { useEffect, useState } from 'react'
import { ArrowDown } from '@/lib/icons/phosphor-compat'

type Destination = 'brochure' | 'packages' | 'visit'
type Actions = { hero: Destination; other: Destination }
const labels: Record<Destination, string> = { brochure: 'Get venue brochure', packages: 'Explore packages', visit: 'Schedule a visit' }
const hrefs: Record<Destination, string> = { brochure: '/#brochure-form', packages: '/packages', visit: '/visit#visit-booking' }

export function PublicSiteAction({ placement, className }: { placement: 'hero' | 'other'; className: string }) {
  const [destination, setDestination] = useState<Destination>('brochure')
  useEffect(() => {
    fetch('/api/public/content?page=public_actions', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((value: Partial<Actions> | null) => {
        const choice = value?.[placement]
        if (choice === 'brochure' || choice === 'packages' || choice === 'visit') setDestination(choice)
      }).catch(() => {})
  }, [placement])
  return <a href={placement === 'hero' && destination === 'brochure' ? '#brochure-form' : hrefs[destination]} className={className} data-conversion={destination === 'brochure' ? 'brochure_hero_click' : destination === 'visit' ? 'visit_cta_click' : undefined}>
    <span className={placement === 'hero' ? 'relative z-10' : undefined}>{placement === 'hero' && destination === 'brochure' ? 'Get your free venue brochure.' : labels[destination]}</span>
    {placement === 'hero' && destination === 'brochure' && <ArrowDown className="relative z-10 hidden h-4 w-4 transition-transform duration-300 group-hover:translate-y-0.5 sm:block" />}
  </a>
}
