'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Camera, DoorOpen, Music, Utensils } from 'lucide-react'
import { Reveal } from '@/components/Reveal'
import { LuxorAxisLockup } from '@/components/LuxorWordmark'

const zones = [
  ['Arrival', 'A clear first impression for guests as they enter the room.', DoorOpen],
  ['Dinner', 'Table layouts that keep speeches, service, and movement simple.', Utensils],
  ['Photos', 'Dark, gold, and neutral details that hold up well in pictures.', Camera],
  ['Dance', 'A room plan that leaves space for music, movement, and celebration.', Music],
] as const

const spaceDetails = [
  ['Sightlines', 'Where guests can see the couple, quinceañera court, speaker, cake, awards, or main table.'],
  ['Vendor access', 'The practical path for setup, teardown, music, decor, food, and photography.'],
  ['Photo moments', 'The places that should look intentional before guests start moving through the room.'],
  ['Guest comfort', 'How the layout feels during arrival, dinner, speeches, dancing, and exits.'],
]

export default function SpacesPage() {
  return (
    <main className="overflow-x-hidden bg-[#050505] text-[#f7efe3]">
      <section className="relative isolate overflow-hidden bg-[radial-gradient(circle_at_78%_10%,rgba(189,101,117,0.18),transparent_24rem),linear-gradient(180deg,#120d0c,#050505)] px-5 pb-16 pt-36 sm:px-6 lg:px-8 lg:pb-24 lg:pt-44">
        <div className="absolute inset-0 luxor-noise opacity-[0.16]" />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div className="mx-auto max-w-2xl text-center">
            <LuxorAxisLockup className="mx-auto mb-8 w-full max-w-[360px] sm:max-w-[460px]" />
            <h1 className="font-serif text-5xl leading-[0.9] sm:text-6xl lg:text-8xl">
              A room made to be understood in person.
            </h1>
            <p className="mx-auto mt-7 max-w-xl text-base leading-7 text-[#d7c29a]/78 sm:text-lg">
              Photos help, but the important part is the flow: where guests enter, where dinner happens, where photos land, and where the party opens up.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/visit" className="inline-flex items-center justify-center gap-2 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-[#050505]">
                Walk the space <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/gallery" className="inline-flex items-center justify-center rounded-md border border-[#caa24c]/32 bg-black/35 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#f7efe3]">
                See gallery
              </Link>
            </div>
          </div>

          <div>
            <figure className="luxor-deco-frame relative min-h-[520px] overflow-hidden rounded-md border border-[#caa24c]/25 shadow-[0_40px_110px_-50px_rgba(0,0,0,0.95)]">
              <Image src="/images/dining-hall/main-hall-wedding-wide.png" alt="Luxor main hall reception layout" fill priority sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.44))]" />
            </figure>
          </div>
        </div>
      </section>

      <section className="border-y border-[#caa24c]/16 bg-[#080706] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">Room flow</p>
            <h2 className="mt-4 font-serif text-4xl leading-[0.95] sm:text-5xl lg:text-6xl">Think in zones, not just square footage.</h2>
          </Reveal>

          <div className="mt-12 grid gap-4 md:grid-cols-4">
            {zones.map(([title, copy, Icon], index) => (
              <Reveal key={title} delay={index * 70}>
                <article className="h-full rounded-md border border-[#caa24c]/20 bg-white/[0.025] p-6">
                  <Icon className="h-6 w-6 text-[#caa24c]" />
                  <h3 className="mt-6 font-serif text-3xl text-[#f7efe3]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#d7c29a]/70">{copy}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#caa24c]/16 bg-[#0a0807] py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">The Luxor Lounge</p>
            <h2 className="mt-4 font-serif text-4xl leading-[0.95] sm:text-5xl lg:text-6xl">A darker room for cocktails, conversation, and quieter moments.</h2>
            <p className="mx-auto mt-6 max-w-2xl text-sm leading-7 text-[#d7c29a]/72 sm:text-base">
              The lounge gives hosts a separate setting for arrivals, drinks, family time, private celebrations, or a change of pace away from the main hall.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-4 lg:grid-cols-12 lg:auto-rows-[19rem]">
            <Reveal className="lg:col-span-7 lg:row-span-2" variant="scale" amount={18}>
              <figure className="relative h-full min-h-[30rem] overflow-hidden rounded-md border border-[#caa24c]/22">
                <Image src="/images/luxor-lounge/luxor-lounge-empty.png" alt="The Luxor Lounge furnished with cocktail tables and seating" fill sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(0,0,0,0.72))]" />
                <figcaption className="absolute bottom-5 left-5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#fff2bf]">Cocktail-ready layout</figcaption>
              </figure>
            </Reveal>
            <Reveal className="lg:col-span-5" delay={90} variant="scale" amount={18}>
              <figure className="relative h-full min-h-[19rem] overflow-hidden rounded-md border border-[#caa24c]/22">
                <Image src="/images/luxor-lounge/luxor-lounge-family.png" alt="Family gathering inside The Luxor Lounge" fill sizes="(min-width: 1024px) 42vw, 100vw" className="object-cover" />
              </figure>
            </Reveal>
            <Reveal className="lg:col-span-5" delay={150} variant="scale" amount={18}>
              <figure className="relative h-full min-h-[19rem] overflow-hidden rounded-md border border-[#caa24c]/22">
                <Image src="/images/luxor-lounge/luxor-lounge-corporate.png" alt="Networking reception inside The Luxor Lounge" fill sizes="(min-width: 1024px) 42vw, 100vw" className="object-cover" />
              </figure>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="bg-[#050505] py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8">
          <Reveal>
            <div className="relative aspect-[4/5] overflow-hidden rounded-md border border-[#caa24c]/22 sm:aspect-[16/11] lg:aspect-[5/6]">
              <Image src="/images/dining-hall/main-hall-conversation-candid.png" alt="Guests seated inside the Luxor main hall" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.54))]" />
            </div>
          </Reveal>

          <Reveal delay={120}>
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">Tour details</p>
            <h2 className="mt-4 font-serif text-4xl leading-[0.95] sm:text-5xl lg:text-6xl">
              Get the room questions answered before the phone call.
            </h2>
            <div className="mt-8 divide-y divide-[#caa24c]/16 border-y border-[#caa24c]/16">
              {spaceDetails.map(([title, copy]) => (
                <div key={title} className="grid gap-3 py-5 sm:grid-cols-[10rem_1fr]">
                  <h3 className="font-serif text-2xl leading-none text-[#f7efe3]">{title}</h3>
                  <p className="text-sm leading-6 text-[#d7c29a]/70 sm:text-base">{copy}</p>
                </div>
              ))}
            </div>
            <Link href="/visit" className="mt-8 inline-flex items-center justify-center gap-2 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-[#050505]">
              Schedule a walkthrough <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
