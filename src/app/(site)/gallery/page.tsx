'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ChevronLeft, ChevronRight, Grid3X3, Maximize2, X } from 'lucide-react'
import { Reveal } from '@/components/Reveal'
import { LuxorAxisLockup } from '@/components/LuxorWordmark'

type GalleryCategory = 'All' | 'Room' | 'Weddings' | 'Celebrations' | 'Corporate'

type GalleryItem = {
  src: string
  title: string
  caption: string
  category: Exclude<GalleryCategory, 'All'>
  span: string
  aspect: string
  sizes: string
}

const filters: GalleryCategory[] = ['All', 'Room', 'Weddings', 'Celebrations', 'Corporate']

const gallery: GalleryItem[] = [
  {
    src: '/pricing-hero.png',
    title: 'Reception room',
    caption: 'A black-and-gold room dressed for dinner, florals, and dancing.',
    category: 'Room',
    span: 'lg:col-span-7 lg:row-span-2',
    aspect: 'aspect-[4/3] lg:aspect-auto lg:h-full',
    sizes: '(min-width: 1024px) 58vw, 100vw',
  },
  {
    src: '/tour-header.png',
    title: 'Grand hall',
    caption: 'High ceilings, chandeliers, and a dramatic setting for milestone moments.',
    category: 'Weddings',
    span: 'lg:col-span-5',
    aspect: 'aspect-[4/3]',
    sizes: '(min-width: 1024px) 42vw, 100vw',
  },
  {
    src: '/baby-shower.png',
    title: 'Private celebration',
    caption: 'A softer setup for showers, birthdays, and family gatherings.',
    category: 'Celebrations',
    span: 'lg:col-span-5',
    aspect: 'aspect-[4/3]',
    sizes: '(min-width: 1024px) 42vw, 100vw',
  },
  {
    src: '/spaces-hero.png',
    title: 'Ceremony layout',
    caption: 'See how the room can frame a ceremony, aisle, or main focal point.',
    category: 'Weddings',
    span: 'lg:col-span-4',
    aspect: 'aspect-[4/3]',
    sizes: '(min-width: 1024px) 34vw, 100vw',
  },
  {
    src: '/corporate.png',
    title: 'Corporate dinner',
    caption: 'A formal backdrop for presentations, awards, dinners, and networking.',
    category: 'Corporate',
    span: 'lg:col-span-4',
    aspect: 'aspect-[4/3]',
    sizes: '(min-width: 1024px) 34vw, 100vw',
  },
  {
    src: '/pricing-hero.png',
    title: 'Decor foundation',
    caption: 'Neutral, polished surfaces that work with florals, signage, and lighting.',
    category: 'Room',
    span: 'lg:col-span-4',
    aspect: 'aspect-[4/3]',
    sizes: '(min-width: 1024px) 34vw, 100vw',
  },
]

const photoUses = [
  ['For families', 'See whether the room matches the tone you want for photos, entrances, dinner, and dancing.'],
  ['For planners', 'Use the images to talk through focal points, decor scale, table placement, and vendor needs.'],
  ['For vendors', 'Spot lighting, backdrop, floor, and setup considerations before the walkthrough.'],
]

export default function GalleryPage() {
  const [activeFilter, setActiveFilter] = useState<GalleryCategory>('All')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const filteredGallery = useMemo(() => {
    if (activeFilter === 'All') return gallery
    return gallery.filter((item) => item.category === activeFilter)
  }, [activeFilter])

  const selectedItem = selectedIndex === null ? null : filteredGallery[selectedIndex]

  useEffect(() => {
    document.body.style.overflow = selectedItem ? 'hidden' : ''

    return () => {
      document.body.style.overflow = ''
    }
  }, [selectedItem])

  function showPrevious() {
    setSelectedIndex((current) => {
      if (current === null) return current
      return current === 0 ? filteredGallery.length - 1 : current - 1
    })
  }

  function showNext() {
    setSelectedIndex((current) => {
      if (current === null) return current
      return current === filteredGallery.length - 1 ? 0 : current + 1
    })
  }

  return (
    <main className="overflow-x-hidden bg-[#050505] text-[#f7efe3]">
      <section className="relative isolate overflow-hidden px-5 pb-16 pt-36 sm:px-6 lg:px-8 lg:pb-20 lg:pt-44">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(202,162,76,0.14),transparent_22rem),radial-gradient(circle_at_88%_12%,rgba(189,101,117,0.16),transparent_20rem),linear-gradient(180deg,#120d0c,#050505)]" />
        <div className="absolute inset-0 luxor-noise opacity-[0.16]" />
        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="mx-auto max-w-4xl text-center">
            <LuxorAxisLockup className="mx-auto mb-8 w-full max-w-[360px] sm:max-w-[460px]" />
            <h1 className="font-serif text-5xl leading-[0.9] sm:text-6xl lg:text-8xl">
              See the room before you visit.
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-[#d7c29a]/78 sm:text-lg">
              Browse the atmosphere, then schedule a private walkthrough to confirm the scale, lighting, and layout for your event.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#080706] py-8 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 border-y border-[#caa24c]/18 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">Photo collection</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d7c29a]/68">
                Filter by event style, then open any image for a closer look at the room, decor, and guest flow.
              </p>
            </div>

            <div className="flex flex-wrap gap-2" aria-label="Gallery filters">
              {filters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => {
                    setActiveFilter(filter)
                    setSelectedIndex(null)
                  }}
                  className={`inline-flex min-h-10 items-center justify-center rounded-md border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition ${
                    activeFilter === filter
                      ? 'border-[#f1d27a]/50 bg-[#caa24c] text-[#050505]'
                      : 'border-[#caa24c]/24 bg-black/25 text-[#d7c29a]/78 hover:border-[#f1d27a]/50 hover:text-[#f7efe3]'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:auto-rows-[18rem] lg:grid-cols-12">
            {filteredGallery.map((item, index) => (
              <button
                key={`${item.src}-${item.title}`}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={`group relative block overflow-hidden rounded-md border border-[#caa24c]/22 bg-[#0a0807] text-left shadow-[0_34px_90px_-62px_rgba(0,0,0,1)] outline-none transition hover:-translate-y-1 hover:border-[#f1d27a]/45 focus-visible:border-[#f1d27a] focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 ${item.span} ${item.aspect}`}
              >
                <Image
                  src={item.src}
                  alt={item.title}
                  fill
                  sizes={item.sizes}
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.035]"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.03),rgba(0,0,0,0.72))]" />
                <div className="absolute inset-x-5 bottom-5">
                  <div className="flex items-end justify-between gap-5 border-t border-[#caa24c]/45 pt-4">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#f1d27a]">{item.category}</p>
                      <h2 className="mt-2 font-serif text-3xl leading-none text-[#f7efe3]">{item.title}</h2>
                      <p className="mt-2 max-w-md text-sm leading-5 text-[#d7c29a]/72">{item.caption}</p>
                    </div>
                    <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#caa24c]/35 bg-black/35 text-[#f1d27a] backdrop-blur-sm transition group-hover:bg-[#caa24c] group-hover:text-[#050505] sm:flex">
                      <Maximize2 className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <Reveal delay={160}>
            <div className="mt-12 flex flex-col items-start justify-between gap-6 border-t border-[#caa24c]/18 pt-8 sm:flex-row sm:items-center">
              <p className="max-w-xl text-sm leading-6 text-[#d7c29a]/70 sm:text-base">
                The next step is seeing how your guest count, tables, photos, and dance floor would fit inside the room.
              </p>
              <Link href="/visit" className="inline-flex items-center justify-center gap-2 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-[#050505]">
                Request a tour <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <AnimatePresence>
        {selectedItem ? (
          <motion.div
            className="fixed inset-0 z-[140] flex items-center justify-center bg-black/88 p-4 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedItem.title} image preview`}
          >
            <button
              type="button"
              onClick={() => setSelectedIndex(null)}
              className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-md border border-[#caa24c]/30 bg-black/60 text-[#f7efe3] transition hover:bg-[#caa24c] hover:text-[#050505]"
              aria-label="Close image preview"
            >
              <X className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={showPrevious}
              className="absolute left-4 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-md border border-[#caa24c]/30 bg-black/60 text-[#f7efe3] transition hover:bg-[#caa24c] hover:text-[#050505] sm:flex"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            <button
              type="button"
              onClick={showNext}
              className="absolute right-4 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-md border border-[#caa24c]/30 bg-black/60 text-[#f7efe3] transition hover:bg-[#caa24c] hover:text-[#050505] sm:flex"
              aria-label="Next image"
            >
              <ChevronRight className="h-6 w-6" />
            </button>

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              className="grid w-full max-w-6xl overflow-hidden rounded-md border border-[#caa24c]/24 bg-[#080706] shadow-[0_40px_120px_-40px_rgba(0,0,0,1)] lg:grid-cols-[1fr_22rem]"
            >
              <div className="relative aspect-[4/3] bg-black lg:min-h-[70vh]">
                <Image
                  src={selectedItem.src}
                  alt={selectedItem.title}
                  fill
                  sizes="(min-width: 1024px) 900px, 100vw"
                  className="object-cover"
                />
              </div>
              <aside className="border-t border-[#caa24c]/18 p-6 lg:border-l lg:border-t-0 lg:p-8">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-[#caa24c]">
                  <Grid3X3 className="h-4 w-4" />
                  {selectedItem.category}
                </div>
                <h2 className="mt-5 font-serif text-4xl leading-none text-[#f7efe3]">{selectedItem.title}</h2>
                <p className="mt-4 text-sm leading-6 text-[#d7c29a]/72">{selectedItem.caption}</p>
                <div className="mt-8 border-t border-[#caa24c]/18 pt-5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#d7c29a]/42">
                  Image {(selectedIndex ?? 0) + 1} of {filteredGallery.length}
                </div>
              </aside>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <section className="border-t border-[#caa24c]/16 bg-[#120d0c] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">How to use the gallery</p>
            <h2 className="mt-4 font-serif text-4xl leading-[0.95] sm:text-5xl lg:text-6xl">
              Photos should help you make decisions, not just look expensive.
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {photoUses.map(([title, copy], index) => (
              <Reveal key={title} delay={index * 70}>
                <article className="h-full rounded-md border border-[#caa24c]/20 bg-black/24 p-6">
                  <span className="font-serif text-3xl text-[#caa24c]">{String(index + 1).padStart(2, '0')}</span>
                  <h3 className="mt-5 font-serif text-3xl text-[#f7efe3]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#d7c29a]/70">{copy}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
