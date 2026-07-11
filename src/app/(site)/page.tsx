'use client'

import { ArrowDown, ArrowRight, CalendarDays, Check, MapPin } from 'lucide-react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { Reveal } from '@/components/Reveal'
import { LuxorAxisLockup } from '@/components/LuxorWordmark'
import { LuxorInquiryForm } from '@/components/LuxorInquiryForm'

type EventCard = {
  title: string
  copy: string
  imageSrc: string
  details: string[]
}

const eventCards: EventCard[] = [
  {
    title: 'Weddings',
    copy: 'A polished room for ceremony moments, dinner, portraits, and dancing.',
    imageSrc: '/images/dining-hall/main-hall-wedding-dance-candid.png',
    details: ['Ceremony flow', 'Reception layout', 'Photo moments'],
  },
  {
    title: 'Quinceañeras',
    copy: 'A dramatic setting for the grand entrance, court seating, cake, and family photos.',
    imageSrc: '/images/dining-hall/main-hall-quinceanera-angle.png',
    details: ['Grand entrance', 'Court seating', 'Family photos'],
  },
  {
    title: 'Private celebrations',
    copy: 'Warm enough for showers and birthdays, refined enough for milestone dinners.',
    imageSrc: '/images/luxor-lounge/luxor-lounge-baby-shower.png',
    details: ['Baby showers', 'Birthdays', 'Anniversaries'],
  },
  {
    title: 'Corporate events',
    copy: 'A formal backdrop for awards, dinners, networking, and company gatherings.',
    imageSrc: '/images/luxor-lounge/luxor-lounge-corporate.png',
    details: ['Awards', 'Networking', 'Dinner service'],
  },
]

const planningSteps = [
  ['Tour the room', 'Walk the space and picture your guest flow.'],
  ['Shape the layout', 'Talk through seating, photos, timing, and style.'],
  ['Celebrate', 'Arrive to a room prepared for your event.'],
]

const tourPrepPoints = [
  'Confirm your guest flow',
  'Talk through package fit',
  'Check date availability',
  'Picture photos, dinner, and dancing',
]

const tourPrepCards = [
  ['Bring', 'Guest range, target dates, and any must-have moments.'],
  ['Ask', 'Layout, timing, decor, package options, and next steps.'],
]

const faqs = [
  [
    'How do I check my date?',
    'Request a tour with your preferred date or month. The Luxor team will follow up with availability.',
  ],
  [
    'Can the room be personalized?',
    'Yes. The dark, gold, and neutral foundation is made to work with florals, signage, and cultural details.',
  ],
  [
    'Where do I see packages?',
    'Start with the pricing page, then confirm the details that fit your event during a private tour.',
  ],
]

function SectionIntro({
  label,
  title,
  copy,
  center = false,
}: {
  label: string
  title: string
  copy?: string
  center?: boolean
}) {
  return (
    <div className={`max-w-3xl ${center ? 'mx-auto text-center' : ''}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">{label}</p>
      <h2 className="mt-4 font-serif text-4xl leading-[0.95] text-[#f7efe3] sm:text-5xl lg:text-6xl">
        {title}
      </h2>
      {copy ? <p className="mt-5 max-w-2xl text-base leading-7 text-[#d7c29a]/72">{copy}</p> : null}
    </div>
  )
}

function PrimaryButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <motion.a
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      href={href}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.16em] text-[#050505] shadow-[0_22px_44px_-26px_rgba(202,162,76,0.8)] sm:text-sm"
    >
      {children}
      <ArrowRight className="h-4 w-4 shrink-0" />
    </motion.a>
  )
}

function CenteredLuxorLockup() {
  return (
    <LuxorAxisLockup className="mx-auto w-full max-w-[360px] sm:max-w-[460px]" />
  )
}

function EventCardView({ event }: { event: EventCard }) {
  return (
    <article className="overflow-hidden rounded-md border border-[#caa24c]/22 bg-[#0a0807] shadow-[0_34px_90px_-62px_rgba(0,0,0,1)]">
      <div className="relative aspect-[4/3]">
        <Image src={event.imageSrc} alt={event.title} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.52))]" />
      </div>
      <div className="p-6 sm:p-7">
        <h3 className="font-serif text-3xl leading-none text-[#f7efe3]">{event.title}</h3>
        <p className="mt-3 text-sm leading-6 text-[#d7c29a]/72">{event.copy}</p>
        <ul className="mt-5 grid gap-2">
          {event.details.map((detail) => (
            <li key={detail} className="flex items-center gap-3 text-sm text-[#d7c29a]/75">
              <Check className="h-4 w-4 shrink-0 text-[#caa24c]" />
              {detail}
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}

export default function Home() {
  return (
    <main id="top" className="overflow-x-hidden bg-[#050505] text-[#f7efe3]">
      <section id="hero" className="relative isolate min-h-[92svh] overflow-hidden pt-28 sm:min-h-screen">
        <Image
          src="/images/dining-hall/main-hall-wedding-wide.png"
          alt="Luxor main hall prepared for a wedding reception"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,5,0.94),rgba(5,5,5,0.66)_48%,rgba(5,5,5,0.28)),linear-gradient(180deg,rgba(5,5,5,0.5),rgba(5,5,5,0.9)_88%)]" />
        <div className="absolute inset-0 luxor-noise opacity-[0.18]" />

        <div className="relative z-10 mx-auto flex min-h-[calc(92svh-7rem)] max-w-7xl items-center justify-center px-5 pb-14 pt-8 text-center sm:min-h-[calc(100vh-7rem)] sm:px-6 lg:px-8">
          <div className="w-full min-w-0 max-w-5xl">
            <CenteredLuxorLockup />
            <h1 className="mx-auto mt-8 max-w-[22rem] text-wrap font-serif text-4xl leading-[0.92] text-[#f7efe3] sm:max-w-4xl sm:text-6xl lg:text-7xl">
              San Antonio celebrations with a room that already feels special.
            </h1>
            <p className="mx-auto mt-6 max-w-[22rem] text-base leading-7 text-[#d7c29a]/82 sm:max-w-2xl sm:text-lg">
              Weddings, quinceañeras, showers, and private events in an elegant dark-and-gold venue made for photos, dinner, and dancing.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
              <PrimaryButton href="#visit">Request a tour</PrimaryButton>
              <a
                href="#events"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#caa24c]/35 bg-black/35 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#f7efe3] backdrop-blur-sm transition hover:border-[#f1d27a]/60 sm:text-sm"
              >
                See event types
              </a>
            </div>
            <div className="mx-auto mt-7 flex max-w-md items-start justify-center gap-3 text-sm leading-6 text-[#d7c29a]/72">
              <MapPin className="mt-1 h-4 w-4 shrink-0 text-[#caa24c]" />
              <span>Private venue tours at 803 Castroville Rd #402, San Antonio, TX 78237.</span>
            </div>
            <a
              href="#events"
              className="mx-auto mt-8 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#d7c29a]/68 transition-colors hover:text-[#f1d27a]"
            >
              Scroll to explore <ArrowDown className="h-3.5 w-3.5 animate-bounce text-[#caa24c]" />
            </a>
          </div>
        </div>
      </section>

      <section aria-label="Venue highlights" className="border-y border-[#caa24c]/18 bg-[#0b0908]">
        <div className="mx-auto grid max-w-7xl divide-y divide-[#caa24c]/16 px-5 sm:grid-cols-4 sm:divide-x sm:divide-y-0 sm:px-6 lg:px-8">
          {[
            ['Events', 'Weddings and private parties'],
            ['Tours', 'Private appointments'],
            ['Style', 'Dark-and-gold setting'],
            ['Location', '803 Castroville Rd #402'],
          ].map(([label, value], index) => (
            <Reveal key={label} delay={index * 70} variant="scale" amount={16}>
              <div className="px-3 py-5 text-center sm:px-5 sm:py-7">
                <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#caa24c]">{label}</p>
                <p className="mt-2 text-sm leading-5 text-[#f7efe3] sm:font-serif sm:text-xl">{value}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="events" className="relative isolate overflow-hidden bg-[#080706] py-16 sm:py-24 lg:py-28">
        <div className="absolute inset-0 luxor-noise opacity-[0.14]" />
        <div className="relative z-10 mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal>
            <SectionIntro
              label="Event types"
              title="One venue, shaped around your celebration."
              copy="Choose the event style, then use the room as a polished foundation for flowers, signage, music, photos, and guest flow."
            />
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4">
            {eventCards.map((event, index) => (
              <Reveal key={event.title} delay={index * 90} variant="scale" amount={18}>
                <EventCardView event={event} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="spaces" className="relative isolate overflow-hidden bg-[#120d0c] py-16 sm:py-24 lg:py-28">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_10%,rgba(189,101,117,0.18),transparent_22rem),linear-gradient(180deg,#120d0c,#050505)]" />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <Reveal>
            <div className="relative aspect-[4/5] overflow-hidden rounded-md border border-[#caa24c]/24 sm:aspect-[16/11] lg:aspect-[4/3]">
              <Image src="/images/dining-hall/main-hall-table-candid.png" alt="Guests gathered inside the Luxor main hall" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.44))]" />
            </div>
          </Reveal>

          <Reveal delay={120}>
            <SectionIntro
              label="The room"
              title="Less guessing. More seeing it clearly."
              copy="A tour helps you understand the real flow: entrance, photos, dinner, speeches, and the dance floor."
            />
            <div className="mt-8 grid gap-3">
              {['Arrival and guest welcome', 'Dinner, speeches, and dance flow', 'Photo-ready corners and decor moments'].map((item) => (
                <div key={item} className="flex items-center gap-3 border-t border-[#caa24c]/16 pt-4 text-[#d7c29a]/78">
                  <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-[#caa24c]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section id="experience" className="bg-[#080706] py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal>
            <SectionIntro
              label="Planning"
              title="A simple path to event day."
              center
            />
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {planningSteps.map(([title, copy], index) => (
              <Reveal key={title} delay={index * 80}>
                <article className="rounded-md border border-[#caa24c]/20 bg-white/[0.025] p-6">
                  <div className="flex items-center gap-4">
                    <span className="font-serif text-3xl text-[#caa24c]">{String(index + 1).padStart(2, '0')}</span>
                    <div className="h-px flex-1 bg-[#caa24c]/22" />
                  </div>
                  <h3 className="mt-6 font-serif text-3xl text-[#f7efe3]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#d7c29a]/70">{copy}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="gallery" className="relative isolate overflow-hidden bg-[#050505] py-16 sm:py-24 lg:py-28">
        <div className="absolute inset-0 luxor-noise opacity-[0.16]" />
        <div className="relative z-10 mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal>
            <SectionIntro
              label="Atmosphere"
              title="A room with presence before the decor arrives."
              copy="Use the venue as the starting point, then layer in the details that make the celebration yours."
              center
            />
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['/images/dining-hall/main-hall-wedding-wide.png', 'Main hall reception'],
                ['/images/dining-hall/main-hall-conversation-candid.png', 'Wedding guests in conversation'],
                ['/images/dining-hall/main-hall-side-dance-candid.png', 'Guests dancing in the main hall'],
              ].map(([src, alt], index) => (
                <Reveal key={src} delay={index * 90} variant="scale" amount={18}>
                  <figure className="relative aspect-[4/3] overflow-hidden rounded-md border border-[#caa24c]/22">
                    <Image src={src} alt={alt} fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
                    <div className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.82))]" />
                    <figcaption className="absolute bottom-4 left-1/2 w-52 -translate-x-1/2 rounded-md border border-[#caa24c]/28 bg-black/68 px-3 py-2.5 text-center font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#fff2bf] shadow-[0_16px_44px_-22px_rgba(0,0,0,1)] backdrop-blur-md sm:w-56">
                      {alt}
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-[#caa24c]/14 bg-[#080706] py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <Reveal>
            <SectionIntro
              label="First questions"
              title="What to know before you tour."
            />
          </Reveal>
          <Reveal delay={120}>
            <div className="divide-y divide-[#caa24c]/18 border-y border-[#caa24c]/18">
              {faqs.map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-serif text-xl leading-7 text-[#f7efe3] marker:hidden">
                    {question}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 text-[#caa24c] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="max-w-2xl pt-4 text-sm leading-7 text-[#d7c29a]/68 sm:text-base">{answer}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section id="visit" className="relative isolate overflow-hidden bg-[#120d0c] py-16 sm:py-24 lg:py-28">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(202,162,76,0.14),transparent_22rem),radial-gradient(circle_at_88%_12%,rgba(189,101,117,0.16),transparent_20rem)]" />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:px-8">
          <Reveal>
            <SectionIntro
              label="Private tour"
              title="Come see if the room feels right."
              copy="Tell us the basics. The Luxor team can follow up with availability, package details, and tour options."
            />
            <div className="mt-8 grid gap-3">
              {tourPrepPoints.map((point) => (
                <div key={point} className="flex items-center gap-3 border-t border-[#caa24c]/16 pt-4 text-sm leading-6 text-[#d7c29a]/76">
                  <Check className="h-4 w-4 shrink-0 text-[#caa24c]" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:max-w-xl">
              {tourPrepCards.map(([title, copy], index) => (
                <Reveal key={title} delay={index * 80} variant="scale" amount={14}>
                  <div className="rounded-md border border-[#caa24c]/18 bg-black/20 p-5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#caa24c]">{title}</p>
                    <p className="mt-3 text-sm leading-6 text-[#d7c29a]/70">{copy}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <div className="mt-8 flex items-start gap-3 text-sm leading-6 text-[#d7c29a]/70">
              <CalendarDays className="mt-1 h-4 w-4 shrink-0 text-[#caa24c]" />
              <span>Private tours are the best time to compare layout, guest count, decor, timing, and packages.</span>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <LuxorInquiryForm source="homepage" />
          </Reveal>
        </div>
      </section>
    </main>
  )
}
