'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CalendarDays } from '@/lib/icons/phosphor-compat'
import { EventsCollectionCard } from '@/components/EventsCollectionCard'
import { LUXOR_EVENT_COLLECTIONS, eventCollectionHref } from '@/lib/luxorEventCollections'
import { publicSitePath } from '@/lib/publicSitePaths'
import { usePathname } from 'next/navigation'

const EVENTS_HERO_SCRIM =
  'linear-gradient(105deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.52) 42%, rgba(0,0,0,0.18) 100%)'

export default function EventsPage() {
  const pathname = usePathname()
  const spanish = pathname.startsWith('/es')

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
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: EVENTS_HERO_SCRIM }}
        />

        <div className="relative z-10 mx-auto flex min-h-[88svh] w-full max-w-7xl flex-col justify-end px-5 pb-14 pt-36 text-left sm:min-h-[92svh] sm:px-6 sm:pb-20 sm:pt-40 lg:px-8">
          <p
            className="font-mono text-[11px] font-bold uppercase tracking-[0.28em]"
            style={{ color: '#f1d27a', textShadow: '0 1px 10px rgba(0,0,0,0.55)' }}
          >
            {spanish ? 'Celebraciones en Luxor' : 'Celebrations at Luxor'}
          </p>
          <h1
            className="mt-4 max-w-xl font-serif text-4xl leading-[0.95] sm:text-5xl lg:text-6xl"
            style={{ color: '#fffaf3', textShadow: '0 2px 12px rgba(0,0,0,0.25)' }}
          >
            {spanish ? 'Cada ocasión merece su momento.' : 'Every Occasion Deserves Its Moment.'}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 sm:text-lg" style={{ color: '#eadcc8' }}>
            {spanish
              ? 'Un entorno hermoso para los hitos de la vida, reuniones significativas y celebraciones inolvidables.'
              : "A beautiful setting for life's milestones, meaningful gatherings, and unforgettable celebrations."}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href={packagesHref}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] transition hover:border-[#caa24c]/75"
              style={{
                borderColor: 'rgba(202, 162, 76, 0.55)',
                color: '#fffaf3',
                backgroundColor: 'rgba(255, 250, 243, 0.06)',
              }}
            >
              {spanish ? 'Explorar paquetes' : 'Explore Packages'}{' '}
              <ArrowRight className="h-4 w-4" style={{ color: '#fffaf3' }} />
            </Link>
            <Link
              href={visitHref}
              data-conversion="visit_cta_click"
              data-conversion-label="Events hero"
              className="luxor-gold-raised inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm uppercase tracking-[0.14em]"
            >
              <CalendarDays className="h-4 w-4" />
              {spanish ? 'Agendar una visita' : 'Schedule a Visit'}
            </Link>
          </div>
        </div>
      </section>

      <section className="luxor-events-landing-collections luxor-launcher-clearance-scroll luxor-launcher-clearance-last relative py-20 sm:py-24 lg:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 0% 0%, rgba(202,162,76,0.12), transparent 28%), radial-gradient(circle at 100% 100%, rgba(202,162,76,0.1), transparent 24%)',
          }}
        />
        <div className="luxor-launcher-clearance-inset relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.34em] text-[#8d672b]">
              {spanish ? 'Encuentra tu celebración' : 'Find your celebration'}
            </p>
            <h2 className="mt-3 font-serif text-3xl leading-tight text-[#241d17] sm:text-4xl">
              {spanish ? 'Un espacio para cada celebración.' : 'A Space for Every Celebration.'}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#665a4e] sm:text-lg">
              {spanish
                ? 'Desde celebraciones únicas en la vida hasta hitos familiares y reuniones con sentido, Luxor ofrece un entorno versátil pensado para que cada ocasión sea memorable.'
                : 'From once-in-a-lifetime celebrations to family milestones and meaningful gatherings, Luxor offers a versatile setting designed to make every occasion memorable.'}
            </p>
          </div>

          <div className="mt-12 grid gap-10 lg:mt-16 lg:gap-12">
            {LUXOR_EVENT_COLLECTIONS.map((collection, index) => (
              <EventsCollectionCard
                key={collection.href}
                collection={collection}
                index={index}
                title={spanish ? collection.titleEs : collection.title}
                eventTypesLine={spanish ? collection.eventTypesLineEs : collection.eventTypesLine}
                href={eventCollectionHref(collection, spanish)}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}