import Link from 'next/link'
import type { Metadata } from 'next'
import { Clock, MapPin, Phone } from 'lucide-react'
import { TourRequestForm } from '@/components/TourRequestForm'

export const metadata: Metadata = {
  title: 'Schedule a Private Tour | Luxor at Las Palmas Events',
  description: 'Choose a time to see Luxor at Las Palmas Events in person and talk through your celebration plans.',
  alternates: { canonical: '/tour', languages: { en: '/tour', es: '/es/tour' } },
}

export default function TourPage() {
  return (
    <main className="min-h-screen bg-[#f4efe7] pt-28 text-[#241d17]">
      <section className="px-5 pb-16 pt-14 sm:px-6 sm:pt-20 lg:px-8 lg:pb-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="max-w-xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-[#8d672b]">Private venue tours</p>
            <h1 className="mt-5 font-serif text-5xl leading-[0.94] sm:text-6xl">See the room. Picture your day.</h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-[#665a4e] sm:text-lg">
              Choose an available time and tell us what you are planning. We will confirm the visit and help you understand the space, packages, and next steps.
            </p>
            <div className="mt-8 space-y-4 border-t border-[#b98a3d]/25 pt-6 text-sm text-[#665a4e]">
              <a href="https://www.google.com/maps/dir/?api=1&destination=803+Castroville+Rd+%23402%2C+San+Antonio%2C+TX+78237" target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:text-[#8d672b]"><MapPin size={16} className="text-[#b98a3d]" />803 Castroville Rd #402, San Antonio, TX 78237</a>
              <p className="flex items-center gap-3"><Clock size={16} className="text-[#b98a3d]" />30-minute private tours by appointment</p>
              <Link href="/" className="flex items-center gap-3 hover:text-[#8d672b]"><Phone size={16} className="text-[#b98a3d]" />Questions first? Call or return to the main site.</Link>
            </div>
            <div className="mt-8 text-xs text-[#827567]">Español disponible · <Link href="/es/tour" className="font-semibold text-[#8d672b] underline underline-offset-4">Ver en español</Link></div>
          </div>
          <TourRequestForm locale="en" />
        </div>
      </section>
    </main>
  )
}
