import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Luxor at Las Palmas Events | Bodas y celebraciones en San Antonio',
  description: 'Un espacio moderno para bodas, quinceañeras y celebraciones privadas en San Antonio.',
  alternates: { canonical: '/es' },
}

export default function SpanishHomePage() {
  return (
    <main lang="es" className="bg-[#050505] text-[#f6efe8]">
      <section className="mx-auto flex min-h-[72vh] max-w-6xl flex-col justify-center px-6 py-24 text-center sm:px-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[#caa24c]">Luxor at Las Palmas Events</p>
        <h1 className="mx-auto mt-6 max-w-4xl font-serif text-5xl leading-[0.98] text-[#f7efe3] sm:text-7xl">Un espacio para celebrar lo que importa.</h1>
        <p className="mx-auto mt-7 max-w-2xl text-base leading-8 text-[#d7c29a]/80">Conoce nuestro espacio en San Antonio para bodas, quinceañeras y celebraciones privadas. Estamos aquí para ayudarte a imaginar tu día.</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/es/tour" className="rounded-md bg-[#caa24c] px-6 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-[#100d08]">Solicitar un recorrido</Link>
          <Link href="/" className="rounded-md border border-[#caa24c]/35 px-6 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-[#f1d27a]">English</Link>
        </div>
      </section>
    </main>
  )
}
