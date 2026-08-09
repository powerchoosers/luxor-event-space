import Link from 'next/link'
import type { Metadata } from 'next'
import { Clock, MapPin } from 'lucide-react'
import { TourRequestForm } from '@/components/TourRequestForm'

export const metadata: Metadata = {
  title: 'Solicita un recorrido | Luxor at Las Palmas Events',
  description: 'Elige una hora para conocer Luxor at Las Palmas Events y conversar sobre tu celebración.',
  alternates: { canonical: '/es/tour', languages: { en: '/tour', es: '/es/tour' } },
}

export default function SpanishTourPage() {
  return (
    <main lang="es" className="min-h-screen bg-[#f4efe7] pt-28 text-[#241d17]">
      <section className="px-5 pb-16 pt-14 sm:px-6 sm:pt-20 lg:px-8 lg:pb-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="max-w-xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-[#8d672b]">Recorridos privados</p>
            <h1 className="mt-5 font-serif text-5xl leading-[0.94] sm:text-6xl">Ven a imaginar tu celebración.</h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-[#665a4e] sm:text-lg">Elige una hora disponible y cuéntanos qué estás planeando. Confirmaremos tu visita y te explicaremos el espacio, los paquetes y los próximos pasos.</p>
            <div className="mt-8 space-y-4 border-t border-[#b98a3d]/25 pt-6 text-sm text-[#665a4e]"><p className="flex items-center gap-3"><MapPin size={16} className="text-[#b98a3d]" />803 Castroville Rd #402, San Antonio, TX 78237</p><p className="flex items-center gap-3"><Clock size={16} className="text-[#b98a3d]" />Recorridos privados de 30 minutos</p><Link href="/tour" className="font-semibold text-[#8d672b] underline underline-offset-4">Ver en English</Link></div>
          </div>
          <TourRequestForm locale="es" />
        </div>
      </section>
    </main>
  )
}
