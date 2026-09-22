'use client'

import { ArrowDown, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { Reveal } from '@/components/Reveal'
import { VenueFilm } from '@/components/VenueFilm'
import { LuxorBrochureForm } from '@/components/LuxorBrochureForm'

const curatedPhotos = [
  {
    src: '/images/dining-hall/main-hall-reception-professional.png',
    alt: 'Luxor Grand Hall Reception',
    caption: 'Grand Main Hall',
  },
  {
    src: '/images/luxor-lounge/luxor-lounge-empty.png',
    alt: 'Luxor Cocktail Lounge',
    caption: 'Private Lounge',
  },
  {
    src: '/images/dining-hall/main-hall-wedding-dance-candid.png',
    alt: 'First dance in the ballroom',
    caption: 'Celebration Floor',
  },
  {
    src: '/images/dining-hall/main-hall-table-candid.png',
    alt: 'Designer table setting',
    caption: 'Reception Dining',
  },
]

export default function Home() {
  return (
    <main id="top" className="overflow-x-hidden bg-[#050505] text-[#f7efe3]">
      {/* 1. HERO WITH VIDEO AND BROCHURE CTA */}
      <section id="hero" className="venue-film-hero relative isolate overflow-hidden pt-28">
        <VenueFilm autoPlay hero>
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <motion.a
              href="#brochure-form"
              data-conversion="brochure_hero_click"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="hero-brochure-cta pointer-events-auto group relative inline-flex w-48 items-center justify-center gap-2 rounded-md border px-4 py-3 text-center font-serif text-[11px] font-semibold uppercase leading-snug tracking-[0.16em] transition-all duration-300 sm:w-auto sm:gap-3 sm:rounded-full sm:px-10 sm:py-5 sm:text-base sm:tracking-[0.2em]"
            >
              <span className="relative z-10">
                Get your free <span className="block sm:inline">venue brochure.</span>
              </span>
              <ArrowDown className="relative z-10 hidden h-4 w-4 transition-transform duration-300 group-hover:translate-y-0.5 sm:block" />
            </motion.a>
          </div>
        </VenueFilm>
      </section>

      {/* 2. QUICK IMPACTFUL HEADLINE AFTER HERO */}
      <section className="relative isolate overflow-hidden bg-[#0a0807] py-20 sm:py-28 lg:py-32 border-b border-[#caa24c]/18">
        <div className="absolute inset-0 luxor-noise opacity-20" />
        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center lg:px-8">
          <p className="font-mono text-[10px] sm:text-xs font-bold uppercase tracking-[0.38em] text-[#caa24c]">
            Luxor at Las Palmas Events
          </p>

          <h1 className="mt-5 font-serif text-4xl sm:text-5xl lg:text-6xl xl:text-7xl leading-[1.04] text-[#fffaf3]">
            A Beautiful Setting for Life’s Biggest Moments.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg leading-relaxed text-[#d7c29a]/80">
            An elegant ballroom, sophisticated private lounge, and thoughtful amenities created for weddings, quinceañeras, and special celebrations in San Antonio.
          </p>

          <div className="mt-8 flex items-center justify-center gap-6">
            <span className="h-px w-12 bg-[#caa24c]/40" />
            <span className="h-1.5 w-1.5 rotate-45 bg-[#caa24c]" />
            <span className="h-px w-12 bg-[#caa24c]/40" />
          </div>
        </div>
      </section>

      {/* 3. CURATED GALLERY PREVIEW */}
      <section className="relative isolate overflow-hidden bg-[#050505] py-20 sm:py-28 border-b border-[#caa24c]/18">
        <div className="relative z-10 mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.34em] text-[#caa24c]">
              Curated Preview
            </p>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl lg:text-5xl text-[#fffaf3]">
              The Space at a Glance
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#d7c29a]/75">
              Experience the warm gold accents, versatile layout, and inviting atmosphere before you step inside.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {curatedPhotos.map((photo, idx) => (
              <Reveal key={photo.src} delay={idx * 70} variant="scale" amount={16}>
                <div className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-[#caa24c]/25 bg-[#0f0c0a] shadow-lg transition-transform duration-300 hover:scale-[1.02]">
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#caa24c]">
                      {photo.caption}
                    </p>
                    <p className="gallery-photo-title font-serif text-lg text-white font-medium mt-0.5">
                      {photo.alt}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/gallery"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full border border-[#caa24c]/45 bg-white/5 px-8 py-3.5 font-serif text-sm font-semibold uppercase tracking-[0.18em] text-[#f7efe3] shadow-md transition hover:border-[#caa24c] hover:bg-[#caa24c]/15 hover:text-white"
            >
              <span>View Full Gallery</span>
              <ArrowRight className="h-4 w-4 text-[#caa24c]" />
            </Link>
          </div>
        </div>
      </section>

      {/* 4. PRIMARY LEAD GENERATION: FREE BROCHURE LEAD FORM */}
      <section className="relative isolate overflow-hidden bg-[#070504] py-20 sm:py-28">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(202,162,76,0.12),transparent_32rem)]" />
        <div className="relative z-10 mx-auto max-w-5xl px-5 sm:px-6 lg:px-8">
          <LuxorBrochureForm />

          {/* Secondary reassurance link to schedule a visit */}
          <div className="mt-10 text-center">
            <p className="text-sm text-[#d7c29a]/70">
              Ready to see the room in person?{' '}
              <Link
                href="/visit"
                data-conversion="visit_cta_click"
                data-conversion-label="Homepage bottom link"
                className="font-semibold text-[#caa24c] underline underline-offset-4 hover:text-[#f1d27a]"
              >
                Schedule a Visit
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
