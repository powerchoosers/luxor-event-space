'use client'

import { useEffect, useState } from 'react'
import { StaggerCards, StaggerCard } from '@/components/StaggerCards'

type Price = { day: string; label: string; minimum_price: number; minimum_hours: number }

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function LuxorCustomTimeStartingPrices() {
  const [prices, setPrices] = useState<Price[]>([])
  useEffect(() => {
    let active = true
    void fetch('/api/public/custom-time-prices', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { prices: [] })
      .then((payload: { prices?: Price[] }) => { if (active) setPrices(Array.isArray(payload.prices) ? payload.prices : []) })
      .catch(() => { if (active) setPrices([]) })
    return () => { active = false }
  }, [])

  if (!prices.length) return null
  return (
    <section aria-label="Custom Time starting prices" className="border-b border-[#caa24c]/18 bg-[#080706] px-5 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <p className="text-center font-mono text-[9px] font-bold uppercase tracking-[0.28em] text-[#caa24c]">Custom Time starting prices</p>
        <StaggerCards className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" stagger={0.07}>
          {prices.map((price) => (
            <StaggerCard key={price.day} className="h-full">
              <div className="h-full rounded-lg border border-[#caa24c]/20 bg-black/30 p-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#d7c29a]/75">{price.label}</p>
                <p className="mt-1 font-serif text-xl text-[#f1d27a]">From {money(price.minimum_price)}</p>
                <p className="mt-1 text-[10px] text-[#d7c29a]/60">first {price.minimum_hours} billed hours</p>
              </div>
            </StaggerCard>
          ))}
        </StaggerCards>
      </div>
    </section>
  )
}
