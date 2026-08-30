import Link from 'next/link'
import { Clock, MapPin } from 'lucide-react'
import { TourGallery } from '@/components/TourGallery'
import { TourPageActions } from '@/components/TourPageActions'
import { TourRequestForm } from '@/components/TourRequestForm'

type Locale = 'en' | 'es'

const copy = {
  en: {
    eyebrow: 'Private venue tours',
    heading: 'See the room. Picture your day.',
    intro: 'Choose an available time and tell us what you are planning. We will confirm the visit and help you understand the space, packages, and next steps.',
    duration: '30-minute private tours by appointment',
    languageLead: 'Español disponible',
    languageLink: 'Ver en español',
    languageHref: '/es/tour',
    mapTitle: 'Luxor at Las Palmas Events location map',
    mapLead: 'Find us at 803 Castroville Rd #402',
  },
  es: {
    eyebrow: 'Recorridos privados del lugar',
    heading: 'Conoce el espacio. Imagina tu día.',
    intro: 'Elige una hora disponible y cuéntanos qué estás planeando. Confirmaremos tu visita y te ayudaremos a conocer el espacio, los paquetes y los próximos pasos.',
    duration: 'Recorridos privados de 30 minutos con cita previa',
    languageLead: 'Inglés disponible',
    languageLink: 'Ver en inglés',
    languageHref: '/tour',
    mapTitle: 'Mapa de Luxor at Las Palmas Events',
    mapLead: 'Visítanos en 803 Castroville Rd #402',
  },
} as const

const googleMapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=803+Castroville+Rd+%23402%2C+San+Antonio%2C+TX+78237'
const appleMapsUrl = 'http://maps.apple.com/?address=803%20Castroville%20Rd%20%23402%2C%20San%20Antonio%2C%20TX%2078237'

export function TourPageContent({ locale }: { locale: Locale }) {
  const text = copy[locale]

  return (
    <main lang={locale} className="min-h-screen bg-[#f4efe7] pt-28 text-[#241d17]">
      <section className="px-5 pb-16 sm:px-6 lg:px-8 lg:pb-24">
        <div className="mx-auto max-w-7xl">
          <TourGallery locale={locale} />
          <div className="mt-10 grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div className="max-w-xl">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-[#8d672b]">{text.eyebrow}</p>
              <h1 className="mt-5 font-serif text-5xl leading-[0.94] sm:text-6xl">{text.heading}</h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-[#665a4e] sm:text-lg">{text.intro}</p>
              <div className="mt-8 space-y-4 border-t border-[#b98a3d]/25 pt-6 text-sm text-[#665a4e]">
                <div className="flex items-start gap-3">
                  <MapPin size={16} className="mt-0.5 text-[#b98a3d]" />
                  <span>
                    803 Castroville Rd #402, San Antonio, TX 78237
                    <span className="mt-2 flex gap-3 text-xs">
                      <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-[#8d672b]">Google Maps</a>
                      <a href={appleMapsUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-[#8d672b]">Apple Maps</a>
                    </span>
                  </span>
                </div>
                <p className="flex items-center gap-3"><Clock size={16} className="text-[#b98a3d]" />{text.duration}</p>
                <TourPageActions locale={locale} />
              </div>
              <div className="mt-8 text-xs text-[#827567]">
                {text.languageLead} · <Link href={text.languageHref} className="font-semibold text-[#8d672b] underline underline-offset-4">{text.languageLink}</Link>
              </div>
            </div>
            <div>
              <TourRequestForm locale={locale} />
              <div className="mt-6 overflow-hidden rounded-2xl border border-[#b98a3d]/25 bg-white shadow-[0_25px_80px_-44px_rgba(56,38,20,0.45)]">
                <iframe title={text.mapTitle} src="https://www.google.com/maps?q=803+Castroville+Rd+%23402,+San+Antonio,+TX+78237&output=embed" className="h-64 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-[#665a4e]">
                  <span>{text.mapLead}</span>
                  <span className="flex gap-3">
                    <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">Google Maps</a>
                    <a href={appleMapsUrl} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">Apple Maps</a>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
