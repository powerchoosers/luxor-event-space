'use client'

import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, animate, motion, type PanInfo, useMotionValue, useReducedMotion } from 'framer-motion'
import { ArrowRight, ChevronLeft, ChevronRight, X } from '@/lib/icons/phosphor-compat'
import { Reveal } from '@/components/Reveal'
import { StaggerCards, StaggerCard } from '@/components/StaggerCards'
import { VenueFilm } from '@/components/VenueFilm'

type GalleryCategory = 'All' | 'Room' | 'Lounge' | 'Weddings' | 'Celebrations' | 'Corporate'

type GalleryItem = {
  src: string
  title: string
  caption: string
  category: Exclude<GalleryCategory, 'All'>
  span: string
  aspect: string
  sizes: string
}

const filters: GalleryCategory[] = ['All', 'Room', 'Lounge', 'Weddings', 'Celebrations', 'Corporate']
const desktopPageSize = 6
const carouselSpring = { type: 'spring' as const, stiffness: 280, damping: 30, mass: 0.78 }
const viewerSlideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? '100%' : '-100%' }),
  center: { x: 0 },
  exit: (direction: number) => ({ x: direction > 0 ? '-100%' : '100%' }),
}

const gallery: GalleryItem[] = [
  {
    src: '/images/dining-hall/main-hall-wedding-wide.png',
    title: 'The main hall',
    caption: 'The finished hall dressed with dinner tables, florals, and a clear central aisle.',
    category: 'Room',
    span: 'lg:col-span-7 lg:row-span-2',
    aspect: 'aspect-[4/3] lg:aspect-auto lg:h-full',
    sizes: '(min-width: 1024px) 58vw, 100vw',
  },
  {
    src: '/images/dining-hall/main-hall-conversation-candid.png',
    title: 'Around the table',
    caption: 'A candid guest-level view of the room during a wedding reception.',
    category: 'Weddings',
    span: 'lg:col-span-5',
    aspect: 'aspect-[4/3] lg:aspect-auto lg:h-full',
    sizes: '(min-width: 1024px) 42vw, 100vw',
  },
  {
    src: '/images/dining-hall/main-hall-quinceanera-angle.png',
    title: 'Quinceañera reception',
    caption: 'Dusty rose details and a full dinner layout for a milestone celebration.',
    category: 'Celebrations',
    span: 'lg:col-span-5',
    aspect: 'aspect-[4/3] lg:aspect-auto lg:h-full',
    sizes: '(min-width: 1024px) 42vw, 100vw',
  },
  {
    src: '/images/dining-hall/main-hall-side-dance-candid.png',
    title: 'On the dance floor',
    caption: 'A close, spontaneous view of guests dancing alongside the dinner tables.',
    category: 'Weddings',
    span: 'lg:col-span-4',
    aspect: 'aspect-[4/3] lg:aspect-auto lg:h-full',
    sizes: '(min-width: 1024px) 34vw, 100vw',
  },
  {
    src: '/images/dining-hall/main-hall-corporate-cocktail.png',
    title: 'Corporate gathering',
    caption: 'A flexible cocktail and dinner setup for conversation and networking.',
    category: 'Corporate',
    span: 'lg:col-span-4',
    aspect: 'aspect-[4/3] lg:aspect-auto lg:h-full',
    sizes: '(min-width: 1024px) 34vw, 100vw',
  },
  {
    src: '/images/dining-hall/main-hall-table-toast-candid.png',
    title: 'A shared toast',
    caption: 'An intimate table-level moment surrounded by candlelight and florals.',
    category: 'Room',
    span: 'lg:col-span-4',
    aspect: 'aspect-[4/3] lg:aspect-auto lg:h-full',
    sizes: '(min-width: 1024px) 34vw, 100vw',
  },
  {
    src: '/images/luxor-lounge/luxor-lounge-empty.png',
    title: 'The Luxor Lounge',
    caption: 'A moody cocktail room with lounge seating, warm lighting, and flexible service space.',
    category: 'Lounge',
    span: 'lg:col-span-7 lg:row-span-2',
    aspect: 'aspect-[4/3] lg:aspect-auto lg:h-full',
    sizes: '(min-width: 1024px) 58vw, 100vw',
  },
  {
    src: '/images/luxor-lounge/luxor-lounge-family.png',
    title: 'Family gathering',
    caption: 'A comfortable setting for conversation across generations.',
    category: 'Lounge',
    span: 'lg:col-span-5',
    aspect: 'aspect-[4/3] lg:aspect-auto lg:h-full',
    sizes: '(min-width: 1024px) 42vw, 100vw',
  },
  {
    src: '/images/luxor-lounge/luxor-lounge-quinceanera.png',
    title: 'Quinceañera cocktail hour',
    caption: 'A separate lounge for family, portraits, and quieter moments during the celebration.',
    category: 'Celebrations',
    span: 'lg:col-span-5',
    aspect: 'aspect-[4/3] lg:aspect-auto lg:h-full',
    sizes: '(min-width: 1024px) 42vw, 100vw',
  },
  {
    src: '/images/luxor-lounge/luxor-lounge-baby-shower.png',
    title: 'Lounge celebration',
    caption: 'A relaxed seated setup for showers and intimate daytime gatherings.',
    category: 'Celebrations',
    span: 'lg:col-span-4',
    aspect: 'aspect-[4/3] lg:aspect-auto lg:h-full',
    sizes: '(min-width: 1024px) 34vw, 100vw',
  },
  {
    src: '/images/luxor-lounge/luxor-lounge-corporate.png',
    title: 'Lounge networking',
    caption: 'A focused setting for cocktails, introductions, and smaller business gatherings.',
    category: 'Corporate',
    span: 'lg:col-span-4',
    aspect: 'aspect-[4/3] lg:aspect-auto lg:h-full',
    sizes: '(min-width: 1024px) 34vw, 100vw',
  },
  {
    src: '/images/luxor-lounge/luxor-lounge-wedding.png',
    title: 'Wedding cocktail hour',
    caption: 'A warm side room where guests can gather between the main moments.',
    category: 'Weddings',
    span: 'lg:col-span-4',
    aspect: 'aspect-[4/3] lg:aspect-auto lg:h-full',
    sizes: '(min-width: 1024px) 34vw, 100vw',
  },
]

const photoUses = [
  ['For families', 'See whether the room matches the tone you want for photos, entrances, dinner, and dancing.'],
  ['For planners', 'Use the images to talk through focal points, decor scale, table placement, and vendor needs.'],
  ['For vendors', 'Spot lighting, backdrop, floor, and setup considerations before the walkthrough.'],
]

function GalleryCard({ item, onOpen, priority = false, mobile = false, className = '' }: { item: GalleryItem; onOpen: () => void; priority?: boolean; mobile?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-conversion="gallery_open"
      data-conversion-label={item.title}
      aria-label={`Open ${item.title}`}
      className={`group relative block overflow-hidden rounded-2xl border border-[#caa24c]/22 bg-[#0a0807] text-left shadow-[0_34px_90px_-62px_rgba(0,0,0,1)] outline-none transition hover:-translate-y-1 hover:border-[#f1d27a]/45 focus-visible:border-[#f1d27a] focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 ${className}`}
    >
      <Image
        src={item.src}
        alt={item.title}
        fill
        draggable={false}
        loading={priority ? 'eager' : 'lazy'}
        sizes={item.sizes}
        className="select-none object-cover transition-transform duration-700 group-hover:scale-[1.035]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 transition-opacity duration-500 group-hover:opacity-95"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.08), transparent 38%), linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.48) 28%, transparent 62%)' }}
      />
      <div className={`absolute inset-x-0 bottom-0 flex items-end justify-between gap-5 px-5 pt-28 sm:px-6 sm:pt-36 lg:px-7 lg:pb-7 ${mobile ? 'pb-20 sm:pb-20' : 'pb-5 sm:pb-6'}`}>
        <div className="max-w-xl text-left">
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.28em] !text-[#f1d27a] drop-shadow-[0_2px_8px_rgba(0,0,0,1)]">{item.category}</p>
          <h2 className="mt-2 font-serif text-3xl leading-[0.92] !text-white drop-shadow-[0_3px_14px_rgba(0,0,0,1)] sm:text-4xl">{item.title}</h2>
          <p className="mt-2 max-w-lg text-sm leading-5 !text-white/85 drop-shadow-[0_2px_8px_rgba(0,0,0,1)] sm:text-[15px] sm:leading-6">{item.caption}</p>
          <span aria-hidden="true" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold !text-white drop-shadow-[0_2px_8px_rgba(0,0,0,1)]">View photo <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span>
        </div>
      </div>
    </button>
  )
}

export default function GalleryPage() {
  const reduceMotion = useReducedMotion()
  const [activeFilter, setActiveFilter] = useState<GalleryCategory>('All')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [desktopPage, setDesktopPage] = useState(0)
  const [mobileIndex, setMobileIndex] = useState(0)
  const [mobileSlideWidth, setMobileSlideWidth] = useState(0)
  const [viewerDirection, setViewerDirection] = useState(1)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const mobileGalleryRef = useRef<HTMLDivElement>(null)
  const mobileDraggingRef = useRef(false)
  const viewerDraggingRef = useRef(false)
  const mobileX = useMotionValue(0)

  const filteredGallery = useMemo(() => {
    if (activeFilter === 'All') return gallery
    return gallery.filter((item) => item.category === activeFilter)
  }, [activeFilter])

  const selectedItem = selectedIndex === null ? null : filteredGallery[selectedIndex]
  const desktopPageCount = Math.max(1, Math.ceil(filteredGallery.length / desktopPageSize))
  const desktopGallery = filteredGallery.slice(desktopPage * desktopPageSize, (desktopPage + 1) * desktopPageSize)

  useEffect(() => {
    const node = mobileGalleryRef.current
    if (!node) return

    const updateWidth = () => setMobileSlideWidth(node.getBoundingClientRect().width)
    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    mobileX.stop()
    mobileX.set(-mobileIndex * mobileSlideWidth)
  }, [mobileIndex, mobileSlideWidth, mobileX])

  useEffect(() => {
    if (!selectedItem) return

    closeButtonRef.current?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [selectedItem])

  useEffect(() => {
    if (!selectedItem) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedIndex(null)
      } else if (event.key === 'ArrowLeft') {
        setViewerDirection(-1)
        setSelectedIndex((current) => {
          if (current === null) return current
          return current === 0 ? filteredGallery.length - 1 : current - 1
        })
      } else if (event.key === 'ArrowRight') {
        setViewerDirection(1)
        setSelectedIndex((current) => {
          if (current === null) return current
          return current === filteredGallery.length - 1 ? 0 : current + 1
        })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filteredGallery.length, selectedItem])

  function showPrevious() {
    setViewerDirection(-1)
    setSelectedIndex((current) => {
      if (current === null) return current
      return current === 0 ? filteredGallery.length - 1 : current - 1
    })
  }

  function showNext() {
    setViewerDirection(1)
    setSelectedIndex((current) => {
      if (current === null) return current
      return current === filteredGallery.length - 1 ? 0 : current + 1
    })
  }

  function goToMobile(index: number, velocity = 0) {
    const next = Math.max(0, Math.min(index, filteredGallery.length - 1))
    setMobileIndex(next)
    animate(mobileX, -next * mobileSlideWidth, {
      ...carouselSpring,
      velocity: Math.max(-1800, Math.min(1800, velocity)),
    })
  }

  function handleMobileDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const projectedDistance = info.offset.x + info.velocity.x * 0.14
    const threshold = Math.max(40, mobileSlideWidth * 0.1)
    let next = mobileIndex

    if (projectedDistance < -threshold) next += 1
    if (projectedDistance > threshold) next -= 1

    goToMobile(next, info.velocity.x)
    window.setTimeout(() => {
      mobileDraggingRef.current = false
    }, 0)
  }

  function handleViewerDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const projectedDistance = info.offset.x + info.velocity.x * 0.14
    if (projectedDistance < -48) showNext()
    else if (projectedDistance > 48) showPrevious()
    window.setTimeout(() => {
      viewerDraggingRef.current = false
    }, 0)
  }

  return (
    <main className="overflow-x-hidden bg-[#050505] text-[#f7efe3]">
      <section className="relative isolate overflow-hidden pt-28 lg:px-8 lg:pb-20 lg:pt-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(202,162,76,0.14),transparent_22rem),radial-gradient(circle_at_88%_12%,rgba(189,101,117,0.16),transparent_20rem),linear-gradient(180deg,#120d0c,#050505)]" />
        <div className="absolute inset-0 luxor-noise opacity-[0.16]" />
        <div className="relative z-10 lg:hidden [&_.venue-film]:!rounded-none [&_.venue-film_video]:!rounded-none">
          <VenueFilm autoPlay />
        </div>
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-8 sm:px-6 lg:grid-cols-[.78fr_1.22fr] lg:items-center lg:px-0 lg:pb-0 lg:pt-0">
          <div className="order-2 mx-auto max-w-2xl text-center lg:order-1">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#f1d27a]">Inside Luxor</p>
            <h1 className="mt-5 font-serif text-5xl leading-[0.92] text-[#f7efe3] sm:text-6xl lg:text-7xl">
              See the room <span className="italic text-[#f1d27a]">before</span> you visit.
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-[#d7c29a]/78 sm:text-lg">Watch our venue film, captured inside Luxor. Then explore the collection and visit to picture your celebration here.</p>
            <Link href="/visit#visit-booking" data-conversion="visit_cta_click" data-conversion-label="Gallery hero" className="luxor-gold-raised mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-6 py-3 text-sm uppercase tracking-[.14em]">Schedule a Visit <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="order-1 hidden min-w-0 lg:order-2 lg:block [&_.venue-film]:!rounded-2xl">
            <VenueFilm autoPlay />
          </div>
        </div>
      </section>

      <section className="bg-[#080706] py-8 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <div>
            <p className="text-center font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#9b6f24] sm:text-left">Photo collection</p>
            <div className="mt-3 flex flex-col gap-3 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
              <h2 className="font-serif text-4xl leading-none text-[#241d17] sm:text-5xl">Explore the space</h2>
              <p className="max-w-md text-sm leading-6 text-[#665a4e]">Choose a category, then open a photo for a closer look.</p>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-1 border-b border-[#caa24c]/25 pb-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1" role="group" aria-label="Gallery filters">
              {filters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={activeFilter === filter}
                  onClick={() => {
                    setActiveFilter(filter)
                    setSelectedIndex(null)
                    setDesktopPage(0)
                    setMobileIndex(0)
                    mobileX.stop()
                    mobileX.set(0)
                  }}
                  className={`relative inline-flex min-h-11 min-w-0 items-center justify-center rounded-xl px-1 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b6f24] sm:px-4 sm:text-sm ${
                    activeFilter === filter
                      ? '!text-white'
                      : 'text-[#665a4e] hover:bg-[#f4ede3] hover:text-[#241d17]'
                  }`}
                >
                  {activeFilter === filter ? <motion.span aria-hidden="true" layoutId={reduceMotion ? undefined : 'gallery-filter-selection'} className="luxor-gold-indicator pointer-events-none absolute inset-0 rounded-xl" transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} /> : null}
                  <span className="relative">{filter}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 lg:hidden">
            <div ref={mobileGalleryRef} className="relative aspect-[4/5] touch-pan-y overflow-hidden rounded-2xl bg-[#0a0807] sm:aspect-[16/10]" aria-label={`${activeFilter} photo gallery`} aria-roledescription="carousel">
              <AnimatePresence initial={false}>
              <motion.div
                key={activeFilter}
                initial={reduceMotion ? false : { opacity: 0.55, filter: 'blur(8px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="relative h-full w-full"
              >
              <motion.div
                className="flex h-full cursor-grab transform-gpu will-change-transform active:cursor-grabbing"
                style={{ x: mobileX }}
                drag="x"
                dragConstraints={{ left: -(filteredGallery.length - 1) * mobileSlideWidth, right: 0 }}
                dragElastic={0.12}
                dragMomentum={false}
                onDragStart={() => {
                  mobileDraggingRef.current = false
                }}
                onDrag={(_, info) => {
                  if (Math.abs(info.offset.x) > 8) mobileDraggingRef.current = true
                }}
                onDragEnd={handleMobileDragEnd}
              >
                {filteredGallery.map((item, index) => (
                  <GalleryCard
                    key={`${item.src}-${item.title}`}
                    item={item}
                    priority={index === 0}
                    mobile
                    onOpen={() => {
                      if (!mobileDraggingRef.current) setSelectedIndex(index)
                    }}
                    className="h-full w-full shrink-0 rounded-none border-0 hover:translate-y-0"
                  />
                ))}
              </motion.div>
              <div className="absolute inset-x-0 bottom-5 z-20 flex items-center justify-center gap-2" aria-label="Choose gallery image">
                {filteredGallery.map((item, index) => (
                  <button
                    key={item.src}
                    type="button"
                    aria-label={`Show ${item.title}`}
                    aria-current={index === mobileIndex}
                    onClick={() => goToMobile(index)}
                    className={`h-2.5 rounded-full transition-all ${index === mobileIndex ? 'w-8 bg-[#e3bb6a]' : 'w-2.5 bg-white/45 hover:bg-white/80'}`}
                  />
                ))}
              </div>
              </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <StaggerCards
            key={`${activeFilter}-${desktopPage}`}
            className="mt-6 hidden gap-5 lg:grid lg:grid-cols-3"
            stagger={0.06}
          >
            {desktopGallery.map((item, index) => {
              const sourceIndex = desktopPage * desktopPageSize + index
              return (
                <StaggerCard
                  key={`${item.src}-${item.title}`}
                  className="aspect-[4/3] min-w-0"
                >
                  <GalleryCard
                    item={item}
                    priority
                    onOpen={() => setSelectedIndex(sourceIndex)}
                    className="h-full w-full"
                  />
                </StaggerCard>
              )
            })}
          </StaggerCards>

          <div className="mt-7 hidden items-center justify-between border-t border-[#caa24c]/18 pt-5 lg:flex" aria-label="Gallery pagination">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d7c29a]/55">
              Page {desktopPage + 1} of {desktopPageCount}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDesktopPage((page) => Math.max(0, page - 1))}
                disabled={desktopPage === 0}
                aria-label="Previous gallery page"
                className="gallery-pagination-arrow flex h-10 w-10 items-center justify-center rounded-full border border-[#caa24c]/28 text-[#f7efe3] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b6f24] disabled:cursor-default disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              {Array.from({ length: desktopPageCount }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setDesktopPage(index)}
                  aria-label={`Go to gallery page ${index + 1}`}
                  aria-current={index === desktopPage ? 'page' : undefined}
                  className={`h-2.5 rounded-full transition-all ${index === desktopPage ? 'w-8 bg-[#e3bb6a]' : 'w-2.5 bg-[#d7c29a]/35 hover:bg-[#d7c29a]/65'}`}
                />
              ))}
              <button
                type="button"
                onClick={() => setDesktopPage((page) => Math.min(desktopPageCount - 1, page + 1))}
                disabled={desktopPage === desktopPageCount - 1}
                aria-label="Next gallery page"
                className="gallery-pagination-arrow flex h-10 w-10 items-center justify-center rounded-full border border-[#caa24c]/28 text-[#f7efe3] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b6f24] disabled:cursor-default disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          <Reveal delay={160}>
            <div className="mt-12 flex flex-col items-start justify-between gap-6 border-t border-[#caa24c]/18 pt-8 sm:flex-row sm:items-center">
              <p className="max-w-xl text-sm leading-6 text-[#d7c29a]/70 sm:text-base">
                The next step is seeing how your guest count, tables, photos, and dance floor would fit inside the room.
              </p>
              <Link href="/visit#visit-booking" data-conversion="visit_cta_click" data-conversion-label="Gallery collection" className="luxor-gold-raised inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 text-sm uppercase tracking-[0.14em]">
                Schedule a Visit <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {typeof document !== 'undefined'
        ? createPortal(
            <AnimatePresence>
              {selectedItem ? (
                <motion.div
                  className="fixed inset-0 z-[140] flex items-center justify-center overflow-hidden bg-black/95 p-0 backdrop-blur-xl sm:p-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  role="dialog"
                  aria-modal="true"
                  aria-label={`${selectedItem.title} image preview`}
                >
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => setSelectedIndex(null)}
                    className="absolute right-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white backdrop-blur-md transition hover:bg-white hover:text-black sm:right-7 sm:top-7"
                    aria-label="Close image preview"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <button
                    type="button"
                    onClick={showPrevious}
                    className="absolute left-5 top-1/2 z-30 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white backdrop-blur-md transition hover:bg-white hover:text-black sm:flex"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>

                  <button
                    type="button"
                    onClick={showNext}
                    className="absolute right-5 top-1/2 z-30 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white backdrop-blur-md transition hover:bg-white hover:text-black sm:flex"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>

                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 16 }}
                    animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 16 }}
                    transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                    className="relative h-full w-full cursor-grab touch-pan-y overflow-hidden bg-black active:cursor-grabbing sm:h-[min(84dvh,52rem)] sm:max-w-6xl sm:rounded-2xl sm:border sm:border-[#caa24c]/24 sm:shadow-[0_40px_120px_-40px_rgba(0,0,0,1)]"
                  >
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0">
                      {filteredGallery.map((item) => (
                        <Image key={item.src} src={item.src} alt="" fill loading="eager" draggable={false} sizes="(min-width: 1024px) 1152px, 100vw" className="object-contain" />
                      ))}
                    </div>

                    <AnimatePresence initial={false} custom={viewerDirection}>
                      <motion.div
                        key={selectedItem.src}
                        custom={viewerDirection}
                        variants={viewerSlideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={carouselSpring}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={1}
                        dragMomentum={false}
                        onDragStart={() => {
                          viewerDraggingRef.current = false
                        }}
                        onDrag={(_, info) => {
                          if (Math.abs(info.offset.x) > 8) viewerDraggingRef.current = true
                        }}
                        onDragEnd={handleViewerDragEnd}
                        className="absolute inset-0 transform-gpu will-change-transform"
                      >
                        <Image src={selectedItem.src} alt={selectedItem.title} fill loading="eager" draggable={false} sizes="(min-width: 1024px) 1152px, 100vw" className="pointer-events-none select-none object-contain" />
                        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.9)_0%,rgba(0,0,0,0.48)_25%,transparent_56%)]" />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-5 pb-16 pt-28 text-left sm:px-8 sm:pb-16 sm:pt-36">
                          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.28em] !text-[#f1d27a] drop-shadow-[0_2px_8px_rgba(0,0,0,1)]">{selectedItem.category}</p>
                          <h2 className="mt-2 font-serif text-4xl leading-none !text-white drop-shadow-[0_3px_14px_rgba(0,0,0,1)] sm:text-5xl">{selectedItem.title}</h2>
                          <p className="mt-2 max-w-2xl text-sm leading-5 !text-white/80 drop-shadow-[0_2px_8px_rgba(0,0,0,1)] sm:text-base sm:leading-6">{selectedItem.caption}</p>
                        </div>
                      </motion.div>
                    </AnimatePresence>

                    <div className="absolute inset-x-0 bottom-5 z-20 flex items-center justify-center gap-2" aria-label="Choose preview image">
                      {filteredGallery.map((item, index) => (
                        <button
                          key={item.src}
                          type="button"
                          aria-label={`Preview ${item.title}`}
                          aria-current={index === selectedIndex}
                          onClick={() => {
                            if (selectedIndex !== null) setViewerDirection(index > selectedIndex ? 1 : -1)
                            setSelectedIndex(index)
                          }}
                          className={`h-2.5 rounded-full transition-all ${index === selectedIndex ? 'w-8 bg-[#e3bb6a]' : 'w-2.5 bg-white/45 hover:bg-white/80'}`}
                        />
                      ))}
                    </div>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}

      <section className="border-t border-[#caa24c]/16 bg-[#120d0c] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">How to use the gallery</p>
            <h2 className="mt-4 font-serif text-4xl leading-[0.95] sm:text-5xl lg:text-6xl">
              Photos should help you make decisions, not just look expensive.
            </h2>
          </Reveal>

          <StaggerCards className="mt-10 grid gap-4 md:grid-cols-3" stagger={0.08}>
            {photoUses.map(([title, copy], index) => (
              <StaggerCard key={title} className="h-full">
                <article className="flex h-full items-start gap-4 rounded-2xl border border-[#caa24c]/20 bg-black/24 p-6">
                  <span className="shrink-0 font-serif text-3xl leading-none text-[#caa24c]">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <h3 className="font-serif text-3xl leading-none text-[#f7efe3]">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#d7c29a]/70">{copy}</p>
                  </div>
                </article>
              </StaggerCard>
            ))}
          </StaggerCards>
        </div>
      </section>
    </main>
  )
}
