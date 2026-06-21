'use client'

import { ArrowRight, CalendarDays, MapPin, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { Reveal } from '@/components/Reveal'
import { LuxorWordmark } from '@/components/LuxorWordmark'

type EventRow = {
  title: string
  label: string
  description: string
  imageSrc: string
  details: string[]
}

type GalleryFrame = {
  title: string
  imageSrc: string
  spanClass: string
}

const eventRows: EventRow[] = [
  {
    label: 'Wedding day',
    title: 'Ceremony, dinner, toast, and dance floor in one elegant flow.',
    description:
      'A wedding venue should support every part of the day: a memorable entrance, comfortable guest flow, beautiful portraits, dinner, toasts, and a dance floor that feels connected to it all.',
    imageSrc:
      'https://images.pexels.com/photos/33852463/pexels-photo-33852463/free-photo-of-luxurious-floral-wedding-venue-interior-design.jpeg?auto=compress&cs=tinysrgb&w=1400',
    details: ['Grand entrance', 'Photo-ready corners', 'Dinner-to-dance flow'],
  },
  {
    label: 'Quinceanera',
    title: 'A dramatic room for the entrance, court, cake, and family photos.',
    description:
      'From the court entrance and formal traditions to dinner, cake, and dancing, the room is designed to give each part of a quinceanera its own moment.',
    imageSrc:
      'https://images.pexels.com/photos/29534670/pexels-photo-29534670/free-photo-of-quinceanera-celebration-with-sweet-16-decor.jpeg?auto=compress&cs=tinysrgb&w=1400',
    details: ['Court entrance', 'Cake moment', 'Gift and photo area'],
  },
  {
    label: 'Private celebrations',
    title: 'Warm enough for showers, polished enough for milestone dinners.',
    description:
      'Baby showers, birthdays, anniversaries, and milestone dinners can feel intimate and warm while still enjoying the polished Luxor setting.',
    imageSrc: '/baby-shower.png',
    details: ['Baby showers', 'Birthdays', 'Family celebrations'],
  },
  {
    label: 'Corporate events',
    title: 'A more formal room for awards, dinners, and company gatherings.',
    description:
      'Awards dinners, company celebrations, and professional gatherings benefit from a refined backdrop with room for speeches, seating, signage, and conversation.',
    imageSrc: '/corporate.png',
    details: ['Awards', 'Networking', 'Executive dinners'],
  },
]

const galleryFrames: GalleryFrame[] = [
  {
    title: 'Reception room',
    imageSrc:
      'https://images.pexels.com/photos/35985195/pexels-photo-35985195/free-photo-of-elegant-wedding-reception-with-floral-decor.jpeg?auto=compress&cs=tinysrgb&w=1400',
    spanClass: 'lg:col-span-5 lg:row-span-2',
  },
  {
    title: 'Grand entrance',
    imageSrc:
      'https://images.pexels.com/photos/28976224/pexels-photo-28976224/free-photo-of-elegant-wedding-venue-entrance-with-floral-decoration.jpeg?auto=compress&cs=tinysrgb&w=1200',
    spanClass: 'lg:col-span-3',
  },
  {
    title: 'Tablescape',
    imageSrc:
      'https://images.pexels.com/photos/12846023/pexels-photo-12846023.jpeg?auto=compress&cs=tinysrgb&h=760&fit=crop&w=1200',
    spanClass: 'lg:col-span-4',
  },
  {
    title: 'Toast moment',
    imageSrc:
      'https://images.pexels.com/photos/30443837/pexels-photo-30443837/free-photo-of-elegant-wedding-champagne-toast-celebration.jpeg?auto=compress&cs=tinysrgb&w=1400',
    spanClass: 'lg:col-span-7',
  },
]

const detailPoints = [
  ['Arrival', 'Create a welcoming first impression and a natural place for guests to gather.'],
  ['Flow', 'Plan seating, speeches, dinner, and dancing as one connected experience.'],
  ['Photos', 'Use the room and its details as a polished backdrop throughout the celebration.'],
  ['Personalization', 'Layer in florals, signage, and color while preserving the elegance of the space.'],
]

function DecoDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`luxor-deco-divider ${className}`}>
      <span className="luxor-diamond" />
    </div>
  )
}

function SectionTitle({
  label,
  title,
  copy,
  align = 'left',
}: {
  label: string
  title: string
  copy: string
  align?: 'left' | 'center'
}) {
  return (
    <div className={`max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.48em] text-[#caa24c]">{label}</p>
      <h2 className="mt-5 font-serif text-4xl leading-[0.92] text-[#f7efe3] sm:text-5xl lg:text-6xl">
        {title}
      </h2>
      <p className="mt-5 max-w-2xl text-base leading-7 text-[#d7c29a]/72 sm:text-lg">{copy}</p>
    </div>
  )
}

function ImageFrame({
  src,
  title,
  className = '',
  priority = false,
}: {
  src: string
  title: string
  className?: string
  priority?: boolean
}) {
  return (
    <motion.figure
      whileHover={{ y: -6, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } }}
      className={`luxor-panel luxor-deco-frame relative isolate overflow-hidden rounded-md ${className}`}
    >
      <Image
        src={src}
        alt={title}
        fill
        priority={priority}
        sizes="(min-width: 1024px) 52vw, (min-width: 640px) 60vw, 100vw"
        className="object-cover transition-transform duration-1000 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.58))]" />
      <div className="absolute inset-0 luxor-noise opacity-[0.18]" />
    </motion.figure>
  )
}

function HeroVisual() {
  return (
    <div className="relative">
      <div className="absolute -inset-8 bg-[radial-gradient(circle_at_50%_28%,rgba(202,162,76,0.2),transparent_24rem),radial-gradient(circle_at_85%_80%,rgba(189,101,117,0.16),transparent_18rem)] blur-sm" />
      <div className="relative grid gap-4 sm:grid-cols-[0.72fr_1.28fr]">
        <div className="grid gap-4">
          <ImageFrame
            src="https://images.pexels.com/photos/28976224/pexels-photo-28976224/free-photo-of-elegant-wedding-venue-entrance-with-floral-decoration.jpeg?auto=compress&cs=tinysrgb&w=1000"
            title="Grand entrance"
            className="min-h-[330px]"
          />
          <ImageFrame
            src="https://images.pexels.com/photos/12846023/pexels-photo-12846023.jpeg?auto=compress&cs=tinysrgb&h=760&fit=crop&w=1000"
            title="Blush tablescape detail"
            className="min-h-[250px]"
          />
        </div>
        <ImageFrame
          src="https://images.pexels.com/photos/33852463/pexels-photo-33852463/free-photo-of-luxurious-floral-wedding-venue-interior-design.jpeg?auto=compress&cs=tinysrgb&w=1400"
          title="Luxor reception inspiration"
          priority
          className="min-h-[520px]"
        />
      </div>
    </div>
  )
}

function EventRowView({ event, reverse, delay }: { event: EventRow; reverse: boolean; delay: number }) {
  return (
    <Reveal delay={delay}>
      <article className="grid gap-8 border-t border-[#caa24c]/22 pt-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className={reverse ? 'lg:order-2' : ''}>
          <ImageFrame src={event.imageSrc} title={event.title} className="min-h-[380px]" />
        </div>
        <div className={reverse ? 'lg:order-1' : ''}>
          <p className="font-mono text-[10px] uppercase tracking-[0.46em] text-[#caa24c]">{event.label}</p>
          <h3 className="mt-4 max-w-2xl font-serif text-3xl leading-[0.95] text-[#f7efe3] sm:text-5xl">
            {event.title}
          </h3>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#d7c29a]/70 sm:text-lg">{event.description}</p>
          <ul className="mt-8 space-y-3.5">
            {event.details.map((detail) => (
              <li key={detail} className="flex items-center gap-4">
                <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-[#caa24c]" aria-hidden="true" />
                <span className="text-sm leading-6 text-[#d7c29a]/78 sm:text-base">
                  {detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </article>
    </Reveal>
  )
}

function GalleryRail() {
  const images = [...galleryFrames, ...galleryFrames]

  return (
    <div className="relative mt-14 overflow-hidden py-4">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-24 bg-gradient-to-r from-[#050505] to-transparent sm:w-48" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-24 bg-gradient-to-l from-[#050505] to-transparent sm:w-48" />
      <motion.div
        animate={{ x: [0, '-50%'] }}
        transition={{ duration: 36, repeat: Infinity, ease: 'linear' }}
        className="flex w-fit gap-5 px-6"
      >
        {images.map((frame, idx) => (
          <figure
            key={`${frame.title}-${idx}`}
            className="relative h-[310px] w-[230px] shrink-0 overflow-hidden rounded-md border border-[#caa24c]/22 bg-black shadow-[0_30px_80px_-56px_rgba(0,0,0,0.95)] sm:h-[430px] sm:w-[330px]"
          >
            <Image src={frame.imageSrc} alt={frame.title} fill sizes="(min-width: 640px) 330px, 230px" className="object-cover" />
            <div className="absolute inset-x-4 bottom-4 border-t border-[#caa24c]/45 pt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#f1d27a]">{frame.title}</p>
            </div>
          </figure>
        ))}
      </motion.div>
    </div>
  )
}

export default function Home() {
  return (
    <main id="top" className="overflow-x-hidden bg-[#050505]">
      <section
        id="hero"
        className="relative isolate min-h-screen overflow-hidden bg-[#050505] pt-28 text-[#f7efe3]"
      >
        <div className="absolute inset-0 luxor-noise opacity-[0.28]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(202,162,76,0.18),transparent_28rem),radial-gradient(circle_at_12%_70%,rgba(189,101,117,0.15),transparent_22rem),linear-gradient(180deg,rgba(5,5,5,0.24),#050505_92%)]" />

        <div className="relative z-10 mx-auto grid max-w-7xl gap-14 px-6 pb-20 pt-16 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:px-8 lg:pt-24">
          <Reveal delay={60} className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <LuxorWordmark
              className="mx-auto w-full max-w-[620px]"
              markClassName="translate-x-[-0.35rem] sm:-translate-x-4"
              align="center"
            />
            <DecoDivider className="mx-auto mt-5 w-full max-w-[620px] translate-x-[-0.35rem] sm:-translate-x-4" />
            <h1 className="mt-8 max-w-2xl font-serif text-5xl leading-[0.88] text-[#f7efe3] sm:text-6xl lg:text-7xl">
              An elevated San Antonio venue for unforgettable celebrations.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#d7c29a]/76 sm:text-lg">
              Weddings, quinceaneras, baby showers, and private events with a refined Luxor look: gold details,
              clean lines, palm-inspired styling, and a room made for photos.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <motion.a
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                href="#visit"
                className="inline-flex items-center gap-2 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-[#050505] shadow-[0_20px_40px_-24px_rgba(202,162,76,0.75)]"
              >
                Request a tour
                <ArrowRight className="h-4 w-4" />
              </motion.a>
              <motion.a
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                href="#events"
                className="inline-flex items-center gap-2 rounded-md border border-[#caa24c]/35 bg-white/[0.035] px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#f7efe3] backdrop-blur-sm transition-colors duration-200 hover:border-[#f1d27a]/60 hover:bg-[#caa24c]/12"
              >
                See event types
              </motion.a>
            </div>

            <div className="mt-8 flex max-w-lg items-center gap-3 border-l border-[#caa24c]/45 pl-4 text-sm leading-6 text-[#d7c29a]/68">
              <MapPin className="h-4 w-4 shrink-0 text-[#caa24c]" />
              <span>A distinctive setting for families who want the room to feel special before the first floral arrangement arrives.</span>
            </div>
          </Reveal>

          <Reveal delay={180} className="lg:pl-6">
            <HeroVisual />
          </Reveal>
        </div>
      </section>

      <section aria-label="Venue overview" className="relative border-y border-[#caa24c]/18 bg-[#0b0908]">
        <div className="mx-auto grid max-w-7xl divide-y divide-[#caa24c]/16 px-6 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 lg:px-8">
          {[
            ['Location', 'San Antonio, Texas'],
            ['Celebrations', 'Weddings and quinceaneras'],
            ['Experience', 'Private venue tours'],
            ['Style', 'Elegant and personal'],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-7 text-center sm:px-6 lg:py-8">
              <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-[#caa24c]">{label}</p>
              <p className="mt-2 font-serif text-xl text-[#f7efe3]">{value}</p>
            </div>
          ))}
        </div>
      </section>
      <section id="events" className="relative isolate overflow-hidden bg-[#080706] py-20 sm:py-28 lg:py-32">
        <div className="absolute inset-0 luxor-noise opacity-[0.18]" />
        <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal>
            <SectionTitle
              label="Event expertise"
              title="One signature setting, designed around your kind of celebration."
              copy="From formal ceremonies to milestone celebrations, Luxor provides an elegant backdrop that can be personalized without losing its distinctive character."
            />
          </Reveal>

          <div className="mt-14 space-y-14 lg:space-y-16">
            {eventRows.map((event, index) => (
              <EventRowView
                key={event.title}
                event={event}
                reverse={index % 2 === 1}
                delay={index * 100}
              />
            ))}
          </div>
        </div>
      </section>

      <section id="spaces" className="relative isolate overflow-hidden bg-[#120d0c] py-20 sm:py-28 lg:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_14%,rgba(189,101,117,0.2),transparent_22rem),linear-gradient(180deg,#120d0c,#050505)]" />
        <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal>
            <SectionTitle
              label="Space planning"
              title="Plan the celebration around how it should feel."
              copy="A thoughtful layout connects the important moments: the entrance, the first photos, dinner, speeches, and the transition to the dance floor."
              align="center"
            />
          </Reveal>

          <Reveal delay={120} className="mt-14">
            <div className="grid gap-4 lg:grid-cols-[1.45fr_0.55fr]">
              <ImageFrame src="/spaces-hero.png" title="Luxor room layout" className="min-h-[440px] sm:min-h-[540px]" priority />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-[1fr_auto]">
                <div className="luxor-panel relative min-h-[260px] overflow-hidden border-[#caa24c]/24 bg-[#bd6575]/12 p-0 sm:min-h-[320px] lg:min-h-0">
                  <Image src="https://images.pexels.com/photos/12846023/pexels-photo-12846023.jpeg?auto=compress&cs=tinysrgb&h=760&fit=crop&w=1000" alt="Blush event tablescape" fill sizes="(min-width: 1024px) 22vw, (min-width: 640px) 50vw, 100vw" className="object-cover opacity-90" />
                </div>
                <div className="luxor-panel flex flex-col justify-end p-7 sm:p-8">
                  <p className="font-mono text-[10px] uppercase tracking-[0.38em] text-[#caa24c]">Start with the room</p>
                  <p className="mt-4 font-serif text-3xl leading-tight text-[#f7efe3]">
                    Then shape every moment around your guests.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={180} className="mt-6">
            <div className="grid overflow-hidden rounded-md border-y border-[#caa24c]/22 bg-black/15 sm:grid-cols-2 lg:grid-cols-4">
              {detailPoints.map(([label, description], index) => (
                <article key={label} className="border-[#caa24c]/16 p-6 sm:odd:border-r lg:border-r lg:last:border-r-0 lg:p-7">
                  <div className="flex items-center gap-3">
                    <span className="font-serif text-2xl text-[#caa24c]">{String(index + 1).padStart(2, '0')}</span>
                    <div className="h-px flex-1 bg-[#caa24c]/22" />
                  </div>
                  <h3 className="mt-5 font-mono text-[10px] uppercase tracking-[0.34em] text-[#f1d27a]">{label}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#d7c29a]/68">{description}</p>
                </article>
              ))}
            </div>
          </Reveal>
        </div>
      </section>
      <section id="experience" className="relative isolate overflow-hidden bg-[#090807] py-20 sm:py-28 lg:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(202,162,76,0.1),transparent_25rem)]" />
        <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal>
            <SectionTitle
              label="Your planning experience"
              title="A clear path from first look to event day."
              copy="Planning a meaningful celebration comes with a lot of decisions. Luxor keeps the venue side focused, personal, and easy to understand."
              align="center"
            />
          </Reveal>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              ['01', 'Visit the venue', 'Walk the room, discuss your guest estimate, and picture the important moments in the actual space.'],
              ['02', 'Shape the plan', 'Review the layout, timing, styling priorities, and package details with the Luxor team.'],
              ['03', 'Celebrate beautifully', 'Arrive knowing the room has been prepared around the flow and feeling of your event.'],
            ].map(([number, title, copy], index) => (
              <Reveal key={title} delay={index * 90}>
                <article className="luxor-panel h-full rounded-md p-7 sm:p-8">
                  <div className="flex items-center gap-4">
                    <span className="font-serif text-4xl text-[#caa24c]">{number}</span>
                    <div className="h-px flex-1 bg-[#caa24c]/24" />
                  </div>
                  <h3 className="mt-8 font-serif text-3xl text-[#f7efe3]">{title}</h3>
                  <p className="mt-4 text-base leading-7 text-[#d7c29a]/70">{copy}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section id="gallery" className="relative isolate overflow-hidden bg-[#050505] py-20 sm:py-28 lg:py-32">
        <div className="absolute inset-0 luxor-noise opacity-[0.22]" />
        <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
          <Reveal>
            <SectionTitle
              label="Moments and detail"
              title="See the atmosphere your celebration can become."
              copy="Explore inspiration for ceremonies, receptions, tablescapes, and the moments families will remember long after the night ends."
              align="center"
            />
          </Reveal>
          <Reveal delay={120}>
            <GalleryRail />
          </Reveal>
        </div>
      </section>

      <section className="relative isolate overflow-hidden border-t border-[#caa24c]/14 bg-[#080706] py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <Reveal>
            <SectionTitle
              label="Planning answers"
              title="A few things families usually ask first."
              copy="Every event is different. These answers will help you prepare for a tour without locking you into decisions too early."
            />
          </Reveal>
          <Reveal delay={120}>
            <div className="divide-y divide-[#caa24c]/18 border-y border-[#caa24c]/18">
              {[
                ['How do I check whether my date is available?', 'Send a tour request with your preferred date or month. The Luxor team will follow up with current availability and next steps.'],
                ['Can the room be personalized for different celebrations?', 'Yes. The neutral dark-and-gold foundation is intended to work with florals, signage, color, and cultural details that make the event personal.'],
                ['When will I know the final guest capacity and layout?', 'Bring your estimated guest count to the tour. Capacity and layout should be confirmed together so seating, entertainment, and guest movement are considered accurately.'],
                ['Where can I learn about packages and pricing?', 'Visit the pricing page for the current package overview, then confirm the details that apply to your event during a private tour.'],
              ].map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-serif text-xl text-[#f7efe3] marker:hidden">
                    {question}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 text-[#caa24c] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="max-w-2xl pt-4 pr-12 text-sm leading-7 text-[#d7c29a]/68 sm:text-base">{answer}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>
      <section id="visit" className="relative isolate overflow-hidden bg-[#120d0c] py-20 sm:py-28 lg:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(202,162,76,0.14),transparent_22rem),radial-gradient(circle_at_88%_12%,rgba(189,101,117,0.18),transparent_20rem)]" />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-start lg:px-8">
          <Reveal>
            <SectionTitle
              label="Private tour"
              title="The best way to know is to experience the room in person."
              copy="Tell us a little about your celebration. We will follow up to discuss availability, answer your questions, and arrange a private tour of Luxor."
            />
            <div className="mt-9 flex flex-wrap gap-3">
              {['Weddings', 'Quinceaneras', 'Baby showers', 'Corporate events'].map((item) => (
                <span key={item} className="rounded-full border border-[#caa24c]/28 bg-[#caa24c]/8 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#f1d27a]">
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-8 flex items-center gap-4 text-sm text-[#d7c29a]/66">
              <div className="h-2 w-2 bg-[#caa24c]" />
              <span>Private tours are the best time to discuss layout, guest count, decor, timing, and package options.</span>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                window.location.href = '/tour'
              }}
              className="luxor-panel p-6 sm:p-8 lg:p-10"
            >
              <div className="mb-7 flex items-center justify-between gap-6 border-b border-[#caa24c]/20 pb-5">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.42em] text-[#caa24c]">Tour request</p>
                  <h3 className="mt-2 font-serif text-3xl text-[#f7efe3]">Tell us about your event.</h3>
                </div>
                <Sparkles className="h-6 w-6 text-[#caa24c]" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: 'Event type', placeholder: 'Wedding, quince...' },
                  { label: 'Target date', placeholder: 'Month or date' },
                  { label: 'Guest count', placeholder: 'Estimated count' },
                  { label: 'Full name', placeholder: 'Your name' },
                ].map((field) => (
                  <label key={field.label} className="block">
                    <span className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">{field.label}</span>
                    <input
                      required
                      type="text"
                      placeholder={field.placeholder}
                      className="mt-2 w-full rounded-md border border-[#caa24c]/22 bg-black/35 px-4 py-3 text-sm text-[#f7efe3] outline-none transition focus:border-[#f1d27a]/70 placeholder:text-[#d7c29a]/35"
                    />
                  </label>
                ))}
              </div>

              <label className="mt-5 block">
                <span className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">Notes</span>
                <textarea
                  placeholder="Tell us what kind of event she is imagining..."
                  className="mt-2 h-32 w-full resize-none rounded-md border border-[#caa24c]/22 bg-black/35 px-4 py-4 text-sm text-[#f7efe3] outline-none transition focus:border-[#f1d27a]/70 placeholder:text-[#d7c29a]/35"
                />
              </label>

              <div className="mt-7 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3 text-sm text-[#d7c29a]/66">
                  <CalendarDays className="h-4 w-4 text-[#caa24c]" />
                  <span>A member of the Luxor team will follow up with you.</span>
                </div>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  className="inline-flex items-center gap-3 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-7 py-4 text-sm font-bold uppercase tracking-[0.16em] text-[#050505] shadow-2xl"
                >
                  Request a tour
                  <ArrowRight className="h-4 w-4" />
                </motion.button>
              </div>
            </form>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
















