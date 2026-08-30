'use client'

import { Phone } from 'lucide-react'

export function TourPageActions() {
  return <>
    <span className="flex items-center gap-3"><Phone size={16} className="text-[#b98a3d]" />Questions first? Call or <button type="button" onClick={() => window.dispatchEvent(new Event('luxor:open-elena'))} className="font-semibold underline underline-offset-4 hover:text-[#8d672b]">ask Elena.</button></span>
  </>
}
