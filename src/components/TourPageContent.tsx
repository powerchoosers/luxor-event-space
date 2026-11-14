import Link from 'next/link'
import { Calendar, Globe } from '@/lib/icons/phosphor-compat'
import { TourGallery } from '@/components/TourGallery'
import { TourPageActions } from '@/components/TourPageActions'
import { TourRequestForm } from '@/components/TourRequestForm'

type Locale = 'en' | 'es'

const copy = {
  en: {
    eyebrow: 'Schedule a Visit',
    heading: 'See the room. Picture your day.',
    intro: 'Choose an available time to book your visit. We’ll confirm it right away and send your calendar invitation and reminders.',
    pill: '30-minute visits · By appointment',
    languageLabel: 'Español',
    languageHref: '/es/visit',
    mapTitle: 'Luxor at Las Palmas Events location map',
    mapLead: 'Find us at 803 Castroville Rd #402',
  },
  es: {
    eyebrow: 'Visitas privadas del lugar',
    heading: 'Conoce el espacio. Imagina tu día.',
    intro: 'Elige una hora disponible para reservar tu visita. La confirmaremos al instante y te enviaremos la invitación y los recordatorios.',
    pill: 'Visitas privadas de 30 minutos · Con cita previa',
    languageLabel: 'English',
    languageHref: '/visit',
    mapTitle: 'Mapa de Luxor at Las Palmas Events',
    mapLead: 'Visítanos en 803 Castroville Rd #402',
  },
} as const

const googleMapsUrl = 'https://maps.app.goo.gl/qQyX6MP98A9FNwvr6?g_st=ic'
const appleMapsUrl = 'https://maps.apple/p/SYUX3ViRAh0KJ2'

export function TourPageContent({
  locale,
  packagesInquiryId = null,
  packagesInquirySource = null,
}: {
  locale: Locale
  packagesInquiryId?: string | null
  packagesInquirySource?: string | null
}) {
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

          <div className="mt-8 grid gap-8 lg:mt-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-x-12 lg:gap-y-5 lg:items-start">
            {/* Visit introduction */}
            <div className="max-w-xl space-y-5 lg:col-start-1 lg:row-start-1">
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

              <h1 className="text-center font-serif text-5xl leading-[0.92] text-[#241d17] sm:text-6xl lg:text-7xl">
                {locale === 'es' ? (
                  <>
                    Conoce el espacio. <span className="italic text-[#8d672b]">Imagina</span> tu día.
                  </>
                ) : (
                  <>
                    See the room. <span className="italic text-[#8d672b]">Picture</span> your day.
                  </>
                )}
              </h1>
              <p className="mx-auto max-w-lg text-center text-base leading-7 text-[#665a4e] sm:text-lg">{text.intro}</p>

              <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-[#b98a3d]/25 bg-[#faf6ef] px-3.5 py-1 text-xs font-medium text-[#8d672b]">
                <Calendar size={13} />
                <span>{text.pill}</span>
              </div>

            </div>

            {/* Booking form */}
            <div className="space-y-6 lg:col-start-2 lg:row-span-3 lg:row-start-1">
              <TourRequestForm
                locale={locale}
                packagesInquiryId={packagesInquiryId}
                packagesInquirySource={packagesInquirySource}
              />
            </div>

            {/* Contact cards remain beneath booking on mobile and move below the map on desktop. */}
            <div className="lg:col-start-1 lg:row-start-3">
              <TourPageActions locale={locale} />
            </div>

            {/* Map follows the contact cards on mobile and sits between intro and contacts on desktop. */}
            <div className="lg:col-start-1 lg:row-start-2">
              {mapCard}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
