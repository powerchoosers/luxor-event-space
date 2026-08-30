'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'

const slides = [
  { title: 'Main Hall', subtitle: 'Up to 180 Guests', image: '/images/dining-hall/main-hall-wedding-wide.png' },
  { title: 'VIP Room', subtitle: 'Private VIP Room', image: '/images/dining-hall/main-hall-conversation-candid.png' },
  { title: 'Lounge Room', subtitle: 'Lounge Room', image: '/images/luxor-lounge/luxor-lounge-empty.png' },
  { title: 'Kitchenette', subtitle: 'Kitchenette', image: '/images/dining-hall/main-hall-dinner-service-candid.png' },
]

export function TourGallery() {
  const [active, setActive] = useState(0)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 5000)
    return () => window.clearInterval(timer)
  }, [])

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    swipeStart.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return

    setActive((current) => deltaX < 0 ? (current + 1) % slides.length : (current - 1 + slides.length) % slides.length)
  }

  return <section aria-labelledby="tour-gallery-title" className="min-w-0">
    <div className="mb-5 flex items-end gap-5 sm:mb-7">
      <h2 id="tour-gallery-title" className="shrink-0 font-serif text-3xl leading-none text-[#241d17] sm:text-4xl">Your Tour at a Glance</h2>
      <span aria-hidden="true" className="mb-1 hidden h-px flex-1 bg-[#b98a3d]/35 sm:block" />
      <Link href="#tour-booking" data-conversion="tour_cta_click" data-conversion-label="Tour gallery" className="hidden min-h-11 shrink-0 items-center justify-center gap-3 rounded-lg bg-[#b98a3d] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] !text-white transition hover:bg-[#9d722e] sm:inline-flex">Book a Tour <ArrowDown size={15} /></Link>
    </div>
    <div
      className="relative left-1/2 aspect-[4/5] w-screen -translate-x-1/2 touch-pan-y overflow-hidden bg-[#1d1712] text-white shadow-[0_30px_90px_-40px_rgba(36,29,23,0.7)] sm:aspect-[16/9] sm:min-h-[460px] lg:h-[min(72vh,760px)] lg:aspect-auto"
      aria-label="Tour spaces. Swipe left or right to browse."
      aria-roledescription="carousel"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { swipeStart.current = null }}
    >
      {slides.map((slide, index) => <div key={slide.title} className={`absolute inset-0 transition-opacity duration-700 ${index === active ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={index !== active}>
        <Image src={slide.image} alt={slide.title} fill loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'} sizes="(max-width: 639px) 100vw, (max-width: 1024px) 110vw, 100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent via-45% to-black/70" />
        <div className="absolute inset-x-5 bottom-16 rounded-xl border border-[#f2dfb1]/35 bg-[rgba(12,9,7,0.68)] px-5 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.4)] backdrop-blur-md sm:inset-x-auto sm:bottom-9 sm:left-8 sm:max-w-[calc(100%-8rem)] sm:px-8 sm:py-6 lg:left-10"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] !text-[#f9d889] drop-shadow-[0_2px_5px_rgba(0,0,0,0.95)] sm:text-[11px] sm:tracking-[0.28em]">{slide.subtitle}</p><h2 className="mt-2 font-serif text-4xl leading-none !text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] sm:mt-2.5 sm:text-6xl">{slide.title}</h2></div>
      </div>)}
      <button type="button" aria-label="Previous tour space" onClick={() => setActive((active - 1 + slides.length) % slides.length)} className="absolute left-4 top-1/2 hidden rounded-full border border-white/30 bg-black/20 p-2 text-white backdrop-blur transition hover:bg-black/50 sm:block"><ChevronLeft size={20} /></button>
      <button type="button" aria-label="Next tour space" onClick={() => setActive((active + 1) % slides.length)} className="absolute right-4 top-1/2 hidden rounded-full border border-white/30 bg-black/20 p-2 text-white backdrop-blur transition hover:bg-black/50 sm:block"><ChevronRight size={20} /></button>
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2 sm:bottom-10 sm:left-auto sm:right-10 sm:translate-x-0">{slides.map((slide, index) => <button key={slide.title} type="button" aria-label={`Show ${slide.title}`} aria-current={index === active} onClick={() => setActive(index)} className={`h-2.5 rounded-full transition-all ${index === active ? 'w-8 bg-[#e3bb6a]' : 'w-2.5 bg-white/60 hover:bg-white'}`} />)}</div>
    </div>
    <Link href="#tour-booking" data-conversion="tour_cta_click" data-conversion-label="Tour gallery mobile" className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-[#b98a3d] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] !text-white transition hover:bg-[#9d722e] sm:hidden">Book a Tour <ArrowDown size={15} /></Link>
  </section>
}
