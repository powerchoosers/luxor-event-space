'use client'

import { Phone } from 'lucide-react'

export function TourPageActions({ locale = 'en' }: { locale?: 'en' | 'es' }) {
  const spanish = locale === 'es'

  return <>
    <span className="flex items-center gap-3"><Phone size={16} className="text-[#b98a3d]" />{spanish ? '¿Tienes preguntas? Llama o ' : 'Questions first? Call or '}<button type="button" onClick={() => window.dispatchEvent(new Event('luxor:open-elena'))} className="font-semibold underline underline-offset-4 hover:text-[#8d672b]">{spanish ? 'pregúntale a Elena.' : 'ask Elena.'}</button></span>
  </>
}
