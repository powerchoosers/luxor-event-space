'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Baby, Briefcase, Cake, Check, Heart } from 'lucide-react'
import { Reveal } from '@/components/Reveal'
import { LuxorAxisLockup } from '@/components/LuxorWordmark'

const eventTypes = [
  {
    title: 'Weddings',
    copy: 'A polished room for ceremony moments, dinner, portraits, speeches, and dancing.',
    image: '/pricing-hero.png',
    icon: Heart,
    points: ['Ceremony and reception flow', 'Photo-ready room details', 'Dinner and dance floor planning'],
  },
  {
    title: 'Quinceañeras',
    copy: 'A dramatic setting for a grand entrance, court seating, cake, family photos, and dancing.',
    image: '/tour-header.png',
    icon: Cake,
    points: ['Grand entrance planning', 'Court and family seating', 'Feature moments for photos'],
  },
  {
    title: 'Baby showers',
    copy: 'A warm, elegant backdrop for lunch, gifts, photos, and a room that feels finished.',
    image: '/baby-shower.png',
    icon: Baby,
    points: ['Gift and dessert tables', 'Comfortable guest layout', 'Soft decor compatibility'],
  },
  {
    title: 'Corporate events',
    copy: 'A formal space for awards, company dinners, networking nights, and milestone events.',
    image: '/corporate.png',
    icon: Briefcase,
    points: ['Dinner and presentation flow', 'Networking layouts', 'Awards and company moments'],
  },
]

const planningSignals = [
  ['Guest arrival', 'Where guests enter, gather, sign in, and find the main room.'],
  ['Main moment', 'Ceremony, entrance, toast, awards, cake, or first dance.'],
  ['Dinner flow', 'How tables, service paths, speeches, and family seating work together.'],
  ['Photo plan', 'Where the best backdrop moments should happen before the room gets busy.'],
  ['Party energy', 'How music, dancing, lighting, and late-night movement should feel.'],
  ['Vendor setup', 'What your planner, decorator, DJ, caterer, and photographer need to know.'],
]

export default function EventsPage() {
  return (
    <main className="overflow-x-hidden bg-[#050505] text-[#f7efe3]">
      <section className="relative isolate overflow-hidden px-5 pb-16 pt-36 sm:px-6 lg:px-8 lg:pb-24 lg:pt-44">
        <Image src="/tour-header.png" alt="Luxor event room prepared for guests" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,5,0.94),rgba(5,5,5,0.72)_48%,rgba(5,5,5,0.42)),linear-gradient(180deg,rgba(5,5,5,0.5),#050505_92%)]" />
        <div className="absolute inset-0 luxor-noise opacity-[0.18]" />

        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="mx-auto max-w-4xl text-center">
            <LuxorAxisLockup className="mx-auto mb-8 w-full max-w-[360px] sm:max-w-[460px]" />
            <h1 className="font-serif text-5xl leading-[0.9] sm:text-6xl lg:text-8xl">
              Event types that fit the room.
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-[#d7c29a]/78 sm:text-lg">
              Luxor is built for celebrations that need a strong backdrop, simple guest flow, and enough polish before the decor even arrives.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/visit" className="inline-flex items-center justify-center gap-2 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-[#050505]">
                Request a tour <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/pricing" className="inline-flex items-center justify-center rounded-md border border-[#caa24c]/32 bg-black/35 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#f7efe3]">
                View packages
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#080706] py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">Celebrations</p>
            <h2 className="mt-4 font-serif text-4xl leading-[0.95] sm:text-5xl lg:text-6xl">Choose the occasion. Shape the layout.</h2>
          </Reveal>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {eventTypes.map((event, index) => {
              const Icon = event.icon

              return (
                <Reveal key={event.title} delay={index * 70}>
                  <article className="grid overflow-hidden rounded-md border border-[#caa24c]/22 bg-[#0a0807] shadow-[0_34px_90px_-62px_rgba(0,0,0,1)] sm:grid-cols-[0.92fr_1.08fr]">
                    <div className="relative min-h-72 sm:min-h-full">
                      <Image src={event.image} alt={event.title} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.52))]" />
                    </div>
                    <div className="p-6 sm:p-8">
                      <Icon className="h-6 w-6 text-[#caa24c]" />
                      <h3 className="mt-5 font-serif text-4xl leading-none text-[#f7efe3]">{event.title}</h3>
                      <p className="mt-4 text-sm leading-6 text-[#d7c29a]/72 sm:text-base">{event.copy}</p>
                      <ul className="mt-6 grid gap-3">
                        {event.points.map((point) => (
                          <li key={point} className="flex items-center gap-3 text-sm text-[#d7c29a]/78">
                            <Check className="h-4 w-4 shrink-0 text-[#caa24c]" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-[#120d0c] py-16 sm:py-24 lg:py-28">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_12%,rgba(202,162,76,0.12),transparent_22rem),radial-gradient(circle_at_88%_20%,rgba(189,101,117,0.14),transparent_20rem)]" />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <Reveal>
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">Event planning</p>
            <h2 className="mt-4 font-serif text-4xl leading-[0.95] sm:text-5xl lg:text-6xl">
              Make the event feel easier to picture.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#d7c29a]/72">
              Before you book, the important questions are practical: how the room flows, how the big moments land, and what needs to be solved before event day.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="grid gap-3 sm:grid-cols-2">
              {planningSignals.map(([title, copy]) => (
                <article key={title} className="rounded-md border border-[#caa24c]/18 bg-black/24 p-5">
                  <h3 className="font-serif text-2xl leading-none text-[#f7efe3]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#d7c29a]/68">{copy}</p>
                </article>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-[#050505] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal>
            <div className="luxor-panel grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:p-10">
              <div className="max-w-3xl">
                <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">Next step</p>
                <h2 className="mt-4 font-serif text-4xl leading-[0.95] text-white sm:text-5xl">
                  Bring the event idea. We will pressure-test the room around it.
                </h2>
                <p className="mt-5 text-base leading-7 text-white/72">
                  A tour is where you check the practical details: guest count, table shape, entrance, photos, DJ placement, package fit, and the exact feeling you want guests to have.
                </p>
              </div>
              <Link href="/visit" className="inline-flex items-center justify-center gap-2 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-[#050505]">
                Plan a tour <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
