'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CalendarDays } from '@/lib/icons/phosphor-compat'
import { EventsCollectionCard } from '@/components/EventsCollectionCard'
import { LUXOR_EVENT_COLLECTIONS, eventCollectionHref } from '@/lib/luxorEventCollections'
import { publicSitePath } from '@/lib/publicSitePaths'
import { motion, useReducedMotion } from 'framer-motion'
import { usePathname } from 'next/navigation'

export default function EventsPage() {
  const pathname = usePathname()
  const spanish = pathname.startsWith('/es')
  const reduceMotion = useReducedMotion()

  const visitHref = `${publicSitePath('/visit', spanish)}#visit-booking`
  const packagesHref = publicSitePath('/packages', spanish)

  return (
    <main lang={spanish ? 'es' : 'en'} className="overflow-x-hidden bg-[#faf7f1] text-[#241d17]">
      <section className="relative isolate min-h-[88svh] overflow-hidden sm:min-h-[92svh]">
        <Image
          src="/images/dining-hall/main-hall-wedding-wide.png"
          alt="Luxor ballroom prepared for a celebration"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(5,5,5,0.78)_0%,rgba(5,5,5,0.52)_42%,rgba(5,5,5,0.18)_100%)]" />

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
          className="relative z-10 mx-auto flex min-h-[88svh] max-w-7xl flex-col justify-end px-5 pb-14 pt-36 sm:min-h-[92svh] sm:px-6 sm:pb-20 sm:pt-40 lg:max-w-3xl lg:justify-center lg:px-8 lg:pb-0"
        >
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-[#e6c77f]">
            {spanish ? 'Celebraciones en Luxor' : 'Celebrations at Luxor'}
          </p>
          <h1 className="mt-4 max-w-xl font-serif text-4xl leading-[0.95] text-[#f7efe3] sm:text-5xl lg:text-6xl">
            {spanish ? 'Cada ocasión merece su momento.' : 'Every Occasion Deserves Its Moment.'}
          </h1>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href={packagesHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#caa24c]/40 bg-white/10 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#f7efe3] backdrop-blur-sm transition hover:border-[#caa24c]/65 hover:bg-white/15"
            >
              {spanish ? 'Explorar paquetes' : 'Explore Packages'} <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={visitHref}
              data-conversion="visit_cta_click"
              data-conversion-label="Events hero"
              className="luxor-gold-raised inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm uppercase tracking-[0.14em]"
            >
              <CalendarDays className="h-4 w-4" />
              {spanish ? 'Agendar una visita' : 'Schedule a Visit'}
            </Link>
          </div>
        </motion.div>
      </section>

      <section className="relative py-20 sm:py-24 lg:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 0% 0%, rgba(202,162,76,0.12), transparent 28%), radial-gradient(circle at 100% 100%, rgba(202,162,76,0.1), transparent 24%)',
          }}
        />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.34em] text-[#8d672b]">
              {spanish ? 'Tres colecciones' : 'Three collections'}
            </p>
            <h2 className="mt-3 font-serif text-3xl leading-tight text-[#241d17] sm:text-4xl">
              {spanish ? 'Encuentra tu celebración' : 'Find your celebration'}
            </h2>
          </div>

          <div className="mt-12 grid gap-10 lg:mt-16 lg:gap-12">
            {LUXOR_EVENT_COLLECTIONS.map((collection, index) => (
              <EventsCollectionCard
                key={collection.href}
                collection={collection}
                index={index}
                title={spanish ? collection.titleEs : collection.title}
                href={eventCollectionHref(collection, spanish)}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}