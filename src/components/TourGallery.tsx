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

  return <section aria-label="Your Tour at a Glance" className="relative overflow-hidden rounded-2xl bg-[#1d1712] text-white shadow-[0_30px_90px_-40px_rgba(36,29,23,0.7)]">
    <div className="relative aspect-[16/9] min-h-[300px] sm:min-h-[420px]">
      {slides.map((slide, index) => <div key={slide.title} className={`absolute inset-0 transition-opacity duration-700 ${index === active ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={index !== active}>
        <Image src={slide.image} alt={slide.title} fill priority={index === 0} sizes="(max-width: 1024px) 100vw, 1200px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/15" />
        <div className="absolute bottom-0 left-0 p-6 sm:p-10"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#e3bb6a]">{slide.subtitle}</p><h2 className="mt-2 font-serif text-4xl sm:text-5xl">{slide.title}</h2></div>
      </div>)}
      <div className="absolute left-5 top-5 font-serif text-2xl sm:left-8 sm:top-8">Your Tour at a Glance</div>
      <button type="button" aria-label="Previous tour space" onClick={() => setActive((active - 1 + slides.length) % slides.length)} className="absolute left-4 top-1/2 rounded-full border border-white/30 bg-black/20 p-2 text-white backdrop-blur transition hover:bg-black/50"><ChevronLeft size={20} /></button>
      <button type="button" aria-label="Next tour space" onClick={() => setActive((active + 1) % slides.length)} className="absolute right-4 top-1/2 rounded-full border border-white/30 bg-black/20 p-2 text-white backdrop-blur transition hover:bg-black/50"><ChevronRight size={20} /></button>
      <div className="absolute bottom-6 right-6 flex gap-2 sm:bottom-10 sm:right-10">{slides.map((slide, index) => <button key={slide.title} type="button" aria-label={`Show ${slide.title}`} aria-current={index === active} onClick={() => setActive(index)} className={`h-2.5 rounded-full transition-all ${index === active ? 'w-8 bg-[#e3bb6a]' : 'w-2.5 bg-white/60 hover:bg-white'}`} />)}</div>
    </div>
  </section>
}
