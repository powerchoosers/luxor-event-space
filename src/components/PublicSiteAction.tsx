'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDown } from '@/lib/icons/phosphor-compat'
import { defaultWebsiteContent, resolvePublicHeroButtonLabel, type WebsiteContent, type WebsiteDestination } from '@/lib/publicWebsiteContent'
import { loadPublicWebsiteContent } from '@/lib/publicWebsiteContentClient'

const otherLabels: Record<WebsiteDestination, string> = { brochure: 'Get venue brochure', packages: 'Explore packages', visit: 'Schedule a visit' }
const hrefs: Record<WebsiteDestination, string> = { brochure: '/#brochure-form', packages: '/packages', visit: '/visit#visit-booking' }

export function PublicSiteAction({ placement, className }: { placement: 'hero' | 'other'; className: string }) {
  const [content, setContent] = useState<WebsiteContent | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    let active = true
    void loadPublicWebsiteContent().then((value) => { if (active) setContent(value) })
    return () => { active = false }
  }, [])

  const resolved = content ?? defaultWebsiteContent
  const destination = resolved[placement]
  const label = placement === 'hero' ? resolvePublicHeroButtonLabel(destination, resolved.heroText) : otherLabels[destination]
  return (
    <AnimatePresence mode="wait" initial={false}>
      {placement === 'hero' && !content ? (
        <motion.span key="loading" className={`${className} min-h-11 min-w-[13rem] sm:min-w-[22rem]`} role="status" aria-label="Loading venue action"
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(5px)' }} transition={{ duration: reduceMotion ? 0 : 0.2 }}>
          <span aria-hidden="true" className="h-3 w-40 animate-pulse rounded bg-white/35 motion-reduce:animate-none sm:w-64" />
        </motion.span>
      ) : (
        <motion.a key="action" href={placement === 'hero' && destination === 'brochure' ? '#brochure-form' : hrefs[destination]} className={className}
          data-conversion={destination === 'brochure' ? 'brochure_hero_click' : destination === 'visit' ? 'visit_cta_click' : undefined}
          initial={reduceMotion ? false : { opacity: 0, filter: 'blur(5px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: reduceMotion ? 0 : 0.3 }}>
          <span className={placement === 'hero' ? 'relative z-10 max-w-[10.75rem] whitespace-normal sm:max-w-none' : undefined}>{label}</span>
          {placement === 'hero' && <ArrowDown className="relative z-10 hidden h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-y-0.5 sm:block" />}
        </motion.a>
      )}
    </AnimatePresence>
  )
}
