'use client'

import Image from 'next/image'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { ArrowDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { AnimatePresence, animate, motion, type PanInfo, useMotionValue } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

type Locale = 'en' | 'es'

const slides = {
  en: [
    { title: 'Main Hall', subtitle: 'Up to 180 Guests', image: '/images/dining-hall/main-hall-reception-professional.png' },
    { title: 'VIP Room', subtitle: 'Private VIP Room', image: '/images/dining-hall/main-hall-conversation-candid.png' },
    { title: 'Lounge Room', subtitle: 'Lounge Room', image: '/images/luxor-lounge/luxor-lounge-empty.png' },
    { title: 'Kitchenette', subtitle: 'Kitchenette', image: '/images/dining-hall/main-hall-dinner-service-candid.png' },
  ],
  es: [
    { title: 'Salón principal', subtitle: 'Hasta 180 invitados', image: '/images/dining-hall/main-hall-reception-professional.png' },
    { title: 'Sala VIP', subtitle: 'Sala VIP privada', image: '/images/dining-hall/main-hall-conversation-candid.png' },
    { title: 'Sala lounge', subtitle: 'Sala lounge', image: '/images/luxor-lounge/luxor-lounge-empty.png' },
    { title: 'Cocineta', subtitle: 'Cocineta', image: '/images/dining-hall/main-hall-dinner-service-candid.png' },
  ],
} as const

const galleryCopy = {
  en: { title: 'Your Tour at a Glance', book: 'Book a Tour', label: 'Tour spaces. Swipe left or right to browse.', previous: 'Previous tour space', next: 'Next tour space', show: 'Show', view: 'View full-size image of', dialog: 'Full-size tour image', close: 'Close full-size image' },
  es: { title: 'Tu recorrido de un vistazo', book: 'Reservar recorrido', label: 'Espacios del recorrido. Desliza hacia la izquierda o derecha para explorar.', previous: 'Espacio anterior', next: 'Espacio siguiente', show: 'Mostrar', view: 'Ver imagen completa de', dialog: 'Imagen completa del recorrido', close: 'Cerrar imagen completa' },
} as const

export function TourGallery({ locale = 'en' }: { locale?: Locale }) {
  const gallerySlides = slides[locale]
  const text = galleryCopy[locale]
  const [active, setActive] = useState(0)
  const [slideWidth, setSlideWidth] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const galleryRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(active)
  const draggingRef = useRef(false)
  const x = useMotionValue(0)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    const gallery = galleryRef.current
    if (!gallery) return

    const resizeObserver = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width
      setSlideWidth(width)
      x.set(-activeRef.current * width)
    })

    resizeObserver.observe(gallery)
    return () => resizeObserver.disconnect()
  }, [x])

  useEffect(() => {
    if (lightboxIndex === null) return

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxIndex(null)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [lightboxIndex])

  const snapTo = (index: number, velocity = 0) => {
    const next = Math.max(0, Math.min(gallerySlides.length - 1, index))
    const width = slideWidth || galleryRef.current?.clientWidth || 0
    setActive(next)
    animate(x, -next * width, {
      type: 'spring',
      stiffness: 300,
      damping: 34,
      mass: 0.82,
      velocity,
    })
  }

  const showPrevious = () => snapTo(active - 1)
  const showNext = () => snapTo(active + 1)

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const projectedDistance = info.offset.x + info.velocity.x * 0.12
    const next = projectedDistance < -50
      ? active + 1
      : projectedDistance > 50
        ? active - 1
        : active
    snapTo(next, info.velocity.x)
    window.setTimeout(() => {
      draggingRef.current = false
    }, 0)
  }

  const lightboxSlide = lightboxIndex === null ? null : gallerySlides[lightboxIndex]

  return <>
  <section aria-labelledby="tour-gallery-title" className="min-w-0">
    <div
      ref={galleryRef}
      className="relative left-1/2 aspect-[4/5] w-screen -translate-x-1/2 touch-pan-y overflow-hidden bg-[#1d1712] text-white shadow-[0_30px_90px_-40px_rgba(36,29,23,0.7)] sm:aspect-[16/9] sm:min-h-[460px] lg:h-[min(72vh,760px)] lg:aspect-auto"
      aria-label={text.label}
      aria-roledescription="carousel"
    >
      <motion.div
        className="flex h-full cursor-grab active:cursor-grabbing"
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -(gallerySlides.length - 1) * slideWidth, right: 0 }}
        dragElastic={0.08}
        dragMomentum={false}
        onDragStart={() => {
          draggingRef.current = true
          x.stop()
        }}
        onDragEnd={handleDragEnd}
      >
        {gallerySlides.map((slide, index) => <button type="button" key={slide.title} tabIndex={index === active ? 0 : -1} aria-hidden={index !== active} aria-label={`${text.view} ${slide.title}`} onClick={() => {
          if (!draggingRef.current) setLightboxIndex(index)
        }} className="relative h-full w-full shrink-0 cursor-zoom-in text-left">
          <Image src={slide.image} alt={slide.title} fill draggable={false} loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'} sizes="(max-width: 639px) 100vw, (max-width: 1024px) 110vw, 100vw" className="select-none object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent via-45% to-black/70" />
          <div className="absolute inset-x-5 bottom-16 rounded-xl border border-[#f2dfb1]/35 bg-[rgba(12,9,7,0.68)] px-5 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.4)] backdrop-blur-md sm:inset-x-auto sm:bottom-9 sm:left-8 sm:max-w-[calc(100%-8rem)] sm:px-8 sm:py-6 lg:left-10"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] !text-[#f9d889] drop-shadow-[0_2px_5px_rgba(0,0,0,0.95)] sm:text-[11px] sm:tracking-[0.28em]">{slide.subtitle}</p><h2 className="mt-2 font-serif text-4xl leading-none !text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] sm:mt-2.5 sm:text-6xl">{slide.title}</h2></div>
        </button>)}
      </motion.div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/55 via-black/20 to-transparent sm:h-36" />
      <div className="pointer-events-none absolute inset-x-5 top-5 z-20 flex items-start justify-between gap-5 sm:inset-x-8 sm:top-8 lg:inset-x-10">
        <h2 id="tour-gallery-title" className="font-serif text-2xl leading-none !text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] sm:text-4xl">{text.title}</h2>
        <Link href="#tour-booking" data-conversion="tour_cta_click" data-conversion-label="Tour gallery" className="pointer-events-auto hidden min-h-11 shrink-0 items-center justify-center gap-3 rounded-lg bg-[#b98a3d] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] !text-white transition hover:bg-[#9d722e] sm:inline-flex">{text.book} <ArrowDown size={15} /></Link>
      </div>
      <button type="button" aria-label={text.previous} onClick={showPrevious} disabled={active === 0} className="absolute left-4 top-1/2 hidden rounded-full border border-white/30 bg-black/20 p-2 text-white backdrop-blur transition hover:bg-black/50 disabled:cursor-default disabled:opacity-35 sm:block"><ChevronLeft size={20} /></button>
      <button type="button" aria-label={text.next} onClick={showNext} disabled={active === gallerySlides.length - 1} className="absolute right-4 top-1/2 hidden rounded-full border border-white/30 bg-black/20 p-2 text-white backdrop-blur transition hover:bg-black/50 disabled:cursor-default disabled:opacity-35 sm:block"><ChevronRight size={20} /></button>
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2 sm:bottom-10 sm:left-auto sm:right-10 sm:translate-x-0">{gallerySlides.map((slide, index) => <button key={slide.title} type="button" aria-label={`${text.show} ${slide.title}`} aria-current={index === active} onClick={() => snapTo(index)} className={`h-2.5 rounded-full transition-all ${index === active ? 'w-8 bg-[#e3bb6a]' : 'w-2.5 bg-white/60 hover:bg-white'}`} />)}</div>
    </div>
    <Link href="#tour-booking" data-conversion="tour_cta_click" data-conversion-label="Tour gallery mobile" className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-[#b98a3d] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] !text-white transition hover:bg-[#9d722e] sm:hidden">{text.book} <ArrowDown size={15} /></Link>
  </section>
  {typeof document !== 'undefined' ? createPortal(<AnimatePresence>
    {lightboxSlide ? <motion.div role="dialog" aria-modal="true" aria-label={`${text.dialog}: ${lightboxSlide.title}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(0,0,0,0.95)] p-3 sm:p-8">
      <button type="button" aria-label={text.close} onClick={() => setLightboxIndex(null)} className="absolute inset-0 cursor-zoom-out" />
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }} className="pointer-events-none relative h-[min(88dvh,900px)] w-full max-w-7xl">
        <Image src={lightboxSlide.image} alt={lightboxSlide.title} fill priority sizes="100vw" className="object-contain" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-5 pb-4 pt-16 text-center sm:px-8 sm:pb-6">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#f9d889]">{lightboxSlide.subtitle}</p>
          <p className="mt-1 font-serif text-3xl text-white sm:text-4xl">{lightboxSlide.title}</p>
        </div>
      </motion.div>
      <button type="button" aria-label={text.close} onClick={() => setLightboxIndex(null)} className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white backdrop-blur transition hover:bg-white hover:text-black sm:right-7 sm:top-7"><X size={22} /></button>
    </motion.div> : null}
  </AnimatePresence>, document.body) : null}
  </>
}
