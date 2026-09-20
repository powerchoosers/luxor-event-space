'use client'

import { useEffect, useState } from 'react'
import { MapPin, MessageSquare, Phone } from 'lucide-react'

type Locale = 'en' | 'es'

const googleMapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=803+Castroville+Rd+%23402%2C+San+Antonio%2C+TX+78237'
const appleMapsUrl = 'http://maps.apple.com/?address=803%20Castroville%20Rd%20%23402%2C%20San%20Antonio%2C%20TX%2078237'

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : value
}

export function TourPageActions({ locale = 'en' }: { locale?: Locale }) {
  const spanish = locale === 'es'
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/public/phone-number', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async (res) => (res.ok ? ((await res.json()) as { phoneNumber?: string }) : {}))
      .then((data) => {
        if (active && data.phoneNumber) setPhoneNumber(data.phoneNumber)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const displayPhone = phoneNumber ? formatPhone(phoneNumber) : '(210) 906-8803'

  return (
    <div className="space-y-3.5">
      {/* Location Bar */}
      <div className="flex items-start gap-3 rounded-2xl border border-[#b98a3d]/25 bg-white/80 p-4 text-sm text-[#665a4e] shadow-xs backdrop-blur-xs">
        <MapPin size={18} className="mt-0.5 shrink-0 text-[#b98a3d]" />
        <div className="flex-1">
          <p className="font-medium text-[#241d17]">803 Castroville Rd #402, San Antonio, TX 78237</p>
          <div className="mt-1 flex items-center gap-3 text-xs">
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#8d672b] underline underline-offset-4 hover:text-[#5f441b]"
            >
              Google Maps
            </a>
            <span className="text-[#b98a3d]/40">•</span>
            <a
              href={appleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#8d672b] underline underline-offset-4 hover:text-[#5f441b]"
            >
              Apple Maps
            </a>
          </div>
        </div>
      </div>

      {/* Action Cards: Call Luxor & Ask Elena */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Call Luxor Card */}
        <a
          href={`tel:${phoneNumber || '+12109068803'}`}
          data-conversion="call_cta_click"
          data-conversion-label="Call Luxor"
          className="flex items-center gap-3.5 rounded-2xl border border-[#b98a3d]/25 bg-white p-4 text-left shadow-sm transition hover:border-[#b98a3d] hover:bg-[#faf7f2] hover:shadow"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#faf5ec] text-[#b98a3d]">
            <Phone size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-base font-semibold leading-snug text-[#241d17]">
              {spanish ? 'Llamar a Luxor' : 'Call Luxor'}
            </p>
            <p className="truncate text-xs text-[#76685a]">{displayPhone}</p>
          </div>
        </a>

        {/* Ask Elena Card */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('luxor:open-elena'))}
          className="flex items-center gap-3.5 rounded-2xl border border-[#b98a3d]/25 bg-white p-4 text-left shadow-sm transition hover:border-[#b98a3d] hover:bg-[#faf7f2] hover:shadow"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#faf5ec] text-[#b98a3d]">
            <MessageSquare size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-base font-semibold leading-snug text-[#241d17]">
              {spanish ? 'Pregunta a Elena' : 'Ask Elena'}
            </p>
            <p className="truncate text-xs text-[#76685a]">
              {spanish ? 'Respuestas rápidas' : 'Get quick answers'}
            </p>
          </div>
        </button>
      </div>
    </div>
  )
}
