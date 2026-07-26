import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Check, Users } from 'lucide-react'
import { Reveal } from '@/components/Reveal'
import { PublicFaqList } from '@/components/PublicFaqList'
import { LUXOR_PUBLIC_EVENT_PAGES, getLuxorPublicEventPage } from '@/lib/luxorPublicContent'

export function generateStaticParams() {
  return LUXOR_PUBLIC_EVENT_PAGES.map(({ slug }) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const event = getLuxorPublicEventPage((await params).slug)
  if (!event) return {}
  return {
    title: `${event.name} at Luxor Event Space | San Antonio`,
    description: event.introduction,
  }
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const event = getLuxorPublicEventPage((await params).slug)
  if (!event) notFound()

  const visitHref = `/visit?event=${encodeURIComponent(event.singular)}`

  return (
    <main className="overflow-x-hidden bg-[#050505] text-[#f7efe3]">
      <section className="relative isolate min-h-[82svh] overflow-hidden pt-28">
        <Image src={event.heroImage} alt={`${event.name} at Luxor Event Space`} fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,5,.96),rgba(5,5,5,.72)_54%,rgba(5,5,5,.28)),linear-gradient(180deg,rgba(5,5,5,.36),#050505_96%)]" />
        <div className="absolute inset-0 luxor-noise opacity-20" />
        <div className="relative z-10 mx-auto flex min-h-[calc(82svh-7rem)] max-w-7xl items-center px-5 py-14 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#f1d27a]">{event.eyebrow}</p>
            <h1 className="mt-5 font-serif text-5xl leading-[.9] sm:text-7xl lg:text-8xl">{event.headline}</h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-[#eadcc8]/82 sm:text-lg">{event.introduction}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={visitHref} data-conversion="tour_cta_click" data-conversion-label={`${event.name} hero`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#caa24c] px-6 py-3 text-sm font-bold uppercase tracking-[.14em] text-[#050505]">
                Check tour times <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/pricing" className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#caa24c]/40 bg-black/35 px-6 py-3 text-sm font-semibold uppercase tracking-[.14em]">See rates</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#caa24c]/16 bg-[#0b0908]">
        <div className="mx-auto grid max-w-7xl gap-px bg-[#caa24c]/16 sm:grid-cols-3">
          {[['Capacity', 'Up to 200 guests'], ['Tours', 'Private appointments'], ['Location', 'San Antonio, Texas']].map(([label, value]) => (
            <div key={label} className="bg-[#0b0908] px-6 py-7 text-center"><p className="font-mono text-xs uppercase tracking-[.24em] text-[#caa24c]">{label}</p><p className="mt-2 font-serif text-2xl">{value}</p></div>
          ))}
        </div>
      </section>

      <section className="bg-[#080706] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl"><p className="font-mono text-xs uppercase tracking-[.28em] text-[#caa24c]">The experience</p><h2 className="mt-4 font-serif text-4xl leading-none sm:text-6xl">Plan the story, not just the tables.</h2></Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {event.moments.map((moment, index) => <Reveal key={moment.title} delay={index * 80}><article className="h-full border-t border-[#caa24c]/35 py-6"><span className="font-serif text-3xl text-[#caa24c]">0{index + 1}</span><h3 className="mt-5 font-serif text-3xl">{moment.title}</h3><p className="mt-3 text-sm leading-6 text-[#d7c29a]/72">{moment.copy}</p></article></Reveal>)}
          </div>
        </div>
      </section>

      <section className="bg-[#120d0c] py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <Reveal><div className="relative aspect-[4/3] overflow-hidden rounded-md border border-[#caa24c]/24"><Image src={event.secondaryImage} alt={`${event.name} planning inspiration`} fill sizes="(min-width:1024px) 50vw,100vw" className="object-cover" /></div></Reveal>
          <Reveal delay={100}>
            <p className="font-mono text-xs uppercase tracking-[.28em] text-[#caa24c]">Your walkthrough</p>
            <h2 className="mt-4 font-serif text-4xl leading-none sm:text-6xl">See the decisions in the room.</h2>
            <p className="mt-5 text-base leading-7 text-[#d7c29a]/72">Bring your target date, guest range, and the moments you care about. During the tour, focus on:</p>
            <ul className="mt-7 space-y-4">{event.walkthrough.map((item) => <li key={item} className="flex gap-3 border-t border-[#caa24c]/16 pt-4 text-[#eadcc8]/82"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#caa24c]" />{item}</li>)}</ul>
          </Reveal>
        </div>
      </section>

      <section className="bg-[#080706] py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:px-8">
          <Reveal><Users className="h-6 w-6 text-[#caa24c]" /><h2 className="mt-5 font-serif text-4xl leading-none sm:text-6xl">Questions worth asking before you book.</h2></Reveal>
          <Reveal delay={100}><PublicFaqList items={event.faqs} /></Reveal>
        </div>
      </section>

      <section className="bg-[#050505] px-5 py-16 sm:px-6 sm:py-24 lg:px-8"><Reveal><div className="luxor-panel mx-auto flex max-w-7xl flex-col gap-7 p-7 sm:p-10 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-mono text-xs uppercase tracking-[.28em] text-[#caa24c]">Next step</p><h2 className="mt-3 max-w-3xl font-serif text-4xl leading-none sm:text-5xl">Walk through Luxor with your {event.singular.toLowerCase()} in mind.</h2></div><Link href={visitHref} data-conversion="tour_cta_click" data-conversion-label={`${event.name} footer`} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-[#caa24c] px-6 py-3 text-sm font-bold uppercase tracking-[.14em] text-[#050505]">Check tour times <ArrowRight className="h-4 w-4" /></Link></div></Reveal></section>
    </main>
  )
}
