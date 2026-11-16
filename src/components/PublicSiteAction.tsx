'use client'

import { useEffect, useState } from 'react'
import { ArrowDown } from '@/lib/icons/phosphor-compat'
import { resolvePublicHeroButtonLabel, type WebsiteDestination } from '@/lib/publicWebsiteContent'

type Actions = { hero: WebsiteDestination; other: WebsiteDestination; heroText?: string }
const otherLabels: Record<WebsiteDestination, string> = { brochure: 'Get venue brochure', packages: 'Explore packages', visit: 'Schedule a visit' }
const hrefs: Record<WebsiteDestination, string> = { brochure: '/#brochure-form', packages: '/packages', visit: '/visit#visit-booking' }

export function PublicSiteAction({ placement, className }: { placement: 'hero' | 'other'; className: string }) {
  const [destination, setDestination] = useState<WebsiteDestination>('brochure')
  const [heroText, setHeroText] = useState<string | undefined>(undefined)

  useEffect(() => {
    fetch('/api/public/content?page=public_actions', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: Partial<Actions> | null) => {
        const choice = value?.[placement]
        if (choice === 'brochure' || choice === 'packages' || choice === 'visit') setDestination(choice)
        if (placement === 'hero' && typeof value?.heroText === 'string') {
          const trimmed = value.heroText.trim()
          setHeroText(trimmed || undefined)
        }
      })
      .catch(() => {})
  }, [placement])

  const label = placement === 'hero'
    ? resolvePublicHeroButtonLabel(destination, heroText)
    : otherLabels[destination]

  return (
    <a
      href={placement === 'hero' && destination === 'brochure' ? '#brochure-form' : hrefs[destination]}
      className={className}
      data-conversion={destination === 'brochure' ? 'brochure_hero_click' : destination === 'visit' ? 'visit_cta_click' : undefined}
    >
      <span className={placement === 'hero' ? 'relative z-10 max-w-[10.75rem] whitespace-normal sm:max-w-none' : undefined}>
        {label}
      </span>
      {placement === 'hero' && (
        <ArrowDown className="relative z-10 hidden h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-y-0.5 sm:block" />
      )}
    </a>
  )
}