'use client'

import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, animate, motion, type PanInfo, useMotionValue } from 'framer-motion'
import { ArrowRight, ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react'
import { Reveal } from '@/components/Reveal'

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
      className={`group relative block overflow-hidden rounded-md border border-[#caa24c]/22 bg-[#0a0807] text-left shadow-[0_34px_90px_-62px_rgba(0,0,0,1)] outline-none transition hover:-translate-y-1 hover:border-[#f1d27a]/45 focus-visible:border-[#f1d27a] focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 ${className}`}
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
        </div>
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white/90 backdrop-blur-sm transition group-hover:border-[#f1d27a]/70 group-hover:bg-[#caa24c] group-hover:text-[#050505] sm:flex">
          <Maximize2 className="h-4 w-4" />
        </span>
      </div>
    </button>
  )
}

export default function GalleryPage() {
  const [activeFilter, setActiveFilter] = useState<GalleryCategory>('All')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [desktopPage, setDesktopPage] = useState(0)
  const [mobileIndex, setMobileIndex] = useState(0)
  const [mobileSlideWidth, setMobileSlideWidth] = useState(0)
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
        setSelectedIndex((current) => {
          if (current === null) return current
          return current === 0 ? filteredGallery.length - 1 : current - 1
        })
      } else if (event.key === 'ArrowRight') {
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

  function goToMobile(index: number, velocity = 0) {
    const next = Math.max(0, Math.min(index, filteredGallery.length - 1))
    setMobileIndex(next)
    animate(mobileX, -next * mobileSlideWidth, {
      type: 'spring',
      stiffness: 360,
      damping: 36,
      mass: 0.82,
      velocity,
    })
  }

  function handleMobileDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const threshold = Math.max(44, mobileSlideWidth * 0.12)
    let next = mobileIndex

    if (info.offset.x < -threshold || info.velocity.x < -520) next += 1
    if (info.offset.x > threshold || info.velocity.x > 520) next -= 1

    goToMobile(next, info.velocity.x)
    window.setTimeout(() => {
      mobileDraggingRef.current = false
    }, 0)
  }

  function handleViewerDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (info.offset.x < -56 || info.velocity.x < -520) showNext()
    if (info.offset.x > 56 || info.velocity.x > 520) showPrevious()
    window.setTimeout(() => {
      viewerDraggingRef.current = false
    }, 0)
  }

  return (
    <main className="overflow-x-hidden bg-[#050505] text-[#f7efe3]">
      <section className="relative isolate overflow-hidden px-5 pb-14 pt-32 sm:px-6 lg:px-8 lg:pb-20 lg:pt-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(202,162,76,0.14),transparent_22rem),radial-gradient(circle_at_88%_12%,rgba(189,101,117,0.16),transparent_20rem),linear-gradient(180deg,#120d0c,#050505)]" />
        <div className="absolute inset-0 luxor-noise opacity-[0.16]" />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.78fr_1.22fr] lg:items-center">
          <div className="max-w-2xl">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#f1d27a]">Inside Luxor</p>
            <h1 className="mt-5 font-serif text-5xl leading-[0.9] sm:text-6xl lg:text-7xl">See the room before you visit.</h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-[#d7c29a]/78 sm:text-lg">Browse real event moments and room setups, then walk through the scale, lighting, and guest flow in person.</p>
            <Link href="/tour#tour-availability" data-conversion="tour_cta_click" data-conversion-label="Gallery hero" className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#caa24c] px-6 py-3 text-sm font-bold uppercase tracking-[.14em] text-[#050505]">Check tour times <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid grid-cols-5 gap-3 sm:gap-4">
            <div className="relative col-span-3 aspect-[3/4] overflow-hidden rounded-md border border-[#caa24c]/24"><Image src="/images/dining-hall/main-hall-wedding-wide.png" alt="Wedding reception setup in the Luxor main hall" fill priority sizes="(min-width:1024px) 35vw,60vw" className="object-cover" /></div>
            <div className="col-span-2 grid gap-3 pt-8 sm:gap-4 sm:pt-12">
              <div className="relative aspect-square overflow-hidden rounded-md border border-[#caa24c]/24"><Image src="/images/dining-hall/main-hall-side-dance-candid.png" alt="Guests dancing at Luxor" fill priority sizes="(min-width:1024px) 22vw,40vw" className="object-cover" /></div>
              <div className="relative aspect-square overflow-hidden rounded-md border border-[#caa24c]/24"><Image src="/images/luxor-lounge/luxor-lounge-quinceanera.png" alt="Quinceañera portrait moment in the Luxor lounge" fill sizes="(min-width:1024px) 22vw,40vw" className="object-cover" /></div>
            </div>
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
                    setDesktopPage(0)
                    setMobileIndex(0)
                    mobileX.stop()
                    mobileX.set(0)
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

          <div className="mt-6 lg:hidden">
            <div ref={mobileGalleryRef} className="relative aspect-[4/5] touch-pan-y overflow-hidden rounded-md bg-[#0a0807] sm:aspect-[16/10]" aria-label={`${activeFilter} photo gallery`} aria-roledescription="carousel">
              <motion.div
                className="flex h-full cursor-grab active:cursor-grabbing"
                style={{ x: mobileX }}
                drag="x"
                dragConstraints={{ left: -(filteredGallery.length - 1) * mobileSlideWidth, right: 0 }}
                dragElastic={0.08}
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
            </div>
          </div>

          <div className="mt-6 hidden gap-4 lg:grid lg:auto-rows-[18rem] lg:grid-cols-12">
            {desktopGallery.map((item, index) => {
              const sourceIndex = desktopPage * desktopPageSize + index
              return (
                <GalleryCard
                  key={`${item.src}-${item.title}`}
                  item={item}
                  priority
                  onOpen={() => setSelectedIndex(sourceIndex)}
                  className={activeFilter === 'All' ? `${item.span} ${item.aspect}` : 'aspect-[4/3] lg:col-span-6 lg:h-full'}
                />
              )
            })}
          </div>

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
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#caa24c]/28 text-[#f7efe3] transition hover:border-[#f1d27a]/55 hover:bg-[#caa24c] hover:text-[#050505] disabled:cursor-default disabled:opacity-30"
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
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#caa24c]/28 text-[#f7efe3] transition hover:border-[#f1d27a]/55 hover:bg-[#caa24c] hover:text-[#050505] disabled:cursor-default disabled:opacity-30"
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
              <Link href="/tour#tour-availability" data-conversion="tour_cta_click" data-conversion-label="Gallery collection" className="inline-flex items-center justify-center gap-2 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-[#050505]">
                Check tour times <ArrowRight className="h-4 w-4" />
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
                    key={selectedItem.src}
                    initial={{ opacity: 0, scale: 0.96, y: 16 }}
                    animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 16 }}
                    transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.18}
                    dragMomentum={false}
                    onDragStart={() => {
                      viewerDraggingRef.current = false
                    }}
                    onDrag={(_, info) => {
                      if (Math.abs(info.offset.x) > 8) viewerDraggingRef.current = true
                    }}
                    onDragEnd={handleViewerDragEnd}
                    className="relative h-full w-full cursor-grab touch-pan-y overflow-hidden bg-black active:cursor-grabbing sm:h-[min(84dvh,52rem)] sm:max-w-6xl sm:rounded-md sm:border sm:border-[#caa24c]/24 sm:shadow-[0_40px_120px_-40px_rgba(0,0,0,1)]"
                  >
                    <Image
                      src={selectedItem.src}
                      alt={selectedItem.title}
                      fill
                      priority
                      draggable={false}
                      sizes="(min-width: 1024px) 1152px, 100vw"
                      className="pointer-events-none select-none object-contain"
                    />
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.9)_0%,rgba(0,0,0,0.48)_25%,transparent_56%)]" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 px-5 pb-16 pt-28 text-left sm:px-8 sm:pb-16 sm:pt-36">
                      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.28em] !text-[#f1d27a] drop-shadow-[0_2px_8px_rgba(0,0,0,1)]">{selectedItem.category}</p>
                      <h2 className="mt-2 font-serif text-4xl leading-none !text-white drop-shadow-[0_3px_14px_rgba(0,0,0,1)] sm:text-5xl">{selectedItem.title}</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-5 !text-white/80 drop-shadow-[0_2px_8px_rgba(0,0,0,1)] sm:text-base sm:leading-6">{selectedItem.caption}</p>
                    </div>

                    <div className="absolute inset-x-0 bottom-5 z-20 flex items-center justify-center gap-2" aria-label="Choose preview image">
                      {filteredGallery.map((item, index) => (
                        <button
                          key={item.src}
                          type="button"
                          aria-label={`Preview ${item.title}`}
                          aria-current={index === selectedIndex}
                          onClick={() => setSelectedIndex(index)}
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
