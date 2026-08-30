'use client'

import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'

const slides = [
  { title: 'Main Hall', subtitle: 'Up to 180 Guests', image: '/images/dining-hall/main-hall-wedding-wide.png' },
  { title: 'VIP Room', subtitle: 'Private VIP Room', image: '/images/dining-hall/main-hall-conversation-candid.png' },
  { title: 'Lounge Room', subtitle: 'Lounge Room', image: '/images/luxor-lounge/luxor-lounge-empty.png' },
  { title: 'Kitchenette', subtitle: 'Kitchenette', image: '/images/dining-hall/main-hall-dinner-service-candid.png' },
]

export function TourGallery() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 5000)
    return () => window.clearInterval(timer)
  }, [])

  return <section aria-labelledby="tour-gallery-title">
    <div className="mb-5 flex items-end gap-5 sm:mb-7">
      <h2 id="tour-gallery-title" className="shrink-0 font-serif text-3xl leading-none text-[#241d17] sm:text-4xl">Your Tour at a Glance</h2>
      <span aria-hidden="true" className="mb-1 hidden h-px flex-1 bg-[#b98a3d]/35 sm:block" />
    </div>
    <div className="relative aspect-[16/9] min-h-[300px] overflow-hidden rounded-2xl bg-[#1d1712] text-white shadow-[0_30px_90px_-40px_rgba(36,29,23,0.7)] sm:min-h-[420px]">
      {slides.map((slide, index) => <div key={slide.title} className={`absolute inset-0 transition-opacity duration-700 ${index === active ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={index !== active}>
        <Image src={slide.image} alt={slide.title} fill priority={index === 0} sizes="(max-width: 1024px) 100vw, 1200px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/15" />
        <div className="absolute bottom-5 left-5 max-w-[calc(100%-7rem)] rounded-xl border border-white/25 bg-[#16110d]/90 px-5 py-4 shadow-[0_12px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:bottom-8 sm:left-8 sm:px-7 sm:py-5"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] !text-[#f7d98b] drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">{slide.subtitle}</p><h2 className="mt-2 font-serif text-4xl !text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] sm:text-5xl">{slide.title}</h2></div>
      </div>)}
      <button type="button" aria-label="Previous tour space" onClick={() => setActive((active - 1 + slides.length) % slides.length)} className="absolute left-4 top-1/2 rounded-full border border-white/30 bg-black/20 p-2 text-white backdrop-blur transition hover:bg-black/50"><ChevronLeft size={20} /></button>
      <button type="button" aria-label="Next tour space" onClick={() => setActive((active + 1) % slides.length)} className="absolute right-4 top-1/2 rounded-full border border-white/30 bg-black/20 p-2 text-white backdrop-blur transition hover:bg-black/50"><ChevronRight size={20} /></button>
      <div className="absolute bottom-6 right-6 flex gap-2 sm:bottom-10 sm:right-10">{slides.map((slide, index) => <button key={slide.title} type="button" aria-label={`Show ${slide.title}`} aria-current={index === active} onClick={() => setActive(index)} className={`h-2.5 rounded-full transition-all ${index === active ? 'w-8 bg-[#e3bb6a]' : 'w-2.5 bg-white/60 hover:bg-white'}`} />)}</div>
    </div>
  </section>
}
