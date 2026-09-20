import Link from 'next/link'
import { Calendar, Globe } from 'lucide-react'
import { TourGallery } from '@/components/TourGallery'
import { TourPageActions } from '@/components/TourPageActions'
import { TourRequestForm } from '@/components/TourRequestForm'

type Locale = 'en' | 'es'

const copy = {
  en: {
    eyebrow: 'Private venue tours',
    heading: 'See the room. Picture your day.',
    intro: 'Choose an available time and tell us what you are planning. We will confirm the visit and help you understand the space, packages, and next steps.',
    pill: '30-minute private tours · By appointment',
    languageLabel: 'Español',
    languageHref: '/es/tour',
    mapTitle: 'Luxor at Las Palmas Events location map',
    mapLead: 'Find us at 803 Castroville Rd #402',
  },
  es: {
    eyebrow: 'Recorridos privados del lugar',
    heading: 'Conoce el espacio. Imagina tu día.',
    intro: 'Elige una hora disponible y cuéntanos qué estás planeando. Confirmaremos tu visita y te ayudaremos a conocer el espacio, los paquetes y los próximos pasos.',
    pill: 'Recorridos privados de 30 minutos · Con cita previa',
    languageLabel: 'English',
    languageHref: '/tour',
    mapTitle: 'Mapa de Luxor at Las Palmas Events',
    mapLead: 'Visítanos en 803 Castroville Rd #402',
  },
} as const

const googleMapsUrl = 'https://maps.app.goo.gl/qQyX6MP98A9FNwvr6?g_st=ic'
const appleMapsUrl = 'https://maps.apple/p/SYUX3ViRAh0KJ2'

export function TourPageContent({ locale }: { locale: Locale }) {
  const text = copy[locale]

  const mapCard = (
    <div className="overflow-hidden rounded-2xl border border-[#b98a3d]/25 bg-white shadow-[0_25px_80px_-44px_rgba(56,38,20,0.45)]">
      <iframe
        title={text.mapTitle}
        src="https://www.google.com/maps?q=803+Castroville+Rd+%23402,+San+Antonio,+TX+78237&output=embed"
        className="h-64 w-full border-0 sm:h-72"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-[#665a4e]">
        <span>{text.mapLead}</span>
        <span className="flex gap-3">
          <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4 hover:text-[#8d672b]">
            Google Maps
          </a>
          <a href={appleMapsUrl} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4 hover:text-[#8d672b]">
            Apple Maps
          </a>
        </span>
      </div>
    </div>
  )

  return (
    <main lang={locale} className="min-h-screen overflow-x-clip bg-[#f4efe7] pt-28 text-[#241d17]">
      <section className="px-5 pb-16 sm:px-6 lg:px-8 lg:pb-24">
        <div className="mx-auto max-w-7xl">
          <TourGallery locale={locale} />

          <div className="mt-8 grid gap-8 lg:mt-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12 lg:items-start">
            {/* Left Column on Desktop / First on Mobile */}
            <div className="max-w-xl space-y-5">
              {/* Eyebrow & Corner Language Switcher (Mockup style) */}
              <div className="flex items-center justify-between gap-4">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-[#8d672b]">
                  {text.eyebrow}
                </p>
                <Link
                  href={text.languageHref}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#b98a3d]/30 bg-white/70 px-3 py-1 text-xs font-semibold text-[#8d672b] backdrop-blur-xs transition hover:border-[#b98a3d] hover:bg-white hover:text-[#5f441b]"
                  aria-label={locale === 'es' ? 'Switch to English' : 'Cambiar a Español'}
                >
                  <Globe size={13} className="text-[#b98a3d]" />
                  <span>{text.languageLabel}</span>
                </Link>
              </div>

              <h1 className="font-serif text-5xl leading-[0.94] sm:text-6xl">{text.heading}</h1>
              <p className="max-w-lg text-base leading-7 text-[#665a4e] sm:text-lg">{text.intro}</p>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#b98a3d]/25 bg-[#faf6ef] px-3.5 py-1 text-xs font-medium text-[#8d672b]">
                <Calendar size={13} />
                <span>{text.pill}</span>
              </div>

              {/* Desktop Map (moved up directly beneath the intro text) */}
              <div className="hidden pt-3 lg:block">
                {mapCard}
              </div>
            </div>

            {/* Right Column on Desktop (Form + Under-form section) / Second on Mobile */}
            <div className="space-y-6">
              <TourRequestForm locale={locale} />
              <TourPageActions locale={locale} />

              {/* Mobile Map (under the form & contact actions) */}
              <div className="pt-2 lg:hidden">
                {mapCard}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
