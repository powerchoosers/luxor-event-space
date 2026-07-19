'use client'

import { Phone } from 'lucide-react'
import { useEffect, useState } from 'react'

export function PublicPhoneLink({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/public/phone-number', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async (response) => response.ok ? await response.json() as { phoneNumber?: string } : {})
      .then((data) => { if (active && data.phoneNumber) setPhoneNumber(data.phoneNumber) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  if (!phoneNumber) return null

  return <a href={`tel:${phoneNumber}`} className={className} aria-label={`Call Luxor Event Space at ${formatPhone(phoneNumber)}`}>
    <Phone className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4 shrink-0 text-[#caa24c]'} />
    <span>{compact ? 'Call Luxor' : formatPhone(phoneNumber)}</span>
  </a>
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : value
}
