'use client'

import { ArrowDown, Phone } from 'lucide-react'

export function TourPageActions() {
  return <>
    <button type="button" onClick={() => document.getElementById('tour-booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="mt-8 inline-flex items-center gap-3 rounded-lg bg-[#b98a3d] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-[#9d722e]">Book a Tour <ArrowDown size={15} /></button>
    <span className="flex items-center gap-3"><Phone size={16} className="text-[#b98a3d]" />Questions first? Call or <button type="button" onClick={() => window.dispatchEvent(new Event('luxor:open-elena'))} className="font-semibold underline underline-offset-4 hover:text-[#8d672b]">ask Elena.</button></span>
  </>
}
