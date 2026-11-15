import type { Metadata } from 'next'
import Link from 'next/link'
import { buildLuxorBilingualAlternates } from '@/lib/luxorPublicHreflang'

export const metadata: Metadata = {
  title: {
    absolute: 'Salón para quinceañeras en San Antonio | Luxor at Las Palmas',
  },
  description:
    'Espacio en San Antonio para quinceañeras, bodas y celebraciones privadas. Conoce Luxor at Las Palmas y agenda tu visita.',
  alternates: buildLuxorBilingualAlternates('/es', '/', '/es'),
}

export default function SpanishHomePage() {
  return (
    <main lang="es" className="bg-[#050505] text-[#f6efe8]">
      <section className="mx-auto flex min-h-[72vh] max-w-6xl flex-col justify-center px-6 py-24 text-center sm:px-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[#caa24c]">Luxor at Las Palmas Events</p>
        <h1 className="mx-auto mt-6 max-w-4xl font-serif text-5xl leading-[0.92] text-[#f7efe3] sm:text-6xl lg:text-7xl">
          Un espacio para celebrar lo que <span className="italic text-[#f1d27a]">importa</span>.
        </h1>
        <p className="mx-auto mt-7 max-w-2xl text-base leading-8 text-[#d7c29a]/80">Conoce nuestro espacio en San Antonio para bodas, quinceañeras y celebraciones privadas. Estamos aquí para ayudarte a imaginar tu día.</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/es/visit" className="luxor-gold-raised rounded-md px-6 py-3 text-[11px] uppercase tracking-[0.16em]">Agendar una visita</Link>
          <Link href="/" className="rounded-md border border-[#caa24c]/35 px-6 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-[#f1d27a]">English</Link>
        </div>
      </section>
    </main>
  )
}
